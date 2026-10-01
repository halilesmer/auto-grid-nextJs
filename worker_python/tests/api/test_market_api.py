"""ANA-13 GET /market/{id}/time-check: Brokerzeit ↔ VPS-UTC, letzte M1-Kerzen, letzter Deal,
Kontomodell und Symbolart – nur lesend, nur Admin, ohne erneuten MT5-Login.

MT5 ist FakeMT5; die Verbindung selbst ist ersetzt (sie ist in test_mt5_connect.py getestet).
Zeiten sind wie bei MT5 „Brokerzeit“: Sekunden, um den Broker-Abstand gegenüber UTC verschoben.
"""
import json
import secrets
import threading
import time

import pytest

import src.utils.mt5_connection as mc
import src.utils.mt5_market as mm
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5

SYMBOL = "XAUUSD"
OFFSET = 3 * 3600  # Broker = UTC+3 (Sommerzeit vieler Broker)
URL = f"/api/market/{TEST_ACCOUNT_ID}/time-check"


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    """Fake-Terminal im Testkonto; Tick 20 s alt, drei M1-Kerzen, Deals inkl. Einzahlung."""
    seed_accounts(account())
    fake = FakeMT5()
    fake.account.login = int(TEST_ACCOUNT_ID)
    fake.add_symbol(SYMBOL, 2650.0, digits=2, point=0.01, trade_calc_mode=2, swap_rollover3days=5)
    now_broker = int(time.time()) + OFFSET
    fake.ticks[SYMBOL].time = now_broker - 20
    fake.ticks[SYMBOL].time_msc = (now_broker - 20) * 1000
    minute = now_broker // 60 * 60
    fake.set_rates(
        SYMBOL,
        fake.TIMEFRAME_M1,
        [{"time": minute - 60 * i, "open": 1, "high": 2, "low": 0.5, "close": 1.5} for i in range(5, -1, -1)],
    )
    entry = fake.add_deal(SYMBOL, 0, 0, now_broker - 3600, volume=0.1, price=2640.0, magic=200001)
    fake.add_deal(SYMBOL, 1, 1, now_broker - 600, volume=0.1, price=2650.0, profit=10.0,
                  commission=-0.7, magic=200001, position_id=entry.ticket)
    fake.add_deal("", 2, 0, now_broker - 60, profit=500.0)  # Einzahlung (BALANCE) ist kein Trade

    calls = []

    def fake_connect(account_config, timeout=60, allow_restart=True, data_query=False):
        calls.append({"timeout": timeout, "allow_restart": allow_restart, "data_query": data_query})
        return True, False, None

    monkeypatch.setattr(mc, "mt5", fake, raising=False)
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)
    fake.connect_calls = calls
    return fake


@pytest.mark.feature("ANA-13")
def test_zeitcheck_liefert_brokerzeit_kerzen_deal_und_modell(client, broker):
    res = client.get(URL, params={"symbol": SYMBOL})
    assert res.status_code == 200, res.text
    body = res.json()

    # Verbunden nur lesend: kurz, ohne Terminal-Neustart, ohne erneuten Login
    assert broker.connect_calls == [{"timeout": 15, "allow_restart": False, "data_query": True}]

    assert body["broker_offset"]["offset_sec"] == OFFSET
    assert body["broker_offset"]["offset_hours"] == 3
    assert body["broker_offset"]["reliable"] is True
    assert body["tick"]["time"] == broker.ticks[SYMBOL].time

    times = [b["time"] for b in body["rates_m1"]]
    assert len(times) == 3 and times == sorted(times)
    assert times[-1] == broker.rates[(SYMBOL, broker.TIMEFRAME_M1)][-1]["time"]

    deal = body["last_deal"]
    assert deal["type"] == 1 and deal["entry"] == 1 and deal["profit"] == 10.0
    assert deal["time_msc_matches_time"] is True
    assert body["deals_in_lookback"] == 3
    assert body["deals_lookback_days"] == 7
    assert body["errors"] == []

    assert body["account"]["margin_mode_name"] == "hedging"
    assert body["symbol_info"]["trade_calc_mode_name"] == "cfd"
    assert body["symbol_info"]["swap_rollover3days_name"] == "friday"
    assert body["backtest_support"] == {"account_hedging": True, "calc_mode_supported": True}


@pytest.mark.feature("ANA-13")
def test_alter_tick_am_wochenende_ist_kein_verlaesslicher_abstand(client, broker):
    broker.ticks[SYMBOL].time -= 2 * 86400 + 7 * 60  # letzter Tick Freitagabend

    body = client.get(URL, params={"symbol": SYMBOL}).json()

    assert body["broker_offset"]["reliable"] is False


