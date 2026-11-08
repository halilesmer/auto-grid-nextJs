"""NWS-02: /api/ui-prefs/{account_id}: Hin und zurück, Fremdzugriff, Schlüssel- und Größenschutz."""
import pytest

from tests.api.conftest import account

pytestmark = pytest.mark.feature("NWS-02")

FILTER = {"impacts": ["high"], "days": ["d0", "d1"], "currencies": None}


@pytest.fixture
def multi(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    admin = "admin-" + "key-for-tests"
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin)
    anna, anna_key = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"], mt5_path=""), account("1002", mt5_path=""))
    return {"anna": {"X-API-Key": anna_key}, "ben": {"X-API-Key": ben_key}, "admin": {"X-API-Key": admin}}


def test_empty_then_roundtrip(client, multi):
    assert client.get("/api/ui-prefs/1001", headers=multi["anna"]).json() == {"account_id": "1001", "prefs": {}}
    res = client.put("/api/ui-prefs/1001/news_filter", json={"value": FILTER}, headers=multi["anna"])
    assert res.status_code == 200 and res.json()["value"] == FILTER
    assert client.get("/api/ui-prefs/1001", headers=multi["anna"]).json()["prefs"] == {"news_filter": FILTER}
    assert client.get("/api/ui-prefs/1001", headers=multi["admin"]).json()["prefs"] == {"news_filter": FILTER}


def test_two_keys_do_not_overwrite_each_other(client, multi):
    client.put("/api/ui-prefs/1001/news_filter", json={"value": FILTER}, headers=multi["anna"])
    client.put("/api/ui-prefs/1001/other", json={"value": {"a": 1}}, headers=multi["anna"])
    client.put("/api/ui-prefs/1001/news_filter", json={"value": {"impacts": []}}, headers=multi["anna"])
    prefs = client.get("/api/ui-prefs/1001", headers=multi["anna"]).json()["prefs"]
    assert prefs == {"news_filter": {"impacts": []}, "other": {"a": 1}}


def test_foreign_account_is_404_and_without_key_401(client, multi):
    for call in (
        lambda h: client.get("/api/ui-prefs/1001", headers=h),
        lambda h: client.put("/api/ui-prefs/1001/news_filter", json={"value": FILTER}, headers=h),
    ):
        assert call(multi["ben"]).status_code == 404
    assert client.get("/api/ui-prefs/1001").status_code == 401
    assert client.get("/api/ui-prefs/1001", headers=multi["admin"]).json()["prefs"] == {}


@pytest.mark.parametrize("key", ["Bad", "has space", "a" * 41, "x.y", "ü"])
def test_invalid_key_is_422(client, multi, key):
    assert client.put(f"/api/ui-prefs/1001/{key}", json={"value": FILTER}, headers=multi["anna"]).status_code == 422


@pytest.mark.parametrize("body", [{}, {"value": "text"}, {"value": [1]}, {"value": None}])
def test_value_must_be_an_object(client, multi, body):
    assert client.put("/api/ui-prefs/1001/news_filter", json=body, headers=multi["anna"]).status_code == 422


def test_large_value_is_rejected_and_nothing_written(client, multi, worker_dir):
    big = {"x": "a" * 9000}
    assert client.put("/api/ui-prefs/1001/news_filter", json={"value": big}, headers=multi["anna"]).status_code == 413
    assert client.get("/api/ui-prefs/1001", headers=multi["anna"]).json()["prefs"] == {}
    assert not list((worker_dir / "data").glob("ui_prefs_*"))


def test_admin_put_for_unknown_account_is_404_and_writes_no_file(client, multi, worker_dir):
    assert client.put("/api/ui-prefs/9999/news_filter", json={"value": FILTER}, headers=multi["admin"]).status_code == 404
    assert not (worker_dir / "data" / "ui_prefs_9999.json").exists()


def test_key_with_trailing_newline_is_rejected(client, multi):
    assert client.put("/api/ui-prefs/1001/news_filter%0A", json={"value": FILTER}, headers=multi["anna"]).status_code == 422


def test_nan_is_rejected_and_file_stays_readable(client, multi):
    res = client.put("/api/ui-prefs/1001/news_filter", content='{"value": {"a": NaN}}',
                     headers={**multi["anna"], "Content-Type": "application/json"})
    assert res.status_code == 422
    assert client.get("/api/ui-prefs/1001", headers=multi["anna"]).status_code == 200


def test_too_many_keys_is_413_but_existing_key_can_change(client, multi):
    for i in range(20):
        assert client.put(f"/api/ui-prefs/1001/k{i}", json={"value": {"i": i}}, headers=multi["anna"]).status_code == 200
    assert client.put("/api/ui-prefs/1001/extra", json={"value": {}}, headers=multi["anna"]).status_code == 413
    assert client.put("/api/ui-prefs/1001/k3", json={"value": {"i": 99}}, headers=multi["anna"]).status_code == 200
    prefs = client.get("/api/ui-prefs/1001", headers=multi["anna"]).json()["prefs"]
    assert len(prefs) == 20 and prefs["k3"] == {"i": 99} and "extra" not in prefs


def test_total_file_size_is_limited(client, multi):
    for i in range(8):
        assert client.put(f"/api/ui-prefs/1001/b{i}", json={"value": {"x": "a" * 8000}}, headers=multi["anna"]).status_code == 200
    assert client.put("/api/ui-prefs/1001/b8", json={"value": {"x": "a" * 8000}}, headers=multi["anna"]).status_code == 413


def test_put_without_key_is_401(client, multi):
    assert client.put("/api/ui-prefs/1001/news_filter", json={"value": FILTER}).status_code == 401


def test_read_error_does_not_wipe_other_keys(client, multi, monkeypatch):
    client.put("/api/ui-prefs/1001/news_filter", json={"value": FILTER}, headers=multi["anna"])
    import builtins
    real_open = builtins.open

    def failing(path, *a, **k):
        if "ui_prefs_1001.json" in str(path) and not str(path).endswith(".tmp") and "r" in (a[0] if a else k.get("mode", "r")):
            raise PermissionError("locked")
        return real_open(path, *a, **k)

    with monkeypatch.context() as m:
        m.setattr(builtins, "open", failing)
        assert client.put("/api/ui-prefs/1001/other", json={"value": {"a": 1}}, headers=multi["anna"]).status_code == 500
    assert client.get("/api/ui-prefs/1001", headers=multi["anna"]).json()["prefs"] == {"news_filter": FILTER}
