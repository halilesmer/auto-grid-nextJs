# src/core/loop.py
import time
from .state import state
from .wrappers import (
    load_dynamic_settings,
    check_remote_commands_wrapper,
    manage_dynamic_grid,
)
from .reconnection import check_connection_health
from .startup import netting_conflict, run_startup_checks
from src.core.grid_helpers import log_message, is_market_open
from src.core.grid_orders import get_all_robot_orders, cancel_order
from src.core.spread_guard import refresh_spread_guard
from src.utils.turn_log import TurnRecorder


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
    recorder = TurnRecorder(account_id)  # ENG-35: tur telemetrisi (hata turu durdurmaz)

    try:
        while state.is_running:
            turn_start_ms = int(time.time() * 1000)
            turn_t0 = time.perf_counter()

            load_dynamic_settings()
            is_healthy, consecutive_losses = check_connection_health(
                mt5_module, account_id, password, server, consecutive_losses, mt5_path
            )
            if not is_healthy:
                recorder.add(turn_start_ms, (time.perf_counter() - turn_t0) * 1000, "c")
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

            # Uzaktan komutlar bağlantı/hesap kontrolünden SONRA: terminal başka hesaba geçmişse
            # (ACC-11) o hesabın emirleri okunup GRID:STOP vb. ile silinmesin
            try:
                check_remote_commands_wrapper()
            except Exception as e:
                log_message(f"Uzaktan komut okuması başarısız: {e}", "ERROR")

            if state.active_symbols and not any(
                is_market_open(mt5_module, sym) for sym in state.active_symbols
            ):
                refresh_spread_guard(mt5_module, state.zones, state.symbol_infos)
                recorder.add(turn_start_ms, (time.perf_counter() - turn_t0) * 1000, "m")
                time.sleep(state.MARKET_CLOSED_CHECK_INTERVAL)
                continue

            if not state.initial_cleanup_done:
                log_message(
                    "✅ Başlangıç emir koruması aktif. Eski bekleyen emirler silinmedi."
                )
                state.initial_cleanup_done = True

            # Kurgu ayarlarda çalışırken eklenebilir: Netting hesapta turu atla (ENG-01). Bilerek tüm
            # tur: birleşmiş pozisyonda magic'e göre TP/SL ve çıkış başka kurgunun ayarını uygulardı.
            conflict = netting_conflict(state.account_margin_mode, state.zones)
            if conflict:
                if conflict != state.netting_conflict_logged:
                    log_message(
                        f"🚨 {conflict} Robot bu hesapta emir koymuyor ve emir/pozisyon yönetmiyor "
                        "(TP/SL, çıkış) — ayar düzelene kadar.",
                        "ERROR",
                    )
                    state.netting_conflict_logged = conflict
                recorder.add(turn_start_ms, (time.perf_counter() - turn_t0) * 1000, "n")
                time.sleep(state.loop_interval_seconds)
                continue
            state.netting_conflict_logged = None

            pre_ms = (time.perf_counter() - turn_t0) * 1000
            try:
                manage_dynamic_grid()
            except Exception as e:
                log_message(
                    f"🚨 Hata (Crash Koruması): manage_dynamic_grid'de hata: {e}",
                    "ERROR",
                )
            recorder.add(turn_start_ms, (time.perf_counter() - turn_t0) * 1000, "t", pre_ms)

            time.sleep(state.loop_interval_seconds)

    except KeyboardInterrupt:
        log_message("Kullanici tarafindan durduruldu.", "WARN")
    finally:
        recorder.flush()
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
