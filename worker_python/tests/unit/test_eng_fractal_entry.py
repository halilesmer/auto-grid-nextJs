"""ENG-20 … ENG-24, ENG-26 Zonen-Modus „Fraktal“ (grid_execution/fractal_entry.py).

Kursbild (USOUSD, Bid 97,000 / Ask 97,010, H4): 20 ruhige Kerzen, dann ein oberes Fraktal bei
97,6 (Kerze low 96,8) und ein unteres Fraktal bei 96,5 (Kerze high 97,3), beide unberührt.
"""
import json
import os

import pytest

from src.core.grid_execution.config import extract_zone_config
from src.core.grid_execution.fractal_signals import atr, parabolic_sar
from src.core.state import state
from src.utils.paths import get_fractal_state_path
from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone

T0 = 1_700_000_000
STEP = 14_400

FLAT = [(97.2, 96.95)] * 20
SHAPE = [(97.3, 96.9), (97.4, 96.95), (97.6, 96.8), (97.5, 96.7), (97.3, 96.5), (97.2, 96.6), (97.1, 96.7)]
UP_IDX, DOWN_IDX = 22, 24  # Index der Fraktal-Kerzen in FLAT + SHAPE


def bars(hl):
    return [
        {"time": T0 + i * STEP, "open": (h + lo) / 2, "high": h, "low": lo, "close": (h + lo) / 2}
        for i, (h, lo) in enumerate(hl)
    ]


def fractal_zone(**overrides):
    base = dict(
        entry_mode="fractal", order_type="BOTH", fractal_timeframe="H4", fractal_order_mode="breakout",
        fractal_sl_mode="buffer", fractal_sl_buffer=0.05, fractal_rr=2.0,
    )
    base.update(overrides)
    return make_zone(**base)


def setup(fake_mt5, hl=None, **zone_overrides):
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(hl or FLAT + SHAPE))
    return EngineHarness(fake_mt5, [fractal_zone(**zone_overrides)])


def order_of(fake_mt5, order_type):
    found = [o for o in fake_mt5.robot_orders(MAGIC_ZONE_1) if o.type == order_type]
    assert len(found) <= 1
    return found[0] if found else None


# --------------------------------------------------------------------------- ENG-20
@pytest.mark.feature("ENG-20")
def test_ausbruch_setzt_stop_orders_auf_fraktalhoehe(fake_mt5):
    setup(fake_mt5).tick()
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    sell = order_of(fake_mt5, fake_mt5.ORDER_TYPE_SELL_STOP)
    assert (buy.price_open, buy.sl, buy.tp) == pytest.approx((97.6, 96.75, 99.3))  # SL Kerzentief − 0,05; TP 2 × 0,85
    assert (sell.price_open, sell.sl, sell.tp) == pytest.approx((96.5, 97.35, 94.8))
    assert buy.comment == f"AutoGrid_Z1_FU{T0 + UP_IDX * STEP}"
    assert sell.comment == f"AutoGrid_Z1_FD{T0 + DOWN_IDX * STEP}"
    assert len(fake_mt5.orders) == 2


@pytest.mark.feature("ENG-20")
def test_abpraller_setzt_limit_orders(fake_mt5):
    setup(fake_mt5, fractal_order_mode="rebound").tick()
    sell = order_of(fake_mt5, fake_mt5.ORDER_TYPE_SELL_LIMIT)
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_LIMIT)
    assert (sell.price_open, sell.sl, sell.tp) == pytest.approx((97.6, 97.65, 97.5))
    assert (buy.price_open, buy.sl, buy.tp) == pytest.approx((96.5, 96.45, 96.6))
    assert len(fake_mt5.orders) == 2


@pytest.mark.feature("ENG-20")
def test_richtung_und_zonenbereich_filtern(fake_mt5):
    setup(fake_mt5, order_type="BUY").tick()
    assert [o.type for o in fake_mt5.orders] == [fake_mt5.ORDER_TYPE_BUY_STOP]

    fake_mt5.orders.clear()
    state.reset()
    setup(fake_mt5, max_price=97.5).tick()  # 97,6 liegt außerhalb der Zone
    assert [o.type for o in fake_mt5.orders] == [fake_mt5.ORDER_TYPE_SELL_STOP]


@pytest.mark.feature("ENG-20")
def test_stabil_ohne_neue_kerze_keine_neuen_orders(fake_mt5):
    h = setup(fake_mt5)
    h.tick()
    sent = len(fake_mt5.sent)
    h.tick()
    h.tick()
    assert len(fake_mt5.sent) == sent


