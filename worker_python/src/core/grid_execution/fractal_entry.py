"""Fraktal giriş modu: bölge ızgara yerine yalnızca fraktal seviyelerinde bekleyen emir koyar.

Her taraf (üst "U" / alt "D") için en yeni onaylanmış fraktal tek bir bekleyen emir alır:
- breakout (kırılım): üst fraktal → BUY STOP, alt fraktal → SELL STOP
- rebound (dönüş):    üst fraktal → SELL LIMIT, alt fraktal → BUY LIMIT
Yeni fraktal oluşunca emir taşınır (eskisi silinir, yenisi konur). Fiyat fraktal seviyesine
ulaştıysa fraktal "tüketilmiştir", emir konmaz.

Elle müdahale korunur: fraktal emri bot silmeden kaybolursa (doldu, MT5'te elle silindi, süresi
doldu) o fraktal "işlenmiş" sayılır ve data/fractal_state_<hesap>.json'a yazılır; aynı fraktala
bir daha emir konmaz, ancak aynı taraftaki daha yeni bir fraktal yeniden emir açar.
"""
import datetime
import json
import os
from dataclasses import dataclass
from typing import Callable

from src.core.grid_helpers import (
    get_mt5_timeframe,
    log_message as default_log_message,
    normalize_price,
    normalize_volume,
)
from src.core.grid_orders import (
    cancel_order,
    fractal_comment,
    modify_pending_order,
    modify_position_tp_sl,
    parse_fractal_comment,
    send_pending_order_helper,
)
from src.core.state import state
from src.utils.paths import get_fractal_state_path

from .config import ZoneConfig, money_to_price_distance
from .fractal_signals import Fractal, atr, find_fractals, parabolic_sar

# Fraktal + ATR/SAR için okunan kapanmış mum sayısı
RATES_COUNT = 300

SIDE_NAMES = {"U": "üst", "D": "alt"}


@dataclass(slots=True)
class DesiredOrder:
    side: str  # "U" / "D"
    fractal: Fractal
    direction: str  # BUY / SELL
    order_type: int
    price: float
    sl: float
    tp: float
    lot: float
    price_ok: bool  # False: fiyat girişe stops_level'den yakın → yeni emir konmaz
    stops_ok: bool  # False: SL/TP girişe stops_level'den yakın (MT5 reddeder / enforce_stops_level kaydırır)
    done_key: str

    @property
    def placeable(self) -> bool:
        return self.price_ok and self.stops_ok


def _log_once(key: tuple, value, msg: str, level: str, log_message) -> None:
    if state.fractal_logged.get(key) != value:
        state.fractal_logged[key] = value
        log_message(msg, level)


def _fmt_time(t: int) -> str:
    return datetime.datetime.fromtimestamp(int(t), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")


# --------------------------------------------------------------------------- kalıcı "işlenmiş" kaydı
def _state_file() -> str:
    return get_fractal_state_path(os.environ.get("ACTIVE_ACCOUNT_ID", "default"))


def _load_done() -> None:
    if state.fractal_done_loaded:
        return
    state.fractal_done_loaded = True
    try:
        with open(_state_file(), "r", encoding="utf-8") as f:
            data = json.load(f)
        state.fractal_done.update({str(k): int(v) for k, v in (data.get("done") or {}).items()})
    except (OSError, ValueError, AttributeError, TypeError):
        pass


def _save_done() -> None:
    path = _state_file()
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"done": state.fractal_done}, f)
        os.replace(tmp, path)
    except OSError:
        pass


def _done_key(zone_key: str, config: ZoneConfig, side: str) -> str:
    # Sembol ve zaman dilimi de anahtarda: H4'te işlenen fraktal, M15'e geçince yeni fraktalları engellemesin
    return f"{zone_key}:{config.symbol}:{config.fractal_timeframe}:{side}"


def _mark_done(key: str, bar_time: int) -> bool:
    if state.fractal_done.get(key, 0) >= bar_time:
        return False
    state.fractal_done[key] = int(bar_time)
    return True


