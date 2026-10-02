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

Kurgular (ENG-28): bir bölgede birden çok kurgu (zaman dilimi, lot, TP, adet, pozisyon sınırı) yan
yana çalışır. Kurgu 1 bölgenin düz alanlarıdır, ek kurgular `fractal_setups`'tan gelir. Her kurgu
kendi emirlerini yönetir: emir ve pozisyon kurguya yorumdaki numarayla bağlanır (fractal_comment),
numarasız/okunamayan yorum kurgu 1 sayılır (eski davranış). Pozisyon sınırı kurgu başınadır.

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

from .config import FRACTAL_MAX_ORDERS, FractalSetup, ZoneConfig, money_to_price_distance
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
    consumed: bool = False  # True: fiyat fraktala ulaştı → yeni emir yok, mevcut emir kalır

    @property
    def placeable(self) -> bool:
        return not self.consumed and self.price_ok and self.stops_ok


@dataclass(slots=True)
class _Market:
    """Bir zaman diliminin bu turdaki mumları ve göstergeleri (kurgular aynı TF'yi paylaşır)."""
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


def _base_setup(config: ZoneConfig) -> FractalSetup:
    """Kurgu listesi olmayan (elle kurulmuş) config için kurgu 1."""
    return FractalSetup(
        sid=1, timeframe=config.fractal_timeframe, lot_size=config.lot_size, sell_lot_size=config.sell_lot_size,
        order_count=config.fractal_order_count, sell_order_count=config.sell_fractal_order_count,
        rr=config.fractal_rr, tp_money=config.fractal_tp_money, max_positions=config.max_positions,
    )


def _zone_label(zone_idx: int, setup: FractalSetup, multi: bool) -> str:
    # Tek kurguda loglar eskisi gibi; birden çok kurguda hangi kurgu olduğu yazılır
    return f"Bölge {zone_idx+1} · Kurgu {setup.sid}" if multi else f"Bölge {zone_idx+1}"


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


def _done_key(zone_key: str, config: ZoneConfig, setup: FractalSetup, side: str) -> str:
    # Sembol ve zaman dilimi de anahtarda: H4'te işlenen fraktal, M15'e geçince yeni fraktalları engellemesin.
    # Kurgu 1'in anahtarı eski biçimde kalır (mevcut durum dosyaları geçerli).
    key = f"{zone_key}:{config.symbol}:{setup.timeframe}:{side}"
    return key if setup.sid == 1 else f"{key}:S{setup.sid}"


def _mark_done(key: str, bar_time: int) -> bool:
    times = state.fractal_done.setdefault(key, set())
    if int(bar_time) in times:
        return False
    times.add(int(bar_time))
    # Yalnızca en yeni FRACTAL_MAX_ORDERS fraktal aday olabilir; daha eski kayıtlar gereksiz
    if len(times) > FRACTAL_MAX_ORDERS:
        state.fractal_done[key] = set(sorted(times)[-FRACTAL_MAX_ORDERS:])
    return True


def _update_done(zone_idx, zone_key, config, setups, zone_orders, zone_positions, log_message) -> None:
    """Kaybolan fraktal emirlerini ve fraktal pozisyonlarını "işlenmiş" olarak işaretler."""
    tracked = state.fractal_tracked.setdefault(zone_idx, {})
    live = {o.ticket for o in zone_orders}
    position_ids = {getattr(p, "identifier", 0) or p.ticket for p in zone_positions}
    by_sid = {s.sid: s for s in setups}
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
        setup = by_sid.get(parsed[0]) if parsed else None
        if setup is not None and _mark_done(_done_key(zone_key, config, setup, parsed[1]), parsed[2]):
            changed = True

    if changed:
        _save_done()

    # Artık hiçbir bölgenin izlemediği biletler (bot kaydı) birikmesin
    still_tracked = set().union(*(set(t) for t in state.fractal_tracked.values()))
    state.fractal_own_cancels &= still_tracked


# --------------------------------------------------------------------------- emir/pozisyon → kurgu
def _order_sid(order) -> int:
    parsed = parse_fractal_comment(getattr(order, "comment", ""))
    return parsed[0] if parsed else 1


