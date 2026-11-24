/**
 * BKT-31 (PR-4) Backtest: Kalibrierungsprofil aus W_c ableiten (deriveProfile), laden (loadCalibration) und ins
 * Laufprotokoll schreiben (runJob). Sentetik veri, kein Netz. Plan 1114-M1 §5.3.
 */
import { expect, test } from '@playwright/test';
import { CALIBRATE_DEFAULT, DEFAULT_PROFILE, derivedFor, REPLAY_LOOP_FROM_ACCOUNT_DEFAULT } from '../../src/lib/backtest/calibration';
import { calibrationFrom, deriveProfile } from '../../src/lib/backtest/calibrationDerive';
import { loadCalibration } from '../../src/lib/backtest/calibrationLoad';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
import { runJob } from '../../src/lib/backtest/runJob';
import type { LiveOrder } from '../../src/lib/backtest/startState';
import { scheduleFromLiveOrders, scheduleFromTelemetry, liveOpsFromOrders, type TelemetryTurns } from '../../src/lib/backtest/turnSchedule';
import type { SymbolDetail } from '../../src/store/types';

const TZ = 7200;
const WED = 1_791_331_200; // Mittwoch 00:00
const EVAL = WED + 10 * 3600;
const MAGIC = 200041;

const order = (i: number, setup: number, done = 0): LiveOrder => ({
  ticket: 1000 + i, time_setup: Math.floor(setup), time_setup_msc: Math.round(setup * 1000), time_done: Math.floor(done), time_done_msc: Math.round(done * 1000),
  type: 2, state: done > 0 ? 2 : 1, magic: MAGIC, symbol: 'XAUUSD', volume_initial: 0.1, price_open: 2640, sl: null, tp: 2645, comment: 'x', active: done === 0,
} as LiveOrder);

/** Cluster alle 10 s: 3 Kurz-Ops im Abstand `pending`, danach 2 Löschungen im Abstand `remove` (gesetzte Order wird gelöscht) */
function orders(base: number, clusters: number, pending: number, remove: number): LiveOrder[] {
  const out: LiveOrder[] = [];
  for (let c = 0; c < clusters; c++) {
    const t = base + c * 10;
    for (let k = 0; k < 3; k++) out.push(order(c * 10 + k, t + k * pending, t + 3 * pending + (k + 1) * remove));
  }
  return out;
}

