/**
 * BKT-31 (PR-1) Backtest: Kurslesezeit je Tur (snapAt), Telemetrie-Felder beim Zusammenfügen und Kalibrierungsprofil.
 * Rein, sentetik veri. Plan 1114-M1 §3.2, §5.2.
 */
import { expect, test } from '@playwright/test';
import { BOT_OP_COST_S, botTurnsActive } from '../../src/lib/backtest/botTurns';
import { mergeTelemetry } from '../../src/lib/backtest/botTurnsLoad';
import { DEFAULT_PROFILE } from '../../src/lib/backtest/calibration';
import { REPLAY_FILL_LATENCY_MS } from '../../src/lib/backtest/runner';
import {
  botTurnsFor,
  decodeTurns,
  OP_CLUSTER_GAP_S,
  scheduleFromLiveOrders,
  scheduleFromTelemetry,
  TURN_HEAD_S,
  type LiveOp,
  type TelemetryTurns,
} from '../../src/lib/backtest/turnSchedule';

const MAGICS = [200041, 200042];

test.describe('BKT-31 snapAt / Profil', () => {
  test('DEFAULT_PROFILE trägt die bisherigen Konstanten unverändert', { tag: '@BKT-31' }, () => {
    expect(DEFAULT_PROFILE.broker.opCost).toEqual({ pending: 0.225, remove: 0.102, sltp: 0.1 });
    expect(BOT_OP_COST_S).toEqual({ pending: 0.225, remove: 0.102, sltp: 0.1 });
    expect(TURN_HEAD_S).toBe(0.105);
    expect(OP_CLUSTER_GAP_S).toBe(0.8);
    expect(REPLAY_FILL_LATENCY_MS).toBe(5);
    expect(DEFAULT_PROFILE.derived.chainSlackS).toBe(0.7);
    expect(DEFAULT_PROFILE.measured).toBeNull();
  });

  test('mergeTelemetry behält snap, nsl, z0, nsl0 (fehlend → null)', { tag: '@BKT-31' }, () => {
    const a: TelemetryTurns = { t0: 1000, dt: [100], dur: [1, 2], kind: ['t', 't'], pre: [0, 0], snap: [10, 20], nsl: [1, 2], z0: [30, 40], nsl0: [1, 0] };
    const b: TelemetryTurns = { t0: 1500, dt: [100], dur: [3, 4], kind: ['t', 'm'], pre: [0, 0] }; // alter Worker: ohne Messfelder
    const m = mergeTelemetry([a, b]);
    expect(m.snap).toEqual([10, 20, null, null]);
    expect(m.nsl).toEqual([1, 2, null, null]);
    expect(m.z0).toEqual([30, 40, null, null]);
    expect(m.nsl0).toEqual([1, 0, null, null]);
    const d = decodeTurns(m);
    expect(d[0].nsl0).toBe(1);
    expect(d[1].nsl0).toBe(0);
    expect(d[2].nsl0).toBeNull();
  });

  test('scheduleFromTelemetry: snapAt = start + snap, snap null → start; botTurnsFor reicht es durch', { tag: '@BKT-31' }, () => {
    const tel: TelemetryTurns = { t0: 100_000, dt: [2100, 2100], dur: [75, 75, 75], kind: ['t', 't', 't'], pre: [4, 4, 4], snap: [30, null, 50] };
    const s = scheduleFromTelemetry(tel, [] as LiveOp[], MAGICS, { tzOffsetSec: 0, from: 0, to: 1_000 });
    expect(s.snapAt).toHaveLength(3);
    expect(s.snapAt[0]).toBeCloseTo(s.starts[0] + 0.03, 9);
    expect(s.snapAt[1]).toBe(s.starts[1]);
    expect(s.snapAt[2]).toBeCloseTo(s.starts[2] + 0.05, 9);
    const turns = botTurnsFor(s, MAGICS[0]);
    expect(botTurnsActive(turns)).toBe(true);
    expect(turns.snapAt).toEqual(s.snapAt);
  });

  test('scheduleFromLiveOrders: snapAt = starts', { tag: '@BKT-31' }, () => {
    const ops: LiveOp[] = [{ time: 100.105, kind: 'P', magic: 200041 }];
    const s = scheduleFromLiveOrders(ops, MAGICS, 90, 120, 2);
    expect(s.snapAt).toEqual(s.starts);
  });
});
