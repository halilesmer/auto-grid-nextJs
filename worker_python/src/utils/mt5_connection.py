# src/utils/mt5_connection.py

import platform
import time
import os
import shutil  # 🌟 YENİ EKLENDİ (Dosya kopyalamak için)
import datetime  # 🌟 YENİ EKLENDİ (Tarih formatı için)
import psutil
import subprocess

from src.utils.paths import get_mt5_backup_dir  # 🌟 YENİ: Hesaba özel MT5 yedek klasörü

# Streamlit sicher importieren, um Subprocess-Abstürze zu verhindern!
try:
    import streamlit as st
    from streamlit.runtime.scriptrunner import get_script_run_ctx
except ImportError:
    st = None


def safe_log(msg, type="error"):
    """Zeigt Fehler im Dashboard an, schreibt sie aber im Hintergrund-Prozess sicher ins Log, ohne abzustürzen!"""
    print(msg)  # Geht immer sicher in die bot_..._error.log Datei
    if st is not None:
        try:
            if get_script_run_ctx() is not None:  # Prüft, ob wir im UI-Dashboard sind
                if type == "error":
                    st.error(msg)
                elif type == "warning":
                    st.warning(msg)
        except Exception:
            pass


try:
    import MetaTrader5 as mt5

    MT5_AVAILABLE = True
    MT5_IMPORT_ERROR = None
except ImportError as e:
    MT5_AVAILABLE = False
    MT5_IMPORT_ERROR = str(e)


