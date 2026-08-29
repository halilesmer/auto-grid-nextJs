# src/utils/bot_manager.py
import subprocess
import sys
import os
import time  # Bekleme (sleep) için eklendi
import datetime
from pathlib import Path

# Proje dizinini al ki utils klasöründeki dosyalara ulaşabilelim
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

# Gerekli bağlantı ve temizlik fonksiyonlarını içeri aktar
# Gereksiz importlar güvenlik temizliği kapsamında kaldırıldı

import psutil  # 🌟 YENİ: İşletim sistemi süreçlerini okumak için

# 🌟 YENİ: Merkezi yol yöneticisini içeri aktarıyoruz
from src.utils.paths import get_err_log_path, get_pid_path

def _read_pid(account_id: str):
    """PID dosyasını okur. Yoksa veya bozuksa None döner."""
    pid_file = get_pid_path(account_id)
    if not os.path.exists(pid_file):
        return None
    try:
        with open(pid_file, "r") as f:
            return int(f.read().strip())
    except Exception:
        return None


def _is_our_runner(pid: int, account_id: str) -> bool:
    """Verilen PID gerçekten BU hesaba ait canlı bir bot_runner mı?

    🔍 Kimlik doğrulama: PID + komut satırı (bot_runner.py + hesap ID).
    Port değiştiğinde veya dosyalar başka bilgisayara taşındığında PID yeni bir
    sürece verilmiş olsa bile, gerçekten bizim bot'umuz değilse 'çalışıyor' denmez
    ve öldürülmez. (is_bot_running ve stop_bot_process ortak kullanır.)
    """
    try:
        if not psutil.pid_exists(pid):
            return False

        p = psutil.Process(pid)
        if p.status() == psutil.STATUS_ZOMBIE:
            return False

        try:
            cmdline = " ".join(p.cmdline() or [])
        except Exception:
            cmdline = ""

        if "bot_runner.py" not in cmdline:
            return False
        if account_id not in cmdline:
            return False
        return True
    except Exception:
        return False


def is_bot_running(account_id: str) -> bool:
    """Robotun gerçekten (İşletim Sistemi seviyesinde) çalışıp çalışmadığını kontrol eder.

    🔍 GÜNCELLEME: PID + komut satırı doğrulaması. Port değiştiğinde veya dosyalar
    başka bilgisayara taşındığında PID yeniden kullanılsa bile, gerçekten bizim
    bot_runner.py'imiz değilse 'çalışıyor' denmez.
    """
    pid = _read_pid(account_id)
    if pid is None:
        return False

    if not _is_our_runner(pid, account_id):
        # Başka bir süreç bu PID'yi kapmış olabilir → çöp dosyayı temizle
        self_cleanup(account_id)
        return False

    return True


def self_cleanup(account_id: str):
    """Çalışmayan bir bota ait PID dosyasını temizler. (Sadece dosya, MT5'e dokunmaz)"""
    try:
        os.remove(get_pid_path(account_id))
    except OSError:
        pass


def _detached_popen(cmd, stdout, stderr, env):
    """Streamlit'ten BAĞIMSIZ bir süreç başlatır.

    WinError 232 (0x800700E8) KORUMASI: Streamlit arayüzü kendi standart girdilerini (stdin)
    sarmaladığı için, alt süreçler bunu devralmaya (inherit) çalıştığında pipe (boru hattı)
    çöker. stdin=subprocess.DEVNULL eklenerek bu kopma engellenmiştir.
    """
    if os.name == "nt":
        cwd = str(project_root)
        creation_flags_attempts = [
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW,
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
        ]
        last_err = None
        for flags in creation_flags_attempts:
            try:
                return subprocess.Popen(
                    cmd,
                    stdin=subprocess.DEVNULL,
                    stdout=stdout,
                    stderr=stderr,
                    text=True,
                    env=env,
                    cwd=cwd,
                    creationflags=flags,
                )
            except OSError as e:
                last_err = e
        raise last_err
    return subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=stdout,
        stderr=stderr,
        text=True,
        env=env,
        start_new_session=True,  # Yeni oturum: ana arayüzden gelen sinyallerden izole
    )


