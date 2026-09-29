"""Signal-Einstieg pro Zone (grid_signals + grid_execution/handler) gegen den FakeMT5.

ENG-17 Indikator-Signal (EMA/RSI/Bollinger) als Grid-Filter · ENG-18 Signal → Market-Order
ENG-19 Max. Positionen pro Richtung · ENG-20 TP als Geldbetrag · ENG-21 Spread-Filter
ENG-22 Richtung automatisch (order_type AUTO)
"""
import pytest

from src.core import grid_signals as gs
from src.core.grid_execution.config import extract_zone_config, tp_distance_of
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone, prices

M5 = 5  # FakeMT5.TIMEFRAME_M5


def _aufwaerts_mit_ruecksetzer():
    """Aufwärtstrend, dann 7 fallende Kerzen: Schluss 97,43 > EMA50 ≈ 97,36, RSI14 ≈ 37."""
    up = [94 + 0.02 * i for i in range(190)]
    return up + [up[-1] - 0.05 * (i + 1) for i in range(7)]


def _abwaerts_mit_erholung():
    """Spiegelbild: Schluss < EMA50, RSI14 ≈ 63."""
    down = [100 - 0.02 * i for i in range(190)]
    return down + [down[-1] + 0.05 * (i + 1) for i in range(7)]


def _signal_zone(**overrides):
    base = dict(entry_mode="GRID_FILTER", signal_timeframe="M5", use_ema=True, ema_period=50,
                use_rsi=True, rsi_period=14, rsi_buy_below=40, rsi_sell_above=60)
    base.update(overrides)
    return make_zone(**base)


# --------------------------------------------------------------------------- ENG-17
@pytest.mark.feature("ENG-17")
def test_indikatoren_rechnen_bekannte_werte():
    assert gs.ema([5.0] * 60, 50) == pytest.approx(5.0)
    assert gs.rsi([1.0 + i for i in range(30)], 14) == pytest.approx(100.0)
    assert gs.rsi([30.0 - i for i in range(30)], 14) == pytest.approx(0.0)
    assert gs.rsi([5.0] * 30, 14) == pytest.approx(50.0)
    mid, upper, lower = gs.bollinger([1.0, 3.0] * 10, 20, 2.0)
    assert (mid, upper, lower) == pytest.approx((2.0, 4.0, 0.0))
    assert gs.ema([1.0] * 10, 50) is None  # zu wenige Kerzen


@pytest.mark.feature("ENG-17")
def test_filter_ohne_signal_setzt_keine_buy_orders_und_loescht_alte(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _abwaerts_mit_erholung())  # kein Buy-Signal
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, 0.01, tp=97.0, magic=MAGIC_ZONE_1)
    EngineHarness(m, [_signal_zone(order_type="BUY")]).tick()
    assert m.robot_orders(MAGIC_ZONE_1) == []


@pytest.mark.feature("ENG-17")
def test_filter_mit_signal_legt_grid_wie_bisher(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer())
    EngineHarness(m, [_signal_zone(order_type="BUY")]).tick()
    assert prices(m.robot_orders(MAGIC_ZONE_1)) == [96.7, 96.8, 96.9, 97.1, 97.2, 97.3]


@pytest.mark.feature("ENG-17")
def test_zu_wenige_kerzen_blockiert_einstieg(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer()[-20:])
    EngineHarness(m, [_signal_zone(order_type="BOTH")]).tick()
    assert m.robot_orders(MAGIC_ZONE_1) == []


@pytest.mark.feature("ENG-17")
def test_grid_modus_ignoriert_signal(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _abwaerts_mit_erholung())
    EngineHarness(m, [_signal_zone(order_type="BUY", entry_mode="GRID")]).tick()
    assert len(m.robot_orders(MAGIC_ZONE_1)) == 6


# --------------------------------------------------------------------------- ENG-18
@pytest.mark.feature("ENG-18")
def test_signal_market_oeffnet_sofort_mit_tp(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer())
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, 0.01, tp=97.0, magic=MAGIC_ZONE_1)
    EngineHarness(m, [_signal_zone(order_type="BUY", entry_mode="SIGNAL_MARKET", take_profit=1.0)]).tick()

    assert m.robot_orders(MAGIC_ZONE_1) == []  # keine Pending Orders im Signalmodus
    [pos] = m.robot_positions(MAGIC_ZONE_1)
    assert pos.type == m.POSITION_TYPE_BUY
    assert pos.price_open == pytest.approx(97.01)  # Ask
    assert pos.tp == pytest.approx(98.01)


@pytest.mark.feature("ENG-18")
def test_signal_market_wiedereinstieg_sofort_bis_zum_limit(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer())
    engine = EngineHarness(m, [_signal_zone(order_type="BUY", entry_mode="SIGNAL_MARKET", max_buy_positions=2)])
    for _ in range(4):
        engine.tick()
    assert len(m.robot_positions(MAGIC_ZONE_1)) == 2


