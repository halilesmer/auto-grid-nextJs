import os
import sys
import socket
import subprocess
import time
import webbrowser
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VENV_DIR = PROJECT_ROOT / ".venv"
REQUIREMENTS_FILE = PROJECT_ROOT / "requirements.txt"


def ensure_venv_and_requirements():
    """Sanal ortam ve kütüphaneler eksikse otomatik kurar ve onarır."""
    python_exe = sys.executable

    # 1. .venv var mı?
    if not VENV_DIR.exists():
        print("⚙️ .venv ortamı bulunamadı, oluşturuluyor...")
        subprocess.run([python_exe, "-m", "venv", str(VENV_DIR)], check=True)

    venv_python = VENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    is_windows = os.name == "nt"

    # 🌟 OTOMATİK DÜZELTME (SELF-HEALING): requirements.txt dosyasını kontrol et ve eksikleri tamamla
    if REQUIREMENTS_FILE.exists():
        try:
            with open(REQUIREMENTS_FILE, "r", encoding="utf-8") as f:
                req_content = f.read().lower()

            missing_reqs = []
            if "plotly" not in req_content:
                missing_reqs.append("plotly")

            if missing_reqs:
                with open(REQUIREMENTS_FILE, "a", encoding="utf-8") as f:
                    for req in missing_reqs:
                        f.write(f"\n{req}\n")
        except Exception:
            pass

    # 2. Kütüphaneler yüklü mü? (Akıllı Kontrol)
    try:
        check_cmd = (
            "import streamlit, pandas, ccxt, psutil, MetaTrader5, plotly"
            if is_windows
            else "import streamlit, pandas, ccxt, psutil, plotly"
        )
        subprocess.run(
            [str(venv_python), "-c", check_cmd],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        print("📦 Eksik kütüphaneler tespit edildi, arka planda otomatik yükleniyor...")
        if is_windows:
            subprocess.run(
                [
                    str(venv_python),
                    "-m",
                    "pip",
                    "install",
                    "-r",
                    str(REQUIREMENTS_FILE),
                ],
                check=True,
                capture_output=True,
            )
        else:
            # MetaTrader5 macOS'te kurulamaz, hatayı yakala ve diğerlerini kur
            result = subprocess.run(
                [
                    str(venv_python),
                    "-m",
                    "pip",
                    "install",
                    "-r",
                    str(REQUIREMENTS_FILE),
                ],
                capture_output=True,
                text=True,
            )
            combined_output = (result.stderr or "") + (result.stdout or "")
            if result.returncode != 0 and "MetaTrader5" in combined_output:
                print(
                    "⚠️ MetaTrader5 macOS'te bulunamadı, diğer kütüphaneler kuruluyor..."
                )
                subprocess.run(
                    [
                        str(venv_python),
                        "-m",
                        "pip",
                        "install",
                        "streamlit",
                        "pandas",
                        "ccxt",
                        "psutil",
                        "plotly",
                    ],
                    check=True,
                )

    return venv_python


def wait_for_server_and_open_browser(port, timeout=30):
    url = f"http://localhost:{port}"
    start_time = time.time()
    while time.time() - start_time < timeout:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", int(port))) == 0:
                time.sleep(0.5)
                webbrowser.open(url)
                return True
        time.sleep(0.5)
    webbrowser.open(url)
    return False


def main():
    venv_python = ensure_venv_and_requirements()

    # Portu çevre değişkeninden al (Statik PWA uyumluluğu için)
    port = os.getenv("STREAMLIT_PORT", "8501")

    # 🛡️ GÜVENLİK: Arka planda takılı kalmış eski Streamlit botlarını temizle
    import psutil

    for p in psutil.process_iter(["cmdline"]):
        try:
            cmd = p.info.get("cmdline")
            if (
                cmd
                and "streamlit" in " ".join(cmd).lower()
                and str(port) in " ".join(cmd)
            ):
                p.kill()
        except Exception:
            pass

    # Tarayıcıyı sadece kullanıcı ilk tıkladığında aç (Güncellemelerde sekme spam'i yapmaz)
    open_browser = "--open-browser" in sys.argv

    print(f"🚀 Uygulama {port} portunda başlatılıyor...")

    cmd = [
        str(venv_python),
        "-m",
        "streamlit",
        "run",
        "app.py",
        "--server.port",
        str(port),
        "--server.headless",
        "true",
    ]

    # 🛡️ GÜVENLİK: Windows'ta cmd penceresinin açılmasını KESİN OLARAK engeller (CREATE_NO_WINDOW = 0x08000000)
    creation_flags = 0x08000000 if os.name == "nt" else 0
    process = subprocess.Popen(cmd, cwd=str(PROJECT_ROOT), creationflags=creation_flags)

    if open_browser:
        wait_for_server_and_open_browser(int(port))

    try:
        process.wait()
    except KeyboardInterrupt:
        process.terminate()


if __name__ == "__main__":
    main()
