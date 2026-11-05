import { expect, test } from '@playwright/test';
import { pairTrades, type Deal, type Trade } from '../../src/lib/analysis/tradePairing';
import { buildSymbolRows, pairLive, DEFAULT_TOLERANCE, evaluateBtLive, flatZone, levelToleranceOf, maxDrawdownOf, pairByOrder, type CollectedRun, type TradeLite } from '../../src/lib/backtest/liveCompare';
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
  magic: 200001, symbol: 'EURUSD', zone: { magic: 200001 }, trades, openPositions: 0, spreadPrice: 0.0002, commissionPerLot: 0, form: DEFAULT_RUN_SETTINGS,
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

test('Fehlt der erste Live-Trade im Backtest, bleibt er allein ohne Paar und die übrigen Paare verschieben sich nicht', { tag: '@BKT-14' }, () => {
  const live = [lite({ entryTime: T0, net: 1 }), lite({ entryTime: T0 + 2000, net: 2 })];
  const backtest = [lite({ entryTime: T0 + 2000, net: 3 })];
  const result = pairByOrder(live, backtest);
  expect(result.pairs.map((p) => [p.live.net, p.backtest.net])).toEqual([[2, 3]]);
  expect(result.unmatchedLive.map((trade) => trade.net)).toEqual([1]);
  expect(result.unmatchedBacktest).toHaveLength(0);
});

test('Fehlt ein Trade in der Mitte, werden die Trades davor und danach richtig gepaart', { tag: '@BKT-14' }, () => {
  const live = [lite({ entryTime: T0, net: 1 }), lite({ entryTime: T0 + 1500, net: 2 }), lite({ entryTime: T0 + 3000, net: 3 })];
  const backtest = [lite({ entryTime: T0 + 10, net: 4 }), lite({ entryTime: T0 + 3010, net: 5 })];
  const result = pairByOrder(live, backtest);
  expect(result.pairs.map((p) => [p.live.net, p.backtest.net])).toEqual([[1, 4], [3, 5]]);
  expect(result.unmatchedLive.map((trade) => trade.net)).toEqual([2]);
});

test('Live-Trades mit Ausstieg vor dem Zeitraum zählen nicht: Archiv-Deals → Paarung → Zeitraum → Kennzahl', { tag: '@BKT-14' }, () => {
  const t = 1_760_000_040;
  const deal = (ticket: number, time: number, type: number, entry: number, volume: number, profit: number): Deal => ({
    ticket, order: ticket, position_id: 1, time, time_msc: time * 1000, type, entry, magic: 200001, symbol: 'EURUSD', volume, price: 1.1,
    profit, commission: 0, swap: 0, fee: 0, comment: '', reason: 5,
  });
  // Eine Position, zwei Teilausstiege je 5: bei t+60 (vor dem Zeitraum) und bei t+180 (im Zeitraum [t+120, t+240))
  const deals = [deal(1, t, 0, 0, 1, 0), deal(2, t + 60, 1, 1, 0.5, 5), deal(3, t + 180, 1, 1, 0.5, 5)];
  const all = pairTrades(deals, [], null);
  expect(all.trades).toHaveLength(2);
  const live = pairLive(all, t + 120, t + 240);
  expect(live.trades.map((x) => x.exitTime - t)).toEqual([180]);
  expect(live.entries).toBe(all.entries);
  const [row] = buildSymbolRows([run([], { from: t + 120, to: t + 240 })], live, DEFAULT_TOLERANCE);
  expect(row.live).toMatchObject({ trades: 1, net: 5 });
  // Obergrenze ausgeschlossen
  expect(pairLive(all, t + 120, t + 180).trades).toHaveLength(0);
});

// Zwei Stufen (95,0 und 94,8) in kurzem Abstand; Live: obere Stufe SL, untere TP; Backtest füllt in anderer Reihenfolge
const crossLive = [
  lite({ entryTime: T0, entryPrice: 95.006, exitTime: T0 + 2500, exitPrice: 94, exitReason: 4, net: -17 }),
  lite({ entryTime: T0 + 70, entryPrice: 94.776, exitTime: T0 + 250, exitPrice: 94.9, exitReason: 5, net: 2.5 }),
];
const crossBt = [
  lite({ entryTime: T0 + 65, entryPrice: 94.8, exitTime: T0 + 250, exitPrice: 94.95, exitReason: 5, net: 2.5 }),
  lite({ entryTime: T0 + 200, entryPrice: 95, exitTime: T0 + 2500, exitPrice: 94, exitReason: 4, net: -17 }),
];

test('Paarung nach Orderstufe: zwei Trades derselben Stufen bilden keine Kreuzpaare', { tag: '@BKT-16' }, () => {
  // alte Paarung (ohne Stufentoleranz): nach Zeit gekreuzt, SL gegen TP
  const old = pairByOrder(crossLive, crossBt);
  expect(old.pairs.some((p) => p.live.exitReason !== p.backtest.exitReason)).toBe(true);
  const fixed = pairByOrder(crossLive, crossBt, 0.1);
  expect(fixed.pairs).toHaveLength(2);
  expect(fixed.pairs.every((p) => p.live.exitReason === p.backtest.exitReason)).toBe(true);
  expect(fixed.unmatchedLive).toHaveLength(0);
});

