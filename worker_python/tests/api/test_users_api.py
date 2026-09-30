"""USR-01 … USR-06: Mehrbenutzer-Betrieb (persönliche Schlüssel, Konto-Besitzer, Isolation)."""
import json
import secrets
import threading
from types import SimpleNamespace

import pytest
from starlette.websockets import WebSocketDisconnect

from tests.api.conftest import TEST_PASSWORD, account


# Eigene Terminals je Konto; NEW/NEW2 sind installiert, aber noch keinem Konto zugeordnet
PATH_A = "C:/MT5/anna/terminal64.exe"
PATH_B = "C:/MT5/ben/terminal64.exe"
PATH_ADMIN = "C:/MT5/admin/terminal64.exe"
PATH_NEW = "C:/MT5/new/terminal64.exe"


def _h(key: str) -> dict:
    return {"X-API-Key": key}


@pytest.fixture
def multi(client, monkeypatch, seed_accounts, worker_dir):
    """Admin-Schlüssel + Anna (1001) + Ben (1002) + Konto 1003 ohne Besitzer (Altbestand)."""
    import src.api.auth as auth
    from src.api import users_store

    admin_key = secrets.token_urlsafe(24)  # zur Laufzeit erzeugt (Secret-Scan der Hooks)
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin_key)
    anna, anna_key = users_store.create_user("Anna")
    ben, ben_key = users_store.create_user("Ben")
    seed_accounts(
        account("1001", owner=anna["id"], mt5_path=PATH_A),
        account("1002", owner=ben["id"], mt5_path=PATH_B),
        account("1003", mt5_path=PATH_ADMIN),
    )
    # „Installierte“ Terminals (auf dem Mac liefert die Suche nichts)
    import src.api.accounts as accounts_api

    monkeypatch.setattr(
        accounts_api, "find_mt5_terminals", lambda: [PATH_A, PATH_B, PATH_ADMIN, PATH_NEW]
    )

    # Start/Stop dürfen im Test nie echt laufen: ein kaputter Zugriffsschutz soll schnell
    # fehlschlagen (calls ist dann nicht leer), nicht an MT5/Prozessen hängen
    import src.api.bot_control as bot_control

    calls: list = []

    async def fake_start(account_id):
        calls.append(("start", account_id))
        return {"status": "success"}

    monkeypatch.setattr(bot_control, "_start_bot", fake_start)
    monkeypatch.setattr(bot_control, "watch", lambda *a, **k: None)
    monkeypatch.setattr(bot_control, "unwatch", lambda *a, **k: None)
    monkeypatch.setattr(bot_control, "shutdown_mt5", lambda: None)
    running: set = set()
    monkeypatch.setattr(accounts_api, "is_bot_running", lambda account_id: account_id in running)
    monkeypatch.setattr(
        bot_control, "stop_bot_process", lambda account_id: calls.append(("stop", account_id)) or True
    )
    return SimpleNamespace(
        client=client,
        admin=_h(admin_key),
        anna=_h(anna_key),
        ben=_h(ben_key),
        anna_id=anna["id"],
        ben_id=ben["id"],
        anna_key=anna_key,
        worker_dir=worker_dir,
        calls=calls,
        running=running,
    )


def _stored(worker_dir) -> list[dict]:
    return json.loads((worker_dir / "configs" / "accounts.json").read_text(encoding="utf-8"))["accounts"]


# --------------------------------------------------------------------------- USR-01
@pytest.mark.feature("USR-01")
def test_schluessel_bestimmt_die_rolle(multi):
    c = multi.client
    assert c.get("/api/auth/me", headers=multi.admin).json()["role"] == "admin"
    me = c.get("/api/auth/me", headers=multi.anna).json()
    assert me == {"id": multi.anna_id, "name": "Anna", "role": "user"}
    assert c.get("/api/auth/me", headers=_h("falsch")).status_code == 401
    assert c.get("/api/auth/me").status_code == 401
    assert c.get("/api/accounts", headers=_h("falsch")).status_code == 401


@pytest.mark.feature("USR-01")
def test_ohne_admin_schluessel_aber_mit_benutzern_kein_offener_zugang(client, worker_dir, monkeypatch):
    import src.api.auth as auth
    from src.api import users_store

    monkeypatch.setattr(auth, "WORKER_API_KEY", "")
    _, key = users_store.create_user("Anna")
    assert client.get("/api/accounts").status_code == 401  # kein versehentlicher Admin
    assert client.get("/api/accounts", headers=_h(key)).status_code == 200


