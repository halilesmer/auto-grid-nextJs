"""ACC-01 … ACC-05 Konten-API, ACC-09 Passwort nie in Antworten, SYS-05 API-Schlüssel."""
import json

import pytest

from tests.api.conftest import TEST_PASSWORD, account


def _stored(worker_dir) -> list[dict]:
    return json.loads((worker_dir / "configs" / "accounts.json").read_text(encoding="utf-8"))["accounts"]


# --------------------------------------------------------------------------- ACC-01
@pytest.mark.feature("ACC-01")
def test_liste_leer_ohne_datei(client):
    res = client.get("/api/accounts")
    assert res.status_code == 200 and res.json() == {"accounts": []}


@pytest.mark.feature("ACC-01")
def test_liste_liefert_alle_konten(client, seed_accounts):
    seed_accounts(account("1001"), account("1002", env_type="LIVE"))
    accounts = client.get("/api/accounts").json()["accounts"]
    assert [(a["id"], a["env_type"]) for a in accounts] == [("1001", "DEMO"), ("1002", "LIVE")]


# --------------------------------------------------------------------------- ACC-02
@pytest.mark.feature("ACC-02")
def test_konto_anlegen_wird_gespeichert(client, worker_dir):
    res = client.post("/api/accounts", json=account("1003", notes="Test"))
    assert res.status_code == 201 and res.json()["status"] == "created"
    stored = _stored(worker_dir)
    assert len(stored) == 1 and stored[0]["id"] == "1003" and stored[0]["password"] == TEST_PASSWORD


@pytest.mark.feature("ACC-02")
@pytest.mark.parametrize("missing", ["id", "account_name", "login", "server", "password"])
def test_pflichtfelder(client, missing):
    body = account("1003")
    del body[missing]
    assert client.post("/api/accounts", json=body).status_code == 422


@pytest.mark.feature("ACC-02")
def test_leeres_passwort_beim_anlegen_abgelehnt(client, worker_dir):
    assert client.post("/api/accounts", json=account("1003", password="  ")).status_code == 422
    assert not (worker_dir / "configs" / "accounts.json").exists()


# --------------------------------------------------------------------------- ACC-03
@pytest.mark.feature("ACC-03")
def test_doppelte_id_gibt_409_problem(client, seed_accounts, worker_dir):
    seed_accounts(account("1001"))
    res = client.post("/api/accounts", json=account("1001", account_name="Doppelt"))
    assert res.status_code == 409
    problem = res.json()["detail"]
    assert problem["code"] == "DUPLICATE_ACCOUNT" and problem["status"] == 409
    assert problem["existing_account"]["account_name"] == "Konto 1001"
    assert len(_stored(worker_dir)) == 1


# --------------------------------------------------------------------------- ACC-04
@pytest.mark.feature("ACC-04")
def test_bearbeiten_behaelt_passwort_wenn_leer(client, seed_accounts, worker_dir):
    seed_accounts(account("1001"))
    res = client.put("/api/accounts/1001", json=account("1001", notes="neu", password=""))
    assert res.status_code == 200
    stored = _stored(worker_dir)[0]
    assert stored["notes"] == "neu" and stored["password"] == TEST_PASSWORD


@pytest.mark.feature("ACC-04")
def test_bearbeiten_unbekannt_404_und_id_kollision_409(client, seed_accounts):
    seed_accounts(account("1001"), account("1002"))
    assert client.put("/api/accounts/9999", json=account("9999")).status_code == 404
    assert client.put("/api/accounts/1001", json=account("1002")).status_code == 409


# --------------------------------------------------------------------------- ACC-05
@pytest.mark.feature("ACC-05")
def test_loeschen(client, seed_accounts, worker_dir):
    seed_accounts(account("1001"), account("1002"))
    assert client.delete("/api/accounts/1001").json() == {"status": "deleted", "account_id": "1001"}
    assert [a["id"] for a in _stored(worker_dir)] == ["1002"]
    assert client.delete("/api/accounts/1001").status_code == 404


# --------------------------------------------------------------------------- ACC-09
@pytest.mark.feature("ACC-09")
def test_passwort_steht_in_keiner_antwort(client, seed_accounts):
    seed_accounts(account("1001"))
    responses = [
        client.get("/api/accounts"),
        client.post("/api/accounts", json=account("1002")),
        client.post("/api/accounts", json=account("1001")),  # 409 mit existing_account
        client.put("/api/accounts/1002", json=account("1002", notes="x")),
    ]
    for res in responses:
        assert TEST_PASSWORD not in res.text, res.request.url
    listed = client.get("/api/accounts").json()["accounts"]
    assert all(a["has_password"] is True and "password" not in a for a in listed)


# --------------------------------------------------------------------------- SYS-05
@pytest.mark.feature("SYS-05")
def test_api_schluessel_pflicht_wenn_gesetzt(client, monkeypatch):
    import src.api.auth as auth

    monkeypatch.setattr(auth, "WORKER_API_KEY", "k" * 24)
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/accounts", headers={"X-API-Key": "falsch"}).status_code == 401
    assert client.get("/api/accounts", headers={"X-API-Key": "k" * 24}).status_code == 200
    # CORS-Preflight trägt keinen Schlüssel und muss durchgehen
    pre = client.options("/api/accounts", headers={"Origin": "http://localhost:3000",
                                                   "Access-Control-Request-Method": "GET"})
    assert pre.status_code == 200


@pytest.mark.feature("SYS-05")
def test_websocket_braucht_schluessel_als_query(client, monkeypatch):
    import src.api.auth as auth
    from starlette.websockets import WebSocketDisconnect

    monkeypatch.setattr(auth, "WORKER_API_KEY", "k" * 24)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/stream"):
            pass
    with client.websocket_connect("/ws/stream?api_key=" + "k" * 24) as ws:
        ws.send_text("ping")  # Verbindung angenommen


@pytest.mark.feature("SYS-05")
def test_ohne_gesetzten_schluessel_offen(client):
    assert client.get("/api/accounts").status_code == 200
