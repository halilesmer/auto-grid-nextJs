# src/core/auto_grid_engine.py
"""
Auto Grid Trading Engine - Main Entry Point
Backward compatible with bot_runner.py

Eski global değişkenler (IS_RUNNING, ZONES, ...) artık kopya değil:
modül özniteliği okunduğunda/yazıldığında doğrudan `state` nesnesine gider.
Böylece bot_runner ve modüler dosyalar her zaman aynı canlı durumu görür.
"""
import os
import sys
import time as _time
import types

from . import wrappers as _wrappers
from .state import state
from .wrappers import (
    get_live_metrics,
    load_dynamic_settings,
    get_active_zone,
    send_pending_order,
    process_zone_commands,
    check_remote_commands_wrapper,
    manage_dynamic_grid,
)
from .loop import main_loop as _main_loop
from .startup import run_startup_checks


# Eski modül değişkeni adı -> state alanı
_STATE_ATTRS = {
    "IS_RUNNING": "is_running",
    "INITIAL_CLEANUP_DONE": "initial_cleanup_done",
    "BASE_MAGIC_NUMBER": "BASE_MAGIC_NUMBER",
    "ZONES": "zones",
    "LOOP_INTERVAL_SECONDS": "loop_interval_seconds",
    "ACTIVE_SYMBOLS": "active_symbols",
    "SYMBOL_INFOS": "symbol_infos",
    "FILLING_MODE": "filling_mode",
    "ACTIVE_ZONE": "active_zone",
    "ACTIVE_ZONE_IDX": "active_zone_idx",
    "REMOTE_PAUSED": "remote_paused",
    "CONNECTION_LOST": "connection_lost",
    "CONSECUTIVE_ERRORS": "consecutive_errors",
    "REMOTE_COMMAND_PREFIX": "remote_command_prefix",
    "REMOTE_SIGNAL_STOP_PRICE": "remote_signal_stop_price",
    "REMOTE_SIGNAL_START_PRICE": "remote_signal_start_price",
    "REMOTE_SIGNAL_VOLUME": "remote_signal_volume",
    "active_zones_state": "active_zones_state",
}


def main_loop():
    account_id = int(os.environ.get("ACTIVE_ACCOUNT_ID", "0"))
    from src.utils.config import load_settings
    account_config = load_settings("Auto Grid")
    password = account_config.get("password", "")
    server = account_config.get("server", "")
    _main_loop(_wrappers.mt5, account_id, password, server)


class _AutoGridEngineModule(types.ModuleType):
    def __getattr__(self, name):
        if name == "mt5":
            return _wrappers.mt5
        if name == "time":
            return _time
        if name in _STATE_ATTRS:
            return getattr(state, _STATE_ATTRS[name])
        raise AttributeError(f"module '{self.__name__}' has no attribute '{name}'")

    def __setattr__(self, name, value):
        if name == "mt5":
            _wrappers.mt5 = value
        elif name in _STATE_ATTRS:
            setattr(state, _STATE_ATTRS[name], value)
        else:
            super().__setattr__(name, value)

    def __dir__(self):
        return list(super().__dir__()) + ["mt5", "time"] + list(_STATE_ATTRS)


# Bu modülü, öznitelikleri state'e yönlendiren özel modül sınıfıyla değiştir
_new_module = _AutoGridEngineModule(__name__)
for _k, _v in list(globals().items()):
    if _k not in ("_new_module",):
        object.__setattr__(_new_module, _k, _v)
sys.modules[__name__] = _new_module


if __name__ == "__main__":
    main_loop()
