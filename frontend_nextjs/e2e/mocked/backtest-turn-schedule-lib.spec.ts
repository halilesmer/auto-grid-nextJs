/**
 * BKT-30 (PR-2) Backtest: canlı tur takvimi üretimi (saf fonksiyonlar, sentetik veri). Plan 1113 bt-n1-plan.md §3.1, §9 K39.1.
 */
import { expect, test } from '@playwright/test';
import { BOT_OP_COST_S } from '../../src/lib/backtest/botTurns';
import {
  botTurnsFor,
  clusterOps,
  decodeTurns,
  estimateClockOffset,
  liveOpsFromOrders,
  scheduleFromLiveOrders,
  scheduleFromTelemetry,
  TURN_HEAD_S,
  type LiveOp,
  type TelemetryTurns,
} from '../../src/lib/backtest/turnSchedule';
import type { LiveOrder } from '../../src/lib/backtest/startState';

const P = (time: number, magic: number): LiveOp => ({ time, kind: 'P', magic });
const C = (time: number, magic: number): LiveOp => ({ time, kind: 'C', magic });
const LOOP = 2;
const PERIOD = LOOP + TURN_HEAD_S;
const MAGICS = [200041, 200042, 200043];

test.describe('BKT-30 turnSchedule', () => {
  test('Yedek kaynak: ardışık kümeler zincir kurar (tur başı = önceki bitiş + LOOP)', { tag: '@BKT-30' }, () => {
    const ops = [P(100.105, 200041), P(100.33, 200041), P(102.66, 200041), C(102.89, 200042)];
    const s = scheduleFromLiveOrders(ops, MAGICS, 90, 120, LOOP);
    // küme 1: 100.0'da başlar, bitiş 100.33 + 0.225 = 100.555 → zincir: tur 2 = 102.555
    expect(s.starts[s.starts.indexOf(s.starts.find((x) => Math.abs(x - 100) < 1e-9) as number) + 1]).toBeCloseTo(102.555, 9);
    expect(s.source).toBe('liveOrders');
    expect(s.alignedClusters).toBe(2);
    expect(s.opCounts).toBe('live');
  });

  test('Yedek kaynak: boş turlar bir sonraki gerçek tura geriye hizalı, 1,14 s\'lik sahte tur oluşmaz', { tag: '@BKT-30' }, () => {
    const ops = [P(100.105, 200041), P(110.0, 200042)];
    const s = scheduleFromLiveOrders(ops, MAGICS, 100, 112, LOOP);
    // ikinci tur 109.895; geriye 2.105 aralıkla dizilir
    expect(s.starts).toContain(109.895);
    const gaps = s.starts.slice(1).map((x, i) => x - s.starts[i]);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(LOOP);
    // aralık hizalı: son iki başlangıç tam periyot uzaklıkta
    expect(s.starts.at(-1)! - s.starts.at(-2)!).toBeCloseTo(PERIOD, 9);
    // ileri dolgu 102.33 + k·2.105 → 109.895 ile 1.355 s'lik tur üretirdi; burada yok
    expect(gaps.some((g) => g < LOOP)).toBe(false);
  });

  test('Zone sırası: zoneAt = tur başı + okuma + küçük magic\'lerin op maliyeti', { tag: '@BKT-30' }, () => {
    const ops = [P(100.105, 200041), P(100.33, 200041), C(100.555, 200042)];
    const s = scheduleFromLiveOrders(ops, MAGICS, 90, 110, LOOP);
    const k = s.starts.findIndex((x) => Math.abs(x - 100) < 1e-9);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(s.zoneAt[200041][k]).toBeCloseTo(100 + TURN_HEAD_S, 9);
    expect(s.zoneAt[200042][k]).toBeCloseTo(100 + TURN_HEAD_S + 2 * BOT_OP_COST_S.pending, 9);
    expect(s.zoneAt[200043][k]).toBeCloseTo(100 + TURN_HEAD_S + 2 * BOT_OP_COST_S.pending + BOT_OP_COST_S.remove, 9);
    const turns = botTurnsFor(s, 200042);
    expect(turns.zoneAt).toBe(s.zoneAt[200042]);
    expect(turns.zoneAt.length).toBe(turns.starts.length);
  });

  test('G4.1: ownOps verilirse alt magic maliyeti BT\'nin kendi op\'larından gelir', { tag: '@BKT-30' }, () => {
    const live = [P(100.105, 200041), P(100.33, 200041)];
    const own = [P(100.2, 200041)];
    const s = scheduleFromLiveOrders(live, MAGICS, 90, 110, LOOP, { ownOps: own });
    const k = s.starts.findIndex((x) => Math.abs(x - 100) < 1e-9);
    expect(s.opCounts).toBe('own');
    expect(s.zoneAt[200042][k]).toBeCloseTo(100 + TURN_HEAD_S + BOT_OP_COST_S.pending, 9);
  });

  test('Telemetri: bilinen kaymalı sentetik veriden kayma tahmini', { tag: '@BKT-30' }, () => {
    const TZ = 7200;
    const SHIFT = 0.37;
    const T0 = 1_794_600_000_000; // UTC ms
    const n = 120;
    const dt: number[] = [];
    const dur: number[] = [];
    const pre: number[] = [];
    const kind: string[] = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) dt.push(2100 + (i % 3) * 10);
      dur.push(75);
      pre.push(4);
      kind.push('t');
    }
    const telemetry: TelemetryTurns = { t0: T0, dt, dur, kind, pre };
    const turns = decodeTurns(telemetry);
    expect(turns).toHaveLength(n);
    // her 4. turda bir küme; ilk op = tur başı + tz + shift + pre + HEAD (+ SLTP yükü bazılarında)
    const ops: LiveOp[] = [];
    for (let i = 3; i < n; i += 4) {
      const sltp = i % 12 === 3 ? 0.4 : 0;
      ops.push(P(turns[i].start + TZ + SHIFT + 0.004 + TURN_HEAD_S + sltp, 200041));
    }
    const clock = estimateClockOffset(turns, ops.map((o) => o.time), TZ);
    expect(clock.reliable).toBe(true);
    expect(clock.pairs).toBe(ops.length);
    expect(clock.shiftSec).toBeCloseTo(SHIFT, 6);
    expect(clock.p10).toBeCloseTo(0, 6);
    expect(clock.p90).toBeGreaterThan(0.3); // SLTP kuyruğu pozitif uçta
    const s = scheduleFromTelemetry(telemetry, ops, MAGICS, { tzOffsetSec: TZ, from: 0, to: 1e12 });
    expect(s.source).toBe('telemetry');
    expect(s.turnCount).toBe(n);
    expect(s.starts[0]).toBeCloseTo(turns[0].start + TZ + SHIFT, 6);
    expect(s.clock?.shiftSec).toBeCloseTo(SHIFT, 6);
    // SLTP'li turda zone başı = ilk op zamanı (200041 en küçük magic)
    expect(s.zoneAt[200041][3]).toBeCloseTo(ops[0].time, 6);
    expect(s.zoneAt[200041][7]).toBeCloseTo(ops[1].time, 6);
    // sltp: 'none' ise ilk op'a ulaşmaz
    const none = scheduleFromTelemetry(telemetry, ops, MAGICS, { tzOffsetSec: TZ, from: 0, to: 1e12, sltp: 'none' });
    expect(none.zoneAt[200041][3]).toBeCloseTo(ops[0].time - 0.4, 6);
  });

  test('Telemetri: kind≠t turları atlanır, dt zaman çizgisini taşır', { tag: '@BKT-30' }, () => {
    const telemetry: TelemetryTurns = {
      t0: 1_794_600_000_000,
      dt: [2000, 2000, 2000, 2000],
      dur: [75, 10, 10, 10, 80],
      kind: ['t', 'm', 'c', 'n', 't'],
      pre: [4, 0, 0, 0, 5],
    };
    const decoded = decodeTurns(telemetry);
    expect(decoded).toHaveLength(2);
    expect(decoded[1].start - decoded[0].start).toBeCloseTo(8, 9);
    const s = scheduleFromTelemetry(telemetry, [], MAGICS, { tzOffsetSec: 0, from: 0, to: 1e12 });
    expect(s.turnCount).toBe(2);
    expect(s.clock?.reliable).toBe(false);
    expect(s.clock?.shiftSec).toBe(0);
    expect(decodeTurns({ t0: null, dt: [], dur: [], kind: [], pre: [] })).toEqual([]);
  });

  test('liveOpsFromOrders: kurma ve bot silmesi (state 2), pencere ve magic süzgeci; clusterOps 0,8 s ile böler', { tag: '@BKT-30' }, () => {
    const row = (magic: number, setup: number, done: number, state: number) =>
      ({ ticket: 1, time_setup: 0, time_setup_msc: setup * 1000, time_done: 0, time_done_msc: done * 1000, type: 2, state, magic, symbol: 'X', volume_initial: 0.01, price_open: 1, sl: null, tp: null, comment: null }) as LiveOrder;
    const ops = liveOpsFromOrders([row(200041, 100, 100.3, 2), row(200041, 105, 106, 4), row(999, 100, 0, 2)], MAGICS, 50, 200);
    expect(ops.map((o) => `${o.kind}${o.time}`)).toEqual(['P100', 'C100.3', 'P105']);
    expect(clusterOps(ops)).toHaveLength(2);
  });
});
