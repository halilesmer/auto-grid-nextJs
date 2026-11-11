/**
 * BKT-25 Backtest: der Lauf startet mit dem Live-Zustand von `from` (runJob, ohne Browserseite).
 * `params.startState.deals` kommt von der Seite; die Pending Orders holt runJob selbst. Fehler dort stoppen den Lauf nie.
 * Zahlen: Gold-ähnliches Symbol (Tick 0,01), 10:00 Brokerzeit eines Mittwochs.
 */
import { expect, test } from '@playwright/test';
import type { Deal } from '../../src/lib/analysis/tradePairing';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
import { RunError } from '../../src/lib/backtest/runContext';
import { runJob } from '../../src/lib/backtest/runJob';
import type { SymbolDetail } from '../../src/store/types';

const DETAIL: SymbolDetail = {
  name: 'XAUUSD', digits: 2, point: 0.01, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_mode: 4,
  currency_base: 'XAU', currency_profit: 'USD', currency_margin: 'XAU', trade_tick_value: 1, trade_tick_size: 0.01,
  trade_contract_size: 100, trade_calc_mode: 2, trade_tick_value_profit: 1, trade_tick_value_loss: 1, swap_mode: 4,
  swap_long: -6.5, swap_short: 2, swap_rollover3days: 3, spread: 20, trade_stops_level: 0,
};
const MAGIC = 200041;
const ZONE = {
  id: 'z1', symbol: 'XAUUSD', order_type: 'BUY', min_price: 2600, max_price: 2700, grid_step: 1, lot_size: 0.1,
  take_profit: 5, stop_loss: 0, sell_grid_step: 1, sell_lot_size: 0.1, sell_take_profit: 5, sell_stop_loss: 0,
  is_breakout: false, is_active: true, levels_below: 2, levels_above: 2, sync_buy_sell: false,
  exit_timeframe: 'M15', entry_mode: 'grid', magic: MAGIC,
};
const T1 = 1_791_331_200 + 10 * 3600;
/** Zeilen: [Zeit, Eröffnung, Hoch, Tief, Schluss, Spread in Punkten]; die Kerze 2 erreicht den TP (2655) der Startposition */
const ROWS = [
  [T1, 2650, 2651, 2649.5, 2650.5, 20],
  [T1 + 60, 2650.5, 2656, 2650.4, 2655.5, 20],
  [T1 + 120, 2655.5, 2655.8, 2655, 2655.2, 20],
];

const deal = (over: Partial<Deal>): Deal => ({
  ticket: 1, order: 1, position_id: 7, time: T1 - 600, time_msc: null, type: 0, entry: 0, magic: MAGIC, symbol: 'XAUUSD',
  volume: 0.1, price: 2650, profit: 0, commission: 0, swap: 0, fee: 0, comment: '', reason: null, open_sl: null, open_tp: 2655, ...over,
});
const LIVE_ORDER = {
  ticket: 90, time_setup: T1 - 900, time_setup_msc: (T1 - 900) * 1000, time_done: 0, time_done_msc: 0, type: 2, state: 1, magic: MAGIC,
  symbol: 'XAUUSD', volume_initial: 0.1, price_open: 2640, sl: null, tp: 2645, comment: 'x', active: true,
};

type Answer = { orders?: unknown[]; missing?: unknown[] } | { fail: number };
function worker(orders: Answer, calls: string[]) {
  return async (path: string) => {
    calls.push(path);
    const url = new URL(path, 'https://w.example');
    if (url.pathname.endsWith('/orders')) {
      if ('fail' in orders) throw new RunError('run.http', { status: orders.fail, path });
      return { account_id: 'acc', from: T1, to: T1 + 1, orders: orders.orders ?? [], missing: orders.missing ?? [], lookback_sec: 0 };
    }
    const col = (i: number) => ROWS.map((r) => r[i]);
    return {
      t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: col(5), sa: col(5), sx: col(5),
      ahi: ROWS.map((r) => Math.round(r[2] / 0.01) + 20), alo: ROWS.map((r) => Math.round(r[3] / 0.01) + 20), g: ROWS.map(() => 1), tick_missing: [],
      replay: { t: [], kind: [], off: [0], ms: [], b: [], a: [] }, missing: [], next_from: null, digits: 2, point: 0.01,
    };
  };
}

