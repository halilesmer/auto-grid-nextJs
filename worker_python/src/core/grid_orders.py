import os
import json
from src.utils.trade_utils import safe_send_order, TradeState
from src.utils.paths import get_ui_state_path
from src.core.grid_helpers import (
    normalize_price,
    normalize_volume,
    get_current_market_price,
    determine_fill_mode,
    log_message,
)

BASE_MAGIC_NUMBER = 200000
MAX_DEVIATION = 20


def _get_mt5_instance(provided_mt5):
    if provided_mt5 is not None:
        return provided_mt5
    try:
        import MetaTrader5 as mt5  # type: ignore

        return mt5
    except ImportError:
        return None


def get_all_robot_orders(mt5=None):
    mt5_inst = _get_mt5_instance(mt5)
    if mt5_inst is None:
        return None
    orders = mt5_inst.orders_get()
    if orders is None:
        return None
    return [
        o for o in orders if BASE_MAGIC_NUMBER <= o.magic < BASE_MAGIC_NUMBER + 1000
    ]


def get_all_robot_positions(mt5=None):
    mt5_inst = _get_mt5_instance(mt5)
    if mt5_inst is None:
        return None
    positions = mt5_inst.positions_get()
    if positions is None:
        return None
    return [
        p for p in positions if BASE_MAGIC_NUMBER <= p.magic < BASE_MAGIC_NUMBER + 1000
    ]


def get_all_manual_positions(mt5=None):
    mt5_inst = _get_mt5_instance(mt5)
    if mt5_inst is None:
        return None
    positions = mt5_inst.positions_get()
    if positions is None:
        return None
    return [
        p
        for p in positions
        if not (BASE_MAGIC_NUMBER <= p.magic < BASE_MAGIC_NUMBER + 1000)
    ]


def get_existing_levels_by_direction(
    mt5, buy_grid_step, sell_grid_step, symbol, symbol_infos
):
    buy_levels, sell_levels = set(), set()
    orders = get_all_robot_orders(mt5)
    r_pos = get_all_robot_positions(mt5)
    m_pos = get_all_manual_positions(mt5)

    def add_to_set(price, is_buy, item_symbol):
        if item_symbol != symbol:
            return
        step = buy_grid_step if is_buy else sell_grid_step
        snapped = round(price / step) * step
        target_set = buy_levels if is_buy else sell_levels
        target_set.add(normalize_price(snapped, symbol, symbol_infos))

    for o in orders or []:
        add_to_set(
            o.price_open,
            o.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP],
            o.symbol,
        )
    for p in r_pos or []:
        add_to_set(p.price_open, p.type == mt5.POSITION_TYPE_BUY, p.symbol)
    for p in m_pos or []:
        add_to_set(p.price_open, p.type == mt5.POSITION_TYPE_BUY, p.symbol)

    return buy_levels, sell_levels


def get_opening_order_volume(mt5, position):
    """Pozisyonu açan emrin ilk hacmi (volume_initial); bilinmiyorsa None.

    Kısmi dolum AYARLARDAKİ lot ile değil, gerçekten gönderilen emirle ölçülür. Aksi halde
    kullanıcı lot'u sonradan büyütünce (24.09: 0.01 → 0.02) her eski pozisyon "eksik
    dolmuş" sayılıp her döngüde "kalan" emir gönderiliyordu. Değer değişmez → önbellek.
    """
    from src.core.state import state

    ident = getattr(position, "identifier", 0) or position.ticket
    cached = state.opening_volumes.get(ident)
    if cached is not None:
        return cached
    try:
        orders = mt5.history_orders_get(ticket=ident)
    except Exception:
        return None
    if not orders:
        return None
    volume = float(getattr(orders[0], "volume_initial", 0.0) or 0.0)
    if volume <= 0:
        return None
    state.opening_volumes[ident] = volume
    return volume


def remaining_lot_at_level(mt5, positions_at_level, symbol, symbol_infos):
    """Bir seviyedeki kısmi dolumdan eksik kalan lot. 0.0: tam dolu, açan emir bilinmiyor
    veya kalan volume_min'in altında. Hedef = o seviyeyi açan emirlerin en büyüğü (tamamlama
    emrinin kendi hacmi daha küçüktür). Kısmi dolum (grid_order_manager) ve emir doğrulaması
    (grid_execution/validation) aynı hesabı kullanır; biri koyduğunu diğeri silmez."""
    if not positions_at_level:
        return 0.0
    initial = [v for v in (get_opening_order_volume(mt5, p) for p in positions_at_level) if v]
    if not initial:
        return 0.0
    remaining = round(max(initial) - sum(float(p.volume) for p in positions_at_level), 8)
    info = symbol_infos.get(symbol)
    if isinstance(info, dict):
        vol_min = float(info.get("vol_min", info.get("volume_min", 0.01)))
    else:
        vol_min = float(getattr(info, "volume_min", 0.01) or 0.01) if info is not None else 0.01
    if remaining < vol_min - 1e-9:
        return 0.0
    return normalize_volume(remaining, symbol, symbol_infos)


def cancel_order(mt5, order):
    if mt5 is None:
        return False
    request = {
        "action": mt5.TRADE_ACTION_REMOVE,
        "order": order.ticket,
        "symbol": order.symbol,
    }
    return safe_send_order(mt5, request, log_message)


def modify_position_tp_sl(mt5, position, tp_price, sl_price, symbol_infos):
    if mt5 is None:
        return False
    symbol = position.symbol
    tp_norm = normalize_price(tp_price, symbol, symbol_infos) if tp_price else 0.0
    sl_norm = (
        normalize_price(sl_price, symbol, symbol_infos)
        if sl_price is not None and sl_price > 0
        else 0.0
    )
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": position.ticket,
        "symbol": symbol,
        "tp": tp_norm,
        "sl": sl_norm,
    }
    return safe_send_order(mt5, request, log_message)


