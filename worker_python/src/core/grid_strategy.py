import os
import json
from src.core.grid_helpers import (
    log_message,
    get_current_market_price,
    get_mt5_timeframe,
)
from src.core.grid_orders import (
    BASE_MAGIC_NUMBER,
    MAX_DEVIATION,
    get_all_robot_orders,
    get_all_robot_positions,
    cancel_order,
)
from src.core.grid_position_sync import (
    clean_zombie_orders,
    process_partial_fills_and_tpsl,
)
from src.core.grid_execution import handle_sliding_grid
from src.utils.paths import get_ui_state_path
from src.utils.trade_utils import safe_send_order


def get_active_zone(mt5, zones):
    for i, zone in enumerate(zones):
        if str(zone.get("is_active", True)).lower() == "false":
            continue
        z_sym = zone.get("symbol", "").upper().strip()
        if not z_sym:
            continue
        bid = get_current_market_price(mt5, z_sym, "SELL")
        ask = get_current_market_price(mt5, z_sym, "BUY")
        if bid is None or ask is None:
            continue
        tick_price = (bid + ask) / 2.0
        z_min = float(zone.get("min_price", 0))
        z_max = float(zone.get("max_price", 0))
        cond = zone.get("exit_condition", "Anlık Fiyat")

        if cond == "Anlık Fiyat":
            if round(z_min, 5) <= round(tick_price, 5) <= round(z_max, 5):
                return zone, i
        else:
            tf_str = zone.get("exit_timeframe", "M15")
            tf = get_mt5_timeframe(mt5, tf_str)
            rates = mt5.copy_rates_from_pos(z_sym, tf, 1, 1) if mt5 else None
            if rates is not None and len(rates) > 0:
                close_price = (
                    rates[0]["close"]
                    if isinstance(rates[0], dict)
                    else getattr(
                        rates[0],
                        "close",
                        (
                            rates[0][4]
                            if isinstance(rates[0], tuple)
                            else rates[0]["close"]
                        ),
                    )
                )
            else:
                close_price = tick_price

            if round(z_min, 5) <= round(close_price, 5) <= round(z_max, 5):
                return zone, i
    return None, None


def process_zone_commands(zones, active_zones_state):
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            with open(ui_states_file, "r", encoding="utf-8") as f:
                ui_states = json.load(f)
                for k in list(active_zones_state.keys()):
                    if str(k) not in ui_states:
                        active_zones_state[k] = "CLEAR"
                for zone_idx_str, state in ui_states.items():
                    active_zones_state[int(zone_idx_str)] = state
        except Exception:
            pass
    else:
        for idx, zone in enumerate(zones):
            if idx not in active_zones_state:
                is_active = zone.get("is_active", True)
                active_zones_state[idx] = "START" if is_active else "PAUSE"


