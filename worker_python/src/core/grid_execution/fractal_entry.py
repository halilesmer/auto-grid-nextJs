"""Fraktal giriş modu: bölge ızgara yerine yalnızca fraktal seviyelerinde bekleyen emir koyar.

Her taraf (üst "U" / alt "D") için en yeni N onaylanmış fraktal birer bekleyen emir alır
(N = yön başına fractal_order_count / sell_fractal_order_count, varsayılan 1):
- breakout (kırılım): üst fraktal → BUY STOP, alt fraktal → SELL STOP
- rebound (dönüş):    üst fraktal → SELL LIMIT, alt fraktal → BUY LIMIT
Yeni fraktal oluşunca pencere kayar (en eski fraktalın emri silinir, yenisi konur). Fiyat fraktal
seviyesine ulaştıysa fraktal "tüketilmiştir", yeni emir konmaz; yeri boş kalır, daha eski fraktalla
doldurulmaz. O fraktalın zaten bekleyen emri ise silinmez: dolup dolmayacağına MT5 karar verir. Mumlar
Bid'dir, BUY LIMIT ise Ask'ta dolar; Bid alt fraktala değip Ask değmeyince emir dolmamış olur ve
silinseydi, fiyat her yaklaştığında emir kaybolurdu.

Kaldırılan ek kurguların (eski ENG-28) emirleri buraya gelmez: orkestratör onları ayırır,
silinip silinmeyeceğine kullanıcı karar verir (src/core/legacy_setup_orders.py, ENG-29).

Elle müdahale korunur: fraktal emri bot silmeden kaybolursa (doldu, MT5'te elle silindi, süresi
doldu) o fraktal "işlenmiş" sayılır ve data/fractal_state_<hesap>.json'a yazılır; aynı fraktala
bir daha emir konmaz, diğer fraktalların emirleri etkilenmez.
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

from .config import FRACTAL_MAX_ORDERS, ZoneConfig, money_to_price_distance
from .fractal_signals import Fractal, atr, find_fractals, parabolic_sar

# Fraktal + ATR/SAR için okunan kapanmış mum sayısı
RATES_COUNT = 300
# Zaman dilimi süresi (sn): oluşan mum son tikten bu kadar eskiyse geçmiş henüz senkronize değil
_TF_SECONDS = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800, "H1": 3600, "H4": 14400, "D1": 86400}

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
    consumed: bool = False  # True: fiyat fraktala ulaştı → yeni emir yok, mevcut emir kalır

    @property
    def placeable(self) -> bool:
        return not self.consumed and self.price_ok and self.stops_ok


@dataclass(slots=True)
class _Market:
    """Bölgenin zaman diliminde bu turdaki mumlar ve göstergeler."""
    closed: object
    forming: object
    ups: list
    downs: list
    atr_vals: list
    sar_vals: list
    sar_long: list


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
        for k, v in (data.get("done") or {}).items():
            # Eski biçim: anahtar başına tek zaman (int)
            state.fractal_done[str(k)] = {int(t) for t in (v if isinstance(v, list) else [v])}
    except (OSError, ValueError, AttributeError, TypeError):
        pass


def _save_done() -> None:
    path = _state_file()
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"done": {k: sorted(v) for k, v in state.fractal_done.items()}}, f)
        os.replace(tmp, path)
    except OSError:
        pass


def _done_key(zone_key: str, config: ZoneConfig, side: str) -> str:
    # Sembol ve zaman dilimi de anahtarda: H4'te işlenen fraktal, M15'e geçince yeni fraktalları engellemesin
    return f"{zone_key}:{config.symbol}:{config.fractal_timeframe}:{side}"


def _mark_done(key: str, bar_time: int) -> bool:
    times = state.fractal_done.setdefault(key, set())
    if int(bar_time) in times:
        return False
    times.add(int(bar_time))
    # Yalnızca en yeni FRACTAL_MAX_ORDERS fraktal aday olabilir; daha eski kayıtlar gereksiz
    if len(times) > FRACTAL_MAX_ORDERS:
        state.fractal_done[key] = set(sorted(times)[-FRACTAL_MAX_ORDERS:])
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
        # Kaldırılan ek kurgunun (numara ≥ 2) pozisyonu bu bölgenin fraktalını işlemiş saymaz
        if parsed and parsed[0] == 1 and _mark_done(_done_key(zone_key, config, parsed[1]), parsed[2]):
            changed = True

    if changed:
        _save_done()

    # Artık hiçbir bölgenin izlemediği biletler (bot kaydı) birikmesin
    still_tracked = set().union(*(set(t) for t in state.fractal_tracked.values()))
    state.fractal_own_cancels &= still_tracked


# --------------------------------------------------------------------------- hedef emirler
def _direction_of(config: ZoneConfig, side: str) -> str:
    breakout = config.fractal_order_mode == "breakout"
    if side == "U":
        return "BUY" if breakout else "SELL"
    return "SELL" if breakout else "BUY"


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


def _build_desired(mt5, config, zone_idx, zone_key, side, f, m: _Market, tick, symbol_infos, log_message):
    breakout = config.fractal_order_mode == "breakout"
    direction = _direction_of(config, side)

    log_key = _log_key(zone_idx, side, f)
    label = _label(config, zone_idx, side, f)

    done_key = _done_key(zone_key, config, side)
    if f.time in state.fractal_done.get(done_key, ()):
        return None
    if not (config.min_price <= f.price <= config.max_price):
        _log_once(log_key, "range", f"ℹ️ Fraktal: {label} bölge aralığı dışında, emir yok.", "INFO", log_message)
        return None

    later = list(m.closed[f.index + 1 :]) + [m.forming]
    if side == "U":
        consumed = any(float(b["high"]) >= f.price for b in later) or float(tick.bid) >= f.price
    else:
        consumed = any(float(b["low"]) <= f.price for b in later) or float(tick.ask) <= f.price

    if direction == "BUY":
        order_type = mt5.ORDER_TYPE_BUY_STOP if breakout else mt5.ORDER_TYPE_BUY_LIMIT
        lot = config.lot_size
    else:
        order_type = mt5.ORDER_TYPE_SELL_STOP if breakout else mt5.ORDER_TYPE_SELL_LIMIT
        lot = config.sell_lot_size
    entry = normalize_price(f.price, config.symbol, symbol_infos)
    volume = normalize_volume(lot, config.symbol, symbol_infos)
    if consumed:
        # Yalnızca mevcut emri eşleştirmek için (silinmesin): yeni emir yok, SL/TP'ye dokunulmaz
        # (stops_ok=False → MODIFY yok; fiyatın dibinde freeze_level'e takılırdı), SL uyarısı da yok.
        # "Geçildi" logu _manage_orders'ta: mevcut emir olup olmadığı orada belli.
        return DesiredOrder(side, f, direction, order_type, entry, 0.0, 0.0, volume, False, False, done_key, True)

    info = symbol_infos.get(config.symbol)
    point = float(getattr(info, "point", 0) or 0) if info is not None else 0.0
    stops = float(getattr(info, "trade_stops_level", 0) or 0) * point if info is not None else 0.0
    min_dist = max(point, 1e-9)

    use_sl = config.fractal_use_sl
    sl = _sl_for(config, direction, f, m.ups, m.downs, m.atr_vals, m.sar_vals) if use_sl else 0.0

    def valid(value):
        if value is None:
            return False
        return entry - value >= min_dist if direction == "BUY" else value - entry >= min_dist

    if use_sl and not valid(sl):
        fallback = f.low - config.fractal_sl_buffer if direction == "BUY" else f.high + config.fractal_sl_buffer
        _log_once(
            (zone_idx, side, "sl", f.time), "fallback",
            f"⚠️ Fraktal: {label} için SL ({config.fractal_sl_mode}) hesaplanamadı veya yanlış tarafta; "
            f"fraktal mumu + tampon kullanılıyor.",
            "WARN", log_message,
        )
        sl = fallback
    sl = normalize_price(sl, config.symbol, symbol_infos) if use_sl else 0.0
    if use_sl and not valid(sl):
        _log_once(
            (zone_idx, side, "sl_invalid", f.time), "invalid",
            f"⚠️ Fraktal: {label} için geçerli SL yok (tampon 0?). Emir konmuyor.", "WARN", log_message,
        )
        return None

    risk = abs(entry - sl) if use_sl else 0.0
    if direction == "BUY":
        gap = entry - float(tick.ask) if breakout else float(tick.ask) - entry
    else:
        gap = float(tick.bid) - entry if breakout else entry - float(tick.bid)

    tp_dist = 0.0
    if config.fractal_tp_by_money:
        if config.fractal_tp_money > 0:
            tp_dist = money_to_price_distance(config.fractal_tp_money, lot, config.symbol, symbol_infos) or 0.0
            if tp_dist == 0.0:
                _log_once(
                    (zone_idx, side, "tpmoney", f.time), "missing",
                    f"⚠️ Fraktal: {label} için tutar → fiyat mesafesi hesaplanamadı (tick değeri yok); TP konmuyor.",
                    "WARN", log_message,
                )
    elif use_sl and config.fractal_rr > 0:  # Chance/Risiko braucht einen SL
        tp_dist = config.fractal_rr * risk
    tp = 0.0
    if tp_dist > 0:
        tp = entry + tp_dist if direction == "BUY" else entry - tp_dist
        tp = normalize_price(tp, config.symbol, symbol_infos)

    # Fiyat seviyeye stops_level'den yakınsa MT5 reddeder (3 ret bölgeyi durdurur) → bekle
    price_ok = gap > stops and gap > 0
    eps = min_dist / 10
    stops_ok = (not use_sl or risk >= stops - eps) and (tp == 0.0 or abs(tp - entry) >= stops - eps)
    if not price_ok:
        _log_once(log_key, "near", f"⏸️ Fraktal: {label} fiyata çok yakın, emir bekliyor.", "INFO", log_message)
    elif not stops_ok:
        _log_once(
            log_key, "stops",
            f"⚠️ Fraktal: {label} için SL/TP girişe broker'ın asgari mesafesinden ({stops}) yakın; emir konmuyor.",
            "WARN", log_message,
        )

    return DesiredOrder(
        side, f, direction, order_type, entry, sl, tp, volume, price_ok, stops_ok, done_key,
    )


def _log_key(zone_idx: int, side: str, f: Fractal) -> tuple:
    # Fraktal zamanı anahtarda: taraf başına birden çok fraktal aynı turda değerlendirilir
    return (zone_idx, side, f.time)


def _label(config: ZoneConfig, zone_idx: int, side: str, f: Fractal) -> str:
    return (
        f"Bölge {zone_idx+1} | {config.fractal_timeframe} {SIDE_NAMES[side]} fraktal {f.price} "
        f"({_fmt_time(f.time)})"
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


def _rates_stale(rates, timeframe: str, tick) -> bool:
    """MT5 bir sembolün geçmişini ilk istekte yerel önbellekten döndürür; sunucuyla senkronize
    olana kadar mumlar günler/haftalar eski olabilir ve eski bir fraktala emir konur. Son tik,
    oluşan mumun içinde olmalı: tik bu mumun 2 dönem sonrasındaysa veri bayattır."""
    tick_time = int(getattr(tick, "time", 0) or 0)
    if not tick_time:
        return False
    return tick_time - int(rates[-1]["time"]) > 2 * _TF_SECONDS.get(timeframe, 900)


def _read_market(mt5, config: ZoneConfig, timeframe: str, zone_idx: int, log_message, tick=None):
    rates = mt5.copy_rates_from_pos(config.symbol, get_mt5_timeframe(mt5, timeframe), 0, RATES_COUNT + 1)
    if rates is not None and len(rates) >= 6 and tick is not None and _rates_stale(rates, timeframe, tick):
        _log_once(
            (zone_idx, "rates", timeframe), "stale",
            f"⏳ Fraktal: Bölge {zone_idx+1} için {config.symbol} {timeframe} mumları henüz güncel değil "
            f"(MT5 geçmişi yükleniyor), bekleniyor.",
            "INFO", log_message,
        )
        return None
    if rates is None or len(rates) < 6:
        _log_once(
            (zone_idx, "rates", timeframe), "missing",
            f"⚠️ Fraktal: Bölge {zone_idx+1} için {config.symbol} {timeframe} mumları okunamadı.",
            "WARN", log_message,
        )
        return None
    state.fractal_logged.pop((zone_idx, "rates", timeframe), None)
    closed, forming = rates[:-1], rates[-1]
    ups, downs = find_fractals(closed)
    sar_vals, sar_long = parabolic_sar(closed, config.fractal_sar_step, config.fractal_sar_max)
    return _Market(closed, forming, ups, downs, atr(closed, config.fractal_atr_period), sar_vals, sar_long)


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
    """Bölgenin fraktal emirlerini yönetir. Bölge pozisyon sınırındaysa (veya allow_new_orders=False)
    bekleyen emirleri silinir, yeni emir konmaz; "işlenmiş" takibi ve SAR takibi yine çalışır."""
    symbol = config.symbol
    zone_orders = [o for o in robot_orders if o.magic == config.target_magic]
    zone_positions = [p for p in robot_positions if p.magic == config.target_magic]

    _load_done()
    _update_done(zone_idx, zone_key, config, zone_orders, zone_positions, log_message)

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        _log_once(
            (zone_idx, "rates", config.fractal_timeframe), "missing",
            f"⚠️ Fraktal: Bölge {zone_idx+1} için {symbol} {config.fractal_timeframe} mumları okunamadı.",
            "WARN", log_message,
        )
        return False

    m = _read_market(mt5, config, config.fractal_timeframe, zone_idx, log_message, tick)
    if m is None:
        return False  # mumlar yok: emirlere dokunulmaz

    allow = allow_new_orders and not _at_limit(zone_idx, config, len(zone_positions), log_message)
    candidates = _manage_orders(
        mt5, config, zone_idx, zone_key, m, tick, zone_orders, zone_positions, symbol_infos,
        consecutive_errors, active_zones_state, log_message, allow,
    )
    if config.fractal_use_sl and config.fractal_sl_mode == "sar":
        _trail_sar(mt5, config, zone_idx, zone_positions, m.sar_vals[-1], m.sar_long[-1], tick, symbol_infos,
                   log_message)

    # Pencereden çıkan fraktalların "bir kez yaz" kayıtları birikmesin. Pozisyon sınırında adaylar
    # hesaplanmaz; kayıtları kalsın ki sınır kalkınca aynı loglar tekrar yazılmasın.
    if allow:
        stale = [
            k for k in state.fractal_logged
            if k[0] == zone_idx and len(k) >= 3 and k[1] in SIDE_NAMES
            and type(k[-1]) is int and k[-1] not in candidates
        ]
        for key in stale:
            del state.fractal_logged[key]

    return True


def _at_limit(zone_idx: int, config: ZoneConfig, open_positions: int, log_message) -> bool:
    """Bölge pozisyon sınırında mı; uyarı yalnızca sınıra ulaşınca / sayı değişince yazılır."""
    key = (zone_idx, "limit")
    if open_positions < config.max_positions:
        state.fractal_logged.pop(key, None)
        return False
    _log_once(
        key, open_positions,
        f"⚠️ DİKKAT: Bölge {zone_idx+1} Maksimum pozisyon sınırına ulaştı "
        f"({open_positions}/{config.max_positions}). Yeni emir konmuyor.",
        "WARN", log_message,
    )
    return True


def _loss_gate_open(mt5, config, zone_idx, direction, zone_positions, tick, log_message) -> bool:
    """Sonraki fraktal emri serbest mi: yöndeki en son açılan pozisyon en az `fractal_next_loss`
    zararda olmalı (money: kâr ≤ −X · pips: fiyat girişe karşı ≥ X). 0 veya pozisyon yoksa serbest."""
    limit = config.fractal_next_loss
    key = (zone_idx, "next_loss", direction)
    pos_type = mt5.POSITION_TYPE_BUY if direction == "BUY" else mt5.POSITION_TYPE_SELL
    same_dir = [p for p in zone_positions if p.type == pos_type]
    if limit <= 0 or not same_dir:
        state.fractal_logged.pop(key, None)
        return True
    last = max(same_dir, key=lambda p: (getattr(p, "time_msc", 0) or 0, p.ticket))
    if config.fractal_next_loss_mode == "pips":
        against = (last.price_open - float(tick.bid)) if direction == "BUY" else (float(tick.ask) - last.price_open)
        reached = against >= limit
    else:
        reached = float(last.profit) <= -limit
    if reached:
        state.fractal_logged.pop(key, None)
        return True
    unit = "fiyat" if config.fractal_next_loss_mode == "pips" else "tutar"
    _log_once(
        key, last.ticket,
        f"⏸️ Fraktal: Bölge {zone_idx+1} {direction} | Sonraki emir, Bilet {last.ticket} en az "
        f"{limit} ({unit}) zarara geçince konacak.",
        "INFO", log_message,
    )
    return False


def _manage_orders(
    mt5, config, zone_idx, zone_key, m, tick, zone_orders, zone_positions, symbol_infos,
    consecutive_errors, active_zones_state, log_message, allow_new_orders,
) -> set[int]:
    """Hedef emirleri kurar, mevcut emirleri eşleştirir/siler, eksikleri koyar.
    Dönüş: değerlendirilen fraktalların zamanları (log kayıtlarının temizliği için)."""
    symbol = config.symbol
    zone_name = f"Bölge {zone_idx+1}"

    desired: list[DesiredOrder] = []
    candidates: set[int] = set()
    for side, items in (("U", m.ups), ("D", m.downs)):
        direction = _direction_of(config, side)
        if not allow_new_orders or config.order_type not in (direction, "BOTH"):
            continue
        # Sınır kapalıysa bu yönün bekleyen emirleri aşağıda eşleşmediği için silinir
        if not _loss_gate_open(mt5, config, zone_idx, direction, zone_positions, tick, log_message):
            continue
        count = config.fractal_order_count if direction == "BUY" else config.sell_fractal_order_count
        # Yalnızca en yeni `count` fraktal: geçersiz olanın yeri boş kalır, daha eskiyle doldurulmaz
        for f in reversed(items[-count:]):
            candidates.add(f.time)
            d = _build_desired(mt5, config, zone_idx, zone_key, side, f, m, tick, symbol_infos, log_message)
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
            if d.consumed:
                _log_once(
                    (zone_idx, d.side, "touched", d.fractal.time), "kept",
                    f"ℹ️ Fraktal: {_label(config, zone_idx, d.side, d.fractal)} fiyatça ulaşıldı; "
                    f"emir (Bilet {order.ticket}) MT5'te kalıyor, dolumu broker belirler.",
                    "INFO", log_message,
                )
            # Aynı fraktal, yalnızca SL/TP değişti (SAR/karşı fraktal yeni mumda): sil-koy yerine değiştir.
            # Yeni SL/TP geçersizse mevcut emir olduğu gibi kalır.
            if not _same_stops(order, d, tol) and d.stops_ok:
                if modify_pending_order(mt5, order, d.sl, d.tp, symbol_infos):
                    log_message(
                        f"✏️ Fraktal: {zone_name} | Bilet {order.ticket} SL {order.sl} → {d.sl}"
                        f"{f' / TP {order.tp} → {d.tp}' if d.tp or order.tp else ''}"
                    )
            continue
        if cancel_order(mt5, order):
            reason = "maksimum pozisyon" if not allow_new_orders else "güncel fraktalla eşleşmiyor"
            log_message(f"🔁 Fraktal: {zone_name} | Bilet {order.ticket} ({order.price_open}) siliniyor ({reason}).")

    for i, d in enumerate(desired):
        if i in matched:
            continue
        if d.consumed:
            _log_once(
                _log_key(zone_idx, d.side, d.fractal), "consumed",
                f"ℹ️ Fraktal: {_label(config, zone_idx, d.side, d.fractal)} fiyatça geçildi, emir yok.",
                "INFO", log_message,
            )
            continue
        if not d.placeable:
            continue
        comment = fractal_comment(config.target_magic, d.side, d.fractal.time)
        ok = send_pending_order_helper(
            mt5, d.price, d.lot, d.tp, d.sl, zone_idx, d.direction, symbol, symbol_infos,
            consecutive_errors, active_zones_state, comment=comment, magic=config.target_magic,
        )
        if ok:
            # Hemen izlemeye al: bir sonraki turdan önce elle silinirse de fark edilsin
            for o in mt5.orders_get(symbol=symbol) or ():
                if o.magic == config.target_magic and getattr(o, "comment", "") == comment:
                    tracked[o.ticket] = (d.done_key, d.side, d.fractal.time)
            kind = "STOP" if config.fractal_order_mode == "breakout" else "LIMIT"
            log_message(
                f"📐 Fraktal Emri: {zone_name} | {d.direction} {kind} {d.price} "
                f"({config.fractal_timeframe} {SIDE_NAMES[d.side]} fraktal {_fmt_time(d.fractal.time)}) "
                f"SL {d.sl}{f' TP {d.tp}' if d.tp else ''}"
            )
    return candidates


def _trail_sar(mt5, config, zone_idx, positions, sar, sar_is_long, tick, symbol_infos, log_message) -> None:
    """SAR modunda açık pozisyonların SL'i yeni SAR'a çekilir — yalnızca kâr yönünde. Bölgenin
    tüm pozisyonları takip edilir (ızgaradan fraktala geçmeden önce açılanlar da)."""
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