@pytest.mark.feature("ENG-20")
def test_grid_modus_bleibt_standard(fake_mt5):
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(FLAT + SHAPE))
    EngineHarness(fake_mt5, [make_zone(levels_below=3, levels_above=0)]).tick()
    assert sorted(round(o.price_open, 3) for o in fake_mt5.orders) == [96.7, 96.8, 96.9]


# --------------------------------------------------------------------------- ENG-21
@pytest.mark.feature("ENG-21")
def test_neues_fraktal_verschiebt_die_order(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    newer = FLAT + SHAPE + [(97.2, 96.8), (97.45, 96.9), (97.3, 96.85), (97.25, 96.9)]
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(newer))
    h.tick()
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    assert buy.price_open == pytest.approx(97.45)
    assert buy.sl == pytest.approx(96.85)
    assert len(fake_mt5.orders) == 1


@pytest.mark.feature("ENG-21")
def test_durchbrochenes_fraktal_wird_geloescht_und_nicht_neu_gesetzt(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    assert fake_mt5.orders
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(FLAT + SHAPE + [(97.7, 97.0)]))
    h.tick()
    h.tick()
    assert fake_mt5.orders == []


@pytest.mark.feature("ENG-21")
def test_grid_orders_verschwinden_beim_umschalten(fake_mt5):
    fake_mt5.add_order("USOUSD", fake_mt5.ORDER_TYPE_BUY_LIMIT, 96.9, magic=MAGIC_ZONE_1, comment="AutoGrid_Z1")
    setup(fake_mt5, order_type="BUY").tick()
    assert [o.comment.startswith("AutoGrid_Z1_FU") for o in fake_mt5.orders] == [True]


# --------------------------------------------------------------------------- ENG-22
@pytest.mark.feature("ENG-22")
def test_sl_atr(fake_mt5):
    setup(fake_mt5, order_type="BUY", fractal_sl_mode="atr", fractal_atr_period=14, fractal_atr_multiplier=1.5).tick()
    a = atr(bars(FLAT + SHAPE), 14)[UP_IDX]
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    assert buy.sl == pytest.approx(round(96.8 - 1.5 * a, 3))
    assert buy.tp == pytest.approx(round(97.6 + 2 * (97.6 - buy.sl), 3))


@pytest.mark.feature("ENG-22")
def test_sl_gegenfraktal(fake_mt5):
    setup(fake_mt5, order_type="BUY", fractal_sl_mode="opposite_fractal").tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).sl == pytest.approx(96.45)  # 96,5 − 0,05


@pytest.mark.feature("ENG-22")
def test_sl_sar(fake_mt5):
    setup(fake_mt5, order_type="BUY", fractal_sl_mode="sar").tick()
    sar = parabolic_sar(bars(FLAT + SHAPE), 0.02, 0.2)[0][-1]
    assert sar < 97.6
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).sl == pytest.approx(round(sar, 3))


@pytest.mark.feature("ENG-22")
def test_sl_rueckfall_auf_puffer_wenn_atr_fehlt(fake_mt5):
    setup(fake_mt5, order_type="BUY", fractal_sl_mode="atr", fractal_atr_period=50).tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).sl == pytest.approx(96.75)


@pytest.mark.feature("ENG-22")
def test_rr_null_bedeutet_kein_tp(fake_mt5):
    setup(fake_mt5, order_type="BUY", fractal_rr=0).tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).tp == 0.0


@pytest.mark.feature("ENG-22")
def test_tp_als_geldbetrag_statt_rr(fake_mt5):
    # Kontraktgröße 1000, Lot 1 → 1,0 Preiseinheit = 1000; 500 → TP-Abstand 0,5 (rr 2 wird ignoriert)
    setup(fake_mt5, order_type="BUY", lot_size=1.0, fractal_tp_by_money=True, fractal_tp_money=500).tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).tp == pytest.approx(97.6 + 0.5)


@pytest.mark.feature("ENG-22")
def test_tp_geldbetrag_null_bedeutet_kein_tp(fake_mt5):
    setup(fake_mt5, order_type="BUY", lot_size=1.0, fractal_tp_by_money=True, fractal_tp_money=0).tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).tp == 0.0


@pytest.mark.feature("ENG-22")
def test_ohne_sl_order_ohne_sl_und_rr_tp(fake_mt5):
    setup(fake_mt5, order_type="BUY", fractal_use_sl=False).tick()
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    assert buy.sl == 0.0
    assert buy.tp == 0.0  # Chance/Risiko braucht einen SL


