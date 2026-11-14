"""USR-09: /api/me/prefs: kullanıcıya ait tercihler, kimlikler arası yalıtım, anahtar ve boyut koruması."""
import pytest

pytestmark = pytest.mark.feature("USR-09")

THEME = {"theme": "light"}


@pytest.fixture
def multi(client, worker_dir, monkeypatch):
    from src.api import auth, users_store

    admin = "admin-" + "key-for-tests"
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin)
    anna, anna_key = users_store.create_user("Anna")
    ben, ben_key = users_store.create_user("Ben")
    return {
        "anna": {"X-API-Key": anna_key},
        "ben": {"X-API-Key": ben_key},
        "admin": {"X-API-Key": admin},
        "ids": {"anna": anna["id"], "ben": ben["id"]},
    }


def test_empty_then_roundtrip(client, multi):
    res = client.get("/api/me/prefs", headers=multi["anna"])
    assert res.json() == {"user_id": multi["ids"]["anna"], "prefs": {}}
    put = client.put("/api/me/prefs/theme", json={"value": THEME}, headers=multi["anna"])
    assert put.status_code == 200 and put.json()["value"] == THEME
    assert client.get("/api/me/prefs", headers=multi["anna"]).json()["prefs"] == {"theme": THEME}


def test_users_cannot_see_each_other(client, multi):
    client.put("/api/me/prefs/theme", json={"value": THEME}, headers=multi["anna"])
    assert client.get("/api/me/prefs", headers=multi["ben"]).json()["prefs"] == {}
    assert client.get("/api/me/prefs", headers=multi["admin"]).json()["prefs"] == {}


def test_admin_uses_own_file(client, multi, worker_dir):
    res = client.put("/api/me/prefs/theme", json={"value": {"theme": "dark"}}, headers=multi["admin"])
    assert res.status_code == 200 and res.json()["user_id"] == "admin"
    assert (worker_dir / "data" / "user_prefs_admin.json").exists()
    assert client.get("/api/me/prefs", headers=multi["anna"]).json()["prefs"] == {}


def test_without_key_is_401(client, multi):
    assert client.get("/api/me/prefs").status_code == 401
    assert client.put("/api/me/prefs/theme", json={"value": THEME}).status_code == 401


def test_open_worker_uses_admin_file(client, worker_dir):
    assert client.put("/api/me/prefs/theme", json={"value": THEME}).status_code == 200
    assert (worker_dir / "data" / "user_prefs_admin.json").exists()


def test_two_keys_do_not_overwrite_each_other(client, multi):
    client.put("/api/me/prefs/theme", json={"value": THEME}, headers=multi["anna"])
    client.put("/api/me/prefs/locale", json={"value": {"locale": "de"}}, headers=multi["anna"])
    client.put("/api/me/prefs/theme", json={"value": {"theme": "dark"}}, headers=multi["anna"])
    prefs = client.get("/api/me/prefs", headers=multi["anna"]).json()["prefs"]
    assert prefs == {"theme": {"theme": "dark"}, "locale": {"locale": "de"}}


@pytest.mark.parametrize("key", ["Bad", "has space", "a" * 41, "x.y", "ü"])
def test_invalid_key_is_422(client, multi, key):
    assert client.put(f"/api/me/prefs/{key}", json={"value": THEME}, headers=multi["anna"]).status_code == 422


@pytest.mark.parametrize("body", [{}, {"value": "text"}, {"value": [1]}, {"value": None}])
def test_value_must_be_an_object(client, multi, body):
    assert client.put("/api/me/prefs/theme", json=body, headers=multi["anna"]).status_code == 422


def test_large_value_is_rejected_and_nothing_written(client, multi, worker_dir):
    big = {"x": "a" * 9000}
    assert client.put("/api/me/prefs/theme", json={"value": big}, headers=multi["anna"]).status_code == 413
    assert client.get("/api/me/prefs", headers=multi["anna"]).json()["prefs"] == {}
    assert not list((worker_dir / "data").glob("user_prefs_*"))


def test_too_many_keys_is_413(client, multi):
    for i in range(40):
        assert client.put(f"/api/me/prefs/k{i}", json={"value": {"a": 1}}, headers=multi["anna"]).status_code == 200
    assert client.put("/api/me/prefs/k40", json={"value": {"a": 1}}, headers=multi["anna"]).status_code == 413
    assert len(client.get("/api/me/prefs", headers=multi["anna"]).json()["prefs"]) == 40