def _update_done(zone_idx, zone_key, config, zone_orders, zone_positions, log_message) -> None:
    """Kaybolan fraktal emirlerini ve fraktal pozisyonlarını "işlenmiş" olarak işaretler."""
    tracked = state.fractal_tracked.setdefault(zone_idx, {})
    live = {o.ticket for o in zone_orders}
    position_ids = {getattr(p, "identifier", 0) or p.ticket for p in zone_positions}
    changed = False

    for ticket, (key, side, bar_time) in list(tracked.items()):
        if ticket in live:
            continue
        del tracked[ticket]
        if ticket in state.fractal_own_cancels:
            state.fractal_own_cancels.discard(ticket)
            continue
        if _mark_done(key, bar_time):
            changed = True
            how = "doldu" if ticket in position_ids else "elle silindi / süresi doldu"
            log_message(
                f"📌 Fraktal: Bölge {zone_idx+1} | {SIDE_NAMES[side]} fraktal ({_fmt_time(bar_time)}) emri "
                f"{how} (Bilet {ticket}). Bu fraktala yeni emir konmayacak."
            )

    for p in zone_positions:
        parsed = parse_fractal_comment(getattr(p, "comment", ""))
        if parsed and _mark_done(_done_key(zone_key, config, parsed[0]), parsed[1]):
            changed = True

    if changed:
        _save_done()

    # Artık hiçbir bölgenin izlemediği biletler (bot kaydı) birikmesin
    still_tracked = set().union(*(set(t) for t in state.fractal_tracked.values()))
    state.fractal_own_cancels &= still_tracked


# --------------------------------------------------------------------------- hedef emirler
def _sl_for(config: ZoneConfig, direction: str, f: Fractal, ups, downs, atr_vals, sar_vals):
    """Seçilen moda göre SL fiyatı (normalize edilmemiş) veya hesaplanamıyorsa None."""
    buf = config.fractal_sl_buffer
    mode = config.fractal_sl_mode
    if mode == "atr":
        a = atr_vals[f.index] if 0 <= f.index < len(atr_vals) else None
        if a is None:
            return None
        k = config.fractal_atr_multiplier * a
        return f.low - k if direction == "BUY" else f.high + k
    if mode == "opposite_fractal":
        # BUY → son alt fraktalın altı, SELL → son üst fraktalın üstü
        refs = downs if direction == "BUY" else ups
        if not refs:
            return None
        return refs[-1].price - buf if direction == "BUY" else refs[-1].price + buf
    if mode == "sar":
        return sar_vals[-1] if sar_vals else None
    return f.low - buf if direction == "BUY" else f.high + buf


def _build_desired(
    mt5, config, zone_idx, zone_key, side, f, closed, forming, ups, downs, atr_vals, sar_vals,
    tick, symbol_infos, log_message,
):
    breakout = config.fractal_order_mode == "breakout"
    if side == "U":
        direction = "BUY" if breakout else "SELL"
    else:
        direction = "SELL" if breakout else "BUY"
    if config.order_type not in (direction, "BOTH"):
        return None

    log_key = (zone_idx, side)
    tf = config.fractal_timeframe
    label = f"Bölge {zone_idx+1} | {tf} {SIDE_NAMES[side]} fraktal {f.price} ({_fmt_time(f.time)})"

    done_key = _done_key(zone_key, config, side)
    if f.time <= state.fractal_done.get(done_key, 0):
        return None
    if not (config.min_price <= f.price <= config.max_price):
        _log_once(log_key, ("range", f.time), f"ℹ️ Fraktal: {label} bölge aralığı dışında, emir yok.", "INFO", log_message)
        return None

    later = list(closed[f.index + 1 :]) + [forming]
    if side == "U":
        consumed = any(float(b["high"]) >= f.price for b in later) or float(tick.bid) >= f.price
    else:
        consumed = any(float(b["low"]) <= f.price for b in later) or float(tick.ask) <= f.price
    if consumed:
        _log_once(log_key, ("consumed", f.time), f"ℹ️ Fraktal: {label} fiyatça geçildi, emir yok.", "INFO", log_message)
        return None

    info = symbol_infos.get(config.symbol)
    point = float(getattr(info, "point", 0) or 0) if info is not None else 0.0
    stops = float(getattr(info, "trade_stops_level", 0) or 0) * point if info is not None else 0.0
    min_dist = max(point, 1e-9)

    entry = normalize_price(f.price, config.symbol, symbol_infos)
    sl = _sl_for(config, direction, f, ups, downs, atr_vals, sar_vals)

    def valid(value):
        if value is None:
            return False
        return entry - value >= min_dist if direction == "BUY" else value - entry >= min_dist

    if not valid(sl):
        fallback = f.low - config.fractal_sl_buffer if direction == "BUY" else f.high + config.fractal_sl_buffer
        _log_once(
            (zone_idx, side, "sl"), f.time,
            f"⚠️ Fraktal: {label} için SL ({config.fractal_sl_mode}) hesaplanamadı veya yanlış tarafta; "
            f"fraktal mumu + tampon kullanılıyor.",
            "WARN", log_message,
        )
        sl = fallback
    sl = normalize_price(sl, config.symbol, symbol_infos)
    if not valid(sl):
        _log_once(
            (zone_idx, side, "sl"), ("invalid", f.time),
            f"⚠️ Fraktal: {label} için geçerli SL yok (tampon 0?). Emir konmuyor.", "WARN", log_message,
        )
        return None

    risk = abs(entry - sl)
    if direction == "BUY":
        order_type = mt5.ORDER_TYPE_BUY_STOP if breakout else mt5.ORDER_TYPE_BUY_LIMIT
        gap = entry - float(tick.ask) if breakout else float(tick.ask) - entry
        lot = config.lot_size
    else:
        order_type = mt5.ORDER_TYPE_SELL_STOP if breakout else mt5.ORDER_TYPE_SELL_LIMIT
        gap = float(tick.bid) - entry if breakout else entry - float(tick.bid)
        lot = config.sell_lot_size

    tp_dist = 0.0
    if config.fractal_tp_by_money:
        if config.fractal_tp_money > 0:
            tp_dist = money_to_price_distance(config.fractal_tp_money, lot, config.symbol, symbol_infos) or 0.0
            if tp_dist == 0.0:
                _log_once(
                    (zone_idx, side, "tpmoney"), f.time,
                    f"⚠️ Fraktal: {label} için tutar → fiyat mesafesi hesaplanamadı (tick değeri yok); TP konmuyor.",
                    "WARN", log_message,
                )
    elif config.fractal_rr > 0:
        tp_dist = config.fractal_rr * risk
    tp = 0.0
    if tp_dist > 0:
        tp = entry + tp_dist if direction == "BUY" else entry - tp_dist
        tp = normalize_price(tp, config.symbol, symbol_infos)

    # Fiyat seviyeye stops_level'den yakınsa MT5 reddeder (3 ret bölgeyi durdurur) → bekle
    price_ok = gap > stops and gap > 0
    eps = min_dist / 10
    stops_ok = risk >= stops - eps and (tp == 0.0 or abs(tp - entry) >= stops - eps)
    if not price_ok:
        _log_once(log_key, ("near", f.time), f"⏸️ Fraktal: {label} fiyata çok yakın, emir bekliyor.", "INFO", log_message)
    elif not stops_ok:
        _log_once(
            log_key, ("stops", f.time),
            f"⚠️ Fraktal: {label} için SL/TP girişe broker'ın asgari mesafesinden ({stops}) yakın; emir konmuyor.",
            "WARN", log_message,
        )

    return DesiredOrder(
        side, f, direction, order_type, entry, sl, tp,
        normalize_volume(lot, config.symbol, symbol_infos), price_ok, stops_ok, done_key,
    )


