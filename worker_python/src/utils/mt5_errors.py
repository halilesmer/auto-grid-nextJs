import os
import subprocess
import psutil


def kill_zombie_mt5(path, safe_log_fn):
    target_exe = "terminal64.exe"
    if path and os.path.exists(path):
        target_exe = os.path.basename(path).lower()

    for proc in psutil.process_iter(["pid", "name", "exe"]):
        try:
            p_name = proc.info.get("name")
            p_exe = proc.info.get("exe")
            if p_name and p_name.lower() == target_exe:
                if path and os.path.exists(path) and p_exe:
                    if (
                        os.path.normpath(p_exe).lower()
                        != os.path.normpath(path).lower()
                    ):
                        continue
                safe_log_fn(
                    f"Asılı kalan MT5 terminali tespit edildi. Öldürülüyor... PID: {proc.info['pid']}",
                    type="warning",
                )
                subprocess.call(
                    ["taskkill", "/F", "/PID", str(proc.info["pid"])],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass


def parse_init_error(last_err, login_id, server, safe_log_fn):
    err_code = last_err[0]
    if err_code == -10003:
        safe_log_fn(
            f"🔴 MT5 IPC Bağlantısı Reddedildi! (Hata: {last_err}). Python ile MT5'in aynı yönetici yetkisine sahip olduğundan emin olun."
        )
        return (
            False,
            f"[INIT] MT5 başlatılamadı. IPC Bağlantısı Reddedildi (hata kodu: {err_code})",
        )
    elif err_code == -10004:
        safe_log_fn(
            "🔴 MT5 Yetkilendirme/Bağlantı Hatası (-10004): Şifre veya sunucu adı hatalı.",
            type="error",
        )
        return (
            False,
            f"[INIT] Giriş Başarısız: Hesap şifresi, hesap numarası ({login_id}) veya sunucu adı ('{server}') yanlış!",
        )
    else:
        safe_log_fn(
            f"🔴 MetaTrader 5 başlatılamadı! Lütfen terminal yolunu kontrol edin. Hata Kodu: {last_err}"
        )
        return (
            False,
            f"[INIT] MT5 başlatılamadı. Hata kodu: {last_err[0]} ({last_err[1]})",
        )


def parse_login_error(last_err, login_id, server, safe_log_fn):
    err_code = last_err[0]
    err_msg = f"🔴 MT5 Girişi Başarısız! (Hata: {last_err})"
    if err_code in (1002, 2):
        err_msg = f"🔴 BAĞLANTI HATASI: Hesap No ({login_id}), Şifre veya Sunucu adı ({server}) YANLIŞ! Bilgileri kontrol edin."
        phase_msg = f"[LOGIN] Giriş yapılamadı. Hesap {login_id}, şifre veya sunucu '{server}' hatalı (hata kodu: {err_code})"
    elif err_code == -10005:
        err_msg = "🔴 BAĞLANTI HATASI: Terminal çok yavaş açıldı (IPC Timeout). Lütfen tekrar bağlan butonuna basın."
        phase_msg = "[LOGIN] IPC Timeout (-10005) — Terminal çok yavaş açıldı, login zaman aşımına uğradı"
    elif err_code in (-10004, 10004):
        err_msg = "🔴 BAĞLANTI HATASI: Yetkilendirme yapılamadı veya sunucuya bağlanılamadı. Şifre veya sunucu adı yanlış olabilir."
        phase_msg = f"[LOGIN] Giriş Başarısız: Hesap şifresi veya sunucu adı ('{server}') hatalı! Lütfen bilgilerinizi kontrol edin (hata kodu: {err_code})"
    else:
        phase_msg = f"[LOGIN] Giriş başarısız. Hata kodu: {err_code} ({last_err[1]})"

    safe_log_fn(err_msg, type="error", account_id=login_id)
    return False, phase_msg


def verify_account_environment(account_config, account_info, mt5_module):
    is_mt5_demo = account_info.trade_mode == mt5_module.ACCOUNT_TRADE_MODE_DEMO
    env_type = account_config.get("type", account_config.get("env_type", ""))
    if env_type == "LIVE" and is_mt5_demo:
        return (
            False,
            "🚨 KRİTİK GÜVENLİK İHLALİ: Robot LIVE modunda seçili ama bağlanan MT5 hesabı DEMO!",
        )
    if env_type in ["DEMO", "TEST"] and not is_mt5_demo:
        return (
            False,
            "🚨 KRİTİK GÜVENLİK İHLALİ: Robot TEST modunda seçili ama bağlanan MT5 hesabı GERÇEK (LIVE)!",
        )
    return True, None
