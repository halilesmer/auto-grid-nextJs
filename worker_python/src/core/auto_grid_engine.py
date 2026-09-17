# src/core/auto_grid_engine.py
"""
Auto Grid Trading Engine - Main Entry Point
Backward compatible with bot_runner.py
"""
import os
import sys
import time as _time
import types

from .state import state, GridState
from .wrappers import (
    get_live_metrics as _get_live_metrics,
    load_dynamic_settings as _load_dynamic_settings,
    get_active_zone as _get_active_zone,
    send_pending_order as _send_pending_order,
    process_zone_commands as _process_zone_commands,
    check_remote_commands_wrapper as _check_remote_commands_wrapper,
    manage_dynamic_grid as _manage_dynamic_grid,
    mt5 as _mt5_ref,
)
from .loop import main_loop as _main_loop
from .startup import run_startup_checks, _reconnect_mt5


_SYNC_ATTRS = (
    "IS_RUNNING", "INITIAL_CLEANUP_DONE", "BASE_MAGIC_NUMBER",
    "ZONES", "LOOP_INTERVAL_SECONDS", "ACTIVE_SYMBOLS", "SYMBOL_INFOS",
    "FILLING_MODE", "ACTIVE_ZONE", "ACTIVE_ZONE_IDX", "REMOTE_PAUSED",
    "CONNECTION_LOST", "CONSECUTIVE_ERRORS", "REMOTE_COMMAND_PREFIX",
    "REMOTE_SIGNAL_STOP_PRICE", "REMOTE_SIGNAL_START_PRICE", "REMOTE_SIGNAL_VOLUME",
    "active_zones_state",
)

_FUNC_ATTRS = (
    "get_live_metrics", "load_dynamic_settings", "get_active_zone",
    "send_pending_order", "process_zone_commands",
    "check_remote_commands_wrapper", "manage_dynamic_grid",
    "run_startup_checks", "main_loop",
)


class _AutoGridEngineModule(types.ModuleType):
    def __init__(self, name):
        super().__init__(name)
        object.__setattr__(self, '_mt5_backing', _mt5_ref)
        object.__setattr__(self, '_time_ref', _time)
        # Initialize synced attributes
        for attr in _SYNC_ATTRS:
            object.__setattr__(self, attr, globals()[attr])
        # Initialize function attributes
        for attr in _FUNC_ATTRS:
            object.__setattr__(self, attr, globals()[attr])

    def __getattr__(self, name):
        if name == "mt5":
            return self._mt5_backing
        if name == "time":
            return self._time_ref
        if name in _SYNC_ATTRS or name in _FUNC_ATTRS:
            return object.__getattribute__(self, name)
        raise AttributeError(f"module '{self.__name__}' has no attribute '{name}'")

    def __setattr__(self, name, value):
        if name == "mt5":
            object.__setattr__(self, '_mt5_backing', value)
            import src.core.wrappers as w
            w.mt5 = value
        elif name == "time":
            object.__setattr__(self, '_time_ref', value)
        elif name in _SYNC_ATTRS:
            object.__setattr__(self, name, value)
        else:
            object.__setattr__(self, name, value)
        _sync_state_from_module(self)

    def __dir__(self):
        return list(super().__dir__()) + ["mt5", "time"] + list(_SYNC_ATTRS) + list(_FUNC_ATTRS)


# Module-level state (synced with state.py)
IS_RUNNING = False
INITIAL_CLEANUP_DONE = False
BASE_MAGIC_NUMBER = 200000

ZONES = []
LOOP_INTERVAL_SECONDS = 3.0
ACTIVE_SYMBOLS = set()
SYMBOL_INFOS = {}
FILLING_MODE = {}
ACTIVE_ZONE = None
ACTIVE_ZONE_IDX = None
REMOTE_PAUSED = False
CONNECTION_LOST = False
CONSECUTIVE_ERRORS = {}
REMOTE_COMMAND_PREFIX = "GRID:"
REMOTE_SIGNAL_STOP_PRICE = 1.0
REMOTE_SIGNAL_START_PRICE = 2.0
REMOTE_SIGNAL_VOLUME = 0.01
active_zones_state = {}


