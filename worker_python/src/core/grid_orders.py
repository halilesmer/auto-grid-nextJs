import os
import json
from src.utils.trade_utils import safe_send_order, TradeState
from src.utils.paths import get_ui_state_path
from src.core.grid_helpers import (
    normalize_price,
    normalize_volume,
    get_current_market_price,
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
