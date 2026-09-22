# src/core/wrappers.py
from .state import state
from src.core.grid_helpers import (
    log_message,
    is_market_open,
    determine_fill_mode,
)
from src.core.grid_metrics import calculate_live_metrics
from src.core.grid_orders import (
    BASE_MAGIC_NUMBER,
    get_all_robot_orders,
    get_all_robot_positions,
    cancel_order,
    send_pending_order_helper,
)
from src.core.grid_remote import check_remote_commands
from src.core.grid_zone_selector import get_active_zone as _get_active_zone
from src.core.grid_zone_state import process_zone_commands as _process_zone_commands
from src.core.grid_orchestrator import manage_dynamic_grid as _manage_dynamic_grid

try:
    import MetaTrader5 as mt5  # type: ignore
except ImportError:
    mt5 = None


def get_live_metrics():
    global state
    res = calculate_live_metrics(mt5, state.active_symbols, state.connection_lost, state.remote_paused)
    state.connection_lost = res.get("connection_lost", False)
    return res


def load_dynamic_settings():
    global state
    from src.utils.config import load_settings

    # Ayar dosyası bozuk olsa bile döngü çökmemeli (eski davranış)
    try:
        settings = load_settings("Auto Grid")
        state.zones = settings.get("ZONES", [])
        state.loop_interval_seconds = settings.get("LOOP_INTERVAL_SECONDS", 1.0)
        state.active_symbols.clear()
        for zone in state.zones:
            if "symbol" in zone and zone["symbol"]:
                state.active_symbols.add(str(zone["symbol"]).upper().strip())

        for sym in state.active_symbols:
            if sym not in state.symbol_infos:
                try:
                    mt5.symbol_select(sym, True)
                    info = mt5.symbol_info(sym)
                    if info:
                        state.symbol_infos[sym] = info
                except Exception:
                    pass
    except Exception:
        pass


def get_active_zone():
    return _get_active_zone(mt5, state.zones)


def send_pending_order(price, lot, tp_price, sl_price=None, zone_idx=0, direction="BUY", symbol=None):
    return send_pending_order_helper(
        mt5,
        price,
        lot,
        tp_price,
        sl_price,
        zone_idx,
        direction,
        symbol,
        state.symbol_infos,
        state.consecutive_errors,
        state.active_zones_state,
    )


def process_zone_commands():
    _process_zone_commands(state.zones, state.active_zones_state)


def check_remote_commands_wrapper():
    global state
    found, state.remote_paused, reset_zone = check_remote_commands(mt5, state.remote_paused, state.zones)
    if reset_zone:
        state.active_zone = None
        state.active_zone_idx = None
    return found


def manage_dynamic_grid():
    global state
    ok, state.active_zone, state.active_zone_idx = _manage_dynamic_grid(
        mt5,
        state.zones,
        state.active_zone,
        state.active_zone_idx,
        state.remote_paused,
        state.symbol_infos,
        state.consecutive_errors,
        state.active_zones_state,
        state.filling_mode,
    )
    return ok