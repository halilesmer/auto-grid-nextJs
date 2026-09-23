# src/core/startup.py
import os
import json
import time
from .state import state
from .wrappers import load_dynamic_settings
from src.utils.paths import get_symbols_path, get_ui_state_path, get_metrics_path
from src.core.grid_helpers import log_message, is_market_open, determine_fill_mode
from src.core.grid_orders import get_all_robot_orders, get_all_robot_positions, BASE_MAGIC_NUMBER


def _write_startup_error(account_id, message):
    """Başlangıç hatasını metrik dosyasına yazar ki arayüz kullanıcıya gösterebilsin."""
    try:
        metrics_file = get_metrics_path(account_id)
        if os.path.exists(metrics_file):
            with open(metrics_file, "r", encoding="utf-8") as f:
                metrics_data = json.load(f)
            metrics_data["startup_error"] = message
            tmp_metrics_file = metrics_file + ".tmp"
            with open(tmp_metrics_file, "w", encoding="utf-8") as f:
                json.dump(metrics_data, f)
            os.replace(tmp_metrics_file, metrics_file)
    except Exception:
        pass


def run_startup_checks(mt5_module) -> bool:
    state.consecutive_errors.clear()
    log_message("=" * 60)
    log_message("Çoklu Sembol Grid Robot (AUTO GRID) Baslatiliyor...")
    log_message("=" * 60)

    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    term_info = mt5_module.terminal_info() if mt5_module else None
    if term_info is None or not getattr(term_info, "connected", False):
        log_message("🔴 MT5 bağlantısı koptu! Terminal bilgisi alınamadı.", "ERROR")
        if mt5_module:
            mt5_module.shutdown()
        return False

    account_info = mt5_module.account_info() if mt5_module else None
    if account_info is not None:
        log_message(
            f"✅ MT5 bağlantısı canlı doğrulandı (Hesap: {account_info.login}, Sunucu: {account_info.server})"
        )
    else:
        log_message(
            "⚠️ Hesap bilgisi alınamadı ama terminal bağlı. Devam ediliyor...",
            "WARN",
        )

    try:
        if mt5_module and hasattr(mt5_module, "symbols_get"):
            all_symbols = mt5_module.symbols_get()
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

    for sym in list(state.active_symbols):
        if mt5_module:
            mt5_module.symbol_select(sym, True)
            info = mt5_module.symbol_info(sym)
            if info is None or not info.visible:
                log_message(
                    f"🚨 HATA: Sembol ({sym}) aracı kurum sunucusunda bulunamadı!",
                    "ERROR",
                )
                log_message(
                    "Lütfen arayüze girdiğiniz sembol adının brokerınızla aynı olduğundan emin olun.",
                    "ERROR",
                )
                _write_startup_error(account_id, f"Sembol hatası: {sym} piyasa izleminde yok.")
                mt5_module.shutdown()
                return False
            if determine_fill_mode(mt5_module, sym, state.symbol_infos, state.filling_mode) is None:
                mt5_module.shutdown()
                return False

    if state.active_symbols and not any(is_market_open(mt5_module, sym) for sym in state.active_symbols):
        log_message("Piyasalar su anda kapali. Acilmasi bekleniyor...", "WARN")
    else:
        log_message("Aktif piyasalar acik ve isleme hazir.")

    state.active_zones_state = {}
    robot_positions = get_all_robot_positions(mt5_module)
    robot_orders = get_all_robot_orders(mt5_module)
    if robot_positions is None or robot_orders is None:
        log_message(
            "Kritik Hata: MT5'ten veri alınamadı. Bağlantı stabil değil.", "ERROR"
        )
        if mt5_module:
            mt5_module.shutdown()
        return False

    for item in robot_positions + robot_orders:
        state.active_zones_state[item.magic - BASE_MAGIC_NUMBER - 1] = "START"

    if state.active_zones_state:
        log_message(
            f"🧠 Hafıza Kurtarıldı: Aktif bölgeler: {list(state.active_zones_state.keys())}"
        )

    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            os.remove(ui_states_file)
            log_message(
                "🛡️ Güvenlik Koruması: Arayüzden kalan eski temizlik komutları (ui_states) silindi."
            )
        except Exception:
            pass

    log_message("Tum baslangic kontrolleri basarili!")
    return True


def _reconnect_mt5(mt5_module, account_id, password, server, max_retries=3, base_delay=2, mt5_path=None):
    # İlk bağlantıyla aynı terminale bağlan (birden fazla MT5 kuruluysa varsayılan yanlış olabilir)
    init_kwargs = {"path": os.path.normpath(mt5_path)} if mt5_path and os.path.exists(mt5_path) else {}
    for attempt in range(max_retries):
        if mt5_module.initialize(**init_kwargs):
            if mt5_module.login(account_id, str(password), str(server)):
                time.sleep(1.0)
                account_info = mt5_module.account_info()
                if account_info is not None:
                    return True
        last_err = mt5_module.last_error()
        err_code = last_err[0] if last_err else 0
        if err_code in (-10005, -10003, -10004, 1002, 2):
            delay = base_delay * (2 ** attempt)
            log_message(f"MT5 yeniden bağlanma denemesi {attempt + 1}/{max_retries} başarısız, {delay}s bekleniyor...", "WARN")
            time.sleep(delay)
            continue
        break
    return False