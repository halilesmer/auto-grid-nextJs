/**
 * Gemeinsame Bausteine der Tests für Butterfly und Crab (XABCD mit D jenseits von X).
 * `harmonic(punkte, LEGS)` setzt 40 flache Vorlaufkerzen (Wave und RSI brauchen Anlauf) vor die Wendepunkte X, A, B, C, D.
 * `makeRun(check)` prüft X, A, B, C (und D) einer Kauf-Formation (X, B, D sind Tiefs); `buy = false` für das Spiegelbild.
 * Das Symbol TEST hat 1 Pip = 0.01 (Toleranz der Pflicht-Level in Preisen).
 */
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H1, H4, barsOf, plain, zig, type Row } from './formation-rows';

export const U: CheckState = 'unmeasurable';
export const M: CheckState = 'met';
export const N: CheckState = 'unmet';

export const STEP = { D1, H4, H1 } as const;
export type Tf = keyof typeof STEP;

export const ctxOf = (input: Partial<Record<Tf, Row[]>>, symbol = 'TEST') => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext(symbol, bars);
};

export const wick = (rows: Row[], idx: number, high: boolean, step: number = H4): Anchor => ({ time: idx * step, price: high ? rows[idx][1] : rows[idx][2] });

export const PRE = 40;
/** Kerzen je Zug: X → A, A → B, B → C, C → D. Der lange Zug A → B und der kurze Zug C → D lassen die Wave am D schwächer sein als am B (Divergenz). */
export const LEGS = [10, 30, 6, 6];
export interface At {
  x: number;
  a: number;
  b: number;
  c: number;
  d?: number;
}
export const atOf = (legs: number[] = LEGS): At => {
  const x = PRE + 2;
  const a = x + legs[0];
  const b = a + legs[1];
  const c = b + legs[2];
  return { x, a, b, c, d: c + legs[3] };
};
export const AT = atOf();

/** Wendepunkte X, A, B, C, D mit flachem Vorlauf; ein Tief als X (Kauf) */
export const harmonic = (points: number[], legs: number[] = LEGS, tail = 3): Row[] => [
  ...Array.from({ length: PRE }, () => plain(points[0] + 2.2, points[0] + 2.2)),
  ...zig(points, legs, tail),
];

export interface Options {
  /** Kauf-Formation (X, B, D sind Tiefs); false für das Spiegelbild */
  buy?: boolean;
  tf?: Tf;
  t?: number;
  symbol?: string;
  /** ersetzt den Preis eines Punkts (Eingabe ohne Dochtspitze) */
  price?: Partial<Record<'x' | 'a' | 'b' | 'c' | 'd', number>>;
}

type Check = (ctx: FormationContext, t: number, input: { tf: ContextTimeframe; x: Anchor; a: Anchor; b: Anchor; c: Anchor; d?: Anchor }) => Candidate;

export const makeRun = (check: Check, defaultAt: At = AT) =>
  function run(input: Partial<Record<Tf, Row[]>>, at: At = defaultAt, options: Options = {}): Candidate {
    const tf = options.tf ?? 'H4';
    const rows = input[tf]!;
    const buy = options.buy ?? true;
    const step = STEP[tf];
    const point = (key: 'x' | 'a' | 'b' | 'c' | 'd', high: boolean): Anchor => {
      const anchor = wick(rows, at[key]!, high, step);
      const price = options.price?.[key];
      return price === undefined ? anchor : { ...anchor, price };
    };
    const pts = {
      tf: tf as ContextTimeframe,
      x: point('x', !buy),
      a: point('a', buy),
      b: point('b', !buy),
      c: point('c', buy),
      ...(at.d === undefined ? {} : { d: point('d', !buy) }),
    };
    return check(ctxOf(input, options.symbol), options.t ?? END, pts);
  };

export const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
export const state = (c: Candidate, id: string): CheckState => find(c, id).state;

/** Rows `first`..`last` laufen im Wechsel um +a und −a/2 und enden beim Schluss der alten Zeile `last` (RSI(7) bleibt in der Mitte) */
export function chop(rows: Row[], first: number, last: number): Row[] {
  const out = rows.map((r) => [...r] as Row);
  const from = rows[first - 1][3];
  const to = rows[last][3];
  const n = last - first + 1;
  const ups = Math.ceil(n / 2);
  const a = (to - from) / (ups - (n - ups) / 2);
  let prev = from;
  for (let k = first; k <= last; k++) {
    const close = k === last ? to : prev + ((k - first) % 2 === 0 ? a : -a / 2);
    out[k] = plain(prev, close);
    prev = close;
  }
  return out;
}

/** D nur als Docht: zwischen C und D bleibt jeder Schluss bei `level`, die Kerze von D schließt dort; das Tief liegt beim Preis von D */
export function wickOnlyD(rows: Row[], at: At, level: number): Row[] {
  const out = rows.map((r) => [...r] as Row);
  for (let k = at.c + 1; k < at.d!; k++) out[k] = plain(level, level);
  out[at.d!] = [level, level + 0.1, rows[at.d!][2], level];
  return out;
}

/** H1-Reihe bis zur Kerze von D (Index `at.d` in H4) ohne Umkehrkerze, mit einem Engulf in Kaufrichtung danach, wenn `engulf` */
export function lowerRows(at: At, price: number, engulf: boolean): Row[] {
  const perH4 = H4 / H1;
  const start = at.d! * perH4;
  const rows: Row[] = Array.from({ length: start + 4 }, () => plain(price + 1, price + 1));
  if (engulf) {
    rows[start + 1] = [price + 0.5, price + 0.6, price - 0.1, price];
    rows[start + 2] = [price, price + 1.2, price - 0.1, price + 1.1];
  }
  return rows;
}

export const loadAt = (iso: string): number => Date.parse(`${iso}:00Z`) / 1000;
export { END, H4 };
