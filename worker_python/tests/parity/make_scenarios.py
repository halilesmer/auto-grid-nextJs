"""Erzeugt die Szenarien der Musterlösungen (tests/parity/scenarios/*.json).

    .venv/bin/python -m tests.parity.make_scenarios

Kurswege sind fest (Wegpunkte + Zufall mit festem Startwert), damit die Dateien bei jedem Lauf
gleich bleiben. Nach einer Änderung hier: Szenarien neu erzeugen und die Musterlösungen mit
`pytest tests/unit/test_parity_golden.py --update-golden` neu schreiben.
"""
from __future__ import annotations

import json
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


def fractal_zone(**overrides):
    base = dict(entry_mode="fractal", order_type="BOTH", fractal_timeframe="M15", fractal_order_mode="breakout",
                fractal_sl_mode="buffer", fractal_sl_buffer=0.05, fractal_rr=2.0)
    base.update(overrides)
    return make_zone(**base)


OSC = [97.0, 96.6, 97.2, 96.7, 97.4, 96.9, 97.1]


def scenarios() -> dict[str, dict]:
    s = {}

    def add(name, description, zones, ticks, history=None):
        s[name] = {"name": name, "description": description, "symbol": SYMBOL, "start": START,
                   "zones": zones, "history": history or {}, "ticks": ticks}

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
    add("grid_breakout", "Ausbruchsmodus mit Pullback",
        [make_zone(id="z1", order_type="BOTH", is_breakout=True, pullback_distance=0.3,
                   sell_pullback_distance=0.3)], walk([97.0, 97.6, 97.2, 96.4, 96.9], seed=8))
    add("grid_step_by_loss", "Abstand wächst mit Verlustpositionen (step_by_loss)",
        [make_zone(id="z1", order_type="BUY", step_by_loss=True)], walk([97.0, 96.3, 96.9], seed=9))
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
