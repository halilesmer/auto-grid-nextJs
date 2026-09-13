import os
import time
import shutil
import datetime
import platform
from src.utils.paths import get_mt5_backup_dir
from src.utils.mt5_errors import (
    parse_init_error,
    parse_login_error,
    verify_account_environment,
)

def get_mt5_symbols_helper(mt5_available, safe_log_fn):
    if not mt5_available or platform.system() != "Windows":
        return []
    try:
        import MetaTrader5 as mt5  # type: ignore

        symbols = mt5.symbols_get()
        if symbols is None:
            safe_log_fn(
                "MT5'ten sembol listesi alınamadı (Market Watch boş olabilir).",
                type="warning",
            )
            return []
        return [s.name for s in symbols]
    except Exception as e:
        safe_log_fn(f"Sembol çekme hatası: {e}", type="error")
        return []


def backup_mt5_logs_helper(account_id, mt5_available, safe_log_fn):
    if not mt5_available or platform.system() != "Windows" or not account_id:
        return
    import MetaTrader5 as mt5  # type: ignore

    custom_log_dir = get_mt5_backup_dir(str(account_id))
    term_info = mt5.terminal_info()
    if term_info is None:
        return
    mt5_logs_dir = os.path.join(term_info.data_path, "Logs")
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    today_log_file = f"{today_str}.log"
    source_log_path = os.path.join(mt5_logs_dir, today_log_file)
    if os.path.exists(source_log_path):
        target_log_path = os.path.join(custom_log_dir, f"MT5_Terminal_{today_log_file}")
        try:
            shutil.copy2(source_log_path, target_log_path)
        except Exception as e:
            safe_log_fn(f"MT5 Log kopyalama hatası: {e}", type="warning")


def connect_internal_helper(
    account_config, timeout_sec, mt5_lock, safe_log_fn, mt5_available, mt5_import_error
):
    if not account_config:
        safe_log_fn("Bağlanılacak hesap seçilmedi!")
        return False, "[CONFIG] Bağlanılacak hesap seçilmedi veya hesap bilgisi eksik."

    if not mt5_available or platform.system() != "Windows":
        import sys

        reason = (
            mt5_import_error
            if platform.system() == "Windows"
            else "Mac/Linux Ortamı (MT5 yalnızca Windows destekler)"
        )
        safe_log_fn(
            f"🔴 BAĞLANTI HATASI: {reason} | Python: {sys.executable}", type="error"
        )
        return (
            False,
            f"[SYSTEM] MT5 Bağlantı Hatası: MetaTrader 5 Python kütüphanesi yalnızca Windows ortamında çalışır. ({reason})",
        )

    import MetaTrader5 as mt5  # type: ignore

    raw_login, password, server = (
        account_config.get("login"),
        account_config.get("password"),
        account_config.get("server"),
    )
    login_id = 0
    if raw_login and password and server:
        try:
            login_id = int(raw_login)
        except ValueError:
            safe_log_fn(
                f"🔴 BAĞLANTI HATASI: Hesap numarası (Login) sadece rakamlardan oluşmalıdır! Girilen değer: '{raw_login}'",
                type="error",
            )
            return (
                False,
                f"[CONFIG] Hesap numarası geçersiz: '{raw_login}' (sadece rakam olmalı)",
            )

    mt5_path = account_config.get("mt5_path")
    init_kwargs = {"timeout": int(timeout_sec * 1000)}
    if mt5_path and os.path.exists(mt5_path):
        init_kwargs["path"] = os.path.normpath(mt5_path)

    with mt5_lock:
        try:
            if (
                mt5.terminal_info() is not None
                and mt5.account_info() is not None
                and mt5.account_info().login == login_id
            ):
                return True, None
        except Exception:
            pass
        mt5.shutdown()
        time.sleep(0.2)
        init_success = mt5.initialize(**init_kwargs)

    if not init_success:
        time.sleep(1.0)
        init_kwargs["timeout"] = int((timeout_sec + 30) * 1000)
        init_success = mt5.initialize(**init_kwargs)

    if not init_success:
        return parse_init_error(mt5.last_error(), login_id, server, safe_log_fn)

    if login_id > 0:
        authorized = False
        last_err = mt5.last_error()
        for attempt in range(1, 4):
            authorized = mt5.login(
                login=login_id, password=str(password), server=str(server)
            )
            if authorized:
                break
            last_err = mt5.last_error()
            if attempt < 3:
                time.sleep(1.5)

        if not authorized:
            mt5.shutdown()
            return parse_login_error(last_err, login_id, server, safe_log_fn)
        time.sleep(1.0)
    else:
        time.sleep(2.0)

    account_info = None
    for _ in range(10):
        account_info = mt5.account_info()
        if account_info is not None:
            break
        time.sleep(1.0)

    if account_info is None:
        last_acc_err = mt5.last_error()
        safe_log_fn(
            f"Hesap bilgileri MetaTrader'dan alınamadı! (Hata: {last_acc_err})",
            type="error",
            account_id=login_id,
        )
        mt5.shutdown()
        return (
            False,
            f"[ACCOUNT] Hesap bilgisi alınamadı. MT5 terminali senkronize olamadı (10 saniye zaman aşımı, Hata: {last_acc_err})",
        )

    terminal_info = mt5.terminal_info()
    if terminal_info is not None and not terminal_info.trade_allowed:
        safe_log_fn(
            "🚨 KRİTİK HATA: MetaTrader 5'te 'Algo Trading' (Otomatik Ticaret) butonu kapalı!",
            account_id=login_id,
        )
        mt5.shutdown()
        return (
            False,
            "[TERMINAL] Algo Trading kapalı! MT5 üst menüsünden 'Algo Trading' butonunu aktif (yeşil) yapın.",
        )

    is_valid, err_msg = verify_account_environment(account_config, account_info, mt5)
    if not is_valid:
        safe_log_fn(err_msg, type="error", account_id=login_id)
        mt5.shutdown()
        return False, err_msg

    backup_mt5_logs_helper(login_id, mt5_available, safe_log_fn)
    return True, None
