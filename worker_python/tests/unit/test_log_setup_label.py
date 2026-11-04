"""LOG-07: Worker-Logzeilen nennen das Setup ("<SYMBOL> · Setup n"), nicht die Listenposition."""
import pytest

from src.core import grid_zone_selector
from src.core.grid_helpers import zone_label
from src.core.state import state
from tests.helpers import make_zone


def _zones():
    return [
        make_zone(id="a", symbol="XAUUSD"),
        make_zone(id="b", symbol="EURUSD"),
        make_zone(id="c", symbol="XAUUSD"),
    ]


@pytest.mark.feature("LOG-07")
def test_zone_label_zaehlt_setups_innerhalb_des_symbols(monkeypatch):
    monkeypatch.setattr(state, "zones", _zones())
    assert zone_label(0) == "XAUUSD · Setup 1"
    assert zone_label(1) == "EURUSD · Setup 1"
    assert zone_label(2) == "XAUUSD · Setup 2"


@pytest.mark.feature("LOG-07")
def test_zoneneintritt_loggt_setup_label_statt_listenposition(monkeypatch):
    zones = _zones()
    monkeypatch.setattr(state, "zones", zones)
    lines = []
    monkeypatch.setattr(grid_zone_selector, "log_message", lambda msg, *a, **k: lines.append(msg))
    monkeypatch.setattr(grid_zone_selector, "zone_contains_price", lambda mt5, zone: True)

    assert grid_zone_selector.detect_zone_entry(None, zones[2], 2, False) is True

    assert len(lines) == 1
    assert "XAUUSD · Setup 2" in lines[0]
    assert "Bölge 3" not in lines[0] and "Bölge 1" not in lines[0]
