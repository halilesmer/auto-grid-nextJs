"""BKT-20: Tick-Replay-Minuten (GET /market/{id}/rates?tick_spread=1&tick_replay=1, Tabelle tick_replay)."""
import calendar
import sqlite3

import pytest

import src.utils.mt5_connection as mc
from src.api import market
from src.utils import market_db, market_sync
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("BKT-20")

SYMBOL = "EURCHF"
MON = calendar.timegm((2026, 9, 28, 0, 0, 0))
LIVE = MON + 2 * 3600
URL = f"/api/market/{TEST_ACCOUNT_ID}/rates"
COVERAGE_URL = f"/api/market/{TEST_ACCOUNT_ID}/coverage"


def _tick(t_ms, bid, spread_pts):
    return {"time_msc": t_ms, "bid": round(bid, 5), "ask": round(bid + spread_pts * 0.00001, 5), "flags": 6}


def _hour_ticks(start):
    """60 Minuten, Spread 10; Minute 5: ab +1 s Spread 35 (S); Minute 20: Bid springt um 480 Punkte und bleibt (J)."""
    rows = []
    for k in range(60):
        bid = 0.91500 + (0.0048 if k >= 20 else 0.0)
        rows.append(_tick((start + 60 * k) * 1000, bid, 10))
        if k == 5:
            rows.append(_tick((start + 60 * k) * 1000 + 1000, bid, 35))
    return rows


def _bars(start, end):
    return [{"time": t, "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "tick_volume": 1, "spread": 3}
            for t in range(start, end, 60)]


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(market_sync, "_tail_cache", {})


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol(SYMBOL, 0.915, digits=5, point=0.00001)
    fake.set_rates(SYMBOL, fake.TIMEFRAME_M1, _bars(MON, LIVE))
    fake.set_tick_history(SYMBOL, _hour_ticks(MON))
    tick_calls = []
    original = fake.copy_ticks_range

    def copy_ticks_range(symbol, date_from, date_to, flags):
        tick_calls.append((int(date_from), int(date_to)))
        return original(symbol, date_from, date_to, flags)

    fake.copy_ticks_range = copy_ticks_range
    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", lambda *a, **k: (True, False, None))
    monkeypatch.setattr(market_sync, "CHUNK_PAUSE_SEC", 0)
    monkeypatch.setattr(market_sync, "TICK_PAUSE_SEC", 0)
    fake.tick_calls = tick_calls
    return fake


def get(client, a, b, replay=True, tick=True, status=200):
    params = {"symbol": SYMBOL, "timeframe": "M1", "from": a, "to": b}
    if tick:
        params["tick_spread"] = 1
    if replay:
        params["tick_replay"] = 1
    res = client.get(URL, params=params)
    assert res.status_code == status, res.text
    return res.json()


def test_replay_minutes_returned_stored_and_not_fetched_again(client, broker):
    body = get(client, MON, MON + 3600)
    rep = body["replay"]
    assert rep["t"] == [MON + 300, MON + 1200] and rep["kind"] == ["S", "J"]
    assert rep["off"] == [0, 2, 3] and rep["ms"] == [0, 1000, 0]
    assert rep["b"] == [91500, 91500, 91980] and rep["a"] == [91510, 91535, 91990]
    assert body["tick_missing"] == []
    calls = len(broker.tick_calls)
    assert calls >= 1
    again = get(client, MON, MON + 3600)
    assert again["replay"] == rep and len(broker.tick_calls) == calls  # alles aus der Datenbank


def test_without_replay_flag_no_replay_column(client, broker):
    body = get(client, MON, MON + 3600, replay=False)
    assert "replay" not in body and body["sa"][0] == 10.0


def test_replay_alone_is_400(client, broker):
    get(client, MON, MON + 3600, tick=False, status=400)


def test_spread_only_data_is_fetched_once_more_for_replay(client, broker):
    first = get(client, MON, MON + 3600, replay=False)
    calls = len(broker.tick_calls)
    body = get(client, MON, MON + 3600)
    assert len(broker.tick_calls) == calls + 1
    assert body["sa"] == first["sa"] and body["replay"]["t"] == [MON + 300, MON + 1200]
    final = len(broker.tick_calls)
    get(client, MON, MON + 3600)
    assert len(broker.tick_calls) == final


def test_busy_account_does_not_touch_mt5(client, broker, monkeypatch):
    get(client, MON, MON + 3600, replay=False, tick=False)  # Kerzen gespeichert
    monkeypatch.setattr(market, "is_account_busy", lambda _id: True)
    body = get(client, MON, MON + 3600)
    assert broker.tick_calls == []
    assert [m["reason"] for m in body["tick_missing"]] == ["busy"]
    assert body["replay"]["t"] == []


def test_coverage_reports_replay(client, broker):
    get(client, MON, MON + 3600)
    res = client.get(COVERAGE_URL, params={"symbol": SYMBOL})
    ranges = res.json()["tick_spread"]
    assert ranges and ranges[0]["state"] == "complete" and ranges[0]["replay"] == 1


def test_migration_from_version_6_keeps_tick_spread(client, broker):
    get(client, MON, MON + 3600, replay=False)
    market_db.reset_cache()
    conn = sqlite3.connect(market_db.db_path(), isolation_level=None)
    conn.execute("DROP TABLE position_orders")
    conn.execute("DROP TABLE tick_replay")
    rows = conn.execute("SELECT source, symbol, from_t, to_t, state, checked_at FROM tick_spread_coverage").fetchall()
    conn.execute("DROP TABLE tick_spread_coverage")
    conn.execute("CREATE TABLE tick_spread_coverage (source TEXT NOT NULL, symbol TEXT NOT NULL, "
                 "from_t INTEGER NOT NULL, to_t INTEGER NOT NULL, state TEXT NOT NULL, checked_at INTEGER NOT NULL)")
    conn.executemany("INSERT INTO tick_spread_coverage VALUES (?,?,?,?,?,?)", rows)
    conn.execute("PRAGMA user_version=6")
    conn.close()
    market_db.reset_cache()
    body = get(client, MON, MON + 3600, replay=False)
    assert body["sa"][0] == 10.0
    conn = sqlite3.connect(market_db.db_path())
    assert conn.execute("PRAGMA user_version").fetchone()[0] == market_db.SCHEMA_VERSION >= 7
    assert {r[0] for r in conn.execute("SELECT replay FROM tick_spread_coverage")} == {0}
    conn.close()
