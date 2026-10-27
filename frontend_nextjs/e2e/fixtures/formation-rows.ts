/**
 * Handgebaute Kerzenreihen der Formationstests (FIB, SIG). Kerzen sind Zeilen [Open, High, Low, Close].
 * `zig` baut aus Wendepunkt-Preisen eine Reihe: Der Wendepunkt ist genau das Dochtende einer Kerze, dazwischen laufen
 * die Schlusskurse linear (standardmäßig 4 Kerzen je Zug). Der k-te Wendepunkt liegt auf Index 2 + Summe der Zuglängen davor.
 */
import type { FormationBar } from '../../src/lib/formation/types';

export type Row = [number, number, number, number];

export const H1 = 3600;
export const H4 = 14400;
export const D1 = 86400;
export const M15 = 900;
export const END = 100_000_000;

export const barsOf = (rows: Row[], step = H4, start = 0): FormationBar[] =>
  rows.map(([open, high, low, close], i) => ({ time: start + i * step, open, high, low, close }));

export const plain = (o: number, c: number): Row => [o, Math.max(o, c) + 0.1, Math.min(o, c) - 0.1, c];
export const mirror = (rows: Row[], axis = 200): Row[] => rows.map(([o, h, l, c]) => [axis - o, axis - l, axis - h, axis - c]);

/** Fortsetzung einer Reihe: Schlusskurse, jede Kerze öffnet beim Schluss der vorigen */
export const walk = (from: number, closes: number[]): Row[] => closes.map((c, i): Row => plain(i === 0 ? from : closes[i - 1], c));

/** Wendepunkte als Preise; zwei Vorlaufkerzen, am Ende `tail` Kerzen, die 0,5 je Kerze zurücklaufen */
export function zig(points: number[], legs: number | number[] = 4, tail = 3): Row[] {
  const legLen = (i: number) => (Array.isArray(legs) ? legs[i] : legs);
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
    const n = legLen(k - 1);
    let prev = rows[rows.length - 1][3];
    for (let j = 1; j < n; j++) {
      const c = from + ((to - from) * j) / n;
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

export const patched = (rows: Row[], at: number, row: Row): Row[] => rows.map((r, i) => (i === at ? row : r));
