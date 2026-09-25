import subprocess
import os
import sys
import threading

from src.utils.elevation import ELEVATED_HINT, is_elevated


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
            res = subprocess.run(
                ["git", "remote", "set-url", "origin", repo_url],
                cwd=project_root,
                capture_output=True,
                text=True,
            )
            if res.returncode != 0:
                subprocess.run(
                    ["git", "remote", "add", "origin", repo_url],
                    cwd=project_root,
                    capture_output=True,
                    text=True,
                )
        return True, ""

    # 2. Eğer klasörde .git YOKSA ve Token da yoksa
    if not repo_url:
        return (
            False,
            "Klasör Git'e bağlı değil ve 'github_token.txt' dosyası bulunamadı. Lütfen repo URL'nizi (Token dahil) içeren bu dosyayı ana klasöre oluşturun.",
        )

    # 3. .git yok ama Token varsa, SIFIRDAN İNŞA ET
    try:
        subprocess.run(
            ["git", "init"],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "remote", "add", "origin", repo_url],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "fetch", "origin"],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "reset", "--hard", f"origin/{branch}"],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "branch", "-M", branch],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        return True, "Git deposu başarıyla onarıldı ve eşitlendi."
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        return False, f"Sıfırdan kurulum hatası: {error_msg}"
    except Exception as e:
        return False, f"Beklenmeyen onarım hatası: {str(e)}"


def _git(args, project_root, check=False):
    return subprocess.run(
        ["git", *args], cwd=project_root, check=check, capture_output=True, text=True
    )


def _rollback_failed_pull(project_root, restorable, stashed):
    """Yarım kalan pull'u geri alır ve stash'lenen yerel değişiklikleri geri yükler.

    Windows'ta bir dosya kilitli/yetkisizse git pull ortada durur: bazı dosyalar yeni
    sürümdedir (ör. VERSION), HEAD eskidedir. Eskiden bu yarım hal ve 'auto-stash-before-pull'
    stash'i öylece kalıyordu. Yerel değişiklik yoksa veya stash'e alındıysa çalışma alanı
    güvenle HEAD'e döndürülür (ignore edilen configs/, logs/, .venv/ vb. dokunulmaz).
    """
    if not restorable:
        return
    _git(["reset", "--hard", "HEAD"], project_root)
    _git(["clean", "-fd"], project_root)
    if stashed:
        _git(["stash", "pop"], project_root)


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

    is_git_ok, error_message = ensure_git_repo(branch, project_root)
    if not is_git_ok:
        return False, error_message

    head = _git(["rev-parse", "HEAD"], project_root)
    old_head = head.stdout.strip() if head.returncode == 0 else ""

    status = _git(["status", "--porcelain"], project_root)
    clean_before = status.returncode == 0 and not status.stdout.strip()
    stashed = False
    if not clean_before:
        # Yerel değişiklikleri stash'le (kaybetme)
        stash_res = _git(["stash", "push", "-u", "-m", "auto-stash-before-pull"], project_root)
        stashed = stash_res.returncode == 0 and "No local changes" not in (stash_res.stdout or "")

    try:
        _git(["fetch", "origin", branch], project_root, check=True)
        result = _git(["pull", "origin", branch], project_root, check=True)
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        # Stash başarısızsa yerel değişiklikler hâlâ çalışma alanında: dokunma
        _rollback_failed_pull(project_root, restorable=clean_before or stashed, stashed=stashed)
        return False, f"Git Çekme Hatası: {error_msg}"

    if stashed:
        # Yerel değişiklikleri geri yükle; çakışırsa stash korunur, akış bozulmaz
        _git(["stash", "pop"], project_root)

    pip_ok, pip_message = _install_requirements_if_changed(project_root, old_head)
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

    is_git_ok, error_message = ensure_git_repo(branch, project_root)
    if not is_git_ok:
        return False, error_message

    try:
        subprocess.run(
            ["git", "fetch", "origin", branch],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )

        local_hash = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        remote_hash = subprocess.run(
            ["git", "rev-parse", f"origin/{branch}"],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

        has_update = local_hash != remote_hash

        try:
            version_file = os.path.join(project_root, "VERSION")
            with open(version_file, "r", encoding="utf-8") as f:
                local_ver = f.read().strip()
        except Exception:
            local_ver = "v1.0.0"

        try:
            remote_ver = subprocess.run(
                ["git", "show", f"origin/{branch}:VERSION"],
                cwd=project_root,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        except Exception:
            remote_ver = "Bilinmiyor"

        return True, (has_update, local_ver, remote_ver)
    except subprocess.CalledProcessError as e:
        # GERÇEK HATAYI BURADA YAKALIYORUZ!
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        return False, f"Bağlantı Hatası: {error_msg}"
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
