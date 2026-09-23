"""ENG-13 Fernsteuerung per MT5-Handy-App (1 $/2 $-Signal oder Kommentar GRID:STOP/START)."""
import json

import pytest

from src.core.grid_remote import check_remote_commands
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone

ZONES = [make_zone(), make_zone(id="z2")]


@pytest.mark.feature("ENG-13")
def test_stop_signal_1_dollar_stoppt_und_raeumt(fake_mt5, ui_state_file):
    m = fake_mt5
    robot = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, magic=MAGIC_ZONE_1)
    manual = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 95.0, magic=0)
    signal = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 1.0, volume=0.01, magic=0)

    found, paused, reset = check_remote_commands(m, False, ZONES)

    assert (found, paused, reset) == (True, True, False)
    assert robot not in m.orders and signal not in m.orders
    assert manual in m.orders  # normale manuelle Orders bleiben
    assert json.loads(ui_state_file.read_text()) == {"0": "PAUSE", "1": "PAUSE"}


@pytest.mark.feature("ENG-13")
def test_start_signal_2_dollar_nimmt_wieder_auf(fake_mt5, ui_state_file):
    m = fake_mt5
    signal = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 2.0, volume=0.01, magic=0)
    found, paused, reset = check_remote_commands(m, True, ZONES)
    assert (found, paused, reset) == (True, False, True)
    assert signal not in m.orders
    assert json.loads(ui_state_file.read_text()) == {"0": "START", "1": "START"}


@pytest.mark.feature("ENG-13")
def test_kommentar_befehl_grid_stop(fake_mt5):
    m = fake_mt5
    m.add_order("USOUSD", m.ORDER_TYPE_SELL_LIMIT, 150.0, volume=0.05, magic=0, comment=" grid:stop ")
    found, paused, _ = check_remote_commands(m, False, ZONES)
    assert (found, paused) == (True, True)


@pytest.mark.feature("ENG-13")
def test_robot_orders_und_falsches_volumen_sind_keine_signale(fake_mt5):
    m = fake_mt5
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 1.0, volume=0.01, magic=MAGIC_ZONE_1)  # Robot-Magic
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 1.0, volume=0.02, magic=0)  # falsches Volumen
    assert check_remote_commands(m, False, ZONES) == (False, False, False)
    assert len(m.orders) == 2


@pytest.mark.feature("ENG-13")
def test_pausierter_motor_setzt_keine_orders(fake_mt5):
    engine = EngineHarness(fake_mt5, [make_zone()])
    engine.remote_paused = True
    engine.tick()
    assert fake_mt5.robot_orders() == []
