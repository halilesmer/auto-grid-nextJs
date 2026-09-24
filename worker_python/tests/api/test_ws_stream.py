"""MET-03 WebSocket-Stream: sendet jede Sekunde, auch wenn einzelne Schritte scheitern.

Auf dem VPS verband sich /ws/stream, sendete aber nichts: jede Ausnahme in der Schleife wurde nur
per print gemeldet (Konsole sieht niemand) und übersprang das Senden. Jetzt wird zuerst gesendet,
Nebenschritte sind abgesichert, eine hängende MT5-Abfrage blockiert nicht und Fehler landen im
Robot-Log.
"""
import asyncio
import contextlib
import json
import threading

import pandas as pd
import pytest

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
    sent = []

    async def capture(message):
        sent.append(json.loads(message))  # json.loads lehnt nichts ab; NaN prüft allow_nan unten

    monkeypatch.setattr(ws.manager, "broadcast", capture)
    return ws, sent, worker_dir


def mt5_data(closes):
    return {
        "df": pd.DataFrame({"close": closes}),
        "price": float(closes[-1]),
        "profit": 1.5,
        "open_positions": 2,
        "pending_orders": 3,
        "market_open": True,
        "mt5_connected": True,
    }


RISING = [95.0 + (i % 7) * 0.3 + i * 0.01 for i in range(60)]


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
def test_sendet_metriken_mit_symbol_und_rsi(stream, monkeypatch):
    ws, sent, worker_dir = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", lambda symbol: mt5_data(RISING))
    run_until_sent(ws, sent)

    msg = sent[0]
    assert msg["type"] == "METRICS"
    assert msg["payload"]["symbol"] == "USOUSD"
    assert msg["payload"]["price"] == RISING[-1]
    assert isinstance(msg["payload"]["rsi"], float)
    json.dumps(msg, allow_nan=False)
    assert (worker_dir / "logs" / f"met_{TEST_ACCOUNT_ID}.json").exists()


@pytest.mark.feature("MET-03")
def test_nicht_schreibbare_metrikdatei_stoppt_den_stream_nicht(stream, monkeypatch):
    ws, sent, _ = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", lambda symbol: mt5_data(RISING))

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

    def hanging(symbol):
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
    monkeypatch.setattr(ws, "fetch_mt5_data", lambda symbol: mt5_data(RISING))

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
    monkeypatch.setattr(ws, "fetch_mt5_data", lambda symbol: mt5_data(RISING))
    monkeypatch.setattr(ws, "get_latest_indicators", lambda df: {"rsi": float("nan"), "macd": float("inf")})
    run_until_sent(ws, sent)

    assert sent[0]["payload"]["rsi"] is None and sent[0]["payload"]["macd"] is None
    json.dumps(sent[0], allow_nan=False)


@pytest.mark.feature("MET-03")
def test_ohne_mt5_und_ohne_bot_meldet_live_data(stream, monkeypatch):
    ws, sent, _ = stream
    monkeypatch.setattr(ws, "fetch_mt5_data", lambda symbol: None)
    monkeypatch.setattr(ws, "read_bot_metrics", lambda acc, symbol: None)
    run_until_sent(ws, sent)
    assert sent[0] == {"type": "LIVE_DATA", "payload": {"mt5_connected": False, "market_open": False}}
