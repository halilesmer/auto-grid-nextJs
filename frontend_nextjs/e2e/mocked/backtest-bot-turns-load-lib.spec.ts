/**
 * BKT-30 (PR-3) Backtest: Tur-Raster im Live-Vergleich laden (loadBotTurns) und ins Laufprotokoll schreiben (runJob).
 * Sentetik veri, ağ yok: Abrufe sind Stubs, die Aufrufe werden gezählt.
 */
import { expect, test } from '@playwright/test';
import { BOT_TURNS_DEFAULT } from '../../src/lib/backtest/botTurns';
import { loadBotTurns, mergeTelemetry, type BotTurnsLoadInput } from '../../src/lib/backtest/botTurnsLoad';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
import { runJob } from '../../src/lib/backtest/runJob';
import type { LiveOrder } from '../../src/lib/backtest/startState';
import type { TelemetryTurns } from '../../src/lib/backtest/turnSchedule';
import type { SymbolDetail } from '../../src/store/types';

const TZ = 7200;
const T = 1_791_331_200 + 10 * 3600; // Brokersekunde, Mittwoch 10:00
const MAGICS = [200041, 200042];
const PERIOD_MS = 2105;

const order = (i: number, timeSec: number): LiveOrder => ({
  ticket: 100 + i, time_setup: Math.floor(timeSec), time_setup_msc: Math.round(timeSec * 1000), time_done: 0, time_done_msc: 0, type: 2, state: 1,
  magic: MAGICS[0], symbol: 'XAUUSD', volume_initial: 0.1, price_open: 2640, sl: null, tp: 2645, comment: 'x', active: true,
} as LiveOrder);

/** Telemetrie für [T, T+60): eine volle Tur alle 2,105 s, UTC */
function telemetry(): TelemetryTurns {
  const t0 = (T - TZ) * 1000;
  const n = 28;
  return { t0, dt: Array(n - 1).fill(PERIOD_MS), dur: Array(n).fill(2100), kind: Array(n).fill('t'), pre: Array(n).fill(0) };
}

function input(over: Partial<BotTurnsLoadInput>, calls: string[]): BotTurnsLoadInput {
  return {
    enabled: true, live: true, from: T, to: T + 60, nowSec: T + 3600, tzOffsetSec: TZ, loopSec: 2, magics: MAGICS,
    fetchOrders: async () => { calls.push('orders'); return { orders: [order(1, T + 10.105), order(2, T + 30.21)], missing: [] }; },
    fetchTurns: async () => { calls.push('turns'); return telemetry(); },
    ...over,
  };
}

test.describe('BKT-30 loadBotTurns', () => {
  test('Vorgabe ist aus: kein Abruf, kein Raster, kein Protokolleintrag', { tag: '@BKT-30' }, async () => {
    expect(BOT_TURNS_DEFAULT).toBe(false);
    const calls: string[] = [];
    const { enabled: _enabled, ...rest } = input({}, calls);
    void _enabled;
    const out = await loadBotTurns(rest);
    expect(out).toEqual({ schedule: null, info: null });
    expect(calls).toEqual([]);
  });

  test('Telemetrie vorhanden: Quelle telemetry', { tag: '@BKT-30' }, async () => {
    const calls: string[] = [];
    const out = await loadBotTurns(input({}, calls));
    expect(out.info?.source).toBe('telemetry');
    expect(out.info?.turns).toBeGreaterThan(20);
    expect(out.schedule?.starts.length).toBe(out.info?.turns);
    expect(calls.sort()).toEqual(['orders', 'turns']);
  });

  test('Telemetrie leer oder Fehler: Quelle liveOrders', { tag: '@BKT-30' }, async () => {
    for (const fetchTurns of [
      async () => ({ t0: null, dt: [], dur: [], kind: [], pre: [] }),
      async (): Promise<TelemetryTurns | null> => { throw new Error('404'); },
    ]) {
      const out = await loadBotTurns(input({ fetchTurns }, []));
      expect(out.info?.source).toBe('liveOrders');
      expect(out.info?.turns).toBeGreaterThan(0);
      expect(out.info?.totalClusters).toBe(2);
    }
  });

  test('Telemetrie deckt den Fensteranfang nicht ab: liveOrders', { tag: '@BKT-30' }, async () => {
    const late = telemetry();
    late.t0 = (late.t0 as number) + 600_000;
    const out = await loadBotTurns(input({ fetchTurns: async () => late }, []));
    expect(out.info?.source).toBe('liveOrders');
  });

  test('Nur Backtest (keine Live-Daten): Quelle off, kein Abruf', { tag: '@BKT-30' }, async () => {
    const calls: string[] = [];
    const out = await loadBotTurns(input({ live: false }, calls));
    expect(out.schedule).toBeNull();
    expect(out.info?.source).toBe('off');
    expect(calls).toEqual([]);
  });

  test('Weder Telemetrie noch Orders: off', { tag: '@BKT-30' }, async () => {
    const out = await loadBotTurns(input({ fetchOrders: async () => ({ orders: [] }), fetchTurns: async () => ({ t0: null, dt: [], dur: [], kind: [], pre: [] }) }, []));
    expect(out.info?.source).toBe('off');
  });

  test('Fenster über 2 Tage: Telemetrie in Stücken von höchstens 2 Tagen', { tag: '@BKT-30' }, async () => {
    const ranges: number[] = [];
    await loadBotTurns(input({ to: T + 5 * 86400, fetchTurns: async (r) => { ranges.push(r.to - r.from); return { t0: null, dt: [], dur: [], kind: [], pre: [] }; } }, []));
    expect(ranges.length).toBe(3);
    expect(Math.max(...ranges)).toBeLessThanOrEqual(2 * 86_400_000);
  });

  test('mergeTelemetry verbindet Stücke mit der richtigen Lücke', { tag: '@BKT-30' }, () => {
    const a: TelemetryTurns = { t0: 1000, dt: [100], dur: [1, 2], kind: ['t', 't'], pre: [0, 0] };
    const b: TelemetryTurns = { t0: 1500, dt: [100], dur: [3, 4], kind: ['t', 'm'], pre: [0, 0] };
    const m = mergeTelemetry([a, b]);
    expect(m.t0).toBe(1000);
    expect(m.dt).toEqual([100, 400, 100]);
    expect(m.kind).toEqual(['t', 't', 't', 'm']);
  });
});

