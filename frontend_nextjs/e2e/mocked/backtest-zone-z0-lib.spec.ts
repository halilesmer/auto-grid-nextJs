/**
 * BKT-31 (PR-3) Backtest: Zone-Anfang aus Telemetrie z0 (Tur-Anfang + z0 + Summe der unteren Zonen).
 * Rein, sentetik veri. Plan 1114-M1 §3.3 Madde 5, §4.1, §4.2.
 */
import { expect, test } from '@playwright/test';
import { DEFAULT_PROFILE, derivedFor, type CalibrationProfile } from '../../src/lib/backtest/calibration';
import { scheduleFromLiveOrders, scheduleFromTelemetry, type LiveOp, type TelemetryTurns } from '../../src/lib/backtest/turnSchedule';

const MAGICS = [200041, 200042, 200043];
const T0 = 100_000; // ms
const WINDOW = { tzOffsetSec: 0, from: 0, to: 1_000 };

const tel = (z0: (number | null)[], snap: (number | null)[] = [30, 30, 30]): TelemetryTurns => ({
  t0: T0,
  dt: [2100, 2100],
  dur: [2100, 2100, 2100],
  kind: ['t', 't', 't'],
  pre: [4, 4, 4],
  snap,
  z0,
});

test.describe('BKT-31 zoneAt aus z0', () => {
  test('ohne z0 (alte Zeile): heutige Formel, Tur-Anfang + pre + HEAD + untere Ops', { tag: '@BKT-31' }, () => {
    const ops: LiveOp[] = [{ time: 100.4, kind: 'P', magic: 200041 }];
    const old = scheduleFromTelemetry(tel([null, null, null]), ops, MAGICS, { ...WINDOW, sltp: 'none' });
    const plain: TelemetryTurns = { t0: T0, dt: [2100, 2100], dur: [2100, 2100, 2100], kind: ['t', 't', 't'], pre: [4, 4, 4] };
    const base = scheduleFromTelemetry(plain, ops, MAGICS, { ...WINDOW, sltp: 'none' });
    expect(old.zoneAt).toEqual(base.zoneAt);
    expect(old.z0Turns).toBe(0);
    expect(old.zoneBeforeSnap).toBe(0);
    expect(old.zoneAt[200041][0]).toBeCloseTo(old.starts[0] + 0.004 + 0.105, 9);
  });

  test('mit z0: Zone-Anfang = start + z0 + Summe der Op-Kosten unterer Zonen', { tag: '@BKT-31' }, () => {
    const ops: LiveOp[] = [
      { time: 100.4, kind: 'P', magic: 200041 },
      { time: 100.6, kind: 'C', magic: 200042 },
      { time: 100.7, kind: 'P', magic: 200043 },
    ];
    const s = scheduleFromTelemetry(tel([60, 60, 60]), ops, MAGICS, WINDOW);
    const start = s.starts[0];
    expect(s.z0Turns).toBe(3);
    expect(s.zoneAt[200041][0]).toBeCloseTo(start + 0.06, 9); // keine untere Zone
    expect(s.zoneAt[200042][0]).toBeCloseTo(start + 0.06 + 0.225, 9); // + P von 200041
    expect(s.zoneAt[200043][0]).toBeCloseTo(start + 0.06 + 0.225 + 0.102, 9); // + P von 200041 + C von 200042
    expect(s.zoneAt[200043][1]).toBeCloseTo(s.starts[1] + 0.06, 9); // Tur ohne Ops
  });

  test('zoneOverhead zählt für jede untere Zone, auch ohne Op', { tag: '@BKT-31' }, () => {
    const opCost = DEFAULT_PROFILE.broker.opCost;
    const profile: CalibrationProfile = { ...DEFAULT_PROFILE, id: 'test', vps: { ...DEFAULT_PROFILE.vps, zoneOverheadS: 0.004 }, derived: derivedFor(opCost) };
    const s = scheduleFromTelemetry(tel([60, 60, 60]), [], MAGICS, { ...WINDOW, profile });
    expect(s.zoneAt[200041][0]).toBeCloseTo(s.starts[0] + 0.06, 9);
    expect(s.zoneAt[200042][0]).toBeCloseTo(s.starts[0] + 0.06 + 0.004, 9);
    expect(s.zoneAt[200043][0]).toBeCloseTo(s.starts[0] + 0.06 + 0.008, 9);
  });

  test('gemischt: nur Turen mit z0 nehmen den neuen Weg', { tag: '@BKT-31' }, () => {
    const s = scheduleFromTelemetry(tel([null, 70, null]), [], MAGICS, WINDOW);
    expect(s.z0Turns).toBe(1);
    expect(s.zoneAt[200041][0]).toBeCloseTo(s.starts[0] + 0.004 + 0.105, 9);
    expect(s.zoneAt[200041][1]).toBeCloseTo(s.starts[1] + 0.07, 9);
  });

  test('zoneAt < snapAt → snapAt, gezählt je Tur × Setup', { tag: '@BKT-31' }, () => {
    const s = scheduleFromTelemetry(tel([10, 60, 60], [30, 30, 30]), [], MAGICS, WINDOW);
    expect(s.zoneBeforeSnap).toBe(3); // Tur 0, drei Setups: 0,01 < 0,03
    for (const m of MAGICS) expect(s.zoneAt[m][0]).toBeCloseTo(s.starts[0] + 0.03, 9);
    expect(s.zoneAt[200041][1]).toBeCloseTo(s.starts[1] + 0.06, 9);
  });

  test('liveOrders-Quelle bleibt unberührt (Zähler 0)', { tag: '@BKT-31' }, () => {
    const ops: LiveOp[] = [{ time: 100.4, kind: 'P', magic: 200041 }];
    const s = scheduleFromLiveOrders(ops, MAGICS, 0, 200, 2);
    expect(s.z0Turns).toBe(0);
    expect(s.zoneBeforeSnap).toBe(0);
    // irgendeine Tur: Tur-Anfang + HEAD + untere Op-Kosten (200041 hat ein P)
    const k = s.starts.findIndex((st, i) => Math.abs(s.zoneAt[200042][i] - (st + 0.105 + 0.225)) < 1e-9);
    expect(k).toBeGreaterThanOrEqual(0);
  });
});
