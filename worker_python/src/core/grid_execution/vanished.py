"""Dışarıdan silinen emirler ve emir seli freni (ENG-25).

Botun koyduğu bekleyen emir MT5'te kaybolur ama bot silmemiş ve emir dolmamışsa (pozisyon yok,
geçmişte FILLED değil) emri başka biri silmiştir: elle (MT5/mobil), broker/dealer, aynı hesaba
bağlı başka bir terminal veya EA. Bot bunu fark etmezse eksik seviyeyi her döngüde yeniden koyar; 29.09'da
7947315 hesabında dakikada ~200 emir kondu, hiçbiri 5 sn'den uzun yaşamadı ve silme işlemi bu
terminalin journal'ında hiç görünmedi (bkz. docs/features/features.yaml ENG-25).

Her döngüde kaybolan emirler MT5 geçmişindeki durumuyla (CANCELED/EXPIRED/REJECTED...) loglanır;
böylece silenin kim olduğu anlaşılır. Bir bölgede VANISH_WINDOW_SEC içinde VANISH_LIMIT emir
dışarıdan silinirse bölge güvenliğe alınır (PAUSE, ENG-11 ile aynı yol) ve alarm verilir.
"""
import time
from typing import Callable

from src.core.grid_helpers import log_message as default_log_message, zone_log_id
from src.core.grid_orders import pause_zone_for_safety, zone_index_by_magic
from src.core.state import state
from src.utils.trade_utils import TradeState

VANISH_WINDOW_SEC = 60.0
VANISH_LIMIT = 10

_STATE_NAMES = {
    0: "STARTED",
    1: "PLACED",
    2: "CANCELED",
    3: "PARTIAL",
    4: "FILLED",
    5: "REJECTED",
    6: "EXPIRED",
    7: "REQUEST_ADD",
    8: "REQUEST_MODIFY",
    9: "REQUEST_CANCEL",
}
_FILLED_STATES = (3, 4)  # ORDER_STATE_PARTIAL, ORDER_STATE_FILLED


def _history_order(mt5, ticket):
    try:
        hist = mt5.history_orders_get(ticket=ticket)
    except Exception:
        return None
    return hist[0] if hist else None


def check_vanished_orders(
    mt5,
    zones: list,
    robot_orders: list,
    robot_positions: list,
    active_zones_state: dict,
    log_message: Callable[..., None] = default_log_message,
    now: Callable[[], float] | None = None,
) -> dict:
    """Kaybolan bot emirlerini sınıflandırır; dönüş: bölge → dışarıdan silinen emir sayısı (bu tur)."""
    if not state.placed_orders or mt5 is None:
        return {}

    open_tickets = {o.ticket for o in robot_orders}
    position_ids = {getattr(p, "identifier", 0) or p.ticket for p in robot_positions}
    t_now = now() if now else time.monotonic()
    removed: dict = {}
    index_by_magic = zone_index_by_magic(zones)

    for ticket, (magic, placed_at, price) in list(state.placed_orders.items()):
        if ticket in open_tickets:
            continue
        del state.placed_orders[ticket]
        zone_idx = index_by_magic.get(magic)
        if zone_idx is None:
            continue  # bölge bu arada silindi: emirlerini zombi temizliği (bot) sildi
        if ticket in position_ids:
            continue  # doldu, pozisyon açık
        hist = _history_order(mt5, ticket)
        order_state = getattr(hist, "state", None) if hist is not None else None
        if order_state in _FILLED_STATES:
            continue  # doldu (pozisyon TP/SL ile kapanmış olabilir)
        # Geçmişte bulunamayan emir de sayılır: aksi halde fren tam da sorun anında devre dışı kalırdı
        removed.setdefault(zone_idx, []).append(
            (ticket, price, order_state, (getattr(hist, "comment", "") or "") if hist is not None else "", t_now - placed_at)
        )

    counts = {}
    for zone_idx, items in removed.items():
        counts[zone_idx] = len(items)
        zone = zones[zone_idx] if 0 <= zone_idx < len(zones) else None
        zid = zone_log_id(zone, zone_idx) if zone is not None else None
        states: dict = {}
        for _, _, st, _, _ in items:
            name = _STATE_NAMES.get(st, "GEÇMİŞTE YOK") if st is not None else "GEÇMİŞTE YOK"
            states[name] = states.get(name, 0) + 1
        state_txt = ", ".join(f"{k}×{v}" for k, v in sorted(states.items()))
        ticket, price, _, comment, age = items[0]
        comment_txt = f", yorum '{comment}'" if comment else ""
        log_message(
            f"⚠️ Bölge {zone_idx + 1}: {len(items)} bekleyen emir MT5'te kayboldu — bot silmedi, dolmadı "
            f"(geçmiş durumu: {state_txt}; ör. bilet {ticket} @ {price}, {age:.1f} sn yaşadı{comment_txt}). "
            "Silen: elle (MT5/mobil), broker veya aynı hesaba bağlı başka bir terminal/EA olabilir.",
            "WARN",
            zone_id=zid,
        )

        times = [t for t in state.vanished_times.get(zone_idx, []) if t_now - t <= VANISH_WINDOW_SEC]
        times.extend([t_now] * len(items))
        state.vanished_times[zone_idx] = times
        if len(times) >= VANISH_LIMIT and active_zones_state.get(zone_idx) != "PAUSE":
            msg = (
                f"Emir seli durduruldu: Bölge {zone_idx + 1}'de {int(VANISH_WINDOW_SEC)} sn içinde "
                f"{len(times)} emir dışarıdan silindi"
            )
            TradeState.last_error_message = msg
            log_message(
                f"🚨 {msg}. Bölge güvenliğe alınıyor (PAUSE); pozisyonlara dokunulmuyor. "
                "Hesaba başka bir terminal/EA bağlı mı, MT5 → Geçmiş → Emirler'de silinme nedenine bakın; "
                "sonra bölgeyi arayüzden yeniden başlatın.",
                "ERROR",
                zone_id=zid,
            )
            pause_zone_for_safety(zone_idx, active_zones_state)
            state.vanished_times[zone_idx] = []

    return counts
