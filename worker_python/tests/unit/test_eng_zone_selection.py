"""ENG-01 Zonenwahl (Anlık Fiyat / Mum Kapanışı)."""
import pytest

from src.core.grid_zone_selector import get_active_zone, is_zone_exited
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone


@pytest.mark.feature("ENG-01")
def test_erste_aktive_zone_die_den_kurs_enthaelt(fake_mt5):
    zones = [
        make_zone(id="inaktiv", is_active=False, min_price=90, max_price=110),
        make_zone(id="zu-hoch", min_price=100, max_price=110),
        make_zone(id="treffer", min_price=90, max_price=100),
        make_zone(id="auch-passend", min_price=95, max_price=99),
    ]
    zone, idx = get_active_zone(fake_mt5, zones)
    assert (zone["id"], idx) == ("treffer", 2)


@pytest.mark.feature("ENG-01")
def test_is_active_als_string_false_wird_respektiert(fake_mt5):
    zone, idx = get_active_zone(fake_mt5, [make_zone(is_active="false")])
    assert (zone, idx) == (None, None)


@pytest.mark.feature("ENG-01")
def test_keine_zone_ohne_kurs_oder_symbol(fake_mt5):
    zones = [make_zone(symbol=""), make_zone(symbol="XAUUSD")]  # XAUUSD hat keinen Tick
    assert get_active_zone(fake_mt5, zones) == (None, None)


@pytest.mark.feature("ENG-01")
def test_kerzenschluss_entscheidet_statt_tick(fake_mt5):
    zone = make_zone(min_price=90, max_price=96, exit_condition="Mum Kapanışı", exit_timeframe="H1")
    # Tick (97.005) liegt außerhalb, der Schluss der letzten H1-Kerze (95.5) innerhalb
    fake_mt5.set_closed_candle("USOUSD", fake_mt5.TIMEFRAME_H1, 95.5)
    assert get_active_zone(fake_mt5, [zone])[1] == 0
    # Nur M15-Kerze vorhanden → für H1 fehlt die Kerze → Fallback auf Tick → keine Zone
    fake_mt5.closed_candles.clear()
    fake_mt5.set_closed_candle("USOUSD", fake_mt5.TIMEFRAME_M15, 95.5)
    assert get_active_zone(fake_mt5, [zone]) == (None, None)


@pytest.mark.feature("ENG-01")
def test_zonenaustritt_nach_tick_und_nach_kerze(fake_mt5):
    zone = make_zone(min_price=90, max_price=97)
    assert is_zone_exited(fake_mt5, zone, 97.005, "USOUSD") is True
    assert is_zone_exited(fake_mt5, zone, 96.5, "USOUSD") is False

    candle_zone = make_zone(min_price=90, max_price=97, exit_condition="Mum Kapanışı")
    fake_mt5.set_closed_candle("USOUSD", fake_mt5.TIMEFRAME_M15, 96.9)
    # Tick schon draußen, Kerze aber noch drin → noch kein Austritt
    assert is_zone_exited(fake_mt5, candle_zone, 97.005, "USOUSD") is False


@pytest.mark.feature("ENG-01")
def test_symbol_filter_behaelt_globale_indizes(fake_mt5):
    fake_mt5.add_symbol("XAUUSD", bid=4293.00, ask=4293.20, digits=2, point=0.01)
    zones = [make_zone(), make_zone(symbol="XAUUSD", min_price=4000, max_price=5000)]
    assert get_active_zone(fake_mt5, zones, "XAUUSD")[1] == 1
    assert get_active_zone(fake_mt5, zones, "USOUSD")[1] == 0


@pytest.mark.feature("ENG-01")
def test_zonen_verschiedener_symbole_laufen_gleichzeitig(fake_mt5):
    """Bug 25.09: Zone 2 (XAUUSD) bekam keine Orders, weil nur Zone 1 (USOUSD) aktiv sein durfte."""
    m = fake_mt5
    m.add_symbol("XAUUSD", bid=4293.00, ask=4293.20, digits=2, point=0.01)
    zones = [
        make_zone(order_type="BUY"),
        make_zone(symbol="XAUUSD", order_type="BOTH", min_price=4000, max_price=5000, grid_step=1.0,
                  take_profit=1.0, levels_below=2, levels_above=2),
    ]
    engine = EngineHarness(m, zones)
    engine.tick()

    assert engine.active_zones == {"USOUSD": 0, "XAUUSD": 1}
    assert m.robot_orders(MAGIC_ZONE_1)
    xau = m.robot_orders(MAGIC_ZONE_1 + 1)
    assert xau and all(o.symbol == "XAUUSD" for o in xau)
    assert all(o.symbol == "USOUSD" for o in m.robot_orders(MAGIC_ZONE_1))


@pytest.mark.feature("ENG-01")
def test_gleiches_symbol_weiter_nur_eine_zone(fake_mt5):
    m = fake_mt5
    zones = [make_zone(min_price=90, max_price=100), make_zone(min_price=95, max_price=105)]
    engine = EngineHarness(m, zones)
    engine.tick()
    assert engine.active_zones == {"USOUSD": 0}
    assert m.robot_orders(MAGIC_ZONE_1) and not m.robot_orders(MAGIC_ZONE_1 + 1)
