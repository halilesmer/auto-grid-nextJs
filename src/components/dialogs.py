# src/components/dialogs.py
import streamlit as st
import os
import time
import psutil


@st.dialog("🗑️ Bölgeyi Sil")
def confirm_delete_zone_dialog(zone_name, on_confirm_func):
    """
    Belirli bir bölgeyi silmek için onay penceresi (Modal).
    zone_name: Silinecek bölgenin adı (Ekranda göstermek için).
    on_confirm_func: 'Evet' butonuna basıldığında çalıştırılacak fonksiyon.
    """
    st.write(f"**{zone_name}** adlı bölgeyi silmek istediğinize emin misiniz?")

    col_yes, col_no = st.columns([1, 1])
    if col_yes.button("Evet, Sil", type="primary", width="stretch"):
        on_confirm_func()  # Asıl silme işlemini yapan fonksiyonu tetikle
        st.rerun()

    if col_no.button("Hayır, İptal", width="stretch"):
        st.rerun()


@st.dialog("🗑️ Hesabı Sil")
def confirm_delete_account_dialog(account_name, on_confirm_func):
    """
    Hesap silme işlemi için onay penceresi (Modal).
    """
    st.warning(
        f"⚠️ **{account_name}** adlı hesabı tamamen silmek istediğinize emin misiniz?",
        icon="🗑️",
    )

    col_yes, col_no = st.columns([1, 1])
    if col_yes.button("Evet, Sil", type="primary", width="stretch"):
        on_confirm_func()
        st.rerun()

    if col_no.button("Hayır, İptal", width="stretch"):
        st.rerun()


@st.dialog("🛑 MT5 Bağlantısını Kes")
def confirm_stop_motor_dialog(account_id, on_stop_func):
    """
    MT5 bağlantısını kesmek için onay penceresi (Modal).

    Bot kapanır; AÇIK POZİSYONLARA ASLA DOKUNULMAZ.
    Bekleyen emirler (pending orders) de olduğu gibi korunur.
    """
    st.write("MT5 bağlantısını kesmek istediğinize emin misiniz?")
    st.info(
        "Açık pozisyonlar ve bekleyen emirler broker'da olduğu gibi korunur.",
        icon="ℹ️",
    )

    col1, col2 = st.columns([1, 1])
    if col1.button("🟡 Evet, Bağlantıyı Kes", width="stretch"):
        on_stop_func(account_id)
        cleanup_key = f"bot_started_at_{account_id}"
        if cleanup_key in st.session_state:
            del st.session_state[cleanup_key]
        st.rerun()
    if col2.button("❌ İptal", width="stretch"):
        st.rerun()


@st.dialog("🛑 Sistemi Tamamen Kapat")
def confirm_system_shutdown_dialog():
    """
    Arka planda görünmez (VBS) olarak çalışan arayüzü ve ona bağlı
    tüm zombi robot süreçlerini (bot_runner.py) güvenle kapatır.
    """
    st.error(
        "Bu işlem arka planda çalışan **tüm robotları** ve **bu arayüzü** tamamen kapatacaktır. "
        "Açık olan pozisyonlarınız broker tarafında güvende kalır."
    )
    st.write("Sistemi gerçekten kapatmak istiyor musunuz?")

    col_yes, col_no = st.columns([1, 1])
    if col_yes.button("🔴 Sistemi Kapat", type="primary", width="stretch"):
        st.success(
            "Zombi süreçler temizleniyor... Tarayıcı sekmesini kapatabilirsiniz."
        )
        time.sleep(2)  # Kullanıcının mesajı görebilmesi için kısa bir bekleme

        # 1. Aşama: Sadece bize ait olan "bot_runner.py" zombilerini bul ve öldür
        for proc in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                cmdline = proc.info.get("cmdline") or []
                cmd_str = " ".join(cmdline).lower()

                # Sadece bot_runner.py içeren python süreçlerini hedef al
                if "bot_runner.py" in cmd_str:
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        # 2. Aşama: VBS üzerinden başlatılan bu ana Streamlit sürecini intihar ettir (Kapat)
        os._exit(0)

    if col_no.button("Hayır, İptal", width="stretch"):
        st.rerun()


@st.dialog("🚨 Sembol Hatası")
def symbol_error_dialog(symbol_name: str, on_close_func=None):
    """
    Aracı kurum sunucusunda sembol bulunamadığında ekrana çıkan sadece uyarı amaçlı modal.
    """
    st.error(f"**HATA:** Sembol ({symbol_name}) aracı kurum sunucusunda bulunamadı!")
    st.write(
        f"Lütfen arayüze girdiğiniz sembol adının (örn: XTIUSD) brokerınızla birebir aynı olduğundan emin olun."
    )
    st.info(
        "Robot güvenlik amacıyla 'Bekliyor' moduna alındı. Lütfen ayarlarınızı düzeltip tekrar başlatın."
    )

    if st.button("Tamam", type="primary", width="stretch"):
        if on_close_func:
            on_close_func()
        st.rerun()
