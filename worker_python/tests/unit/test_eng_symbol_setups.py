"""ZON-19 Symbol mit Setups: Bot und Leser sehen gespeicherte Setups als flache Zonenliste.

Die Datei speichert `SYMBOLS: [{symbol, setups}]`; die Engine arbeitet weiter mit einer Zone je
Setup (Magic aus dem Setup, ENG-27). Reihenfolge: Symbol für Symbol, im Symbol die Setups.
"""
import json
import os

import pytest

from src.core.state import state
from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone


def _setup(**fields):
    zone = make_zone(**fields)
    del zone["symbol"]
    return zone


GROUPED = {
    "LOOP_INTERVAL_SECONDS": 1.0,
    "ZONE_MAGIC_MAX": 200003,
    "SYMBOLS": [
        {"symbol": "USOUSD", "setups": [_setup(id="a", magic=200001), _setup(id="c", magic=200003)]},
        {"symbol": "XAUUSD", "setups": [_setup(id="b", magic=200002)]},
    ],
}


def _write_settings(data):
    from src.utils import paths

    path = os.path.join(paths.CONFIGS_DIR, f"settings_{TEST_ACCOUNT_ID}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


@pytest.mark.feature("ZON-19")
def test_bot_laedt_setups_als_zonen_mit_symbol_und_magic(fake_mt5, monkeypatch):
    import src.core.wrappers as wrappers

    monkeypatch.setattr(wrappers, "mt5", fake_mt5)
    _write_settings(GROUPED)

    wrappers.load_dynamic_settings()

    assert [(z["id"], z["symbol"], z["magic"]) for z in state.zones] == [
        ("a", "USOUSD", 200001),
        ("c", "USOUSD", 200003),
        ("b", "XAUUSD", 200002),
    ]
    assert state.active_symbols == {"USOUSD", "XAUUSD"}


@pytest.mark.feature("ZON-19")
def test_bot_nimmt_zones_wenn_ein_alter_worker_sie_neben_symbols_geschrieben_hat(fake_mt5, monkeypatch):
    # Rückkehr zu einer alten Worker-Version: sie liest/schreibt nur ZONES, SYMBOLS bleibt veraltet stehen
    import src.core.wrappers as wrappers

    monkeypatch.setattr(wrappers, "mt5", fake_mt5)
    _write_settings({**GROUPED, "ZONES": [make_zone(id="b", symbol="XAUUSD", magic=200002)]})

    wrappers.load_dynamic_settings()

    assert [(z["id"], z["magic"]) for z in state.zones] == [("b", 200002)]


@pytest.mark.feature("ZON-19")
def test_stream_nimmt_das_symbol_des_ersten_setups(tmp_path):
    from src.api.ws_server import first_zone_symbol

    (tmp_path / "configs").mkdir(exist_ok=True)
    (tmp_path / "configs" / "settings_1001.json").write_text(json.dumps(GROUPED))

    assert first_zone_symbol(str(tmp_path), "1001") == "USOUSD"


@pytest.mark.feature("ZON-19")
def test_mt5_sync_status_zeigt_die_setups_als_zonen(fake_mt5):
    from types import SimpleNamespace

    from src.utils import paths
    from src.utils.state_manager import build_synced_state

    with open(paths.get_settings_path(TEST_ACCOUNT_ID), "w", encoding="utf-8") as f:
        json.dump(GROUPED, f)

    synced = build_synced_state(SimpleNamespace(mt5=fake_mt5), TEST_ACCOUNT_ID)

    assert [z["id"] for z in synced["config"]["zones"]] == ["a", "c", "b"]
