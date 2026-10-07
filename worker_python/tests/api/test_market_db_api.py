"""ANA-04 Kursdatenbank (GET /market/{id}/rates, /coverage) und ANA-07 Deal-Archiv + Zonen-Register
(GET /history/{id}/deals, Register beim Speichern der Einstellungen) – docs/analyse-regeln.md §2/§3.

MT5 ist FakeMT5, die Verbindung ist ersetzt (test_mt5_connect.py). Zeiten sind MT5-Zeit.
Kerzen: Freitag 25.09.2026 20:00–24:00 und Montag 28.09. 00:00–02:00 (M1), dazwischen Wochenende;
die laufende Kerze ist Montag 02:00.
"""
import calendar
import os
import sqlite3
import time

import pytest

import src.utils.mt5_connection as mc
from src.utils import market_db, market_sync, mt5_market
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5
from tests.helpers import make_zone

SYMBOL = "XAUUSD"
MON = calendar.timegm((2026, 9, 28, 0, 0, 0))
FRI_20 = MON - 2 * 86400 - 4 * 3600
SAT = MON - 2 * 86400
LIVE = MON + 2 * 3600
URL = f"/api/market/{TEST_ACCOUNT_ID}/rates"
DEALS_URL = f"/api/history/{TEST_ACCOUNT_ID}/deals"


@pytest.fixture(autouse=True)
def fresh_entry_lookups(monkeypatch):
    monkeypatch.setattr(market_sync, "_entry_lookups_done", {})
    monkeypatch.setattr(market_sync, "_tail_cache", {})