function request(params: Partial<RunRequest['params']> = {}): RunRequest {
  return {
    type: 'run', runId: 1, apiBase: 'https://worker.example/api', headers: {},
    params: {
      accountId: 'acc', zone: ZONE, symbol: DETAIL, from: T1, to: T1 + 180, dataTimeframe: 'M1', spread: { mode: 'fixed', points: 20 },
      commissionPerLot: 0, swapEnabled: false, approximate: false,
      model: { fill: 'gap', slFirst: false, closeAtEnd: true, triggerReplay: false }, path: 'auto', startCapital: 10_000, ...params,
    },
  };
}
async function job(req: RunRequest, orders: Answer, calls: string[] = []) {
  const messages: WorkerMessage[] = [];
  await runJob(req, (m) => messages.push(m), worker(orders, calls));
  const last = messages[messages.length - 1];
  if (last.type !== 'result') throw new Error(JSON.stringify(last));
  return last.results;
}
const line = (r: { log: { lines: { code: string; level: string; params?: Record<string, unknown> }[] } }, code: string) => r.log.lines.find((l) => l.code === code);
const START = { deals: [deal({})] };

test('Startposition und Start-Order kommen in den Lauf, das Protokoll sagt es', { tag: '@BKT-25' }, async () => {
  const calls: string[] = [];
  const [result] = await job(request({ startState: START }), { orders: [LIVE_ORDER] }, calls);
  expect(calls.filter((c) => c.includes('/orders'))).toEqual([`/history/acc/orders?from=${T1}&to=${T1 + 1}`]);
  expect(line(result, 'run.startPositions')).toMatchObject({ level: 'INFO', params: { positions: 1, fractals: 0 } });
  expect(line(result, 'run.startOrders')).toMatchObject({ level: 'INFO', params: { orders: 1 } });
  // die Startposition (Kauf 2650) erreicht in Kerze 2 ihren TP 2655
  expect(result.trades[0]).toMatchObject({ entryPrice: 2650, exitPrice: 2655 });
});

for (const status of [404, 500]) {
  test(`Orders-Endpunkt ${status}: WARN startOrdersMissing, Position bleibt, der Lauf endet`, { tag: '@BKT-25' }, async () => {
    const [result] = await job(request({ startState: START }), { fail: status });
    expect(line(result, 'run.startOrdersMissing')).toMatchObject({ level: 'WARN' });
    expect(line(result, 'run.startPositions')).toMatchObject({ params: { positions: 1 } });
    expect(line(result, 'run.startOrders')).toBeUndefined();
    expect(result.trades[0]).toMatchObject({ entryPrice: 2650 });
  });
}

test('Orders-Antwort mit missing zählt wie „nicht zu haben“', { tag: '@BKT-25' }, async () => {
  const [result] = await job(request({ startState: START }), { orders: [LIVE_ORDER], missing: [{ from: T1, to: T1 + 1, reason: 'busy' }] });
  expect(line(result, 'run.startOrdersMissing')).toBeDefined();
  expect(line(result, 'run.startOrders')).toBeUndefined();
});

test('Ohne startState: kein Orders-Abruf, keine Startzeile, Ergebnis wie bisher', { tag: '@BKT-25' }, async () => {
  const calls: string[] = [];
  const [plain] = await job(request(), { orders: [LIVE_ORDER] }, calls);
  expect(calls.filter((c) => c.includes('/orders'))).toEqual([]);
  expect(plain.log.lines.some((l) => l.code.startsWith('run.start'))).toBe(false);
  // leerer Startzustand (keine Deals): gleiche Trades und Zusammenfassung wie ohne
  const [empty] = await job(request({ startState: { deals: [] } }), { orders: [] });
  expect(JSON.stringify(empty.trades)).toBe(JSON.stringify(plain.trades));
  expect(empty.summary).toEqual(plain.summary);
  expect(JSON.stringify(empty.equity)).toBe(JSON.stringify(plain.equity));
});

test('Beide Wege starten mit demselben Zustand (path both = zwei Einzelläufe)', { tag: '@BKT-25' }, async () => {
  const both = await job(request({ startState: START, path: 'both' }), { orders: [LIVE_ORDER] });
  expect(both).toHaveLength(2);
  const low = await job(request({ startState: START, path: 'lowFirst' }), { orders: [LIVE_ORDER] });
  const high = await job(request({ startState: START, path: 'highFirst' }), { orders: [LIVE_ORDER] });
  for (const r of both) expect(line(r, 'run.startPositions')).toMatchObject({ params: { positions: 1 } });
  expect(JSON.stringify(both[0].trades)).toBe(JSON.stringify(low[0].trades));
  expect(JSON.stringify(both[1].trades)).toBe(JSON.stringify(high[0].trades));
});
