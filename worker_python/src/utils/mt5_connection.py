# src/utils/mt5_connection.py

import platform
import time
import os
import threading
from src.utils.mt5_errors import kill_zombie_mt5
from src.utils.mt5_helpers import (
    get_mt5_symbols_helper,
    backup_mt5_logs_helper,
    connect_internal_helper,
)

# RLock: connect_to_mt5 kilidi tutarken connect_internal_helper aynı kilidi
# tekrar alır. Normal Lock ile aynı thread kendini kilitliyordu (deadlock).
_MT5_LOCK = threading.RLock()  # Race Condition koruması


def safe_log(msg, type="error", account_id=None):
    """Konsola ve log dosyasına güvenli mesaj yazar."""
    prefix = (
        "🔴 ERROR:"
        if type == "error"
        else "⚠️ WARNING:" if type == "warning" else "ℹ️ INFO:"
    )
    formatted_msg = f"{prefix} {msg}"
    print(formatted_msg)
    if account_id:
        try:
            from src.utils.paths import get_err_log_path

            log_file = get_err_log_path(str(account_id))
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {formatted_msg}\n")
        except Exception:
            pass


try:
    import MetaTrader5 as mt5  # type: ignore

    MT5_AVAILABLE = True
    MT5_IMPORT_ERROR = None
except ImportError as e:
    MT5_AVAILABLE = False
    MT5_IMPORT_ERROR = str(e)


def _kill_zombie_mt5(path):
    """Yardımcı Fonksiyon: Kilitlenmiş MT5'i işletim sistemi seviyesinde öldürür."""
    kill_zombie_mt5(path, safe_log)


def connect_to_mt5(account_config, timeout_sec=60, allow_restart=True):
    """Eşzamanlı API isteklerinin MT5 IPC portunu çökertmesini önleyen kilitli sarmalayıcı.

    `timeout_sec` kilit beklemesini de kapsar: kilidi tutan başka bir bağlantı denemesi
    bu çağrıyı süresinin ötesinde bekletemez.
    """
    deadline = time.monotonic() + timeout_sec
    if not _MT5_LOCK.acquire(timeout=timeout_sec):
        safe_log(f"[TIMEOUT] Başka bir MT5 bağlantısı {timeout_sec} sn içinde bitmedi; bağlantı denenmedi.")
        return (
            False,
            f"[TIMEOUT] MT5 bağlantısı {timeout_sec} sn içinde başlatılamadı (başka bir MT5 bağlantısı sürüyordu). Tekrar deneyin.",
        )
    try:
        # 🌟 ERKEN ÇIKIŞ (EARLY EXIT): Zaten bağlıysak ve hesap doğruysa işlemi atla.
        # Böylece arka arkaya gelen istekler birbirinin bağlantısını (shutdown) koparmaz.
        try:
            if MT5_AVAILABLE and mt5.terminal_info() is not None:
                login_id = int(account_config.get("login", 0))
                acc = mt5.account_info()
                if acc is not None and acc.login == login_id:
                    return True, None
        except Exception:
            pass

        return _connect_to_mt5_internal(
            account_config, timeout_sec, allow_restart=allow_restart, deadline=deadline
        )
    finally:
        _MT5_LOCK.release()


def _connect_to_mt5_internal(account_config, timeout_sec=60, allow_restart=True, deadline=None):
    return connect_internal_helper(
        account_config,
        timeout_sec,
        _MT5_LOCK,
        safe_log,
        MT5_AVAILABLE,
        MT5_IMPORT_ERROR,
        allow_restart=allow_restart,
        deadline=deadline,
    )


def shutdown_mt5():
    """MT5 bağlantı oturumunu serbest bırakır.

    Arayüz (frontend) "test bağlantısı" yaptıktan sonra artık terminali meşgul
    etmemelidir; aksi halde alt süreç (bot_runner) aynı terminale bağlanmaya
    çalışırken IPC çakışması (-10005 IPC timeout) yaşanabilir.
    """
    if MT5_AVAILABLE and platform.system() == "Windows":
        try:
            # KRİTİK DÜZELTME: Frontend'den gelen eşzamanlı isteklerin birbirinin
            # bağlantısını (IPC) koparmaması için devre dışı bırakıldı.
            pass
            # mt5.shutdown()
        except Exception:
            pass


def get_mt5_symbols():
    """MT5 terminalinden aktif sembolleri (Market Watch) çeker."""
    return get_mt5_symbols_helper(MT5_AVAILABLE, safe_log)


def connect_to_mt5_with_timeout(account_config, timeout=60, allow_restart=True):
    """connect_to_mt5'i çağırır; timeout gerçekleşirse is_timeout=True döner.

    `timeout` tüm bağlantının süre bütçesidir (kilit beklemesi + terminal açılışı);
    yalnızca giriş/senkronizasyon bunun üzerine eklenebilir.
    `allow_restart=False`: IPC hatasında asılı terminal öldürülüp yeniden başlatılmaz.
    """
    if not account_config:
        safe_log("Bağlanılacak hesap seçilmedi!")
        return False, False, "[CONFIG] Bağlanılacak hesap seçilmedi."

    try:
        ok, detail = connect_to_mt5(account_config, timeout_sec=timeout, allow_restart=allow_restart)
        is_timeout = False
        if (
            not ok
            and detail
            and any(k in str(detail) for k in ("[TIMEOUT]", "Timeout", "-10005", "-10004", "-10003"))
        ):
            is_timeout = True
            safe_log(
                f"[TIMEOUT] MT5 bağlantısı {timeout} saniye içinde tamamlanamadı. "
                "Terminal kapalı, sunucuya ulaşılamıyor veya açılışı çok yavaş."
            )
        return ok, is_timeout, detail
    except Exception as e:
        err_msg = f"[CRITICAL] Bağlantı fonksiyonu çöktü: {e}"
        safe_log(err_msg)
        return False, False, err_msg


def backup_mt5_logs(account_id):
    """MT5 Terminal loglarını okur ve projedeki ilgili hesabın log klasörüne kopyalar."""
    backup_mt5_logs_helper(account_id, MT5_AVAILABLE, safe_log)
