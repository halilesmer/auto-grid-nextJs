"""MET-03 WebSocket-Stream: sendet jede Sekunde, auch wenn einzelne Schritte scheitern.

Auf dem VPS verband sich /ws/stream, sendete aber nichts: jede Ausnahme in der Schleife wurde nur
per print gemeldet (Konsole sieht niemand) und übersprang das Senden. Jetzt wird zuerst gesendet,
Nebenschritte sind abgesichert, eine hängende MT5-Abfrage blockiert nicht und Fehler landen im
Robot-Log.

ACC-10: Jede Verbindung bekommt die Metriken des im Browser gewählten Kontos (?account_id=).
Die MT5-Abfrage des API-Prozesses zählt nur für das Konto, dessen Terminal dort angemeldet ist;
andere Konten bekommen die Metrikdatei ihres Bot-Prozesses.
"""
import asyncio
import contextlib
import json
import threading
import time

import pandas as pd
import pytest
from starlette.websockets import WebSocketDisconnect

from src.utils.paths import get_err_log_path
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone


@pytest.fixture
def stream(worker_dir, seed_accounts, monkeypatch):
    import src.api.ws_server as ws

    seed_accounts(account())
    (worker_dir / "configs" / f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json").write_text(
        json.dumps({"ZONES": [make_zone()]}), encoding="utf-8"
    )
    monkeypatch.setattr(ws, "_fetch_task", None)
    monkeypatch.setattr(ws, "_last_stream_error", {"msg": None, "at": 0.0})
    monkeypatch.setattr(ws.manager, "active_connections", {})
    sent = []

    async def capture(receivers, message):
        sent.append(json.loads(message))  # json.loads lehnt nichts ab; NaN prüft allow_nan unten

    monkeypatch.setattr(ws.manager, "send_to", capture)
    return ws, sent, worker_dir


class FakeSocket:
    """Offene WS-Verbindung: sammelt, was der Stream an sie sendet."""

    def __init__(self):
        self.received = []

    async def send_text(self, message):
        self.received.append(json.loads(message))


def mt5_data(closes, login=int(TEST_ACCOUNT_ID), symbol="USOUSD"):
    return {
        "login": login,
        "symbol": symbol,
        "df": pd.DataFrame({"close": closes}),
        "price": float(closes[-1]),
        "profit": 1.5,
        "open_positions": 2,
        "pending_orders": 3,
        "market_open": True,
        "mt5_connected": True,
    }


RISING = [95.0 + (i % 7) * 0.3 + i * 0.01 for i in range(60)]


def attached(login=int(TEST_ACCOUNT_ID), closes=RISING):
    """fetch_mt5_data-Ersatz: das Terminal des API-Prozesses ist an `login` angemeldet."""
    def fetch(symbols_by_login):
        symbol = symbols_by_login.get(login)
        return mt5_data(closes, login, symbol) if symbol else None
    return fetch


def run_until_sent(ws, sent, count=1, before_exit=None):
    async def scenario():
        task = asyncio.create_task(ws.real_bot_data_stream())
        for _ in range(100):  # max. 5 s
            await asyncio.sleep(0.05)
            if len(sent) >= count:
                break
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        if before_exit:
            before_exit()

    asyncio.run(scenario())


