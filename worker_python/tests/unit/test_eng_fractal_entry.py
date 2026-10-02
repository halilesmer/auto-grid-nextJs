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


@pytest.fixture(autouse=True)
def _broker_clock(fake_mt5):
    """Tik zamanı, gerçek MT5'teki gibi oluşan mumun içinde (son kapanmış mumdan hemen sonra);
    aksi halde mumlar bayat sayılır (ENG-20)."""
    fake_mt5.clock = lambda: max((b[-1]["time"] for b in fake_mt5.rates.values() if b), default=T0) + 60
    set_rates = fake_mt5.set_rates

    def set_rates_and_touch_tick(symbol, timeframe, bars_):
        set_rates(symbol, timeframe, bars_)
        tick = fake_mt5.ticks[symbol]
        tick.time_msc = int(fake_mt5.clock() * 1000)
        tick.time = tick.time_msc // 1000

    fake_mt5.set_rates = set_rates_and_touch_tick


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
def test_bayate_mumlar_setzen_keine_order(fake_mt5):
    # MT5 liefert beim ersten Abruf den alten lokalen Bestand: letzte Kerze Wochen vor dem Tick
    h = setup(fake_mt5)
    fake_mt5.clock = lambda: T0 + 60 * STEP
    fake_mt5.set_price("USOUSD", fake_mt5.ticks["USOUSD"].bid, fill=False)
    h.tick()
    assert fake_mt5.orders == []
    # Geschichte nachgeladen: Tick wieder in der laufenden Kerze → Orders kommen
    fake_mt5.clock = lambda: T0 + len(FLAT + SHAPE) * STEP + 60
    fake_mt5.set_price("USOUSD", fake_mt5.ticks["USOUSD"].bid, fill=False)
    h.tick()
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
def test_durchbrochenes_fraktal_bekommt_keine_order(fake_mt5):
    h = setup(fake_mt5, FLAT + SHAPE + [(97.7, 97.0), (97.3, 96.9)], order_type="BUY")
    h.tick()
    h.tick()
    assert fake_mt5.orders == []


@pytest.mark.feature("ENG-21")
def test_bestehende_buy_limit_bleibt_wenn_nur_der_bid_das_fraktal_beruehrt(fake_mt5):
    # Kerzen sind Bid, BUY LIMIT füllt auf Ask: Bid erreicht das untere Fraktal, Ask nicht → Order bleibt
    h = setup(fake_mt5, order_type="BUY", fractal_order_mode="rebound")
    h.tick()
    order = order_of(fake_mt5, fake_mt5.ORDER_TYPE_BUY_LIMIT)
    assert order.price_open == pytest.approx(96.5)
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(FLAT + SHAPE + [(96.9, 96.5), (96.7, 96.505)]))
    fake_mt5.set_price("USOUSD", 96.505, 96.515)
    sent = len(fake_mt5.sent)
    h.tick()
    h.tick()
    assert [o.ticket for o in fake_mt5.orders] == [order.ticket]
    assert len(fake_mt5.sent) == sent  # nicht gelöscht, nicht neu gesetzt, SL/TP nicht geändert

    fake_mt5.set_price("USOUSD", 96.49, 96.5)  # Ask erreicht die Order → füllt
    h.tick()
    assert len(fake_mt5.robot_positions(MAGIC_ZONE_1)) == 1
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
    fake_mt5.set_price("USOUSD", 97.46, 97.47)  # BUY STOP 97,45 füllt
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_H4, bars(THREE_UP))
    h.tick()
    # Letzte zwei: 97,5 und 97,45 (ausgelöst → Platz bleibt leer); 97,6 ist aus dem Fenster
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
    assert (0, 1, "U", T0 + UP_IDX * STEP) in state.fractal_logged  # (Zone, Setup, Seite, Kerzenzeit)
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


# --------------------------------------------------------------------------- ENG-28 Setups
UP_T, DOWN_T = T0 + UP_IDX * STEP, T0 + DOWN_IDX * STEP


def two_setups(fake_mt5, extra=None, **zone_overrides):
    """Setup 1 = H4 (Zonenfelder), Setup 2 = M15 mit gleichem Kursbild, 0,02 Lot und R/R 1."""
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_M15, bars(FLAT + SHAPE))
    setups = extra if extra is not None else [
        {"sid": 2, "fractal_timeframe": "M15", "lot_size": 0.02, "fractal_rr": 1.0, "max_positions": 5},
    ]
    return setup(fake_mt5, order_type="BUY", fractal_setups=setups, **zone_overrides)


def by_comment(fake_mt5):
    return {o.comment: o for o in fake_mt5.robot_orders(MAGIC_ZONE_1)}


