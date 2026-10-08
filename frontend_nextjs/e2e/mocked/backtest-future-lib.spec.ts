/**
 * Kein Blick in die Zukunft (docs/analyse-regeln.md §5), TypeScript-Teil von BKT-09: wer alle Kurse ab einem
 * Zeitpunkt k ändert, ändert nichts, was vor k geschah. Zwei Ebenen:
 * - Bot-Nachbau: jedes Szenario der Musterlösungen, wie worker_python/tests/unit/test_parity_golden.py
 *   (test_spaetere_kurse_aendern_fruehere_entscheidungen_nicht);
 * - Rechner: Kerzenlauf mit Pfadmodell, höheren Zeitrahmen und Kosten (Trades und Equity vor k bleiben gleich).
 * BKT-09 Zukunftsdaten-Test
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol } from '../../src/lib/backtest/broker/costs';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import { pyRound } from '../../src/lib/backtest/engine/pyRound';
import { candleWaypoints, waypointTimes } from '../../src/lib/backtest/candles/pathModel';
import type { ZoneDict } from '../../src/lib/backtest/engine/types';
import { runBacktest } from '../../src/lib/backtest/runner';
import { loadScenario, runScenario, scenarioNames, type Scenario } from '../fixtures/parity';

/** Fester Zufall (mulberry32), aus dem Szenarionamen gesät: jeder Lauf prüft dieselben Kurse */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.describe('Bot-Nachbau: spätere Kurse ändern frühere Entscheidungen nicht', () => {
  for (const name of scenarioNames()) {
    test(`Szenario ${name}`, { tag: '@BKT-09' }, () => {
      const scenario = loadScenario(name);
      const original = runScenario(scenario);
      const random = seeded(name);
      const n = scenario.ticks.length;
      const firstAction = original.find((e) => e.ev === 'place' || e.ev === 'market')?.i ?? 0;
      // Rauschen nach einem und nach zwei Dritteln und ein harter Sprung direkt nach der ersten Bot-Aktion
      const cuts: [number, number | null][] = [
        [Math.floor(n / 3), null],
        [Math.floor((2 * n) / 3), null],
        [Math.min(firstAction + 1, n - 1), 1.5],
      ];
      for (const [k, shift] of cuts) {
        const changed: Scenario = structuredClone(scenario);
        for (let i = k; i < n; i++) {
          const jump = shift ?? (random() * 1.2 - 0.6);
          changed.ticks[i][1] = pyRound(changed.ticks[i][1] + jump, 3);
        }
        const events = runScenario(changed);
        expect(events.filter((e) => e.i < k)).toEqual(original.filter((e) => e.i < k));
        // Die Änderung wirkt danach wirklich (sonst prüft der Test nichts). Ohne Wirkung ist nur erlaubt, wenn der
        // Bot ab k ohnehin nichts mehr tut (zum Beispiel alle Positionen offen bis zum Ende): dann gibt es nichts zu ändern.
        if (JSON.stringify(events) === JSON.stringify(original)) {
          expect(original.some((e) => e.i >= k)).toBe(false);
        }
      }
    });
  }
});

const DETAIL = {
  name: 'XAUUSD',
  digits: 2,
  point: 0.01,
  volume_min: 0.01,
  volume_max: 50,
  volume_step: 0.01,
  trade_mode: 4,
  currency_base: 'XAU',
  currency_profit: 'USD',
  currency_margin: 'XAU',
  trade_tick_value: 1,
  trade_tick_size: 0.01,
  trade_contract_size: 100,
  trade_calc_mode: 2,
  trade_tick_value_profit: 1,
  trade_tick_value_loss: 1,
  swap_mode: 4,
  swap_long: -6.5,
  swap_short: 2,
  swap_rollover3days: 3,
  spread: 20,
  trade_stops_level: 0,
};

const ZONE = {
  id: 'z1',
  symbol: 'XAUUSD',
  order_type: 'BOTH',
  min_price: 2600,
  max_price: 2700,
  grid_step: 1,
  lot_size: 0.1,
  take_profit: 1,
  stop_loss: 3,
  sell_grid_step: 1,
  sell_lot_size: 0.1,
  sell_take_profit: 1,
  sell_stop_loss: 3,
  is_breakout: false,
  pullback_distance: 0.5,
  sell_pullback_distance: 0.5,
  sync_buy_sell: true,
  levels_below: 2,
  levels_above: 2,
  max_positions: 10,
  clear_on_exit: false,
  clear_exit_side: 'Farketmez',
  clear_scope: 'Sadece Bekleyen Emirler',
  clear_target_side: 'Farketmez (Hepsi)',
  exit_condition: 'Anlık Fiyat',
  exit_timeframe: 'M15',
};

const START = 1_791_331_200 + 8 * 3600;
const CANDLES = 240;

/** Schwingender Kurs um 2650 mit Hoch/Tief je Kerze; ab Kerze `from` um `offset` verschoben */
function candles(from = CANDLES, offset = 0): LoadedRates {
  const t = new Float64Array(CANDLES);
  const o = new Float64Array(CANDLES);
  const h = new Float64Array(CANDLES);
  const l = new Float64Array(CANDLES);
  const c = new Float64Array(CANDLES);
  for (let i = 0; i < CANDLES; i++) {
    const shift = i >= from ? offset : 0;
    const open = 2650 + 4 * Math.sin(i / 5) + shift;
    const close = open + 1.3 * Math.cos(i * 1.7);
    t[i] = START + i * 60;
    o[i] = Math.round(open * 100) / 100;
    c[i] = Math.round(close * 100) / 100;
    h[i] = Math.round((Math.max(o[i], c[i]) + 0.45) * 100) / 100;
    l[i] = Math.round((Math.min(o[i], c[i]) - 0.45) * 100) / 100;
  }
  return { t, o, h, l, c, s: new Float64Array(CANDLES).fill(20), missing: [], digits: 2, point: 0.01, liveFrom: null };
}

