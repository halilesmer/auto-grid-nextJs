# src/utils/paths.py
import os
import re
from pathlib import Path

# Projenin kök dizinini dinamik olarak bul (proje taşınsa da çalışır)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

CONFIGS_DIR = os.path.join(PROJECT_ROOT, "configs")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
LOGS_DIR = os.path.join(PROJECT_ROOT, "logs")


def _ensure_dir(path):
    """Verilen klasörün var olduğundan emin olur."""
    os.makedirs(path, exist_ok=True)
    return path


def _ensure_logs_dir():
    return _ensure_dir(LOGS_DIR)


def _ensure_configs_dir():
    return _ensure_dir(CONFIGS_DIR)


def _ensure_data_dir():
    return _ensure_dir(DATA_DIR)


def safe_account_id(account_id) -> str:
    """Güvenlik: Hesap ID dosya adı olarak kullanılacağı için
    sadece rakamları kabul eder. (MT5 login numaraları tamamen sayısaldır)"""
    cleaned = re.sub(r"\D", "", str(account_id))
    return cleaned or "unknown"


# ══════════════════════════════════════════════════════════
# 1. HESAP AYARLARI (configs/) — Sadece MT5 Login ID'ye bağlı
# ══════════════════════════════════════════════════════════
def get_settings_path(account_id: str, engine_name: str = "Auto Grid") -> str:
    """Örn: configs/settings_7946558_Auto_Grid.json
    Dosya adında port veya makine adı YOK."""
    safe_engine = engine_name.replace(" ", "_")
    safe = safe_account_id(account_id)
    return os.path.join(_ensure_configs_dir(), f"settings_{safe}_{safe_engine}.json")


# ══════════════════════════════════════════════════════════
# 2. SİSTEM DURUMU / HAFIZA (data/) — Kaynağı MT5, adı Account ID
# ══════════════════════════════════════════════════════════
def get_state_path(account_id: str) -> str:
    """Örn: data/state_7946558.json
    Açık pozisyonlar, bekleyen emirler, aktif bölgeler, PID, zaman damgası."""
    safe = safe_account_id(account_id)
    return os.path.join(_ensure_data_dir(), f"state_{safe}.json")


# ══════════════════════════════════════════════════════════
# 3. LOGLAR VE CANLI KÖPRÜLER (logs/) — Her Hesap İçin İzole Klasör
# ══════════════════════════════════════════════════════════
def get_account_log_dir(account_id: str) -> str:
    """Her hesabın kendine ait log klasörünü oluşturur (Örn: logs/7942034)"""
    safe = safe_account_id(account_id)
    path = os.path.join(LOGS_DIR, safe)
    _ensure_dir(path)
    return path


def migrate_orphan_logs(account_id: str):
    """
    Sadece sistem ilk açıldığında (startup) bir kez çalışır.
    Ana logs/ klasöründe serbest duran ve bu hesaba ait olan eski log/json
    dosyalarını ilgili hesap klasörünün içine güvenle taşır.
    """
    safe = safe_account_id(account_id)
    target_dir = get_account_log_dir(safe)

    if os.path.exists(LOGS_DIR):
        try:
            for file_name in os.listdir(LOGS_DIR):
                file_path = os.path.join(LOGS_DIR, file_name)
                # Sadece dosya olan ve adında hesap ID'si geçenleri hedef al (örnek: err_234234.log)
                if os.path.isfile(file_path) and safe in file_name:
                    dest_path = os.path.join(target_dir, file_name)
                    if not os.path.exists(dest_path):
                        os.replace(file_path, dest_path)
        except Exception:
            pass


def get_err_log_path(account_id: str) -> str:
    safe = safe_account_id(account_id)
    return os.path.join(get_account_log_dir(account_id), f"err_{safe}.log")


def get_ui_state_path(account_id: str) -> str:
    safe = safe_account_id(account_id)
    return os.path.join(get_account_log_dir(account_id), f"ui_{safe}.json")


def get_metrics_path(account_id: str) -> str:
    safe = safe_account_id(account_id)
    return os.path.join(get_account_log_dir(account_id), f"met_{safe}.json")


def get_symbols_path(account_id: str) -> str:
    safe = safe_account_id(account_id)
    return os.path.join(get_account_log_dir(account_id), f"symbols_{safe}.json")


def get_sim_price_path(account_id: str) -> str:
    safe = safe_account_id(account_id)
    return os.path.join(get_account_log_dir(account_id), f"sim_{safe}.json")


def get_pid_path(account_id: str) -> str:
    safe = safe_account_id(account_id)
    return os.path.join(get_account_log_dir(account_id), f"pid_{safe}.txt")


def get_mt5_backup_dir(account_id: str) -> str:
    """MT5 terminal loglarının kopyalanacağı hesap içi alt klasör"""
    return _ensure_dir(os.path.join(get_account_log_dir(account_id), "mt5_terminal"))
