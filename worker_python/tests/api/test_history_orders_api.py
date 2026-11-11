"""BKT-24: GET /api/history/{id}/orders (Pending Orders zum Fensterbeginn) und Schema-Migration 11."""
import os
import secrets
import time

import pytest

import src.utils.mt5_connection as mc
from src.utils import market_db, market_sync
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5, Order

pytestmark = pytest.mark.feature("BKT-24")

SYMBOL = "XAUUSD"
URL = f"/api/history/{TEST_ACCOUNT_ID}/orders"
FROM = int(time.time()) - 10 * 86400


def make(ticket, setup, done, type=2, state=2, **kw):
    return Order(ticket, SYMBOL, type, 2600.0, 0.1, state=state, magic=200001, comment="AutoGrid_Z200001",
                 time_setup=setup, time_setup_msc=setup * 1000 + 7, time_done=done,
                 time_done_msc=done * 1000 + 7 if done else 0, **kw)


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol(SYMBOL, 2650.0, digits=2, point=0.01)
    connects = []

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        connects.append(data_query)
        return True, False, None

    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    fake.connects = connects
    for o in (
        make(9001, FROM - 3600, FROM + 600),                       # wartet bei FROM, danach gelöscht
        make(9002, FROM + 100, FROM + 200),                        # erst nach FROM gesetzt
        make(9003, FROM - 100, FROM - 50),                         # vor FROM beendet
        make(9004, FROM - 100, FROM + 50, type=0, state=4),        # Marktorder
        make(9005, FROM - 100, FROM + 50, state=5),                # abgelehnt
        make(9006, FROM - 900, FROM + 5000, state=4, position_id=777),  # gefüllt, wartete bei FROM
    ):
        fake.history[o.ticket] = o
    return fake


def get(client, a=FROM, b=FROM + 1, **kw):
    return client.get(URL, params={"from": a, "to": b}, **kw)


def test_returns_orders_waiting_at_from(client, broker):
    res = get(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert [o["ticket"] for o in body["orders"]] == [9001, 9006]  # nach time_setup_msc
    first = body["orders"][0]
    assert first["comment"] == "AutoGrid_Z200001" and first["magic"] == 200001 and first["price_open"] == 2600.0
    assert first["active"] is False
    assert body["missing"] == [] and body["lookback_sec"] == market_sync.ORDER_LOOKBACK_SEC
    assert (body["account_id"], body["from"], body["to"]) == (TEST_ACCOUNT_ID, FROM, FROM + 1)
    assert broker.connects == [True]  # nur Datenabfrage


@pytest.mark.parametrize("by", ["setup", "done"])
def test_same_result_in_both_mt5_range_meanings(client, broker, by):
    broker.history_range_by = by
    assert [o["ticket"] for o in get(client).json()["orders"]] == [9001, 9006]


def test_second_request_does_not_ask_mt5(client, broker):
    get(client)
    broker.history_orders_calls = []
    n = len(broker.connects)
    again = get(client).json()
    assert [o["ticket"] for o in again["orders"]] == [9001, 9006]
    assert broker.history_orders_calls == [] and len(broker.connects) == n


def test_open_order_comes_fresh_and_stops_coverage(client, broker):
    broker.orders.append(make(9100, FROM - 7200, 0, state=1))
    body = get(client).json()
    opened = next(o for o in body["orders"] if o["ticket"] == 9100)
    assert opened["active"] is True and opened["time_done"] == 0
    with market_db.reading() as conn:
        assert conn.execute("SELECT COUNT(*) FROM live_orders WHERE ticket=9100").fetchone()[0] == 0  # offene werden nicht gespeichert
        assert conn.execute("SELECT COUNT(*) FROM live_order_coverage").fetchone()[0] == 0
    broker.history_orders_calls = []
    get(client)
    assert broker.history_orders_calls  # nicht abgedeckt: wird erneut gefragt


def test_busy_account_gives_archive_and_missing(client, broker, monkeypatch):
    import src.api.market as market

    get(client)  # Archiv füllen
    with market_db.writing() as conn:
        conn.execute("DELETE FROM live_order_coverage")
    monkeypatch.setattr(market, "is_account_busy", lambda _id: True)
    broker.history_orders_calls = []
    body = get(client).json()
    assert broker.history_orders_calls == []
    assert [o["ticket"] for o in body["orders"]] == [9001, 9006]  # was gespeichert ist
    assert body["missing"] == [{"from": FROM, "to": FROM + 1, "reason": "busy"}]


@pytest.mark.parametrize("a,b", [(FROM, FROM), (FROM, FROM - 5), (FROM, FROM + 31 * 86400 + 1)])
def test_bad_range_gives_400(client, broker, a, b):
    assert get(client, a, b).status_code == 400


def test_unknown_account_is_404(client, broker):
    assert client.get("/api/history/9999/orders", params={"from": FROM, "to": FROM + 1}).status_code == 404


def test_foreign_account_is_404_admin_passes(client, broker, seed_accounts, monkeypatch):
    import src.api.auth as auth
    from src.api import users_store

    admin_key = secrets.token_urlsafe(24)
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin_key)
    owner, owner_key = users_store.create_user("Anna")
    _other, other_key = users_store.create_user("Ben")
    seed_accounts(account(owner=owner["id"]))
    assert get(client, headers={"X-API-Key": other_key}).status_code == 404
    assert get(client, headers={"X-API-Key": owner_key}).status_code == 200
    assert get(client, headers={"X-API-Key": admin_key}).status_code == 200


def test_migration_11_adds_tables_and_archive(client, broker):
    get(client)
    assert market_db.SCHEMA_VERSION >= 11
    with market_db.reading() as conn:
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"live_orders", "live_order_coverage", "position_orders"} <= names
    assert {"live_orders", "live_order_coverage"} <= set(market_db._ACCOUNT_ARCHIVE_TABLES)


def test_migration_from_10_keeps_old_rows(client, broker):
    get(client)
    with market_db.writing() as conn:
        conn.execute("DROP TABLE live_orders")
        conn.execute("DROP TABLE live_order_coverage")
        conn.execute("PRAGMA user_version=10")
    market_db.reset_cache()
    assert [o["ticket"] for o in get(client).json()["orders"]] == [9001, 9006]
    with market_db.reading() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == market_db.SCHEMA_VERSION


def test_terminal_in_other_account_returns_nothing(client, broker):
    broker.account.login = 5555  # Terminal ist in einem anderen Konto angemeldet
    body = get(client)
    assert body.status_code == 200
    data = body.json()
    assert data["orders"] == []
    assert data["missing"] and data["missing"][0]["reason"] == "error"
    assert broker.history_orders_calls == [] if hasattr(broker, "history_orders_calls") else True
    with market_db.reading() as conn:
        assert conn.execute("SELECT COUNT(*) FROM live_orders").fetchone()[0] == 0
