/**
 * BKT-23 Backtest: Trigger-Minuten-Replay und Ausführungsverzögerung (Plan 1109-K57, ohne Browserseite).
 * Die Minuten, in denen der Lauf Orders füllt oder Positionen schließt, werden mit echten Ticks abgespielt (mehrere
 * Durchgänge); Füllung und Ausstieg nehmen die letzte Quote höchstens REPLAY_FILL_LATENCY_MS nach der Auslösung.
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol } from '../../src/lib/backtest/broker/costs';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
import { RunError } from '../../src/lib/backtest/runContext';
import { runJob } from '../../src/lib/backtest/runJob';
import { runBacktest, type RunInput, type RunModel } from '../../src/lib/backtest/runner';
import type { SymbolDetail } from '../../src/store/types';

const DETAIL: SymbolDetail = {
  name: 'XAUUSD', digits: 2, point: 0.01, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_mode: 4,
  currency_base: 'XAU', currency_profit: 'USD', currency_margin: 'XAU', trade_tick_value: 1, trade_tick_size: 0.01,
  trade_contract_size: 100, trade_calc_mode: 2, trade_tick_value_profit: 1, trade_tick_value_loss: 1, swap_mode: 4,
  swap_long: -6.5, swap_short: 2, swap_rollover3days: 3, spread: 20, trade_stops_level: 0,
};
const ZONE = {
  id: 'z1', symbol: 'XAUUSD', order_type: 'BUY', min_price: 2600, max_price: 2700, grid_step: 1, lot_size: 0.1,
  take_profit: 1, stop_loss: 0, sell_grid_step: 1, sell_lot_size: 0.1, sell_take_profit: 1, sell_stop_loss: 0,
  is_breakout: false, is_active: true, levels_below: 2, levels_above: 2, sync_buy_sell: false,
  exit_timeframe: 'M15', entry_mode: 'grid',
};
const WED = 1_791_331_200;
const T1 = WED + 10 * 3600;
const TICK0 = { mode: 'tick', points: 0 } as const;
const MODEL: RunModel = { fill: 'gap', slFirst: false, path: 'auto', closeAtEnd: true };

function snapshot() {
  const result = snapshotSymbol(DETAIL, { swapEnabled: false, approximate: false });
  if (!('snapshot' in result)) throw new Error(JSON.stringify(result.problems));
  return result.snapshot;
}

/** Zeilen: [Zeit, Eröffnung, Hoch, Tief, Schluss, Spread in Punkten] */
function candles(rows: number[][]): LoadedRates {
  const col = (i: number) => Float64Array.from(rows.map((r) => r[i]));
  const sa = Float64Array.from(rows.map((r) => r[5]));
  return { t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: sa, sa, sx: sa, missing: [], digits: 2, point: 0.01, liveFrom: null };
}

/** Ticks einer Minute: [ms, Bid, Ask] */
type Tick = [number, number, number];
const withReplay = (rates: LoadedRates, minutes: Record<number, Tick[]>): LoadedRates => ({
  ...rates,
  replay: new Map(Object.entries(minutes).map(([t, ticks]) => [Number(t), { ms: ticks.map((x) => x[0]), bid: ticks.map((x) => x[1]), ask: ticks.map((x) => x[2]) }])),
});

function run(rates: LoadedRates, model: Partial<RunModel> = {}, extra: Partial<RunInput> = {}) {
  return runBacktest({
    zone: ZONE, snapshot: snapshot(), rates, dataTimeframe: 'M1', from: rates.t[0], to: rates.t[rates.t.length - 1] + 60,
    spread: TICK0, commissionPerLot: 0, model: { ...MODEL, ...model }, startCapital: 10_000, ...extra,
  });
}
const same = (a: ReturnType<typeof run>, b: ReturnType<typeof run>) => {
  expect(JSON.stringify(a.trades)).toBe(JSON.stringify(b.trades));
  expect(a.summary).toEqual(b.summary);
};

/** Minute T1: der Bot setzt BUY_STOP 2651; Ask 2651,00 löst aus, im selben ms kommt 2650,96, 1 ms später 2650,94, 2 ms später 2650,90 */
const PACK: Tick[] = [[0, 2650.0, 2650.2], [10000, 2650.8, 2651.0], [10000, 2650.76, 2650.96], [10001, 2650.74, 2650.94], [10002, 2650.7, 2650.9], [30000, 2650.7, 2650.9]];
const FLAT = [[T1, 2650, 2650.9, 2650, 2650.8, 20]];

