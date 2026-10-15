"""ENG-18: Raster hängt an der zuletzt geöffneten Position – Orders vom alten Anker bleiben nicht stehen."""
import pytest

from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone, prices

KNOWN_DEFECT = pytest.mark.xfail(
    strict=True,
    raises=AssertionError,
    reason="Known defect: orders of the old anchor stay inside the 0.4 step tolerance "
    "(see docs/journal/2026-10-15-stale-orders-after-anchor-move.md)",
)


def _harness(fake_mt5, order_type, bid):
    # EURUSD: 0,10 Lot, Grid 10 $ = 0,00100, TP 5 $ = 0,00050, Sofort-Einstieg
    fake_mt5.add_symbol("EURUSD", bid=bid, ask=bid, digits=5, point=0.00001,
                        trade_tick_size=0.00001, trade_tick_value=1.0, trade_contract_size=100000)
    zone = make_zone(symbol="EURUSD", min_price=1.10, max_price=1.14, step_by_loss=True,
                     instant_entry=True, grid_step=10, lot_size=0.10, take_profit=5,
                     pullback_distance=0, order_type=order_type, levels_below=5 if order_type == "BUY" else 0,
                     levels_above=5 if order_type == "SELL" else 0)
    h = EngineHarness(fake_mt5, [zone])
    h.tick()  # Sofort-Einstieg
    h.tick()  # Grid ab der Position
    return h


def _move_anchor(fake_mt5, h, price):
    fake_mt5.set_price("EURUSD", bid=price, ask=price)  # TP erreicht, Preis läuft weiter
    assert fake_mt5.robot_positions(MAGIC_ZONE_1) == []
    h.tick()  # neuer Sofort-Einstieg
    h.tick()  # Grid ab der neuen Position


def _orders(fake_mt5):
    return prices(fake_mt5.robot_orders(MAGIC_ZONE_1), 5)


def _positions(fake_mt5):
    return prices(fake_mt5.robot_positions(MAGIC_ZONE_1), 5)


@pytest.mark.feature("ENG-18")
def test_buy_ausgangslage_grid_und_neueinstieg_nach_tp(fake_mt5):
    h = _harness(fake_mt5, "BUY", 1.12299)
    assert _orders(fake_mt5) == [1.11799, 1.11899, 1.11999, 1.12099, 1.12199]
    _move_anchor(fake_mt5, h, 1.12362)
    assert _positions(fake_mt5) == [1.12362]


@pytest.mark.feature("ENG-18")
@KNOWN_DEFECT
def test_buy_orders_folgen_dem_neuen_anker(fake_mt5):
    h = _harness(fake_mt5, "BUY", 1.12299)
    _move_anchor(fake_mt5, h, 1.12362)
    # Raster 0,00100 ab 1.12362. Eine Order des alten Ankers (1.12199) würde zur Position 1.12262
    # bei −6,3 $ statt −10 $ füllen.
    assert _orders(fake_mt5) == [1.11862, 1.11962, 1.12062, 1.12162, 1.12262]


@pytest.mark.feature("ENG-18")
@KNOWN_DEFECT
def test_sell_orders_folgen_dem_neuen_anker(fake_mt5):
    h = _harness(fake_mt5, "SELL", 1.12299)
    assert _orders(fake_mt5) == [1.12399, 1.12499, 1.12599, 1.12699, 1.12799]
    _move_anchor(fake_mt5, h, 1.12236)  # TP 1.12249 erreicht
    assert _positions(fake_mt5) == [1.12236]
    assert _orders(fake_mt5) == [1.12336, 1.12436, 1.12536, 1.12636, 1.12736]