@pytest.mark.feature("ENG-28")
def test_zwei_setups_setzen_eigene_orders(fake_mt5):
    two_setups(fake_mt5).tick()
    orders = by_comment(fake_mt5)
    assert set(orders) == {f"AutoGrid_Z1_FU{UP_T}", f"AutoGrid_Z1_F2U{UP_T}"}
    s1, s2 = orders[f"AutoGrid_Z1_FU{UP_T}"], orders[f"AutoGrid_Z1_F2U{UP_T}"]
    # Gleicher Fraktal-Preis, aber eigenes Lot und eigener TP je Setup
    assert (s1.price_open, s1.volume_initial, s1.sl, s1.tp) == pytest.approx((97.6, 0.01, 96.75, 99.3))
    assert (s2.price_open, s2.volume_initial, s2.sl, s2.tp) == pytest.approx((97.6, 0.02, 96.75, 98.45))


@pytest.mark.feature("ENG-28")
def test_gleiche_order_in_zwei_setups_bleibt_stabil(fake_mt5):
    # Gleiches Lot und gleicher TF: zwei identische Orders, jede bleibt ihrem Setup zugeordnet
    h = two_setups(fake_mt5, [{"sid": 2, "fractal_timeframe": "H4"}])
    h.tick()
    sent = len(fake_mt5.sent)
    h.tick()
    h.tick()
    assert len(fake_mt5.sent) == sent
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_FU{UP_T}", f"AutoGrid_Z1_F2U{UP_T}"}


@pytest.mark.feature("ENG-28")
def test_max_positionen_gilt_je_setup(fake_mt5):
    h = two_setups(fake_mt5, max_positions=1)
    h.tick()
    # Position von Setup 1 (ohne Kommentar → Setup 1): nur dessen Order wird gelöscht
    fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, magic=MAGIC_ZONE_1)
    h.tick()
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_F2U{UP_T}"}


@pytest.mark.feature("ENG-28")
def test_position_ueber_eroeffnungsorder_dem_setup_zugeordnet(fake_mt5):
    h = two_setups(fake_mt5, extra=[{"sid": 2, "fractal_timeframe": "M15", "lot_size": 0.02, "max_positions": 1}])
    h.tick()
    # Broker hat den Positionskommentar überschrieben; die Eröffnungsorder trägt den Setup-Kommentar
    pos = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, magic=MAGIC_ZONE_1)
    pos.comment = "[tp]"
    fake_mt5.history[pos.identifier].comment = f"AutoGrid_Z1_F2U{T0}"
    h.tick()
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_FU{UP_T}"}


@pytest.mark.feature("ENG-28")
def test_geloeschtes_setup_verliert_seine_pending_orders(fake_mt5):
    h = two_setups(fake_mt5)
    h.tick()
    h.zones[0]["fractal_setups"] = []
    h.tick()
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_FU{UP_T}"}


@pytest.mark.feature("ENG-28")
def test_erledigt_merker_je_setup(fake_mt5):
    h = two_setups(fake_mt5)
    h.tick()
    s2 = by_comment(fake_mt5)[f"AutoGrid_Z1_F2U{UP_T}"]
    fake_mt5.orders.remove(s2)  # in MT5 von Hand gelöscht
    h.tick()
    h.tick()
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_FU{UP_T}"}
    with open(_state_file(), encoding="utf-8") as f:
        done = json.load(f)["done"]
    assert done == {"zone-test:USOUSD:M15:U:S2": [UP_T]}


@pytest.mark.feature("ENG-28")
def test_ohne_setups_bleibt_alles_wie_bisher():
    cfg = extract_zone_config(fractal_zone(), 0)
    assert [s.sid for s in cfg.fractal_setups] == [1]
    s1 = cfg.fractal_setups[0]
    assert (s1.timeframe, s1.lot_size, s1.order_count, s1.rr, s1.max_positions) == ("H4", 0.01, 1, 2.0, cfg.max_positions)
    assert extract_zone_config(make_zone(), 0).fractal_setups == ()  # Grid-Zone


