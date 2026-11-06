"""BKT-19: Minuten-Spread aus Ticks (GET /market/{id}/rates?tick_spread=1, Tabelle tick_spread).

MT5 ist FakeMT5 mit Tick-Verlauf; Zeiten sind MT5-Zeit. Punkt 0,01 → Spread 16 Punkte = Ask − Bid 0,16.
"""
import calendar
import sqlite3

import pytest

import src.utils.mt5_connection as mc
from src.api import market
from src.utils import market_db, market_sync
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("BKT-19")

SYMBOL = "XAUUSD"
MON = calendar.timegm((2026, 9, 28, 0, 0, 0))
FRI_20 = MON - 2 * 86400 - 4 * 3600
SAT = MON - 2 * 86400
LIVE = MON + 2 * 3600
URL = f"/api/market/{TEST_ACCOUNT_ID}/rates"
COVERAGE_URL = f"/api/market/{TEST_ACCOUNT_ID}/coverage"


def _tick(t_sec, spread, sub_ms=0):
    return {"time_msc": t_sec * 1000 + sub_ms, "bid": 2650.0, "ask": round(2650.0 + spread * 0.01, 2), "flags": 6}


def _hour_ticks(start):
    """Minute 0: 10 für 20 s, 40 für 40 s → 30; Minute 1: nur ein Tick bei +30 s (20), davor gilt 40 → 30; danach 10."""
    rows = [_tick(start, 10), _tick(start + 20, 40), _tick(start + 90, 20)]
    rows += [_tick(start + 60 * k, 10) for k in range(2, 60)]
    return sorted(rows, key=lambda r: r["time_msc"])


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
    fake.add_symbol(SYMBOL, 2650.0, digits=2, point=0.01)
    fake.set_rates(SYMBOL, fake.TIMEFRAME_M1, _bars(FRI_20, SAT) + _bars(MON, LIVE))
    fake.set_tick_history(SYMBOL, _hour_ticks(MON))
    connects, tick_calls = [], []
    original = fake.copy_ticks_range

    def copy_ticks_range(symbol, date_from, date_to, flags):
        tick_calls.append((int(date_from), int(date_to)))
        return original(symbol, date_from, date_to, flags)

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        connects.append({"allow_restart": allow_restart, "data_query": data_query})
        return True, False, None

    fake.copy_ticks_range = copy_ticks_range
    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    monkeypatch.setattr(market_sync, "CHUNK_PAUSE_SEC", 0)
    monkeypatch.setattr(market_sync, "TICK_PAUSE_SEC", 0)
    fake.connects = connects
    fake.tick_calls = tick_calls
    return fake


def get(client, a, b, tf="M1", tick=True, status=200):
    params = {"symbol": SYMBOL, "timeframe": tf, "from": a, "to": b}
    if tick:
        params["tick_spread"] = 1
    res = client.get(URL, params=params)
    assert res.status_code == status, res.text
    return res.json()


def test_minute_stats_weighted_by_time_with_carry():
    ticks = [_tick(MON - 10, 8), _tick(MON, 10), _tick(MON + 20, 40), _tick(MON + 90, 20), _tick(MON + 120, 16, 500)]
    stats = market_sync.minute_spread_stats(ticks, 0.01, MON, MON + 180)
    assert stats[:2] == [
        (MON, 30.0, 40, 2),       # 20 s × 10 + 40 s × 40
        (MON + 60, 30.0, 20, 1),  # 30 s × 40 (carried) + 30 s × 20
    ]
    t, sa, sx, n = stats[2]
    assert t == MON + 120 and sx == 16 and n == 1
    assert sa == pytest.approx((500 * 20 + 59500 * 16) / 60000, abs=0.01)  # carried 20 for 0.5 s, then 16


def test_minute_stats_skip_zero_prices_and_empty_minutes():
    ticks = [{"time_msc": MON * 1000, "bid": 0.0, "ask": 0.0, "flags": 0}, _tick(MON + 120, 10)]
    stats = market_sync.minute_spread_stats(ticks, 0.01, MON, MON + 180)
    assert [s[0] for s in stats] == [MON + 120]