@pytest.mark.feature("USR-01")
def test_kaputte_users_json_macht_den_worker_nicht_offen(client, worker_dir, monkeypatch):
    import src.api.auth as auth

    monkeypatch.setattr(auth, "WORKER_API_KEY", "")
    (worker_dir / "configs" / "users.json").write_text("{ kaputt", encoding="utf-8")
    assert client.get("/api/accounts").status_code == 401  # nicht: alle Admin
    (worker_dir / "configs" / "users.json").unlink()
    assert client.get("/api/accounts").status_code == 200  # Datei weg = wirklich Altmodus


@pytest.mark.feature("USR-01")
def test_altmodus_ohne_schluessel_und_ohne_benutzer_bleibt_admin(client):
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["role"] == "admin"


@pytest.mark.feature("USR-01")
def test_users_json_enthaelt_nur_den_hash(multi):
    raw = (multi.worker_dir / "configs" / "users.json").read_text(encoding="utf-8")
    assert multi.anna_key not in raw and "key_hash" in raw


# --------------------------------------------------------------------------- USR-02
@pytest.mark.feature("USR-02")
def test_benutzer_anlegen_zeigt_schluessel_nur_einmal(multi):
    c = multi.client
    res = c.post("/api/users", json={"name": "Cem"}, headers=multi.admin)
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["name"] == "Cem" and body["user"]["account_count"] == 0 and body["key"]
    # der neue Schlüssel funktioniert sofort
    assert c.get("/api/auth/me", headers=_h(body["key"])).json()["name"] == "Cem"
    listed = c.get("/api/users", headers=multi.admin).json()["users"]
    assert {u["name"]: u["account_count"] for u in listed} == {"Anna": 1, "Ben": 1, "Cem": 0}
    assert all(set(u) == {"id", "name", "created_at", "account_count"} for u in listed)


@pytest.mark.feature("USR-02")
def test_benutzer_anlegen_braucht_gesetzten_admin_schluessel(client, worker_dir, monkeypatch):
    import src.api.auth as auth

    monkeypatch.setattr(auth, "WORKER_API_KEY", "")
    res = client.post("/api/users", json={"name": "Anna"})  # offener Modus: jeder wäre Admin
    assert res.status_code == 409 and "WORKER_API_KEY" in res.json()["detail"]
    assert not (worker_dir / "configs" / "users.json").exists()  # der Worker bleibt offen/nutzbar


@pytest.mark.feature("USR-02")
def test_benutzername_eindeutig_und_nicht_leer(multi):
    c = multi.client
    assert c.post("/api/users", json={"name": " anna "}, headers=multi.admin).status_code == 409
    assert c.post("/api/users", json={"name": "   "}, headers=multi.admin).status_code == 422
    assert c.post("/api/users", json={"name": "x" * 41}, headers=multi.admin).status_code == 422


@pytest.mark.feature("USR-02")
def test_schluessel_erneuern_entwertet_den_alten(multi):
    c = multi.client
    res = c.post(f"/api/users/{multi.anna_id}/key", headers=multi.admin)
    assert res.status_code == 200
    new_key = res.json()["key"]
    assert c.get("/api/auth/me", headers=multi.anna).status_code == 401
    assert c.get("/api/auth/me", headers=_h(new_key)).json()["name"] == "Anna"
    assert c.post("/api/users/u_unbekannt/key", headers=multi.admin).status_code == 404


@pytest.mark.feature("USR-02")
def test_benutzer_loeschen_gibt_konten_frei(multi):
    c = multi.client
    res = c.delete(f"/api/users/{multi.anna_id}", headers=multi.admin)
    assert res.status_code == 200 and res.json()["released_accounts"] == 1
    assert c.get("/api/auth/me", headers=multi.anna).status_code == 401
    stored = {a["id"]: a.get("owner") for a in _stored(multi.worker_dir)}
    assert stored == {"1001": None, "1002": multi.ben_id, "1003": None}
    assert c.delete("/api/users/u_unbekannt", headers=multi.admin).status_code == 404


