import time
import datetime
import os
import sys
import contextlib
import contextvars
from src.utils.paths import get_err_log_path
from src.utils.trade_utils import snap_volume

LOG_TO_FILE = True


# Bölge işlenirken yazılan her satır "[Z:<zone_id>]" etiketi alır; arayüz bölge loglarını
# bununla süzer (GET /logs/{id}?zone_id=...). Konum numarası (Bölge N) değişebilir, id değişmez.
_current_zone_id: contextvars.ContextVar = contextvars.ContextVar("current_zone_id", default=None)


def zone_log_id(zone, idx) -> str:
    return str((zone or {}).get("id") or f"idx{idx}")


@contextlib.contextmanager
def zone_log_context(zone_id):
    token = _current_zone_id.set(zone_id)
    try:
        yield
    finally:
        _current_zone_id.reset(token)


def log_message(msg, level="INFO", zone_id=None):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    zone_id = zone_id or _current_zone_id.get()
    zone_tag = f"[Z:{zone_id}] " if zone_id else ""
    formatted = f"[{timestamp}] [{level}] {zone_tag}{msg}"
    # Bot alt süreci olarak çalışırken stdout zaten err_<id>.log'a gider; burada da
    # print edilirse her satır dosyaya iki kez yazılır. Konsola sadece elle
    # (terminalden) çalıştırıldığında yaz.
    if sys.stdout is not None and sys.stdout.isatty():
        print(formatted)

    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    if LOG_TO_FILE:
        log_file_path = get_err_log_path(account_id)
        try:
            with open(log_file_path, "a", encoding="utf-8") as f:
                f.write(formatted + "\n")
        except Exception:
            pass


def normalize_price(price, symbol, symbol_infos):
    info = symbol_infos.get(symbol)
    if info is None:
        return round(price, 2)
    point = info.point
    if point == 0:
        return price
    return round(round(price / point) * point, info.digits)


def normalize_volume(volume, symbol, symbol_infos):
    info = symbol_infos.get(symbol)
    if info is None:
        return volume
    return snap_volume(volume, info)


def get_current_market_price(mt5, symbol, direction="BUY"):
    if not symbol or mt5 is None:
        return None
    try:
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return None
        return tick.ask if direction == "BUY" else tick.bid
    except Exception as e:
        log_message(f"{symbol} fiyatı alınamadı: {e}", "ERROR")
        return None


def is_market_open(mt5, symbol):
    if not symbol or mt5 is None:
        return False
    term_info = mt5.terminal_info()
    if term_info is None or not getattr(term_info, "connected", False):
        return False

    info = mt5.symbol_info(symbol)
    if info is None or getattr(info, "trade_mode", 0) != 4:
        return False

    tick = mt5.symbol_info_tick(symbol)
    if tick is None or getattr(tick, "time_msc", 0) == 0:
        return False

    return (time.time() * 1000 - tick.time_msc) <= 180000


def determine_fill_mode(mt5, symbol, symbol_infos, filling_mode_dict):
    info = symbol_infos.get(symbol)
    if info is None or mt5 is None:
        return None
    if info.filling_mode & 2:
        filling_mode_dict[symbol] = mt5.ORDER_FILLING_IOC
    elif info.filling_mode & 1:
        filling_mode_dict[symbol] = mt5.ORDER_FILLING_FOK
    else:
        filling_mode_dict[symbol] = mt5.ORDER_FILLING_RETURN
    return filling_mode_dict[symbol]


def get_mt5_timeframe(mt5, tf_str):
    if mt5 is None:
        return 15
    mapping = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1,
    }
    return mapping.get(tf_str, mt5.TIMEFRAME_M15)