test.describe('BKT-31 deriveProfile', () => {
  test('Kalibrierung ein, Bot-Takt aus, derivedFor(Vorgabekosten) = Vorgabe-Schwellen', { tag: '@BKT-31' }, () => {
    expect(CALIBRATE_DEFAULT).toBe(true);
    expect(REPLAY_LOOP_FROM_ACCOUNT_DEFAULT).toBe(false);
    expect(derivedFor(DEFAULT_PROFILE.broker.opCost)).toEqual(DEFAULT_PROFILE.derived);
  });

  test('Op-Kosten: p50 der Abstände im Cluster, Schwellen per Formel', { tag: '@BKT-31' }, () => {
    const from = EVAL - 3 * 86_400;
    const d = deriveProfile({ orders: orders(from + 100, 40, 0.3, 0.12), turns: null, magics: [MAGIC], from, to: EVAL, evalFrom: EVAL, tzOffsetSec: TZ });
    expect(d.profile.broker.opCost.pending).toBeCloseTo(0.3, 3);
    expect(d.profile.broker.opCost.remove).toBeCloseTo(0.12, 3);
    expect(d.profile.derived.clusterGapS).toBeCloseTo(0.9, 6); // 3 · 0,3
    expect(d.profile.measured).toEqual({ from, to: EVAL, source: 'orders' });
    expect(d.fallbacks).toEqual(expect.arrayContaining(['headS', 'opCost.sltp', 'clockShiftS']));
    expect(d.fallbacks).not.toContain('opCost.pending');
    // Telemetrie fehlt: Vorgabewerte bleiben
    expect(d.profile.vps.headS).toBe(DEFAULT_PROFILE.vps.headS);
    expect(d.profile.broker.opCost.sltp).toBe(DEFAULT_PROFILE.broker.opCost.sltp);
    expect(d.profile.broker.fillLatencyMs).toBe(DEFAULT_PROFILE.broker.fillLatencyMs);
  });

  test('W_c überlappt W_e: Vorgabeprofil; Orders in W_e fließen nie ein', { tag: '@BKT-31' }, () => {
    const from = EVAL - 3 * 86_400;
    const overlap = deriveProfile({ orders: orders(from + 100, 40, 0.3, 0.12), turns: null, magics: [MAGIC], from, to: EVAL + 1, evalFrom: EVAL, tzOffsetSec: TZ });
    expect(overlap.profile).toBe(DEFAULT_PROFILE);
    expect(overlap.fallbacks).toEqual(['all']);
    // Orders aus W_e mit anderen Abständen ändern die Messung nicht
    const clean = deriveProfile({ orders: orders(from + 100, 40, 0.3, 0.12), turns: null, magics: [MAGIC], from, to: EVAL, evalFrom: EVAL, tzOffsetSec: TZ });
    const mixed = deriveProfile({ orders: [...orders(from + 100, 40, 0.3, 0.12), ...orders(EVAL + 100, 200, 0.5, 0.5)], turns: null, magics: [MAGIC], from, to: EVAL, evalFrom: EVAL, tzOffsetSec: TZ });
    expect(mixed).toEqual(clean);
  });

  test('zu wenig Daten: Vorgabeprofil mit Kennzeichen', { tag: '@BKT-31' }, () => {
    const from = EVAL - 3 * 86_400;
    const d = deriveProfile({ orders: [], turns: null, magics: [MAGIC], from, to: EVAL, evalFrom: EVAL, tzOffsetSec: TZ });
    expect(d.profile).toBe(DEFAULT_PROFILE);
    expect(d.fallbacks).toEqual(['all']);
  });

  test('Telemetrie: Tur-Kopf, SLTP-Steigung, Zonen-Zusatz', { tag: '@BKT-31' }, () => {
    const from = EVAL - 3 * 86_400;
    const n = 200;
    const t0 = (from + 50 - TZ) * 1000;
    const nsl0 = Array.from({ length: n }, (_, i) => (i % 4));
    const turns: TelemetryTurns = {
      t0, dt: Array(n - 1).fill(2200), dur: Array(n).fill(150), kind: Array(n).fill('t'), pre: Array(n).fill(5),
      snap: Array(n).fill(20), z0: nsl0.map((k) => 20 + 30 + k * 100), nsl: nsl0, nsl0,
    };
    const d = deriveProfile({ orders: [], turns, magics: [MAGIC, MAGIC + 1], from, to: EVAL, evalFrom: EVAL, tzOffsetSec: TZ });
    expect(d.profile.broker.opCost.sltp).toBeCloseTo(0.1, 3);
    expect(d.fallbacks).not.toContain('opCost.sltp');
    expect(d.samples['opCost.sltp']).toBe(n);
  });

  test('calibrationFrom zählt nur Handelstage', { tag: '@BKT-31' }, () => {
    const MON = WED - 2 * 86_400;
    // Montag 10:00 → davor Freitag, Donnerstag, Mittwoch
    expect(calibrationFrom(MON + 10 * 3600, 3)).toBe(MON + 10 * 3600 - 5 * 86_400);
    // Mittwoch → Dienstag, Montag, Freitag (Wochenende zählt nicht)
    expect(calibrationFrom(EVAL, 3)).toBe(EVAL - 5 * 86_400);
  });

  test('Profil DEFAULT im Zeitplan: bytegleich zu ohne Profil', { tag: '@BKT-31' }, () => {
    const ops = liveOpsFromOrders(orders(EVAL, 12, 0.225, 0.102), [MAGIC], EVAL - 1, EVAL + 200);
    const a = scheduleFromLiveOrders(ops, [MAGIC], EVAL, EVAL + 200, 2);
    const b = scheduleFromLiveOrders(ops, [MAGIC], EVAL, EVAL + 200, 2, { profile: DEFAULT_PROFILE });
    expect(b).toEqual(a);
    const tel: TelemetryTurns = { t0: (EVAL - TZ) * 1000, dt: Array(40).fill(2105), dur: Array(41).fill(100), kind: Array(41).fill('t'), pre: Array(41).fill(0) };
    const c = scheduleFromTelemetry(tel, ops, [MAGIC], { tzOffsetSec: TZ, from: EVAL, to: EVAL + 80 });
    expect(scheduleFromTelemetry(tel, ops, [MAGIC], { tzOffsetSec: TZ, from: EVAL, to: EVAL + 80, profile: DEFAULT_PROFILE })).toEqual(c);
  });
});