test.describe('Ausführungsverzögerung im Replay', () => {
  test('Kauf-Stop füllt zur letzten Quote bis 1 ms nach der Auslösung (aus 2651,00 wird 2650,94)', { tag: '@BKT-23' }, () => {
    const result = run(withReplay(candles(FLAT), { [T1]: PACK }), { triggerReplay: true });
    expect(result.trades[0].entryPrice).toBe(2650.94);
    expect(result.trades[0].exitPrice).toBe(2650.7); // closeAtEnd: Bid der letzten Quote
  });

  test('ohne Schalter bleibt die Füllung beim Tick der Auslösung (2651,00)', { tag: '@BKT-23' }, () => {
    expect(run(withReplay(candles(FLAT), { [T1]: PACK })).trades[0].entryPrice).toBe(2651.0);
    expect(run(withReplay(candles(FLAT), { [T1]: PACK }), { triggerReplay: false }).trades[0].entryPrice).toBe(2651.0);
  });

  test('Gerüst-Gerade: der Schalter ändert nichts, wenn die Minute nicht in der Karte steht oder der Spread nicht „tick“ ist', { tag: '@BKT-23' }, () => {
    const plain = candles(FLAT);
    same(run(plain, { triggerReplay: true }), run(plain));
    const max0 = { mode: 'max', points: 0 } as const;
    same(run(withReplay(plain, { [T1]: PACK }), { triggerReplay: true }, { spread: max0 }), run(withReplay(plain, { [T1]: PACK }), {}, { spread: max0 }));
    const fixed = { mode: 'fixed', points: 20 } as const;
    same(run(withReplay(plain, { [T1]: PACK }), { triggerReplay: true }, { spread: fixed }), run(plain, {}, { spread: fixed }));
  });

  test('triggerMinutes: Einstiegs- und Ausstiegsminute der Trades, ohne Minuten, die schon in der Karte stehen', { tag: '@BKT-23' }, () => {
    const two = [FLAT[0], [T1 + 60, 2650.8, 2651.0, 2650.7, 2650.9, 20]];
    expect(run(candles(two), { triggerReplay: true }).triggerMinutes).toEqual([]); // keine Replay-Karte: der Lauf kennt den Spread „tick“ nur mit `replay`
    const lone = withReplay(candles(two), { [T1 + 60]: [[0, 2650.8, 2651.0], [30000, 2650.8, 2651.0]] });
    expect(run(lone, { triggerReplay: true }).triggerMinutes).toEqual([T1]);
    expect(run(lone).triggerMinutes).toEqual([]);
  });
});

