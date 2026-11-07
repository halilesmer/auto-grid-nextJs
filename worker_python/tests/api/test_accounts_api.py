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


@pytest.mark.feature("ACC-05")
def test_loeschen_laesst_archiv_berichte_importe_und_favoriten_stehen(client, seed_accounts, worker_dir):
    """1107-A6.3: nur der Kontoeintrag verschwindet; mit derselben Kennung ist alles wieder da."""
    from src.utils import csv_import, market_db

    seed_accounts(account("1001"), account("1002"))
    market_db.store_deals("1001", [{"ticket": 7, "time": 1_760_000_000, "type": 0, "entry": 0, "symbol": "XAUUSD"}],
                          [(1_760_000_000 - 60, 1_760_000_000 + 60)], account={"currency": "USD", "balance": 1.0})
    with market_db.writing() as conn:
        conn.execute("INSERT INTO backtest_reports (id, owner, name, note, account_id, period_from, period_to, "
                     "worker_version, payload, created_at, symbol_count, passed_count) "
                     "VALUES ('r1','admin','Bericht','','1001',1,2,'v','{}',1,1,1)")
    data = b"time,open,high,low,close\n1760000040,1,2,0.5,1.5\n"
    created = csv_import.create("1001", "Fake-Demo", "XAUUSD", "M1", "x.csv", len(data), 0)
    csv_import.add_chunk("1001", created["import_id"], 0, data)
    csv_import.commit("1001", created["import_id"], False)
    assert client.put("/api/favorites/1001", json={"symbols": ["XAUUSD"]}).status_code == 200
    stored_account = _stored(worker_dir)[0]

    assert client.delete("/api/accounts/1001").json() == {"status": "deleted", "account_id": "1001"}
    assert [a["id"] for a in _stored(worker_dir)] == ["1002"]
    assert (worker_dir / "configs" / "favorites_1001.json").exists()
    with market_db.reading() as conn:
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t} WHERE account_id='1001'").fetchone()[0]
                  for t in ("deals", "deal_coverage", "account_meta", "backtest_reports", "csv_imports")}
        assert conn.execute("SELECT COUNT(*) FROM rates WHERE source LIKE 'csv:%'").fetchone()[0] == 1
    assert counts == {"deals": 1, "deal_coverage": 1, "account_meta": 1, "backtest_reports": 1, "csv_imports": 1}

    assert client.post("/api/accounts", json=stored_account).status_code == 201
    assert client.get("/api/favorites/1001").json()["symbols"] == ["XAUUSD"]
    assert [d["ticket"] for d in market_db.read_deals("1001", 1_760_000_000 - 10, 1_760_000_000 + 10)] == [7]
    listed = client.get("/api/market/1001/imports").json()["imports"]
    assert [(i["status"], i["bars"], i["server"]) for i in listed] == [("committed", 1, "Fake-Demo")]


@pytest.mark.feature("ACC-05")
def test_anderer_besitzer_erbt_das_deal_archiv_einer_geloeschten_kennung_nicht(client, seed_accounts, monkeypatch):
    """Security: der Archiv-Erhalt (1107-A6.3) darf kein Fremdleck sein. Nur derselbe Besitzer bekommt es zurück."""
    from src.api import accounts as accounts_api
    from src.api import auth, users_store
    from src.utils import market_db

    monkeypatch.setattr(auth, "WORKER_API_KEY", "admin-" + "key-for-tests")
    monkeypatch.setattr(accounts_api, "find_mt5_terminals", lambda: ["C:/MT5/terminal64.exe"])
    anna, anna_key = users_store.create_user("Anna")
    ben, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"]))
    market_db.store_deals("1001", [{"ticket": 7, "time": 1_760_000_000, "type": 0, "entry": 0, "symbol": "XAUUSD"}],
                          [(1_760_000_000 - 60, 1_760_000_000 + 60)], account={"currency": "USD", "balance": 1.0})
    stored = account("1001", owner=anna["id"])
    anna_h, ben_h = {"X-API-Key": anna_key}, {"X-API-Key": ben_key}

    assert client.delete("/api/accounts/1001", headers=anna_h).status_code == 200
    # Ben legt dieselbe Kennung an: er bekommt Annas Archiv nicht
    assert client.post("/api/accounts", headers=ben_h, json=stored).status_code == 201
    assert market_db.read_deals("1001", 0, 2_000_000_000) == []
    assert market_db.account_meta("1001") is None

    # Derselbe Besitzer bekommt sein Archiv zurück (die Löschnotiz bleibt nur bis zur nächsten Neuanlage)
    market_db.store_deals("1001", [{"ticket": 8, "time": 1_760_000_000, "type": 0, "entry": 0, "symbol": "XAUUSD"}],
                          [(1_760_000_000 - 60, 1_760_000_000 + 60)])
    assert client.delete("/api/accounts/1001", headers=ben_h).status_code == 200
    assert client.post("/api/accounts", headers=ben_h, json=stored).status_code == 201
    assert [d["ticket"] for d in market_db.read_deals("1001", 0, 2_000_000_000)] == [8]


@pytest.mark.feature("ACC-05")
def test_umbenennen_auf_eine_verwaiste_kennung_erbt_das_archiv_nicht(client, seed_accounts, monkeypatch):
    from src.api import accounts as accounts_api
    from src.api import auth, users_store
    from src.utils import market_db

    monkeypatch.setattr(auth, "WORKER_API_KEY", "admin-" + "key-for-tests")
    monkeypatch.setattr(accounts_api, "find_mt5_terminals", lambda: ["C:/MT5/terminal64.exe"])
    anna, anna_key = users_store.create_user("Anna")
    ben, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"]), account("2002", owner=ben["id"]))
    market_db.store_deals("1001", [{"ticket": 7, "time": 1_760_000_000, "type": 0, "entry": 0, "symbol": "XAUUSD"}],
                          [(1_760_000_000 - 60, 1_760_000_000 + 60)])
    assert client.delete("/api/accounts/1001", headers={"X-API-Key": anna_key}).status_code == 200

    renamed = account("1001", owner=ben["id"], password="")
    res = client.put("/api/accounts/2002", headers={"X-API-Key": ben_key}, json=renamed)
    assert res.status_code == 200, res.text
    assert market_db.read_deals("1001", 0, 2_000_000_000) == []


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
