# app.py

import sys
import os
import json
from pathlib import Path
import platform
import time
import socket
import streamlit as st

from src.components.dialogs import confirm_system_shutdown_dialog

def get_current_version():
    """VERSION dosyasından en güncel sürüm numarasını okur."""
    version_file = Path(__file__).parent / "VERSION"
    if os.path.exists(version_file):
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    return "v1.0.0"  # Varsayılan başlangıç sürümü


# ==========================================
# 1. YOL AYARLARI (Python'a src klasörünü gösteriyoruz - EN ÜSTTE OLMALI)
# ==========================================
sys.path.append(str(Path(__file__).parent / "src"))


# ==========================================
# 2. ORTAM VE SAYFA AYARI (İLK STREAMLIT KOMUTU)
# ==========================================
env = os.getenv("ROBOT_ENV", "TEST").upper()

if env == "LIVE":
    PAGE_TITLE = f"🔴 [LIVE] Grid Robot Control ({get_current_version()})"
    PAGE_ICON = "🔴"
else:
    PAGE_TITLE = f"🧪 [TEST] Grid Robot Control ({get_current_version()})"
    PAGE_ICON = "🧪"

st.set_page_config(page_title=PAGE_TITLE, page_icon=PAGE_ICON, layout="wide")


# ==========================================
# 3. KENDİ MODÜLLERİMİZİ İÇE AKTARMA
# ==========================================
from src.utils.bot_manager import (
    is_bot_running,
    start_bot_process,
    stop_bot_process,
)
from src.components.account_selector import render_account_selector
from src.components.chart_viewer import render_chart
from src.components.dialogs import confirm_stop_motor_dialog, symbol_error_dialog
from src.utils.mt5_connection import (
    connect_to_mt5_with_timeout,
    shutdown_mt5,
)
from src.components.header import render_main_title
from src.components.settings_panel import render_settings_panel
from src.components.log_viewer import render_log_viewer
from src.components.metrics import render_global_metrics
from src.styles.custom_css import apply_custom_css
from src.utils.config import load_settings, save_settings

# 🌟 YENİ: Merkezi yol yöneticisi
from src.utils.paths import (
    get_metrics_path,
    get_sim_price_path,
    get_ui_state_path,
    get_symbols_path,
)
from src.ui.pwa_installer import inject_pwa_code
from src.utils.self_updater import (
    execute_git_pull,
    check_for_updates,
)

import src.core.auto_grid_engine as bot_engine

# 🔍 DONMA TEŞHİSİ (Sistem performansını artırmak ve log şişmesini önlemek için tamamen susturuldu)
def run_start(*args, **kwargs):
    pass


def stage(*args, **kwargs):
    pass


# 🌟 PWA kodunu enjekte et (manifest + service worker)
inject_pwa_code()


# ==========================================
# SİSTEM YÖNETİCİSİ (PWA + SELF-UPDATE) - ANA EKRAN
# ==========================================
# ==========================================
# GÜNCELLEME MODALI (DİALOG)
# ==========================================
@st.dialog("🔄 Güncelleme Kontrolü")
def show_update_dialog(env_name, target_branch):
    with st.spinner("GitHub ile versiyon kimlikleri karşılaştırılıyor..."):
        success, update_data = check_for_updates(branch=target_branch)

    if not success:
        st.error(f"Bağlantı Hatası: {update_data}")
        if st.button("Kapat", use_container_width=True):
            st.rerun()
        return

    has_update, local_ver, remote_ver = update_data

    if has_update:
        st.info(
            f"🚀 **Yeni bir güncelleme mevcut!**\n\n📌 **Lokal Sürüm:** `{local_ver}`\n🚀 **Yeni Sürüm:** `{remote_ver}`"
        )
        col1, col2 = st.columns(2)
        if col1.button("Şimdi Güncelle", type="primary", use_container_width=True):
            with st.spinner("Güncelleme indiriliyor..."):
                pull_success, message = execute_git_pull(branch=target_branch)
                if pull_success:
                    st.session_state["update_success_msg"] = message
                    # 🛡️ Sürüm hafızasını sil ki rerun sonrası yeni sürümü okusun!
                    if "initial_update_check" in st.session_state:
                        del st.session_state["initial_update_check"]
                    st.rerun()
                else:
                    st.error(message)
        if col2.button("İptal", use_container_width=True):
            st.rerun()
    else:
        st.warning(
            f"Sürümünüz Güncel!\n\n📌 **Lokal Sürüm:** `{local_ver}`\n🚀 **Sunucu Sürümü:** `{remote_ver}`\n\nYine de zorla güncellemek ister misiniz?"
        )
        col1, col2 = st.columns(2)
        if col1.button("Evet", type="primary", use_container_width=True):
            with st.spinner("Zorla güncelleniyor..."):
                pull_success, message = execute_git_pull(branch=target_branch)
                if pull_success:
                    st.session_state["update_success_msg"] = message
                    # 🛡️ Sürüm hafızasını sil ki rerun sonrası yeni sürümü okusun!
                    if "initial_update_check" in st.session_state:
                        del st.session_state["initial_update_check"]
                    st.rerun()
                else:
                    st.error(message)
        if col2.button("Hayır", use_container_width=True):
            st.rerun()


