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

    from src.utils.paths import CONFIGS_DIR

    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    generic_path = os.path.join(CONFIGS_DIR, f"settings_{account_id}.json")

    # 🌟 KESİN ÇÖZÜM: Kopyalama yerine daima arayüzün kaydettiği güncel dosyayı okumayı tercih et!
    active_path = generic_path if os.path.exists(generic_path) else file_path

    # Eski Model 2 taşıması
    if engine_name == "Auto Grid" and not os.path.exists(active_path):
        old_file_path = get_settings_file("Model 2")
        if os.path.exists(old_file_path):
            try:
                os.rename(old_file_path, active_path)
            except Exception:
                pass

    if not os.path.exists(active_path):
        save_settings(DEFAULT_SETTINGS_AUTO_GRID, engine_name)
        return DEFAULT_SETTINGS_AUTO_GRID

    try:
        with open(active_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # JSON'dan gelen "SYMBOL" ve "ORDER_TYPE" gibi anahtarları küçük harfe dönüştür
        # (Motorun "symbol", "order_type" bekleyen bölümlerini çökertmemek için)
        if isinstance(data, dict):
            if "SYMBOL" in data and "symbol" not in data:
                data["symbol"] = data["SYMBOL"]
            if "ORDER_TYPE" in data and "order_type" not in data:
                data["order_type"] = data["ORDER_TYPE"]

        return data
    except Exception:
        return DEFAULT_SETTINGS_AUTO_GRID


def sanitize_settings(data):
    """Float değerlerdeki sapmaları ve gereksiz küsuratları temizler."""
    if isinstance(data, dict):
        return {k: sanitize_settings(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_settings(item) for item in data]
    elif isinstance(data, float):
        r5 = round(data, 5)
        r2 = round(r5, 2)
        if abs(r5 - r2) < 0.0002:
            return r2
        r3 = round(r5, 3)
        if abs(r5 - r3) < 0.0002:
            return r3
        return r5
    return data


def save_settings(settings_dict, engine_name: str = "Auto Grid"):
    """Yeni ayarları JSON dosyasına kaydeder."""
    file_path = get_settings_file(engine_name)
    sanitized = sanitize_settings(settings_dict)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(sanitized, f, indent=4)
