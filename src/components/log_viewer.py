# src/components/log_viewer.py
import streamlit as st
import os
import glob
from collections import deque

# 🌟 YENİ: Merkezi yol yöneticisi
from src.utils.paths import get_err_log_path

# 🔍 DONMA TEŞHİSİ: Fragment çalıştırmalarının süresini profille (run_every nedeniyle sürekli koşar)
from src.utils.profiler import stage

MAX_LINES = 20  # Ekranda gösterilecek son satır sayısı
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB Limit


def get_recent_logs(account_id: str):
    """Robotun (Subprocess) o hesaba özel ürettiği logları okur."""
    # YENİ: Artık tek bir global dosya yerine, bu hesaba özel dosyayı okuyoruz!
    log_file = get_err_log_path(account_id)

    if not os.path.exists(log_file):
        return "Henüz bu hesap için robot log kaydı bulunmuyor..."

    if os.path.getsize(log_file) > MAX_FILE_SIZE:
        try:
            with open(log_file, "w", encoding="utf-8") as f:
                f.write("[SİSTEM KORUMASI] Dosya çok büyüdüğü için temizlendi.\n")
        except Exception:
            pass

    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            # 🌟 YENİ: Önce filtrele, filtreden geçen son 20 satırı deque ile tut
            filtered_lines = deque(maxlen=MAX_LINES)
            keywords = [
                "[ERROR]",
                "Girildi",
                "gönderiliyor",
                "yerleştirildi",
                "temizlendi",
                "Sınır aşıldığı",
            ]

            for line in f:
                if any(kw in line for kw in keywords):
                    filtered_lines.append(line)

            if not filtered_lines:
                return "Filtrelenmiş kriterlere uygun (Hata veya İşleme Giriş) bir kayıt henüz yok."

            return "".join(filtered_lines)
    except Exception as e:
        return f"[HATA] Loglar okunamadı: {e}"


def get_latest_mt5_log(account_id: str):
    """MT5'in kendi orijinal günlük sistem logunu bulur ve hesaba (login) göre okur."""
    mt5_log_dir = os.path.expanduser(
        "~\\AppData\\Roaming\\MetaQuotes\\Terminal\\*\\Logs"
    )
    log_files = glob.glob(os.path.join(mt5_log_dir, "*.log"))

    if not log_files:
        return "Windows/MT5 orijinal log dosyası henüz bulunamadı."

    # Tüm log dosyalarını tarayarak, içinde account_id geçeni bul
    # (En güncelden eskiye doğru sıralı)
    log_files.sort(key=os.path.getmtime, reverse=True)

    target_log_file = None
    for file_path in log_files:
        try:
            # MT5 logları UTF-16 formatında tutar
            with open(file_path, "r", encoding="utf-16", errors="ignore") as f:
                # MT5 loglarında genellikle ilk birkaç satırda "login" veya "Account" geçer
                # veya hesap işlemlerini logladığında account_id barındırır.
                content = f.read()
                if account_id in content:
                    target_log_file = file_path
                    break
        except Exception:
            continue

    if not target_log_file:
        return f"Orijinal MT5 loglarında {account_id} numaralı hesap ile eşleşen bir kayıt bulunamadı (Loglar karışmış olabilir)."

    try:
        with open(target_log_file, "r", encoding="utf-16", errors="ignore") as f:
            lines = deque(f, maxlen=15)
            return "".join(lines)
    except Exception as e:
        return f"MT5 Log okuma hatası: {e}"


@st.fragment(run_every=10)
def render_log_viewer(account_id: str = "default"):
    """Canlı Log Ekranı Bileşeni (Sekmeli Görünüm)"""
    st.subheader("📟 Sistem ve Terminal Logları")

    # İki farklı sekme oluşturuyoruz
    tab1, tab2 = st.tabs(["🤖 Robot Logları", "🏦 Orijinal MT5 Logları"])

    with tab1:
        st.caption(f"{account_id} hesabının arka plan işlemlerinin son 20 adımı.")
        # YENİ: account_id parametresini fonksiyona gönderiyoruz
        logs = get_recent_logs(account_id)
        st.code(logs, language="bash")
    stage("Frag: Robot log okuma")

    with tab2:
        st.caption(
            "MetaTrader 5 terminalinin arka planda ürettiği orijinal sistem kayıtları."
        )
        mt5_logs = get_latest_mt5_log(account_id)
        st.code(mt5_logs, language="bash")
    stage("Frag: MT5 log okuma")
