import time
import json
import os
from src.utils.config import load_settings
from src.utils.paths import (
    get_symbols_path,
    get_ui_state_path,
)
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
from src.core.grid_strategy import (
    get_active_zone as get_active_zone_fn,
    process_zone_commands as process_zone_commands_fn,
    manage_dynamic_grid_logic,
)

LOOP_INTERVAL_SECONDS = 3.0
ZONES = []
ORDER_TYPE = "BUY"
ACTIVE_SYMBOLS = set()
SYMBOL_INFOS = {}

FILLING_MODE = {}
ACTIVE_ZONE = None
ACTIVE_ZONE_IDX = None

IS_RUNNING = False
INITIAL_CLEANUP_DONE = False
CONNECTION_LOST = False
CONSECUTIVE_ERRORS = {}

REMOTE_PAUSED = False
REMOTE_COMMAND_PREFIX = "GRID:"
REMOTE_SIGNAL_STOP_PRICE = 1.0
REMOTE_SIGNAL_START_PRICE = 2.0
REMOTE_SIGNAL_VOLUME = 0.01

active_zones_state = {}

try:
    import MetaTrader5 as mt5  # type: ignore
except ImportError:
    mt5 = None

MARKET_CLOSED_CHECK_INTERVAL = 60
LOG_TO_FILE = True


def get_live_metrics():
    global CONNECTION_LOST
    res = calculate_live_metrics(mt5, ACTIVE_SYMBOLS, CONNECTION_LOST, REMOTE_PAUSED)
    CONNECTION_LOST = res.get("connection_lost", False)
    return res


def load_dynamic_settings():
    global ZONES, LOOP_INTERVAL_SECONDS, ACTIVE_SYMBOLS, SYMBOL_INFOS
    try:
        settings = load_settings("Auto Grid")
        ZONES = settings.get("ZONES", [])
        LOOP_INTERVAL_SECONDS = settings.get("LOOP_INTERVAL_SECONDS", 1.0)
        ACTIVE_SYMBOLS.clear()
        for zone in ZONES:
            if "symbol" in zone and zone["symbol"]:
                ACTIVE_SYMBOLS.add(str(zone["symbol"]).upper().strip())

        for sym in ACTIVE_SYMBOLS:
            if sym not in SYMBOL_INFOS:
                try:
                    mt5.symbol_select(sym, True)
                    info = mt5.symbol_info(sym)
                    if info:
                        SYMBOL_INFOS[sym] = info
                except Exception:
                    pass
    except Exception:
        pass


def get_active_zone():
    return get_active_zone_fn(mt5, ZONES)


def send_pending_order(
    price, lot, tp_price, sl_price=None, zone_idx=0, direction="BUY", symbol=None
):
    return send_pending_order_helper(
        mt5,
        price,
        lot,
        tp_price,
        sl_price,
        zone_idx,
        direction,
        symbol,
        SYMBOL_INFOS,
        CONSECUTIVE_ERRORS,
        active_zones_state,
    )


def process_zone_commands():
    process_zone_commands_fn(ZONES, active_zones_state)


def check_remote_commands_wrapper():
    global REMOTE_PAUSED, ACTIVE_ZONE, ACTIVE_ZONE_IDX
    found, REMOTE_PAUSED, reset_zone = check_remote_commands(mt5, REMOTE_PAUSED, ZONES)
    if reset_zone:
        ACTIVE_ZONE = None
        ACTIVE_ZONE_IDX = None
    return found


def manage_dynamic_grid():
    global ACTIVE_ZONE, ACTIVE_ZONE_IDX
    ok, ACTIVE_ZONE, ACTIVE_ZONE_IDX = manage_dynamic_grid_logic(
        mt5,
        ZONES,
        ACTIVE_ZONE,
        ACTIVE_ZONE_IDX,
        REMOTE_PAUSED,
        SYMBOL_INFOS,
        CONSECUTIVE_ERRORS,
        active_zones_state,
        FILLING_MODE,
    )
    return ok


