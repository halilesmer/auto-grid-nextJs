"""MET-03 WS-Metriken (Fallback) · MET-04 Bot-Telemetrie · LOG-05 Robot-Log
ACC-08 LIVE/DEMO-Sicherheitsprüfung · SET-04 Werte bereinigen."""
import json
import os
import time

import pytest

from src.core.grid_metrics import calculate_live_metrics
from src.utils.config import sanitize_settings
from src.utils.mt5_errors import verify_account_environment
from src.utils.trade_utils import TradeState
from tests.fakes.fake_mt5 import AccountInfo
from tests.helpers import MAGIC_ZONE_1


# --------------------------------------------------------------------------- MET-04
@pytest.mark.feature("MET-04")
def test_telemetrie_zaehlt_nur_robot_orders_und_positionen(fake_mt5):
    m = fake_mt5
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.9, magic=MAGIC_ZONE_1, profit=-1.25)
    m.add_position("USOUSD", m.POSITION_TYPE_SELL, 97.2, magic=200002, profit=0.5)
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 95.0, magic=0, profit=-99)  # manuell
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.8, magic=MAGIC_ZONE_1)
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 94.0, magic=0)

    metrics = calculate_live_metrics(m, {"USOUSD"}, connection_lost=False, remote_paused=True)

    assert metrics["open_positions"] == 2
    assert metrics["profit"] == -0.75
    assert metrics["pending_orders"] == 1
    assert metrics["current_price"] == 97.0
    assert metrics["symbol_prices"] == {"USOUSD": 97.0}
    assert metrics["mt5_connected"] and metrics["market_open"] and metrics["remote_paused"]
    assert metrics["algo_trading_error"] is False and metrics["order_rejected_alarm"] is False


@pytest.mark.feature("MET-04")
def test_alarme_in_der_telemetrie(fake_mt5):
    fake_mt5.terminal.trade_allowed = False
    TradeState.last_error_message = "Reddedildi: 10006"
    metrics = calculate_live_metrics(fake_mt5, {"USOUSD"}, connection_lost=True, remote_paused=False)
    assert metrics["algo_trading_error"] is True
    assert metrics["order_rejected_alarm"] is True and metrics["last_error"] == "Reddedildi: 10006"
    assert metrics["connection_lost"] is True


@pytest.mark.feature("MET-04")
def test_zonen_zustaende_der_engine_werden_exportiert(fake_mt5):
    metrics = calculate_live_metrics(fake_mt5, {"USOUSD"}, False, False, {0: "AUTO_CLEAR", 2: "START"})
    assert metrics["zone_states"] == {"0": "AUTO_CLEAR", "2": "START"}
    assert calculate_live_metrics(fake_mt5, {"USOUSD"}, False, False)["zone_states"] == {}


@pytest.mark.feature("MET-04")
def test_ohne_terminal_nicht_verbunden(fake_mt5):
    fake_mt5.terminal.connected = False
    metrics = calculate_live_metrics(fake_mt5, {"USOUSD"}, False, False)
    assert (metrics["mt5_connected"], metrics["market_open"]) == (False, False)
    assert calculate_live_metrics(None, set(), False, False)["mt5_connected"] is False


# --------------------------------------------------------------------------- MET-03
@pytest.mark.feature("MET-03")
def test_ws_fallback_liest_frische_bot_metriken(monkeypatch, tmp_path):
    import src.api.ws_server as ws

    path = tmp_path / "met.json"
    path.write_text(json.dumps({"current_price": 97.199, "profit": -25.68, "open_positions": 14,
                                "pending_orders": 5, "market_open": True, "mt5_connected": True}))
    monkeypatch.setattr(ws, "get_metrics_path", lambda acc: str(path))
    monkeypatch.setattr(ws, "is_bot_running", lambda acc: True)

    payload = ws.read_bot_metrics("1001", "USOUSD")
    assert payload["symbol"] == "USOUSD" and payload["price"] == 97.199
    assert payload["open_positions"] == 14 and "rsi" not in payload

    monkeypatch.setattr(ws, "is_bot_running", lambda acc: False)
    assert ws.read_bot_metrics("1001") is None
    monkeypatch.setattr(ws, "is_bot_running", lambda acc: True)
    old = time.time() - 120
    os.utime(path, (old, old))
    assert ws.read_bot_metrics("1001") is None


# --------------------------------------------------------------------------- LOG-05
@pytest.mark.feature("LOG-05")
def test_log_message_schreibt_jede_zeile_genau_einmal(robot_log, capsys):
    from src.core.grid_helpers import log_message

    for i in range(20):
        log_message(f"Meldung {i}")
    lines = [line for line in robot_log() if "Meldung" in line]
    assert len(lines) == 20 and len(set(lines)) == 20
    assert capsys.readouterr().out == ""  # kein zweiter Weg über stdout (Bot-Prozess: stdout = Log-Datei)


# --------------------------------------------------------------------------- ACC-08
@pytest.mark.feature("ACC-08")
@pytest.mark.parametrize(
    "env_type, mt5_mode, ok",
    [
        ("LIVE", "DEMO", False),
        ("DEMO", "REAL", False),
        ("TEST", "REAL", False),
        ("DEMO", "DEMO", True),
        ("LIVE", "REAL", True),
    ],
)
def test_live_demo_sicherheitspruefung(fake_mt5, env_type, mt5_mode, ok):
    mode = fake_mt5.ACCOUNT_TRADE_MODE_DEMO if mt5_mode == "DEMO" else fake_mt5.ACCOUNT_TRADE_MODE_REAL
    valid, msg = verify_account_environment({"env_type": env_type}, AccountInfo(trade_mode=mode), fake_mt5)
    assert valid is ok
    assert (msg is None) is ok


# --------------------------------------------------------------------------- SET-04
@pytest.mark.feature("SET-04")
def test_fliesskomma_rauschen_wird_gerundet():
    raw = {
        "LOOP_INTERVAL_SECONDS": 1.00000001,
        "ZONES": [{"lot_size": 0.0100000001, "grid_step": 0.30000000000000004, "take_profit": 0.105,
                   "symbol": "USOUSD", "levels_below": 5}],
    }
    clean = sanitize_settings(raw)
    assert clean["LOOP_INTERVAL_SECONDS"] == 1.0
    zone = clean["ZONES"][0]
    assert (zone["lot_size"], zone["grid_step"], zone["take_profit"]) == (0.01, 0.3, 0.105)
    assert zone["symbol"] == "USOUSD" and zone["levels_below"] == 5