def _position_sid(mt5, position, multi: bool) -> int:
    """Pozisyonun kurgusu: pozisyon yorumu, yoksa açan emrin yorumu (geçmiş, önbellekli), yoksa 1.
    Bazı brokerler pozisyon yorumunu değiştirir; açan emrin yorumu değişmez. Tek kurgulu bölgede
    geçmişe bakılmaz (sonuç her durumda kurgu 1'dir)."""
    parsed = parse_fractal_comment(getattr(position, "comment", ""))
    if parsed:
        return parsed[0]
    if not multi:
        return 1
    ident = getattr(position, "identifier", 0) or position.ticket
    cached = state.fractal_position_setup.get(ident)
    if cached is not None:
        return cached
    try:
        orders = mt5.history_orders_get(ticket=ident)
    except Exception:
        return 1  # bağlantı hatası: önbelleğe yazma, sonraki turda tekrar dene
    parsed = parse_fractal_comment(getattr(orders[0], "comment", "")) if orders else None
    sid = parsed[0] if parsed else 1
    state.fractal_position_setup[ident] = sid
    return sid


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


def _build_desired(
    mt5, config, setup, multi, zone_idx, zone_key, side, f, m: _Market, tick, symbol_infos, log_message,
):
    breakout = config.fractal_order_mode == "breakout"
    direction = _direction_of(config, side)

    log_key = _log_key(zone_idx, setup, side, f)
    label = _label(setup, multi, zone_idx, side, f)

    done_key = _done_key(zone_key, config, setup, side)
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
        lot = setup.lot_size
    else:
        order_type = mt5.ORDER_TYPE_SELL_STOP if breakout else mt5.ORDER_TYPE_SELL_LIMIT
        lot = setup.sell_lot_size
    entry = normalize_price(f.price, config.symbol, symbol_infos)
    volume = normalize_volume(lot, config.symbol, symbol_infos)
    if consumed:
        # Yalnızca mevcut emri eşleştirmek için (silinmesin): yeni emir yok, SL/TP'ye dokunulmaz
        # (stops_ok=False → MODIFY yok; fiyatın dibinde freeze_level'e takılırdı), SL uyarısı da yok.
        # "Geçildi" logu _manage_setup'ta: mevcut emir olup olmadığı orada belli.
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
            (zone_idx, setup.sid, side, "sl", f.time), "fallback",
            f"⚠️ Fraktal: {label} için SL ({config.fractal_sl_mode}) hesaplanamadı veya yanlış tarafta; "
            f"fraktal mumu + tampon kullanılıyor.",
            "WARN", log_message,
        )
        sl = fallback
    sl = normalize_price(sl, config.symbol, symbol_infos) if use_sl else 0.0
    if use_sl and not valid(sl):
        _log_once(
            (zone_idx, setup.sid, side, "sl_invalid", f.time), "invalid",
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
        if setup.tp_money > 0:
            tp_dist = money_to_price_distance(setup.tp_money, lot, config.symbol, symbol_infos) or 0.0
            if tp_dist == 0.0:
                _log_once(
                    (zone_idx, setup.sid, side, "tpmoney", f.time), "missing",
                    f"⚠️ Fraktal: {label} için tutar → fiyat mesafesi hesaplanamadı (tick değeri yok); TP konmuyor.",
                    "WARN", log_message,
                )
    elif use_sl and setup.rr > 0:  # Chance/Risiko braucht einen SL
        tp_dist = setup.rr * risk
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


def _log_key(zone_idx: int, setup: FractalSetup, side: str, f: Fractal) -> tuple:
    # Kurgu ve fraktal zamanı anahtarda: taraf başına birden çok fraktal aynı turda değerlendirilir
    return (zone_idx, setup.sid, side, f.time)


def _label(setup: FractalSetup, multi: bool, zone_idx: int, side: str, f: Fractal) -> str:
    return (
        f"{_zone_label(zone_idx, setup, multi)} | {setup.timeframe} {SIDE_NAMES[side]} fraktal {f.price} "
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


def _read_market(mt5, config: ZoneConfig, timeframe: str, zone_idx: int, log_message):
    rates = mt5.copy_rates_from_pos(config.symbol, get_mt5_timeframe(mt5, timeframe), 0, RATES_COUNT + 1)
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
    """Bölgenin her kurgusu için fraktal emirlerini yönetir. Kurgu pozisyon sınırındaysa (veya
    allow_new_orders=False) o kurgunun bekleyen emirleri silinir, yeni emir konmaz; "işlenmiş"
    takibi ve SAR takibi yine çalışır. Silinmiş kurgunun bekleyen emirleri silinir."""
    symbol = config.symbol
    setups = config.fractal_setups or (_base_setup(config),)
    multi = len(setups) > 1
    zone_orders = [o for o in robot_orders if o.magic == config.target_magic]
    zone_positions = [p for p in robot_positions if p.magic == config.target_magic]

    _load_done()
    _update_done(zone_idx, zone_key, config, setups, zone_orders, zone_positions, log_message)

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        _log_once(
            (zone_idx, "rates", setups[0].timeframe), "missing",
            f"⚠️ Fraktal: Bölge {zone_idx+1} için {symbol} {setups[0].timeframe} mumları okunamadı.",
            "WARN", log_message,
        )
        return False

    orders_by_sid: dict[int, list] = {}
    for o in zone_orders:
        orders_by_sid.setdefault(_order_sid(o), []).append(o)
    known = {s.sid for s in setups}
    positions_by_sid: dict[int, list] = {}
    for p in zone_positions:
        sid = _position_sid(mt5, p, multi)
        # Silinmiş/atlanan kurgunun pozisyonu kurgu 1'e sayılır: sınır ve SAR takibi dışında kalmasın
        positions_by_sid.setdefault(sid if sid in known else 1, []).append(p)
    # Önbellek yalnızca açık pozisyonlar için (kapanan pozisyonların kaydı birikmesin)
    open_ids = {getattr(p, "identifier", 0) or p.ticket for p in robot_positions}
    for ident in [i for i in state.fractal_position_setup if i not in open_ids]:
        del state.fractal_position_setup[ident]

    markets: dict[str, _Market | None] = {}
    candidates: set[tuple] = set()
    evaluated: set[int] = set()
    ok = True
    for setup in setups:
        setup_orders = orders_by_sid.pop(setup.sid, [])
        if setup.timeframe not in markets:
            markets[setup.timeframe] = _read_market(mt5, config, setup.timeframe, zone_idx, log_message)
        m = markets[setup.timeframe]
        if m is None:
            ok = False  # mumlar yok: bu kurgunun emirlerine dokunulmaz
            continue
        setup_positions = positions_by_sid.get(setup.sid, [])
        allow = allow_new_orders and not _at_limit(zone_idx, setup, multi, len(setup_positions), log_message)
        if allow:
            evaluated.add(setup.sid)
        _manage_setup(
            mt5, config, setup, multi, zone_idx, zone_key, m, tick, setup_orders, symbol_infos,
            consecutive_errors, active_zones_state, log_message, allow, candidates,
        )
        if config.fractal_use_sl and config.fractal_sl_mode == "sar":
            _trail_sar(mt5, config, setup, multi, zone_idx, setup_positions, m.sar_vals[-1], m.sar_long[-1],
                       tick, symbol_infos, log_message)

    # Ayarlardan silinmiş kurgunun bekleyen emirleri (pozisyonlar MT5'te kalır). Ayarlarda olup
    # geçersiz değer yüzünden atlanan kurgunun emirlerine dokunulmaz.
    for sid, orders in orders_by_sid.items():
        if sid in config.fractal_idle_sids:
            continue
        for order in orders:
            if cancel_order(mt5, order):
                log_message(
                    f"🔁 Fraktal: Bölge {zone_idx+1} | Bilet {order.ticket} ({order.price_open}) siliniyor "
                    f"(kurgu {sid} ayarlarda yok)."
                )

    # Pencereden çıkan fraktalların "bir kez yaz" kayıtları birikmesin. Pozisyon sınırındaki kurguda
    # adaylar hesaplanmaz; kayıtları kalsın ki sınır kalkınca aynı loglar tekrar yazılmasın.
    stale = [
        k for k in state.fractal_logged
        if k[0] == zone_idx and len(k) >= 3 and type(k[1]) is int
        and (k[1] not in known or (k[1] in evaluated and type(k[-1]) is int and (k[1], k[-1]) not in candidates))
    ]
    for key in stale:
        del state.fractal_logged[key]

    return ok


def _at_limit(zone_idx: int, setup: FractalSetup, multi: bool, open_positions: int, log_message) -> bool:
    """Kurgu pozisyon sınırında mı; uyarı yalnızca sınıra ulaşınca / sayı değişince yazılır."""
    key = (zone_idx, setup.sid, "limit")
    if open_positions < setup.max_positions:
        state.fractal_logged.pop(key, None)
        return False
    _log_once(
        key, open_positions,
        f"⚠️ DİKKAT: {_zone_label(zone_idx, setup, multi)} Maksimum pozisyon sınırına ulaştı "
        f"({open_positions}/{setup.max_positions}). Yeni emir konmuyor.",
        "WARN", log_message,
    )
    return True


def _manage_setup(
    mt5, config, setup, multi, zone_idx, zone_key, m, tick, setup_orders, symbol_infos,
    consecutive_errors, active_zones_state, log_message, allow_new_orders, candidates,
) -> None:
    symbol = config.symbol
    zone_name = _zone_label(zone_idx, setup, multi)

    desired: list[DesiredOrder] = []
    for side, items in (("U", m.ups), ("D", m.downs)):
        direction = _direction_of(config, side)
        if not allow_new_orders or config.order_type not in (direction, "BOTH"):
            continue
        count = setup.order_count if direction == "BUY" else setup.sell_order_count
        # Yalnızca en yeni `count` fraktal: geçersiz olanın yeri boş kalır, daha eskiyle doldurulmaz
        for f in reversed(items[-count:]):
            candidates.add((setup.sid, f.time))
            d = _build_desired(
                mt5, config, setup, multi, zone_idx, zone_key, side, f, m, tick, symbol_infos, log_message,
            )
            if d is not None:
                desired.append(d)

    info = symbol_infos.get(symbol)
    point = float(getattr(info, "point", 0) or 0) if info is not None else 0.0
    tol = point / 2 if point > 0 else 1e-9
    tracked = state.fractal_tracked.setdefault(zone_idx, {})

    matched: set[int] = set()
    for order in setup_orders:
        hit = next((i for i, d in enumerate(desired) if i not in matched and _same_entry(order, d, tol)), None)
        if hit is not None:
            d = desired[hit]
            matched.add(hit)
            tracked[order.ticket] = (d.done_key, d.side, d.fractal.time)
            if d.consumed:
                _log_once(
                    (zone_idx, setup.sid, d.side, "touched", d.fractal.time), "kept",
                    f"ℹ️ Fraktal: {_label(setup, multi, zone_idx, d.side, d.fractal)} fiyatça ulaşıldı; "
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
                _log_key(zone_idx, setup, d.side, d.fractal), "consumed",
                f"ℹ️ Fraktal: {_label(setup, multi, zone_idx, d.side, d.fractal)} fiyatça geçildi, emir yok.",
                "INFO", log_message,
            )
            continue
        if not d.placeable:
            continue
        comment = fractal_comment(config.target_magic, d.side, d.fractal.time, setup.sid)
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
                f"({setup.timeframe} {SIDE_NAMES[d.side]} fraktal {_fmt_time(d.fractal.time)}) "
                f"SL {d.sl}{f' TP {d.tp}' if d.tp else ''}"
            )


def _trail_sar(mt5, config, setup, multi, zone_idx, positions, sar, sar_is_long, tick, symbol_infos,
               log_message) -> None:
    """SAR modunda açık pozisyonların SL'i yeni SAR'a çekilir — yalnızca kâr yönünde. Kurgunun
    tüm pozisyonları takip edilir (SAR kurgunun zaman diliminden); ızgaradan fraktala geçmeden önce
    açılanlar kurgu 1'e aittir."""
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
            log_message(f"🪜 SAR Takip: {_zone_label(zone_idx, setup, multi)} | Bilet {p.ticket} SL {cur} → {new_sl}")