test('Stufentoleranz: Rest wird nach Zeit gepaart, Trades außerhalb des Fensters bleiben ohne Paar', { tag: '@BKT-16' }, () => {
  const far = lite({ entryTime: T0 + 99_999, entryPrice: 95 });
  const result = pairByOrder([crossLive[0], far], [crossBt[1], lite({ entryTime: T0 + 5, entryPrice: 90 })], 0.1);
  expect(result.pairs).toHaveLength(1); // 95↔95 über Stufe; Rest (far ↔ 90) liegt außerhalb des Zeitfensters → kein Paar
  expect(result.unmatchedLive).toHaveLength(1);
  expect(result.unmatchedBacktest).toHaveLength(1);
  expect(levelToleranceOf({ grid_step: 0.2 }, 0.032)).toBeCloseTo(0.1);
  expect(levelToleranceOf({ grid_step: 0.02 }, 0.032)).toBeCloseTo(0.032);
  expect(levelToleranceOf({}, 0.03)).toBeCloseTo(0.06);
});

test('buildSymbolRows nutzt die Stufenpaarung über grid_step der Zone', { tag: '@BKT-16' }, () => {
  const toTrade = (t: TradeLite) => trade({ entryTime: t.entryTime, entryPrice: t.entryPrice, exitTime: t.exitTime, exitPrice: t.exitPrice, exitReason: t.exitReason, net: t.net });
  const r = run(crossBt.map(toTrade), { zone: { magic: 200001, grid_step: 0.2 }, spreadPrice: 0.03 });
  const [row] = buildSymbolRows([r], { trades: crossLive.map(toTrade), entries: [] }, DEFAULT_TOLERANCE);
  expect(row.pairs.every((p) => p.live.exitReason === p.backtest.exitReason)).toBe(true);
});

function evalRow(liveNets: number[], btNets: number[], opts: { btShift?: number; btReason?: number } = {}) {
  const l = liveNets.map((net, i) => trade({ entryTime: T0 + i * 7200, exitTime: T0 + i * 7200 + 600, net, exitReason: 5 }));
  const b = btNets.map((net, i) => trade({ entryTime: T0 + i * 7200 + (opts.btShift ?? 0), exitTime: T0 + i * 7200 + 600, net, exitReason: opts.btReason ?? 5 }));
  return buildSymbolRows([run(b)], { trades: l, entries: [] }, DEFAULT_TOLERANCE)[0];
}

test('evaluateBtLive K1 Anzahl: Differenz höchstens max(1, 5 % von Live)', { tag: '@BKT-16' }, () => {
  const live = Array(40).fill(10);
  expect(evaluateBtLive(evalRow(live, live.slice(0, 38))).k1Count).toBe(true);
  expect(evaluateBtLive(evalRow(live, live.slice(0, 37))).k1Count).toBe(false);
  expect(evaluateBtLive(evalRow([10, 10], [10])).k1Count).toBe(true);
  expect(evaluateBtLive(evalRow([10, 10, 10], [10])).k1Count).toBe(false);
});

test('evaluateBtLive K2 Kerze und K3 Ausstiegsgrund', { tag: '@BKT-16' }, () => {
  const nets = Array(10).fill(10);
  expect(evaluateBtLive(evalRow(nets, nets)).passed).toBe(true);
  const shifted = evaluateBtLive(evalRow(nets, nets, { btShift: 300 }));
  expect(shifted.k2Candle).toBe(false);
  expect(shifted.sameCandlePairs).toBe(0);
  const reason = evaluateBtLive(evalRow(nets, nets, { btReason: 4 }));
  expect(reason.k3Reason).toBe(false);
  expect(reason.reasonMismatches).toBe(10);
});

test('evaluateBtLive K4 Netto: BT darf Live um max(0,50; 0,5 % von Σ|Live|) übertreffen', { tag: '@BKT-16' }, () => {
  expect(evaluateBtLive(evalRow([10], [10.4])).k4Net).toBe(true);
  expect(evaluateBtLive(evalRow([10], [10.6])).k4Net).toBe(false);
  expect(evaluateBtLive(evalRow([10], [5])).k4Net).toBe(true); // schlechter als Live ist erlaubt
  const big = Array(10).fill(1000); // Σ|Live| = 10000 → Toleranz 50
  const row = evalRow(big, big.map((v, i) => (i === 0 ? v + 49 : v)));
  expect(evaluateBtLive(row).netTolerance).toBe(50);
  expect(evaluateBtLive(row).k4Net).toBe(true);
});

test('evaluateBtLive: Live-Trades mit Einstieg vor dem Fenster ausschließen', { tag: '@BKT-16' }, () => {
  const l = [trade({ entryTime: T0 - 5000, exitTime: T0 + 10, net: -50 }), trade({ entryTime: T0 + 100, exitTime: T0 + 700, net: 10 })];
  const b = [trade({ entryTime: T0 + 100, exitTime: T0 + 700, net: 10 })];
  const [row] = buildSymbolRows([run(b)], { trades: l, entries: [] }, DEFAULT_TOLERANCE);
  expect(evaluateBtLive(row).liveTrades).toBe(2);
  const cut = evaluateBtLive(row, { excludeEntryBefore: T0 });
  expect(cut).toMatchObject({ liveTrades: 1, backtestTrades: 1, liveNet: 10, backtestNet: 10, passed: true });
});