test.describe('Rechner: spätere Kerzen ändern frühere Ergebnisse nicht', () => {
  const result = snapshotSymbol(DETAIL as never, { swapEnabled: true, approximate: false });
  if (!('snapshot' in result)) throw new Error('Schnappschuss');
  /** Grid und Fraktal (M5 aus M1-Kerzen, mit 40 Minuten Vorlauf): beide lesen Kerzen, das Fraktal die höheren Zeitrahmen */
  const ZONES = {
    grid: { zone: ZONE, offset: 0 },
    fractal: {
      zone: { ...ZONE, entry_mode: 'fractal', fractal_timeframe: 'M5', fractal_order_mode: 'breakout', fractal_sl_mode: 'buffer', fractal_sl_buffer: 0.3, fractal_rr: 0.6 },
      offset: 40,
    },
  };
  const run = (zone: ZoneDict, offset: number, rates: LoadedRates, path: 'auto' | 'lowFirst' | 'highFirst') =>
    runBacktest({
      zone,
      snapshot: result.snapshot,
      rates,
      dataTimeframe: 'M1',
      from: START + offset * 60,
      to: START + CANDLES * 60,
      spread: { mode: 'candle' },
      commissionPerLot: 4,
      model: { fill: 'gap', slFirst: false, path, closeAtEnd: false },
      startCapital: 10_000,
    });

  /**
   * Mitten in der Kerze: Ändert man nur den zweiten Teil des Wegs (nach dem ersten Extrem: bei steigender Kerze Hoch und
   * Schluss, bei fallender Tief und Schluss), bleibt alles gleich, was der Bot bis zu diesem Extrem tat.
   */
  function changeTail(rates: LoadedRates, i: number): void {
    const rising = rates.c[i] >= rates.o[i];
    const delta = rising ? 3 : -3;
    if (rising) rates.h[i] = Math.round((rates.h[i] + delta) * 100) / 100;
    else rates.l[i] = Math.round((rates.l[i] + delta) * 100) / 100;
    rates.c[i] = Math.round((rates.c[i] + delta) * 100) / 100;
  }

  for (const [kind, { zone, offset }] of Object.entries(ZONES)) {
    test(`${kind}: der zweite Teil des Kerzenwegs ändert nichts, was vorher geschah`, { tag: '@BKT-09' }, () => {
      test.setTimeout(90_000);
      const original = run(zone, offset, candles(), 'auto');
      let changedAfter = 0;
      for (let i = 100; i < 116; i++) {
        const base = candles();
        const rates = candles();
        changeTail(rates, i);
        const way = candleWaypoints(base.o[i], base.h[i], base.l[i], base.c[i], 'auto');
        if (way.length < 4) continue;
        // Die Zeit im Weg folgt der Weglänge: das erste Extrem liegt in beiden Läufen zu anderer Uhrzeit
        const cutOf = (r: LoadedRates) => waypointTimes(candleWaypoints(r.o[i], r.h[i], r.l[i], r.c[i], 'auto'), r.t[i], r.t[i] + 59)[1];
        const tCut = cutOf(base);
        const tCutChanged = cutOf(rates);
        const changed = run(zone, offset, rates, 'auto');
        // Meldungen des Bots (Code und Werte) und Trades bis zum ersten Extrem sind gleich
        const strip = (lines: typeof original.log.lines) => lines.map((l) => [l.level, l.code, l.params]);
        const before = (r: typeof original, cut: number) => ({
          lines: strip(r.log.lines.filter((l) => (l.time ?? 0) < cut)),
          trades: r.trades.filter((t) => t.exitTime < cut).map((t) => [t.entryPrice, t.exitPrice, t.profit, t.net]),
        });
        expect(before(changed, tCutChanged)).toEqual(before(original, tCut));
        if (JSON.stringify(strip(changed.log.lines)) !== JSON.stringify(strip(original.log.lines)) || changed.summary.endEquity !== original.summary.endEquity) {
          changedAfter += 1;
        }
      }
      // Die Änderung wirkt danach wirklich (sonst prüft der Test nichts)
      expect(changedAfter).toBeGreaterThan(3);
    });

    for (const path of ['auto', 'lowFirst', 'highFirst'] as const) {
      for (const cut of [110, 170]) {
        test(`${kind}, Weg ${path}, Änderung ab Kerze ${cut}`, { tag: '@BKT-09' }, () => {
          const original = run(zone, offset, candles(), path);
          const changed = run(zone, offset, candles(cut, 7.5), path);
          const tCut = START + cut * 60;
          // Es gibt Handel vor und nach dem Schnitt (sonst prüft der Test nichts)
          const before = original.trades.filter((t) => t.exitTime < tCut);
          expect(before.length).toBeGreaterThan(0);
          expect(original.trades.length).toBeGreaterThan(before.length);
          // Trades und Equity vor dem Schnitt sind gleich
          expect(changed.trades.filter((t) => t.exitTime < tCut)).toEqual(before);
          expect(changed.equity.filter((p) => p.time < tCut)).toEqual(original.equity.filter((p) => p.time < tCut));
          // Danach wirkt die Änderung
          expect(changed.equity.filter((p) => p.time >= tCut)).not.toEqual(original.equity.filter((p) => p.time >= tCut));
        });
      }
    }
  }
});