@pytest.mark.feature("ANA-13")
def test_abstand_aus_dem_frischesten_tick_der_marktuebersicht(client, broker):
    """Gold ruht (Wochenende), BTCUSD handelt rund um die Uhr: der Abstand kommt von BTCUSD."""
    broker.ticks[SYMBOL].time -= 2 * 86400 + 7 * 60
    broker.add_symbol("BTCUSD", 64000.0)
    broker.ticks["BTCUSD"].time = int(time.time()) + OFFSET - 2
    broker.add_symbol("HIDDEN", 1.0, visible=False)
    broker.ticks["HIDDEN"].time = int(time.time()) + OFFSET + 999  # nicht in der Marktübersicht

    offset = client.get(URL, params={"symbol": SYMBOL}).json()["broker_offset"]

    assert offset["source_symbol"] == "BTCUSD"
    assert offset["offset_sec"] == OFFSET and offset["reliable"] is True


@pytest.mark.feature("ANA-13")
def test_frischer_tick_der_zone_ohne_suche_in_der_marktuebersicht(client, broker, monkeypatch):
    """symbols_get() liefert alle Symbole des Servers: bei offenem Markt wird nicht gesucht."""
    monkeypatch.setattr(broker, "symbols_get", lambda: pytest.fail("Marktübersicht durchsucht"))

    offset = client.get(URL, params={"symbol": SYMBOL}).json()["broker_offset"]

    assert offset["source_symbol"] == SYMBOL and offset["reliable"] is True


@pytest.mark.feature("ANA-13")
def test_kerzen_als_numpy_array_wie_im_echten_paket(client, broker, monkeypatch):
    np = pytest.importorskip("numpy")
    dtype = [("time", "<i8"), ("open", "<f8"), ("high", "<f8"), ("low", "<f8"), ("close", "<f8"),
             ("tick_volume", "<u8"), ("spread", "<i4"), ("real_volume", "<u8")]
    bars = np.array([(1_700_000_000 + 60 * i, 1.0, 2.0, 0.5, 1.5, 7, 3, 0) for i in range(5)], dtype=dtype)
    monkeypatch.setattr(broker, "copy_rates_range", lambda *a: bars)

    body = client.get(URL, params={"symbol": SYMBOL}).json()

    assert body["rates_m1"][-1] == {"time": 1_700_000_240, "open": 1.0, "high": 2.0, "low": 0.5,
                                    "close": 1.5, "tick_volume": 7, "spread": 3}


@pytest.mark.feature("ANA-13")
def test_mt5_fehler_bei_abfragen_werden_gemeldet(client, broker, monkeypatch):
    """None von MT5 ist ein Fehler, kein leeres Konto: der Grund steht in errors."""
    monkeypatch.setattr(broker, "copy_rates_range", lambda *a: None)
    monkeypatch.setattr(broker, "history_deals_get", lambda *a, **k: None)
    broker._last_error = (-10004, "No IPC connection")

    body = client.get(URL, params={"symbol": SYMBOL}).json()

    assert body["rates_m1"] == [] and body["last_deal"] is None
    assert len(body["errors"]) == 2 and all("-10004" in e for e in body["errors"])


@pytest.mark.feature("ANA-13")
def test_leeres_ergebnis_ohne_mt5_fehler_ist_kein_fehler(client, broker, monkeypatch):
    monkeypatch.setattr(broker, "copy_rates_range", lambda *a: None)  # Feiertag: keine Kerzen
    monkeypatch.setattr(broker, "history_deals_get", lambda *a, **k: None)

    body = client.get(URL, params={"symbol": SYMBOL}).json()

    assert body["errors"] == []
    assert body["rates_m1"] == [] and body["last_deal"] is None
    assert body["deals_lookback_days"] == 90


@pytest.mark.feature("ANA-13")
def test_aelterer_letzter_trade_wird_im_langen_fenster_gefunden(client, broker):
    broker.deals = [d for d in broker.deals if d.type == 2]  # nur die Einzahlung ist jung
    broker.add_deal(SYMBOL, 0, 0, int(time.time()) + OFFSET - 30 * 86400, volume=0.1, price=2500.0)

    body = client.get(URL, params={"symbol": SYMBOL}).json()

    assert body["deals_lookback_days"] == 90
    assert body["last_deal"]["price"] == 2500.0


