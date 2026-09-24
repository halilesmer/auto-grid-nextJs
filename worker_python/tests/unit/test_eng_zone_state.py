"""ZON-08 Zonenbefehle: fehlt eine Zone in der ui-state-Datei, gilt ihr eigenes is_active.

Früher wurde jede Zone ohne Eintrag auf CLEAR gesetzt. Die Datei entsteht aber schon, wenn nur
EINE Zone Start/Pause bekommt (UI, Auto-Pause nach 3 Ablehnungen, Zonen-Austritt) → alle anderen
Zonen verloren still ihre Orders und setzten keine neuen mehr.
"""
import json

import pytest

from src.core.grid_zone_state import process_zone_commands
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone

ZONE_A = make_zone(id="a", min_price=90.0, max_price=110.0)
ZONE_B = make_zone(id="b", min_price=200.0, max_price=210.0)


@pytest.mark.feature("ZON-08")
def test_zone_ohne_eintrag_bleibt_gestartet(ui_state_file):
    states = {0: "START", 1: "START"}
    ui_state_file.write_text(json.dumps({"1": "PAUSE"}))
    process_zone_commands([ZONE_A, ZONE_B], states)
    assert states == {0: "START", 1: "PAUSE"}


@pytest.mark.feature("ZON-08")
def test_ausgeschaltete_zone_ohne_eintrag_ist_pausiert(ui_state_file):
    states = {0: "START", 1: "START"}
    ui_state_file.write_text(json.dumps({"1": "START"}))
    process_zone_commands([{**ZONE_A, "is_active": False}, ZONE_B], states)
    assert states == {0: "PAUSE", 1: "START"}


@pytest.mark.feature("ZON-08")
def test_geloeschte_zone_wird_geraeumt(ui_state_file):
    states = {0: "START", 1: "START", 2: "START"}
    ui_state_file.write_text(json.dumps({"0": "START"}))
    process_zone_commands([ZONE_A, ZONE_B], states)
    assert states[2] == "CLEAR"


@pytest.mark.feature("ZON-08")
def test_pause_einer_anderen_zone_loescht_keine_orders(fake_mt5, ui_state_file):
    engine = EngineHarness(fake_mt5, [ZONE_A, ZONE_B])
    engine.tick()
    placed = [o.ticket for o in fake_mt5.robot_orders() if o.magic == MAGIC_ZONE_1]
    assert placed

    # Nutzer pausiert Zone 2 in der Oberfläche → Datei enthält nur {"1": "PAUSE"}
    ui_state_file.write_text(json.dumps({"1": "PAUSE"}))
    engine.tick()
    engine.tick()

    assert engine.active_zones_state[0] == "START"
    remaining = [o.ticket for o in fake_mt5.robot_orders() if o.magic == MAGIC_ZONE_1]
    assert set(placed) <= set(remaining)
