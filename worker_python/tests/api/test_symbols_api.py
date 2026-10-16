"""GET /symbols/{id}.

SYM-01: Liste aus broker_symbols.json, 1-h-Cache, keine eigene MT5-Verbindung während /start oder /stop.
SYM-04: leere Liste + MT5-Fehler → Feld „error“, damit das UI den Grund zeigt.
"""
import asyncio
import json
import os
import time
from pathlib import Path

import pytest

import src.utils.bot_watchdog as wd
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


# --- SYM-01: Liste aus broker_symbols.json, Cache, keine eigene MT5-Verbindung während /start ---

# Ohne die Kostenfelder (BKT-04) gilt ein Cache-Eintrag nie als frisch
COSTS = {k: None for k in mh.SYMBOL_COST_FIELDS}
USO = {"name": "USOUSD", "digits": 3, "point": 0.001, **COSTS}
XAU = {"name": "XAUUSD", "digits": 2, "point": 0.01, **COSTS}


@pytest.fixture
def symbol_source(worker_dir, no_symbol_cache, monkeypatch):
    """broker_symbols.json im tmp-Verzeichnis + gezählte Fake-MT5-Abfrage."""
    cache = Path(mh.CACHE_FILE)
    assert str(cache).startswith(str(worker_dir))  # nie die echte Datei
    calls = []

    async def fake_fetch(account_id, account_config, safe_log_fn):
        calls.append(account_id)
        cache.write_text(json.dumps({account_id: {"USOUSD": USO, "XAUUSD": XAU}}))
        return [USO, XAU]

    monkeypatch.setattr(mh, "fetch_and_cache_symbols", fake_fetch)

    def write_cache(age_seconds):
        cache.write_text(json.dumps({TEST_ACCOUNT_ID: {"USOUSD": USO}}))
        t = time.time() - age_seconds
        os.utime(cache, (t, t))

    return calls, write_cache


def _names(response):
    assert response.status_code == 200
    return [s["name"] for s in response.json()["symbols"]]


@pytest.mark.feature("SYM-01")
def test_frischer_cache_kommt_aus_broker_symbols_json_ohne_mt5(client, seed_accounts, symbol_source):
    calls, write_cache = symbol_source
    seed_accounts(account())
    write_cache(age_seconds=60)

    assert _names(client.get(f"/api/symbols/{TEST_ACCOUNT_ID}")) == ["USOUSD"]
    assert calls == []


@pytest.mark.feature("SYM-01")
def test_ohne_cache_eine_mt5_abfrage_danach_aus_cache(client, seed_accounts, symbol_source):
    calls, _ = symbol_source
    seed_accounts(account())

    assert _names(client.get(f"/api/symbols/{TEST_ACCOUNT_ID}")) == ["USOUSD", "XAUUSD"]
    assert _names(client.get(f"/api/symbols/{TEST_ACCOUNT_ID}")) == ["USOUSD", "XAUUSD"]
    assert calls == [TEST_ACCOUNT_ID]


@pytest.mark.feature("SYM-01")
@pytest.mark.parametrize(
    "cache_age, expected",
    [
        (3700, ["USOUSD"]),  # abgelaufener Cache: alte Liste
        (None, []),  # kein Cache: leer statt auf die MT5-Sperre warten
    ],
    ids=["abgelaufener_cache", "kein_cache"],
)
def test_waehrend_start_oder_stop_keine_eigene_mt5_verbindung(
    client, seed_accounts, symbol_source, monkeypatch, cache_age, expected
):
    calls, write_cache = symbol_source
    seed_accounts(account())
    if cache_age is not None:
        write_cache(age_seconds=cache_age)
    monkeypatch.setattr(wd, "_locks", {})
    # Der Konto-Lock steht stellvertretend für /start und /stop (beide halten ihn)
    lock = wd.account_lock(TEST_ACCOUNT_ID)
    # Ohne Konkurrenz bindet acquire() keine Event-Schleife; der Lock gilt dann als gehalten wie bei /start
    asyncio.run(lock.acquire())
    try:
        assert _names(client.get(f"/api/symbols/{TEST_ACCOUNT_ID}")) == expected
    finally:
        lock.release()
    assert calls == []
