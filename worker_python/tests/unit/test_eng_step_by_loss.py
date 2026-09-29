"""ENG-17 Grid-Abstand nach Verlust ($): Betrag → Preisabstand je Lot."""
import pytest

from src.core.grid_execution.config import extract_zone_config, money_to_price_distance
from src.core.grid_execution.exceptions import InvalidZoneConfigError
from tests.helpers import EngineHarness, make_zone, prices


def _cfg(fake_mt5, **zone):
    return extract_zone_config(make_zone(**zone), 0, symbol_infos=dict(fake_mt5.symbols))


@pytest.mark.feature("ENG-17")
def test_betrag_wird_mit_tick_wert_in_preisabstand_umgerechnet(fake_mt5):
    # EURUSD: 1 Lot, 1 Tick (0,00001) = 1 $ → 0,10 Lot verliert 10 $ nach 0,00100
    fake_mt5.add_symbol("EURUSD", bid=1.10000, digits=5, point=0.00001,
                        trade_tick_size=0.00001, trade_tick_value=1.0, trade_contract_size=100000)
    assert money_to_price_distance(10, 0.10, "EURUSD", dict(fake_mt5.symbols)) == pytest.approx(0.001)
    # Doppelte Lotgröße → halber Abstand
    assert money_to_price_distance(10, 0.20, "EURUSD", dict(fake_mt5.symbols)) == pytest.approx(0.0005)


@pytest.mark.feature("ENG-17")
def test_ohne_tick_wert_gilt_kontraktgroesse_und_rundung_auf_point(fake_mt5):
    # USOUSD im Fixture: Kontrakt 1000, point 0,001 → 0,01 Lot = 10 $ je 1,0 Preis
    assert money_to_price_distance(1, 0.01, "USOUSD", dict(fake_mt5.symbols)) == pytest.approx(0.1)
    # Winziger Betrag → mindestens 1 point
    assert money_to_price_distance(0.0001, 0.01, "USOUSD", dict(fake_mt5.symbols)) == pytest.approx(0.001)
    assert money_to_price_distance(1, 0.01, "UNBEKANNT", dict(fake_mt5.symbols)) is None


@pytest.mark.feature("ENG-17")
def test_zone_config_rechnet_grid_und_pullback_je_seite_um(fake_mt5):
    cfg = _cfg(fake_mt5, step_by_loss=True, sync_buy_sell=False, grid_step=1, lot_size=0.01,
               sell_grid_step=1, sell_lot_size=0.02, pullback_distance=5, sell_pullback_distance=0)
    assert cfg.step_by_loss is True
    assert cfg.grid_step == pytest.approx(0.1)
    assert cfg.sell_grid_step == pytest.approx(0.05)
    assert cfg.pullback_distance == pytest.approx(0.5)
    assert cfg.sell_pullback_distance == 0.0  # 0 bleibt 0 (kein Mindestabstand)


@pytest.mark.feature("ENG-17")
def test_ohne_checkbox_bleiben_preisabstaende_unveraendert(fake_mt5):
    cfg = _cfg(fake_mt5, grid_step=1, pullback_distance=5)
    assert (cfg.step_by_loss, cfg.grid_step, cfg.pullback_distance) == (False, 1.0, 5.0)


@pytest.mark.feature("ENG-17")
def test_fehlende_symbolinfo_lehnt_zone_ab():
    with pytest.raises(InvalidZoneConfigError):
        extract_zone_config(make_zone(step_by_loss=True), 0, symbol_infos={})


@pytest.mark.feature("ENG-17")
def test_engine_setzt_orders_im_verlust_abstand(fake_mt5):
    # 1 $ bei 0,01 Lot = 0,1 Preis → gleiche Level wie grid_step 0,1 im Preis-Modus
    zone = make_zone(step_by_loss=True, grid_step=1, lot_size=0.01, levels_below=3, levels_above=0)
    EngineHarness(fake_mt5, [zone]).tick()
    assert prices(fake_mt5.orders) == [96.7, 96.8, 96.9]
