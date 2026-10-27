/**
 * Gartley (GAR) und Bat (BAT): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `zig(punkte, LEGS, 3)` setzt die Wendepunkte
 * X, A, B, C, D auf Index 2, 20, 24, 28, 32 (Züge von 18, 4, 4 und 4 Kerzen: schnelle Züge halten die ATR(14) hoch). Kauf-Formation: X, B, D sind Tiefs, A und C Hochs.
 *
 * Gartley: X 100, A 130 (Länge 30). B an 0.618 → 130 − 0.618 × 30 = 111.46 (AB = 18.54). C an 0.618 von A → B → 111.46 + 0.618 × 18.54 = 122.92.
 * D an −0.272 von A → B → 111.46 − 0.272 × 18.54 = 106.41 (Ausdehnung 0.2724, 0.786 von X → A). AB=CD-D: 122.92 − 18.54 = 104.38 (Abstand 2.03).
 * Bat: X 100, A 130. B an 0.5 → 115 (AB = 15). C an 0.382 von A → B → 115 + 0.382 × 15 = 120.73, hier 120.8 (0.3867).
 * D an 0.886 von X → A → 130 − 0.886 × 30 = 103.42. AB=CD-D: 120.8 − 15 = 105.8 (Abstand 2.38).
 * Das Symbol TEST hat 1 Pip = 0.01 (Toleranz der Pflicht-Level in Preisen).
 * FRM-07 Formationserkennung: Gartley und Bat
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeBat, BAT_CHECK_IDS, checkBatCandidate } from '../../src/lib/formation/batChecks';
import { analyzeGar, checkGarCandidate, GAR_CHECK_IDS } from '../../src/lib/formation/garChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H4, M15, barsOf, mirror, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-07' }, fn);

const STEP = { D1, H4, M15 } as const;
type Tf = keyof typeof STEP;
type Code = 'GAR' | 'BAT';

const ctxOf = (input: Partial<Record<Tf, Row[]>>, symbol = 'TEST') => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext(symbol, bars);
};

const wick = (rows: Row[], idx: number, high: boolean, step: number = H4): Anchor => ({ time: idx * step, price: high ? rows[idx][1] : rows[idx][2] });

interface At {
  x: number;
  a: number;
  b: number;
  c: number;
  d?: number;
}
const LEGS = [18, 4, 4, 4];
const AT: At = { x: 2, a: 20, b: 24, c: 28, d: 32 };

interface Options {
  /** Kauf-Formation (X, B, D sind Tiefs); false für das Spiegelbild */
  buy?: boolean;
  tf?: Tf;
  t?: number;
  symbol?: string;
  /** ersetzt den Preis eines Punkts (Eingabe ohne Dochtspitze) */
  price?: Partial<Record<'x' | 'a' | 'b' | 'c' | 'd', number>>;
}

