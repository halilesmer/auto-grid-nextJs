import json
import os
import glob
from typing import Optional

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")
LOGS_DIR = os.path.join(BASE_DIR, "logs")
ACCOUNTS_FILE = os.path.join(CONFIGS_DIR, "accounts.json")


def _load_accounts() -> list:
    """accounts.json → list[dict]"""
    if not os.path.exists(ACCOUNTS_FILE):
        return []
    with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        return data.get("accounts", [])
    return data


def _save_accounts(accounts: list) -> None:
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump({"accounts": accounts}, f, indent=4, ensure_ascii=False)


def _find_settings_file(account_id: str) -> Optional[str]:
    exact = os.path.join(CONFIGS_DIR, f"settings_{account_id}.json")
    if os.path.exists(exact):
        return exact
    pattern = os.path.join(CONFIGS_DIR, f"settings_{account_id}_*.json")
    matches = glob.glob(pattern)
    return matches[0] if matches else None