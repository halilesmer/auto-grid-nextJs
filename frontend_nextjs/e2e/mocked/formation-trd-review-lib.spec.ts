/**
 * Trend (TRD): Prüffälle aus der Durchsicht des Trendzugs (Journal 2026-11-05).
 * Kerzen sind Zeilen [Open, High, Low, Close]; `zig` baut aus Wendepunkt-Preisen eine Reihe (4 Kerzen je Zug).
 * FRM-03 Formationserkennung: Trend
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { wilderAtr } from '../../src/lib/formation/indicators';
import { TRD_PARAMS } from '../../src/lib/formation/params';
import { buildTrend } from '../../src/lib/formation/trd';
import { analyzeTrd } from '../../src/lib/formation/trdChecks';
import type { FormationBar } from '../../src/lib/formation/types';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

type Row = [number, number, number, number];
const H4 = 14400;
const barsOf = (rows: Row[]): FormationBar[] => rows.map(([open, high, low, close], i) => ({ time: i * H4, open, high, low, close }));
const plain = (o: number, c: number): Row => [o, Math.max(o, c) + 0.1, Math.min(o, c) - 0.1, c];

function zig(points: number[], legs = 4, tail = 3): Row[] {
  const isHigh = (k: number) => (k + 1 < points.length ? points[k + 1] < points[k] : points[k - 1] < points[k]);
  const pivotRow = (prev: number, p: number, high: boolean): Row => {
    const c = high ? p - 0.2 : p + 0.2;
    return high ? [prev, p, Math.min(prev, c) - 0.1, c] : [prev, Math.max(prev, c) + 0.1, p, c];
  };
  const s = isHigh(0) ? -1 : 1;
  const rows: Row[] = [plain(points[0] + s * 2.2, points[0] + s * 2), plain(points[0] + s * 2, points[0] + s)];
  rows.push(pivotRow(points[0] + s, points[0], isHigh(0)));
  for (let k = 1; k < points.length; k++) {
    const from = points[k - 1];
    const to = points[k];
    let prev = rows[rows.length - 1][3];
    for (let j = 1; j < legs; j++) {
      const c = from + ((to - from) * j) / legs;
      rows.push(plain(prev, c));
      prev = c;
    }
    rows.push(pivotRow(prev, to, isHigh(k)));
  }
  const last = rows[rows.length - 1][3];
  const dir = isHigh(points.length - 1) ? -1 : 1;
  for (let j = 1; j <= tail; j++) rows.push(plain(j === 1 ? last : last + dir * 0.5 * (j - 1), last + dir * 0.5 * j));
  return rows;
}

const dipsOf = (m: ReturnType<typeof buildTrend>) => m.cands.filter((c) => c.isCorrection).map((c) => c.idx);

// Befund 5 (1105-R5): ein schwächeres Fraktal hinter einer verworfenen Korrektur zählt nicht, auch wenn davor ein schwächeres, aber
// ein noch schwächeres als das stärkste verworfene steht. Verglichen wird mit dem äußersten verworfenen Fraktal, nicht mit dem ältesten.
test('TRD-07: verworfene Korrektur: spätere schwächere Fraktale werden mit der äußersten verglichen', { tag: '@FRM-03' }, () => {
  // Hoch 120, dann drei zu kleine Tiefs: 118.5 (alt), 117.5 (äußerstes), 118 (schwächer als 117.5, stärker als 118.5? nein: flacher)
  const m = buildTrend('H4', barsOf(zig([80, 120, 118.5, 119.4, 117.5, 119.3, 118.0, 119.2, 118.3])), []);
  const kept = m.cands.filter((c) => c.isCorrection).map((c) => c.price);
  expect(kept).toEqual([118.5, 117.5]);
  expect(dipsOf(m)).toHaveLength(2);
});

// Befund 1 (1105-R1): das Messrechteck (Z-TRD-08) misst die gezeichnete Korrektur mit deren Mindestgröße, nicht mit der
// einer später verworfenen Korrektur.
test('TRD-08: Messrechteck nutzt die Mindestgröße der gezeichneten Korrektur', { tag: '@FRM-03' }, () => {
  const rows = zig([80, 120, 100, 140, 137]);
  const bars = barsOf(rows);
  const m = buildTrend('H4', bars, []);
  const drawn = m.cands.find((c) => c.drawn && c.isCorrection);
  const later = [...m.cands].reverse().find((c) => c.isCorrection);
  expect(drawn).toBeDefined();
  expect(later && !later.drawn).toBe(true);
  const want = TRD_PARAMS.trend.minSize * wilderAtr(bars, TRD_PARAMS.trend.atrPeriod)[drawn!.idx];
  expect(m.refCorrection).not.toBeCloseTo(want, 6); // der Fall unterscheidet beide Maße
  const found = analyzeTrd(new FormationContext('TEST', { H4: bars }, { trend: FIXTURE_TREND }), 100_000_000).find((a) => a.tf === 'H4');
  const box = found!.candidate.drawings.find((d) => d.id === 'Z-TRD-08');
  expect(box).toBeDefined();
  const [from, to] = box!.anchors;
  expect(Math.abs(to.price - from.price)).toBeCloseTo(want, 6);
});
