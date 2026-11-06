"""BKT-21: GET /symbols/{id} liefert je Symbol `trade_sessions` (aus der MQL5-Exportdatei) oder null."""
import json

import pytest

import src.utils.mt5_helpers as mh
from src.utils import trade_sessions
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID

COSTS = {k: None for k in mh.SYMBOL_COST_FIELDS}
DAY = [[7200, 86400]]
WEEK = [[], DAY, DAY, DAY, DAY, DAY, []]


@pytest.fixture
def symbols(client, seed_accounts, monkeypatch, tmp_path):
    seed_accounts(account())
    trade_sessions.reset_cache()
    monkeypatch.setattr(mh, "_LAST_FETCH_ERROR", {})
    monkeypatch.setattr(mh, "_IN_FLIGHT", {})

    async def fetch(account_id, account_config, safe_log_fn):
        return [{"name": "XAUUSD", **COSTS}, {"name": "EURUSD", **COSTS}]

    monkeypatch.setattr(mh, "fetch_and_cache_symbols", fetch)
    monkeypatch.setenv("AUTOGRID_TRADE_SESSIONS_FILE", str(tmp_path / "sessions.json"))
    return tmp_path / "sessions.json"


def names(client):
    body = client.get(f"/api/symbols/{TEST_ACCOUNT_ID}").json()
    return {s["name"]: s.get("trade_sessions", "FEHLT") for s in body["symbols"]}


@pytest.mark.feature("BKT-21")
def test_ohne_datei_ist_trade_sessions_null(client, symbols):
    assert names(client) == {"XAUUSD": None, "EURUSD": None}


@pytest.mark.feature("BKT-21")
def test_mit_datei_haben_bekannte_symbole_einen_plan(client, symbols):
    symbols.write_text(json.dumps({"version": 1, "server": "Fake-Demo", "symbols": {"XAUUSD": WEEK}}), encoding="utf-8")
    assert names(client) == {"XAUUSD": WEEK, "EURUSD": None}


@pytest.mark.feature("BKT-21")
def test_datei_eines_anderen_servers_wird_nicht_benutzt(client, symbols):
    symbols.write_text(json.dumps({"version": 1, "server": "Anderer", "symbols": {"XAUUSD": WEEK}}), encoding="utf-8")
    assert names(client) == {"XAUUSD": None, "EURUSD": None}