@pytest.mark.feature("ENG-22")
def test_ohne_sl_tp_als_geldbetrag(fake_mt5):
    setup(fake_mt5, order_type="BUY", lot_size=1.0, fractal_use_sl=False,
          fractal_tp_by_money=True, fractal_tp_money=500).tick()
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    assert buy.sl == 0.0
    assert buy.tp == pytest.approx(97.6 + 0.5)


@pytest.mark.feature("ENG-22")
def test_kein_gueltiger_sl_keine_order(fake_mt5):
    # Abpraller-BUY bei 96,5 mit Puffer 0: SL = Einstieg → keine Order
    setup(fake_mt5, order_type="BUY", fractal_order_mode="rebound", fractal_sl_buffer=0).tick()
    assert fake_mt5.orders == []


@pytest.mark.feature("ENG-22")
def test_neues_gegenfraktal_aendert_nur_sl_statt_neu_zu_setzen(fake_mt5):
    h = setup(fake_mt5, order_type="BUY", fractal_sl_mode="opposite_fractal")
    h.tick()
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    ticket = buy.ticket
    # Neues unteres Fraktal bei 96,55 (Kerze 28), das obere 97,6 bleibt das jüngste
    more = FLAT + SHAPE + [(97.0, 96.6), (96.9, 96.55), (97.0, 96.6), (97.05, 96.65)]
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(more))
    h.tick()
    buy = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP)
    assert buy.ticket == ticket  # geändert (MODIFY), nicht gelöscht + neu
    assert buy.sl == pytest.approx(96.5)  # 96,55 − 0,05
    assert buy.tp == pytest.approx(97.6 + 2 * 1.1)


@pytest.mark.feature("ENG-22")
def test_tp_naeher_als_stops_level_keine_order(fake_mt5):
    # stops_level 100 Points = 0,1; SL-Abstand 0,85 ok, TP bei rr 0,1 nur 0,085 → MT5 würde ablehnen
    fake_mt5.symbols["USOUSD"].trade_stops_level = 100
    setup(fake_mt5, order_type="BUY", fractal_rr=0.1).tick()
    assert fake_mt5.orders == []
    assert fake_mt5.sent == []


# --------------------------------------------------------------------------- ENG-23
@pytest.mark.feature("ENG-23")
def test_kein_tp_sl_resync_fuer_fraktal_positionen(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    fake_mt5.set_price("USOUSD", 97.61, 97.62)  # BUY STOP 97,6 füllt
    pos = fake_mt5.robot_positions(MAGIC_ZONE_1)[0]
    pos.sl = 97.0  # elle nachgezogen
    h.tick()
    h.tick()
    assert (pos.sl, pos.tp) == pytest.approx((97.0, 99.3))
    assert fake_mt5.orders == []  # Fraktal verbraucht


@pytest.mark.feature("ENG-23")
def test_sar_zieht_sl_nur_in_gewinnrichtung(fake_mt5):
    rising = [(95.5 + 0.05 * i, 95.3 + 0.05 * i) for i in range(30)]
    h = setup(fake_mt5, rising, order_type="BUY", fractal_sl_mode="sar")
    sar = round(parabolic_sar(bars(rising), 0.02, 0.2)[0][-1], 3)
    low = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, sl=90.0, magic=MAGIC_ZONE_1)
    high = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, sl=sar + 0.1, magic=MAGIC_ZONE_1)
    h.tick()
    assert low.sl == pytest.approx(sar)
    assert high.sl == pytest.approx(sar + 0.1)


@pytest.mark.feature("ENG-23")
def test_sar_zieht_auch_bei_erreichtem_positionslimit(fake_mt5):
    rising = [(95.5 + 0.05 * i, 95.3 + 0.05 * i) for i in range(30)]
    h = setup(fake_mt5, rising, order_type="BUY", fractal_sl_mode="sar", max_positions=1)
    sar = round(parabolic_sar(bars(rising), 0.02, 0.2)[0][-1], 3)
    pos = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, sl=90.0, magic=MAGIC_ZONE_1)
    h.tick()
    assert pos.sl == pytest.approx(sar)


@pytest.mark.feature("ENG-23")
def test_positionslimit_loescht_fraktal_order(fake_mt5):
    h = setup(fake_mt5, order_type="BUY", max_positions=1)
    h.tick()
    assert fake_mt5.orders
    fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, magic=MAGIC_ZONE_1)
    h.tick()
    assert fake_mt5.orders == []
    fake_mt5.positions.clear()
    h.tick()  # vom Bot gelöscht → nicht „erledigt“, wird wieder gesetzt
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).price_open == pytest.approx(97.6)


# --------------------------------------------------------------------------- ENG-24
def _state_file():
    return get_fractal_state_path(TEST_ACCOUNT_ID)


