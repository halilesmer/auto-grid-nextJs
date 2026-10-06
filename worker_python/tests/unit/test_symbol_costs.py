"""BKT-04 (B1) Kostenfelder der Symbolliste: build_detailed_symbols liefert alle Werte, die der
Backtest für Gewinn, Swap und Spread braucht (docs/analyse-regeln.md §6)."""
import json

import pytest

import src.utils.mt5_helpers as mh
from src.utils.mt5_helpers import SYMBOL_COST_FIELDS, build_detailed_symbols
from src.utils.mt5_market import _SYMBOL_FIELDS
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import SymbolInfo

COST_FIELDS = {
    "trade_calc_mode", "trade_tick_value_profit", "trade_tick_value_loss", "currency_profit",
    "swap_mode", "swap_long", "swap_short", "swap_rollover3days", "spread", "trade_stops_level",
}


@pytest.mark.feature("BKT-04")
def test_alle_kostenfelder_aus_mt5_objekt():
    info = SymbolInfo(
        name="XAUUSD", digits=2, point=0.01, trade_calc_mode=2, trade_tick_value_profit=1.0,
        trade_tick_value_loss=1.01, currency_profit="USD", swap_mode=1, swap_long=-35.5,
        swap_short=12.25, swap_rollover3days=5, spread=18, trade_stops_level=7,
    )
    [row] = build_detailed_symbols([info])

    assert set(SYMBOL_COST_FIELDS) == COST_FIELDS
    assert {k: row[k] for k in COST_FIELDS} == {
        "trade_calc_mode": 2, "trade_tick_value_profit": 1.0, "trade_tick_value_loss": 1.01,
        "currency_profit": "USD", "swap_mode": 1, "swap_long": -35.5, "swap_short": 12.25,
        "swap_rollover3days": 5, "spread": 18, "trade_stops_level": 7,
    }
    # Bisherige Felder bleiben
    assert row["name"] == "XAUUSD" and row["digits"] == 2 and row["point"] == 0.01


@pytest.mark.feature("BKT-04")
def test_fehlendes_kostenfeld_bleibt_none():
    """Ein Wert, den MT5 nicht liefert, wird nicht geraten (0 wäre z. B. ein falscher Swap)."""
    [row] = build_detailed_symbols([{"name": "USOUSD", "digits": 3, "swap_long": None}])

    assert all(k in row and row[k] is None for k in COST_FIELDS)


@pytest.mark.feature("BKT-04")
def test_zeitkontrolle_nutzt_dieselbe_feldliste():
    assert set(SYMBOL_COST_FIELDS) <= set(_SYMBOL_FIELDS)


@pytest.mark.feature("BKT-04")
def test_alter_cache_ohne_kostenfelder_wird_erneuert(tmp_path, monkeypatch):
    """Ein Cache-Eintrag aus der Zeit vor BKT-04 ist nie „frisch“: die Liste kommt sofort,
    aber eine MT5-Abfrage holt die Kostenfelder nach (sonst fehlen sie bis zu 1 h)."""
    cache = tmp_path / "broker_symbols.json"
    cache.write_text(json.dumps({TEST_ACCOUNT_ID: {"USOUSD": {"name": "USOUSD", "digits": 3}}}))
    monkeypatch.setattr(mh, "CACHE_FILE", str(cache))

    symbols, fresh = mh.get_cached_symbols(TEST_ACCOUNT_ID, lambda *a, **k: None)
    assert symbols == [{"name": "USOUSD", "digits": 3}] and fresh is False

    cache.write_text(json.dumps({TEST_ACCOUNT_ID: {"USOUSD": build_detailed_symbols([SymbolInfo(name="USOUSD")])[0]}}))
    assert mh.get_cached_symbols(TEST_ACCOUNT_ID, lambda *a, **k: None)[1] is True
