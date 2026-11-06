"""BKT-22: Kursraster und Ask-Extreme je Minute (GET /market/{id}/rates?tick_spread=1, Spalten ahi/alo/g, Abdeckung `stats`)."""
import calendar
import sqlite3

import pytest

import src.utils.mt5_connection as mc
from src.api import market
from src.utils import market_db, market_sync
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("BKT-22")

SYMBOL = "USOUSD"
POINT = 0.001
MON = calendar.timegm((2026, 11, 2, 0, 0, 0))
LIVE = MON + 2 * 3600
URL = f"/api/market/{TEST_ACCOUNT_ID}/rates"
COVERAGE_URL = f"/api/market/{TEST_ACCOUNT_ID}/coverage"


def _tick(t_ms, bid_pts, ask_pts):
    return {"time_msc": t_ms, "bid": round(bid_pts * POINT, 3), "ask": round(ask_pts * POINT, 3), "flags": 6}


def _hour_ticks(start):
    """Eine Stunde, 4 Ticks je Minute im 10-Punkte-Raster (Bid-Phase 7, Ask = Bid + 42); Minute 5 hat Ask 90399 als Spitze."""
    rows, bid = [], 90007
    for k in range(60):
        for j in range(4):
            bid += 10 * (1 if (k + j) % 3 else -1) * (2 if (k * 4 + j) % 7 == 0 else 1)
            rows.append(_tick((start + 60 * k) * 1000 + 1000 * j, bid, bid + 42))
    rows[5 * 4 + 1] = _tick(rows[5 * 4 + 1]["time_msc"], 90367, 90399 + 10)  # Ask-Spitze der Minute 5
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
    fake.add_symbol(SYMBOL, 90.0, digits=3, point=POINT)
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


def get(client, a, b, tick=True, replay=False, status=200):
    params = {"symbol": SYMBOL, "timeframe": "M1", "from": a, "to": b}
    if tick:
        params["tick_spread"] = 1
    if replay:
        params["tick_replay"] = 1
    res = client.get(URL, params=params)
    assert res.status_code == status, res.text
    return res.json()


def test_rates_carry_ask_extremes_and_grid_and_are_not_fetched_again(client, broker):
    body = get(client, MON, MON + 3600)
    assert len(body["ahi"]) == len(body["t"]) == 60
    assert body["ahi"][5] == 90409 and body["alo"][5] <= body["ahi"][5]
    assert set(body["g"]) == {10}
    calls = len(broker.tick_calls)
    assert calls >= 1
    again = get(client, MON, MON + 3600)
    assert again["ahi"] == body["ahi"] and len(broker.tick_calls) == calls


def test_without_tick_spread_no_new_columns(client, broker):
    body = get(client, MON, MON + 3600, tick=False)
    assert "ahi" not in body and "alo" not in body and "g" not in body


def test_sa_sx_unchanged_by_the_new_columns(client, broker):
    body = get(client, MON, MON + 3600)
    assert body["sa"][0] == 42.0 and body["sx"][0] == 42


def test_range_stored_before_stats_is_fetched_once_more(client, broker):
    get(client, MON, MON + 3600)
    first = get(client, MON, MON + 3600)
    with market_db.writing() as conn:  # Stand von BKT-19/20: Abdeckung ohne Statistik-Version, Spalten leer
        conn.execute("UPDATE tick_spread_coverage SET stats = 0")
        conn.execute("UPDATE tick_spread SET ahi = NULL, alo = NULL, g = NULL")
    calls = len(broker.tick_calls)
    body = get(client, MON, MON + 3600)
    assert len(broker.tick_calls) == calls + 1
    assert body["sa"] == first["sa"] and body["ahi"] == first["ahi"] and set(body["g"]) == {10}
    final = len(broker.tick_calls)
    get(client, MON, MON + 3600)
    assert len(broker.tick_calls) == final


def test_refetch_for_stats_keeps_replay_coverage(client, broker):
    get(client, MON, MON + 3600, replay=True)
    with market_db.writing() as conn:
        conn.execute("UPDATE tick_spread_coverage SET stats = 0")
    body = get(client, MON, MON + 3600, replay=True)
    assert "replay" in body
    ranges = client.get(COVERAGE_URL, params={"symbol": SYMBOL}).json()["tick_spread"]
    assert ranges and ranges[0]["replay"] == 1 and ranges[0]["stats"] >= 1


def test_coverage_reports_stats_version(client, broker):
    get(client, MON, MON + 3600)
    ranges = client.get(COVERAGE_URL, params={"symbol": SYMBOL}).json()["tick_spread"]
    assert ranges[0]["state"] == "complete" and ranges[0]["stats"] == market_db.TICK_STATS_VERSION


def test_migration_from_version_8_keeps_tick_spread_rows(client, broker):
    get(client, MON, MON + 3600)
    market_db.reset_cache()
    conn = sqlite3.connect(market_db.db_path(), isolation_level=None)
    for col in ("ahi", "alo", "g"):
        conn.execute(f"ALTER TABLE tick_spread DROP COLUMN {col}")
    conn.execute("ALTER TABLE tick_spread_coverage DROP COLUMN stats")
    conn.execute("PRAGMA user_version=8")
    conn.close()
    market_db.reset_cache()
    calls = len(broker.tick_calls)
    body = get(client, MON, MON + 3600)
    assert body["sa"][0] == 42.0 and set(body["g"]) == {10}
    assert len(broker.tick_calls) == calls + 1  # Abdeckung ohne `stats` wird einmal neu geholt
    conn = sqlite3.connect(market_db.db_path())
    assert conn.execute("PRAGMA user_version").fetchone()[0] == market_db.SCHEMA_VERSION >= 9
    conn.close()