test.describe('BKT-31 loadCalibration', () => {
  test('ruft nur W_c ab (Ende ≤ evalFrom); Fehler → Vorgabeprofil', { tag: '@BKT-31' }, async () => {
    const ranges: { kind: string; from: number; to: number }[] = [];
    const ok = await loadCalibration({
      evalFrom: EVAL, tzOffsetSec: TZ, magics: [MAGIC],
      fetchOrders: async (r) => { ranges.push({ kind: 'o', ...r }); return { orders: orders(r.from + 100, 40, 0.25, 0.1), missing: [] }; },
      fetchTurns: async (r) => { ranges.push({ kind: 't', from: r.from / 1000 + TZ, to: r.to / 1000 + TZ }); return null; },
    });
    expect(ok.to).toBe(EVAL);
    expect(ok.from).toBe(EVAL - 5 * 86_400);
    for (const r of ranges) expect(r.to).toBeLessThanOrEqual(EVAL);
    expect(ok.profile.broker.opCost.pending).toBeCloseTo(0.25, 3);
    const bad = await loadCalibration({
      evalFrom: EVAL, tzOffsetSec: TZ, magics: [MAGIC],
      fetchOrders: async () => { throw new Error('net'); },
      fetchTurns: async () => { throw new Error('net'); },
    });
    expect(bad.profile).toBe(DEFAULT_PROFILE);
    expect(bad.fallbacks).toEqual(['all']);
  });
});

// ------------------------------------------------------------------ runJob: Protokoll
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
  exit_timeframe: 'M15', entry_mode: 'grid', magic: MAGIC,
};
const ROWS = [[EVAL, 2650, 2651, 2649.5, 2650.5, 20], [EVAL + 60, 2650.5, 2651, 2650, 2650.8, 20]];
const calls: string[] = [];
const fetchJson = async (path: string) => {
  calls.push(path);
  const col = (i: number) => ROWS.map((r) => r[i]);
  return {
    t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: col(5), sa: col(5), sx: col(5),
    ahi: ROWS.map((r) => Math.round(r[2] / 0.01) + 20), alo: ROWS.map((r) => Math.round(r[3] / 0.01) + 20), g: ROWS.map(() => 1), tick_missing: [],
    replay: { t: [], kind: [], off: [0], ms: [], b: [], a: [] }, missing: [], next_from: null, digits: 2, point: 0.01,
  };
};
async function run(params: Partial<RunRequest['params']>) {
  const req: RunRequest = {
    type: 'run', runId: 1, apiBase: 'https://w.example/api', headers: {},
    params: {
      accountId: 'acc', zone: ZONE, symbol: DETAIL, from: EVAL, to: EVAL + 120, dataTimeframe: 'M1', spread: { mode: 'fixed', points: 20 },
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

test.describe('BKT-31 run.calibration', () => {
  test('ohne calibration: kein Abruf von W_c, Protokoll ohne Eintrag', { tag: '@BKT-31' }, async () => {
    calls.length = 0;
    const plain = await run({});
    expect(calls.some((c) => c.includes('/orders') || c.includes('/turns'))).toBe(false);
    expect(plain.log.lines.some((l) => l.code.startsWith('run.calibration'))).toBe(false);
  });

  test('calibration ohne Daten: WARN run.calibrationDefault, Ergebnis wie ohne', { tag: '@BKT-31' }, async () => {
    const plain = await run({});
    calls.length = 0;
    const r = await run({ calibration: { tzOffsetSec: TZ, magics: [MAGIC] } });
    // nur GET auf Orders und Turen, W_c endet bei from
    expect(calls.some((c) => c.includes('/history/acc/orders?') && c.endsWith(`&to=${EVAL}`))).toBe(true);
    expect(r.log.lines.find((l) => l.code === 'run.calibrationDefault')?.level).toBe('WARN');
    expect(r.trades).toEqual(plain.trades);
    expect(r.summary).toEqual(plain.summary);
  });

  test('calibration mit Profil: INFO run.calibration mit Werten', { tag: '@BKT-31' }, async () => {
    const from = EVAL - 3 * 86_400;
    const d = deriveProfile({ orders: orders(from + 100, 40, 0.3, 0.12), turns: null, magics: [MAGIC], from, to: EVAL, evalFrom: EVAL, tzOffsetSec: TZ });
    const r = await run({ calibration: { tzOffsetSec: TZ, magics: [MAGIC], profile: { profile: d.profile, fallbacks: d.fallbacks, from, to: EVAL } } });
    const line = r.log.lines.find((l) => l.code === 'run.calibration');
    expect(line?.level).toBe('INFO');
    expect(line?.params).toMatchObject({ id: 'derived', from, to: EVAL, source: 'orders', pending: 0.3, remove: 0.12 });
  });
});
