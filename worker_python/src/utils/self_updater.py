import subprocess
import os
import sys
import threading

import psutil

from src.utils.elevation import ELEVATED_HINT, is_elevated

# Ölçüm 2026-10-31 (Mac → GitHub): değişiklik yokken fetch 0,6 sn, tüm geçmiş (5,6 MB) 1,5 sn.
# 120 sn bunun 80 katı: yavaş VPS ağına ve checkout'u yavaşlatan antivirüse pay bırakır,
# 5 dakikalık AUTO_UPDATE_MINUTES aralığının da altında kalır.
GIT_NETWORK_TIMEOUT_SEC = 120
# Ağsız komutlar (rev-parse, status, stash, reset, diff) burada milisaniye sürer; VPS'te ölçülmedi.
GIT_LOCAL_TIMEOUT_SEC = 60
# Öldürülen ağacın pipe'larının kapanması için üst sınır
GIT_KILL_WAIT_SEC = 5


class GitTimeout(Exception):
    """Mesaj yalnız alt komutu taşır: `remote set-url` argümanı github_token.txt'teki token'dır,
    TimeoutExpired metni ise bunu log'a ve /system/worker/status'a taşırdı."""

    def __init__(self, subcommand, seconds):
        super().__init__(f"git {subcommand}: {seconds:g} sn içinde bitmedi, durduruldu")


