import { expect, test } from '@playwright/test';
import type { Trade } from '../../src/lib/analysis/tradePairing';
import { buildSymbolRows, DEFAULT_TOLERANCE, flatZone, maxDrawdownOf, pairByOrder, type CollectedRun, type TradeLite } from '../../src/lib/backtest/liveCompare';
import { DEFAULT_RUN_SETTINGS } from '../../src/lib/backtest/runSettings';

const T0 = 1_760_000_040; // volle Minute

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: 'x', positionId: 1, symbol: 'EURUSD', side: 'buy', volume: 0.01, entryTime: T0, entryPrice: 1.1, exitTime: T0 + 600, exitPrice: 1.1005,
    exitTicket: 1, exitReason: 5, profit: 0, commission: 0, fee: 0, swap: 0, net: 10, partial: false, reversal: false, closeBy: false,
    magic: 200001, zone: { kind: 'zone', magic: 200001, label: null }, fractal: null, ...over,
  };
}
const run = (trades: Trade[], over: Partial<CollectedRun> = {}): CollectedRun => ({
  magic: 200001, symbol: 'EURUSD', zone: { magic: 200001 }, trades, openPositions: 0, spreadPrice: 0.0002, form: DEFAULT_RUN_SETTINGS,
  from: T0 - 1000, to: T0 + 100_000, currency: 'USD', ...over,
});
const lite = (over: Partial<TradeLite> = {}): TradeLite => ({ side: 'buy', magic: 1, volume: 0.01, entryTime: T0, entryPrice: 1, exitTime: T0 + 10, exitPrice: 1, exitReason: null, net: 1, ...over });

test('Gleiche Trades bestehen die strenge Toleranz', { tag: '@BKT-14' }, () => {
  const rows = buildSymbolRows([run([trade({ entryTime: T0 + 20 })])], { trades: [trade()], entries: [] }, DEFAULT_TOLERANCE);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ symbol: 'EURUSD', countOk: true, entryOk: true, priceOk: true, profitOk: true, passed: true });
  expect(rows[0].pairs[0].deviations).toEqual([]);
});

test('Einstieg in der nächsten Minute, Preis über 0,5 Spread und Gewinn über 5 % werden benannt', { tag: '@BKT-14' }, () => {
  const backtest = trade({ entryTime: T0 + 61, entryPrice: 1.1002, exitPrice: 1.1008, net: 11 });
  const [row] = buildSymbolRows([run([backtest])], { trades: [trade()], entries: [] }, DEFAULT_TOLERANCE);
  expect(row.pairs[0].deviations).toEqual(['entryCandle', 'entryPrice', 'exitPrice', 'profit']);
  expect(row).toMatchObject({ countOk: true, entryOk: false, priceOk: false, profitOk: false, passed: false });
  expect(row.profitDeltaPercent).toBe(10);
  // Lockerere Toleranz: dieselben Trades bestehen
  const loose = buildSymbolRows([run([trade({ entryTime: T0 + 20, entryPrice: 1.1002, exitPrice: 1.1008, net: 10.4 })])], { trades: [trade()], entries: [] },
    { ...DEFAULT_TOLERANCE, priceSpreadFactor: 2 });
  expect(loose[0].passed).toBe(true);
});

test('Fehlender Backtest-Trade: Anzahl und Einstieg fallen durch, der Trade bleibt ohne Paar', { tag: '@BKT-14' }, () => {
  const live = [trade(), trade({ entryTime: T0 + 7200, exitTime: T0 + 7800 })];
  const [row] = buildSymbolRows([run([trade()])], { trades: live, entries: [] }, DEFAULT_TOLERANCE);
  expect(row.live.trades).toBe(2);
  expect(row.backtest.trades).toBe(1);
  expect(row).toMatchObject({ countOk: false, entryOk: false, passed: false });
  expect(row.unmatchedLive).toHaveLength(1);
  expect(row.unmatchedBacktest).toHaveLength(0);
});

test('Zuordnung über Magic: fremde Zonen und Hand-Trades zählen nicht; Zonen desselben Symbols werden getrennt gepaart', { tag: '@BKT-14' }, () => {
  const other = trade({ magic: 200002 });
  const manual = trade({ magic: 0 });
  const runs = [run([trade()]), run([trade({ magic: 200003 })], { magic: 200003 })];
  const live = [trade(), trade({ magic: 200003 }), other, manual];
  const [row] = buildSymbolRows(runs, { trades: live, entries: [] }, DEFAULT_TOLERANCE);
  expect(row.magics).toEqual([200001, 200003]);
  expect(row.live.trades).toBe(2);
  expect(row.pairs.map((p) => p.magic)).toEqual([200001, 200003]);
  expect(row.passed).toBe(true);
});

test('Ohne gesetzte Prüfung zählt sie nicht; offene Positionen und Drawdown stehen je Seite', { tag: '@BKT-14' }, () => {
  const tolerance = { ...DEFAULT_TOLERANCE, sameTradeCount: false, entrySameCandle: false, profitPercent: 1000 };
  const entries = [{ magic: 200001, closed: false }, { magic: 200001, closed: true }, { magic: 5, closed: false }] as never;
  const [row] = buildSymbolRows([run([trade({ net: -5 }), trade({ exitTime: T0 + 900, entryTime: T0 + 300, net: 20 })], { openPositions: 2 })],
    { trades: [trade()], entries }, tolerance);
  expect(row.countOk).toBe(true);
  expect(row.live.openPositions).toBe(1);
  expect(row.backtest.openPositions).toBe(2);
  expect(row.backtest.maxDrawdown).toBe(5);
  expect(maxDrawdownOf([lite({ exitTime: 1, net: 5 }), lite({ exitTime: 2, net: -8 }), lite({ exitTime: 3, net: 2 })])).toBe(8);
});

test('Paarung nach Reihenfolge innerhalb des Zeitfensters, getrennt nach Seite', { tag: '@BKT-14' }, () => {
  const live = [lite({ entryTime: T0 }), lite({ entryTime: T0 + 5000 }), lite({ side: 'sell', entryTime: T0 })];
  const backtest = [lite({ entryTime: T0 + 30 }), lite({ entryTime: T0 + 50_000 }), lite({ side: 'sell', entryTime: T0 + 100_000 })];
  const result = pairByOrder(live, backtest);
  expect(result.pairs).toHaveLength(1);
  expect(result.unmatchedLive).toHaveLength(2);
  expect(result.unmatchedBacktest).toHaveLength(2);
});

test('Zonen im Bericht enthalten nur flache Werte', { tag: '@BKT-14' }, () => {
  expect(flatZone({ a: 1, b: 'x', c: true, d: null, e: [1], f: { g: 1 }, h: Number.NaN })).toEqual({ a: 1, b: 'x', c: true, d: null });
});