def get_local_ip():
    """Makinenin yerel ağdaki IP adresini döndürür."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "Bilinmiyor"


# ==========================================
# MT5 BAĞLANTI MODALI (DONMAYI ENGELLEYEN ASİSTAN)
# ==========================================
@st.dialog("🔌 MT5 Bağlantı Asistanı")
def show_mt5_connect_dialog(account_info, acc_id):
    st.info("MetaTrader 5 terminali açılıyor ve giriş yapılıyor...")
    with st.spinner(
        "Otomatik giriş tamamlanıyor (Lütfen bekleyin, Zaman aşımı: 90sn)..."
    ):
        connection_success, connection_timed_out, connection_error = connect_to_mt5_with_timeout(
            account_info, timeout=90
        )

    if connection_success:
        shutdown_mt5()
        if start_bot_process(acc_id, "Auto Grid"):
            st.session_state[f"bot_started_at_{acc_id}"] = time.time()
            st.toast(
                f"🚀 {account_info['account_name']} için robot başlatıldı!", icon="✅"
            )
            st.rerun()
        else:
            st.error("🔴 Robot başlatılamadı! Log kayıtlarını inceleyin.")
    else:
        if connection_timed_out:
            st.error(
                f"🔴 **ZAMAN AŞIMI:** {connection_error if connection_error else 'MT5 terminaline 90 saniye içinde ulaşılamadı.'}"
            )
        else:
            error_display = connection_error if connection_error else (
                "🔴 **BAĞLANTI HATASI:** Giriş bilgileri hatalı veya Algo Trading kapalı."
            )
            st.error(error_display)

        col1, col2 = st.columns(2)
        if col1.button("🔄 Tekrar Bağlan", type="primary", use_container_width=True):
            st.session_state[f"motor_toggle_{acc_id}"] = True
            st.rerun()
        if col2.button("❌ İptal", use_container_width=True):
            st.rerun()


def get_live_metrics_from_file(account_id):
    """Liest die aktuellsten Metriken des Subprozesses aus der JSON-Datei."""
    metrics_file = get_metrics_path(account_id)
    if os.path.exists(metrics_file):
        try:
            with open(metrics_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            age = time.time() - os.path.getmtime(metrics_file)
            data.setdefault("mt5_connected", False)
            data.setdefault("startup_error", None)
            data.setdefault("market_open", False)
            data["data_age"] = age

            # 🛠️ DÜZELTME: Bağlantı kurulduysa veya eski hata afişi 30 sn'den eskiyse temizle
            if data.get("mt5_connected", False) or (
                data.get("startup_error") and age > 30
            ):
                data["startup_error"] = None
            return data
        except Exception:
            pass  # Wenn die Datei exakt in dieser Millisekunde geschrieben wird
    return {
        "profit": 0.0,
        "open_positions": 0,
        "pending_orders": 0,
        "current_price": 0.0,
        "algo_trading_error": False,
        "remote_paused": False,
        "mt5_connected": False,
        "startup_error": None,
        "market_open": False,
        "data_age": 999.0,
    }


# ==========================================
# 1. STREAMLIT CONFIG & CSS
# ==========================================
apply_custom_css()

# ==========================================
# 🌟 YENİ: BAŞLIK VE SİSTEM YÖNETİCİSİ AYNI SATIRDA
# ==========================================
header_col1, header_col2 = st.columns([0.85, 0.15], vertical_alignment="center")

with header_col1:
    render_main_title()

with header_col2:
    with st.popover("⚙️ Sistem Ayarları", use_container_width=True):
        port_num = os.getenv("STREAMLIT_PORT", "8501")
        local_ip = get_local_ip()

        st.markdown("##### 💻 Sistem Bilgileri")
        st.caption(f"**Host Makine:** {platform.node()}")
        st.caption(f"**İşletim Sistemi:** {platform.system()} {platform.release()}")
        st.caption(f"**Yerel IP (Ağ):** {local_ip}")

        st.divider()

        st.markdown("##### 🔗 Erişim Adresleri")
        st.caption(
            f"**Aynı Cihazdan (Local):** [http://localhost:{port_num}](http://localhost:{port_num})"
        )
        st.caption(
            f"**Ağ Üzerinden (Mobil/PC):** [http://{local_ip}:{port_num}](http://{local_ip}:{port_num})"
        )

        st.divider()

        st.markdown("##### 🌍 Çalışma Ortamı")
        st.caption(
            f"**Ortam:** {env} | **Port:** {port_num} | **Dal (Branch):** {'master' if env == 'LIVE' else 'test'}"
        )

        if st.button("🔄 Güncellemeleri Denetle", use_container_width=True):
            target_branch = "master" if env == "LIVE" else "test"
            show_update_dialog(env, target_branch)

        st.divider()

        if st.button(
            "🔌 Sistemi Tamamen Kapat", type="primary", use_container_width=True
        ):
            confirm_system_shutdown_dialog()

if "update_success_msg" in st.session_state:
    st.toast("✅ Uygulama başarıyla güncellendi!", icon="🚀")
    try:
        os.makedirs("logs", exist_ok=True)
        with open("logs/update.log", "a", encoding="utf-8") as f:
            f.write(st.session_state["update_success_msg"] + "\n")
    except Exception:
        pass
    del st.session_state["update_success_msg"]

stage("CSS + başlık ve sistem ayarları render edildi")

# ==========================================
# 2. ÖNCE HESABI SEÇ (TAM GENİŞLİKTE)
# ==========================================
active_account = render_account_selector()
stage("Hesap seçici")

# Güvenlik: Eğer JSON dosyasında hiç hesap yoksa veya hata varsa programı burada durdur.
if not active_account:
    st.stop()

# Seçili hesabın benzersiz ID'sini alıyoruz
account_id = str(active_account.get("login", "default"))

# ==========================================
# MOTOR SEÇİMİ (TEK KRAL: AUTO GRID)
# ==========================================

st.markdown("---")


# ==========================================
# 🌟 YENİ: SESSİZ BAŞLANGIÇ GÜNCELLEME KONTROLÜ (Arayüzü Dondurmaz)
# ==========================================
@st.fragment
def run_silent_update_check():
    if "initial_update_check" not in st.session_state:
        st.session_state["initial_update_check"] = True
        target_branch = "master" if env == "LIVE" else "test"

        success, update_data = check_for_updates(branch=target_branch)
        if success:
            has_update, local_ver, remote_ver = update_data
            if has_update:
                st.error(
                    f"🚀 **Yeni Güncelleme Mevcut!** (Mevcut: `{local_ver}` ➡️ Yeni: `{remote_ver}`). Sağ üstteki ayarlar menüsünden hemen güncelleyin!",
                    icon="🚀",
                )
            else:
                st.toast(f"✅ En son sürümde kullanıyorsunuz ({local_ver})", icon="✨")


run_silent_update_check()

# ==========================================
# 3. GÜNCEL ÇALIŞMA DURUMUNU SORGULA (CRASH DETECTION)
# ==========================================
# Durumu globalden değil, Bot Manager'dan SADECE bu hesap için soruyoruz
account_is_running = is_bot_running(account_id)
stage("Bot durumu sorgusu (is_bot_running)")


# ==========================================
# 4. AYARLARI VE METRİKLERİ YÜKLE
# ==========================================
current_settings = load_settings("Auto Grid")

# Canlı verileri JSON dosyasından çek (Çünkü robot artık Subprocess olarak çalışıyor)
# Dosya her zaman okunur: Başlangıç hatası (startup_error) afişi buradan beslenir.
live_data = get_live_metrics_from_file(account_id)
stage("Ayarlar + metrik yükleme")

# 🌟 GÖRSEL ALARM KÖPRÜSÜ: Metrikleri ve Kritik Alarmları Ekrana Bas
render_global_metrics(
    profit=live_data.get("profit", 0.0),
    current_price=live_data.get("current_price", 0.0),
    metrics_data=live_data,
)

# ==========================================
# PİYASA ROZETİ VE CANLILIK GÖSTERGESİ (HEARTBEAT)
# ==========================================
# 🛠️ DÜZELTME: Tolerans 10'dan 30 saniyeye çıkarıldı (MT5 API gecikmelerinde false-positive vermemesi için)
if not account_is_running or live_data.get("data_age", 999.0) > 30:
    # 🌟 KRİTİK HATA ÇÖZÜMÜ: Robot durduysa veya senkronizasyon koptuysa,
    # eski JSON'daki bayat veriler alt panellerde "Açık" görünmesin diye kaynağında temizle!
    live_data["market_open"] = False
    live_data["mt5_connected"] = False

if account_is_running:
    m_open = live_data.get("market_open", False)
    d_age = live_data.get("data_age", 999.0)
    is_live = d_age < 30

    dot_color = "🟢" if is_live else "🔴"
    sync_text = (
        f"Son senkronizasyon: {int(d_age)} sn önce"
        if is_live
        else "Senkronizasyon koptu!"
    )

    if m_open:
        st.markdown(f"&nbsp; 🟢 **Piyasa Açık** &nbsp;|&nbsp; {dot_color} *{sync_text}*")
    else:
        st.markdown("&nbsp; 🔴 **Piyasa Kapalı** &nbsp;|&nbsp; ⏸️ *İşlemler duraklatıldı*")


# ==========================================
# ALGO TRADING GÜVENLİK UYARISI
# ==========================================
if live_data.get("algo_trading_error", False):
    st.error(
        "🚨 **KRİTİK HATA:** MetaTrader 5'te **'Algo Trading' (Otomatik Ticaret)** kapalı! "
        "Robot emir gönderemiyor. Lütfen MT5 terminalinin üst menüsünden 'Algo Trading' butonunu aktif (yeşil) hale getirin.",
        icon="🚫",
    )

    if account_is_running:
        stop_bot_process(account_id)
        st.toast("🛑 Bağlantı kilitlendi: Algo Trading kapalı!", icon="⚠️")
        st.rerun()


# 🔴 MT5 BAĞLANTISI KOPTU/BULUNAMADI UYARISI (Subprocess'ten gelen canlı durum)
if live_data.get("startup_error"):
    c_err, c_empty = st.columns([0.85, 0.15])
    with c_err:
        st.error(
            f"🚨 **MT5 BAĞLANTI HATASI:** {live_data.get('startup_error')}",
            icon="🚫",
        )
    with c_empty:
        if st.button("🔄 Tekrar Bağlan", key=f"retry_from_error_{account_id}", use_container_width=True):
            st.session_state[f"motor_toggle_{account_id}"] = True
            st.rerun()
elif account_is_running and not live_data.get("mt5_connected", False):
    bot_started_at = st.session_state.get(f"bot_started_at_{account_id}")
    bot_just_started = bot_started_at and (time.time() - bot_started_at) < 90
    elapsed_since_start = int(time.time() - bot_started_at) if bot_started_at else 0

    if bot_just_started:
        ci_col, cb_col = st.columns([0.85, 0.15])
        with ci_col:
            st.warning(
                f"⚙️ **Sistem Hazırlanıyor ({elapsed_since_start} sn)...**\n\n"
                "Robot arka planda başlatıldı ve MT5 terminaline bağlanıyor. "
                "Bağlantı kurulana kadar menü butonları güvenlik amacıyla kilitlenmiştir. Lütfen bekleyin...",
                icon="⏳",
            )
        with cb_col:
            if st.button("❌ İptal", key=f"cancel_connect_{account_id}", use_container_width=True):
                try:
                    stop_bot_process(account_id)
                except Exception:
                    pass
                if f"bot_started_at_{account_id}" in st.session_state:
                    del st.session_state[f"bot_started_at_{account_id}"]
                st.toast("🛑 Bağlantı denemesi iptal edildi.", icon="⏹️")
                st.rerun()
    else:
        ce_col, cs_col = st.columns([0.85, 0.15])
        with ce_col:
            st.error(
                "🚨 **KRİTİK HATA:** MetaTrader 5 ile bağlantı KOPTU! "
                "Robot çalışıyor ama MT5'e ulaşamıyor. "
                "MT5 terminalinin açık ve ağ bağlantınızın aktif olduğunu kontrol edin. "
                "Bağlantı geri gelince robot otomatik olarak devam edecek.",
                icon="🚫",
            )
        with cs_col:
            if st.button("🛑 Durdur", key=f"stop_disconnected_{account_id}", use_container_width=True):
                stop_bot_process(account_id)
                if f"bot_started_at_{account_id}" in st.session_state:
                    del st.session_state[f"bot_started_at_{account_id}"]
                st.toast("🛑 Robot durduruldu.", icon="⏹️")
                st.rerun()


# 📡 Mobil MT5'ten (Sinyal Emri ile) uzaktan durduruldu mu?
if live_data.get("remote_paused", False) and account_is_running:
    st.warning(
        "📡 **Sistem Mobil MT5'ten UZAKTAN DURDURULDU.** "
        "Bekleyen emirler silindi, açık pozisyonlar korundu. "
        "Tekrar bağlanmak için yukarıdaki **MT5'e Bağlan** butonunu kullanın "
        "(mobil MT5'te 1$ Buy Limit yalnızca durdurmak içindir).",
        icon="⏸️",
    )
stage("Hata/uyarı afişleri")


# ==========================================
# YARDIMCI FONKSİYON: BÖLGE DURUMLARINI DEĞİŞTİR (START/PAUSE)
# ==========================================
def set_all_zones_state(acc_id, new_state):
    ui_key = f"ui_zone_states_{acc_id}"
    zones_key = f"auto_grid_zones_{acc_id}"

    if ui_key in st.session_state and zones_key in st.session_state:
        backend_states = {}
        for z in st.session_state[zones_key]:
            z_id = z.get("id")
            magic_idx = str(z.get("magic_idx"))
            if z_id and magic_idx:
                st.session_state[ui_key][z_id] = new_state
                backend_states[magic_idx] = new_state

        try:
            # Durumu arka plan motorunun (Subprocess) okuması için diske yazıyoruz
            ui_file = get_ui_state_path(acc_id)
            tmp_ui_file = ui_file + ".tmp"
            with open(tmp_ui_file, "w", encoding="utf-8") as f:
                json.dump(backend_states, f)
            os.replace(tmp_ui_file, ui_file)
        except Exception:
            pass


# ==========================================
# 🌟 YENİ BAŞLAT / BEKLET / BAĞLAN MANTIĞI
# ==========================================
# 1. BAĞLAN / KES
if st.session_state.get(f"motor_toggle_{account_id}"):
    st.session_state[f"motor_toggle_{account_id}"] = False
    if not account_is_running:
        show_mt5_connect_dialog(active_account, account_id)
        stage("MT5 bağlantı denemesi (Modal tetiklendi)")
    else:
        confirm_stop_motor_dialog(
            account_id,
            on_stop_func=stop_bot_process,
        )

# 2. BEKLET
if st.session_state.get(f"motor_pause_{account_id}"):
    st.session_state[f"motor_pause_{account_id}"] = False
    set_all_zones_state(account_id, "PAUSE")
    st.rerun()

# 3. BAŞLAT (VE SEMBOL KONTROLÜ)
if st.session_state.get(f"motor_start_{account_id}"):
    st.session_state[f"motor_start_{account_id}"] = False

    # Bot'un arka planda kaydettiği sembol listesini diskten oku
    available_symbols = []
    sym_file = get_symbols_path(account_id)
    if os.path.exists(sym_file):
        try:
            with open(sym_file, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                if isinstance(raw_data, dict):
                    available_symbols = list(raw_data.keys())
                elif isinstance(raw_data, list):
                    available_symbols = raw_data
        except Exception:
            pass

    # 🚨 BUG 2 DÜZELTMESİ: Sadece 1. bölgeyi değil, TÜM bölgelerdeki sembolleri sırayla kontrol et
    invalid_symbol = None
    if current_settings and "ZONES" in current_settings:
        for zone in current_settings["ZONES"]:
            z_sym = zone.get("symbol", "USOUSD").upper()
            if available_symbols and z_sym not in available_symbols:
                invalid_symbol = z_sym
                break  # İlk hatalı sembolü bulduğumuzda döngüyü kırarız

    if invalid_symbol:
        # Hatalı sembol tespit edildi, sistemi anında Beklet moduna (PAUSE) zorla
        set_all_zones_state(account_id, "PAUSE")
        symbol_error_dialog(invalid_symbol)
    else:
        # Tüm semboller geçerli, tüm bölgeleri güvenle başlat!
        set_all_zones_state(account_id, "START")
        st.rerun()

# ==========================================
# 🌟 GİZLİ BEKÇİ (EVENT-DRIVEN WATCHER)
# ==========================================
@st.fragment(run_every="1.5s")
def remote_signal_watcher(acc_id, is_running):
    if not is_running:
        return

    need_rerun = False

    live_info = get_live_metrics_from_file(acc_id)
    is_data_fresh = live_info.get("data_age", 999.0) < 30
    real_ui_connected = live_info.get("mt5_connected", False) if is_data_fresh else False

    # 1. BAĞLANTI DURUMU DEĞİŞİM DEDEKTÖRÜ
    last_conn_state_key = f"last_conn_state_{acc_id}"
    last_conn_state = st.session_state.get(last_conn_state_key, None)

    if last_conn_state is not None and last_conn_state != real_ui_connected:
        need_rerun = True
    
    st.session_state[last_conn_state_key] = real_ui_connected

    # 2. İLK AÇILIŞ (HAZIRLANIYOR) AFİŞİNİ KAPATMA
    if real_ui_connected and f"bot_started_at_{acc_id}" in st.session_state:
        del st.session_state[f"bot_started_at_{acc_id}"]
        need_rerun = True

    # 3. BÖLGE DURUM KONTROLÜ
    ui_file = get_ui_state_path(acc_id)
    if os.path.exists(ui_file):
        try:
            with open(ui_file, "r", encoding="utf-8") as f:
                disk_states = json.load(f)

            ui_state_key = f"ui_zone_states_{acc_id}"
            zones_session_key = f"auto_grid_zones_{acc_id}"

            if zones_session_key in st.session_state and ui_state_key in st.session_state:
                memory_states = st.session_state[ui_state_key]

                for i, z in enumerate(st.session_state[zones_session_key]):
                    disk_val = disk_states.get(str(i))
                    zone_id = z.get("id")
                    mem_val = memory_states.get(zone_id)

                    if disk_val in ("AUTO_CLEAR", "PAUSE", "START") and disk_val != mem_val:
                        st.session_state[ui_state_key][zone_id] = disk_val
                        need_rerun = True
        except Exception:
            pass

    # 4. TÜM GÜNCELLEMELERİ TEK BİR RERUN İLE UYGULA (Flicker Engeller)
    if need_rerun:
        st.rerun()


# Bekçiyi panelden hemen önce çalıştır
remote_signal_watcher(account_id, account_is_running)

# ==========================================
# AYARLAR VE MAC SİMÜLATÖRÜ
# ==========================================
bot_started_at = st.session_state.get(f"bot_started_at_{account_id}")
is_connecting = bool(account_is_running and not live_data.get("mt5_connected", False) and bot_started_at and (time.time() - bot_started_at) < 90)

updated_settings = render_settings_panel(
    current_settings,
    "Auto Grid",
    account_id,
    live_data,
    active_account,
    account_is_running,
    is_connecting=is_connecting,
)

if updated_settings:
    save_settings(updated_settings, "Auto Grid")
    st.success(f"✅ Ayarlar başarıyla güncellendi ve {account_id} için kaydedildi!")
    st.rerun()

stage("Ayarlar paneli render")

st.divider()

current_active_price = live_data.get("current_price", 0.0)

if platform.system() != "Windows":
    st.warning("💻 Mac Test Modu Aktif - Fiyat Simülatörü")
    mock_price = st.slider(
        "Canlı Fiyatı Belirle (USOUSD)",
        min_value=50.0,
        max_value=150.0,
        value=75.0,
        step=0.10,
    )
    current_active_price = mock_price
    bot_engine.SIMULATED_PRICE = mock_price  # Arayüzün kendi grafiği için

    # YENİ: Alt sürece (backend) fiyatı iletmek için köprü kuruyoruz
    sim_file_path = get_sim_price_path(account_id)
    try:
        tmp_sim = sim_file_path + ".tmp"
        with open(tmp_sim, "w", encoding="utf-8") as f:
            json.dump({"price": mock_price}, f)
        os.replace(tmp_sim, sim_file_path) # Atomik değişim
    except Exception:
        pass

# ==========================================
# GRAFİK VE LOG EKRANI (İşletim Sistemine Göre Dinamik)
# ==========================================
if platform.system() != "Windows":
    # Mac ortamında: Grafik ve Log yan yana (Grafik daha geniş)
    col_chart, col_log = st.columns([2, 1])
    with col_chart:
        render_chart(current_active_price, current_settings, "Auto Grid")
    with col_log:
        render_log_viewer(account_id)
else:
    # Windows ortamında: Grafik GİZLİ, Loglar TAM EKRAN GENİŞLİĞİNDE
    st.markdown("---")
    render_log_viewer(account_id)

stage("END — Grafik + log ekranı (script sonu)")