def send_pending_order_helper(
    mt5,
    price,
    lot,
    tp_price,
    sl_price,
    zone_idx,
    direction,
    symbol,
    symbol_infos,
    consecutive_errors,
    active_zones_state,
):
    if not symbol or mt5 is None:
        log_message(
            f"🚨 Hata: Bölge {zone_idx+1} için geçerli bir sembol atanmamış!", "ERROR"
        )
        return False

    current_price = get_current_market_price(mt5, symbol, direction)
    if current_price is None:
        return False

    if direction == "BUY":
        order_type = (
            mt5.ORDER_TYPE_BUY_LIMIT
            if price < current_price
            else mt5.ORDER_TYPE_BUY_STOP
        )
    else:
        order_type = (
            mt5.ORDER_TYPE_SELL_LIMIT
            if price > current_price
            else mt5.ORDER_TYPE_SELL_STOP
        )

    request = {
        "action": mt5.TRADE_ACTION_PENDING,
        "symbol": symbol,
        "volume": normalize_volume(lot, symbol, symbol_infos),
        "type": order_type,
        "price": normalize_price(price, symbol, symbol_infos),
        "deviation": MAX_DEVIATION,
        "magic": BASE_MAGIC_NUMBER + zone_idx + 1,
        "comment": f"AutoGrid_Z{zone_idx + 1}",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_RETURN,
        "tp": normalize_price(tp_price, symbol, symbol_infos) if tp_price else 0.0,
    }

    if sl_price is not None and sl_price > 0:
        request["sl"] = normalize_price(sl_price, symbol, symbol_infos)

    success = safe_send_order(mt5, request, log_message)
    return _track_send_result(success, zone_idx, consecutive_errors, active_zones_state)


def _track_send_result(success, zone_idx, consecutive_errors, active_zones_state):
    """Üst üste 3 reddedilen emirde bölgeyi PAUSE'a alır (bekleyen ve piyasa emri ortak)."""
    if not success:
        consecutive_errors[zone_idx] = consecutive_errors.get(zone_idx, 0) + 1

        if consecutive_errors[zone_idx] >= 3:
            last_err_msg = TradeState.last_error_message or "Bilinmeyen Hata"
            log_message(
                f"🚨 DİKKAT: Bölge {zone_idx+1} için üst üste {consecutive_errors[zone_idx]} işlem reddedildi! (Detay: {last_err_msg}). Bölge güvenliğe alınıyor.",
                "ERROR",
            )
            account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
            states_file = get_ui_state_path(account_id)
            try:
                bg_states = {}
                if os.path.exists(states_file):
                    with open(states_file, "r", encoding="utf-8") as f:
                        bg_states = json.load(f)
                bg_states[str(zone_idx)] = "PAUSE"
                tmp_file = states_file + ".tmp"
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(bg_states, f)
                os.replace(tmp_file, states_file)
            except Exception:
                pass

            active_zones_state[zone_idx] = "PAUSE"
            consecutive_errors[zone_idx] = 0
        return False
    else:
        if zone_idx in consecutive_errors:
            consecutive_errors[zone_idx] = 0
    return True


def send_market_order_helper(
    mt5,
    lot,
    tp_distance,
    sl_distance,
    zone_idx,
    direction,
    symbol,
    symbol_infos,
    consecutive_errors,
    active_zones_state,
    filling_mode=None,
):
    """Sinyal girişi (entry_mode SIGNAL_MARKET): anlık fiyattan piyasa emri. TP/SL, giriş
    fiyatına (BUY → Ask, SELL → Bid) göre mesafe olarak verilir; açık pozisyon TP senkronu
    (grid_order_manager) sonra gerçek açılış fiyatına göre düzeltir."""
    if not symbol or mt5 is None:
        log_message(
            f"🚨 Hata: Bölge {zone_idx+1} için geçerli bir sembol atanmamış!", "ERROR"
        )
        return False

    price = get_current_market_price(mt5, symbol, direction)
    if price is None:
        return False

    if direction == "BUY":
        order_type = mt5.ORDER_TYPE_BUY
        tp_price = price + tp_distance if tp_distance > 0 else 0.0
        sl_price = price - sl_distance if sl_distance > 0 else 0.0
    else:
        order_type = mt5.ORDER_TYPE_SELL
        tp_price = price - tp_distance if tp_distance > 0 else 0.0
        sl_price = price + sl_distance if sl_distance > 0 else 0.0

    fill = (filling_mode or {}).get(symbol)
    if fill is None:
        fill = determine_fill_mode(mt5, symbol, symbol_infos, filling_mode if filling_mode is not None else {})
    if fill is None:
        fill = mt5.ORDER_FILLING_IOC

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": normalize_volume(lot, symbol, symbol_infos),
        "type": order_type,
        "price": normalize_price(price, symbol, symbol_infos),
        "deviation": MAX_DEVIATION,
        "magic": BASE_MAGIC_NUMBER + zone_idx + 1,
        "comment": f"AutoGrid_Z{zone_idx + 1}_SIG",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": fill,
        "tp": normalize_price(tp_price, symbol, symbol_infos) if tp_price else 0.0,
    }
    if sl_price:
        request["sl"] = normalize_price(sl_price, symbol, symbol_infos)

    success = safe_send_order(mt5, request, log_message)
    return _track_send_result(success, zone_idx, consecutive_errors, active_zones_state)
