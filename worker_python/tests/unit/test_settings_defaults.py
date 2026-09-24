"""SET-06 Standardwerte: neue Einstellungsdatei und Zonenfelder ohne Wert.

Früher standen GLOBAL_GRID_STEP u. a. in den Standardeinstellungen, wurden aber nie gelesen.
Jetzt enthält die Datei nur, was Engine und UI nutzen; fehlende Zonenfelder bekommen in der Engine
dieselben Standardwerte wie eine neue Zone im UI (frontend_nextjs/src/utils/zoneHelpers.ts).
"""
import json
import re

import pytest

import src.utils.config as config
from src.core.grid_execution.config import extract_zone_config
from tests.conftest import WORKER_ROOT

ZONE_HELPERS = WORKER_ROOT.parent / "frontend_nextjs" / "src" / "utils" / "zoneHelpers.ts"

# Feldname im UI → Attribut in ZoneConfig
ENGINE_FIELDS = {
    "grid_step": "grid_step",
    "lot_size": "lot_size",
    "take_profit": "take_profit",
    "stop_loss": "stop_loss",
    "sell_grid_step": "sell_grid_step",
    "sell_lot_size": "sell_lot_size",
    "sell_take_profit": "sell_take_profit",
    "sell_stop_loss": "sell_stop_loss",
    "pullback_distance": "pullback_distance",
    "sell_pullback_distance": "sell_pullback_distance",
    "levels_below": "levels_below",
    "levels_above": "levels_above",
    "max_positions": "max_positions",
    "is_breakout": "is_breakout",
    "sync_buy_sell": "sync_buy_sell",
    "order_type": "order_type",
}


def ui_default_zone() -> dict:
    """Werte aus defaultZone() im Frontend (nur Zahlen, Booleans, Strings)."""
    source = ZONE_HELPERS.read_text(encoding="utf-8")
    body = source.split("export function defaultZone()", 1)[1].split("};", 1)[0]
    values = {}
    for key, raw in re.findall(r"^\s*(\w+):\s*([^,\n]+),", body, flags=re.M):
        raw = raw.strip()
        if raw in ("true", "false"):
            values[key] = raw == "true"
        elif re.fullmatch(r"-?\d+(\.\d+)?", raw):
            values[key] = float(raw)
        elif raw.startswith("'"):
            values[key] = raw.strip("'")
    return values


@pytest.mark.feature("SET-06")
def test_neue_einstellungsdatei_ohne_ungenutzte_schluessel():
    settings = config.load_settings("Auto Grid")
    assert settings == {"LOOP_INTERVAL_SECONDS": 1.0, "ZONES": []}
    written = json.loads(open(config.get_settings_file("Auto Grid"), encoding="utf-8").read())
    assert not [k for k in written if k.startswith("GLOBAL_") or k in ("MAX_OPEN_POSITIONS", "CLEAR_ON_ZONE_EXIT")]


@pytest.mark.feature("SET-06")
def test_rueckgabe_ist_eine_kopie():
    settings = config.load_settings("Auto Grid")
    settings["ZONES"].append({"symbol": "X"})
    assert config.DEFAULT_SETTINGS_AUTO_GRID["ZONES"] == []


@pytest.mark.feature("SET-06")
@pytest.mark.parametrize("sync", [True, False])
def test_engine_standardwerte_entsprechen_neuer_zone_im_ui(sync):
    ui = ui_default_zone()
    assert ui, "defaultZone() in zoneHelpers.ts nicht gefunden"
    # Nur die Pflichtfelder; alles andere nimmt die Engine aus ihren Standardwerten
    minimal = {"symbol": "USOUSD", "min_price": 70.0, "max_price": 80.0}
    if not sync:
        minimal["sync_buy_sell"] = False
    cfg = extract_zone_config(minimal, 0)
    for ui_key, attr in ENGINE_FIELDS.items():
        if ui_key == "sync_buy_sell":
            continue
        assert getattr(cfg, attr) == ui[ui_key], f"{ui_key}: Engine {getattr(cfg, attr)!r} ≠ UI {ui[ui_key]!r}"