def get_project_root():
    """Projenin ana klasör yolunu güvenli bir şekilde döndürür."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))


def ensure_git_repo(branch, project_root):
    """
    Gizli .git klasörünü kontrol eder. Eğer yoksa sıfırdan kurar.
    Eğer .git varsa ama yetkisizse, github_token.txt dosyasını okuyarak
    linki kendi kendine tamir eder.
    """
    git_dir = os.path.join(project_root, ".git")
    token_file = os.path.join(project_root, "github_token.txt")

    repo_url = None
    if os.path.exists(token_file):
        try:
            with open(token_file, "r", encoding="utf-8") as f:
                repo_url = f.read().strip()
            if not repo_url.startswith("http"):
                return (
                    False,
                    "github_token.txt içindeki URL geçersiz. 'https://...' ile başlamalı.",
                )
        except Exception as e:
            return False, f"Token dosyası okunamadı: {str(e)}"

    # 1. Eğer klasörde .git ZATEN VARSA
    if os.path.isdir(git_dir):
        if repo_url:
            # Önce set-url yapmayı dene, eğer origin yoksa add yap
            res = _git(["remote", "set-url", "origin", repo_url], project_root)
            if res.returncode != 0:
                _git(["remote", "add", "origin", repo_url], project_root)
        return True, ""

    # 2. Eğer klasörde .git YOKSA ve Token da yoksa
    if not repo_url:
        return (
            False,
            "Klasör Git'e bağlı değil ve 'github_token.txt' dosyası bulunamadı. Lütfen repo URL'nizi (Token dahil) içeren bu dosyayı ana klasöre oluşturun.",
        )

    # 3. .git yok ama Token varsa, SIFIRDAN İNŞA ET
    try:
        _git(["init"], project_root, check=True)
        _git(["remote", "add", "origin", repo_url], project_root, check=True)
        _git(["fetch", "origin"], project_root, check=True, timeout=GIT_NETWORK_TIMEOUT_SEC)
        _git(["reset", "--hard", f"origin/{branch}"], project_root, check=True)
        _git(["branch", "-M", branch], project_root, check=True)
        return True, "Git deposu başarıyla onarıldı ve eşitlendi."
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        return False, f"Sıfırdan kurulum hatası: {error_msg}"
    except GitTimeout as e:
        return False, f"Sıfırdan kurulum hatası: {e}"
    except Exception as e:
        return False, f"Beklenmeyen onarım hatası: {str(e)}"


def _kill_process_tree(process):
    """git'i ve alt süreçlerini (git-remote-https) öldürür, pipe'ların kapanmasını sınırlı bekler.

    subprocess.run(timeout=...) burada yetmez: Windows'ta kill'den sonra süresiz communicate()
    çağırır ve pipe'ları tutan git-remote-https yaşadıkça aynı yerde asılı kalır.
    """
    try:
        root = psutil.Process(process.pid)
        members = [*root.children(recursive=True), root]
    except psutil.NoSuchProcess:  # süre dolarken kendiliğinden bitti
        members = []
    except psutil.Error as e:  # ağaç okunamadıysa en azından git'in kendisi öldürülür
        print(f"⚠️ [UPDATE] git süreç ağacı okunamadı: {e!r}")
        members = []
        process.kill()
    for member in members:
        try:
            member.kill()
        except psutil.NoSuchProcess:  # kardeşi ölünce kendiliğinden kapandı
            pass
        except psutil.Error as e:  # kapanmayan süreç updater'ı durdurmamalı, aşağıda sınırlı beklenir
            print(f"⚠️ [UPDATE] git süreci öldürülemedi: {e!r}")
    try:
        process.communicate(timeout=GIT_KILL_WAIT_SEC)
    except subprocess.TimeoutExpired:
        # Windows'ta okuma iş parçacıkları arka planda kalır, updater devam eder
        print(f"⚠️ [UPDATE] git süreci (pid {process.pid}) {GIT_KILL_WAIT_SEC} sn içinde kapanmadı")


def _git(args, project_root, check=False, timeout=None):
    """git çalıştırır. Süre dolarsa süreç ağacını öldürür ve GitTimeout fırlatır.
    timeout verilmezse GIT_LOCAL_TIMEOUT_SEC geçerlidir; ağa çıkan komutlar kendi sınırını verir."""
    limit = GIT_LOCAL_TIMEOUT_SEC if timeout is None else timeout
    command = ["git", *args]
    process = subprocess.Popen(
        command, cwd=project_root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    try:
        stdout, stderr = process.communicate(timeout=limit)
    except subprocess.TimeoutExpired:
        _kill_process_tree(process)
        raise GitTimeout(args[0], limit) from None  # cause komutu, yani token'ı taşır
    if check and process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, command, stdout, stderr)
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def _remove_stale_index_lock(project_root):
    """Öldürülen git kilidini silemez; kilit kalırsa sonraki her reset ve pull düşer."""
    try:
        os.remove(os.path.join(project_root, ".git", "index.lock"))
    except FileNotFoundError:  # git indekse dokunmadan durduruldu
        pass
    except OSError as e:  # çağıran zaten hata döner; reset de düşerse mesajda görünür
        print(f"⚠️ [UPDATE] index.lock silinemedi: {e!r}")


def _rollback_failed_pull(project_root, old_head, restorable, stashed):
    """Yarım kalan pull'u geri alır ve stash'lenen yerel değişiklikleri geri yükler.

    Windows'ta bir dosya kilitli/yetkisizse git pull ortada durur: bazı dosyalar yeni
    sürümdedir (ör. VERSION), HEAD eskidedir. Eskiden bu yarım hal ve 'auto-stash-before-pull'
    stash'i öylece kalıyordu. Yerel değişiklik yoksa veya stash'e alındıysa çalışma alanı
    güvenle pull öncesine döndürülür (ignore edilen configs/, logs/, .venv/ vb. dokunulmaz).
    HEAD değil old_head: süresi dolan pull ref'i taşımış olabilir.

    Döner: hata mesajına eklenecek metin ("" = geri alındı veya dokunulmadı).
    """
    if not restorable:
        return ""
    try:
        _git(["reset", "--hard", old_head or "HEAD"], project_root, check=True)
        _git(["clean", "-fd"], project_root, check=True)
        if stashed:
            _git(["stash", "pop"], project_root)
    except subprocess.CalledProcessError as e:
        return f"\nGeri alma tamamlanamadı: {(e.stderr or e.stdout).strip()}"
    except GitTimeout as e:
        _remove_stale_index_lock(project_root)
        return f"\nGeri alma tamamlanamadı: {e}"
    return ""


REQUIREMENTS_REL = "worker_python/requirements.txt"


def _pip_install(requirements_path):
    """Worker'ın kendi Python'u (.venv) ile bağımlılıkları kurar."""
    return subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", requirements_path],
        capture_output=True,
        text=True,
    )


def _install_requirements_if_changed(project_root, old_head):
    """Pull requirements.txt'yi değiştirdiyse pip install çalıştırır.

    Döner: (ok, mesaj). Değişiklik yoksa (True, ""). Eskiden yeni bir paket gelince
    worker yeniden başlarken ImportError ile çöküyor, VPS'te elle pip gerekiyordu.
    """
    if not old_head:
        return True, ""
    diff = _git(["diff", "--name-only", old_head, "HEAD", "--", REQUIREMENTS_REL], project_root)
    if diff.returncode != 0 or not diff.stdout.strip():
        return True, ""
    res = _pip_install(os.path.join(project_root, *REQUIREMENTS_REL.split("/")))
    if res.returncode != 0:
        tail = (res.stderr or res.stdout or "").strip()[-800:]
        return False, f"pip install hatası (requirements.txt değişti): {tail}"
    return True, "requirements.txt değişti, bağımlılıklar kuruldu (pip install)."


def execute_git_pull(branch="main"):
    """
    Belirtilen branch üzerinden güvenli ve çakışmasız 'git pull' çalıştırır.
    Başarısız olursa çalışma alanını pull öncesi haline döndürür.
    requirements.txt değiştiyse bağımlılıkları da kurar; pip başarısızsa False döner
    (yeniden başlatma yapılmaz, çünkü yeni kod eksik paketle çökerdi).
    Yönetici haklarıyla çalışan süreçte hiç başlamaz: git dosyaları yöneticiye ait yapar,
    sonraki normal güncellemeler "Permission denied" ile düşerdi.
    """
    if is_elevated():
        return False, f"Güncelleme yapılmadı: {ELEVATED_HINT}"

    project_root = get_project_root()
    old_head = ""
    stashed = False
    restorable = False  # stash netleşmeden çalışma alanına dokunulmaz

    try:
        is_git_ok, error_message = ensure_git_repo(branch, project_root)
        if not is_git_ok:
            return False, error_message

        head = _git(["rev-parse", "HEAD"], project_root)
        old_head = head.stdout.strip() if head.returncode == 0 else ""

        status = _git(["status", "--porcelain"], project_root)
        clean_before = status.returncode == 0 and not status.stdout.strip()
        if not clean_before:
            # Yerel değişiklikleri stash'le (kaybetme)
            stash_res = _git(["stash", "push", "-u", "-m", "auto-stash-before-pull"], project_root)
            stashed = stash_res.returncode == 0 and "No local changes" not in (stash_res.stdout or "")
        # Stash başarısızsa yerel değişiklikler hâlâ çalışma alanında: dokunma
        restorable = clean_before or stashed

        _git(["fetch", "origin", branch], project_root, check=True, timeout=GIT_NETWORK_TIMEOUT_SEC)
        result = _git(["pull", "origin", branch], project_root, check=True, timeout=GIT_NETWORK_TIMEOUT_SEC)

        if stashed:
            # Yerel değişiklikleri geri yükle; çakışırsa stash korunur, akış bozulmaz.
            # Pop yarıda kesilirse değişikliğin nerede olduğu belli değil: reset onu silebilirdi
            restorable = False
            _git(["stash", "pop"], project_root)

        pip_ok, pip_message = _install_requirements_if_changed(project_root, old_head)
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        rollback_note = _rollback_failed_pull(project_root, old_head, restorable, stashed)
        return False, f"Git Çekme Hatası: {error_msg}{rollback_note}"
    except GitTimeout as e:
        _remove_stale_index_lock(project_root)
        rollback_note = _rollback_failed_pull(project_root, old_head, restorable, stashed)
        return False, f"Git Çekme Hatası: {e}{rollback_note}"

    message = "\n".join(m for m in (result.stdout.strip(), pip_message) if m)
    return pip_ok, message


# run_uvicorn_watchdog.bat bunu 1 yapar: süreç bitince aynı pencere yeni kodla yeniden başlatır.
SUPERVISED_ENV = "WORKER_SUPERVISED"
RESTART_DELAY_SEC = 1.5


def schedule_restart(delay: float = RESTART_DELAY_SEC) -> bool:
    """Güncellemeden sonra worker'ı yeni kodla yeniden başlatır.

    Süreç kendini `delay` saniye sonra kapatır (HTTP yanıtı önce gönderilsin diye);
    run_uvicorn_watchdog.bat 3 sn içinde main.py'yi yeniden başlatır. Botlar ayrı süreçtir,
    çalışmaya devam eder; yeni worker açılışta eski sürümle çalışanları yeniden başlatır
    (startup_maintenance). Watchdog altında değilse (ör. elle `python main.py`) kapatmaz,
    False döner – yeniden başlatma elle yapılmalı.

    Eskiden hard_restart_server olmayan scripts/launcher.py'yi çağırıyordu.
    """
    if os.environ.get(SUPERVISED_ENV) != "1":
        return False
    timer = threading.Timer(delay, os._exit, args=(0,))
    timer.daemon = True
    timer.start()
    return True


def check_for_updates(branch="main"):
    """
    Yerel (local) depo ile GitHub (origin) deposu arasındaki Git commit hash'lerini
    karşılaştırarak yeni bir güncelleme olup olmadığını %100 doğrulukla test eder.
    """
    project_root = get_project_root()

    try:
        is_git_ok, error_message = ensure_git_repo(branch, project_root)
        if not is_git_ok:
            return False, error_message

        _git(["fetch", "origin", branch], project_root, check=True, timeout=GIT_NETWORK_TIMEOUT_SEC)

        local_hash = _git(["rev-parse", "HEAD"], project_root, check=True).stdout.strip()
        remote_hash = _git(["rev-parse", f"origin/{branch}"], project_root, check=True).stdout.strip()

        has_update = local_hash != remote_hash

        try:
            version_file = os.path.join(project_root, "VERSION")
            with open(version_file, "r", encoding="utf-8") as f:
                local_ver = f.read().strip()
        except Exception:
            local_ver = "v1.0.0"

        try:
            remote_ver = _git(["show", f"origin/{branch}:VERSION"], project_root, check=True).stdout.strip()
        except Exception:
            remote_ver = "Bilinmiyor"

        return True, (has_update, local_ver, remote_ver)
    except subprocess.CalledProcessError as e:
        # GERÇEK HATAYI BURADA YAKALIYORUZ!
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        return False, f"Bağlantı Hatası: {error_msg}"
    except GitTimeout as e:
        return False, f"Bağlantı Hatası: {e}"
    except Exception as e:
        return False, f"Sistem Hatası: {str(e)}"


def current_branch():
    """Yerel deponun aktif branch'i (okunamazsa "")."""
    res = _git(["rev-parse", "--abbrev-ref", "HEAD"], get_project_root())
    return res.stdout.strip() if res.returncode == 0 else ""


def _cli(argv):
    """VPS'te worker dışından güncelleme (ops/windows/vps.ps1, yönetici OLMAYAN görev):

        python -m src.utils.self_updater update   # pull + gerekirse pip; çıkış kodu 0/1
        python -m src.utils.self_updater check    # JSON: has_update, local_ver, remote_ver
    """
    import json

    command = argv[1] if len(argv) > 1 else ""
    if command == "update":
        ok, message = execute_git_pull("main")
        print(message)
        return 0 if ok else 1
    if command == "check":
        ok, data = check_for_updates("main")
        if not ok:
            print(json.dumps({"error": str(data)}))
            return 1
        has_update, local_ver, remote_ver = data
        print(json.dumps({"has_update": has_update, "local_ver": local_ver, "remote_ver": remote_ver}))
        return 0
    print(_cli.__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(_cli(sys.argv))
