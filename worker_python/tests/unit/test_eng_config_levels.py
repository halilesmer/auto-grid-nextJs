"""ENG-02 Sliding-Grid-Level, ENG-03 Breakout/Pullback, ENG-04 Zonen-Config + Lot-Clamp."""
import pytest

from src.core.grid_execution.config import extract_zone_config
from src.core.grid_execution.exceptions import InvalidZoneConfigError
from src.core.grid_execution.levels import generate_levels
from tests.helpers import MAGIC_ZONE_1, make_zone

MID = 97.005  # (bid 97.000 + ask 97.010) / 2 im fake_mt5-Fixture


def _levels(fake_mt5, zone, mid=MID, positions=()):
    config = extract_zone_config(zone, 0)
    return generate_levels(config, mid, list(positions), dict(fake_mt5.symbols), fake_mt5)


def _r(values):
    return sorted(round(v, 3) for v in values)


# --------------------------------------------------------------------------- ENG-04
@pytest.mark.feature("ENG-04")
def test_lot_wird_auf_001_bis_5_begrenzt():
    assert extract_zone_config(make_zone(lot_size=0.001), 0).lot_size == 0.01
    assert extract_zone_config(make_zone(lot_size=12), 0).lot_size == 5.0
    assert extract_zone_config(make_zone(lot_size=0.37), 0).lot_size == 0.37


@pytest.mark.feature("ENG-04")
def test_ungueltige_zonen_werden_abgelehnt():
    with pytest.raises(InvalidZoneConfigError):
        extract_zone_config(make_zone(min_price=100, max_price=100), 0)
    with pytest.raises(InvalidZoneConfigError):
        extract_zone_config(make_zone(symbol="  "), 0)
    with pytest.raises(InvalidZoneConfigError):
        extract_zone_config("keine zone", 0)


@pytest.mark.feature("ENG-04")
def test_sync_uebernimmt_buy_werte_fuer_sell():
    cfg = extract_zone_config(
        make_zone(sync_buy_sell=True, grid_step=0.2, lot_size=0.03, take_profit=0.4, stop_loss=1.0,
                  sell_grid_step=9, sell_lot_size=9, sell_take_profit=9, sell_stop_loss=9),
        0,
    )
    assert (cfg.sell_grid_step, cfg.sell_lot_size, cfg.sell_take_profit, cfg.sell_stop_loss) == (0.2, 0.03, 0.4, 1.0)


@pytest.mark.feature("ENG-04")
def test_ohne_sync_gelten_eigene_sell_werte_und_magic_je_zone():
    cfg = extract_zone_config(
        make_zone(sync_buy_sell=False, sell_grid_step=0.4, sell_lot_size=0.03, sell_take_profit=0.6,
                  sell_stop_loss=2, sell_pullback_distance=0.9, symbol=" usousd "),
        2,
    )
    assert (cfg.sell_grid_step, cfg.sell_lot_size, cfg.sell_take_profit, cfg.sell_stop_loss) == (0.4, 0.03, 0.6, 2.0)
    assert cfg.sell_pullback_distance == 0.9
    assert cfg.symbol == "USOUSD"
    assert cfg.target_magic == 200003  # Zone-Index 2 → 200000 + 2 + 1


@pytest.mark.feature("ENG-04")
def test_max_positionen_0_bedeutet_500():
    assert extract_zone_config(make_zone(max_positions=0), 0).max_positions == 500


# --------------------------------------------------------------------------- ENG-02
@pytest.mark.feature("ENG-02")
def test_buy_level_um_den_anker_im_gridabstand(fake_mt5):
    lv = _levels(fake_mt5, make_zone(order_type="BUY", grid_step=0.1, levels_below=3, levels_above=3))
    # Anker = round(97.005 / 0.1) * 0.1 = 97.0
    assert _r(lv.desired_buy) == [96.7, 96.8, 96.9, 97.1, 97.2, 97.3]
    assert lv.desired_sell == []


@pytest.mark.feature("ENG-02")
def test_sell_level_spiegeln_buy(fake_mt5):
    lv = _levels(fake_mt5, make_zone(order_type="SELL", levels_below=2, levels_above=2))
    assert _r(lv.desired_sell) == [96.8, 96.9, 97.1, 97.2]
    assert lv.desired_buy == []


@pytest.mark.feature("ENG-02")
def test_level_ausserhalb_der_zone_werden_abgeschnitten(fake_mt5):
    lv = _levels(fake_mt5, make_zone(order_type="BUY", min_price=96.85, max_price=97.15))
    assert _r(lv.desired_buy) == [96.9, 97.1]


@pytest.mark.feature("ENG-02")
def test_akzeptanzfenster_hat_zwei_stufen_puffer(fake_mt5):
    lv = _levels(fake_mt5, make_zone(order_type="BUY", levels_below=3, levels_above=3))
    accept = _r(lv.acceptable_buy)
    assert accept[0] == 96.5 and accept[-1] == 97.5  # 97.0 ± (3 + 2) × 0.1
    assert len(accept) == 11


@pytest.mark.feature("ENG-02")
def test_offene_positionen_bleiben_akzeptiert(fake_mt5):
    far_pos = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 95.0, magic=MAGIC_ZONE_1)
    foreign = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 94.0, magic=200009)
    lv = _levels(fake_mt5, make_zone(order_type="BUY"), positions=[far_pos, foreign])
    assert 95.0 in _r(lv.acceptable_buy)
    assert 94.0 not in _r(lv.acceptable_buy)


# --------------------------------------------------------------------------- ENG-03
@pytest.mark.feature("ENG-03")
def test_breakout_buy_nur_oberhalb_mit_pullback_abstand(fake_mt5):
    lv = _levels(fake_mt5, make_zone(order_type="BUY", is_breakout=True, pullback_distance=0.2))
    # 97.1 und 97.2 liegen näher als 0.2 am Kurs 97.005 → nur 97.3; unterhalb nichts
    assert _r(lv.desired_buy) == [97.3]
    assert all(v >= MID for v in lv.acceptable_buy)


@pytest.mark.feature("ENG-03")
def test_breakout_sell_nur_unterhalb_mit_eigenem_pullback(fake_mt5):
    lv = _levels(
        fake_mt5,
        make_zone(order_type="SELL", is_breakout=True, sync_buy_sell=False, sell_pullback_distance=0.1),
    )
    # 96.9 ist 0.105 entfernt (≥ 0.1) → erlaubt; oberhalb nichts
    assert _r(lv.desired_sell) == [96.7, 96.8, 96.9]
    assert all(v <= MID for v in lv.acceptable_sell)