@pytest.mark.feature("USR-02")
def test_benutzerverwaltung_nur_fuer_admin(multi):
    c = multi.client
    assert c.get("/api/users", headers=multi.anna).status_code == 403
    assert c.post("/api/users", json={"name": "Zed"}, headers=multi.anna).status_code == 403
    assert c.post(f"/api/users/{multi.ben_id}/key", headers=multi.anna).status_code == 403
    assert c.delete(f"/api/users/{multi.ben_id}", headers=multi.anna).status_code == 403


# --------------------------------------------------------------------------- USR-03
@pytest.mark.feature("USR-03")
def test_liste_zeigt_benutzern_nur_eigene_konten(multi):
    c = multi.client
    ids = lambda headers: [a["id"] for a in c.get("/api/accounts", headers=headers).json()["accounts"]]
    assert ids(multi.anna) == ["1001"] and ids(multi.ben) == ["1002"]
    assert ids(multi.admin) == ["1001", "1002", "1003"]  # Altbestand ohne Besitzer nur beim Admin


@pytest.mark.feature("USR-03")
def test_benutzer_legt_konto_fuer_sich_an_besitzer_aus_body_wird_ignoriert(multi):
    c = multi.client
    body = account("2001", mt5_path=PATH_NEW, owner=multi.ben_id)
    res = c.post("/api/accounts", json=body, headers=multi.anna)
    assert res.status_code == 201 and res.json()["account"]["owner"] == multi.anna_id
    assert {a["id"] for a in c.get("/api/accounts", headers=multi.ben).json()["accounts"]} == {"1002"}


@pytest.mark.feature("USR-03")
def test_admin_legt_konto_mit_besitzer_an(multi):
    c = multi.client
    ok = c.post("/api/accounts", json=account("2002", mt5_path="", owner=multi.ben_id), headers=multi.admin)
    assert ok.status_code == 201 and ok.json()["account"]["owner"] == multi.ben_id
    own = c.post("/api/accounts", json=account("2003", mt5_path=""), headers=multi.admin)
    assert own.status_code == 201 and own.json()["account"]["owner"] is None
    bad = c.post("/api/accounts", json=account("2004", mt5_path="", owner="u_gibtsnicht"), headers=multi.admin)
    assert bad.status_code == 422


@pytest.mark.feature("USR-03")
def test_bearbeiten_behaelt_besitzer_nur_admin_aendert_ihn(multi):
    c = multi.client
    edit = account("1001", account_name="Neu", mt5_path=PATH_A, password="", owner=multi.ben_id)
    res = c.put("/api/accounts/1001", json=edit, headers=multi.anna)
    assert res.status_code == 200 and res.json()["account"]["owner"] == multi.anna_id
    # Admin ohne owner-Feld: Besitzer bleibt; mit owner-Feld: wird geändert (auch auf leer)
    no_owner = account("1001", mt5_path=PATH_A, password="")
    assert c.put("/api/accounts/1001", json=no_owner, headers=multi.admin).json()["account"]["owner"] == multi.anna_id
    moved = c.put("/api/accounts/1001", json={**no_owner, "owner": multi.ben_id}, headers=multi.admin)
    assert moved.json()["account"]["owner"] == multi.ben_id
    cleared = c.put("/api/accounts/1001", json={**no_owner, "owner": ""}, headers=multi.admin)
    assert cleared.json()["account"]["owner"] is None
    assert _stored(multi.worker_dir)[0]["password"] == TEST_PASSWORD  # Passwort bleibt erhalten


@pytest.mark.feature("USR-03")
@pytest.mark.parametrize("bad_id", ["..", "12ab", "1001/../x", "*", " 1"])
def test_konto_id_nur_ziffern(multi, bad_id):
    res = multi.client.post(
        "/api/accounts", json=account("2001", id=bad_id, mt5_path=PATH_NEW), headers=multi.anna
    )
    assert res.status_code == 422


@pytest.mark.feature("USR-03")
def test_duplikat_verraet_fremde_konten_nicht(multi):
    c = multi.client
    foreign = c.post("/api/accounts", json=account("1002", mt5_path=PATH_NEW), headers=multi.anna)
    assert foreign.status_code == 409 and isinstance(foreign.json()["detail"], str)
    assert "existing_account" not in foreign.text and "Konto 1002" not in foreign.text
    mine = c.post("/api/accounts", json=account("1001", mt5_path=PATH_NEW), headers=multi.anna)
    assert mine.status_code == 409 and mine.json()["detail"]["existing_account"]["id"] == "1001"