def test_stats_returned_stored_and_not_fetched_again(client, broker):
    body = get(client, MON, MON + 3600)
    assert body["sa"][0] == 30.0 and body["sx"][0] == 40
    assert body["sa"][1] == 30.0 and body["sx"][1] == 20
    assert body["sa"][2] == 10.0 and body["sa"][59] == 10.0
    assert body["tick_missing"] == []
    assert {"allow_restart": False, "data_query": True} in broker.connects
    calls = len(broker.tick_calls)
    assert calls >= 1
    again = get(client, MON, MON + 3600)
    assert again["sa"] == body["sa"]
    assert len(broker.tick_calls) == calls  # alles aus der Datenbank


def test_without_flag_no_ticks_and_no_columns(client, broker):
    body = get(client, MON, MON + 3600, tick=False)
    assert "sa" not in body and "tick_missing" not in body
    assert broker.tick_calls == []


def test_candle_without_ticks_is_unavailable_with_null(client, broker):
    broker.set_tick_history(SYMBOL, [])
    body = get(client, MON, MON + 3600)
    assert body["sa"] == [None] * 60
    assert [m["reason"] for m in body["tick_missing"]] == ["unavailable"]
    calls = len(broker.tick_calls)
    get(client, MON, MON + 3600)
    assert len(broker.tick_calls) == calls  # 24 Stunden Wartezeit


def test_incomplete_download_is_not_stored(client, broker):
    broker.set_tick_history(SYMBOL, _hour_ticks(MON)[:5])
    body = get(client, MON, MON + 3600)
    assert body["sa"] == [None] * 60
    assert [m["reason"] for m in body["tick_missing"]] == ["syncing"]
    broker.set_tick_history(SYMBOL, _hour_ticks(MON))
    again = get(client, MON, MON + 3600)
    assert again["tick_missing"] == [] and again["sa"][0] == 30.0


def test_busy_account_does_not_touch_mt5(client, broker, monkeypatch):
    get(client, MON, MON + 3600, tick=False)  # Kerzen sind gespeichert
    monkeypatch.setattr(market, "is_account_busy", lambda _id: True)
    body = get(client, MON, MON + 3600)
    assert broker.tick_calls == []
    assert body["sa"] == [None] * 60
    assert [m["reason"] for m in body["tick_missing"]] == ["busy"]


def test_budget_stops_after_first_piece_and_resumes(client, broker, monkeypatch):
    broker.set_tick_history(SYMBOL, _hour_ticks(MON) + [
        _tick(FRI_20 + 60 * k, 12) for k in range(0, 240)])
    monkeypatch.setattr(market_sync, "TICK_BUDGET_SEC", 0)
    first = get(client, FRI_20, MON + 3600)
    reasons = [m["reason"] for m in first["tick_missing"]]
    assert reasons == ["budget"]
    monkeypatch.setattr(market_sync, "TICK_BUDGET_SEC", 40)
    done = get(client, FRI_20, MON + 3600)
    assert done["tick_missing"] == []
    assert done["sa"][0] == 12.0 and done["sa"][-1] == 10.0


def test_other_timeframe_with_tick_spread_is_400(client, broker):
    get(client, MON, MON + 3600, tf="M5", status=400)


def test_coverage_lists_tick_spread(client, broker):
    get(client, MON, MON + 3600)
    res = client.get(COVERAGE_URL, params={"symbol": SYMBOL})
    assert res.status_code == 200
    ranges = res.json()["tick_spread"]
    assert ranges and ranges[0]["state"] == "complete"


def test_migration_from_version_5_keeps_rates(client, broker):
    get(client, MON, MON + 600, tick=False)
    market_db.reset_cache()
    conn = sqlite3.connect(market_db.db_path())
    conn.execute("DROP TABLE tick_spread")
    conn.execute("DROP TABLE tick_spread_coverage")
    conn.execute("DROP TABLE tick_replay")
    conn.execute("PRAGMA user_version=5")
    conn.close()
    market_db.reset_cache()
    body = get(client, MON, MON + 600)
    assert len(body["t"]) == 10 and body["sa"][0] == 30.0
    conn = sqlite3.connect(market_db.db_path())
    assert conn.execute("PRAGMA user_version").fetchone()[0] == market_db.SCHEMA_VERSION >= 6
    conn.close()