/** Prüft X, A, B, C (und D) einer Formation; `buy = false` für das Spiegelbild */
function run(code: Code, input: Partial<Record<Tf, Row[]>>, at: At = AT, options: Options = {}): Candidate {
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
  const ctx = ctxOf(input, options.symbol);
  const result = code === 'GAR' ? checkGarCandidate(ctx, options.t ?? END, pts) : checkBatCandidate(ctx, options.t ?? END, pts);
  return result;
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

/** Rows `first`..`last` laufen im Wechsel um +a und −a/2 und enden beim Schluss der alten Zeile `last` (RSI(7) bleibt in der Mitte) */
function chop(rows: Row[], first: number, last: number): Row[] {
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

// ---- Reihen ----------------------------------------------------------------------------------------------------

const GAR_BASE = zig([100, 130, 111.46, 122.92, 106.41], LEGS, 3);
const BAT_BASE = zig([100, 130, 115, 120.8, 103.42], LEGS, 3);
/** B an 111.465: 0.005 vor 0.618 (Toleranz 0.01 bei TEST) */
const GAR_B_TOL = zig([100, 130, 111.465, 122.92, 106.41], LEGS, 3);
/** B an 111.49: 0.03 vor 0.618, außerhalb der Toleranz */
const GAR_B_FAR = zig([100, 130, 111.49, 122.92, 106.41], LEGS, 3);
/** C an 0.5 von A → B: 111.46 + 9.27 = 120.73 */
const GAR_C_HALF = zig([100, 130, 111.46, 120.73, 106.41], LEGS, 3);
/** D an 107.75: Ausdehnung 0.2 */
const GAR_D_SHORT = zig([100, 130, 111.46, 122.92, 107.75], LEGS, 3);
/** C an 0.8 von A → B: 111.46 + 14.83 = 126.29 */
const GAR_C_DEEP = zig([100, 130, 111.46, 126.29, 106.41], LEGS, 3);
/** B an 0.7 (109): D an 109 − 0.272 × 21 = 103.29 liegt an 0.89 von X → A */
const GAR_B_LOW = zig([100, 130, 109, 121.98, 103.29], LEGS, 3);
/** C an 0.4 von A → B: 118.88, AB=CD-D 100.34 (Abstand 6.07 zum Gartley-D) */
const GAR_C_SHALLOW = zig([100, 130, 111.46, 118.88, 106.41], LEGS, 3);
/** B an 0.8 (106): Verbots-Level 0.786 berührt */
const GAR_B_784 = zig([100, 130, 106, 118.4, 101.9], LEGS, 3);
/** C an 0.9 von A → B (123.98 + …): 111.46 + 0.9 × 18.54 = 128.15 */
const GAR_C_886 = zig([100, 130, 111.46, 128.15, 106.41], LEGS, 3);
/** C an 129.5: in der Zone von A (128.9 bis 130) */
const GAR_C_ZONE = zig([100, 130, 111.46, 129.5, 106.41], LEGS, 3);
/** Nach D schließt eine Kerze bei 99 unter X */
const GAR_CLOSE_X = [...GAR_BASE, [101, 101.2, 98.5, 99] as Row];
/** 4 Kerzen je Zug: X → D nur 16 Kerzen */
const GAR_SHORT = zig([100, 130, 111.46, 122.92, 106.41], 4, 3);
/** Lauter Anlauf zu D: RSI(7) am Tief bleibt über 20 */
const GAR_CHOP_D = chop(GAR_BASE, 29, 31);
/** Höhere Ausdehnung: D unter 106.41 − 0.001 */
/** Langer letzter Zug (10 Kerzen): RSI(7) am Tief unter 20 */
const GAR_RSI = zig([100, 130, 111.46, 122.92, 106.41], [18, 4, 4, 10], 3);
const D1_FLAT = zig([100, 130, 111.46, 122.92, 106.41], LEGS, 3);

const BAT_B_TOL = zig([100, 130, 114.995, 120.8, 103.42], LEGS, 3);
/** B an 0.65 (110.5): 0.618 überschritten */
const BAT_B_DEEP = zig([100, 130, 110.5, 118.3, 103.42], LEGS, 3);
/** B an 0.4 (118): 0.5 nicht erreicht */
const BAT_B_SHALLOW = zig([100, 130, 118, 122, 103.42], LEGS, 3);
/** C an 0.2 von A → B (118) */
/** C an 120.725: 0.3817 von A → B, 0.005 vor 0.382 (Toleranz 0.01) */
const BAT_C_TOL = zig([100, 130, 115, 120.725, 103.42], LEGS, 3);
const BAT_C_SHALLOW = zig([100, 130, 115, 118, 103.42], LEGS, 3);
/** C an 0.8 von A → B (127) */
const BAT_C_DEEP = zig([100, 130, 115, 127, 103.42], LEGS, 3);
/** D nur an 0.85 von X → A (104.5) */
const BAT_D_SHORT = zig([100, 130, 115, 120.8, 104.5], LEGS, 3);
const BAT_C_ZONE = zig([100, 130, 115, 129.5, 103.42], LEGS, 3);
const BAT_CLOSE_X = [...BAT_BASE, [101, 101.2, 98.5, 99] as Row];
const BAT_SHORT = zig([100, 130, 115, 120.8, 103.42], 4, 3);
const BAT_CHOP_D = chop(BAT_BASE, 29, 31);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  code: Code;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  {
    name: 'GAR Form: B 0.618, C 0.618, D −0.272, AB=CD nah, Kauf',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_BASE }),
    expect: {
      'GAR-01': M, 'GAR-02': M, 'GAR-03': M, 'GAR-04': M, 'GAR-05': M, 'GAR-06': M, 'GAR-07': M, 'GAR-08': M, 'GAR-09': M,
      'GAR-11': M, 'GAR-12': M, 'GAR-15': N, 'GAR-16': N, 'GAR-17': N, 'GAR-18': N, 'GAR-19': N, 'GAR-20': N,
    },
  },
  {
    name: 'GAR 01: A nicht an der Dochtspitze',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_BASE }, AT, { price: { a: 129.5 } }),
    expect: { 'GAR-01': N },
  },
  {
    name: 'GAR 02: B oberhalb von A, die Punkte wechseln nicht die Seite',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_BASE }, AT, { price: { b: 135 } }),
    expect: { 'GAR-02': N },
  },
  {
    name: 'GAR 03: B 0.005 vor 0.618 gilt als Berührung (1 Pip = 0.01)',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_B_TOL }),
    expect: { 'GAR-03': M },
  },
  {
    name: 'GAR 03: B 0.03 vor 0.618 berührt nicht',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_B_FAR }),
    expect: { 'GAR-03': N },
  },
  {
    name: 'GAR 04: C nur an 0.5 von A → B',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_C_HALF }),
    expect: { 'GAR-04': N, 'GAR-06': M },
  },
  {
    name: 'GAR 05: D nur 0.2 jenseits von B',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_D_SHORT }),
    expect: { 'GAR-05': N },
  },
  {
    name: 'GAR 05: ohne Kerze nach C ist D nicht erreicht',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_BASE.slice(0, 29) }, { x: 2, a: 20, b: 24, c: 28 }),
    expect: { 'GAR-05': N, 'GAR-07': U, 'GAR-13': U, 'GAR-14': U },
  },
  {
    name: 'GAR 06/GAR 08: C an 0.8 von A → B (jenseits von 0.786, über der Grenze des AB=CD)',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_C_DEEP }),
    expect: { 'GAR-06': N, 'GAR-08': N, 'GAR-16': N },
  },
  {
    name: 'GAR 07: D an 0.89 von X → A statt 0.786',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_B_LOW }),
    expect: { 'GAR-07': N, 'GAR-03': M },
  },
  {
    name: 'GAR 09: AB=CD-D 6.07 vom Gartley-D entfernt (mehr als 1 ATR)',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_C_SHALLOW }),
    expect: { 'GAR-09': N, 'GAR-04': N, 'GAR-08': M },
  },
  {
    name: 'GAR 11: X → D nur 16 Kerzen',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_SHORT }, { x: 2, a: 6, b: 10, c: 14, d: 18 }),
    expect: { 'GAR-11': N },
  },
  {
    name: 'GAR 12/GAR 20: Formation in M15',
    code: 'GAR',
    candidate: () => run('GAR', { M15: GAR_BASE }, AT, { tf: 'M15' }),
    expect: { 'GAR-12': N, 'GAR-20': M },
  },
  {
    name: 'GAR 13: langer letzter Zug, RSI(7) am Tief unter 20',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_RSI }, { ...AT, d: 38 }),
    expect: { 'GAR-13': M },
  },
  {
    name: 'GAR 13: lauter Anlauf zu D, RSI(7) am Tief über 20',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_CHOP_D }),
    expect: { 'GAR-13': N },
  },
  {
    name: 'GAR 15: B an 0.8 von X → A',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_B_784 }),
    expect: { 'GAR-15': M, 'GAR-03': M },
  },
  {
    name: 'GAR 16: C an 0.9 von A → B',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_C_886 }),
    expect: { 'GAR-16': M },
  },
  {
    name: 'GAR 17: C in der Zone von A',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_C_ZONE }),
    expect: { 'GAR-17': M, 'GAR-16': M },
  },
  {
    name: 'GAR 18: H4-Schluss unter X nach D',
    code: 'GAR',
    candidate: () => run('GAR', { H4: GAR_CLOSE_X }),
    expect: { 'GAR-18': M },
  },
  {
    name: 'GAR 19: ohne H4 und W1 nicht messbar',
    code: 'GAR',
    candidate: () => run('GAR', { D1: D1_FLAT }, AT, { tf: 'D1' }),
    expect: { 'GAR-19': U },
  },
  {
    name: 'GAR Spiegel: Verkauf-Gartley hat dieselben Zustände',
    code: 'GAR',
    candidate: () => run('GAR', { H4: mirror(GAR_BASE) }, AT, { buy: false }),
    expect: {
      'GAR-01': M, 'GAR-02': M, 'GAR-03': M, 'GAR-04': M, 'GAR-05': M, 'GAR-06': M, 'GAR-07': M, 'GAR-08': M, 'GAR-09': M,
      'GAR-11': M, 'GAR-12': M, 'GAR-15': N, 'GAR-16': N, 'GAR-17': N, 'GAR-18': N, 'GAR-20': N,
    },
  },
  {
    name: 'BAT Form: B 0.5, C 0.3867, D 0.886, AB=CD nah, Kauf',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_BASE }),
    expect: {
      'BAT-01': M, 'BAT-03': M, 'BAT-04': M, 'BAT-05': M, 'BAT-06': M, 'BAT-07': M, 'BAT-08': M, 'BAT-09': M,
      'BAT-10': M, 'BAT-12': M, 'BAT-13': M, 'BAT-14': N, 'BAT-15': N, 'BAT-16': N, 'BAT-17': N,
    },
  },
  {
    name: 'BAT 03: X nicht das Extrem der Bewegung',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_BASE }, AT, { price: { x: 101 } }),
    expect: { 'BAT-03': N, 'BAT-01': N },
  },
  {
    name: 'BAT 04: B oberhalb von A',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_BASE }, AT, { price: { b: 135 } }),
    expect: { 'BAT-04': N },
  },
  {
    name: 'BAT 05: B 0.005 vor 0.5 gilt als Berührung',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_B_TOL }),
    expect: { 'BAT-05': M },
  },
  {
    name: 'BAT 05: B nur an 0.4',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_B_SHALLOW }),
    expect: { 'BAT-05': N },
  },
  {
    name: 'BAT 06/BAT 08: C 0.005 vor 0.382 gilt noch als Berührung',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_C_TOL }),
    expect: { 'BAT-06': M, 'BAT-08': M },
  },
  {
    name: 'BAT 06/BAT 08: C nur an 0.2 von A → B',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_C_SHALLOW }),
    expect: { 'BAT-06': N, 'BAT-08': N },
  },
  {
    name: 'BAT 07: D nur an 0.85 von X → A',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_D_SHORT }),
    expect: { 'BAT-07': N },
  },
  {
    name: 'BAT 08/BAT 09: C an 0.8 von A → B, AB=CD-D weit weg',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_C_DEEP }),
    expect: { 'BAT-08': N, 'BAT-09': N, 'BAT-06': M },
  },
  {
    name: 'BAT 10: X → D nur 16 Kerzen',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_SHORT }, { x: 2, a: 6, b: 10, c: 14, d: 18 }),
    expect: { 'BAT-10': N },
  },
  {
    name: 'BAT 12/BAT 16: Formation in M15',
    code: 'BAT',
    candidate: () => run('BAT', { M15: BAT_BASE }, AT, { tf: 'M15' }),
    expect: { 'BAT-12': N, 'BAT-16': M },
  },
  {
    name: 'BAT 13: lauter Anlauf zu D',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_CHOP_D }),
    expect: { 'BAT-13': N },
  },
  {
    name: 'BAT 14: B an 0.65 (0.618 berührt, dann ist es eine Gartley-Lesart)',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_B_DEEP }),
    expect: { 'BAT-14': M, 'BAT-05': M },
  },
  {
    name: 'BAT 15: C in der Zone von A',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_C_ZONE }),
    expect: { 'BAT-15': M },
  },
  {
    name: 'BAT 17: H4-Schluss unter X',
    code: 'BAT',
    candidate: () => run('BAT', { H4: BAT_CLOSE_X }),
    expect: { 'BAT-17': M },
  },
  {
    name: 'BAT Spiegel: Verkauf-Bat hat dieselben Zustände',
    code: 'BAT',
    candidate: () => run('BAT', { H4: mirror(BAT_BASE) }, AT, { buy: false }),
    expect: {
      'BAT-01': M, 'BAT-03': M, 'BAT-04': M, 'BAT-05': M, 'BAT-06': M, 'BAT-07': M, 'BAT-08': M, 'BAT-09': M,
      'BAT-10': M, 'BAT-12': M, 'BAT-13': M, 'BAT-14': N, 'BAT-15': N, 'BAT-16': N, 'BAT-17': N,
    },
  },
];

