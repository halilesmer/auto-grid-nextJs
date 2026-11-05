/**
 * Backtest nie optimistischer als live (BKT-17): konservativer Spread, SL-Schlupf, Startzustand.
 * Befunde: Ursache 200044 (Rollover-Spread), 200050 (SL-Schlupf), Fraktal 200054/200058 (Vorpositionen).
 * BKT-17 Backtest-Engine ohne Vorteil gegenüber live
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol } from '../../src/lib/backtest/broker/costs';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import type { ZoneDict } from '../../src/lib/backtest/engine/types';
import { runBacktest, type RunInput, type RunModel } from '../../src/lib/backtest/runner';

const DETAIL = {
  name: 'XAUUSD', digits: 2, point: 0.01, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_mode: 4,
  currency_base: 'XAU', currency_profit: 'USD', currency_margin: 'XAU', trade_tick_value: 1, trade_tick_size: 0.01,
  trade_contract_size: 100, trade_calc_mode: 2, trade_tick_value_profit: 1, trade_tick_value_loss: 1, swap_mode: 4,
  swap_long: -6.5, swap_short: 2, swap_rollover3days: 3, spread: 20, trade_stops_level: 0,
};
const result = snapshotSymbol(DETAIL as never, { swapEnabled: false, approximate: false });
if (!('snapshot' in result)) throw new Error('Schnappschuss');
const SNAP = result.snapshot;

const ZONE: ZoneDict = {
  id: 'z1', symbol: 'XAUUSD', order_type: 'BUY', min_price: 2600, max_price: 2700, grid_step: 1, lot_size: 0.1,
  take_profit: 1, stop_loss: 0, sell_grid_step: 1, sell_lot_size: 0.1, sell_take_profit: 1, sell_stop_loss: 0,
  is_breakout: false, pullback_distance: 0.5, sell_pullback_distance: 0.5, sync_buy_sell: true, levels_below: 2,
  levels_above: 2, max_positions: 10, clear_on_exit: false, clear_exit_side: 'Farketmez',
  clear_scope: 'Sadece Bekleyen Emirler', clear_target_side: 'Farketmez (Hepsi)', exit_condition: 'Anlık Fiyat',
  exit_timeframe: 'M15',
};
const T0 = 1_791_331_200 + 10 * 3600;
const MODEL: RunModel = { fill: 'gap', slFirst: false, path: 'auto', closeAtEnd: true };

/** Zeilen: [Zeit, Eröffnung, Hoch, Tief, Schluss, Spread in Punkten] */
function candles(rows: number[][]): LoadedRates {
  const col = (i: number) => Float64Array.from(rows.map((r) => r[i]));
  return { t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: col(5), missing: [], digits: 2, point: 0.01, liveFrom: null };
}
function run(rows: number[][], zone: ZoneDict = ZONE, extra: Partial<RunInput> = {}, model: Partial<RunModel> = {}) {
  const rates = candles(rows);
  return runBacktest({
    zone, snapshot: SNAP, rates, dataTimeframe: 'M1', from: rates.t[0], to: rates.t[rows.length - 1] + 60,
    spread: { mode: 'candle' }, commissionPerLot: 0, model: { ...MODEL, ...model }, startCapital: 10_000, ...extra,
  });
}
const flat = (i: number, price: number, spread: number) => [T0 + i * 60, price, price, price, price, spread];