@pytest.mark.feature("ANA-13")
@pytest.mark.parametrize(
    "margin_mode, calc_mode, expected",
    [
        (0, 0, {"account_hedging": False, "calc_mode_supported": True}),  # Netting-Konto
        (2, 32, {"account_hedging": True, "calc_mode_supported": False}),  # Börsenaktie
    ],
)
def test_backtest_unterstuetzung_wird_gemeldet(client, broker, margin_mode, calc_mode, expected):
    broker.account.margin_mode = margin_mode
    broker.symbols[SYMBOL].trade_calc_mode = calc_mode

    body = client.get(URL, params={"symbol": SYMBOL}).json()

    assert body["backtest_support"] == expected


@pytest.mark.feature("ANA-13")
def test_ohne_symbol_gilt_das_symbol_der_ersten_zone(client, broker, worker_dir):
    (worker_dir / "configs" / f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json").write_text(
        json.dumps({"ZONES": [{"id": "z1", "symbol": SYMBOL}]}), encoding="utf-8"
    )

    res = client.get(URL)

    assert res.status_code == 200, res.text
    assert res.json()["symbol"] == SYMBOL


@pytest.mark.feature("ANA-13")
def test_ohne_symbol_und_ohne_zone_400(client, broker):
    res = client.get(URL)
    assert res.status_code == 400
    assert broker.connect_calls == []


@pytest.mark.feature("ANA-13")
def test_unbekanntes_symbol_404(client, broker):
    assert client.get(URL, params={"symbol": "NOPE"}).status_code == 404


@pytest.mark.feature("ANA-13")
def test_terminal_in_anderem_konto_wird_nicht_abgefragt(client, broker):
    broker.account.login = 4242

    res = client.get(URL, params={"symbol": SYMBOL})

    assert res.status_code == 503
    assert "[ACCOUNT]" in res.json()["detail"]


@pytest.mark.feature("ANA-13")
def test_verbindungsfehler_503_mit_grund(client, broker, monkeypatch):
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", lambda *a, **k: (False, True, "[TIMEOUT] test"))

    res = client.get(URL, params={"symbol": SYMBOL})

    assert res.status_code == 503
    assert res.json()["detail"] == "[TIMEOUT] test"


@pytest.mark.feature("ANA-13")
def test_belegtes_konto_409_ohne_verbindung(client, broker, monkeypatch):
    import src.api.market as market

    monkeypatch.setattr(market, "is_account_busy", lambda account_id: True)

    assert client.get(URL, params={"symbol": SYMBOL}).status_code == 409
    assert broker.connect_calls == []


@pytest.mark.feature("ANA-13")
def test_wartet_nicht_endlos_auf_die_mt5_sperre(client, broker, monkeypatch):
    """Hält ein anderer Thread die MT5-Sperre, antwortet der Check nach seiner Frist mit 503."""
    monkeypatch.setattr(mm, "CONNECT_TIMEOUT_SEC", 0.2)
    holding, release = threading.Event(), threading.Event()

    def hold_lock():
        with mc._MT5_LOCK:
            holding.set()
            release.wait(5)

    t = threading.Thread(target=hold_lock)
    t.start()
    try:
        holding.wait(2)
        res = client.get(URL, params={"symbol": SYMBOL})
    finally:
        release.set()
        t.join()

    assert res.status_code == 503
    assert res.json()["detail"].startswith("[TIMEOUT]")
    assert broker.connect_calls == []


@pytest.mark.feature("ANA-13")
def test_nur_admin_und_nur_vorhandene_konten(client, broker, seed_accounts, monkeypatch):
    import src.api.auth as auth
    from src.api import users_store

    admin_key = secrets.token_urlsafe(24)  # zur Laufzeit erzeugt (Secret-Scan der Hooks)
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin_key)
    owner, owner_key = users_store.create_user("Anna")
    seed_accounts(account(owner=owner["id"]))

    # Auch die Besitzerin des Kontos bekommt den Check nicht (Admin-Werkzeug)
    assert client.get(URL, params={"symbol": SYMBOL}, headers={"X-API-Key": owner_key}).status_code == 403
    assert client.get(URL, params={"symbol": SYMBOL}).status_code == 401
    assert client.get("/api/market/9999/time-check", params={"symbol": SYMBOL},
                      headers={"X-API-Key": admin_key}).status_code == 404
    assert client.get(URL, params={"symbol": SYMBOL}, headers={"X-API-Key": admin_key}).status_code == 200
    assert len(broker.connect_calls) == 1
