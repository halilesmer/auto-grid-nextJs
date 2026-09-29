# src/core/reconnection.py
import time
from .state import state
from .startup import _reconnect_mt5
from src.core.grid_helpers import log_message


def check_connection_health(mt5_module, account_id, password, server, consecutive_losses, mt5_path=None):
    global state
    term_info = mt5_module.terminal_info() if mt5_module else None
    disconnected = term_info is None or not getattr(term_info, "connected", False)

    # Terminal başka bir hesaba geçmiş (ör. başka bir süreç bu terminalde login yaptı, ACC-11):
    # bağlantı "sağlam" görünür ama emirler yabancı hesaba gider. Bağlantı kopmuş sayılır.
    foreign_login = None
    if not disconnected and account_id > 0:
        try:
            acc = mt5_module.account_info()
        except Exception:
            acc = None
        if acc is not None and acc.login != account_id:
            foreign_login = acc.login

    if foreign_login is None and not disconnected and not getattr(term_info, "trade_allowed", False):
        # Sadece Algo Trading kapalı: bağlantı sağlam, yeniden giriş yapma (her turda
        # login spam olurdu). Kullanıcı açana kadar bekle; arayüz algo_trading_error gösterir.
        return False, 0

    if disconnected or foreign_login is not None:
        if not state.connection_lost:
            state.connection_lost = True
            if foreign_login is not None:
                log_message(
                    f"🚨 KRİTİK: MT5 terminali başka bir hesaba ({foreign_login}) geçmiş! "
                    f"Bu turda işlem yapılmıyor, {account_id} hesabına yeniden giriş deneniyor.",
                    "ERROR",
                )
            else:
                log_message("🚨 KRİTİK: MT5 BAĞLANTISI KOPTU!", "ERROR")

        if account_id > 0 and password and server:
            log_message("MT5 yeniden bağlanma deneniyor...", "WARN")
            if _reconnect_mt5(mt5_module, account_id, password, server, mt5_path=mt5_path):
                state.connection_lost = False
                log_message("✅ MT5 bağlantısı yeniden kuruldu. Robot çalışmaya devam ediyor.", "WARN")
                return True, 0
            log_message("MT5 yeniden bağlanma başarısız", "ERROR")
        elif consecutive_losses == 0:
            # Hesap bilgisi yoksa sadece terminalin kendi kendine bağlanmasını bekleyebiliriz
            log_message(
                "MT5 yeniden bağlanılamıyor: accounts.json'da bu hesabın şifre/sunucu bilgisi yok.",
                "ERROR",
            )
        return False, consecutive_losses + 1

    if state.connection_lost:
        state.connection_lost = False
        log_message(
            "✅ MT5 bağlantısı geri geldi. Robot çalışmaya devam ediyor.",
            "WARN",
        )
    return True, 0
