"""BKT-23: GET /market/{id}/replay (Tick-Minuten auf Abruf, Tabelle tick_replay, Art T)."""
import calendar

import pytest

import src.utils.mt5_connection as mc
from src.api import auth, market, users_store
from src.utils import market_db, market_sync
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("BKT-23")

SYMBOL = "EURCHF"
MON = calendar.timegm((2026, 9, 28, 0, 0, 0))
URL = f"/api/market/{TEST_ACCOUNT_ID}/replay"


def _tick(t_ms, bid, spread_pts=10):
    return {"time_msc": t_ms, "bid": round(bid, 5), "ask": round(bid + spread_pts * 0.00001, 5), "flags": 6}


def _ticks():
    """Minuten 0..299: je Minute zwei Ticks (0 ms, 500 ms); Minuten 100..109 ohne Ticks."""
    rows = []
    for k in range(300):
        if 100 <= k < 110:
            continue
        t = (MON + 60 * k) * 1000
        rows.append(_tick(t, 0.91500 + k * 0.00001))
        rows.append(_tick(t + 500, 0.91500 + k * 0.00001 + 0.000005))
    return rows


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(market_sync, "_tail_cache", {})


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol(SYMBOL, 0.915, digits=5, point=0.00001)
    fake.set_tick_history(SYMBOL, _ticks())
    calls = []
    original = fake.copy_ticks_range

    def copy_ticks_range(symbol, date_from, date_to, flags):
        calls.append((int(date_from), int(date_to)))
        return original(symbol, date_from, date_to, flags)

    fake.copy_ticks_range = copy_ticks_range
    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", lambda *a, **k: (True, False, None))
    monkeypatch.setattr(market_sync, "TICK_PAUSE_SEC", 0)
    fake.tick_calls = calls
    return fake


def get(client, m, start=MON, status=200, headers=None, symbol=SYMBOL):
    res = client.get(URL, params={"symbol": symbol, "start": start, "m": m}, headers=headers)
    assert res.status_code == status, res.text
    return res.json()


def test_minutes_return_ticks_columns_and_are_cached(client, broker):
    body = get(client, "5,1")  # MON+300, MON+360
    assert body["t"] == [MON + 300, MON + 360] and body["kind"] == ["T", "T"]
    assert body["off"] == [0, 2, 4] and body["ms"] == [0, 500, 0, 500]
    assert body["b"][0] == 91505 and body["b"][1] == 91506
    assert len(body["a"]) == 4 and body["missing"] == []
    calls = len(broker.tick_calls)
    assert calls == 1  # beide Minuten in einem 2-Stunden-Stück
    again = get(client, "5,1")
    assert again == body and len(broker.tick_calls) == calls


def test_chunks_by_two_hours(client, broker):
    get(client, "0,119,120")  # MON, MON+7140 (Minute 119), MON+14340 (Minute 239): Stücke 0-2 h, 2-4 h
    assert len(broker.tick_calls) == 2


def test_minutes_without_ticks_are_empty_and_no_error(client, broker):
    body = get(client, "100,1")
    assert body["t"] == [] and body["missing"] == []


def test_existing_sj_minutes_are_kept_not_overwritten(client, broker):
    blob = market_sync.encode_replay([7], [12345], [12355])
    assert market_db.store_tick_spread(SYMBOL_SRC(), SYMBOL, [], [], replay_rows=[(MON + 300, "S", blob)])
    body = get(client, "5,1")
    assert body["t"] == [MON + 300, MON + 360] and body["kind"] == ["S", "T"]
    assert body["b"][0] == 12345 and body["ms"][0] == 7
    # nur die fehlende Minute wurde geholt
    assert broker.tick_calls == [(MON + 360, MON + 419)]
    # S-Zeile bleibt auch nach erneutem Abruf
    again = get(client, "5,1")
    assert again["kind"] == ["S", "T"] and again["b"][0] == 12345


def SYMBOL_SRC():
    return "Fake-Demo"


def test_busy_account_does_not_touch_mt5(client, broker, monkeypatch):
    monkeypatch.setattr(market, "is_account_busy", lambda _id: True)
    body = get(client, "5")
    assert broker.tick_calls == [] and body["t"] == []
    assert [m["reason"] for m in body["missing"]] == ["busy"]


@pytest.mark.parametrize("m", ["", "x", "1,-1", "1,0"])
def test_bad_minutes_are_400(client, broker, m):
    get(client, m, status=400)


def test_too_many_minutes_is_400(client, broker):
    get(client, ",".join(["1"] * 2001), status=400)


def test_span_over_three_days_is_400(client, broker):
    get(client, f"1,{3 * 24 * 60 + 1}", status=400)


def test_start_not_on_minute_is_400(client, broker):
    get(client, "1", start=MON + 7, status=400)


def test_unknown_symbol_is_404(client, broker):
    get(client, "1", symbol="NOPE", status=404)


def test_foreign_account_is_404_for_user_and_admin_passes(client, seed_accounts, broker, monkeypatch):
    monkeypatch.setattr(auth, "WORKER_API_KEY", "admin-" + "key-for-tests")
    _anna, anna_key = users_store.create_user("Anna")
    assert client.get(URL, params={"symbol": SYMBOL, "start": MON, "m": "5"},
                      headers={"X-API-Key": anna_key}).status_code == 404
    ok = client.get(URL, params={"symbol": SYMBOL, "start": MON, "m": "5"},
                    headers={"X-API-Key": auth.WORKER_API_KEY})
    assert ok.status_code == 200 and ok.json()["t"] == [MON + 300]
