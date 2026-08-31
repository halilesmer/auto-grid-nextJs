# src/core/bot_runner.py
import sys
import os
import json
import time
import io
from pathlib import Path

# Zwingt die Windows-Konsole dazu, UTF-8 (inkl. türkischer Zeichen) zu akzeptieren!
# Zwingt die Windows-Konsole dazu, UTF-8 zu akzeptieren UND sofort auf die Festplatte zu schreiben (Live-Modus)
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer,
        encoding="utf-8",
        errors="replace",
        line_buffering=True,
        write_through=True,
    )
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer,
        encoding="utf-8",
        errors="replace",
        line_buffering=True,
        write_through=True,
    )

# Proje kök dizinini Python yoluna ekle ki 'src' klasöründeki modülleri bulabilelim
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

from src.utils.mt5_connection import connect_to_mt5_with_timeout

# 🌟 YENİ: Merkezi yol yöneticisini içeri aktarıyoruz
from src.utils.paths import get_metrics_path, get_ui_state_path

# 🌟 YENİ: MT5 "Source of Truth" senkronizasyonu ve kalıcı state dosyası
from src.utils.state_manager import build_synced_state, save_state

def export_metrics_step(bot_engine, account_id):
    """Ana döngüye (main thread) entegre metrik dışa aktarıcı. Threading çökmesini engeller."""
    metrics_file = get_metrics_path(account_id)

    if hasattr(bot_engine, "get_live_metrics"):
        try:
            metrics = bot_engine.get_live_metrics()
            tmp_metrics_file = metrics_file + ".tmp"
            with open(tmp_metrics_file, "w", encoding="utf-8") as f:
                json.dump(metrics, f)
            os.replace(tmp_metrics_file, metrics_file)
        except Exception:
            pass


