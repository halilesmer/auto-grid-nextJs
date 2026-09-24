"""SYM-01 Symbolliste + 1-h-Cache (Stale-while-refresh, doppelte Anfragen zusammengelegt,
keine eigene MT5-Verbindung während /start)."""
import asyncio
import json
import os
import time

import pytest

import src.api.helpers as helpers
import src.utils.bot_watchdog as wd
import src.utils.mt5_helpers as mh
from tests.conftest import TEST_ACCOUNT_ID

USO = {"name": "USOUSD", "digits": 3, "point": 0.001}
XAU = {"name": "XAUUSD", "digits": 2, "point": 0.01}


@pytest.fixture
def symbols_env(tmp_path, monkeypatch):
    cache = tmp_path / "broker_symbols.json"
    accounts = tmp_path / "accounts.json"
    accounts.write_text(json.dumps({"accounts": [{"id": TEST_ACCOUNT_ID, "login": int(TEST_ACCOUNT_ID)}]}))
    monkeypatch.setattr(mh, "CACHE_FILE", str(cache))
    monkeypatch.setattr(helpers, "ACCOUNTS_FILE", str(accounts))
    mh._IN_FLIGHT.clear()

    calls = []

    async def fake_fetch(account_id, account_config, safe_log_fn):
        calls.append(account_id)
        await asyncio.sleep(0.05)  # simuliert die MT5-Abfrage
        data = {account_id: {s["name"]: s for s in (USO, XAU)}}
        cache.write_text(json.dumps(data))
        return [USO, XAU]

    monkeypatch.setattr(mh, "fetch_and_cache_symbols", fake_fetch)

    def write_cache(age_seconds):
        cache.write_text(json.dumps({TEST_ACCOUNT_ID: {"USOUSD": USO}}))
        t = time.time() - age_seconds
        os.utime(cache, (t, t))

    yield cache, calls, write_cache
    mh._IN_FLIGHT.clear()


def _get(account_id=TEST_ACCOUNT_ID):
    return mh.get_or_fetch_symbols(account_id, lambda *a, **k: None)


@pytest.mark.feature("SYM-01")
def test_frischer_cache_ohne_mt5_abfrage(symbols_env):
    _, calls, write_cache = symbols_env
    write_cache(age_seconds=60)
    assert asyncio.run(_get()) == [USO]
    assert calls == []


@pytest.mark.feature("SYM-01")
def test_abgelaufener_cache_sofort_liefern_und_im_hintergrund_erneuern(symbols_env):
    _, calls, write_cache = symbols_env
    write_cache(age_seconds=3700)

    async def scenario():
        first = await _get()
        second = await _get()  # während die Aktualisierung läuft
        await asyncio.sleep(0.1)  # Hintergrund-Aufgabe fertig werden lassen
        third = await _get()
        return first, second, third

    first, second, third = asyncio.run(scenario())
    assert first == [USO] and second == [USO]  # alte Liste sofort, kein Warten
    assert calls == [TEST_ACCOUNT_ID]  # nur EINE MT5-Abfrage
    assert {s["name"] for s in third} == {"USOUSD", "XAUUSD"}


@pytest.mark.feature("SYM-01")
def test_ohne_cache_gleichzeitige_anfragen_teilen_eine_abfrage(symbols_env):
    _, calls, _ = symbols_env

    async def scenario():
        return await asyncio.gather(_get(), _get(), _get())

    results = asyncio.run(scenario())
    assert calls == [TEST_ACCOUNT_ID]
    assert all({s["name"] for s in r} == {"USOUSD", "XAUUSD"} for r in results)


@pytest.mark.feature("SYM-01")
@pytest.mark.parametrize(
    "cache_age, expected_during, expected_after",
    [
        (3700, [USO], [USO]),  # alte Liste sofort, Erneuerung erst nach dem Start
        (None, [], [USO, XAU]),  # kein Cache: leer statt 20 s auf die MT5-Sperre warten
    ],
)
def test_waehrend_start_keine_eigene_mt5_verbindung(
    symbols_env, monkeypatch, cache_age, expected_during, expected_after
):
    """/start verbindet sich selbst und füllt den Cache; eine parallele Abfrage würde ihn nur bremsen."""
    _, calls, write_cache = symbols_env
    if cache_age is not None:
        write_cache(age_seconds=cache_age)
    monkeypatch.setattr(wd, "_locks", {})  # asyncio.Lock nicht an die Schleife eines anderen Tests binden

    async def scenario():
        async with wd.account_lock(TEST_ACCOUNT_ID):  # /start läuft
            during = await _get()
        after = await _get()
        await asyncio.sleep(0.1)
        return during, after

    during, after = asyncio.run(scenario())
    assert during == expected_during
    assert after == expected_after
    assert calls == [TEST_ACCOUNT_ID]  # erst nach dem Start


@pytest.mark.feature("SYM-01")
def test_unbekanntes_konto_ohne_mt5_abfrage(symbols_env):
    _, calls, _ = symbols_env
    assert asyncio.run(_get("9999")) == []
    assert calls == []
