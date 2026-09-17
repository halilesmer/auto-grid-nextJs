# src/core/reconnection.py
import time
from .state import state
from .startup import _reconnect_mt5
from src.core.grid_helpers import log_message


def check_connection_health(mt5_module, account_id, password, server, consecutive_losses):
    global state
    term_info = mt5_module.terminal_info() if mt5_module else None
    if (
        term_info is None
        or not getattr(term_info, "connected", False)
        or not getattr(term_info, "trade_allowed", False)
    ):
        if (
            term_info is None or not getattr(term_info, "connected", False)
        ) and not state.connection_lost:
            state.connection_lost = True
            log_message("🚨 KRİTİK: MT5 BAĞLANTISI KOPTU!", "ERROR")

        if account_id > 0 and password and server:
            log_message("MT5 yeniden bağlanma deneniyor...", "WARN")
            if _reconnect_mt5(mt5_module, account_id, password, server):
                state.connection_lost = False
                log_message("✅ MT5 bağlantısı yeniden kuruldu. Robot çalışmaya devam ediyor.", "WARN")
                return True, 0
            else:
                log_message("MT5 yeniden bağlanma başarısız", "ERROR")
                consecutive_losses += 1
        return False, consecutive_losses
    else:
        if state.connection_lost:
            state.connection_lost = False
            log_message(
                "✅ MT5 bağlantısı geri geldi. Robot çalışmaya devam ediyor.",
                "WARN",
            )
        return True, 0