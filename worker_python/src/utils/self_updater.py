import subprocess
import os
import sys


def get_project_root():
    """Projenin ana klasör yolunu güvenli bir şekilde döndürür."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))


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


def execute_git_pull(branch="master"):
    """
    Belirtilen branch üzerinden güvenli ve çakışmasız 'git pull' çalıştırır.
    """
    project_root = get_project_root()

    is_git_ok, error_message = ensure_git_repo(branch, project_root)
    if not is_git_ok:
        return False, error_message

    try:
        subprocess.run(
            ["git", "reset", "--hard"],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "fetch", "origin", branch],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        result = subprocess.run(
            ["git", "pull", "origin", branch],
            cwd=project_root,
            check=True,
            capture_output=True,
            text=True,
        )
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else e.stdout.strip()
        return False, f"Git Çekme Hatası: {error_msg}"


def hard_restart_server():
    project_root = get_project_root()
    launcher_script = os.path.join(project_root, "scripts", "launcher.py")
    os.execl(sys.executable, sys.executable, launcher_script)


def check_for_updates(branch="test"):
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
