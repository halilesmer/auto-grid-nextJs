import os
import json
from src.core.grid_helpers import (
    get_current_market_price,
    get_mt5_timeframe,
)
from src.core.grid_orders import get_all_robot_orders, get_all_robot_positions
from src.utils.paths import get_ui_state_path

from .grid_zone_selector import (
    get_active_zone,
    detect_zone_entry,
    is_zone_exited,
)
from .grid_zone_state import process_zone_commands
from .grid_order_manager import (
    clean_zombie_orders,
    process_partial_fills_and_tpsl,
    handle_zone_exit,
)
from .grid_execution.handler import handle_sliding_grid


def manage_dynamic_grid(
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
        exit_cond = active_zone.get("exit_condition", "Anlık Fiyat")
        z_min = float(active_zone.get("min_price", 0))
        z_max = float(active_zone.get("max_price", 0))

        close_price = current_avg_price
        if exit_cond != "Anlık Fiyat":
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

        is_exited = is_zone_exited(mt5, active_zone, current_avg_price, zone_symbol)

        if is_exited:
            should_mark_cleared = handle_zone_exit(
                mt5,
                active_zone,
                active_zone_idx,
                robot_orders,
                robot_positions,
                filling_mode,
                current_avg_price,
                close_price,
                exit_cond,
            )

            # Arayüze "DURDURULDU" bilgisini yalnızca clear_on_exit açıksa ilet
            # (eski davranış). Kapalıysa bölgenin bekleyen emirleri korunur.
            if should_mark_cleared:
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

    active_zone, active_zone_idx = detect_zone_entry(mt5, zones, active_zone, active_zone_idx)

    target_zone = active_zone if active_zone is not None else (zones[0] if zones else None)
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