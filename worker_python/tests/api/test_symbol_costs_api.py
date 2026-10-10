"""BKT-04 (B1) GET /symbols/{id} liefert die Kostenfelder des Symbols (MT5 = FakeMT5,
die Verbindung selbst ist ersetzt; sie ist in test_mt5_connect.py getestet)."""
import pytest

import src.utils.mt5_connection as mc
import src.utils.mt5_helpers as mh
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID
from tests.fakes.fake_mt5 import FakeMT5


@pytest.fixture
def broker(client, seed_accounts, monkeypatch):
    seed_accounts(account())
    monkeypatch.setattr(mh, "_LAST_FETCH_ERROR", {})
    monkeypatch.setattr(mh, "_IN_FLIGHT", {})
    fake = FakeMT5()
    fake.add_symbol(
        "XAUUSD", 2650.0, digits=2, point=0.01, trade_calc_mode=2, trade_tick_value_profit=1.0,
        trade_tick_value_loss=1.01, swap_long=-35.5, swap_short=12.25, swap_rollover3days=5,
        spread=18, trade_stops_level=7,
    )
    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", lambda *a, **kw: (True, False, None))
    monkeypatch.setattr(mc, "get_mt5_symbols", fake.symbols_get)
    monkeypatch.setattr(mc, "shutdown_mt5", lambda: None)
    return fake


@pytest.mark.feature("BKT-04")
def test_symbolliste_liefert_kostenfelder(client, broker):
    body = client.get(f"/api/symbols/{TEST_ACCOUNT_ID}").json()

    [sym] = [s for s in body["symbols"] if s["name"] == "XAUUSD"]
    assert {k: sym[k] for k in mh.SYMBOL_COST_FIELDS} == {
        "trade_calc_mode": 2, "trade_tick_value_profit": 1.0, "trade_tick_value_loss": 1.01,
        "currency_profit": "USD", "swap_mode": 1, "swap_long": -35.5, "swap_short": 12.25,
        "swap_rollover3days": 5, "spread": 18, "trade_stops_level": 7,
    }


@pytest.mark.feature("ENG-30")
def test_symbolliste_liefert_pips_und_broker_ticks(client, broker):
    broker.symbols["XAUUSD"].trade_tick_size = 0.25
    broker.add_symbol("EURUSD.SUFFIX", 1.1, digits=5, point=0.00001, trade_calc_mode=0)
    symbols = client.get(f"/api/symbols/{TEST_ACCOUNT_ID}").json()["symbols"]
    by_name = {s["name"]: s for s in symbols}
    assert by_name["EURUSD.SUFFIX"]["distance_unit"] == "pips"
    assert by_name["EURUSD.SUFFIX"]["distance_unit_size"] == 0.0001
    assert by_name["XAUUSD"]["distance_unit"] == "ticks"
    assert by_name["XAUUSD"]["distance_unit_size"] == 0.25
