"""ANA-23: GET /market/{id}/ticks – rohe Ticks, nur Admin, nur lesend, höchstens 2 Stunden."""
import pytest

import src.utils.mt5_connection as mc
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("ANA-23")

URL = f"/api/market/{TEST_ACCOUNT_ID}/ticks"


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol("XAUUSD", 2650.0, digits=2, point=0.01)
    fake.set_tick_history("XAUUSD", [
        {"time_msc": 1_000_500, "bid": 1.0, "ask": 1.5, "flags": 6},
        {"time_msc": 1_001_250, "bid": 1.1, "ask": 1.6, "flags": 2},
        {"time_msc": 9_000_000, "bid": 2.0, "ask": 2.5, "flags": 6},
    ])
    calls = []

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        calls.append({"allow_restart": allow_restart, "data_query": data_query})
        return True, False, None

    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    fake.connect_calls = calls
    return fake


def test_ticks_in_window_and_read_only_connection(client, broker):
    res = client.get(URL, params={"symbol": "XAUUSD", "from": 1000, "to": 1002})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["count"] == 2
    assert body["ticks"] == [
        {"time_msc": 1_000_500, "bid": 1.0, "ask": 1.5, "flags": 6},
        {"time_msc": 1_001_250, "bid": 1.1, "ask": 1.6, "flags": 2},
    ]
    assert broker.connect_calls == [{"allow_restart": False, "data_query": True}]


def test_empty_window_is_empty_list(client, broker):
    res = client.get(URL, params={"symbol": "XAUUSD", "from": 5000, "to": 5100})
    assert res.status_code == 200 and res.json()["ticks"] == []


def test_window_over_two_hours_is_400(client, broker):
    assert client.get(URL, params={"symbol": "XAUUSD", "from": 0, "to": 7201}).status_code == 400
    assert client.get(URL, params={"symbol": "XAUUSD", "from": 0, "to": 7200}).status_code == 200


def test_bad_range_and_unknown_symbol(client, broker):
    assert client.get(URL, params={"symbol": "XAUUSD", "from": 10, "to": 10}).status_code == 400
    assert client.get(URL, params={"symbol": "NOPE", "from": 0, "to": 10}).status_code == 404


def test_terminal_on_other_account_gives_503(client, broker):
    broker.account.login = 999
    assert client.get(URL, params={"symbol": "XAUUSD", "from": 0, "to": 10}).status_code == 503


def test_user_without_admin_key_is_forbidden(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    monkeypatch.setattr(auth, "WORKER_API_KEY", "admin-" + "key-for-tests")
    _anna, anna_key = users_store.create_user("Anna")
    seed_accounts(account())
    res = client.get(URL, params={"symbol": "XAUUSD", "from": 0, "to": 10}, headers={"X-API-Key": anna_key})
    assert res.status_code in (403, 404)
    assert client.get(URL, params={"symbol": "XAUUSD", "from": 0, "to": 10}).status_code == 401