def _same_entry(order, d: DesiredOrder, tol: float) -> bool:
    """Aynı fraktal emri: tür, giriş fiyatı ve hacim aynı (SL/TP farklı olabilir)."""
    return (
        order.type == d.order_type
        and abs(float(order.price_open) - d.price) <= tol
        and abs(float(getattr(order, "volume_current", d.lot)) - d.lot) <= 1e-8
    )


def _same_stops(order, d: DesiredOrder, tol: float) -> bool:
    return abs(float(order.sl or 0.0) - d.sl) <= tol and abs(float(order.tp or 0.0) - d.tp) <= tol


# --------------------------------------------------------------------------- ana giriş
def manage_fractal_orders(
    mt5,
    config: ZoneConfig,
    zone_idx: int,
    zone_key: str,
    robot_positions: list,
    robot_orders: list,
    symbol_infos: dict,
    consecutive_errors: dict,
    active_zones_state: dict,
    log_message: Callable[[str, str], None] = default_log_message,
    allow_new_orders: bool = True,
) -> bool:
    """allow_new_orders=False: bölge maksimum pozisyonda (handler) → bekleyen fraktal emirleri silinir,
    yeni emir konmaz; "işlenmiş" takibi ve SAR takibi yine çalışır."""
    symbol = config.symbol
    zone_orders = [o for o in robot_orders if o.magic == config.target_magic]
    zone_positions = [p for p in robot_positions if p.magic == config.target_magic]

    _load_done()
    _update_done(zone_idx, zone_key, config, zone_orders, zone_positions, log_message)

    tf = get_mt5_timeframe(mt5, config.fractal_timeframe)
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, RATES_COUNT + 1)
    tick = mt5.symbol_info_tick(symbol)
    if rates is None or len(rates) < 6 or tick is None:
        _log_once(
            (zone_idx, "rates"), "missing",
            f"⚠️ Fraktal: Bölge {zone_idx+1} için {symbol} {config.fractal_timeframe} mumları okunamadı.",
            "WARN", log_message,
        )
        return False
    state.fractal_logged.pop((zone_idx, "rates"), None)

    closed, forming = rates[:-1], rates[-1]
    ups, downs = find_fractals(closed)
    atr_vals = atr(closed, config.fractal_atr_period)
    sar_vals, sar_long = parabolic_sar(closed, config.fractal_sar_step, config.fractal_sar_max)

    desired: list[DesiredOrder] = []
    for side, items in (("U", ups), ("D", downs)):
        if not items or not allow_new_orders:
            continue
        d = _build_desired(
            mt5, config, zone_idx, zone_key, side, items[-1], closed, forming, ups, downs,
            atr_vals, sar_vals, tick, symbol_infos, log_message,
        )
        if d is not None:
            desired.append(d)

    info = symbol_infos.get(symbol)
    point = float(getattr(info, "point", 0) or 0) if info is not None else 0.0
    tol = point / 2 if point > 0 else 1e-9
    tracked = state.fractal_tracked.setdefault(zone_idx, {})

    matched: set[int] = set()
    for order in zone_orders:
        hit = next((i for i, d in enumerate(desired) if i not in matched and _same_entry(order, d, tol)), None)
        if hit is not None:
            d = desired[hit]
            matched.add(hit)
            tracked[order.ticket] = (d.done_key, d.side, d.fractal.time)
            # Aynı fraktal, yalnızca SL/TP değişti (SAR/karşı fraktal yeni mumda): sil-koy yerine değiştir.
            # Yeni SL/TP geçersizse mevcut emir olduğu gibi kalır.
            if not _same_stops(order, d, tol) and d.stops_ok:
                if modify_pending_order(mt5, order, d.sl, d.tp, symbol_infos):
                    log_message(
                        f"✏️ Fraktal: Bölge {zone_idx+1} | Bilet {order.ticket} SL {order.sl} → {d.sl}"
                        f"{f' / TP {order.tp} → {d.tp}' if d.tp or order.tp else ''}"
                    )
            continue
        if cancel_order(mt5, order):
            reason = "maksimum pozisyon" if not allow_new_orders else "güncel fraktalla eşleşmiyor"
            log_message(f"🔁 Fraktal: Bölge {zone_idx+1} | Bilet {order.ticket} ({order.price_open}) siliniyor ({reason}).")

    for i, d in enumerate(desired):
        if i in matched or not d.placeable:
            continue
        comment = fractal_comment(zone_idx, d.side, d.fractal.time)
        ok = send_pending_order_helper(
            mt5, d.price, d.lot, d.tp, d.sl, zone_idx, d.direction, symbol, symbol_infos,
            consecutive_errors, active_zones_state, comment=comment,
        )
        if ok:
            # Hemen izlemeye al: bir sonraki turdan önce elle silinirse de fark edilsin
            for o in mt5.orders_get(symbol=symbol) or ():
                if o.magic == config.target_magic and getattr(o, "comment", "") == comment:
                    tracked[o.ticket] = (d.done_key, d.side, d.fractal.time)
            kind = "STOP" if config.fractal_order_mode == "breakout" else "LIMIT"
            log_message(
                f"📐 Fraktal Emri: Bölge {zone_idx+1} | {d.direction} {kind} {d.price} "
                f"({config.fractal_timeframe} {SIDE_NAMES[d.side]} fraktal {_fmt_time(d.fractal.time)}) "
                f"SL {d.sl}{f' TP {d.tp}' if d.tp else ''}"
            )

    if config.fractal_sl_mode == "sar":
        _trail_sar(mt5, config, zone_idx, zone_positions, sar_vals[-1], sar_long[-1], tick, symbol_infos, log_message)

    return True