def robot_log() -> str:
    try:
        with open(get_err_log_path(TEST_ACCOUNT_ID), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


@pytest.mark.feature("MET-03")
@pytest.mark.feature("ACC-10")
def test_sendet_metriken_mit_symbol_und_rsi(stream, monkeypatch):
    ws, sent, worker_dir = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", attached())
    run_until_sent(ws, sent)

    msg = sent[0]
    assert msg["type"] == "METRICS"
    assert msg["payload"]["symbol"] == "USOUSD"
    assert msg["payload"]["account_id"] == TEST_ACCOUNT_ID  # ACC-10: Frontend filtert danach
    assert msg["payload"]["price"] == RISING[-1]
    assert isinstance(msg["payload"]["rsi"], float)
    json.dumps(msg, allow_nan=False)
    assert (worker_dir / "logs" / f"met_{TEST_ACCOUNT_ID}.json").exists()


@pytest.mark.feature("MET-03")
def test_nicht_schreibbare_metrikdatei_stoppt_den_stream_nicht(stream, monkeypatch):
    ws, sent, _ = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", attached())

    def denied(*args):
        raise PermissionError("[Errno 13] Permission denied: 'logs/met_1001.json'")

    monkeypatch.setattr(ws, "write_stream_metrics", denied)
    run_until_sent(ws, sent, count=2)

    assert [m["type"] for m in sent[:2]] == ["METRICS", "METRICS"]
    assert "[WS Stream] PermissionError" in robot_log()
    assert robot_log().count("[WS Stream]") == 1  # gleiche Meldung höchstens einmal pro Minute


@pytest.mark.feature("MET-03")
def test_haengende_mt5_abfrage_faellt_auf_bot_metriken_zurueck(stream, monkeypatch):
    ws, sent, _ = stream
    release = threading.Event()

    def hanging(symbols_by_login):
        release.wait(10)
        return None

    monkeypatch.setattr(ws, "fetch_mt5_data", hanging)
    monkeypatch.setattr(ws, "MT5_FETCH_TIMEOUT_SEC", 0.1)
    monkeypatch.setattr(ws, "read_bot_metrics", lambda acc, symbol: {"symbol": symbol, "price": 97.1})
    run_until_sent(ws, sent, count=2, before_exit=release.set)

    assert [m["type"] for m in sent[:2]] == ["METRICS", "METRICS"]
    assert sent[0]["payload"]["price"] == 97.1


@pytest.mark.feature("MET-03")
def test_indikatorfehler_sendet_preis_ohne_rsi(stream, monkeypatch):
    ws, sent, _ = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", attached())

    def broken(df):
        raise AttributeError("'DataFrame' object has no attribute 'ta'")

    monkeypatch.setattr(ws, "get_latest_indicators", broken)
    run_until_sent(ws, sent)

    assert sent[0]["type"] == "METRICS"
    assert sent[0]["payload"]["rsi"] is None and sent[0]["payload"]["price"] == RISING[-1]
    assert "[WS Stream] AttributeError" in robot_log()


@pytest.mark.feature("MET-03")
def test_nan_rsi_wird_null(stream, monkeypatch):
    ws, sent, _ = stream
    # z. B. pandas_ta bei zu wenig Kerzen: json.dumps würde 'NaN' schreiben, das JSON.parse ablehnt
    monkeypatch.setattr(ws, "fetch_mt5_data", attached())
    monkeypatch.setattr(ws, "get_latest_indicators", lambda df: {"rsi": float("nan"), "macd": float("inf")})
    run_until_sent(ws, sent)

    assert sent[0]["payload"]["rsi"] is None and sent[0]["payload"]["macd"] is None
    json.dumps(sent[0], allow_nan=False)


@pytest.mark.feature("MET-03")
def test_ohne_mt5_und_ohne_bot_meldet_live_data(stream, monkeypatch):
    ws, sent, _ = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", lambda symbols_by_login: None)
    monkeypatch.setattr(ws, "read_bot_metrics", lambda acc, symbol: None)
    run_until_sent(ws, sent)
    assert sent[0] == {
        "type": "LIVE_DATA",
        "payload": {"account_id": TEST_ACCOUNT_ID, "mt5_connected": False, "market_open": False},
    }


SECOND_ID = "1002"


@pytest.fixture
def two_accounts(stream, seed_accounts, monkeypatch):
    """Zwei Konten; der API-Prozess ist am Terminal von 1001 angemeldet, 1002 hat einen laufenden Bot."""
    ws, _, worker_dir = stream
    seed_accounts(account(), account(SECOND_ID))
    (worker_dir / "configs" / f"settings_{SECOND_ID}_Auto_Grid.json").write_text(
        json.dumps({"ZONES": [make_zone(symbol="EURUSD")]}), encoding="utf-8"
    )
    fetched = []
    fetch_1001 = attached()

    def fetch(symbols_by_login):
        fetched.append(dict(symbols_by_login))
        return fetch_1001(symbols_by_login)

    monkeypatch.setattr(ws, "fetch_mt5_data", fetch)
    monkeypatch.setattr(
        ws, "read_bot_metrics",
        lambda acc, symbol: {"account_id": acc, "symbol": symbol, "price": 1.1} if acc == SECOND_ID else None,
    )
    # send_to wieder echt: jede Verbindung soll nur ihr Konto bekommen
    monkeypatch.setattr(ws.manager, "send_to", type(ws.manager).send_to.__get__(ws.manager))
    return ws, worker_dir, fetched


def run_until_received(ws, sockets):
    async def scenario():
        task = asyncio.create_task(ws.real_bot_data_stream())
        for _ in range(100):  # max. 5 s
            await asyncio.sleep(0.05)
            if all(s.received for s in sockets):
                break
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    asyncio.run(scenario())


@pytest.mark.feature("MET-03")
@pytest.mark.feature("ACC-10")
def test_jede_verbindung_bekommt_ihr_gewaehltes_konto(two_accounts):
    ws, worker_dir, fetched = two_accounts
    first, second, legacy = FakeSocket(), FakeSocket(), FakeSocket()
    ws.manager.active_connections.update({first: TEST_ACCOUNT_ID, second: SECOND_ID, legacy: None})
    run_until_received(ws, [first, second, legacy])

    # 1001: MT5 des API-Prozesses (mit RSI), Verbindung ohne account_id bekommt das erste Konto
    for sock in (first, legacy):
        payload = sock.received[0]["payload"]
        assert payload["account_id"] == TEST_ACCOUNT_ID and payload["symbol"] == "USOUSD"
        assert isinstance(payload["rsi"], float)
    # 1002: Metrikdatei des eigenen Bots, nie Werte von 1001
    assert second.received[0] == {
        "type": "METRICS",
        "payload": {"account_id": SECOND_ID, "symbol": "EURUSD", "price": 1.1},
    }
    assert all(m["payload"]["account_id"] == SECOND_ID for m in second.received)
    # eine MT5-Abfrage pro Runde für alle Konten; das erste nur einmal, obwohl zwei Verbindungen es wollen
    assert fetched[0] == {1001: "USOUSD", 1002: "EURUSD"}
    # Die Polling-Ersatzdatei entsteht nur aus echten MT5-Daten
    assert (worker_dir / "logs" / f"met_{TEST_ACCOUNT_ID}.json").exists()
    assert not (worker_dir / "logs" / f"met_{SECOND_ID}.json").exists()


@pytest.mark.feature("ACC-10")
def test_unbekanntes_konto_bekommt_nur_status(two_accounts):
    ws, _, fetched = two_accounts
    sock = FakeSocket()
    ws.manager.active_connections[sock] = "4242"
    run_until_received(ws, [sock])

    assert sock.received[0] == {
        "type": "LIVE_DATA",
        "payload": {"account_id": "4242", "mt5_connected": False, "market_open": False},
    }
    assert fetched == []  # unbekanntes Konto: kein Login → keine MT5-Abfrage


@pytest.mark.feature("ACC-10")
def test_mt5_abfrage_nur_fuer_das_angemeldete_konto(fake_mt5, monkeypatch):
    import src.api.ws_server as ws

    monkeypatch.setattr(ws, "mt5", fake_mt5, raising=False)
    monkeypatch.setattr(ws, "MT5_AVAILABLE", True)
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_M15, [{"time": 60 * i, "open": c, "high": c, "low": c, "close": c} for i, c in enumerate(RISING)])
    fake_mt5.account.login = int(TEST_ACCOUNT_ID)

    data = ws.fetch_mt5_data({int(SECOND_ID): "EURUSD", int(TEST_ACCOUNT_ID): "USOUSD"})
    assert (data["login"], data["symbol"]) == (int(TEST_ACCOUNT_ID), "USOUSD")
    assert data["price"] == 97.0  # laufende Kerze = aktueller Bid
    # Terminal ist an 1001 angemeldet → keine Daten, wenn nur 1002 gefragt ist
    assert ws.fetch_mt5_data({int(SECOND_ID): "USOUSD"}) is None
    assert ws.fetch_mt5_data({}) is None