def _bars(start, end, step=60):
    return [{"time": t, "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "tick_volume": 5, "spread": 3}
            for t in range(start, end, step)]


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol(SYMBOL, 2650.0, digits=2, point=0.01)
    fake.set_rates(SYMBOL, fake.TIMEFRAME_M1, _bars(FRI_20, SAT) + _bars(MON, LIVE))

    connects = []
    range_calls = []
    original = fake.copy_rates_range

    def copy_rates_range(symbol, timeframe, date_from, date_to):
        range_calls.append((int(date_from), int(date_to)))
        return original(symbol, timeframe, date_from, date_to)

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        connects.append({"allow_restart": allow_restart, "data_query": data_query})
        return True, False, None

    fake.copy_rates_range = copy_rates_range
    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    monkeypatch.setattr(market_sync, "CHUNK_PAUSE_SEC", 0)
    fake.connects = connects
    fake.range_calls = range_calls
    return fake


def get_rates(client, a, b, tf="M1", **headers):
    res = client.get(URL, params={"symbol": SYMBOL, "timeframe": tf, "from": a, "to": b}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def coverage_rows():
    with market_db.reading() as conn:
        return [tuple(r) for r in conn.execute(
            "SELECT from_t, to_t, state FROM rate_coverage ORDER BY from_t")]


# --------------------------------------------------------------------------- Kerzen (ANA-04)
@pytest.mark.feature("ANA-04")
def test_kerzen_werden_gespeichert_und_nicht_erneut_geholt(client, broker):
    body = get_rates(client, MON, MON + 3600)
    assert body["t"] == list(range(MON, MON + 3600, 60))
    assert body["digits"] == 2 and body["point"] == 0.01
    assert body["missing"] == []
    assert broker.connects == [{"allow_restart": False, "data_query": True}]
    assert coverage_rows() == [(MON, MON + 3600, "complete")]

    again = get_rates(client, MON, MON + 3600)
    assert again["t"] == body["t"]
    assert len(broker.connects) == 1  # alles aus der Datenbank


@pytest.mark.feature("ANA-04")
def test_wochenende_ist_bestaetigte_pause(client, broker):
    body = get_rates(client, SAT, MON)
    assert body["t"] == [] and body["missing"] == []
    assert coverage_rows() == [(SAT, MON, "gap_confirmed")]
    get_rates(client, SAT, MON)
    assert len(broker.connects) == 1


@pytest.mark.feature("ANA-04")
def test_aelterer_zeitraum_wird_spaeter_nur_ergaenzt(client, broker):
    get_rates(client, MON, MON + 3600)
    body = get_rates(client, FRI_20, MON + 3600)
    # Nur das fehlende ältere Stück wurde bei MT5 angefragt
    assert broker.range_calls[-1] == (FRI_20, MON - 1)
    assert len(body["t"]) == 240 + 60
    assert body["t"] == sorted(body["t"])
    # Das Wochenende zwischen den beiden Abfragen ist eine bestätigte Pause
    assert coverage_rows() == [(FRI_20, SAT, "complete"), (SAT, MON, "gap_confirmed"),
                               (MON, MON + 3600, "complete")]


@pytest.mark.feature("ANA-04")
def test_luecke_zwischen_kerzen_ist_pause_vor_der_ersten_nicht_verfuegbar(client, broker):
    # Freitag 23:00 bis Montag 01:00: Kerzen vorn und hinten, das Wochenende dazwischen ist
    # Teil der vollständigen Strecke (Lücke zwischen zwei gelieferten Kerzen = Pause)
    body = get_rates(client, SAT - 3600, MON + 3600)
    assert len(body["t"]) == 120 and SAT not in body["t"]
    assert coverage_rows() == [(SAT - 3600, MON + 3600, "complete")]

    # Vor der ersten Kerze, die MT5 überhaupt hat: nicht verfügbar, keine Pause
    early = FRI_20 - 86400
    body = get_rates(client, early, FRI_20 + 600)
    assert body["missing"] == [{"from": early, "to": FRI_20, "reason": "unavailable",
                                "checked_at": body["missing"][0]["checked_at"]}]
    assert (early, FRI_20, "unavailable") in coverage_rows()


@pytest.mark.feature("ANA-04")
def test_nicht_verfuegbar_wird_erst_nach_24_stunden_erneut_versucht(client, broker, monkeypatch):
    early = FRI_20 - 86400
    get_rates(client, early, FRI_20)
    calls = len(broker.connects)
    body = get_rates(client, early, FRI_20)
    assert len(broker.connects) == calls
    assert body["missing"][0]["reason"] == "unavailable"

    later = time.time() + market_db.UNAVAILABLE_RETRY_SEC + 1
    monkeypatch.setattr(market_db.time, "time", lambda: later)
    monkeypatch.setattr(market_sync.time, "time", lambda: later)
    get_rates(client, early, FRI_20)
    assert len(broker.connects) == calls + 1


@pytest.mark.feature("ANA-04")
def test_laufende_kerze_wird_geliefert_aber_nie_gespeichert(client, broker):
    body = get_rates(client, MON + 3600, LIVE + 3600)
    assert body["t"][-1] == LIVE and body["live_from"] == LIVE
    assert coverage_rows() == [(MON + 3600, LIVE, "complete")]
    with market_db.reading() as conn:
        assert conn.execute("SELECT COUNT(*) FROM rates WHERE t_mt5 >= ?", (LIVE,)).fetchone()[0] == 0
    # Der offene Rand wird beim nächsten Mal wieder gefragt (nach dem 30-s-Cache)
    market_sync._tail_cache.clear()
    get_rates(client, MON + 3600, LIVE + 3600)
    assert broker.range_calls[-1] == (LIVE, LIVE + 3600 - 1)


@pytest.mark.feature("ANA-04")
def test_endstueck_wird_30_sekunden_wiederverwendet(client, broker, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(market_sync.time, "monotonic", lambda: now[0])
    first = get_rates(client, MON + 3600, LIVE + 3600)
    calls = len(broker.connects)
    now[0] += 29
    again = get_rates(client, MON + 3600, LIVE + 3600)
    # server_now/offset_sec setzt der Endpunkt bei jeder Antwort neu; die Kerzen kommen aus dem Cache
    assert {k: v for k, v in again.items() if k not in ("server_now", "offset_sec")} == {
        k: v for k, v in first.items() if k not in ("server_now", "offset_sec")}
    assert len(broker.connects) == calls  # kein neuer MT5-Kontakt
    now[0] += 2
    get_rates(client, MON + 3600, LIVE + 3600)
    assert len(broker.connects) > calls
    # Ohne laufende Kerze (abgeschlossener Zeitraum) wird nichts zwischengespeichert
    get_rates(client, MON, MON + 3600)
    assert all(k[3] != MON for k in market_sync._tail_cache)


@pytest.mark.feature("ANA-04")
def test_endstueck_mit_stoerung_wird_nicht_zwischengespeichert(client, broker, monkeypatch):
    real = market_sync._fetch_chunk
    calls = []

    def flaky(account, symbol, tf_name, a, b):
        calls.append((a, b))
        if len(calls) == 1:  # erstes Stück: MT5-Fehler, zweites liefert die laufende Kerze
            raise mt5_market.MarketDataError("[RATES] timeout")
        return real(account, symbol, tf_name, a, b)

    monkeypatch.setattr(market_sync, "CHUNK_BARS", 60)
    monkeypatch.setattr(market_sync, "_fetch_chunk", flaky)
    body = get_rates(client, LIVE - 3600, LIVE + 60)
    assert body["live_from"] == LIVE and any(m["reason"] == "error" for m in body["missing"])
    assert market_sync._tail_cache == {}


@pytest.mark.feature("ANA-04")
def test_mt5_fehler_wird_nicht_gespeichert(client, broker, monkeypatch):
    def broken(*_a, **_k):
        broker._last_error = (-10004, "No IPC connection")
        return None

    monkeypatch.setattr(broker, "copy_rates_range", broken)
    body = get_rates(client, MON, MON + 3600)
    assert body["t"] == []
    assert body["missing"][0]["reason"] == "error" and "No IPC" in body["missing"][0]["detail"]
    assert coverage_rows() == []


@pytest.mark.feature("ANA-04")
def test_belegtes_konto_liefert_vorhandenes_und_meldet_den_rest(client, broker, monkeypatch):
    import src.api.market as market

    get_rates(client, MON, MON + 1800)
    monkeypatch.setattr(market, "is_account_busy", lambda _id: True)
    body = get_rates(client, MON, MON + 3600)
    assert len(body["t"]) == 30
    assert body["missing"] == [{"from": MON + 1800, "to": MON + 3600, "reason": "busy", "checked_at": None}]
    assert len(broker.connects) == 1


@pytest.mark.feature("ANA-04")
def test_lange_zeitraeume_in_stuecken_und_mit_next_from(client, broker, monkeypatch):
    monkeypatch.setattr(market_sync, "CHUNK_BARS", 60)
    monkeypatch.setattr(market_sync, "MAX_BARS", 100)
    body = get_rates(client, MON, LIVE)
    # 100 Kerzen je Antwort, abgefragt in Stücken zu je 60 Kerzen
    assert len(body["t"]) == 100 and body["next_from"] == MON + 100 * 60
    assert broker.range_calls == [(MON, MON + 3600 - 1), (MON + 3600, MON + 6000 - 1)]
    rest = get_rates(client, body["next_from"], LIVE)
    assert rest["t"][0] == MON + 6000 and rest["next_from"] is None


@pytest.mark.feature("ANA-04")
def test_volle_datenbank_speichert_keine_kerzen_liefert_sie_aber(client, broker, monkeypatch):
    monkeypatch.setenv("MARKET_DB_MAX_MB", "0")
    body = get_rates(client, MON, MON + 600)
    assert len(body["t"]) == 10 and body["db_full"] is True
    assert coverage_rows() == []


@pytest.mark.feature("ANA-04")
def test_eingaben_werden_geprueft(client, broker):
    params = {"symbol": SYMBOL, "from": MON, "to": MON + 60}
    assert client.get(URL, params={**params, "timeframe": "W1"}).status_code == 400
    assert client.get(URL, params={**params, "to": MON}).status_code == 400
    assert client.get("/api/market/9999/rates", params=params).status_code == 404


@pytest.mark.feature("ANA-04")
def test_fremdes_konto_bekommt_404(client, broker, seed_accounts, monkeypatch):
    import secrets

    import src.api.auth as auth
    from src.api import users_store

    monkeypatch.setattr(auth, "WORKER_API_KEY", secrets.token_urlsafe(24))
    owner, owner_key = users_store.create_user("Anna")
    _other, other_key = users_store.create_user("Ben")
    seed_accounts(account(owner=owner["id"]))
    params = {"symbol": SYMBOL, "from": MON, "to": MON + 60}
    assert client.get(URL, params=params, headers={"X-API-Key": other_key}).status_code == 404
    assert client.get(DEALS_URL, headers={"X-API-Key": other_key}).status_code == 404
    assert client.get(URL, params=params, headers={"X-API-Key": owner_key}).status_code == 200


@pytest.mark.feature("ANA-04")
def test_abdeckung_und_abstandsmessung(client, broker):
    broker.ticks[SYMBOL].time = int(time.time()) + 3 * 3600
    get_rates(client, SAT, MON + 600)
    res = client.get(f"/api/market/{TEST_ACCOUNT_ID}/coverage", params={"symbol": SYMBOL})
    assert res.status_code == 200
    body = res.json()
    # Kerzen nur im complete-Bereich; die Pause hat keine (VPS-Test 01.10.: Pause meldete 60)
    assert {(c["state"], c["bars"]) for c in body["coverage"]} == {("gap_confirmed", 0), ("complete", 10)}
    assert body["db_bytes"] > 0
    # Ohne /clock-Aufruf (z. B. nach Worker-Neustart) kommt der Abstand aus dem Protokoll
    assert body["offset_sec"] == 10800
    assert abs(body["server_now"] - (time.time() + 10800)) < 5
    with market_db.reading() as conn:
        assert [tuple(r) for r in conn.execute("SELECT server, offset_sec FROM broker_offset_log")] == [
            ("Fake-Demo", 10800)]


@pytest.mark.feature("ANA-04")
def test_rates_liefert_abstand_aus_dem_protokoll(client, broker):
    broker.ticks[SYMBOL].time = int(time.time()) + 3 * 3600
    body = get_rates(client, SAT, MON + 600)
    assert body["offset_sec"] == 10800
    assert body["server_now"] is not None


@pytest.mark.feature("ANA-04")
def test_veralteter_abstand_wird_nicht_geliefert(client, broker):
    market_db.log_broker_offset("Fake-Demo", time.time() - 2 * 86400, 10800)
    broker.ticks[SYMBOL].time = 0  # keine verlässliche Messung jetzt
    body = get_rates(client, SAT, MON + 600)
    assert body["offset_sec"] is None and body["server_now"] is None


# --------------------------------------------------------------------------- Backup / Migration
@pytest.mark.feature("ANA-04")
def test_backup_und_wiederherstellung(client, broker, worker_dir):
    get_rates(client, MON, MON + 600)
    path = market_db.backup()
    assert os.path.basename(path) == f"market-{market_db._today()}.sqlite"

    with market_db.writing() as conn:
        conn.execute("DELETE FROM rates")
    assert market_db.read_rates("Fake-Demo", SYMBOL, 60, MON, MON + 600, 100) == []

    market_db.restore(path)
    assert len(market_db.read_rates("Fake-Demo", SYMBOL, 60, MON, MON + 600, 100)) == 10
    assert os.path.exists(market_db.db_path() + ".broken")


@pytest.mark.feature("ANA-04")
def test_backups_werden_auf_sieben_begrenzt(client, broker, worker_dir):
    get_rates(client, MON, MON + 60)
    backups = worker_dir / "data" / "backups"
    for day in range(1, 10):
        (backups / f"market-202601{day:02d}.sqlite").write_bytes(b"")
    market_db.backup()
    names = sorted(p.name for p in backups.iterdir())
    assert len(names) == 7 and names[-1] == f"market-{market_db._today()}.sqlite"


@pytest.mark.feature("ANA-04")
def test_fehlgeschlagene_migration_laesst_alte_version_und_antwortet_503(client, broker, monkeypatch):
    get_rates(client, MON, MON + 60)
    market_db.reset_cache()
    old_version = market_db.SCHEMA_VERSION
    monkeypatch.setattr(market_db, "MIGRATIONS", market_db.MIGRATIONS + [["CREATE TABLE rates (x)"]])
    monkeypatch.setattr(market_db, "SCHEMA_VERSION", old_version + 1)

    res = client.get(URL, params={"symbol": SYMBOL, "timeframe": "M1", "from": MON, "to": MON + 60})
    assert res.status_code == 503 and "göçü" in res.json()["detail"]
    conn = sqlite3.connect(market_db.db_path())
    assert conn.execute("PRAGMA user_version").fetchone()[0] == old_version
    assert conn.execute("SELECT COUNT(*) FROM rates").fetchone()[0] == 1
    conn.close()
    # Vor der Migration wurde gesichert
    assert any(f"pre-v{old_version + 1}" in name for name in os.listdir(market_db.backups_dir()))


@pytest.mark.feature("ANA-04")
def test_kaputte_datenbankdatei_antwortet_503(client, broker, worker_dir):
    (worker_dir / "data" / "market.sqlite").write_bytes(b"kein sqlite" * 100)
    res = client.get(URL, params={"symbol": SYMBOL, "timeframe": "M1", "from": MON, "to": MON + 60})
    assert res.status_code == 503
    assert client.get(DEALS_URL).status_code == 503
    # Einstellungen speichern geht trotzdem (das Register ist nie ein Hindernis)
    assert client.post(f"/api/settings/{TEST_ACCOUNT_ID}", json={"settings": {"ZONES": []}}).status_code == 200


@pytest.mark.feature("ANA-04")
def test_konto_ohne_server_und_leeres_symbol_400(client, broker, seed_accounts):
    params = {"symbol": " ", "timeframe": "M1", "from": MON, "to": MON + 60}
    assert client.get(URL, params=params).status_code == 400
    seed_accounts(account(server=""))
    assert client.get(URL, params={**params, "symbol": SYMBOL}).status_code == 400


@pytest.mark.feature("ANA-04")
def test_datenbank_nutzt_wal_und_inkrementelles_vacuum(client, broker):
    get_rates(client, MON, MON + 60)
    conn = sqlite3.connect(market_db.db_path())
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert conn.execute("PRAGMA auto_vacuum").fetchone()[0] == 2
    conn.close()


def test_klassifizierung_ohne_mt5():
    tf = 60
    bars = _bars(100 * tf, 103 * tf)
    stored, segs, live = market_sync.classify(bars, 98 * tf, 110 * tf, tf, latest={"time": 105 * tf}, has_before=True)
    assert [b["time"] for b in stored] == [100 * tf, 101 * tf, 102 * tf]
    assert segs == [(98 * tf, 100 * tf, "gap_confirmed"), (100 * tf, 103 * tf, "complete"),
                    (103 * tf, 105 * tf, "gap_confirmed")]
    assert live == {"time": 105 * tf}  # neueste MT5-Kerze: geliefert, nie gespeichert
    assert market_sync.classify([], 0, 600, tf, latest=None, has_before=False)[1] == [(0, 600, "unavailable")]
    # Leer, aber länger als jede Pause (Terminal lädt die Historie evtl. noch): nicht verfügbar
    day = 86400
    assert market_sync.classify([], 0, 5 * day, tf, latest={"time": 6 * day}, has_before=True)[1] == [
        (0, 5 * day, "unavailable")]
    assert market_sync.classify([], 0, 3 * day, tf, latest={"time": 6 * day}, has_before=True)[1] == [
        (0, 3 * day, "gap_confirmed")]


def test_intervalle_abziehen():
    assert market_db.subtract([(0, 10)], [(2, 4), (6, 12)]) == [(0, 2), (4, 6)]
    assert market_db.subtract([(0, 10)], []) == [(0, 10)]
    assert market_db.subtract([(0, 10)], [(-5, 20)]) == []


# --------------------------------------------------------------------------- Deals (ANA-07)
@pytest.fixture
def deals(broker):
    now = int(time.time()) + 3 * 3600
    old_in = broker.add_deal(SYMBOL, 0, 0, now - 40 * 86400, volume=0.2, price=2600.0, magic=200001,
                             commission=-1.4)
    broker.add_deal(SYMBOL, 1, 1, now - 3 * 86400, volume=0.1, price=2650.0, profit=5.0, magic=200001,
                    position_id=old_in.ticket)
    broker.add_deal("", 2, 0, now - 10 * 86400, profit=1000.0)  # Einzahlung
    broker.add_deal(SYMBOL, 1, 0, now - 3600, volume=0.1, price=2655.0, magic=0)  # manuell
    old_in.position_id = old_in.ticket
    return {"now": now, "old_in": old_in}


@pytest.mark.feature("ANA-07")
def test_alle_deals_werden_archiviert_auch_einzahlung_und_manuelle(client, deals):
    now = deals["now"]
    res = client.get(DEALS_URL, params={"from": now - 30 * 86400})
    assert res.status_code == 200, res.text
    body = res.json()
    inside = [d for d in body["deals"] if d["time"] >= now - 30 * 86400]
    assert sorted(d["type"] for d in inside) == [1, 1, 2]
    # Der Einstieg der Teilschließung lag vor dem Zeitraum und kommt zur Zuordnung mit
    assert body["deals"][0]["ticket"] == deals["old_in"].ticket
    assert body["account"]["currency"] == "USD" and body["account"]["balance"] == 10000.0
    assert body["missing"] == []


@pytest.mark.feature("ANA-07")
def test_abgeglichene_zeitraeume_und_24h_ueberlappung(client, broker, deals):
    now = deals["now"]
    calls = []
    original = broker.history_deals_get

    def history_deals_get(date_from=None, date_to=None, **kw):
        calls.append((date_from, date_to, kw.get("position")))
        return original(date_from, date_to, **kw)

    broker.history_deals_get = history_deals_get
    a = now - 30 * 86400
    client.get(DEALS_URL, params={"from": a})
    first = [c for c in calls if c[2] is None]
    assert first[0][0] == a
    calls.clear()

    client.get(DEALS_URL, params={"from": a})
    again = [c for c in calls if c[2] is None]
    # Nur der jüngste Rand (≥ 24 h + Abstandspuffer) wird neu abgeglichen
    assert len(again) == 1 and again[0][0] >= int(time.time()) - market_sync.DEAL_SETTLE_SEC - 5
    calls.clear()

    # Ein älterer Zeitraum ist nicht abgeglichen, nur weil „diese Woche“ es ist
    client.get(DEALS_URL, params={"from": now - 60 * 86400, "to": a})
    assert [c[:2] for c in calls if c[2] is None] == [(now - 60 * 86400, a - 1)]


@pytest.mark.feature("ANA-07")
def test_einstieg_vor_dem_zeitraum_wird_nachgeladen(client, broker, deals):
    now = deals["now"]
    body = client.get(DEALS_URL, params={"from": now - 5 * 86400}).json()
    tickets = [d["ticket"] for d in body["deals"]]
    assert deals["old_in"].ticket in tickets


@pytest.mark.feature("ANA-07")
def test_deals_bei_belegtem_konto_nur_aus_dem_archiv(client, broker, deals, monkeypatch):
    import src.api.market as market

    monkeypatch.setattr(market, "is_account_busy", lambda _id: True)
    body = client.get(DEALS_URL).json()
    assert body["deals"] == [] and body["missing"][0]["reason"] == "busy"


@pytest.mark.feature("ANA-07")
def test_zonen_register_beim_speichern(client, broker):
    url = f"/api/settings/{TEST_ACCOUNT_ID}"
    z1 = make_zone(id="z-1", symbol=SYMBOL)
    z2 = make_zone(id="z-2", symbol="EURUSD")
    assert client.post(url, json={"settings": {"ZONES": [z1, z2]}}).status_code == 200
    reg = market_db.zone_registry(TEST_ACCOUNT_ID)
    assert [(r["magic"], r["symbol"], r["deleted_at"]) for r in reg] == [(200001, SYMBOL, None), (200002, "EURUSD", None)]

    symbols = client.get(url).json()["settings"]["SYMBOLS"]
    assert [s["symbol"] for s in symbols] == [SYMBOL, "EURUSD"]
    symbols[1]["setups"][0]["take_profit"] = 123
    client.post(url, json={"settings": {"SYMBOLS": [symbols[1]]}})  # Zone 1 gelöscht, Zone 2 geändert
    reg = {r["magic"]: r for r in market_db.zone_registry(TEST_ACCOUNT_ID)}
    assert reg[200001]["deleted_at"] is not None and reg[200002]["deleted_at"] is None
    versions = market_db.zone_versions(TEST_ACCOUNT_ID, 200002)
    assert [v["version"] for v in versions] == [1, 2] and versions[-1]["config"]["take_profit"] == 123

    body = client.get(DEALS_URL, params={"from": 0, "to": 1}).json()
    assert [z["magic"] for z in body["zones"]] == [200001, 200002]


@pytest.mark.feature("ANA-07")
def test_konto_loeschen_loescht_das_deal_archiv(client, broker, deals):
    client.get(DEALS_URL)
    assert client.delete(f"/api/accounts/{TEST_ACCOUNT_ID}").status_code == 200
    with market_db.reading() as conn:
        assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM deal_coverage").fetchone()[0] == 0