@pytest.mark.feature("ENG-24")
def test_elle_geloeschte_order_wird_nicht_neu_gesetzt_auch_nach_neustart(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    fake_mt5.orders.clear()  # in MT5 von Hand gelöscht
    h.tick()
    h.tick()
    assert fake_mt5.orders == []
    done = json.load(open(_state_file(), encoding="utf-8"))["done"]
    assert done == {"zone-test:USOUSD:H4:U": [T0 + UP_IDX * STEP]}

    state.reset()  # Bot-Neustart
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    assert fake_mt5.orders == []

    # Ein neueres oberes Fraktal öffnet wieder eine Order
    newer = FLAT + SHAPE + [(97.2, 96.8), (97.45, 96.9), (97.3, 96.85), (97.25, 96.9)]
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(newer))
    h.tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).price_open == pytest.approx(97.45)


@pytest.mark.feature("ENG-24")
def test_elle_geschlossene_position_wird_nicht_wieder_eroeffnet(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    fake_mt5.set_price("USOUSD", 97.61, 97.62)
    h.tick()
    fake_mt5.positions.clear()  # von Hand geschlossen
    fake_mt5.set_price("USOUSD", 97.0, 97.01)  # Kurs wieder unter dem Fraktal
    h.tick()
    h.tick()
    assert fake_mt5.orders == []


@pytest.mark.feature("ENG-24")
def test_merker_gilt_je_zeitrahmen(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    fake_mt5.orders.clear()  # H4-Fraktal von Hand gelöscht → erledigt
    h.tick()
    assert fake_mt5.orders == []
    # Gleiche Kerzen auf M15 (ältere Zeitstempel als das erledigte H4-Fraktal wären sonst gesperrt)
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_M15, bars(FLAT + SHAPE))
    h.zones[0]["fractal_timeframe"] = "M15"
    h.tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).price_open == pytest.approx(97.6)


@pytest.mark.feature("ENG-24")
def test_vom_bot_geloeschte_order_zaehlt_nicht_als_manuell(fake_mt5):
    h = setup(fake_mt5, order_type="BUY")
    h.tick()
    h.zones[0]["is_active"] = False  # Zone aus → Zombie-Bereinigung löscht die Order
    h.tick()
    assert fake_mt5.orders == []
    h.zones[0]["is_active"] = True
    h.tick()
    assert order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP).price_open == pytest.approx(97.6)


# --------------------------------------------------------------------------- ENG-26
# Zweites oberes Fraktal bei 97,45 (Kerze 28) unter dem älteren 97,6 → beide unberührt
UP2_IDX = 28
TWO_UP = FLAT + SHAPE + [(97.2, 96.8), (97.45, 96.9), (97.3, 96.85), (97.25, 96.9)]
# Drittes oberes Fraktal bei 97,5 (Kerze 32): durchbricht 97,45, 97,6 bleibt unberührt
THREE_UP = TWO_UP + [(97.2, 96.9), (97.5, 96.95), (97.3, 96.9), (97.25, 96.9)]


def prices(fake_mt5, order_type):
    return sorted(round(o.price_open, 3) for o in fake_mt5.robot_orders(MAGIC_ZONE_1) if o.type == order_type)


@pytest.mark.feature("ENG-26")
def test_anzahl_zwei_setzt_orders_auf_die_letzten_zwei_fraktale(fake_mt5):
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2)
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.45, 97.6]
    assert {o.comment for o in fake_mt5.orders} == {
        f"AutoGrid_Z1_FU{T0 + UP_IDX * STEP}", f"AutoGrid_Z1_FU{T0 + UP2_IDX * STEP}",
    }
    sent = len(fake_mt5.sent)
    h.tick()
    h.tick()
    assert len(fake_mt5.sent) == sent  # stabil, kein Löschen/Neusetzen


@pytest.mark.feature("ENG-26")
def test_fenster_wandert_und_leerer_platz_wird_nicht_aufgefuellt(fake_mt5):
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2)
    h.tick()
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(THREE_UP))
    h.tick()
    # Letzte zwei: 97,5 und 97,45 (durchbrochen → Platz bleibt leer); 97,6 ist aus dem Fenster
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.5]

    h.zones[0]["fractal_order_count"] = 3
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.5, 97.6]