def _sync_module_from_state(mod=None):
    """Sync module attributes from state.py. If mod is provided, update that module instance."""
    values = {
        "IS_RUNNING": state.is_running,
        "INITIAL_CLEANUP_DONE": state.initial_cleanup_done,
        "ZONES": state.zones,
        "LOOP_INTERVAL_SECONDS": state.loop_interval_seconds,
        "ACTIVE_SYMBOLS": state.active_symbols,
        "SYMBOL_INFOS": state.symbol_infos,
        "FILLING_MODE": state.filling_mode,
        "ACTIVE_ZONE": state.active_zone,
        "ACTIVE_ZONE_IDX": state.active_zone_idx,
        "REMOTE_PAUSED": state.remote_paused,
        "CONNECTION_LOST": state.connection_lost,
        "CONSECUTIVE_ERRORS": state.consecutive_errors,
        "active_zones_state": state.active_zones_state,
    }
    
    # Update globals for backward compat
    globals().update(values)
    
    # Update module instance if provided
    if mod is not None:
        for k, v in values.items():
            object.__setattr__(mod, k, v)


def _sync_state_from_module(mod):
    state.is_running = mod.IS_RUNNING
    state.initial_cleanup_done = mod.INITIAL_CLEANUP_DONE
    state.zones = mod.ZONES
    state.loop_interval_seconds = mod.LOOP_INTERVAL_SECONDS
    state.active_symbols = mod.ACTIVE_SYMBOLS
    state.symbol_infos = mod.SYMBOL_INFOS
    state.filling_mode = mod.FILLING_MODE
    state.active_zone = mod.ACTIVE_ZONE
    state.active_zone_idx = mod.ACTIVE_ZONE_IDX
    state.remote_paused = mod.REMOTE_PAUSED
    state.connection_lost = mod.CONNECTION_LOST
    state.consecutive_errors = mod.CONSECUTIVE_ERRORS
    state.active_zones_state = mod.active_zones_state


def get_live_metrics():
    _sync_module_from_state(sys.modules[__name__])
    return _get_live_metrics()


def load_dynamic_settings():
    _sync_module_from_state(sys.modules[__name__])
    _load_dynamic_settings()
    _sync_module_from_state(sys.modules[__name__])


def get_active_zone():
    _sync_module_from_state(sys.modules[__name__])
    return _get_active_zone()


def send_pending_order(price, lot, tp_price, sl_price=None, zone_idx=0, direction="BUY", symbol=None):
    _sync_module_from_state(sys.modules[__name__])
    return _send_pending_order(price, lot, tp_price, sl_price, zone_idx, direction, symbol)


def process_zone_commands():
    _sync_module_from_state(sys.modules[__name__])
    _process_zone_commands()


def check_remote_commands_wrapper():
    _sync_module_from_state(sys.modules[__name__])
    return _check_remote_commands_wrapper()


def manage_dynamic_grid():
    _sync_module_from_state(sys.modules[__name__])
    return _manage_dynamic_grid()


def run_startup_checks(mt5_module):
    _sync_module_from_state(sys.modules[__name__])
    return run_startup_checks(mt5_module)


def main_loop():
    _sync_module_from_state(sys.modules[__name__])
    account_id = int(os.environ.get("ACTIVE_ACCOUNT_ID", "0"))
    from src.utils.config import load_settings
    account_config = load_settings("Auto Grid")
    password = account_config.get("password", "")
    server = account_config.get("server", "")
    _main_loop(sys.modules[__name__]._mt5_backing, account_id, password, server)
    _sync_module_from_state(sys.modules[__name__])


# Replace this module with our custom module class
_new_module = _AutoGridEngineModule(__name__)
sys.modules[__name__] = _new_module


if __name__ == "__main__":
    # For direct execution (e.g., python -m src.core.auto_grid_engine)
    account_id = int(os.environ.get("ACTIVE_ACCOUNT_ID", "0"))
    from src.utils.config import load_settings
    account_config = load_settings("Auto Grid")
    password = account_config.get("password", "")
    server = account_config.get("server", "")
    # Initialize mt5 connection here if needed
    main_loop()