import os
import time

import psutil

# Soğuk açılışta (ör. VPS yeniden başladıktan sonra) terminal IPC'ye dakikalarca cevap
# vermeyebilir. Bu süreden genç bir terminal asılı değil, hâlâ açılıyordur. Başka bir
# bağlantı denemesinin (aynı süreçte veya bot_runner'da) başlattığı terminali öldürmek
# açılışı baştan başlatır; iki deneme birbirinin terminalini öldürüp durur.
MT5_BOOT_GRACE_SEC = 180


def kill_zombie_mt5(path, safe_log_fn, min_age_sec=MT5_BOOT_GRACE_SEC) -> int:
    """Asılı kalmış MT5 terminalini sonlandırır. Sonlandırılan süreç sayısını döner.

    GÜVENLİK: Yalnızca yolu `path` ile BİREBİR eşleşen terminal öldürülür. Yol verilmemişse
    veya bir sürecin yolu okunamıyorsa (ör. yönetici haklı) o süreç atlanır; aksi halde
    başka hesapların/uygulamaların terminalleri de kapanabilirdi.
    `min_age_sec`'ten genç (veya başlangıç zamanı okunamayan) terminal açılıyor sayılır
    ve öldürülmez.
    """
    if not path or not os.path.exists(path):
        return 0
    target = os.path.normpath(path).lower()
    target_exe = os.path.basename(target)
    killed = 0

    for proc in psutil.process_iter(["pid", "name", "exe", "create_time"]):
        try:
            p_name = (proc.info.get("name") or "").lower()
            p_exe = proc.info.get("exe")
            if p_name != target_exe or not p_exe:
                continue
            if os.path.normpath(p_exe).lower() != target:
                continue
            created = proc.info.get("create_time")
            age = time.time() - created if created else None
            if age is None or age < min_age_sec:
                age_txt = f"{age:.0f} sn önce başlatıldı" if age is not None else "başlangıç zamanı okunamadı"
                safe_log_fn(
                    f"MT5 terminali henüz açılıyor ({age_txt}), öldürülmüyor. PID: {proc.info['pid']}",
                    type="warning",
                )
                continue
            safe_log_fn(
                f"Asılı kalan MT5 terminali tespit edildi ({age:.0f} sn önce başlatıldı). "
                f"Öldürülüyor... PID: {proc.info['pid']}",
                type="warning",
            )
            proc.kill()
            proc.wait(timeout=10)
            killed += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, psutil.TimeoutExpired):
            pass
    return killed


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
        # initialize() şifre almaz: -10004 (RES_E_INTERNAL_FAIL_CONNECT, "No IPC connection")
        # terminalin IPC kanalına ulaşılamadığı anlamına gelir, şifre hatası değildir.
        safe_log_fn(
            f"🔴 MT5 terminaline IPC bağlantısı kurulamadı (-10004): Terminal hâlâ açılıyor veya yanıt vermiyor. (Hata: {last_err})",
            type="error",
        )
        return (
            False,
            f"[INIT] MT5 terminaline bağlanılamadı (IPC bağlantısı yok, hata kodu: {err_code}). "
            "Terminal hâlâ açılıyor olabilir; biraz bekleyip tekrar deneyin.",
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