// ------------------------------------------------------------------ runJob: Protokolleintrag
const DETAIL: SymbolDetail = {
  name: 'XAUUSD', digits: 2, point: 0.01, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_mode: 4,
  currency_base: 'XAU', currency_profit: 'USD', currency_margin: 'XAU', trade_tick_value: 1, trade_tick_size: 0.01,
  trade_contract_size: 100, trade_calc_mode: 2, trade_tick_value_profit: 1, trade_tick_value_loss: 1, swap_mode: 4,
  swap_long: -6.5, swap_short: 2, swap_rollover3days: 3, spread: 20, trade_stops_level: 0,
};
const ZONE = {
  id: 'z1', symbol: 'XAUUSD', order_type: 'BUY', min_price: 2600, max_price: 2700, grid_step: 1, lot_size: 0.1,
  take_profit: 5, stop_loss: 0, sell_grid_step: 1, sell_lot_size: 0.1, sell_take_profit: 5, sell_stop_loss: 0,
  is_breakout: false, is_active: true, levels_below: 2, levels_above: 2, sync_buy_sell: false,
  exit_timeframe: 'M15', entry_mode: 'grid', magic: MAGICS[0],
};
const ROWS = [[T, 2650, 2651, 2649.5, 2650.5, 20], [T + 60, 2650.5, 2651, 2650, 2650.8, 20]];
const fetchJson = async () => {
  const col = (i: number) => ROWS.map((r) => r[i]);
  return {
    t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: col(5), sa: col(5), sx: col(5),
    ahi: ROWS.map((r) => Math.round(r[2] / 0.01) + 20), alo: ROWS.map((r) => Math.round(r[3] / 0.01) + 20), g: ROWS.map(() => 1), tick_missing: [],
    replay: { t: [], kind: [], off: [0], ms: [], b: [], a: [] }, missing: [], next_from: null, digits: 2, point: 0.01,
  };
};
async function log(params: Partial<RunRequest['params']>) {
  const req: RunRequest = {
    type: 'run', runId: 1, apiBase: 'https://w.example/api', headers: {},
    params: {
      accountId: 'acc', zone: ZONE, symbol: DETAIL, from: T, to: T + 120, dataTimeframe: 'M1', spread: { mode: 'fixed', points: 20 },
      commissionPerLot: 0, swapEnabled: false, approximate: false, model: { fill: 'gap', slFirst: false, closeAtEnd: true, triggerReplay: false },
      path: 'auto', startCapital: 10_000, ...params,
    },
  };
  const messages: WorkerMessage[] = [];
  await runJob(req, (m) => messages.push(m), fetchJson);
  const last = messages[messages.length - 1];
  if (last.type !== 'result') throw new Error(JSON.stringify(last));
  return last.results[0];
}

test.describe('BKT-30 run.botTurns', () => {
  test('ohne botTurnsInfo: Protokoll bytegleich, kein Eintrag', { tag: '@BKT-30' }, async () => {
    const plain = await log({});
    expect(plain.log.lines.some((l) => l.code === 'run.botTurns')).toBe(false);
    expect(await log({ botTurnsInfo: undefined })).toEqual(plain);
  });

  test('mit botTurnsInfo: Eintrag mit Quelle, Turzahl und Uhr', { tag: '@BKT-30' }, async () => {
    const r = await log({ botTurnsInfo: { source: 'telemetry', turns: 27, alignedClusters: 6, totalClusters: 7, clockShiftSec: 0.12, clockReliable: true } });
    const line = r.log.lines.find((l) => l.code === 'run.botTurns');
    expect(line?.level).toBe('INFO');
    expect(line?.params).toMatchObject({ source: 'telemetry', turns: 27, alignedClusters: 6, totalClusters: 7, clockShiftSec: 0.12 });
    const off = await log({ botTurnsInfo: { source: 'off', turns: 0, alignedClusters: 0, totalClusters: 0 } });
    expect(off.log.lines.find((l) => l.code === 'run.botTurns')?.params?.source).toBe('off');
  });
});
