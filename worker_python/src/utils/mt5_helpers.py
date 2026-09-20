import os
import time
import shutil
import datetime
import platform
import asyncio
import threading
import json

# Module-level state for in-flight request deduplication
_IN_FLIGHT: dict[str, asyncio.Task] = {}
_IN_FLIGHT_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 3600  # 1 hour

# Local BASE_DIR to avoid circular import from src.api.helpers
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE_FILE = os.path.join(BASE_DIR, "broker_symbols.json")

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


def _retry_initialize(mt5, init_kwargs, max_retries=3, base_delay=2):
    """Exponential backoff retry for mt5.initialize() on IPC timeout/connection loss."""
    for attempt in range(max_retries):
        init_success = mt5.initialize(**init_kwargs)
        if init_success:
            return True
        last_err = mt5.last_error()
        err_code = last_err[0] if last_err else 0
        if err_code in (-10005, -10003, -10004):
            delay = base_delay * (2 ** attempt)
            time.sleep(delay)
            continue
        break
    return False


def _retry_login(mt5, login_id, password, server, max_retries=3, base_delay=2):
    """Exponential backoff retry for mt5.login() on transient failures."""
    for attempt in range(max_retries):
        authorized = mt5.login(login=login_id, password=str(password), server=str(server))
        if authorized:
            return True
        last_err = mt5.last_error()
        err_code = last_err[0] if last_err else 0
        if err_code in (-10005, -10004, 1002, 2):
            delay = base_delay * (2 ** attempt)
            time.sleep(delay)
            continue
        break
    return False


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
        init_success = _retry_initialize(mt5, init_kwargs)

    if not init_success:
        return parse_init_error(mt5.last_error(), login_id, server, safe_log_fn)

    if login_id > 0:
        authorized = _retry_login(mt5, login_id, password, server)
        if not authorized:
            mt5.shutdown()
            return parse_login_error(mt5.last_error(), login_id, server, safe_log_fn)
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


def _read_cache_file():
    """Read and parse the cache file safely."""
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _write_cache_file(cache_data: dict):
    """Write cache file atomically (temp file + rename)."""
    try:
        temp_file = CACHE_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, indent=4, ensure_ascii=False)
        os.replace(temp_file, CACHE_FILE)
    except Exception as e:
        safe_log_fn(f"Cache yazma hatası: {e}", type="error")


def _is_cache_fresh(account_id: str, cache_data: dict) -> bool:
    """Check if cache for account_id is fresh (within TTL)."""
    try:
        # Check file modification time as TTL proxy
        if os.path.exists(CACHE_FILE):
            mtime = os.path.getmtime(CACHE_FILE)
            age = time.time() - mtime
            if age < _CACHE_TTL_SECONDS:
                # Also verify account_id exists in cache
                return account_id in cache_data and len(cache_data[account_id]) > 0
    except Exception:
        pass
    return False


def get_cached_symbols(account_id: str, safe_log_fn) -> tuple[list[dict] | None, bool]:
    """
    Get symbols from cache if fresh.
    Returns: (symbols_list or None, is_fresh: bool)
    """
    cache_data = _read_cache_file()
    if not cache_data:
        return None, False
    
    account_cache = cache_data.get(account_id)
    if not account_cache:
        return None, False
    
    is_fresh = _is_cache_fresh(account_id, cache_data)
    symbols = list(account_cache.values())
    return symbols, is_fresh


