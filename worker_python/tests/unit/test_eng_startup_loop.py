"""ENG-14 Zustand beim Start · ENG-15 Markt geschlossen + Reconnect · ENG-16 Aufräumen am Loop-Ende."""
import json
import os

import pytest

import src.core.reconnection as reconnection
from src.core.grid_helpers import is_market_open
from src.core.loop import _cleanup
from src.core.startup import run_startup_checks
from src.core.state import state
from src.utils.paths import get_metrics_path, get_symbols_path
from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import MAGIC_ZONE_1


def _prepare_state(m, symbols=("USOUSD",)):
    state.active_symbols.update(symbols)
    state.symbol_infos.update({s: m.symbols[s] for s in symbols if s in m.symbols})


# --------------------------------------------------------------------------- ENG-14
@pytest.mark.feature("ENG-14")
def test_zonen_werden_aus_vorhandenen_orders_wiederhergestellt(fake_mt5, ui_state_file):
    m = fake_mt5
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.9, magic=MAGIC_ZONE_1)
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.5, magic=200003)
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 95.0, magic=0)  # manuell → keine Zone
    ui_state_file.write_text(json.dumps({"0": "CLEAR"}))  # alter Befehl aus der letzten Sitzung
    _prepare_state(m)

    assert run_startup_checks(m) is True
    assert state.active_zones_state == {0: "START", 2: "START"}
    assert not ui_state_file.exists()
    assert state.filling_mode["USOUSD"] == m.ORDER_FILLING_IOC  # filling_mode-Bit 2
    assert m.robot_orders() and m.robot_positions()  # nichts wurde gelöscht


@pytest.mark.feature("ENG-14")
def test_symbolliste_wird_fuer_das_frontend_gespeichert(fake_mt5):
    _prepare_state(fake_mt5)
    run_startup_checks(fake_mt5)
    with open(get_symbols_path(TEST_ACCOUNT_ID), encoding="utf-8") as f:
        data = json.load(f)
    assert data["USOUSD"]["digits"] == 3 and data["USOUSD"]["vol_min"] == 0.01


@pytest.mark.feature("ENG-14")
def test_unbekanntes_symbol_bricht_mit_hinweis_ab(fake_mt5):
    metrics = get_metrics_path(TEST_ACCOUNT_ID)
    with open(metrics, "w", encoding="utf-8") as f:
        json.dump({"mt5_connected": True}, f)
    _prepare_state(fake_mt5, symbols=("XAUUSD",))

    assert run_startup_checks(fake_mt5) is False
    assert fake_mt5.shutdown_called
    with open(metrics, encoding="utf-8") as f:
        assert "XAUUSD" in json.load(f)["startup_error"]


@pytest.mark.feature("ENG-14")
def test_ohne_terminalverbindung_kein_start(fake_mt5):
    fake_mt5.terminal.connected = False
    assert run_startup_checks(fake_mt5) is False
    assert fake_mt5.shutdown_called


# --------------------------------------------------------------------------- ENG-15
@pytest.mark.feature("ENG-15")
def test_markt_offen_nur_mit_handelsmodus_und_frischem_tick(fake_mt5):
    m = fake_mt5
    assert is_market_open(m, "USOUSD") is True
    m.set_tick_age("USOUSD", 181)
    assert is_market_open(m, "USOUSD") is False  # Tick älter als 180 s
    m.set_price("USOUSD", 97.0)
    m.symbols["USOUSD"].trade_mode = 3  # z. B. nur Schließen erlaubt
    assert is_market_open(m, "USOUSD") is False
    m.symbols["USOUSD"].trade_mode = 4
    m.terminal.connected = False
    assert is_market_open(m, "USOUSD") is False


@pytest.mark.feature("ENG-15")
def test_verbindung_gesund(fake_mt5):
    assert reconnection.check_connection_health(fake_mt5, 1001, "pw", "srv", 2) == (True, 0)


@pytest.mark.feature("ENG-15")
def test_nur_algo_trading_aus_wartet_ohne_neu_einzuloggen(fake_mt5, monkeypatch):
    calls = []
    monkeypatch.setattr(reconnection, "_reconnect_mt5", lambda *a, **k: calls.append(a) or True)
    fake_mt5.terminal.trade_allowed = False
    assert reconnection.check_connection_health(fake_mt5, 1001, "pw", "srv", 0) == (False, 0)
    assert calls == []


@pytest.mark.feature("ENG-15")
def test_verbindungsverlust_reconnect_und_erholung(fake_mt5, monkeypatch, robot_log):
    fake_mt5.terminal.connected = False
    monkeypatch.setattr(reconnection, "_reconnect_mt5", lambda *a, **k: False)
    assert reconnection.check_connection_health(fake_mt5, 1001, "pw", "srv", 0) == (False, 1)
    assert state.connection_lost is True

    monkeypatch.setattr(reconnection, "_reconnect_mt5", lambda *a, **k: True)
    assert reconnection.check_connection_health(fake_mt5, 1001, "pw", "srv", 1) == (True, 0)
    assert state.connection_lost is False
    assert any("BAĞLANTISI KOPTU" in line for line in robot_log())


@pytest.mark.feature("ENG-15")
def test_ohne_zugangsdaten_nur_warten(fake_mt5, monkeypatch):
    fake_mt5.terminal.connected = False
    monkeypatch.setattr(reconnection, "_reconnect_mt5", lambda *a, **k: pytest.fail("kein Login ohne Passwort"))
    assert reconnection.check_connection_health(fake_mt5, 0, "", "", 3) == (False, 4)


# --------------------------------------------------------------------------- ENG-16
@pytest.mark.feature("ENG-16")
def test_cleanup_loescht_nur_robot_orders_und_trennt(fake_mt5):
    m = fake_mt5
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, magic=MAGIC_ZONE_1)
    m.add_order("USOUSD", m.ORDER_TYPE_SELL_LIMIT, 97.1, magic=200002)
    manual = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 95.0, magic=0)
    pos = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, magic=MAGIC_ZONE_1)
    state.is_running = True

    _cleanup(m)

    assert m.robot_orders() == []
    assert manual in m.orders and pos in m.positions
    assert m.shutdown_called and state.is_running is False