def manage_dynamic_grid_logic(
    mt5,
    zones,
    active_zone,
    active_zone_idx,
    remote_paused,
    symbol_infos,
    consecutive_errors,
    active_zones_state,
    filling_mode,
):
    process_zone_commands(zones, active_zones_state)
    if remote_paused:
        return True, active_zone, active_zone_idx

    if active_zone_idx is not None:
        found_zone = (
            zones[active_zone_idx] if 0 <= active_zone_idx < len(zones) else None
        )
        if found_zone and str(found_zone.get("is_active", True)).lower() != "false":
            active_zone = found_zone
        else:
            active_zone = None
            active_zone_idx = None

    robot_positions = get_all_robot_positions(mt5)
    robot_orders = get_all_robot_orders(mt5)
    if robot_positions is None or robot_orders is None:
        return False, active_zone, active_zone_idx

    target_zone = (
        active_zone
        if active_zone is not None
        else (
            zones[active_zone_idx]
            if active_zone_idx is not None and active_zone_idx < len(zones)
            else (zones[0] if zones else None)
        )
    )
    if not target_zone:
        return False, active_zone, active_zone_idx

    zone_symbol = target_zone.get("symbol", "").upper().strip()
    if not zone_symbol:
        return False, active_zone, active_zone_idx

    current_price_buy = get_current_market_price(mt5, zone_symbol, "BUY")
    current_price_sell = get_current_market_price(mt5, zone_symbol, "SELL")
    if current_price_buy is None or current_price_sell is None:
        return False, active_zone, active_zone_idx

    current_avg_price = (current_price_buy + current_price_sell) / 2.0

    clean_zombie_orders(mt5, robot_orders, zones, active_zones_state)
    robot_orders = get_all_robot_orders(mt5)
    robot_positions = get_all_robot_positions(mt5)
    if robot_orders is None or robot_positions is None:
        return False, active_zone, active_zone_idx

    process_partial_fills_and_tpsl(
        mt5,
        robot_positions,
        robot_orders,
        zones,
        symbol_infos,
        active_zones_state,
        consecutive_errors,
    )
    robot_orders = get_all_robot_orders(mt5)

    if active_zone is not None:
        is_exited = False
        exit_cond = active_zone.get("exit_condition", "Anlık Fiyat")
        z_min = float(active_zone.get("min_price", 0))
        z_max = float(active_zone.get("max_price", 0))

        if exit_cond == "Anlık Fiyat":
            if round(current_avg_price, 5) < round(z_min, 5) or round(
                current_avg_price, 5
            ) > round(z_max, 5):
                is_exited = True
        else:
            tf_str = active_zone.get("exit_timeframe", "M15")
            tf = get_mt5_timeframe(mt5, tf_str)
            rates = mt5.copy_rates_from_pos(zone_symbol, tf, 1, 1) if mt5 else None
            if rates is not None and len(rates) > 0:
                close_price = (
                    rates[0]["close"]
                    if isinstance(rates[0], dict)
                    else getattr(
                        rates[0],
                        "close",
                        (
                            rates[0][4]
                            if isinstance(rates[0], tuple)
                            else rates[0]["close"]
                        ),
                    )
                )
            else:
                close_price = current_avg_price
            if round(close_price, 5) < round(z_min, 5) or round(close_price, 5) > round(
                z_max, 5
            ):
                is_exited = True

        if is_exited:
            if active_zone.get("clear_on_exit", True):
                ref_price = (
                    current_avg_price if exit_cond == "Anlık Fiyat" else close_price
                )
                actual_exit_dir = (
                    "BUY (Yukarı)" if ref_price > z_max else "SELL (Aşağı)"
                )
                trigger_side = active_zone.get("clear_exit_side", "Farketmez")

                if trigger_side == "Farketmez" or trigger_side == actual_exit_dir:
                    scope = active_zone.get("clear_scope", "Sadece Bekleyen Emirler")
                    target = active_zone.get("clear_target_side", "Farketmez (Hepsi)")
                    target_magic = BASE_MAGIC_NUMBER + active_zone_idx + 1

                    for order in robot_orders:
                        if order.magic == target_magic:
                            if (
                                target == "Farketmez (Hepsi)"
                                or (
                                    target == "Sadece BUY İşlemleri"
                                    and order.type
                                    in [
                                        mt5.ORDER_TYPE_BUY_LIMIT,
                                        mt5.ORDER_TYPE_BUY_STOP,
                                    ]
                                )
                                or (
                                    target == "Sadece SELL İşlemleri"
                                    and order.type
                                    in [
                                        mt5.ORDER_TYPE_SELL_LIMIT,
                                        mt5.ORDER_TYPE_SELL_STOP,
                                    ]
                                )
                            ):
                                cancel_order(mt5, order)

                    if "Pozisyon" in scope or "Tümü" in scope or "Hepsi" in scope:
                        for pos in robot_positions:
                            if pos.magic == target_magic:
                                if (
                                    target == "Farketmez (Hepsi)"
                                    or (
                                        target == "Sadece BUY İşlemleri"
                                        and pos.type == mt5.POSITION_TYPE_BUY
                                    )
                                    or (
                                        target == "Sadece SELL İşlemleri"
                                        and pos.type == mt5.POSITION_TYPE_SELL
                                    )
                                ):
                                    tick = mt5.symbol_info_tick(pos.symbol)
                                    if tick:
                                        close_type = (
                                            mt5.ORDER_TYPE_SELL
                                            if pos.type == mt5.POSITION_TYPE_BUY
                                            else mt5.ORDER_TYPE_BUY
                                        )
                                        close_price = (
                                            tick.bid
                                            if pos.type == mt5.POSITION_TYPE_BUY
                                            else tick.ask
                                        )
                                        req = {
                                            "action": mt5.TRADE_ACTION_DEAL,
                                            "position": pos.ticket,
                                            "symbol": pos.symbol,
                                            "volume": pos.volume,
                                            "type": close_type,
                                            "price": close_price,
                                            "deviation": MAX_DEVIATION,
                                            "magic": pos.magic,
                                            "comment": "Zone_Exit_Close",
                                            "type_time": mt5.ORDER_TIME_GTC,
                                            "type_filling": filling_mode.get(
                                                pos.symbol, mt5.ORDER_FILLING_IOC
                                            ),
                                        }
                                        safe_send_order(mt5, req, log_message)

                account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
                states_file = get_ui_state_path(account_id)
                try:
                    bg_states = {}
                    if os.path.exists(states_file):
                        with open(states_file, "r", encoding="utf-8") as f:
                            bg_states = json.load(f)
                    bg_states[str(active_zone_idx)] = "AUTO_CLEAR"
                    tmp_file = states_file + ".tmp"
                    with open(tmp_file, "w", encoding="utf-8") as f:
                        json.dump(bg_states, f)
                    os.replace(tmp_file, states_file)
                except Exception:
                    pass

            active_zone = None
            active_zone_idx = None

    new_zone, new_zone_idx = get_active_zone(mt5, zones)
    if active_zone is None and new_zone is not None:
        active_zone = new_zone
        active_zone_idx = new_zone_idx
        log_message(
            f"📍 Yeni Bölgeye Girildi: Bölge {active_zone_idx+1} ({active_zone.get('min_price')}-{active_zone.get('max_price')})"
        )

    target_zone = (
        active_zone if active_zone is not None else (zones[0] if zones else None)
    )
    target_idx = active_zone_idx if active_zone_idx is not None else 0
    if target_zone is None:
        return True, active_zone, active_zone_idx

    is_zone_active = str(target_zone.get("is_active", True)).lower() != "false"
    if active_zones_state.get(target_idx) == "PAUSE":
        is_zone_active = False
    if not is_zone_active:
        return True, active_zone, active_zone_idx

    active_zone = target_zone
    active_zone_idx = target_idx

    robot_orders = get_all_robot_orders(mt5)
    robot_positions = get_all_robot_positions(mt5)
    if robot_orders is None or robot_positions is None:
        return False, active_zone, active_zone_idx

    handle_sliding_grid(
        mt5,
        active_zone,
        active_zone_idx,
        robot_positions,
        robot_orders,
        symbol_infos,
        consecutive_errors,
        active_zones_state,
        current_avg_price,
    )

    return True, active_zone, active_zone_idx
