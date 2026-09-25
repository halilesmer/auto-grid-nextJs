# src/core/__init__.py
# Motor, ilk erişimde tembel (lazy) yüklenir: `from src.core.indicator_calc import ...`
# gibi importlar artık tüm motoru API sürecine çekmez. Değerler kopya değil,
# her erişimde auto_grid_engine üzerinden canlı okunur.


def __getattr__(name):
    if name in __all__:
        from . import auto_grid_engine
        return getattr(auto_grid_engine, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "main_loop",
    "get_live_metrics",
    "IS_RUNNING",
    "INITIAL_CLEANUP_DONE",
    "BASE_MAGIC_NUMBER",
    "mt5",
    "time",
    "ZONES",
    "LOOP_INTERVAL_SECONDS",
    "ACTIVE_SYMBOLS",
    "SYMBOL_INFOS",
    "FILLING_MODE",
    "ACTIVE_ZONES",
    "REMOTE_PAUSED",
    "CONNECTION_LOST",
    "CONSECUTIVE_ERRORS",
    "REMOTE_COMMAND_PREFIX",
    "REMOTE_SIGNAL_STOP_PRICE",
    "REMOTE_SIGNAL_START_PRICE",
    "REMOTE_SIGNAL_VOLUME",
    "active_zones_state",
    "load_dynamic_settings",
    "get_active_zone",
    "send_pending_order",
    "process_zone_commands",
    "check_remote_commands_wrapper",
    "manage_dynamic_grid",
    "run_startup_checks",
]