@pytest.mark.feature("USR-03")
def test_id_darf_nicht_mit_fremdem_login_kollidieren(multi):
    # _start_bot matcht id ODER login: Konto 3001 mit Login 1002 würde /start?account_id=1002 kapern
    res = multi.client.post(
        "/api/accounts", json=account("3001", login=1002, mt5_path=PATH_NEW), headers=multi.anna
    )
    assert res.status_code == 409


@pytest.mark.feature("USR-03")
def test_mt5_pfad_fuer_benutzer_nur_installiertes_freies_terminal(multi):
    c = multi.client

    def post(path, id_="2001"):
        return c.post("/api/accounts", json=account(id_, mt5_path=path), headers=multi.anna)

    assert post("//evil/share/terminal64.exe").status_code == 422  # nicht installiert (UNC)
    assert post("").status_code == 422  # Pfad ist Pflicht (yolsuz initialize → irgendein Terminal)
    assert post(PATH_ADMIN).status_code == 422  # Terminal eines Kontos ohne Besitzer/Admin
    assert post(PATH_B).status_code == 422  # Terminal eines anderen Benutzers
    ok = post("C:\\MT5\\NEW\\terminal64.EXE")  # Schreibweise egal
    assert ok.status_code == 201
    # eigenes Terminal darf ein zweites eigenes Konto nutzen; beim Bearbeiten bleibt der Pfad erlaubt
    assert post(PATH_A, "2002").status_code == 201
    edit = account("1001", account_name="Umbenannt", mt5_path=PATH_A, password="")
    assert c.put("/api/accounts/1001", json=edit, headers=multi.anna).status_code == 200
    # Admin ist nicht eingeschränkt
    free = c.post("/api/accounts", json=account("2003", mt5_path="D:/eigen/terminal64.exe"), headers=multi.admin)
    assert free.status_code == 201


@pytest.mark.feature("USR-03")
def test_konto_mit_laufendem_bot_nicht_aendern_oder_loeschen(multi):
    c = multi.client
    multi.running.add("1001")
    edit = account("1001", account_name="Neu", mt5_path=PATH_A, password="")
    assert c.put("/api/accounts/1001", json=edit, headers=multi.anna).status_code == 409
    assert c.delete("/api/accounts/1001", headers=multi.anna).status_code == 409
    assert c.delete("/api/accounts/1001", headers=multi.admin).status_code == 409
    assert {a["id"] for a in _stored(multi.worker_dir)} == {"1001", "1002", "1003"}
    multi.running.clear()
    assert c.delete("/api/accounts/1001", headers=multi.anna).status_code == 200


# --------------------------------------------------------------------------- USR-04
FOREIGN = [
    ("get", "/api/settings/1002", None),
    ("post", "/api/settings/1002", {"settings": {}}),
    ("get", "/api/ui-state/1002", None),
    ("post", "/api/ui-state/1002", {"settings": {}}),
    ("get", "/api/symbols/1002", None),
    ("get", "/api/logs/1002", None),
    ("delete", "/api/logs/1002", None),
    ("get", "/api/logs/download/1002", None),
    ("post", "/api/start?account_id=1002", None),
    ("post", "/api/stop?account_id=1002", None),
    ("post", "/api/action", {"account_id": "1002", "action": "x"}),
    ("put", "/api/accounts/1002", account("1002", mt5_path="", password="")),
    ("delete", "/api/accounts/1002", None),
    # Glob-/Pfad-Tricks treffen kein bestehendes eigenes Konto
    ("get", "/api/settings/*", None),
    ("get", "/api/logs/download/%2E%2E", None),
    ("get", "/api/logs/1003", None),  # Altbestand ohne Besitzer
]


@pytest.mark.feature("USR-04")
@pytest.mark.parametrize("method,url,body", FOREIGN, ids=[f"{m}-{u}" for m, u, _ in FOREIGN])
def test_fremdes_konto_ist_ueberall_404(multi, method, url, body):
    res = getattr(multi.client, method)(url, headers=multi.anna, **({"json": body} if body is not None else {}))
    assert res.status_code == 404
    assert multi.calls == []  # Bot wurde weder gestartet noch gestoppt
    assert _stored(multi.worker_dir)[1]["id"] == "1002"  # nichts wurde verändert/gelöscht


