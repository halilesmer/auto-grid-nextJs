# src/utils/config.py
import json
import os

# Merkezi yol yöneticisi
from src.utils.paths import get_settings_path

DEFAULT_SETTINGS_AUTO_GRID = {
    "GLOBAL_GRID_STEP": 0.05,
    "GLOBAL_TAKE_PROFIT": 0.05,
    "GLOBAL_DEFAULT_LOT": 0.01,
    "MAX_OPEN_POSITIONS": 999,
    "MAX_PRICE_LIMIT": 120.00,
    "MIN_PRICE_LIMIT": 20.00,
    "LOOP_INTERVAL_SECONDS": 1.0,
    "CLEAR_ON_ZONE_EXIT": True,
    "ZONES": [],
}


def get_settings_file(engine_name: str = "Auto Grid") -> str:
    """Hesap ID ve motor adına göre benzersiz bir dosya adı üretir."""
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    return get_settings_path(account_id, engine_name)


def load_settings(engine_name: str = "Auto Grid"):
    """JSON dosyasından ayarları okur. Eski Model 2 dosyası varsa otomatik göç (migration) yapar."""
    file_path = get_settings_file(engine_name)

    # 🌟 VERİ GÖÇÜ (MIGRATION): Kullanıcıların eski ayarları kaybolmasın diye Model 2'yi Auto Grid'e taşı
    if engine_name == "Auto Grid" and not os.path.exists(file_path):
        old_file_path = get_settings_file("Model 2")
        if os.path.exists(old_file_path):
            try:
                os.rename(old_file_path, file_path)
            except Exception:
                pass

    if not os.path.exists(file_path):
        save_settings(DEFAULT_SETTINGS_AUTO_GRID, engine_name)
        return DEFAULT_SETTINGS_AUTO_GRID

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_SETTINGS_AUTO_GRID


def save_settings(settings_dict, engine_name: str = "Auto Grid"):
    """Yeni ayarları JSON dosyasına kaydeder."""
    file_path = get_settings_file(engine_name)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(settings_dict, f, indent=4)