test.describe('Auftrag: Durchgänge, Abruf und Rückfall', () => {
  const C1 = [T1, 2650, 2651.1, 2650, 2650.9, 20];
  const C2 = [T1 + 60, 2650.9, 2651.3, 2650.8, 2651.0, 20];
  /** Ticks, die der Worker auf Abruf liefert: in T1 bleibt der Ask unter 2651 (kein Einstieg), in T1+60 steigt er darüber */
  const SERVED: Record<number, Tick[]> = {
    [T1]: [[0, 2650.0, 2650.2], [20000, 2650.3, 2650.5], [40000, 2650.3, 2650.5]],
    [T1 + 60]: [[0, 2650.9, 2651.1], [1, 2650.9, 2651.06], [5, 2650.9, 2651.2], [30000, 2650.9, 2651.2]],
  };

  function worker(rows: number[][], served: Record<number, Tick[]>, calls: string[], fail?: number, busy = false) {
    return async (path: string) => {
      calls.push(path);
      const url = new URL(path, 'https://w.example');
      if (url.pathname.endsWith('/rates')) {
        const col = (i: number) => rows.map((r) => r[i]);
        const pts = (x: number) => Math.round(x / 0.01);
        return {
          t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: col(5), sa: col(5), sx: col(5),
          ahi: rows.map((r) => pts(r[2]) + 20), alo: rows.map((r) => pts(r[3]) + 20), g: rows.map(() => 1), tick_missing: [],
          replay: { t: [], kind: [], off: [0], ms: [], b: [], a: [] }, missing: [], next_from: null, digits: 2, point: 0.01,
        };
      }
      if (fail) throw new RunError('run.http', { status: fail, path });
      if (busy) return { account_id: 'acc', symbol: 'XAUUSD', t: [], kind: [], off: [0], ms: [], b: [], a: [], missing: [{ from: T1, to: T1 + 3600, reason: 'busy' }] };
      const start = Number(url.searchParams.get('start'));
      let at = start;
      const minutes = (url.searchParams.get('m') ?? '').split(',').map((d) => (at += Number(d) * 60));
      const cols = { t: [] as number[], kind: [] as string[], off: [0], ms: [] as number[], b: [] as number[], a: [] as number[], missing: [] };
      for (const minute of minutes) {
        const ticks = served[minute];
        if (!ticks) continue;
        cols.t.push(minute);
        cols.kind.push('T');
        for (const [ms, bid, ask] of ticks) {
          cols.ms.push(ms);
          cols.b.push(Math.round(bid / 0.01));
          cols.a.push(Math.round(ask / 0.01));
        }
        cols.off.push(cols.ms.length);
      }
      return { account_id: 'acc', symbol: 'XAUUSD', ...cols };
    };
  }

  function request(params: Partial<RunRequest['params']> = {}): RunRequest {
    return {
      type: 'run', runId: 3, apiBase: 'https://worker.example/api', headers: {},
      params: {
        accountId: 'acc', zone: ZONE, symbol: DETAIL, from: T1, to: T1 + 120, dataTimeframe: 'M1', spread: TICK0,
        commissionPerLot: 0, swapEnabled: false, approximate: false,
        model: { fill: 'gap', slFirst: false, closeAtEnd: true, triggerReplay: true }, path: 'auto', startCapital: 10_000, ...params,
      },
    };
  }

  async function job(req: RunRequest, fetchJson: (p: string) => Promise<unknown>, limits?: Parameters<typeof runJob>[4]) {
    const messages: WorkerMessage[] = [];
    await runJob(req, (m) => messages.push(m), fetchJson, undefined, limits);
    const last = messages[messages.length - 1];
    if (last.type !== 'result') throw new Error(JSON.stringify(last));
    return { messages, result: last.results[0] };
  }
  const line = (result: { log: { lines: { code: string; level: string; params?: Record<string, unknown> }[] } }, code: string) => result.log.lines.find((l) => l.code === code);
  const replayCalls = (calls: string[]) => calls.filter((c) => c.includes('/replay'));

  test('ein Abruf für Ein- und Ausstiegsminute; Durchgang 2 rechnet mit den Ticks und ist stabil', { tag: '@BKT-23' }, async () => {
    const calls: string[] = [];
    const { messages, result } = await job(request(), worker([C1, C2], SERVED, calls));
    // Durchgang 1 (Kerzenweg): Einstieg in T1, Ausstieg (Testende) in T1+60 → beide Minuten in einem Abruf
    expect(replayCalls(calls)).toEqual([`/market/acc/replay?symbol=XAUUSD&start=${T1}&m=0,1`]);
    // Durchgang 2: in T1 bleibt der Ask unter 2651, der Einstieg rückt nach T1+60 (schon in der Karte): kein dritter Durchgang
    expect(result.trades[0].entryTime).toBeGreaterThanOrEqual(T1 + 60);
    expect(result.trades[0].entryPrice).toBe(2651.06); // Ask 2651,10 löst aus, 1 ms später 2651,06
    expect(line(result, 'run.triggerReplay')).toMatchObject({ level: 'INFO', params: { passes: 2, minutes: 2, ticks: 7 } });
    const progress = messages.filter((m) => m.type === 'progress').map((m) => (m.type === 'progress' ? m.fraction : -1));
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  test('neue Minute nach Durchgang 2 gibt einen dritten Durchgang; die Grenze von 2 Durchgängen hält den Lauf davor an', { tag: '@BKT-23' }, async () => {
    // Offene Position am Testende: Durchgang 1 kennt nur die Einstiegsminute T1; ohne Einstieg dort wandert er nach T1+60
    const open = request({ model: { fill: 'gap', slFirst: false, closeAtEnd: false, triggerReplay: true } });
    const calls: string[] = [];
    const full = await job(open, worker([C1, C2], SERVED, calls));
    expect(replayCalls(calls)).toEqual([
      `/market/acc/replay?symbol=XAUUSD&start=${T1}&m=0`,
      `/market/acc/replay?symbol=XAUUSD&start=${T1 + 60}&m=0`,
    ]);
    expect(full.result.trades).toEqual([]);
    expect(line(full.result, 'run.triggerReplay')).toMatchObject({ params: { passes: 3, minutes: 2 } });
    const capped = await job(open, worker([C1, C2], SERVED, []), { passes: 2, minutes: 5000, ticks: 1_000_000 });
    expect(line(capped.result, 'run.triggerReplay')).toMatchObject({ params: { passes: 2, minutes: 1 } });
    const cappedCalls: string[] = [];
    await job(open, worker([C1, C2], SERVED, cappedCalls), { passes: 2, minutes: 5000, ticks: 1_000_000 });
    expect(replayCalls(cappedCalls)).toHaveLength(1);
  });

  test('Rückfall: ohne Schalter, mit „max“, „Aus der Kerze“, CSV oder Uferfehler 404 rechnet der Lauf wie heute', { tag: '@BKT-23' }, async () => {
    const off = request({ model: { fill: 'gap', slFirst: false, closeAtEnd: true } });
    const calls: string[] = [];
    const baseline = await job(off, worker([C1, C2], SERVED, calls));
    expect(replayCalls(calls)).toEqual([]);
    for (const spread of [{ mode: 'max', points: 0 }, { mode: 'candle' }] as const) {
      const c: string[] = [];
      const other = await job(request({ spread }), worker([C1, C2], SERVED, c));
      expect(replayCalls(c)).toEqual([]);
      expect(line(other.result, 'run.triggerReplay')).toBeUndefined();
    }
    const csvCalls: string[] = [];
    await job(request({ source: 'csv:abc' }), worker([C1, C2], SERVED, csvCalls));
    expect(replayCalls(csvCalls)).toEqual([]);
    const failed = await job(request(), worker([C1, C2], SERVED, [], 404));
    expect(JSON.stringify(failed.result.trades)).toBe(JSON.stringify(baseline.result.trades));
    expect(failed.result.summary).toEqual(baseline.result.summary);
    expect(line(failed.result, 'run.triggerReplayUnavailable')).toMatchObject({ level: 'WARN' });
    expect(line(failed.result, 'run.triggerReplay')).toBeUndefined();
  });

  test('Bündel zu groß: nur die frühesten Minuten werden abgerufen, Warnung mit der Zahl', { tag: '@BKT-23' }, async () => {
    const calls: string[] = [];
    const { result } = await job(request(), worker([C1, C2], SERVED, calls), { passes: 4, minutes: 1, ticks: 1_000_000 });
    expect(replayCalls(calls)).toEqual([`/market/acc/replay?symbol=XAUUSD&start=${T1}&m=0`]);
    expect(line(result, 'run.triggerReplayBudget')).toMatchObject({ level: 'WARN', params: { minutes: 1, dropped: 1 } });
  });

  test('Worker beschäftigt (missing busy): Minuten gelten als nicht abgespielt, Warnung, Ergebnis wie ohne Schalter', { tag: '@BKT-23' }, async () => {
    const calls: string[] = [];
    const busy = await job(request(), worker([C1, C2], SERVED, calls, undefined, true));
    const off = await job(request({ model: { fill: 'gap', slFirst: false, closeAtEnd: true } }), worker([C1, C2], SERVED, []));
    expect(JSON.stringify(busy.result.trades)).toBe(JSON.stringify(off.result.trades));
    expect(line(busy.result, 'run.triggerReplayBudget')).toMatchObject({ level: 'WARN', params: { minutes: 0, dropped: 2 } });
    expect(line(busy.result, 'run.triggerReplay')).toBeUndefined();
  });

  test('Abruf schlägt fehl: genau ein Durchgang und ein Abruf, kein Fortschritt über den Rest hinaus', { tag: '@BKT-23' }, async () => {
    const calls: string[] = [];
    const { messages } = await job(request(), worker([C1, C2], SERVED, calls, 404));
    expect(replayCalls(calls)).toHaveLength(1);
    const run = messages.filter((m) => m.type === 'progress' && m.phase === 'run').map((m) => (m.type === 'progress' ? m.fraction : -1));
    expect(run.filter((f) => f === 1)).toHaveLength(1);
  });
});