async def fetch_and_cache_symbols(account_id: str, account_config: dict, safe_log_fn) -> list[dict]:
    """
    Connect to MT5, fetch detailed symbols, update cache.
    Called in background task. Raises on failure.
    """
    # Lazy imports to avoid circular dependency
    from src.utils.mt5_connection import (
        connect_to_mt5_with_timeout,
        get_mt5_symbols,
        shutdown_mt5,
    )
    
    # Use shorter timeout for symbols endpoint (5 seconds)
    ok, _is_timeout, detail = await asyncio.to_thread(
        connect_to_mt5_with_timeout, account_config, 5
    )
    
    if not ok:
        raise Exception(detail or "MT5 connection failed")
    
    try:
        symbols = await asyncio.to_thread(get_mt5_symbols)
        detailed_symbols = []
        if symbols:
            for s in symbols:
                name = (
                    s.get("name")
                    if isinstance(s, dict)
                    else getattr(s, "name", "")
                )
                if name and name.strip():
                    desc = (
                        s.get("description")
                        if isinstance(s, dict)
                        else getattr(s, "description", "")
                    )
                    digits = (
                        s.get("digits")
                        if isinstance(s, dict)
                        else getattr(s, "digits", 5)
                    )
                    point = (
                        s.get("point")
                        if isinstance(s, dict)
                        else getattr(s, "point", 0.00001)
                    )
                    vol_min = (
                        s.get("volume_min")
                        if isinstance(s, dict)
                        else getattr(s, "volume_min", 0.01)
                    )
                    vol_max = (
                        s.get("volume_max")
                        if isinstance(s, dict)
                        else getattr(s, "volume_max", 100.0)
                    )
                    vol_step = (
                        s.get("volume_step")
                        if isinstance(s, dict)
                        else getattr(s, "volume_step", 0.01)
                    )
                    detailed_symbols.append(
                        {
                            "name": name,
                            "description": desc or name,
                            "digits": digits,
                            "point": point,
                            "volume_min": vol_min,
                            "volume_max": vol_max,
                            "volume_step": vol_step,
                        }
                    )
        
        if detailed_symbols:
            # Update cache atomically
            cache_data = _read_cache_file()
            cache_data[account_id] = {s["name"]: s for s in detailed_symbols}
            _write_cache_file(cache_data)
        
        return detailed_symbols
    finally:
        await asyncio.to_thread(shutdown_mt5)


async def get_or_fetch_symbols(account_id: str, safe_log_fn) -> list[dict]:
    """
    Main entry point: get cached symbols or fetch from MT5 with deduplication.
    Returns detailed symbols list (empty on failure).
    """
    # Lazy import to avoid circular dependency
    from src.api.helpers import _load_accounts
    
    # 1. Try cache first (immediate)
    cached, fresh = get_cached_symbols(account_id, safe_log_fn)
    if cached and fresh:
        return cached
    
    # 2. Find account config
    accounts = _load_accounts()
    account_config = next(
        (
            a
            for a in accounts
            if str(a.get("id")) == account_id or str(a.get("login")) == account_id
        ),
        None,
    )
    if not account_config:
        safe_log_fn(f"Account '{account_id}' not found for symbols fetch", type="warning")
        return cached or []  # Return stale cache if available
    
    # 3. Deduplicate in-flight requests
    with _IN_FLIGHT_LOCK:
        if account_id in _IN_FLIGHT:
            task = _IN_FLIGHT[account_id]
        else:
            task = asyncio.create_task(
                _fetch_and_cache_wrapper(account_id, account_config, safe_log_fn)
            )
            _IN_FLIGHT[account_id] = task
    
    # 4. If we have stale cache, return it immediately while background fetch runs
    if cached:
        # Don't await - let background task update cache
        return cached
    
    # 5. No cache - wait for background task with timeout
    try:
        symbols = await asyncio.wait_for(task, timeout=10.0)
        return symbols
    except asyncio.TimeoutError:
        safe_log_fn(f"MT5 symbols fetch timeout for {account_id}", type="warning")
        return []
    except Exception as e:
        safe_log_fn(f"MT5 symbols fetch error for {account_id}: {e}", type="error")
        return []
    finally:
        with _IN_FLIGHT_LOCK:
            _IN_FLIGHT.pop(account_id, None)


async def _fetch_and_cache_wrapper(account_id: str, account_config: dict, safe_log_fn) -> list[dict]:
    """Wrapper to catch exceptions and clean up in-flight tracking."""
    try:
        return await fetch_and_cache_symbols(account_id, account_config, safe_log_fn)
    except Exception as e:
        safe_log_fn(f"Background symbols fetch failed for {account_id}: {e}", type="error")
        raise