def start_bot_process(account_id: str, engine_name: str = "Auto Grid") -> bool:
    """Belirli bir hesap için izole bir Subprocess (alt süreç) başlatır."""
    if is_bot_running(account_id):
        return True  # Zaten çalışıyor

    log_file = None
    try:
        # Her hesaba özel log dosyası oluştur (Klasör kontrolü paths.py içinde yapılır)
        log_file_path = get_err_log_path(account_id)

        # Log dosyasını 'append' (ekleme) modunda aç
        log_file = open(log_file_path, "a", encoding="utf-8")

        # Ortam değişkenini arayüzden bağımsız şekilde alt sürece ilet
        env = dict(os.environ)
        env["ACTIVE_ACCOUNT_ID"] = account_id

        # Ayrı bir Python programı olarak botu tetikle. (Detach edilmiş süreç)
        process = _detached_popen(
            [sys.executable, "-u", "src/core/bot_runner.py", account_id, engine_name],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env=env,
        )

        # 🌟 YENİ: Sürecin ID'sini (PID) kalıcı olarak diske yaz! (RAM sıfırlansa da ölmez)
        pid_file = get_pid_path(account_id)
        with open(pid_file, "w") as f:
            f.write(str(process.pid))

        return True

    except Exception as e:
        # Profesyonel hata yakalama: Çökme durumunda arayüze net bilgi ver
        detail = str(e)
        if isinstance(e, OSError):
            winerr = getattr(e, "winerror", None)
            errno_ = getattr(e, "errno", None)
            filename = getattr(e, "filename", None)
            detail = (
                f"WinError {winerr} (0x{winerr & 0xFFFFFFFF:08X}) | errno={errno_} | "
                f"{str(e)} | dosya/kısım: {filename if filename else 'yok'}"
            )
        # Subprocess içinde streamlit yok; sadece log'a yaz
        print(f"🚨 Sistem Hatası: {account_id} için robot başlatılamadı!\nDetay: {detail}")
        try:
            err_path = get_err_log_path(account_id)

            with open(err_path, "a", encoding="utf-8") as f:
                f.write(
                    f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] "
                    f"[START_ERROR] {detail}\n"
                )
        except Exception:
            pass
        return False
    finally:
        # GÜVENLİK DÜZELTMESİ: Açılan dosya akışı (file descriptor) hafızada kilitli kalmasın diye kapatılıyor
        if log_file is not None:
            try:
                log_file.close()
            except Exception:
                pass


def stop_bot_process(account_id: str) -> bool:
    """
    🟡 Botu YALNIZCA durdurur. Hiçbir pozisyon veya bekleyen emre DOKUNMAZ.

    🚀 PHASE 4: MT5'e bağlanıp emir silme / pozisyon kapatma mantığı KALDIRILDI.
    İşlemler broker'da olduğu gibi kalır; bot kapatılır, arkasında iz bırakılmaz.
    """
    killed_any = False

    # Keskin Nişancı Mantığı: Sadece PID dosyasına güvenme, işletim sistemindeki tüm süreçleri tara!
    # Böylece diğer Python uygulamaları (veya başka hesapların robotları) asla zarar görmez.
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            # Sadece python süreçlerini filtrele (performans)
            if proc.info.get("name") and "python" not in proc.info["name"].lower():
                continue
            cmdline = proc.info.get("cmdline") or []
            cmdline_str = " ".join(cmdline)

            # SADECE bot_runner.py olan ve spesifik ACCOUNT_ID barındıran süreci avla
            if "bot_runner.py" in cmdline_str and str(account_id) in cmdline_str:
                if os.name == "nt":
                    subprocess.call(
                        ["taskkill", "/F", "/T", "/PID", str(proc.info["pid"])],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except psutil.TimeoutExpired:
                        proc.kill()

                killed_any = True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    if killed_any:
        # Subprocess'in gerçekten kapanması için işletim sistemine 1 saniye nefes payı ver
        time.sleep(1.0)

    self_cleanup(account_id)
    return True
