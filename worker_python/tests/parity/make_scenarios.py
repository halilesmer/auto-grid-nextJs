"""Erzeugt die Szenarien der Musterlösungen (tests/parity/scenarios/*.json).

    .venv/bin/python -m tests.parity.make_scenarios

Kurswege sind fest (Wegpunkte + Zufall mit festem Startwert), damit die Dateien bei jedem Lauf
gleich bleiben. Nach einer Änderung hier: Szenarien neu erzeugen und die Musterlösungen mit
`pytest tests/unit/test_parity_golden.py --update-golden` neu schreiben, mit Python 3.11 wie der Worker und CI:
ab 3.12 summiert sum() kompensiert, der ATR (fractal_signals.atr) weicht dann um 1 ulp ab.
"""
from __future__ import annotations

import json
import copy
import random

from tests.helpers import make_zone
from tests.parity.runner import SCENARIOS

START = 1_790_553_600  # Montag 28.09.2026 00:00 (MT5-Zeit)
SYMBOL = {"name": "USOUSD", "digits": 3, "point": 0.001, "spread_points": 10, "trade_contract_size": 1000.0}
TICK_SEC = 5


def walk(points, step=0.02, seed=1, noise=0.0, every=TICK_SEC, digits=3):
    """Ticks entlang der Wegpunkte (Kurs), je Tick höchstens `step` weiter, optional mit Rauschen."""
    rng = random.Random(seed)
    ticks, t = [], 0
    price = points[0]
    ticks.append([t, round(price, digits)])
    for target in points[1:]:
        while abs(target - price) > 1e-9:
            move = max(-step, min(step, target - price))
            price += move
            t += every
            jitter = rng.uniform(-noise, noise) if noise else 0.0
            ticks.append([t, round(price + jitter, digits)])
    return ticks


def history_bars(tf_sec: int, count: int, start=START, base=97.0, seed=7, shape=None):
    """Abgeschlossene Kerzen vor dem Start (alt → neu); `shape` setzt einzelne (high, low) am Ende."""
    rng = random.Random(seed)
    bars = []
    for i in range(count):
        t = start - (count - i) * tf_sec
        mid = base + rng.uniform(-0.05, 0.05)
        high, low = mid + 0.1, mid - 0.1
        bars.append({"time": t, "open": round(mid, 3), "high": round(high, 3), "low": round(low, 3),
                     "close": round(mid + rng.uniform(-0.05, 0.05), 3), "tick_volume": 10, "spread": 10})
    for offset, (high, low) in enumerate(shape or []):
        bar = bars[len(bars) - len(shape) + offset]
        bar["high"], bar["low"] = high, low
        bar["open"] = bar["close"] = round((high + low) / 2, 3)
    return bars


FRACTAL_SHAPE = [(97.3, 96.9), (97.4, 96.95), (97.6, 96.8), (97.5, 96.7), (97.3, 96.5), (97.2, 96.6), (97.1, 96.7)]
# Je Seite zwei noch nicht erreichte Fraktale (B3): oben 97,8 und 97,45, unten 96,4 und 96,6. Ein jüngeres
# Fraktal unter einem älteren oberen (über einem älteren unteren) würde das ältere schon verbrauchen.
FRACTAL_SHAPE_TWO = [(97.5, 96.9), (97.6, 96.8), (97.8, 96.75), (97.4, 96.4), (97.3, 96.7), (97.45, 96.8),
                     (97.3, 96.6), (97.2, 96.7), (97.15, 96.75)]


def fractal_zone(**overrides):
    base = dict(entry_mode="fractal", order_type="BOTH", fractal_timeframe="M15", fractal_order_mode="breakout",
                fractal_sl_mode="buffer", fractal_sl_buffer=0.05, fractal_rr=2.0)
    base.update(overrides)
    return make_zone(**base)


OSC = [97.0, 96.6, 97.2, 96.7, 97.4, 96.9, 97.1]

# Ausstiegs-Standard einer neuen Zone in der Oberfläche (frontend_nextjs/src/utils/zoneHelpers.ts, defaultZone)
UI_CLEAR = {"clear_on_exit": True, "clear_exit_side": "SELL (Aşağı)", "clear_scope": "Sadece Bekleyen Emirler",
            "clear_target_side": "Sadece BUY İşlemleri"}