def main():
    # 1. Yöneticiden (bot_manager) gelen argümanları al
    if len(sys.argv) < 3:
        print("Kritik Hata: account_id veya engine_name argümanları eksik.")
        sys.exit(1)

    account_id = sys.argv[1]
    engine_name = sys.argv[2]

    # Kilit Nokta: config.py'nin Streamlit olmadan da hangi hesapta olduğunu bilmesi için
    # İşletim Sistemi ortam değişkenlerine hesap ID'sini kazıyoruz!
    os.environ["ACTIVE_ACCOUNT_ID"] = account_id

    print(f"[{account_id}] Isci Surec (Subprocess) baslatiliyor. Motor: {engine_name}")

    # 2. Hesabı JSON'dan bul (Tam izolasyon)
    accounts_path = os.path.join(project_root, "configs", "accounts.json")
    try:
        with open(accounts_path, "r", encoding="utf-8") as f:
            accounts_data = json.load(f)
            # JSON formatına göre listeyi ayıkla
            if isinstance(accounts_data, list):
                accounts = accounts_data
            else:
                accounts = accounts_data.get("accounts", [])
    except Exception as e:
        print(f"Hesaplar dosyası okunamadı: {e}")
        sys.exit(1)

    # Parametre olarak gelen ID'ye sahip hesabı bul
    active_account = next(
        (acc for acc in accounts if str(acc.get("login")) == account_id), None
    )
    if not active_account:
        print(f"Hata: {account_id} ID'li hesap accounts.json içinde bulunamadı.")
        sys.exit(1)

    # 3. İstenen ticaret motorunu yükle
    if engine_name == "Auto Grid":
        import src.core.auto_grid_engine as bot_engine
    else:
        print(f"Hata: Bilinmeyen motor ismi ({engine_name})")
        sys.exit(1)

    # 4. Eski (önceki çalışmadan kalma) metrik dosyasını temizle.
    #    Bayat startup_error veya mt5_connected=False verisi yeni bağlantıyı
    #    yanıltmasın diye dosyayı baştan sıfırlıyoruz.
    try:
        metrics_file = get_metrics_path(account_id)
        if os.path.exists(metrics_file):
            os.remove(metrics_file)
    except Exception:
        pass

    # 5. SADECE bu hesaba özel MT5 Terminaline bağlan
    # Eski serbest logları bir kereye mahsus hesap klasörüne taşı
    try:
        from src.utils.paths import migrate_orphan_logs

        migrate_orphan_logs(account_id)
    except Exception:
        pass

    print(f"[{account_id}] MT5 Terminaline bağlanılıyor...")
    # 🌟 ZAMAN AŞIMI KORUMASI: MT5 açılamazsa alt süreç de sessizce asılı kalmasın!
    # 🌟 timeout=120sn: mt5.initialize iç timeout'u (120sn) ile eşleşir, ilk bağlantı sembol indirimi için yeterli
    connection_success, connection_timed_out, connection_error = connect_to_mt5_with_timeout(
        active_account, timeout=120
    )
    if not connection_success:
        print(
            f"Hata: {account_id} için MetaTrader 5'e bağlanılamadı. Süreç sonlandırılıyor."
        )
        if connection_timed_out:
            startup_error_msg = connection_error if connection_error else (
                "[ZAMAN AŞIMI] MT5 terminali 120 saniye içinde açılamadı veya sunucuya ulaşılamadı."
            )
        elif connection_error:
            startup_error_msg = connection_error
        else:
            startup_error_msg = (
                "[BİLİNMEYEN] MT5 terminaline giriş yapılamadı. Hesap bilgilerini ve terminal ayarlarını kontrol edin."
            )
        # 🔴 BAĞLANTI HATASINI ARAYÜZE İLET (Kalıcı hata afişi için)
        #    Süreç kapanıyor ama arayüz bu dosyayı okuyup net hata gösterebilecek.
        try:
            metrics_file = get_metrics_path(account_id)
            tmp_metrics_file = metrics_file + ".tmp"
            with open(tmp_metrics_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "profit": 0.0,
                        "open_positions": 0,
                        "pending_orders": 0,
                        "current_price": 0.0,
                        "algo_trading_error": False,
                        "remote_paused": False,
                        "mt5_connected": False,
                        "startup_error": startup_error_msg,
                    },
                    f,
                )
            os.replace(tmp_metrics_file, metrics_file)
        except Exception:
            pass
        sys.exit(1)

    print(f"[{account_id}] MT5 Bağlantısı Başarılı! Robot döngüsü başlıyor...")

    # 🌟 Bağlantı başarılı olur olmaz dashboard'a hemen bildir.
    #    Metrik dosyasına mt5_connected=True yazarak "Bağlanıyor..." mesajının
    #    hızlıca geçmesini ve yeşil "Bağlandı" durumuna dönülmesini sağlar.
    try:
        metrics_file = get_metrics_path(account_id)
        tmp_metrics_file = metrics_file + ".tmp"
        with open(tmp_metrics_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "profit": 0.0,
                    "open_positions": 0,
                    "pending_orders": 0,
                    "current_price": 0.0,
                    "algo_trading_error": False,
                    "remote_paused": False,
                    "mt5_connected": True,
                    "startup_error": None,
                },
                f,
            )
        os.replace(tmp_metrics_file, metrics_file)
    except Exception:
        pass

    # 🚨 ESKİ PANİK MANTIĞI KALDIRILDI:
    #   Port değişimi / arayüz restart'ı / bilgisayar taşınması sonrası
    #   açık pozisyonlar ve bekleyen emirler ASLA kapatılmaz.

    # 🧠 PHASE 2: MT5 "Source of Truth" senkronizasyonu ve SAKİN BAŞLANGIÇ
    # YENİ AKIŞ: Bot arka planda çalışmaya başlarken varsayılan olarak PAUSE (Beklet) moduna geçer.
    # Arayüz (app.py) "Başlat" diyene kadar sembol kontrolü veya işlem yapmaz.
    try:
        # Arayüze "Ben PAUSE durumundayım" bilgisini yaz (motor_start gelene kadar beklesin)
        ui_file = get_ui_state_path(account_id)
        if os.path.exists(ui_file):
            with open(ui_file, "r", encoding="utf-8") as f:
                ui_states = json.load(f)
            # Tüm bölgeleri beklemeye zorla
            for k in ui_states:
                ui_states[k] = "PAUSE"
            tmp_ui_file = ui_file + ".tmp"
            with open(tmp_ui_file, "w", encoding="utf-8") as f:
                json.dump(ui_states, f)
            os.replace(tmp_ui_file, ui_file)

        # Synced state inşası (sembol hatalıysa çökmeyi önlemek için güvenli sarmalayıcı ile)
        synced_state = build_synced_state(bot_engine, account_id, log_func=print)
        save_state(account_id, synced_state)
        print(
            f"[{account_id}] Kalıcı state dosyası yeniden inşa edildi (Bekleme Modunda): "
            f"data/state_{account_id}.json"
        )
    except Exception as e:
        # Sembol hatalı olduğu için build_synced_state patlasa bile backend'i canlı tutuyoruz!
        print(
            f"[{account_id}] Başlangıç senkronizasyonu atlandı "
            f"(Arayüz sembolleri güncelleyene kadar bot uykuda kalacak): {e}"
        )

    # İşlem öncesi motorun hafızasının tamamen temiz olduğundan emin ol
    bot_engine.IS_RUNNING = True
    if hasattr(bot_engine, "INITIAL_CLEANUP_DONE"):
        bot_engine.INITIAL_CLEANUP_DONE = False

    # 5. Metrikleri ana döngüye (main thread) bağla (Threading MT5'i çökertir!)
    original_sleep = bot_engine.time.sleep

    def hooked_sleep(secs):
        export_metrics_step(bot_engine, account_id)
        original_sleep(secs)

    bot_engine.time.sleep = hooked_sleep

    # 6. Asıl Robot Döngüsünü başlat (Bu fonksiyon sonsuz döngüdür, süreci hayatta tutar)
    try:
        bot_engine.main_loop()
    except KeyboardInterrupt:
        print(f"[{account_id}] Süreç dışarıdan durduruldu (Graceful Shutdown).")
    except Exception as e:
        import traceback

        print(f"[{account_id}] KRİTİK HATA: Çekirdek döngü çöktü! Hata: {e}")
        traceback.print_exc()
        # Zombi spam döngüsünü kırmak ve diski korumak için 10 saniye fren yapıyoruz
        bot_engine.time.sleep(10)
    finally:
        bot_engine.IS_RUNNING = False
        # 🧠 Kapanış anında son durumu MT5'ten çekip state dosyasına yaz (boş da olsa)
        try:
            final_state = build_synced_state(bot_engine, account_id, log_func=print)
            save_state(account_id, final_state)
        except Exception:
            pass
        print(f"[{account_id}] MT5 Bağlantısı kesiliyor ve süreç kapatılıyor.")


if __name__ == "__main__":
    main()
