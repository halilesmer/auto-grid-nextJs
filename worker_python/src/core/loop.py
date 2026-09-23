# src/core/loop.py
import time
from .state import state
from .wrappers import (
    load_dynamic_settings,
    check_remote_commands_wrapper,
    manage_dynamic_grid,
)
from .reconnection import check_connection_health
from .startup import run_startup_checks
from src.core.grid_helpers import log_message, is_market_open
from src.core.grid_orders import get_all_robot_orders, cancel_order


def main_loop(mt5_module, account_id, password, server, mt5_path=None):
    load_dynamic_settings()

    if not run_startup_checks(mt5_module):
        log_message("Baslangic kontrolleri basarisiz. Robot durduruluyor.", "ERROR")
        time.sleep(10)
        return

    log_message("Robot calismaya basladi. (Durdurmak icin Ctrl+C)")
    state.is_running = True

    consecutive_losses = 0
    max_losses = 3

    try:
        while state.is_running:
            load_dynamic_settings()
            try:
                check_remote_commands_wrapper()
            except Exception as e:
                log_message(f"Uzaktan komut okuması başarısız: {e}", "ERROR")

            is_healthy, consecutive_losses = check_connection_health(
                mt5_module, account_id, password, server, consecutive_losses, mt5_path
            )
            if not is_healthy:
                # Süreç kapanmaz: terminal/sunucu geri gelince (ör. hafta sonu bakımı)
                # robot kendiliğinden devam eder. Birkaç başarısız denemeden sonra
                # terminali login denemeleriyle boğmamak için daha seyrek dene.
                if consecutive_losses == max_losses:
                    log_message(
                        f"MT5 bağlantısı {max_losses} denemede kurulamadı. "
                        "60 sn aralıklarla denemeye devam ediliyor (arayüzden Restart/Stop mümkün).",
                        "ERROR",
                    )
                time.sleep(10 if consecutive_losses < max_losses else 60)
                continue

            if state.active_symbols and not any(
                is_market_open(mt5_module, sym) for sym in state.active_symbols
            ):
                time.sleep(state.MARKET_CLOSED_CHECK_INTERVAL)
                continue

            if not state.initial_cleanup_done:
                log_message(
                    "✅ Başlangıç emir koruması aktif. Eski bekleyen emirler silinmedi."
                )
                state.initial_cleanup_done = True

            try:
                manage_dynamic_grid()
            except Exception as e:
                log_message(
                    f"🚨 Hata (Crash Koruması): manage_dynamic_grid'de hata: {e}",
                    "ERROR",
                )

            time.sleep(state.loop_interval_seconds)

    except KeyboardInterrupt:
        log_message("Kullanici tarafindan durduruldu.", "WARN")
    finally:
        _cleanup(mt5_module)


def _cleanup(mt5_module):
    log_message("🛑 Robot durduruldu. Bekleyen nöbetçi emirler temizleniyor.")
    eski_emirler = get_all_robot_orders(mt5_module)
    if eski_emirler:
        for emir in eski_emirler:
            cancel_order(mt5_module, emir)
    if mt5_module:
        mt5_module.shutdown()
    state.is_running = False