def run_startup_checks():
    global FILLING_MODE, active_zones_state, CONSECUTIVE_ERRORS
    CONSECUTIVE_ERRORS = {}
    log_message("=" * 60)
    log_message("Çoklu Sembol Grid Robot (AUTO GRID) Baslatiliyor...")
    log_message("=" * 60)

    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    term_info = mt5.terminal_info() if mt5 else None
    if term_info is None or not getattr(term_info, "connected", False):
        log_message("🔴 MT5 bağlantısı koptu! Terminal bilgisi alınamadı.", "ERROR")
        if mt5:
            mt5.shutdown()
        return False

    account_info = mt5.account_info() if mt5 else None
    if account_info is not None:
        log_message(
            f"✅ MT5 bağlantısı canlı doğrulandı (Hesap: {account_info.login}, Sunucu: {account_info.server})"
        )

    try:
        if mt5 and hasattr(mt5, "symbols_get"):
            all_symbols = mt5.symbols_get()
            if all_symbols:
                sym_data = {
                    s.name: {
                        "vol_min": getattr(s, "volume_min", 0.01),
                        "vol_max": getattr(s, "volume_max", 100.0),
                        "vol_step": getattr(s, "volume_step", 0.01),
                        "contract_size": getattr(s, "trade_contract_size", 100000.0),
                        "digits": getattr(s, "digits", 5),
                        "point": getattr(s, "point", 0.00001),
                    }
                    for s in all_symbols
                    if hasattr(s, "name")
                }
                if sym_data:
                    sym_file = get_symbols_path(account_id)
                    tmp_sym = sym_file + ".tmp"
                    with open(tmp_sym, "w", encoding="utf-8") as f:
                        json.dump(sym_data, f)
                    os.replace(tmp_sym, sym_file)
    except Exception as e:
        log_message(f"Sembol listesi güncellenemedi: {e}", "WARN")

    for sym in list(ACTIVE_SYMBOLS):
        if mt5:
            mt5.symbol_select(sym, True)
            info = mt5.symbol_info(sym)
            if info is None or not info.visible:
                log_message(
                    f"🚨 HATA: Sembol ({sym}) aracı kurum sunucusunda bulunamadı!",
                    "ERROR",
                )
                mt5.shutdown()
                return False
            if determine_fill_mode(mt5, sym, SYMBOL_INFOS, FILLING_MODE) is None:
                mt5.shutdown()
                return False

    if ACTIVE_SYMBOLS and not any(is_market_open(mt5, sym) for sym in ACTIVE_SYMBOLS):
        log_message("Piyasalar su anda kapali. Acilmasi bekleniyor...", "WARN")
    else:
        log_message("Aktif piyasalar acik ve isleme hazir.")

    active_zones_state = {}
    robot_positions = get_all_robot_positions(mt5)
    robot_orders = get_all_robot_orders(mt5)
    if robot_positions is None or robot_orders is None:
        log_message(
            "Kritik Hata: MT5'ten veri alınamadı. Bağlantı stabil değil.", "ERROR"
        )
        if mt5:
            mt5.shutdown()
        return False

    for item in robot_positions + robot_orders:
        active_zones_state[item.magic - BASE_MAGIC_NUMBER - 1] = "START"

    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            os.remove(ui_states_file)
        except Exception:
            pass

    log_message("Tum baslangic kontrolleri basarili!")
    return True


def _reconnect_mt5(account_id, password, server, max_retries=3, base_delay=2):
    """Attempt to reconnect to MT5 with exponential backoff."""
    for attempt in range(max_retries):
        if mt5.initialize():
            if mt5.login(account_id, str(password), str(server)):
                time.sleep(1.0)
                account_info = mt5.account_info()
                if account_info is not None:
                    return True
        last_err = mt5.last_error()
        err_code = last_err[0] if last_err else 0
        if err_code in (-10005, -10003, -10004, 1002, 2):
            delay = base_delay * (2 ** attempt)
            log_message(f"MT5 yeniden bağlanma denemesi {attempt + 1}/{max_retries} başarısız, {delay}s bekleniyor...", "WARN")
            time.sleep(delay)
            continue
        break
    return False


