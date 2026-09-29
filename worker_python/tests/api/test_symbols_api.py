"""SYM-04 GET /symbols/{id}: leere Liste + MT5-Fehler → Feld „error“, damit das UI den Grund zeigt."""
import pytest

import src.utils.mt5_helpers as mh
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID


@pytest.fixture
def no_symbol_cache(monkeypatch):
    monkeypatch.setattr(mh, "_LAST_FETCH_ERROR", {})
    monkeypatch.setattr(mh, "_IN_FLIGHT", {})


@pytest.mark.feature("SYM-04")
def test_symbolfehler_wird_mitgeliefert(client, seed_accounts, no_symbol_cache, monkeypatch):
    seed_accounts(account())

    async def failing_fetch(account_id, account_config, safe_log_fn):
        raise Exception("[TIMEOUT] MT5 bağlantısı 15 sn içinde başlatılamadı")

    monkeypatch.setattr(mh, "fetch_and_cache_symbols", failing_fetch)
    body = client.get(f"/api/symbols/{TEST_ACCOUNT_ID}").json()

    assert body["symbols"] == []
    assert "[TIMEOUT]" in body["error"]


@pytest.mark.feature("SYM-04")
def test_ohne_fehler_kein_error_feld(client, seed_accounts, no_symbol_cache, monkeypatch):
    seed_accounts(account())

    async def ok_fetch(account_id, account_config, safe_log_fn):
        return [{"name": "USOUSD"}]

    monkeypatch.setattr(mh, "fetch_and_cache_symbols", ok_fetch)
    body = client.get(f"/api/symbols/{TEST_ACCOUNT_ID}").json()

    assert body["symbols"] == [{"name": "USOUSD"}]
    assert "error" not in body
