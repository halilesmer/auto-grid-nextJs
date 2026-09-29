"""ENG-18 Sofort erste Position: ohne offene Position je Seite sofort Markt-Order, Grid ab dieser Position."""
import pytest

from src.core.grid_execution.config import extract_zone_config
from src.core.state import state
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone, prices


def _positions(fake_mt5, pos_type):
    return [p for p in fake_mt5.robot_positions(MAGIC_ZONE_1) if p.type == pos_type]


@pytest.mark.feature("ENG-18")
def test_start_eroeffnet_sofort_buy_mit_tp(fake_mt5):
    zone = make_zone(instant_entry=True, levels_below=3, levels_above=0)
    EngineHarness(fake_mt5, [zone]).tick()
    buys = _positions(fake_mt5, fake_mt5.POSITION_TYPE_BUY)
    assert prices(buys) == [97.01]  # Ask
    assert buys[0].tp == pytest.approx(97.11)
    assert fake_mt5.orders == []  # Grid erst im nächsten Tick, ab dieser Position


@pytest.mark.feature("ENG-18")
def test_grid_startet_ab_der_ersten_position_und_bleibt_stabil(fake_mt5):
    zone = make_zone(instant_entry=True, levels_below=3, levels_above=0)
    h = EngineHarness(fake_mt5, [zone])
    h.tick()
    h.tick()
    # 97,010 − 0,1 / 0,2 / 0,3 (nicht das feste Raster 96,9 / 96,8 / 96,7)
    assert prices(fake_mt5.orders) == [96.71, 96.81, 96.91]
    sent = len(fake_mt5.sent)
    h.tick()
    h.tick()
    assert len(fake_mt5.sent) == sent  # keine Orders doppelt / gelöscht+neu


@pytest.mark.feature("ENG-18")
def test_beide_seiten_bei_both(fake_mt5):
    zone = make_zone(instant_entry=True, order_type="BOTH")
    EngineHarness(fake_mt5, [zone]).tick()
    assert prices(_positions(fake_mt5, fake_mt5.POSITION_TYPE_BUY)) == [97.01]
    assert prices(_positions(fake_mt5, fake_mt5.POSITION_TYPE_SELL)) == [97.0]  # Bid


@pytest.mark.feature("ENG-18")
def test_nach_tp_wird_sofort_wieder_eroeffnet(fake_mt5):
    zone = make_zone(instant_entry=True, levels_below=1, levels_above=0)
    h = EngineHarness(fake_mt5, [zone])
    h.tick()
    h.tick()  # Position gesehen → Wiederholungssperre aufgehoben
    assert len(fake_mt5.robot_positions(MAGIC_ZONE_1)) == 1
    fake_mt5.set_price("USOUSD", bid=97.200, ask=97.210)  # TP 97,11 erreicht
    assert fake_mt5.robot_positions(MAGIC_ZONE_1) == []
    h.tick()
    assert prices(fake_mt5.robot_positions(MAGIC_ZONE_1)) == [97.21]


@pytest.mark.feature("ENG-18")
def test_keine_zweite_position_solange_eine_offen_ist(fake_mt5):
    zone = make_zone(instant_entry=True, levels_below=1, levels_above=0)
    h = EngineHarness(fake_mt5, [zone])
    for _ in range(3):
        h.tick()
    deals = [r for r in fake_mt5.sent if r["action"] == fake_mt5.TRADE_ACTION_DEAL]
    assert len(deals) == 1


@pytest.mark.feature("ENG-18")
def test_abgelehnte_order_wird_nicht_jeden_tick_wiederholt(fake_mt5):
    zone = make_zone(instant_entry=True, levels_below=1, levels_above=0)
    h = EngineHarness(fake_mt5, [zone])
    fake_mt5.reject(10019, times=1)
    h.tick()
    h.tick()
    deals = [r for r in fake_mt5.checked if r["action"] == fake_mt5.TRADE_ACTION_DEAL]
    assert len(deals) == 1
    assert fake_mt5.robot_positions(MAGIC_ZONE_1) == []
    state.instant_entry_sent.clear()  # 30 s vergangen
    h.tick()
    assert len(fake_mt5.robot_positions(MAGIC_ZONE_1)) == 1


@pytest.mark.feature("ENG-18")
def test_ausserhalb_der_zone_oder_ohne_schalter_keine_position(fake_mt5):
    EngineHarness(fake_mt5, [make_zone(instant_entry=True, min_price=100.0, max_price=110.0)]).tick()
    EngineHarness(fake_mt5, [make_zone()]).tick()
    assert fake_mt5.robot_positions(MAGIC_ZONE_1) == []


@pytest.mark.feature("ENG-17")
def test_tp_und_sl_werden_bei_verlust_abstand_umgerechnet(fake_mt5):
    # USOUSD: 0,01 Lot = 0,10 $ je 0,01 Preis → 2 $ = 0,2 Preis
    cfg = extract_zone_config(
        make_zone(step_by_loss=True, take_profit=2, stop_loss=0, lot_size=0.01),
        0, symbol_infos=dict(fake_mt5.symbols),
    )
    assert cfg.take_profit == pytest.approx(0.2)
    assert cfg.stop_loss == 0.0


@pytest.mark.feature("ENG-17")
def test_offene_position_bekommt_umgerechneten_tp(fake_mt5):
    fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 97.0, magic=MAGIC_ZONE_1)
    zone = make_zone(step_by_loss=True, grid_step=1, take_profit=2, levels_below=0, levels_above=0)
    EngineHarness(fake_mt5, [zone]).tick()
    assert fake_mt5.robot_positions(MAGIC_ZONE_1)[0].tp == pytest.approx(97.2)