def main_loop():
    global IS_RUNNING, INITIAL_CLEANUP_DONE, CONNECTION_LOST
    load_dynamic_settings()

    if not run_startup_checks():
        log_message("Baslangic kontrolleri basarisiz. Robot durduruluyor.", "ERROR")
        time.sleep(10)
        return

    log_message("Robot calismaya basladi. (Durdurmak icin Ctrl+C)")

    account_id = int(os.environ.get("ACTIVE_ACCOUNT_ID", "0"))
    account_config = load_settings("Auto Grid")
    password = account_config.get("password", "")
    server = account_config.get("server", "")

    consecutive_connection_losses = 0
    max_consecutive_losses = 3

    try:
        while IS_RUNNING:
            load_dynamic_settings()
            try:
                check_remote_commands_wrapper()
            except Exception as e:
                log_message(f"Uzaktan komut okuması başarısız: {e}", "ERROR")

            term_info = mt5.terminal_info() if mt5 else None
            if (
                term_info is None
                or not getattr(term_info, "connected", False)
                or not getattr(term_info, "trade_allowed", False)
            ):
                if (
                    term_info is None or not getattr(term_info, "connected", False)
                ) and not CONNECTION_LOST:
                    CONNECTION_LOST = True
                    log_message("🚨 KRİTİK: MT5 BAĞLANTISI KOPTU!", "ERROR")

                if account_id > 0 and password and server:
                    log_message("MT5 yeniden bağlanma deneniyor...", "WARN")
                    if _reconnect_mt5(account_id, password, server):
                        CONNECTION_LOST = False
                        consecutive_connection_losses = 0
                        log_message("✅ MT5 bağlantısı yeniden kuruldu. Robot çalışmaya devam ediyor.", "WARN")
                        continue
                    else:
                        consecutive_connection_losses += 1
                        log_message(f"MT5 yeniden bağlanma başarısız ({consecutive_connection_losses}/{max_consecutive_losses})", "ERROR")
                        if consecutive_connection_losses >= max_consecutive_losses:
                            log_message("⛔ Maksimum yeniden bağlanma denemesi aşıldı. Robot durduruluyor.", "ERROR")
                            break
                time.sleep(10)
                continue
            else:
                if CONNECTION_LOST:
                    CONNECTION_LOST = False
                    consecutive_connection_losses = 0
                    log_message(
                        "✅ MT5 bağlantısı geri geldi. Robot çalışmaya devam ediyor.",
                        "WARN",
                    )

            if ACTIVE_SYMBOLS and not any(
                is_market_open(mt5, sym) for sym in ACTIVE_SYMBOLS
            ):
                time.sleep(MARKET_CLOSED_CHECK_INTERVAL)
                continue

            if not INITIAL_CLEANUP_DONE:
                log_message(
                    "✅ Başlangıç emir koruması aktif. Eski bekleyen emirler silinmedi."
                )
                INITIAL_CLEANUP_DONE = True

            try:
                manage_dynamic_grid()
            except Exception as e:
                log_message(
                    f"🚨 Hata (Crash Koruması): manage_dynamic_grid'de hata: {e}",
                    "ERROR",
                )

            time.sleep(LOOP_INTERVAL_SECONDS)

    except KeyboardInterrupt:
        log_message("Kullanici tarafindan durduruldu.", "WARN")
    finally:
        log_message("🛑 Robot durduruldu. Bekleyen nöbetçi emirler temizleniyor.")
        eski_emirler = get_all_robot_orders(mt5)
        if eski_emirler:
            for emir in eski_emirler:
                cancel_order(mt5, emir)
        if mt5:
            mt5.shutdown()


if __name__ == "__main__":
    main_loop()