@pytest.mark.feature("ENG-18")
def test_signal_market_ausserhalb_der_zone_kein_einstieg(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer())
    EngineHarness(m, [_signal_zone(order_type="BUY", entry_mode="SIGNAL_MARKET", min_price=98, max_price=99)]).tick()
    assert m.robot_positions(MAGIC_ZONE_1) == []


# --------------------------------------------------------------------------- ENG-19
@pytest.mark.feature("ENG-19")
def test_richtungslimit_voll_nur_noch_sell_orders(fake_mt5):
    m = fake_mt5
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, 0.01, tp=96.6, magic=MAGIC_ZONE_1)
    EngineHarness(m, [make_zone(order_type="BOTH", max_buy_positions=1)]).tick()
    orders = m.robot_orders(MAGIC_ZONE_1)
    assert orders and all(o.type in m.SELL_TYPES for o in orders)


@pytest.mark.feature("ENG-19")
def test_richtungslimit_legt_nur_freie_slots_naechst_am_kurs(fake_mt5):
    m = fake_mt5
    EngineHarness(m, [make_zone(order_type="BUY", max_buy_positions=2)]).tick()
    assert prices(m.robot_orders(MAGIC_ZONE_1)) == [96.9, 97.1]


# --------------------------------------------------------------------------- ENG-20
@pytest.mark.feature("ENG-20")
def test_tp_als_geldbetrag_wird_in_preisabstand_umgerechnet(fake_mt5):
    m = fake_mt5  # tick_value 1,0 pro 0,001 und Lot → 0,01 Lot: 0,01 pro Tick
    zone = make_zone(order_type="BUY", tp_mode="MONEY", take_profit_money=0.5, lot_size=0.01)
    assert tp_distance_of(zone, "BUY", dict(m.symbols)) == pytest.approx(0.05)

    engine = EngineHarness(m, [zone])
    engine.tick()
    for o in m.robot_orders(MAGIC_ZONE_1):
        assert o.tp == pytest.approx(o.price_open + 0.05)

    m.set_price("USOUSD", 96.85)  # Buy-Limit 96,9 füllt
    engine.tick()
    [pos] = m.robot_positions(MAGIC_ZONE_1)
    assert pos.tp == pytest.approx(96.95)  # TP-Sync überschreibt den Geld-TP nicht


@pytest.mark.feature("ENG-20")
def test_tp_geld_ohne_symbolinfo_faellt_auf_preis_tp_zurueck():
    zone = make_zone(tp_mode="MONEY", take_profit_money=5, take_profit=0.3)
    assert extract_zone_config(zone, 0).take_profit == pytest.approx(0.3)


# --------------------------------------------------------------------------- ENG-21
@pytest.mark.feature("ENG-21")
def test_spread_zu_hoch_kein_einstieg(fake_mt5):
    m = fake_mt5  # Spread 0,010
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer())
    engine = EngineHarness(m, [_signal_zone(order_type="BUY", entry_mode="SIGNAL_MARKET", max_spread=0.005)])
    engine.tick()
    assert m.robot_positions(MAGIC_ZONE_1) == []

    m.set_price("USOUSD", 97.0, 97.004)  # Spread 0,004
    engine.tick()
    assert len(m.robot_positions(MAGIC_ZONE_1)) == 1


# --------------------------------------------------------------------------- ENG-22
@pytest.mark.feature("ENG-22")
def test_auto_richtung_folgt_dem_trend(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _aufwaerts_mit_ruecksetzer())
    engine = EngineHarness(m, [_signal_zone(order_type="AUTO", entry_mode="SIGNAL_MARKET")])
    engine.tick()
    assert [p.type for p in m.robot_positions(MAGIC_ZONE_1)] == [m.POSITION_TYPE_BUY]

    m.set_candles("USOUSD", M5, _abwaerts_mit_erholung(), start_time=1_800_000_000)
    engine.tick()
    types = sorted(p.type for p in m.robot_positions(MAGIC_ZONE_1))
    assert types == [m.POSITION_TYPE_BUY, m.POSITION_TYPE_SELL]


@pytest.mark.feature("ENG-22")
def test_auto_im_grid_filter_nur_eine_seite(fake_mt5):
    m = fake_mt5
    m.set_candles("USOUSD", M5, _abwaerts_mit_erholung())
    EngineHarness(m, [_signal_zone(order_type="AUTO")]).tick()
    orders = m.robot_orders(MAGIC_ZONE_1)
    assert len(orders) == 6 and all(o.type in m.SELL_TYPES for o in orders)


@pytest.mark.feature("ENG-22")
def test_auto_ohne_indikator_oeffnet_nichts(fake_mt5):
    m = fake_mt5
    EngineHarness(m, [_signal_zone(order_type="AUTO", use_ema=False, use_rsi=False)]).tick()
    assert m.robot_orders(MAGIC_ZONE_1) == [] and m.robot_positions(MAGIC_ZONE_1) == []