@pytest.mark.feature("ENG-26")
def test_ausgeloeste_order_laesst_die_anderen_stehen(fake_mt5):
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2)
    h.tick()
    older = next(o for o in fake_mt5.orders if o.price_open == pytest.approx(97.6))
    fake_mt5.set_price("USOUSD", 97.46, 97.47)  # BUY STOP 97,45 füllt
    assert len(fake_mt5.robot_positions(MAGIC_ZONE_1)) == 1
    sent = len(fake_mt5.sent)
    h.tick()
    h.tick()
    assert [o.ticket for o in fake_mt5.orders] == [older.ticket]
    assert len(fake_mt5.sent) == sent
    done = json.load(open(_state_file(), encoding="utf-8"))["done"]
    assert done == {"zone-test:USOUSD:H4:U": [T0 + UP2_IDX * STEP]}


@pytest.mark.feature("ENG-26")
def test_elle_geloeschte_order_bleibt_weg_andere_bleibt(fake_mt5):
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2)
    h.tick()
    fake_mt5.orders[:] = [o for o in fake_mt5.orders if o.price_open != pytest.approx(97.6)]  # von Hand gelöscht
    h.tick()
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.45]

    state.reset()  # Bot-Neustart
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2)
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.45]


@pytest.mark.feature("ENG-26")
def test_vom_bot_geloeschte_orders_gelten_nicht_als_erledigt(fake_mt5):
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2, max_positions=1)
    h.tick()
    # Anzahl verkleinern: die überzählige Order fällt weg …
    h.zones[0]["fractal_order_count"] = 1
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.45]
    # … und kommt beim Vergrößern wieder
    h.zones[0]["fractal_order_count"] = 2
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.45, 97.6]

    # Positionslimit: alle Orders weg, danach wieder beide
    fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, magic=MAGIC_ZONE_1)
    h.tick()
    assert fake_mt5.orders == []
    fake_mt5.positions.clear()
    h.tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.45, 97.6]
    assert not os.path.exists(_state_file())


@pytest.mark.feature("ENG-26")
def test_hinweis_merker_nur_fuer_fraktale_im_fenster(fake_mt5):
    h = setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2, max_price=97.5)  # 97,6 außerhalb
    h.tick()
    assert (0, "U", T0 + UP_IDX * STEP) in state.fractal_logged
    h.zones[0]["fractal_order_count"] = 1
    h.tick()
    assert not [k for k in state.fractal_logged if k[-1] == T0 + UP_IDX * STEP]


@pytest.mark.feature("ENG-26")
def test_getrennte_anzahl_fuer_buy_und_sell(fake_mt5):
    # Abpraller: obere Fraktale → SELL LIMIT, unteres → BUY LIMIT
    zone = dict(fractal_order_mode="rebound", sync_buy_sell=False, fractal_order_count=1, sell_fractal_order_count=2)
    setup(fake_mt5, TWO_UP, **zone).tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_SELL_LIMIT) == [97.45, 97.6]
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_LIMIT) == [96.5]

    # „Buy/Sell gleich“: die Sell-Anzahl wird ignoriert
    fake_mt5.orders.clear()
    state.reset()
    setup(fake_mt5, TWO_UP, **{**zone, "sync_buy_sell": True}).tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_SELL_LIMIT) == [97.45]


@pytest.mark.feature("ENG-26")
def test_anzahl_wird_begrenzt():
    def counts(**zone):
        cfg = extract_zone_config(fractal_zone(**zone), 0)
        return cfg.fractal_order_count, cfg.sell_fractal_order_count

    assert counts() == (1, 1)
    assert counts(fractal_order_count=99) == (20, 20)
    assert counts(fractal_order_count=0) == (1, 1)
    assert counts(fractal_order_count="x") == (1, 1)
    assert counts(fractal_order_count=None) == (1, 1)
    assert counts(fractal_order_count=float("inf")) == (1, 1)
    assert counts(fractal_order_count="5") == (5, 5)
    assert counts(sync_buy_sell=False, fractal_order_count=3) == (3, 3)  # Sell ohne eigenen Wert = Buy
    assert counts(sync_buy_sell=False, fractal_order_count=3, sell_fractal_order_count=99) == (3, 20)
    # Eigene Sell-Anzahl nur bei Richtung „Beide“
    assert counts(order_type="SELL", sync_buy_sell=False, fractal_order_count=3, sell_fractal_order_count=5) == (3, 3)


@pytest.mark.feature("ENG-26")
def test_alte_zustandsdatei_mit_einzelzeit_wird_gelesen(fake_mt5):
    os.makedirs(os.path.dirname(_state_file()), exist_ok=True)
    with open(_state_file(), "w", encoding="utf-8") as f:
        json.dump({"done": {"zone-test:USOUSD:H4:U": T0 + UP2_IDX * STEP}}, f)
    setup(fake_mt5, TWO_UP, order_type="BUY", fractal_order_count=2).tick()
    assert prices(fake_mt5, fake_mt5.ORDER_TYPE_BUY_STOP) == [97.6]
