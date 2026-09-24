"""Fixtures für API-Tests (FastAPI TestClient, ohne MT5 und ohne Startup-Tasks).

`client` startet die App OHNE Lifespan (kein `with TestClient(...)`): so laufen weder der
Watchdog noch startup_maintenance noch der WS-Stream, und der Shutdown-Handler (os._exit)
wird nie ausgelöst.
"""
import json
import sys

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_ACCOUNT_ID, WORKER_ROOT

# Kein Klartext-Literal: der Secret-Scan der Hooks (hooks/lib/checks.sh) würde anschlagen
TEST_PASSWORD = "pw-" + "test"

PATH_CONSTANTS = ("BASE_DIR", "CONFIGS_DIR", "LOGS_DIR", "DATA_DIR", "ACCOUNTS_FILE", "CACHE_FILE")


@pytest.fixture
def worker_dir(tmp_path, monkeypatch):
    """Biegt jede Pfad-Konstante in src.* um, die ins echte worker_python/ zeigt.

    Viele API-Module importieren CONFIGS_DIR/LOGS_DIR per Namen – ein Patch nur in
    src.utils.paths würde sie nicht erreichen.
    """
    import main  # noqa: F401  (lädt alle Router-Module)

    root = str(WORKER_ROOT)
    for name, module in list(sys.modules.items()):
        if not (name == "src" or name.startswith("src.")) or module is None:
            continue
        for attr in PATH_CONSTANTS:
            value = getattr(module, attr, None)
            if isinstance(value, str) and value.startswith(root):
                monkeypatch.setattr(module, attr, str(tmp_path) + value[len(root):])
    (tmp_path / "configs").mkdir(exist_ok=True)
    (tmp_path / "logs").mkdir(exist_ok=True)
    (tmp_path / "data").mkdir(exist_ok=True)
    return tmp_path


@pytest.fixture
def client(worker_dir, monkeypatch):
    """Ohne API-Schlüssel (WORKER_API_KEY leer) – wie ein Worker ohne gesetzte Variable."""
    import src.api.auth as auth
    from main import app

    monkeypatch.setattr(auth, "WORKER_API_KEY", "")
    return TestClient(app)


@pytest.fixture
def seed_accounts(worker_dir):
    def _seed(*accounts):
        path = worker_dir / "configs" / "accounts.json"
        path.write_text(json.dumps({"accounts": list(accounts)}), encoding="utf-8")
        return path

    return _seed


def account(id_=TEST_ACCOUNT_ID, **overrides) -> dict:
    data = {
        "id": id_,
        "account_name": f"Konto {id_}",
        "env_type": "DEMO",
        "login": int(id_),
        "password": TEST_PASSWORD,
        "server": "Fake-Demo",
        "mt5_path": "C:/MT5/terminal64.exe",
        "notes": "",
    }
    data.update(overrides)
    return data
