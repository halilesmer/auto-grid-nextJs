"""USR-11: POST /api/me/prefs/import-account/{id}: einmalige Übernahme von news_filter und news_alerts aus dem Konto."""
import pytest

pytestmark = pytest.mark.feature("USR-11")


@pytest.fixture
def multi(client, worker_dir, monkeypatch):
    from src.api import auth, users_store

    admin = "admin-" + "key-for-tests"
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin)
    anna, anna_key = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    return {"anna": {"X-API-Key": anna_key}, "ben": {"X-API-Key": ben_key}, "admin": {"X-API-Key": admin}, "ids": {"anna": anna["id"]}}

NEWS_FILTER = {"impacts": ["high"], "days": ["d0"], "currencies": ["USD"]}
NEWS_ALERTS = {"alerts": [{"on": True, "minutes": 45}, {"on": False, "minutes": 30}]}


@pytest.fixture
def with_account(client, multi, seed_accounts):
    from tests.api.conftest import account

    seed_accounts(account("1001", owner=multi["ids"]["anna"], mt5_path=""), account("1002", mt5_path=""))
    return multi


def _seed_account_prefs(client, headers, account_id="1001"):
    client.put(f"/api/ui-prefs/{account_id}/news_filter", json={"value": NEWS_FILTER}, headers=headers)
    client.put(f"/api/ui-prefs/{account_id}/news_alerts", json={"value": NEWS_ALERTS}, headers=headers)
    client.put(f"/api/ui-prefs/{account_id}/other", json={"value": {"a": 1}}, headers=headers)


def test_import_copies_missing_news_keys_only(client, with_account):
    h = with_account["anna"]
    _seed_account_prefs(client, h)
    res = client.post("/api/me/prefs/import-account/1001", headers=h)
    assert res.status_code == 200
    assert sorted(res.json()["imported"]) == ["news_alerts", "news_filter"]
    prefs = client.get("/api/me/prefs", headers=h).json()["prefs"]
    assert prefs == {"news_filter": NEWS_FILTER, "news_alerts": NEWS_ALERTS}  # "other" wird nicht übernommen


def test_import_keeps_existing_user_value_and_account_value(client, with_account):
    h = with_account["anna"]
    _seed_account_prefs(client, h)
    own = {"impacts": ["low"], "days": ["week"], "currencies": None}
    client.put("/api/me/prefs/news_filter", json={"value": own}, headers=h)
    res = client.post("/api/me/prefs/import-account/1001", headers=h)
    assert res.json()["imported"] == ["news_alerts"]
    prefs = client.get("/api/me/prefs", headers=h).json()["prefs"]
    assert prefs["news_filter"] == own and prefs["news_alerts"] == NEWS_ALERTS
    # Die alten Konto-Schlüssel bleiben stehen (nicht gelöscht)
    assert client.get("/api/ui-prefs/1001", headers=h).json()["prefs"]["news_filter"] == NEWS_FILTER


def test_import_is_idempotent(client, with_account):
    h = with_account["anna"]
    _seed_account_prefs(client, h)
    client.post("/api/me/prefs/import-account/1001", headers=h)
    again = client.post("/api/me/prefs/import-account/1001", headers=h)
    assert again.status_code == 200 and again.json()["imported"] == []


def test_import_without_account_values_changes_nothing(client, with_account):
    h = with_account["anna"]
    res = client.post("/api/me/prefs/import-account/1001", headers=h)
    assert res.status_code == 200 and res.json()["imported"] == []
    assert client.get("/api/me/prefs", headers=h).json()["prefs"] == {}


def test_import_foreign_account_is_404_and_without_key_401(client, with_account):
    assert client.post("/api/me/prefs/import-account/1001", headers=with_account["ben"]).status_code == 404
    assert client.post("/api/me/prefs/import-account/1001").status_code == 401


def test_new_keys_are_accepted(client, multi):
    h = multi["anna"]
    for key, value in {
        "toast_duration": {"seconds": 20},
        "chart_tf": {"tf": "H1"},
        "chart_colors": {"colors": ["#112233"] * 19},
    }.items():
        assert client.put(f"/api/me/prefs/{key}", json={"value": value}, headers=h).status_code == 200


def test_import_unknown_account_is_404_for_admin(client, with_account):
    assert client.post("/api/me/prefs/import-account/9999", headers=with_account["admin"]).status_code == 404


def test_import_skips_oversized_account_value(client, with_account):
    h = with_account["anna"]
    client.put("/api/ui-prefs/1001/news_alerts", json={"value": NEWS_ALERTS}, headers=h)
    from src.api import ui_prefs
    import json

    big = {"impacts": ["x" * 9000]}
    path = ui_prefs.get_ui_prefs_path("1001")
    data = json.load(open(path, encoding="utf-8"))
    data["news_filter"] = big  # direkt in die Datei: PUT lässt das nicht zu
    json.dump(data, open(path, "w", encoding="utf-8"))
    res = client.post("/api/me/prefs/import-account/1001", headers=h)
    assert res.json()["imported"] == ["news_alerts"]