@pytest.mark.feature("ACC-10")
def test_haengende_mt5_abfrage_verzoegert_andere_konten_nicht(two_accounts, monkeypatch):
    ws, _, _ = two_accounts
    release = threading.Event()
    calls = []

    def hanging(symbols_by_login):
        calls.append(symbols_by_login)
        release.wait(10)
        return None

    monkeypatch.setattr(ws, "fetch_mt5_data", hanging)
    monkeypatch.setattr(ws, "MT5_FETCH_TIMEOUT_SEC", 0.1)
    first, second = FakeSocket(), FakeSocket()
    ws.manager.active_connections.update({first: TEST_ACCOUNT_ID, second: SECOND_ID})

    async def scenario():
        task = asyncio.create_task(ws.real_bot_data_stream())
        for _ in range(100):
            await asyncio.sleep(0.05)
            if len(second.received) >= 2:
                break
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        release.set()

    asyncio.run(scenario())
    # 1002 bekommt jede Runde seine Bot-Metriken, obwohl die MT5-Abfrage hängt
    assert [m["payload"]["price"] for m in second.received[:2]] == [1.1, 1.1]
    assert len(calls) == 1  # kein zweiter Thread, solange die erste Abfrage hängt


@pytest.mark.feature("ACC-10")
def test_websocket_account_id_aus_query(worker_dir, monkeypatch):
    from fastapi.testclient import TestClient

    import main
    import src.api.ws_server as ws

    monkeypatch.delenv("WORKER_API_KEY", raising=False)
    monkeypatch.setattr(ws.manager, "active_connections", {})
    client = TestClient(main.app)

    def wait_for(expected):
        for _ in range(100):  # Server läuft im TestClient in einem eigenen Thread
            if ws.manager.requested_accounts() == expected:
                return True
            time.sleep(0.02)
        return False

    with client.websocket_connect("/ws/stream?account_id=1002"):
        with client.websocket_connect("/ws/stream"):
            assert wait_for({"1002", None})
    assert wait_for(set())

    # Ungültige Konto-ID wird abgelehnt statt umgedeutet ("12ab34" wäre sonst Konto 1234)
    for bad in ("12ab34", "..%2F1001", ""):
        with pytest.raises(WebSocketDisconnect) as closed:
            with client.websocket_connect(f"/ws/stream?account_id={bad}") as conn:
                conn.receive_text()
        assert closed.value.code == 1008
