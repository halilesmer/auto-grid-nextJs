"""ENG-25 Von außen gelöschte Orders erkennen + Order-Flut-Bremse (grid_execution/vanished.py).

Vorfall 29.09. (DEMO-Konto B): Pending Orders verschwanden 2–5 s nach dem Setzen, ohne dass der
Bot sie gelöscht hatte; der Bot setzte die Level endlos neu (~200 Orders/min).
"""
import json

import pytest

from tests.helpers import EngineHarness, make_zone


def _warnings(robot_log):
    return [line for line in robot_log() if "MT5'te kayboldu" in line]


@pytest.mark.feature("ENG-25")
def test_von_aussen_geloeschte_orders_werden_gemeldet_und_neu_gesetzt(fake_mt5, robot_log):
    m = fake_mt5
    engine = EngineHarness(m, [make_zone(order_type="BUY")])
    engine.tick()
    placed = m.robot_orders()
    assert len(placed) == 6

    m.remove_externally()
    engine.tick()

    warnings = _warnings(robot_log)
    assert len(warnings) == 1
    assert "6 bekleyen emir" in warnings[0]
    assert "CANCELED×6" in warnings[0]
    assert "[Z:zone-test]" in warnings[0]
    # unter der Schwelle: Zone läuft weiter, die Level werden wieder gesetzt
    assert engine.active_zones_state.get(0) != "PAUSE"
    assert len(m.robot_orders()) == 6


@pytest.mark.feature("ENG-25")
def test_order_flut_pausiert_die_zone(fake_mt5, ui_state_file, robot_log):
    from src.utils.trade_utils import TradeState

    m = fake_mt5
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, magic=200001)
    engine = EngineHarness(m, [make_zone(order_type="BOTH")])
    engine.tick()
    assert len(m.robot_orders()) == 12

    m.remove_externally()
    engine.tick()

    assert engine.active_zones_state[0] == "PAUSE"
    assert json.loads(ui_state_file.read_text()) == {"0": "PAUSE"}
    assert "Emir seli durduruldu" in TradeState.last_error_message
    assert any("Emir seli durduruldu" in line and "[ERROR]" in line for line in robot_log())
    # keine neuen Orders, Positionen bleiben unberührt
    assert m.robot_orders() == []
    assert len(m.robot_positions()) == 1

    sent_before = len(m.sent)
    engine.tick()
    assert len(m.sent) == sent_before


@pytest.mark.feature("ENG-25")
def test_eigene_loeschungen_und_fuellungen_zaehlen_nicht(fake_mt5, robot_log):
    m = fake_mt5
    engine = EngineHarness(m, [make_zone(order_type="BUY", take_profit=0.1)])
    engine.tick()

    # Füllung (96.9) und sofortiger TP-Schluss (97.0) innerhalb eines Ticks: Historie FILLED
    m.set_price("USOUSD", 96.85)
    m.set_price("USOUSD", 97.05)
    engine.tick()
    # Bot löscht selbst: Zone pausieren → Mutlak Temizlik
    engine.active_zones_state[0] = "PAUSE"
    engine.tick()
    engine.tick()

    assert m.robot_orders() == []
    assert _warnings(robot_log) == []


@pytest.mark.feature("ENG-25")
def test_alte_loeschungen_fallen_aus_dem_fenster(fake_mt5, robot_log):
    import time

    from src.core.state import state

    m = fake_mt5
    engine = EngineHarness(m, [make_zone(order_type="BUY")])
    engine.tick()
    # 9 Löschungen vor mehr als 60 s: zählen nicht mehr
    state.vanished_times[0] = [time.monotonic() - 120] * 9
    m.remove_externally(state=m.ORDER_STATE_EXPIRED)
    engine.tick()

    assert engine.active_zones_state.get(0) != "PAUSE"
    assert "EXPIRED×6" in _warnings(robot_log)[0]