@pytest.mark.feature("ENG-28")
def test_setup_werte_werden_geprueft():
    def sids(setups, **zone):
        return [s.sid for s in extract_zone_config(fractal_zone(fractal_setups=setups, **zone), 0).fractal_setups]

    # Ungültige, doppelte oder fehlende Nummern werden übersprungen; höchstens 10 Zusatz-Setups
    assert sids([{"sid": 2}, {"sid": 2}, {"sid": 1}, {"sid": 0}, {"sid": 100}, {}, "x", {"sid": True}]) == [1, 2]
    assert sids([{"sid": n} for n in range(2, 20)]) == list(range(1, 12))
    assert sids("kaputt") == [1]
    s = extract_zone_config(fractal_zone(fractal_setups=[{"sid": 3, "fractal_timeframe": "XX", "fractal_order_count": 50,
                                                          "max_positions": 0}]), 0).fractal_setups[1]
    # Fehlende/ungültige Felder → Wert von Setup 1, Anzahl begrenzt, 0 Positionen = unbegrenzt
    assert (s.sid, s.timeframe, s.lot_size, s.order_count, s.rr, s.max_positions) == (3, "H4", 0.01, 20, 2.0, 500)
    # Eigenes Sell-Lot / eigene Sell-Anzahl nur ohne „Buy/Sell gleich“
    split = [{"sid": 2, "lot_size": 0.02, "sell_lot_size": 0.03, "fractal_order_count": 2, "sell_fractal_order_count": 3}]
    s = extract_zone_config(fractal_zone(fractal_setups=split, sync_buy_sell=False), 0).fractal_setups[1]
    assert (s.lot_size, s.sell_lot_size, s.order_count, s.sell_order_count) == (0.02, 0.03, 2, 3)
    s = extract_zone_config(fractal_zone(fractal_setups=split), 0).fractal_setups[1]
    assert (s.lot_size, s.sell_lot_size, s.order_count, s.sell_order_count) == (0.02, 0.02, 2, 2)


@pytest.mark.feature("ENG-28")
def test_kommentar_mit_setup_nummer():
    from src.core.grid_orders import fractal_comment, parse_fractal_comment

    assert fractal_comment(MAGIC_ZONE_1, "U", 5) == "AutoGrid_Z1_FU5"
    assert fractal_comment(MAGIC_ZONE_1, "D", 5, 12) == "AutoGrid_Z1_F12D5"
    assert len(fractal_comment(200999, "U", 1_759_400_000, 99)) <= 31
    assert parse_fractal_comment("AutoGrid_Z1_FU5") == (1, "U", 5)
    assert parse_fractal_comment("AutoGrid_Z7_F12D5") == (12, "D", 5)
    assert parse_fractal_comment("AutoGrid_Z7_F12X5") is None


@pytest.mark.feature("ENG-28")
def test_ungueltiges_setup_behaelt_seine_orders(fake_mt5):
    h = two_setups(fake_mt5)
    h.tick()
    h.zones[0]["fractal_setups"][0]["fractal_rr"] = "kaputt"  # Setup 2 wird übersprungen, nicht gelöscht
    h.tick()
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_FU{UP_T}", f"AutoGrid_Z1_F2U{UP_T}"}


@pytest.mark.feature("ENG-28")
def test_position_eines_entfernten_setups_zaehlt_fuer_setup_1(fake_mt5):
    h = setup(fake_mt5, order_type="BUY", max_positions=1)
    pos = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, magic=MAGIC_ZONE_1)
    pos.comment = f"AutoGrid_Z1_F5U{T0}"  # Setup 5 gibt es nicht mehr
    h.tick()
    assert fake_mt5.orders == []


@pytest.mark.feature("ENG-28")
def test_sar_zieht_je_setup_mit_dessen_zeitrahmen(fake_mt5):
    rising = [(95.5 + 0.05 * i, 95.3 + 0.05 * i) for i in range(30)]
    falling = [(97.5 - 0.02 * i, 97.3 - 0.02 * i) for i in range(30)]
    fake_mt5.set_rates("USOUSD", fake_mt5.TIMEFRAME_M15, bars(falling))
    h = setup(fake_mt5, rising, order_type="BUY", fractal_sl_mode="sar",
              fractal_setups=[{"sid": 2, "fractal_timeframe": "M15"}])
    sar_h4 = round(parabolic_sar(bars(rising), 0.02, 0.2)[0][-1], 3)
    p1 = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, sl=90.0, magic=MAGIC_ZONE_1)
    p2 = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 96.0, sl=90.0, magic=MAGIC_ZONE_1)
    p2.comment = f"AutoGrid_Z1_F2U{T0}"
    h.tick()
    assert p1.sl == pytest.approx(sar_h4)
    assert p2.sl == pytest.approx(90.0)  # M15-SAR fällt (Short-Trend): BUY-SL wird nicht gezogen


@pytest.mark.feature("ENG-28")
def test_entferntes_setup_mit_orders_behalten(fake_mt5):
    h = two_setups(fake_mt5)
    h.tick()
    h.zones[0]["fractal_setups"] = []
    h.zones[0]["fractal_kept_sids"] = [2]  # beim Entfernen „Orders behalten“ gewählt
    h.tick()
    h.tick()
    assert set(by_comment(fake_mt5)) == {f"AutoGrid_Z1_FU{UP_T}", f"AutoGrid_Z1_F2U{UP_T}"}
