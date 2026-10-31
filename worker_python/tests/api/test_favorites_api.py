"""FRM-28: Favoriten je Konto lesen, schreiben, Fremdzugriff und Eingabeschutz."""
import pytest

from tests.api.conftest import account

pytestmark = pytest.mark.feature("FRM-28")


@pytest.fixture
def multi(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    admin = "admin-" + "key-for-tests"
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin)
    anna, anna_key = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"], mt5_path=""), account("1002", mt5_path=""))
    return {"anna": {"X-API-Key": anna_key}, "ben": {"X-API-Key": ben_key}, "admin": {"X-API-Key": admin}}


def test_empty_then_write_and_read(client, multi):
    assert client.get("/api/favorites/1001", headers=multi["anna"]).json()["symbols"] == []
    res = client.put("/api/favorites/1001", json={"symbols": ["XAUUSD", "EURUSD", "XAUUSD"]}, headers=multi["anna"])
    assert res.status_code == 200 and res.json()["symbols"] == ["XAUUSD", "EURUSD"]
    assert client.get("/api/favorites/1001", headers=multi["anna"]).json()["symbols"] == ["XAUUSD", "EURUSD"]
    assert client.get("/api/favorites/1001", headers=multi["admin"]).json()["symbols"] == ["XAUUSD", "EURUSD"]


def test_foreign_account_is_404(client, multi):
    for call in (
        lambda h: client.get("/api/favorites/1001", headers=h),
        lambda h: client.put("/api/favorites/1001", json={"symbols": ["X"]}, headers=h),
    ):
        assert call(multi["ben"]).status_code == 404
    assert client.get("/api/favorites/1001").status_code == 401


@pytest.mark.parametrize("body", [
    {"symbols": [""]}, {"symbols": ["A" * 41]}, {"symbols": [" X"]},
    {"symbols": [str(i) for i in range(201)]}, {"symbols": "XAUUSD"}, {},
])
def test_invalid_content_is_422(client, multi, body):
    assert client.put("/api/favorites/1001", json=body, headers=multi["anna"]).status_code == 422


def test_deleting_account_removes_file(client, multi, worker_dir):
    client.put("/api/favorites/1002", json={"symbols": ["XAUUSD"]}, headers=multi["admin"])
    path = worker_dir / "configs" / "favorites_1002.json"
    assert path.exists()
    assert client.delete("/api/accounts/1002", headers=multi["admin"]).status_code == 200
    assert not path.exists()