def _trail_sar(mt5, config, zone_idx, positions, sar, sar_is_long, tick, symbol_infos, log_message) -> None:
    """SAR modunda açık pozisyonların SL'i yeni SAR'a çekilir — yalnızca kâr yönünde. Bölgenin
    tüm pozisyonları (magic) takip edilir; ızgaradan fraktala geçmeden önce açılanlar da dahil.
    Yorum filtrelenmez: bazı brokerler pozisyon yorumunu değiştirir."""
    if sar is None:
        return
    info = symbol_infos.get(config.symbol)
    point = float(getattr(info, "point", 0) or 0) if info is not None else 0.0
    stops = float(getattr(info, "trade_stops_level", 0) or 0) * point if info is not None else 0.0
    tol = point / 2 if point > 0 else 1e-9
    new_sl = normalize_price(sar, config.symbol, symbol_infos)
    for p in positions:
        cur = float(p.sl or 0.0)
        if p.type == mt5.POSITION_TYPE_BUY:
            better = sar_is_long and (cur == 0 or new_sl > cur + tol) and float(tick.bid) - new_sl > stops
        else:
            better = (not sar_is_long) and (cur == 0 or new_sl < cur - tol) and new_sl - float(tick.ask) > stops
        if better and modify_position_tp_sl(mt5, p, p.tp, new_sl, symbol_infos):
            log_message(f"🪜 SAR Takip: Bölge {zone_idx+1} | Bilet {p.ticket} SL {cur} → {new_sl}")
