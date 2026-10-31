"""FRM-29: GET /market/{id}/quotes – letzter Preis, Vortagsschluss und Stellen, nur lesend, ohne Fremdzugriff."""
import pytest

import src.utils.mt5_connection as mc
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("FRM-29")

URL = f"/api/market/{TEST_ACCOUNT_ID}/quotes"


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol("XAUUSD", 2650.0, digits=2, point=0.01)
    fake.add_symbol("NODAYS", 1.1, digits=5, point=0.00001)  # keine D1-Kerzen
    fake.set_rates("XAUUSD", fake.TIMEFRAME_D1, [{"time": 86400 * d, "open": 1, "high": 2, "low": 0.5, "close": 2640.0 + d} for d in (1, 2)])
    calls = []

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        calls.append({"allow_restart": allow_restart, "data_query": data_query})
        return True, False, None

    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    fake.connect_calls = calls
    return fake


def test_quotes_per_symbol_and_read_only_connection(client, broker):
    res = client.get(URL, params={"symbols": "XAUUSD,NODAYS,UNKNOWN"})
    assert res.status_code == 200, res.text
    # Vortagsschluss = vorletzte D1-Kerze (die letzte ist die laufende), Preis = Bid, wenn es keinen Last-Preis gibt
    assert res.json()["quotes"] == {
        "XAUUSD": {"last": 2650.0, "prev_close": 2642.0, "digits": 2},
        "NODAYS": None,
        "UNKNOWN": None,
    }
    assert broker.connect_calls == [{"allow_restart": False, "data_query": True}]


def test_terminal_on_other_account_gives_503(client, broker):
    broker.account.login = 999
    assert client.get(URL, params={"symbols": "XAUUSD"}).status_code == 503


@pytest.mark.parametrize("symbols", ["", " , ", ",".join(str(i) for i in range(201)), "A" * 41])
def test_invalid_symbol_list_is_400(client, broker, symbols):
    assert client.get(URL, params={"symbols": symbols}).status_code == 400


def test_foreign_account_is_404_and_no_key_is_401(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    monkeypatch.setattr(auth, "WORKER_API_KEY", "admin-" + "key-for-tests")
    anna, anna_key = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"], mt5_path=""))
    url = "/api/market/1001/quotes"
    assert client.get(url, params={"symbols": "X"}, headers={"X-API-Key": ben_key}).status_code == 404
    assert client.get(url, params={"symbols": "X"}).status_code == 401