def connect_to_mt5(account_config, timeout_sec=60):
    if not account_config:
        safe_log("Bağlanılacak hesap seçilmedi!")
        return False, "[CONFIG] Bağlanılacak hesap seçilmedi veya hesap bilgisi eksik."

    if not MT5_AVAILABLE or platform.system() != "Windows":
        import sys

        reason = (
            MT5_IMPORT_ERROR if platform.system() == "Windows" else "Mac/Linux Ortamı"
        )
        safe_log(
            f"⚠️ UYARI: MT5 bağlantısı simüle ediliyor! Sebep: {reason} | Aktif Python Yolu: {sys.executable}",
            type="warning",
        )
        return True, None

    # ==========================================
    # BUNDAN SONRASI SADECE WINDOWS'TA ÇALIŞIR
    # ==========================================

    mt5.shutdown()

    # 1. NAVIGATOR: Welches Terminal soll gestartet werden?
    mt5_path = account_config.get("mt5_path")
    init_success = False

    def _kill_zombie_mt5(path):
        """Yardımcı Fonksiyon: Kilitlenmiş MT5'i işletim sistemi seviyesinde öldürür."""
        # import psutil, subprocess  # KALDIRILDI: modül seviyesinde import edildi

        target_exe = "terminal64.exe"
        if path and os.path.exists(path):
            target_exe = os.path.basename(path).lower()

        for proc in psutil.process_iter(["pid", "name", "exe"]):
                try:
                    p_name = proc.info.get("name")
                    p_exe = proc.info.get("exe")

                    if p_name and p_name.lower() == target_exe:
                        # Eğer geçerli bir path varsa ve uyuşmuyorsa pas geç. Path yoksa ilk zombiyi vur.
                        if path and os.path.exists(path) and p_exe:
                            if (
                                os.path.normpath(p_exe).lower()
                                != os.path.normpath(path).lower()
                            ):
                                continue

                        safe_log(
                            f"Asılı kalan MT5 terminali tespit edildi. Öldürülüyor... PID: {proc.info['pid']}",
                            type="warning",
                        )
                        subprocess.call(
                            ["taskkill", "/F", "/PID", str(proc.info["pid"])],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
                        time.sleep(2.0)
                except (
                    psutil.NoSuchProcess,
                    psutil.AccessDenied,
                    psutil.ZombieProcess,
                ):
                    pass

    # ==============================================================
    # 🌟 GİRİŞ BİLGİLERİNİ GÜVENLİ ŞEKİLDE HAZIRLA (Try-Except ile)
    # ==============================================================
    raw_login = account_config.get("login")
    password = account_config.get("password")
    server = account_config.get("server")
    login_id = 0

    if raw_login and password and server:
        try:
            login_id = int(raw_login)
            password = str(password)
            server = str(server)
        except ValueError:
            safe_log(
                f"🔴 BAĞLANTI HATASI: Hesap numarası (Login) sadece rakamlardan oluşmalıdır! Girilen değer: '{raw_login}'",
                type="error",
            )
            return False, f"[CONFIG] Hesap numarası geçersiz: '{raw_login}' (sadece rakam olmalı)"

    # ==============================================================
    # 🌟 AŞAMA 1: OTO-LOGIN İLE BAŞLATMA (mt5.initialize)
    # ==============================================================
    # PORTABLE mod kaldırıldı! Terminal artık AppData'daki kullanıcı ayarlarını (Algo Trading izni) tanıyacak.
    init_kwargs = {"timeout": int(timeout_sec * 1000)}

    if mt5_path and os.path.exists(mt5_path):
        # MT5 kütüphanesinin (C-API) dosya yolu huysuzluğunu gidermek için saf Windows formatına çeviriyoruz
        init_kwargs["path"] = os.path.normpath(mt5_path)
    elif mt5_path:
        safe_log(
            f"UYARI: Belirtilen MT5 yolu bulunamadı ({mt5_path}). Standart terminal açılıyor...",
            type="warning",
        )

    # Eğer hesap bilgileri tamsa, MT5 açılırken doğrudan hesaba giriş yapsın diye parametreleri ekliyoruz
    if login_id > 0:
        init_kwargs.update({"login": login_id, "password": password, "server": server})

    init_success = mt5.initialize(**init_kwargs)

    # 🌟 ZOMBİ AVCISI (Kurtarma): Eğer ilk bağlantı başarısız olursa (IPC hatası vb.), terminal asılı kalmış demektir. Öldür ve tekrar dene!
    if not init_success:
        last_err = mt5.last_error()
        safe_log(
            f"İlk bağlantı başarısız (Hata: {last_err}). Terminal kilitli olabilir. Kurtarma protokolü başlatılıyor...",
            type="warning",
        )

        _kill_zombie_mt5(mt5_path)

        safe_log(
            "Terminal sıfırdan başlatılıyor. Bu işlem VPS hızına bağlı olarak 1-2 dakika sürebilir...",
            type="warning",
        )
        init_kwargs["timeout"] = int((timeout_sec + 30) * 1000)
        init_success = mt5.initialize(**init_kwargs)

    if not init_success:
        last_err = mt5.last_error()
        if last_err[0] == -10003:
            safe_log(
                f"🔴 MT5 IPC Bağlantısı Reddedildi! (Hata: {last_err}). Python (VS Code/Streamlit) ile MT5'in aynı yönetici (Run as Admin) yetkisine sahip olduğundan emin olun."
            )
            return False, f"[INIT] MT5 başlatılamadı. IPC Bağlantısı Reddedildi (hata kodu: {last_err[0]})"
        else:
            safe_log(
                f"🔴 MetaTrader 5 başlatılamadı! Lütfen terminal yolunu kontrol edin. Hata Kodu: {last_err}"
            )
            return False, f"[INIT] MT5 başlatılamadı. Hata kodu: {last_err[0]} ({last_err[1]})"

    # ==============================================================
    # 🌟 AŞAMA 2: OTO-LOGIN ZORLAMASI (mt5.login) - Açık terminal garantisi
    # ==============================================================
    if login_id > 0:
        # IPC TIMEOUT (-10005) KORUMASI: Terminal yeni açılıyorsa login'e ilk denemede
        # yanıt veremeyebilir. 3 kez deneyip pes etmeden önce terminale nefes payı veriyoruz.
        authorized = False
        last_err = mt5.last_error()

        for attempt in range(1, 4):
            authorized = mt5.login(login=login_id, password=password, server=server)
            if authorized:
                break
            last_err = mt5.last_error()
            if attempt < 3:
                time.sleep(1.5)

        if not authorized:
            err_code = last_err[0]
            err_msg = f"🔴 MT5 Girişi Başarısız! (Hata: {last_err})"

            # 🌟 ÖZEL HATA MESAJLARI (UI Çökmesini Engeller ve Açıklar)
            if (
                err_code == 1002 or err_code == 2
            ):  # 1002: Geçersiz parametre, 2: Common error
                err_msg = f"🔴 BAĞLANTI HATASI: Hesap No ({login_id}), Şifre veya Sunucu adı ({server}) YANLIŞ! Bilgileri kontrol edin."
                phase_msg = f"[LOGIN] Giriş yapılamadı. Hesap {login_id}, şifre veya sunucu '{server}' hatalı (hata kodu: {err_code})"
            elif err_code == -10005:
                err_msg = "🔴 BAĞLANTI HATASI: Terminal çok yavaş açıldı (IPC Timeout). Lütfen tekrar bağlan butonuna basın."
                phase_msg = f"[LOGIN] IPC Timeout (-10005) — Terminal çok yavaş açıldı, login zaman aşımına uğradı"
            elif err_code == 10004:
                err_msg = "🔴 BAĞLANTI HATASI: Sunucuya bağlantı kurulamadı (Requote/No Connection). Aracı kurum sunucusu kapalı olabilir."
                phase_msg = f"[LOGIN] Sunucuya bağlanılamadı. '{server}' sunucusu yanıt vermiyor (hata kodu: {err_code})"
            else:
                phase_msg = f"[LOGIN] Giriş başarısız. Hata kodu: {err_code} ({last_err[1]})"

            safe_log(err_msg, type="error")
            mt5.shutdown()  # Hata durumunda hafızada asılı kalmaması için kapatıldı
            return False, phase_msg

        # Broker sunucusuyla senkronizasyon (fiyatların yüklenmesi) için MT5'e 1 saniye nefes payı ver
        time.sleep(1.0)
    else:
        time.sleep(2.0)

    # DÜZELTME: Hesap verilerini çekmek için 3 denemeli (Retry) güvenli döngü kuruldu
    account_info = None
    for _ in range(3):
        account_info = mt5.account_info()
        if account_info is not None:
            break
        time.sleep(1.0)

    if account_info is None:
        safe_log(
            "Hesap bilgileri MetaTrader'dan alınamadı! (Auto-Login gecikmiş veya MT5 kapalı olabilir)"
        )
        mt5.shutdown()
        return False, "[ACCOUNT] Hesap bilgisi alınamadı. MT5 terminali senkronize olamadı (3 deneme başarısız)"

    # Algo Trading Check
    terminal_info = mt5.terminal_info()
    if terminal_info is not None and not terminal_info.trade_allowed:
        safe_log(
            "🚨 KRİTİK HATA: MetaTrader 5'te 'Algo Trading' (Otomatik Ticaret) butonu kapalı!"
        )
        mt5.shutdown()
        return False, "[TERMINAL] Algo Trading kapalı! MT5 üst menüsünden 'Algo Trading' butonunu aktif (yeşil) yapın."

    is_mt5_demo = account_info.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO
    env_type = account_config.get("type", account_config.get("env_type", ""))

    if env_type == "LIVE" and is_mt5_demo:
        safe_log(
            "🚨 KRİTİK GÜVENLİK İHLALİ: Canlı (LIVE) ortam seçili ama MT5 hesabı DEMO!"
        )
        mt5.shutdown()
        return False, "[SECURITY] Ortam uyuşmazlığı: Robot LIVE modunda ama MT5 hesabı DEMO."

    if env_type in ["DEMO", "TEST"] and not is_mt5_demo:
        safe_log(
            "🚨 KRİTİK GÜVENLİK İHLALİ: Test (TEST) ortamı seçili ama MT5 hesabı GERÇEK PARALI (LIVE)!"
        )
        mt5.shutdown()
        return False, "[SECURITY] Ortam uyuşmazlığı: Robot TEST modunda ama MT5 hesabı GERÇEK PARALI (LIVE)."

    # 🌟 BAĞLANTI BAŞARILI OLDUKTAN SONRA LOGLARI YEDEKLE
    backup_mt5_logs(login_id)

    return True, None

def shutdown_mt5():
    """MT5 bağlantı oturumunu serbest bırakır.

    Arayüz (frontend) "test bağlantısı" yaptıktan sonra artık terminali meşgul
    etmemelidir; aksi halde alt süreç (bot_runner) aynı terminale bağlanmaya
    çalışırken IPC çakışması (-10005 IPC timeout) yaşanabilir.
    """
    if MT5_AVAILABLE and platform.system() == "Windows":
        try:
            mt5.shutdown()
        except Exception:
            pass


# ==========================================
# 🌟 DÜZELTME: GÜVENLİ ZAMAN AŞIMLI BAĞLANTI (MİMARİ ÇÖZÜM)
# ==========================================
def connect_to_mt5_with_timeout(account_config, timeout=60):
    """
    connect_to_mt5'i çağırır; timeout gerçekleşirse is_timeout=True döner.
    Not: MT5 C-API kendi timeout'unu yönetir; bu wrapper hata kodlarını yorumlar.
    Dönüş: (başarı_bool, zaman_aşımı_bool, hata_detayı_str_or_None)
    """
    if not account_config:
        safe_log("Bağlanılacak hesap seçilmedi!")
        return False, False, "[CONFIG] Bağlanılacak hesap seçilmedi."

    try:
        ok, detail = connect_to_mt5(account_config, timeout_sec=timeout)

        is_timeout = False
        # C-API'den dönen hatalarda "timeout" veya spesifik IPC (-10005) kodları varsa bunu yakala
        if (
            not ok
            and detail
            and (
                "Timeout" in detail
                or "-10005" in str(detail)
                or "-10003" in str(detail)
            )
        ):
            is_timeout = True
            safe_log(
                f"[TIMEOUT] MT5 bağlantısı {timeout} saniye içinde tamamlanamadı. "
                "Terminal kapalı, sunucuya ulaşılamıyor veya açılışı çok yavaş."
            )

        return ok, is_timeout, detail
    except Exception as e:
        err_msg = f"[CRITICAL] Bağlantı fonksiyonu çöktü: {e}"
        safe_log(err_msg)
        return False, False, err_msg


# ==========================================
# 🌟 YENİ: MT5 Terminal Loglarını Yedekleme Fonksiyonu
# ==========================================
def backup_mt5_logs(account_id):
    """
    MT5 Terminal loglarını okur ve projedeki ilgili hesabın log klasörüne kopyalar.
    """
    if not MT5_AVAILABLE or platform.system() != "Windows" or not account_id:
        return  # Mac, MT5 olmayan ortam veya eksik hesap ID'sinde pas geç

    # 1. Hesaba özel MT5 yedekleme klasörünü al
    custom_log_dir = get_mt5_backup_dir(str(account_id))

    # 2. MT5 Terminal bilgilerini çek
    term_info = mt5.terminal_info()
    if term_info is None:
        return

    # 3. MT5 log klasörünün yolunu bul
    mt5_logs_dir = os.path.join(term_info.data_path, "Logs")

    # 4. Bugünün tarihine göre dosya adını oluştur (Örn: 20260810.log)
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    today_log_file = f"{today_str}.log"
    source_log_path = os.path.join(mt5_logs_dir, today_log_file)

    # 5. Dosyayı kendi klasörümüze kopyala
    if os.path.exists(source_log_path):
        target_log_path = os.path.join(custom_log_dir, f"MT5_Terminal_{today_log_file}")
        try:
            shutil.copy2(source_log_path, target_log_path)
        except Exception as e:
            safe_log(f"MT5 Log kopyalama hatası: {e}", type="warning")