test.describe('Spread konservativ', () => {
  test('Spread-Spitze der Vorkerze: Kauf-Limit füllt nicht mit dem schmalen Endwert der Folgekerze', { tag: '@BKT-17' }, () => {
    // Kerze 0: breit (1,00). Kerze 1: Spread 0,20, Tief 2648,50 → mit eigenem Spread Ask 2648,70 ≤ 2649, mit 1,00 nicht.
    const rows = [flat(0, 2650, 100), [T0 + 60, 2650, 2650, 2648.5, 2650, 20], flat(2, 2650, 20)];
    const old = run(rows, ZONE, {}, { carrySpread: false });
    const safe = run(rows);
    // Ohne Übertrag füllt die Stufe 2649 (Ask 2648,70); mit Übertrag (Ask 2649,50) bleibt sie unberührt
    expect(old.trades.map((t) => t.entryPrice)).toContain(2649);
    expect(safe.trades.map((t) => t.entryPrice)).not.toContain(2649);
  });

  test('Kurslücke nach breiter Kerze füllt ein Kauf-Limit nie besser als zum Orderpreis', { tag: '@BKT-17' }, () => {
    const rows = [flat(0, 2650, 100), flat(1, 2640, 20), flat(2, 2640, 20)];
    const old = run(rows, ZONE, {}, { carrySpread: false });
    const safe = run(rows);
    expect(old.trades[0].entryPrice ?? 0).toBeCloseTo(2640.2, 6);
    // Ask = 2640 + 1,00 = 2641; Orderpreis 2649 ist besser für den Verkäufer, also gilt der Orderpreis
    expect(safe.trades[0].entryPrice ?? 0).toBeGreaterThanOrEqual(2649 - 1e-9);
  });
});

test.describe('SL-Schlupf', () => {
  const zone = { ...ZONE, stop_loss: 1, take_profit: 5 };
  // Kerze 0 fällt auf 2648,00 (Füllung 2649, SL 2648); Kerze 1 fällt weiter auf 2647
  const rows = [flat(0, 2650, 20), [T0 + 60, 2650, 2650, 2647, 2647, 20], flat(2, 2647, 20)];
  const slExit = (model: Partial<RunModel>) => run(rows, zone, {}, model).trades.find((t) => t.exitReason === 4)?.exitPrice;

  test('Standard: halber Spread schlechter als die Stufe; 0 schaltet ab; feste Punkte gelten', { tag: '@BKT-17' }, () => {
    expect(slExit({ slSlippagePoints: 0 })).toBeCloseTo(2648, 6);
    expect(slExit({})).toBeCloseTo(2647.9, 6);
    expect(slExit({ slSlippagePoints: 50 })).toBeCloseTo(2647.5, 6);
  });
});

test.describe('Startzustand', () => {
  const rows = [flat(0, 2650, 20), [T0 + 60, 2650, 2650, 2648, 2649, 20], flat(2, 2649, 20)];
  test('offene Vorposition belegt max_positions: keine neue Füllung', { tag: '@BKT-17' }, () => {
    const zone = { ...ZONE, max_positions: 1 };
    expect(run(rows, zone).trades.length).toBeGreaterThan(0);
    const seeded = run(rows, zone, { initialPositions: [{ side: 'buy', volume: 0.1, price: 2600, magic: 200001 }] });
    expect(seeded.trades.map((t) => t.entryPrice)).toEqual([2600]);
    expect(seeded.log.counts['grid.maxPositions']).toBeGreaterThan(0);
  });

  test('Fraktal, das vor dem Start gehandelt wurde, bekommt keine Order mehr', { tag: '@BKT-17' }, () => {
    const n = 240;
    const START = T0 - 2 * 3600;
    const mk = (): number[][] => {
      const out: number[][] = [];
      for (let i = 0; i < n; i++) {
        const open = Math.round((2650 + 4 * Math.sin(i / 5)) * 100) / 100;
        const close = Math.round((open + 1.3 * Math.cos(i * 1.7)) * 100) / 100;
        out.push([START + i * 60, open, Math.round((Math.max(open, close) + 0.45) * 100) / 100, Math.round((Math.min(open, close) - 0.45) * 100) / 100, close, 20]);
      }
      return out;
    };
    const zone = { ...ZONE, entry_mode: 'fractal', fractal_timeframe: 'M5', fractal_order_mode: 'breakout', fractal_sl_mode: 'buffer', fractal_sl_buffer: 0.3, fractal_rr: 0.6, max_positions: 10 };
    const base = run(mk(), zone, { from: START + 40 * 60 }, { closeAtEnd: false });
    const first = base.trades.find((t) => t.fractal);
    expect(first).toBeTruthy();
    const done = run(mk(), zone, { from: START + 40 * 60, initialFractalDone: [{ side: first!.fractal!.side, time: first!.fractal!.time }] }, { closeAtEnd: false });
    expect(done.trades.some((t) => t.fractal?.time === first!.fractal!.time && t.fractal?.side === first!.fractal!.side)).toBe(false);
  });
});