@pytest.mark.feature("USR-04")
def test_eigenes_konto_und_admin_kommen_durch(multi):
    c = multi.client
    for url in ("/api/settings/1001", "/api/ui-state/1001", "/api/logs/1001"):
        assert c.get(url, headers=multi.anna).status_code == 200
    assert c.post("/api/start?account_id=1001", headers=multi.anna).status_code == 200
    assert c.post("/api/stop?account_id=1001", headers=multi.anna).status_code == 200
    assert multi.calls == [("start", "1001"), ("stop", "1001")]
    # Admin: Verhalten unverändert, auch für fremde Konten
    for url in ("/api/settings/1002", "/api/ui-state/1002", "/api/logs/1002", "/api/logs/1003"):
        assert c.get(url, headers=multi.admin).status_code == 200


# --------------------------------------------------------------------------- USR-05
@pytest.mark.feature("USR-05")
def test_websocket_nur_fuer_eigene_konten(multi):
    c = multi.client
    key = multi.anna["X-API-Key"]

    def closed(url):
        with pytest.raises(WebSocketDisconnect) as info:
            with c.websocket_connect(url):
                # Wurde die Verbindung angenommen, schlägt der Test sofort fehl (statt zu hängen)
                pytest.fail(f"Verbindung wurde angenommen: {url}")
        return info.value.code

    assert closed(f"/ws/stream?api_key={key}") == 1008  # kein „erstes Konto“-Fallback
    assert closed(f"/ws/stream?api_key={key}&account_id=1002") == 1008
    assert closed(f"/ws/stream?api_key={key}&account_id=1003") == 1008
    assert closed("/ws/stream?api_key=falsch&account_id=1001") == 1008
    with c.websocket_connect(f"/ws/stream?api_key={key}&account_id=1001") as ws:
        ws.send_text("ping")  # Verbindung angenommen
    admin_key = multi.admin["X-API-Key"]
    with c.websocket_connect(f"/ws/stream?api_key={admin_key}") as ws:
        ws.send_text("ping")  # Admin darf weiterhin ohne Konto (erstes Konto)


@pytest.mark.feature("USR-05")
@pytest.mark.parametrize("change", ["rotate", "delete", "owner", "account_deleted"])
def test_offene_verbindung_wird_nach_entzug_der_berechtigung_geschlossen(multi, monkeypatch, change):
    import src.api.ws_server as ws_server

    monkeypatch.setattr(ws_server, "WS_REVALIDATE_SECONDS", 0.05)
    c = multi.client
    key = multi.anna["X-API-Key"]
    outcome: dict = {}

    def wait_for_close(ws):
        try:
            ws.receive_text()
        except WebSocketDisconnect as exc:
            outcome["code"] = exc.code

    with c.websocket_connect(f"/ws/stream?api_key={key}&account_id=1001") as ws:
        # Eigener Thread mit Frist: bleibt die Neuprüfung aus, schlägt der Test fehl statt zu hängen
        waiter = threading.Thread(target=wait_for_close, args=(ws,), daemon=True)
        waiter.start()
        if change == "rotate":
            assert c.post(f"/api/users/{multi.anna_id}/key", headers=multi.admin).status_code == 200
        elif change == "delete":
            assert c.delete(f"/api/users/{multi.anna_id}", headers=multi.admin).status_code == 200
        elif change == "owner":
            move = account("1001", mt5_path=PATH_A, password="", owner=multi.ben_id)
            assert c.put("/api/accounts/1001", json=move, headers=multi.admin).status_code == 200
        else:
            assert c.delete("/api/accounts/1001", headers=multi.admin).status_code == 200
        waiter.join(3.0)
        assert not waiter.is_alive(), "Verbindung wurde nach dem Entzug der Berechtigung nicht geschlossen"
    assert outcome["code"] == 1008


# --------------------------------------------------------------------------- USR-06
@pytest.mark.feature("USR-06")
def test_systemrouten_nur_fuer_admin(multi):
    c = multi.client
    assert c.get("/api/system/update/check", headers=multi.anna).status_code == 403
    assert c.post("/api/system/update", headers=multi.anna).status_code == 403  # startet kein git
    # Verbindungstest und MT5-Suche (Konto-Formular) bleiben für alle offen
    assert c.get("/api/system/platform", headers=multi.anna).status_code == 200
    assert c.get("/api/system/scan-mt5", headers=multi.anna).status_code == 200