test.describe('GAR und BAT: Bedingungen auf von Hand gerechneten Reihen', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const cand = c.candidate();
      const got: Record<string, CheckState> = {};
      for (const id of Object.keys(c.expect)) got[id] = state(cand, id);
      expect(got).toEqual(c.expect);
    });
  }
});

// ---- Abgrenzung, Urteil, Zeichnungen -----------------------------------------------------------------------------

test.describe('GAR und BAT: Abgrenzung, Urteil und Zeichnungen', () => {
  frm('Abgrenzung: B an 0.618 ist Gartley (GAR 03 ☑, BAT 14 ☑), B an 0.5 ist Bat (GAR 03 ☐, BAT 14 ☐)', () => {
    const gar = run('GAR', { H4: GAR_BASE });
    const bat = run('BAT', { H4: GAR_BASE });
    expect([state(gar, 'GAR-03'), state(bat, 'BAT-14'), bat.verdict]).toEqual([M, M, 'invalid']);
    const gar2 = run('GAR', { H4: BAT_BASE });
    const bat2 = run('BAT', { H4: BAT_BASE });
    expect([state(gar2, 'GAR-03'), state(bat2, 'BAT-14'), state(bat2, 'BAT-05')]).toEqual([N, N, M]);
    expect(gar2.verdict).toBe('invalid');
    expect(bat2.verdict).toBe('valid');
  });

  frm('Urteil Gartley: gültig, im Aufbau ohne D, ungültig mit Ausschluss', () => {
    expect(run('GAR', { H4: GAR_BASE }).verdict).toBe('valid');
    expect(run('GAR', { H4: GAR_D_SHORT }).verdict).toBe('forming');
    expect(run('GAR', { H4: GAR_CLOSE_X }).verdict).toBe('invalid');
    expect(run('GAR', { H4: GAR_C_DEEP }).verdict).toBe('invalid');
    expect(run('GAR', { H4: GAR_C_SHALLOW }).verdict).toBe('invalid');
  });

  frm('Urteil Bat: gültig, im Aufbau ohne D, ungültig mit Ausschluss', () => {
    expect(run('BAT', { H4: BAT_BASE }).verdict).toBe('valid');
    expect(run('BAT', { H4: BAT_D_SHORT }).verdict).toBe('forming');
    expect(run('BAT', { H4: BAT_CLOSE_X }).verdict).toBe('invalid');
    expect(run('BAT', { H4: BAT_B_DEEP }).verdict).toBe('invalid');
  });

  frm('BAT 02: Ersatz (Pflicht), wenn BAT 01 fehlt; sonst Verstärkung', () => {
    const base = run('BAT', { H4: BAT_BASE });
    expect(find(base, 'BAT-02').kind).toBe('bonus');
    const noImpulse = run('BAT', { H4: BAT_BASE }, AT, { price: { a: 129.5 } });
    expect(state(noImpulse, 'BAT-01')).toBe(N);
    expect(find(noImpulse, 'BAT-02').kind).toBe('required');
  });

  frm('Zeichnungen: Z-GAR 01 bis Z-GAR 05 immer, Z-GAR 06 nur mit erreichtem D, auch bei ☐', () => {
    const ok = run('GAR', { H4: GAR_BASE });
    expect(ok.drawings.map((d) => d.id)).toEqual(['Z-GAR-01', 'Z-GAR-02', 'Z-GAR-03', 'Z-GAR-04', 'Z-GAR-05', 'Z-GAR-06']);
    const short = run('GAR', { H4: GAR_D_SHORT });
    expect(short.drawings.map((d) => d.id)).toEqual(['Z-GAR-01', 'Z-GAR-02', 'Z-GAR-03', 'Z-GAR-04', 'Z-GAR-05']);
    expect(ok.drawings.find((d) => d.id === 'Z-GAR-02')!.levels).toEqual([0.5, 0.618, 0.786, 0.886]);
    expect(ok.drawings.find((d) => d.id === 'Z-GAR-06')!.levels).toEqual([0.382, 0.618, -0.382]);
    expect(find(ok, 'GAR-03').drawings).toContain('Z-GAR-02');
    expect(find(ok, 'GAR-08').drawings).toEqual(['Z-GAR-04', 'Z-GAR-05']);
    expect(ok.drawings.every((d) => d.side === 'buy')).toBe(true);
  });

  frm('Zeichnungen: Z-BAT 01 bis Z-BAT 05 immer, Z-BAT 06 nur mit erreichtem D', () => {
    const ok = run('BAT', { H4: BAT_BASE });
    expect(ok.drawings.map((d) => d.id)).toEqual(['Z-BAT-01', 'Z-BAT-02', 'Z-BAT-03', 'Z-BAT-04', 'Z-BAT-05', 'Z-BAT-06']);
    const short = run('BAT', { H4: BAT_D_SHORT });
    expect(short.drawings.map((d) => d.id)).toEqual(['Z-BAT-01', 'Z-BAT-02', 'Z-BAT-03', 'Z-BAT-04', 'Z-BAT-05']);
    expect(ok.drawings.find((d) => d.id === 'Z-BAT-02')!.levels).toEqual([0.5, 0.618, 0.886]);
    expect(ok.drawings.find((d) => d.id === 'Z-BAT-03')!.levels).toEqual([0.382]);
    expect(find(ok, 'BAT-07').drawings).toEqual(['Z-BAT-01', 'Z-BAT-02']);
  });

  frm('Automatische Auswahl: Gartley und Spiegelbild liefern X, A, B, C, D aus den Wendepunkten', () => {
    const pick = (rows: Row[]) => analyzeGar(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate;
    const buy = pick(GAR_BASE);
    expect(buy.side).toBe('buy');
    expect(buy.points).toEqual({
      X: { time: 2 * H4, price: 100 },
      A: { time: 20 * H4, price: 130 },
      B: { time: 24 * H4, price: 111.46 },
      C: { time: 28 * H4, price: 122.92 },
      D: { time: 32 * H4, price: 106.41 },
    });
    const sell = pick(mirror(GAR_BASE));
    expect(sell.side).toBe('sell');
    expect(sell.checks.map((c) => [c.id, c.state])).toEqual(buy.checks.map((c) => [c.id, c.state]));
  });

  frm('Automatische Auswahl: Bat liefert dieselben Punkte wie die Eingabe', () => {
    const c = analyzeBat(ctxOf({ H4: BAT_BASE }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(c.side).toBe('buy');
    expect(c.verdict).toBe('valid');
    expect(c.points.D).toEqual({ time: 32 * H4, price: 103.42 });
  });

  frm('Ohne vier Wendepunkte gibt es keine Formation: alles nicht messbar, im Aufbau', () => {
    const rows = zig([100, 130, 111.46], LEGS, 3);
    for (const c of [analyzeGar(ctxOf({ H4: rows }), END), analyzeBat(ctxOf({ H4: rows }), END)]) {
      const cand = c.find((a) => a.tf === 'H4')!.candidate;
      expect(cand.checks.every((x) => x.state === U)).toBe(true);
      expect(cand.verdict).toBe('forming');
    }
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [29, 34]) {
      const full = analyzeGar(ctxOf({ H4: GAR_CLOSE_X }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeGar(ctxOf({ H4: GAR_CLOSE_X.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
      const fullB = analyzeBat(ctxOf({ H4: BAT_CLOSE_X }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefixB = analyzeBat(ctxOf({ H4: BAT_CLOSE_X.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(fullB.candidate).toEqual(prefixB.candidate);
    }
  });

  frm('Eigene Punkte in falscher Reihenfolge oder ohne geschlossene Kerze sind nicht messbar', () => {
    const swapped = checkGarCandidate(ctxOf({ H4: GAR_BASE }), END, { tf: 'H4', x: wick(GAR_BASE, 20, false), a: wick(GAR_BASE, 2, true), b: wick(GAR_BASE, 24, false), c: wick(GAR_BASE, 28, true) });
    expect(swapped.checks.every((x) => x.state === U)).toBe(true);
    const missing = checkBatCandidate(ctxOf({ H4: BAT_BASE }), END, { tf: 'H4', x: { time: 999 * H4, price: 100 }, a: wick(BAT_BASE, 20, true), b: wick(BAT_BASE, 24, false), c: wick(BAT_BASE, 28, true) });
    expect(missing.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (code: Code, name: string, iso: string): Candidate => {
  const fixture = loadFixture(name);
  const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars });
  const list = code === 'GAR' ? analyzeGar(ctx, at(iso)) : analyzeBat(ctx, at(iso));
  const hit = list.find((a) => a.tf === 'H4')!.candidate;
  return hit;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));
const time = (c: Candidate, point: string) => new Date(c.points[point].time * 1000).toISOString().slice(0, 16);

test.describe('GAR und BAT: echte Kerzen', () => {
  frm('gar-buy-h4-01: Kauf-Gartley, B 0.5 Pip vor 0.618 gilt als Berührung, gültig; Bat noch im Aufbau', () => {
    const c = analyzeAt('GAR', 'gar-buy-h4-01', '2025-11-17T12:00');
    expect(c.side).toBe('buy');
    expect([time(c, 'X'), time(c, 'A'), time(c, 'B'), time(c, 'C'), time(c, 'D')]).toEqual([
      '2025-11-13T00:00', '2025-11-13T16:00', '2025-11-14T12:00', '2025-11-14T16:00', '2025-11-17T08:00',
    ]);
    expect(states(c, ['GAR-01', 'GAR-03', 'GAR-04', 'GAR-05', 'GAR-07', 'GAR-08', 'GAR-09', 'GAR-10', 'GAR-15', 'GAR-16', 'GAR-17', 'GAR-18'])).toEqual([M, M, M, M, M, M, M, M, N, N, N, N]);
    expect(c.verdict).toBe('valid');
    const bat = analyzeAt('BAT', 'gar-buy-h4-01', '2025-11-17T12:00');
    expect(states(bat, ['BAT-05', 'BAT-14', 'BAT-07'])).toEqual([M, N, N]);
    expect(bat.verdict).toBe('forming');
  });

  frm('gar-sell-h4-01: Verkauf-Gartley gültig, eine Kerze später schließt H4 über X und macht sie ungültig', () => {
    const early = analyzeAt('GAR', 'gar-sell-h4-01', '2026-01-09T08:00');
    expect(early.side).toBe('sell');
    expect(states(early, ['GAR-03', 'GAR-04', 'GAR-05', 'GAR-18'])).toEqual([M, M, M, N]);
    expect(early.verdict).toBe('valid');
    const late = analyzeAt('GAR', 'gar-sell-h4-01', '2026-01-09T12:00');
    expect(state(late, 'GAR-18')).toBe(M);
    expect(late.verdict).toBe('invalid');
    const bat = analyzeAt('BAT', 'gar-sell-h4-01', '2026-01-09T08:00');
    expect(state(bat, 'BAT-14')).toBe(M);
    expect(bat.verdict).toBe('invalid');
  });

  frm('gar-buy-h4-02: Kauf-Gartley, C zwischen 0.618 und 0.786 ist erlaubt', () => {
    const c = analyzeAt('GAR', 'gar-buy-h4-02', '2025-11-10T04:00');
    expect(states(c, ['GAR-04', 'GAR-05', 'GAR-06', 'GAR-16'])).toEqual([M, M, M, N]);
    expect(find(c, 'GAR-04').value!).toBeGreaterThan(0.618);
    expect(find(c, 'GAR-04').value!).toBeLessThan(0.786);
    expect(c.verdict).toBe('valid');
  });

  frm('gar-buy-h4-03: D fehlt noch (im Aufbau), vier Stunden später ist D erreicht (gültig)', () => {
    const early = analyzeAt('GAR', 'gar-buy-h4-03', '2025-12-12T16:00');
    expect(state(early, 'GAR-05')).toBe(N);
    expect(early.verdict).toBe('forming');
    const late = analyzeAt('GAR', 'gar-buy-h4-03', '2025-12-12T20:00');
    expect(state(late, 'GAR-05')).toBe(M);
    expect(late.verdict).toBe('valid');
  });

  frm('gar-bad-h4-01: Negativ – B beim Tief von X (jenseits von 0.786) schließt die Gartley aus', () => {
    const c = analyzeAt('GAR', 'gar-bad-h4-01', '2025-11-21T12:00');
    expect(state(c, 'GAR-15')).toBe(M);
    expect(find(c, 'GAR-15').value!).toBeGreaterThanOrEqual(0.786);
    expect(c.verdict).toBe('invalid');
  });

  frm('bat-buy-h4-01: Kauf-Bat mit B an 0.5 und D an 0.886 ist gültig', () => {
    const c = analyzeAt('BAT', 'bat-buy-h4-01', '2025-12-16T16:00');
    expect(c.side).toBe('buy');
    expect(states(c, ['BAT-01', 'BAT-03', 'BAT-05', 'BAT-06', 'BAT-07', 'BAT-08', 'BAT-14', 'BAT-15', 'BAT-17'])).toEqual([M, M, M, M, M, M, N, N, N]);
    expect(c.verdict).toBe('valid');
  });

  frm('bat-sell-h4-01: Verkauf-Bat ist gültig (Spiegel der Kauf-Form)', () => {
    const c = analyzeAt('BAT', 'bat-sell-h4-01', '2025-12-08T16:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['BAT-05', 'BAT-06', 'BAT-07', 'BAT-14'])).toEqual([M, M, M, N]);
    expect(c.verdict).toBe('valid');
  });

  frm('bat-sell-h4-02: Verkauf-Bat mit D weit jenseits von X → A ist gültig', () => {
    const c = analyzeAt('BAT', 'bat-sell-h4-02', '2025-10-24T16:00');
    expect(states(c, ['BAT-01', 'BAT-05', 'BAT-06', 'BAT-07', 'BAT-14'])).toEqual([M, M, M, M, N]);
    expect(c.verdict).toBe('valid');
  });

  frm('bat-bad-h4-01: Negativ – B unter X und H4-Schluss unter X schließen den Bat aus', () => {
    const c = analyzeAt('BAT', 'bat-bad-h4-01', '2025-10-30T00:00');
    expect(states(c, ['BAT-14', 'BAT-17'])).toEqual([M, M]);
    expect(c.verdict).toBe('invalid');
  });
});

// ---- Abdeckung -------------------------------------------------------------------------------------------------

/** Echte Fälle (Fixture, Zeitpunkt), die zur Abdeckung zählen */
const REAL_RUNS: [Code, string, string][] = [
  ['GAR', 'gar-buy-h4-01', '2025-11-17T12:00'],
  ['GAR', 'gar-sell-h4-01', '2026-01-09T08:00'],
  ['GAR', 'gar-sell-h4-01', '2026-01-09T12:00'],
  ['GAR', 'gar-buy-h4-02', '2025-11-10T04:00'],
  ['GAR', 'gar-buy-h4-03', '2025-12-12T16:00'],
  ['GAR', 'gar-bad-h4-01', '2025-11-21T12:00'],
  ['BAT', 'gar-buy-h4-01', '2025-11-17T12:00'],
  ['BAT', 'bat-buy-h4-01', '2025-12-16T16:00'],
  ['BAT', 'bat-sell-h4-01', '2025-12-08T16:00'],
  ['BAT', 'bat-sell-h4-02', '2025-10-24T16:00'],
  ['BAT', 'bat-bad-h4-01', '2025-10-30T00:00'],
];

/** GAR-19 kann ohne Wochenkerzen nie ☑ werden (W1 gehört nicht zum Kontext) */
const NEVER_MET = ['GAR-19'];

test.describe('GAR und BAT: Abdeckung', () => {
  frm('jede Bedingung von GAR und BAT hat einen Fall mit ☑ und einen mit ☐', () => {
    const miss: string[] = [];
    for (const code of ['GAR', 'BAT'] as const) {
      const ids = code === 'GAR' ? GAR_CHECK_IDS : BAT_CHECK_IDS;
      const candidates = [
        ...CASES.filter((c) => c.code === code).map((c) => c.candidate()),
        ...REAL_RUNS.filter(([k]) => k === code).map(([k, name, iso]) => analyzeAt(k, name, iso)),
      ];
      for (const id of ids) {
        const got = new Set(candidates.map((c) => state(c, id)));
        if (!got.has(M) && !NEVER_MET.includes(id)) miss.push(`${id} ohne ☑`);
        if (!got.has(N)) miss.push(`${id} ohne ☐`);
      }
    }
    expect(miss).toEqual([]);
  });
});
