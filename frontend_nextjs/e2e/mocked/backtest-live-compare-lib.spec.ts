import { expect, test } from '@playwright/test';
import { pairTrades, type Deal, type Trade } from '../../src/lib/analysis/tradePairing';
import { buildSymbolRows, pairLive, DEFAULT_TOLERANCE, evaluateBtLive, flatZone, levelToleranceOf, maxDrawdownOf, pairByOrder, type CollectedRun, type TradeLite } from '../../src/lib/backtest/liveCompare';
import { buildStartState, type LiveOrder } from '../../src/lib/backtest/startState';
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

function evalRow(liveNets: number[], btNets: number[], opts: { btShift?: number; btReason?: number; btReasonCount?: number } = {}) {
  const l = liveNets.map((net, i) => trade({ entryTime: T0 + i * 7200, exitTime: T0 + i * 7200 + 600, net, exitReason: 5 }));
  const b = btNets.map((net, i) => trade({ entryTime: T0 + i * 7200 + (opts.btShift ?? 0), exitTime: T0 + i * 7200 + 600, net, exitReason: i < (opts.btReasonCount ?? Infinity) ? (opts.btReason ?? 5) : 5 }));
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

test('evaluateBtLive K3 anteilig: höchstens floor(2 % der Paare) mit anderem Ausstiegsgrund', { tag: '@BKT-16' }, () => {
  const nets314 = Array(314).fill(10);
  const ok = evaluateBtLive(evalRow(nets314, nets314, { btReason: 4, btReasonCount: 5 }));
  expect(ok.reasonMismatches).toBe(5);
  expect(ok.reasonMismatchLimit).toBe(6);
  expect(ok.k3Reason).toBe(true);
  expect(evaluateBtLive(evalRow(nets314, nets314, { btReason: 4, btReasonCount: 7 })).k3Reason).toBe(false);
  const nets129 = Array(129).fill(10);
  const small = evaluateBtLive(evalRow(nets129, nets129, { btReason: 4, btReasonCount: 3 }));
  expect(small.reasonMismatchLimit).toBe(2);
  expect(small.k3Reason).toBe(false);
  const tiny = Array(49).fill(10);
  expect(evaluateBtLive(evalRow(tiny, tiny, { btReason: 4, btReasonCount: 1 })).k3Reason).toBe(false);
  expect(evaluateBtLive(evalRow(tiny, tiny, { btReason: 4, btReasonCount: 1 }), { reasonMismatchRatio: 0.05 }).k3Reason).toBe(true);
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

// ---- Startzustand: SL/TP aus der Eröffnungsorder statt aus dem Verhältnis (BKT-16)
const FROM = T0 + 1000;
function dealOf(over: Partial<Deal>): Deal {
  return { ticket: 1, order: 1, position_id: 7, time: T0, time_msc: null, type: 0, entry: 0, magic: 200058, symbol: 'GBPUSD', volume: 0.1, price: 1.3474,
    profit: 0, commission: 0, swap: 0, fee: 0, comment: '', reason: null, ...over };
}
const closeDeal = dealOf({ ticket: 2, entry: 1, type: 1, time: FROM + 500, price: 1.34513, comment: '[sl 1.34513]' });
const fractalSetup = { entry_mode: 'fractal', stop_loss: 0.0023, take_profit: 0.0023 };

test('Startzustand nimmt SL/TP der Eröffnungsorder, auch wenn die Schätzung anders läge', { tag: '@BKT-16' }, () => {
  const state = buildStartState([dealOf({ open_sl: 1.34513, open_tp: 1.351 }), closeDeal], 200058, fractalSetup, FROM, 5);
  expect(state.positions).toHaveLength(1);
  expect(state.positions[0]).toMatchObject({ side: 'buy', price: 1.3474, sl: 1.34513, tp: 1.351 });
  expect(state.estimated).toBe(0);
  expect(state.notes).toEqual([]);
});

test('Ohne Ordernachweis fällt der Startzustand auf die Schätzung zurück und zählt sie', { tag: '@BKT-16' }, () => {
  const state = buildStartState([dealOf({ open_sl: null, open_tp: null }), closeDeal], 200058, fractalSetup, FROM, 5);
  expect(state.positions[0].tp).toBe(1.34967); // Verhältnis 1: der bekannte falsche Wert aus 200058
  expect(state.estimated).toBe(1);
  expect(state.notes).toEqual([{ code: 'run.startLevelsEstimated', params: { positions: 1 } }]);
});

test('Nur ein fehlender Wert wird geschätzt, der andere bleibt der echte', { tag: '@BKT-16' }, () => {
  const state = buildStartState([dealOf({ open_sl: 1.34513, open_tp: null }), closeDeal], 200058, fractalSetup, FROM, 5);
  expect(state.positions[0]).toMatchObject({ sl: 1.34513, tp: 1.34967 });
  expect(state.estimated).toBe(1);
});

test('Vor dem Start geschlossene Fraktal-Position wird als erledigt gemerkt, nicht als Position', { tag: '@BKT-16' }, () => {
  const early = dealOf({ comment: 'x_FU1759999000' });
  const out = dealOf({ ticket: 3, entry: 1, type: 1, time: FROM - 10 });
  const state = buildStartState([early, out], 200058, fractalSetup, FROM, 5);
  expect(state.positions).toEqual([]);
  expect(state.fractalDone).toEqual([{ side: 'U', time: 1759999000 }]);
});

// ---- Startzustand Grid: SL/TP vom Füllpreis aus neu setzen, wie der Bot nach dem Fill (BKT-16, 1106-K54.1)
const GRID_NOTE = (n: number) => ({ code: 'run.startLevelsSettingChanged', params: { positions: n } });
const gridDeal = (over: Partial<Deal>) => dealOf({ magic: 200041, symbol: 'XAUUSD', position_id: 9001, ...over });
const xauSetup = { entry_mode: 'grid', stop_loss: 12, take_profit: 6, grid_step: 1 };

test('Grid: Buy-SL wird vom Füllpreis gesetzt, nicht vom Orderpreis', { tag: '@BKT-16' }, () => {
  const state = buildStartState([gridDeal({ price: 4070.91, open_sl: 4059, open_tp: 4077 })], 200041, xauSetup, FROM, 2);
  expect(state.positions[0]).toMatchObject({ side: 'buy', price: 4070.91, sl: 4058.91, tp: 4076.91 });
  expect(state.estimated).toBe(0);
  expect(state.notes).toEqual([]);
});

test('Grid: Buy-TP wird vom Füllpreis gesetzt (USOUSD)', { tag: '@BKT-16' }, () => {
  const setup = { entry_mode: 'grid', stop_loss: 1, take_profit: 0.15, grid_step: 0.2 };
  const state = buildStartState([gridDeal({ magic: 200050, symbol: 'USOUSD', price: 91.192, open_sl: 90.2, open_tp: 91.35 })], 200050, setup, FROM, 3);
  expect(state.positions[0]).toMatchObject({ sl: 90.192, tp: 91.342 });
});

test('Grid: Sell vertauscht die Richtung und nimmt die Sell-Abstände', { tag: '@BKT-16' }, () => {
  const setup = { entry_mode: 'grid', sell_stop_loss: 10, sell_take_profit: 4, sell_grid_step: 1 };
  const state = buildStartState([gridDeal({ type: 1, price: 4065.03, open_sl: 4075, open_tp: 4061 })], 200041, setup, FROM, 2);
  expect(state.positions[0]).toMatchObject({ side: 'sell', sl: 4075.03, tp: 4061.03 });
});

test('Grid: Abweichung höchstens 0,00001 (Bot-Schwelle) lässt open_sl/open_tp stehen (EURCHF)', { tag: '@BKT-16' }, () => {
  const setup = { entry_mode: 'grid', stop_loss: 0.002, take_profit: 0.0007, grid_step: 0.0008 };
  const state = buildStartState([gridDeal({ magic: 200044, symbol: 'EURCHF', price: 0.91439, open_sl: 0.9124, open_tp: 0.9151 })], 200044, setup, FROM, 5);
  expect(state.positions[0]).toMatchObject({ sl: 0.9124, tp: 0.9151 });
  expect(state.notes).toEqual([]);
});

test('Grid: Geänderte Einstellung (Abstand weit weg) lässt open_x stehen und schreibt einen Hinweis', { tag: '@BKT-16' }, () => {
  const changed = { ...xauSetup, stop_loss: 20, take_profit: 10 };
  const state = buildStartState([gridDeal({ price: 4070.91, open_sl: 4059, open_tp: 4077 })], 200041, changed, FROM, 2);
  expect(state.positions[0]).toMatchObject({ sl: 4059, tp: 4077 });
  expect(state.estimated).toBe(0);
  expect(state.notes).toEqual([GRID_NOTE(1)]);
});

test('Fraktal: open_sl/open_tp bleiben, auch wenn der Füllpreis anders liegt', { tag: '@BKT-16' }, () => {
  const setup = { entry_mode: 'fractal', stop_loss: 12, take_profit: 6, grid_step: 1 };
  const state = buildStartState([gridDeal({ price: 4070.91, open_sl: 4059, open_tp: 4077 })], 200041, setup, FROM, 2);
  expect(state.positions[0]).toMatchObject({ sl: 4059, tp: 4077 });
  expect(state.notes).toEqual([]);
});

test('Grid: Fehlt open_x, gilt die bisherige Schätzung', { tag: '@BKT-16' }, () => {
  const state = buildStartState([gridDeal({ price: 4070.91, open_sl: null, open_tp: null })], 200041, xauSetup, FROM, 2);
  expect(state.positions[0]).toMatchObject({ sl: 4058.91, tp: 4076.91 });
  expect(state.estimated).toBe(1);
  expect(state.notes).toEqual([{ code: 'run.startLevelsEstimated', params: { positions: 1 } }]);
});

// ---------------------------------------------------------------- BKT-24 Start-Orders aus der Orderhistorie
const liveOrder = (over: Partial<LiveOrder> = {}): LiveOrder => ({
  ticket: 9001, time_setup: FROM - 3600, time_setup_msc: (FROM - 3600) * 1000 + 5, time_done: FROM + 600, time_done_msc: (FROM + 600) * 1000, type: 2, state: 2,
  magic: 200041, symbol: 'XAUUSD', volume_initial: 0.1, volume_current: 0.1, price_open: 4060.5, sl: null, tp: 4061.5, comment: 'AutoGrid_Z200041', ...over,
});

test('Start-Orders: nur Pending-Typ, eigenes Magic, vor from gesetzt, nicht abgelehnt; offene und ab from beendete zählen', { tag: '@BKT-24' }, () => {
  const rows = [
    liveOrder(),
    liveOrder({ ticket: 9002, time_done_msc: 0, time_done: 0, active: true }), // noch offen
    liveOrder({ ticket: 9003, time_done_msc: FROM * 1000 }), // Grenze == from zählt
    liveOrder({ ticket: 9004, time_done_msc: FROM * 1000 - 1 }), // davor beendet
    liveOrder({ ticket: 9005, type: 0 }), // Marktorder
    liveOrder({ ticket: 9006, state: 5 }), // abgelehnt
    liveOrder({ ticket: 9007, magic: 200042 }), // fremde Zone
    liveOrder({ ticket: 9008, time_setup_msc: FROM * 1000 }), // erst ab from gesetzt
  ];
  const state = buildStartState([], 200041, xauSetup, FROM, 2, rows);
  expect(state.orders).toHaveLength(3);
  expect(state.orders[0]).toMatchObject({ type: 2, price: 4060.5, volume: 0.1, tp: 4061.5, magic: 200041, comment: 'AutoGrid_Z200041' });
  expect(state.orders[0].sl).toBeUndefined();
  expect(state.notes).toEqual([]);
});

test('Start-Orders: Sortierung nach Setzzeit, dann Ticket', { tag: '@BKT-24' }, () => {
  const rows = [
    liveOrder({ ticket: 9012, time_setup_msc: 5000, price_open: 3 }),
    liveOrder({ ticket: 9011, time_setup_msc: 5000, price_open: 2 }),
    liveOrder({ ticket: 9013, time_setup_msc: 1000, price_open: 1 }),
  ];
  const state = buildStartState([], 200041, xauSetup, FROM, 2, rows);
  expect(state.orders.map((o) => o.price)).toEqual([1, 2, 3]);
});

test('Start-Orders: ohne Angabe wie bisher (keine Notiz), null = angefragt aber nicht zu haben (WARN), Teilfüllung wird gemeldet', { tag: '@BKT-24' }, () => {
  const none = buildStartState([], 200041, xauSetup, FROM, 2);
  expect(none.orders).toEqual([]);
  expect(none.notes).toEqual([]);
  const missing = buildStartState([], 200041, xauSetup, FROM, 2, null);
  expect(missing.orders).toEqual([]);
  expect(missing.notes).toEqual([{ code: 'run.startOrdersMissing' }]);
  const partial = buildStartState([], 200041, xauSetup, FROM, 2, [liveOrder({ state: 3 })]);
  expect(partial.orders).toHaveLength(1);
  expect(partial.notes).toEqual([{ code: 'run.startOrderPartial', params: { orders: 1 } }]);
});