def scenarios() -> dict[str, dict]:
    s = {}

    def add(name, description, zones, ticks, history=None, symbol=None):
        s[name] = {"name": name, "description": description, "symbol": {**SYMBOL, **(symbol or {})},
                   "start": START, "zones": zones, "history": history or {}, "ticks": ticks}

    add("grid_buy", "BUY-Grid, Kurs pendelt: Füllungen, TP, Nachziehen des Grids",
        [make_zone(id="z1", order_type="BUY")], walk(OSC, seed=1))
    add("grid_sell", "SELL-Grid mit TP 0,2",
        [make_zone(id="z1", order_type="SELL", take_profit=0.2, sell_take_profit=0.2)], walk(OSC, seed=2))
    add("grid_both_sync", "BUY und SELL gemeinsam (sync_buy_sell)",
        [make_zone(id="z1", order_type="BOTH")], walk(OSC, seed=3))
    add("grid_both_own_sell", "BOTH ohne Sync: SELL mit eigenem Abstand und Lot",
        [make_zone(id="z1", order_type="BOTH", sync_buy_sell=False, sell_grid_step=0.15, sell_lot_size=0.02,
                   sell_take_profit=0.15)], walk(OSC, seed=4))
    add("grid_buy_stop_loss", "BUY-Grid mit SL, Kurs fällt durch",
        [make_zone(id="z1", order_type="BUY", stop_loss=0.3)], walk([97.0, 96.2, 96.8], seed=5))
    add("grid_max_positions", "Höchstens 3 Positionen, Kurs fällt weit",
        [make_zone(id="z1", order_type="BUY", max_positions=3)], walk([97.0, 96.0, 96.4], seed=6))
    add("grid_max_positions_unlimited", "max_positions 0 = ohne Grenze (500): Kurs fällt über 15 Stufen",
        [make_zone(id="z1", order_type="BUY", max_positions=0)], walk([97.0, 95.4, 95.8], seed=25))
    add("grid_lot_below_min", "volume_min/volume_step 0,1: BUY-Lot 0,05 wird 0,1, SELL-Lot 0,25 rastet auf die Stufe",
        [make_zone(id="z1", order_type="BOTH", sync_buy_sell=False, lot_size=0.05, sell_lot_size=0.25,
                   sell_grid_step=0.15, sell_take_profit=0.15)],
        walk(OSC, seed=26), symbol={"volume_min": 0.1, "volume_step": 0.1})
    add("grid_sell_lot_empty", "BOTH ohne Sync, sell_lot_size leer: SELL nimmt das BUY-Lot 0,03",
        [make_zone(id="z1", order_type="BOTH", sync_buy_sell=False, lot_size=0.03, sell_lot_size="",
                   sell_grid_step=0.15, sell_take_profit=0.15)], walk(OSC, seed=27))
    add("grid_sync_ignores_sell", "BOTH mit Sync: alle sell_*-Felder (Abstand, Lot, TP, SL) werden ignoriert",
        [make_zone(id="z1", order_type="BOTH", sell_grid_step=0.25, sell_lot_size=None, sell_take_profit=0.3,
                   sell_stop_loss=0.2)], walk(OSC, seed=28))
    add("grid_breakout", "Ausbruchsmodus mit Pullback",
        [make_zone(id="z1", order_type="BOTH", is_breakout=True, pullback_distance=0.3,
                   sell_pullback_distance=0.3)], walk([97.0, 97.6, 97.2, 96.4, 96.9], seed=8))
    add("grid_step_by_loss", "Abstand wächst mit Verlustpositionen (step_by_loss)",
        [make_zone(id="z1", order_type="BUY", step_by_loss=True)], walk([97.0, 96.3, 96.9], seed=9))
    add("grid_stops_level", "Stops Level 50 Points, TP 0,03: der Broker-Abstand verschiebt TP der Orders, "
        "danach TP-Abgleich der Positionen (sltp) erst, wenn der neue TP nicht auf der falschen Seite liegt",
        [make_zone(id="z1", order_type="BOTH", take_profit=0.03, levels_below=1, levels_above=1)],
        walk(OSC, step=0.07, seed=23),
        symbol={"trade_stops_level": 50})
    add("grid_step_by_loss_tick_value", "step_by_loss mit Tick-Wert (3,0 je 0,01 → 300 je Preiseinheit), "
        "BOTH ohne Sync: SELL rechnet mit eigenem Lot; Abstände auf Points gerundet",
        [make_zone(id="z1", order_type="BOTH", step_by_loss=True, sync_buy_sell=False, grid_step=0.5,
                   take_profit=0.4, stop_loss=1.5, sell_grid_step=0.5, sell_lot_size=0.02,
                   sell_take_profit=0.4, sell_stop_loss=1.5)],
        walk(OSC, seed=24), symbol={"trade_tick_value": 3.0, "trade_tick_size": 0.01})
    add("grid_start_outside_no_clear", "Start über der Zone, ohne clear_on_exit: Eintritt, Austritt nach oben "
        "ohne Aufräumen, Wiedereintritt",
        [make_zone(id="z1", order_type="BUY", min_price=96.5, max_price=97.5)],
        walk([97.9, 96.8, 97.9, 97.1], seed=30))
    add("grid_noise", "BOTH-Grid mit verrauschtem Kurs (viele kleine Bewegungen)",
        [make_zone(id="z1", order_type="BOTH")], walk(OSC, step=0.01, seed=10, noise=0.015))
    add("exit_clear_pending", "Kurs verlässt die Zone nach oben: Pending Orders löschen, AUTO_CLEAR",
        [make_zone(id="z1", order_type="BUY", min_price=96.0, max_price=97.5, clear_on_exit=True)],
        walk([97.0, 96.7, 97.8, 97.3], seed=11))
    add("exit_clear_all_sell_side", "Ausstieg nach unten, alles schließen, nur SELL-Ausgang zählt",
        [make_zone(id="z1", order_type="BOTH", min_price=96.5, max_price=98.0, clear_on_exit=True,
                   clear_scope="Tüm İşlemler", clear_exit_side="SELL (Aşağı)")],
        walk([97.0, 96.8, 96.2, 96.9], seed=12))
    add("exit_candle_close", "Ausstieg erst bei Schlusskurs der M1-Kerze außerhalb",
        [make_zone(id="z1", order_type="BUY", min_price=96.0, max_price=97.5, clear_on_exit=True,
                   exit_condition="Mum Kapanışı", exit_timeframe="M1")],
        walk([97.0, 97.6, 97.4, 97.7, 97.7], seed=13, every=10))
    add("exit_ui_default_up", "UI-Standard, Ausstieg nach oben: Seite passt nicht, kein Löschen, trotzdem "
        "AUTO_CLEAR; die Orders löscht der nächste Tick (clean_zombie_orders)",
        [make_zone(id="z1", order_type="BUY", min_price=96.0, max_price=97.5, **UI_CLEAR)],
        walk([97.0, 96.7, 97.8, 97.3], seed=20))
    add("exit_ui_default_down", "UI-Standard, Ausstieg nach unten: nur BUY-Orders sofort löschen, "
        "SELL-Orders erst im nächsten Tick",
        [make_zone(id="z1", order_type="BOTH", min_price=96.8, max_price=98.0, **UI_CLEAR)],
        walk([97.0, 96.6, 97.0], seed=21))
    add("exit_up_sell_only_all", "Ausstieg nach oben, alles schließen, nur SELL: BUY-Positionen bleiben offen",
        [make_zone(id="z1", order_type="BOTH", min_price=96.0, max_price=97.5, take_profit=1.0, max_positions=20,
                   clear_on_exit=True, clear_exit_side="BUY (Yukarı)", clear_scope="Tüm İşlemler",
                   clear_target_side="Sadece SELL İşlemleri")],
        walk([97.0, 96.75, 97.35, 97.8, 97.3], seed=22))
    add("exit_stored_magic", "Zone mit gespeicherter magic 200007: Orders, Ausstieg und Aufräumen über diese magic",
        [make_zone(id="z1", magic=200007, order_type="BUY", min_price=96.0, max_price=97.5, clear_on_exit=True)],
        walk([97.0, 96.7, 97.8, 97.3], seed=29))
    add("instant_entry", "Sofort-Einstieg mit 30-s-Bremse, TP schließt, neuer Einstieg",
        [make_zone(id="z1", order_type="BUY", instant_entry=True, take_profit=0.05)],
        walk([97.0, 97.1, 96.9, 97.2, 96.95], step=0.01, seed=14))
    hist = {"M15": history_bars(900, 30, shape=FRACTAL_SHAPE)}
    add("fractal_breakout_buffer", "Fraktal-Ausbruch (Stop), SL Kerze ± Puffer, TP 2R",
        [fractal_zone(id="z1")], walk([97.0, 97.65, 97.0, 96.45, 96.8], step=0.01, seed=15, every=20), hist)
    add("fractal_rebound_opposite", "Fraktal-Dönüş (Limit), SL am gegenüberliegenden Fraktal",
        [fractal_zone(id="z1", fractal_order_mode="rebound", fractal_sl_mode="opposite_fractal")],
        walk([97.0, 97.65, 97.0, 96.45, 96.8], step=0.01, seed=16, every=20), hist)
    add("fractal_atr_count2", "Fraktal mit ATR-SL und zwei Orders je Richtung, neue Fraktale entstehen",
        [fractal_zone(id="z1", fractal_sl_mode="atr", fractal_order_count=2, sell_fractal_order_count=2)],
        walk([97.0, 97.3, 96.8, 97.5, 96.6, 97.0, 97.8, 97.1], step=0.01, seed=17, every=30), hist)
    add("fractal_sar_money_tp", "Fraktal mit SAR-SL und TP als Geldbetrag",
        [fractal_zone(id="z1", fractal_sl_mode="sar", fractal_tp_by_money=True, fractal_tp_money=5.0)],
        walk([97.0, 97.65, 97.9, 97.2], step=0.01, seed=18, every=20), hist)
    hist2 = {"M15": history_bars(900, 30, shape=FRACTAL_SHAPE_TWO)}
    add("fractal_next_loss_pips", "ENG-30 Abstand: nach der Füllung bei 97,45 wird die BUY STOP 97,8 gelöscht "
        "und erst neu gesetzt, wenn der Kurs 0,3 gegen die Position läuft; am Ende SL-Ausstiege",
        [fractal_zone(id="z1", order_type="BUY", fractal_order_count=2, fractal_next_loss=0.3,
                      fractal_next_loss_mode="pips")],
        walk([97.0, 97.5, 97.1, 97.9, 96.6], step=0.01, seed=31, every=20), hist2)
    add("fractal_next_loss_money", "ENG-30 Betrag: FakeMT5 rechnet keinen Gewinn (0), die Grenze 1,0 wird nie "
        "erreicht: die BUY STOP 97,8 kommt erst nach dem SL-Ausstieg der Position wieder",
        [fractal_zone(id="z1", order_type="BUY", fractal_order_count=2, fractal_next_loss=1.0)],
        walk([97.0, 97.5, 96.7, 97.9], step=0.01, seed=32, every=20), hist2)
    add("fractal_max_positions", "max_positions 1: nach der Füllung alle Fraktal-Orders löschen, nach dem SL-Ausstieg "
        "wieder setzen (ohne das erledigte Fraktal)",
        [fractal_zone(id="z1", fractal_order_count=2, max_positions=1)],
        walk([97.0, 97.5, 96.7, 96.5, 96.9], step=0.01, seed=33, every=20), hist2)
    add("fractal_bid_touch_kept", "Rebound BUY LIMIT 96,5: der Bid berührt die Stufe, der Ask nicht; die Order "
        "bleibt stehen und füllt später (Fix PR #97)",
        [fractal_zone(id="z1", order_type="BUY", fractal_order_mode="rebound")],
        walk([97.0, 96.6, 96.5, 96.505, 96.6, 96.49, 96.7], step=0.005, seed=34, every=20), hist)
    add("fractal_stops_level", "Stops Level 100 Points, ohne SL: BUY STOP wartet, bis der Kurs weit genug weg ist; "
        "SELL (Lot 0,02, TP 1,5 als Betrag = 0,075) nie, weil der TP zu nah am Einstieg liegt",
        [fractal_zone(id="z1", sync_buy_sell=False, sell_lot_size=0.02, fractal_use_sl=False,
                      fractal_tp_by_money=True, fractal_tp_money=1.5)],
        walk([97.4, 97.42, 97.2, 97.6, 97.3], step=0.01, seed=35, every=20), hist2,
        symbol={"trade_stops_level": 100})
    add("fractal_live_m1", "M1 ohne Historie: keine Order, bis 6 Kerzen da sind; danach Fraktale aus den Ticks",
        [fractal_zone(id="z1", fractal_timeframe="M1")], walk(OSC, step=0.01, seed=36))
    add("fractal_atr_fallback", "ATR-Periode 40 bei 30 Kerzen: kein ATR, SL aus Kerze ± Puffer; rr 0 = kein TP",
        [fractal_zone(id="z1", fractal_sl_mode="atr", fractal_atr_period=40, fractal_rr=0)],
        walk([97.0, 97.65, 97.0, 96.45, 96.8], step=0.01, seed=37, every=20), hist)
    add("fractal_sl_invalid", "Rebound BUY LIMIT, zwei Orders, ATR-Periode 25, Puffer 0: das ältere Fraktal 96,4 hat "
        "keinen ATR und kein gültiges SL (keine Order), das jüngere 96,6 bekommt den ATR-SL",
        [fractal_zone(id="z1", order_type="BUY", fractal_order_mode="rebound", fractal_sl_mode="atr",
                      fractal_atr_period=25, fractal_sl_buffer=0, fractal_order_count=2)],
        walk([97.0, 96.55, 97.0, 97.8], step=0.01, seed=38, every=20), hist2)
    add("fractal_sell_count_range", "BOTH ohne Sync: BUY 2 Orders, SELL 1 Order mit Lot 0,02; das obere Fraktal "
        "97,8 liegt über max_price 97,7 und bekommt keine Order",
        [fractal_zone(id="z1", sync_buy_sell=False, sell_lot_size=0.02, fractal_order_count=2,
                      sell_fractal_order_count=1, min_price=96.0, max_price=97.7)],
        walk([97.0, 96.55, 97.5, 97.0], step=0.01, seed=39, every=20), hist2)
    add("fractal_done_after_fill", "Der Ask füllt die BUY STOP 97,45, der Bid bleibt bei 97,44: das Fraktal ist laut "
        "Kerzen nicht erreicht, gilt nach der Füllung aber als erledigt; nach dem SL-Ausstieg keine neue Order; rr 1,5",
        [fractal_zone(id="z1", order_type="BUY", fractal_rr=1.5)],
        walk([97.0, 97.44, 96.7, 97.2], step=0.01, seed=40, every=20), hist2)
    # Neue Einheiten erhalten denselben physischen Abstand wie das alte Szenario.
    ticks = copy.deepcopy(s["fractal_next_loss_pips"])
    ticks["name"] = "fractal_next_loss_ticks"
    ticks["description"] = "ENG-30: 3 Broker-Ticks à 0,1; exakte Grenze öffnet bei Tick 85"
    ticks["symbol"].update(trade_calc_mode=2, trade_tick_size=0.1)
    ticks["zones"][0].update(fractal_next_loss=3, fractal_next_loss_unit_version=1)
    s[ticks["name"]] = ticks

    forex = copy.deepcopy(ticks)
    forex["name"] = "fractal_next_loss_forex"
    forex["description"] = "ENG-30: EURUSD 3 echte Pips à 0,0001; exakte Grenze bei Tick 85"
    forex["symbol"].update(name="EURUSD", digits=5, point=0.00001, spread_points=1,
                            trade_calc_mode=0, trade_tick_size=0.00001, trade_contract_size=100000.0)
    price = lambda value: round(1.1 + (value - 97) * 0.001, 5)
    forex["ticks"] = [[dt, price(bid)] for dt, bid in forex["ticks"]]
    for history in forex["history"].values():
        for bar in history:
            for field in ("open", "high", "low", "close"):
                bar[field] = price(bar[field])
    zone = forex["zones"][0]
    zone["symbol"] = "EURUSD"
    zone["min_price"], zone["max_price"] = price(zone["min_price"]), price(zone["max_price"])
    zone["fractal_sl_buffer"] *= 0.001
    s[forex["name"]] = forex
    return s


def main():
    SCENARIOS.mkdir(exist_ok=True)
    for old in SCENARIOS.glob("*.json"):
        old.unlink()
    for name, scenario in scenarios().items():
        (SCENARIOS / f"{name}.json").write_text(json.dumps(scenario, indent=1) + "\n", encoding="utf-8")
    print(f"{len(scenarios())} Szenarien geschrieben nach {SCENARIOS}")


if __name__ == "__main__":
    main()
