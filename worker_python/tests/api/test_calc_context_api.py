"""TLS-01: GET /market/{id}/calc-context – Konto- und Margendaten für den Grid-Risiko-Rechner, nur lesend."""
import pytest

import src.utils.mt5_connection as mc
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

pytestmark = pytest.mark.feature("TLS-01")

URL = f"/api/market/{TEST_ACCOUNT_ID}/calc-context"


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.account.balance = 1050.0
    fake.account.leverage = 10
    fake.account.margin_so_so = 30.0
    fake.add_symbol("XTIUSD", 80.0, 80.1, digits=3, point=0.001, trade_contract_size=100.0)
    calls = []

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        calls.append({"allow_restart": allow_restart, "data_query": data_query})
        return True, False, None

    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    fake.connect_calls = calls
    return fake


def test_context_values_and_read_only_connection(client, broker):
    res = client.get(URL, params={"symbol": "XTIUSD"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["balance"] == 1050.0 and body["leverage"] == 10 and body["currency"] == "USD"
    assert body["margin_so_so"] == 30.0 and body["margin_so_mode"] == 0
    assert (body["bid"], body["ask"]) == (80.0, 80.1)
    # 1 Lot zum Ask: 80,1 * 1 * 100 / 10
    assert body["margin_per_lot"] == pytest.approx(801.0) and body["margin_price"] == 80.1
    assert broker.connect_calls == [{"allow_restart": False, "data_query": True}]


def test_margin_none_when_mt5_cannot_calculate(client, broker):
    broker.margin_calc_fails = True
    body = client.get(URL, params={"symbol": "XTIUSD"}).json()
    assert body["margin_per_lot"] is None and body["margin_price"] is None


def test_unknown_symbol_is_404_and_other_account_503(client, broker):
    assert client.get(URL, params={"symbol": "NOPE"}).status_code == 404
    broker.account.login = 999
    assert client.get(URL, params={"symbol": "XTIUSD"}).status_code == 503


def test_foreign_account_is_404_and_no_key_is_401(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    monkeypatch.setattr(auth, "WORKER_API_KEY", "admin-" + "key-for-tests")
    anna, _ = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"], mt5_path=""))
    url = "/api/market/1001/calc-context"
    assert client.get(url, params={"symbol": "X"}, headers={"X-API-Key": ben_key}).status_code == 404
    assert client.get(url, params={"symbol": "X"}).status_code == 401
