/**
 * Cypher (CYP): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen und auf echten Reihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `cyp(punkte, LEGS)` setzt 40 flache Vorlaufkerzen
 * (Wave und RSI brauchen Anlauf) vor die Wendepunkte X, A, B, C, D. Kauf-Cypher: X, B, D sind Tiefs, A und C Hochs.
 *
 * Basis: X 100, A 130 (Länge 30). B an 115 = 0.5 von X → A. C an 139 = 0.3 jenseits von A (Level 1.3). X → C = 39,
 * D an 0.786 von X → C → 139 − 0.786 × 39 = 108.35. BC-Rückprojektion 1.272: 139 − 1.272 × 24 = 108.47 (0.12 vom D).
 * Der erste Zug X → A ist steil (10 Kerzen), der zweite Impuls B → C flach (14 Kerzen): Wave am C schwächer als am A (Divergenz).
 * Das Symbol TEST hat 1 Pip = 0.01 (Toleranz nur für CYP-07).
 * FRM-12 Formationserkennung: Cypher
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeCyp, checkCypCandidate, CYP_CHECK_IDS } from '../../src/lib/formation/cypChecks';
import { analyzeGar } from '../../src/lib/formation/garChecks';
import { analyzeBat } from '../../src/lib/formation/batChecks';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import { analyzeLib, checkLibCandidate, LIB_CHECK_IDS } from '../../src/lib/formation/libChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H4, M15, barsOf, mirror, patched, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-12' }, fn);

const STEP = { D1, H4, M15 } as const;
type Tf = keyof typeof STEP;

const ctxOf = (input: Partial<Record<Tf, Row[]>>, symbol = 'TEST') => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext(symbol, bars);
};

const wick = (rows: Row[], idx: number, high: boolean, step: number = H4): Anchor => ({ time: idx * step, price: high ? rows[idx][1] : rows[idx][2] });

const PRE = 40;
const LEGS = [10, 4, 14, 8];
interface At {
  x: number;
  a: number;
  b: number;
  c: number;
  d?: number;
}
const atOf = (legs: number[] = LEGS): At => {
  const x = PRE + 2;
  const a = x + legs[0];
  const b = a + legs[1];
  const c = b + legs[2];
  return { x, a, b, c, d: c + legs[3] };
};
const AT = atOf();

/** Wendepunkte X, A, B, C, D mit flachem Vorlauf; ein Tief als X (Kauf) */
const cyp = (points: number[], legs: number[] = LEGS, tail = 3): Row[] => [
  ...Array.from({ length: PRE }, () => plain(points[0] + 2.2, points[0] + 2.2)),
  ...zig(points, legs, tail),
];

interface Options {
  /** Kauf-Cypher (X, B, D sind Tiefs); false für das Spiegelbild */
  buy?: boolean;
  tf?: Tf;
  t?: number;
  symbol?: string;
  /** ersetzt den Preis eines Punkts (Eingabe ohne Dochtspitze) */
  price?: Partial<Record<'x' | 'a' | 'b' | 'c' | 'd', number>>;
  libras?: Candidate[];
}

/** Prüft X, A, B, C (und D) einer Cypher; `buy = false` für das Spiegelbild */
function run(input: Partial<Record<Tf, Row[]>>, at: At = AT, options: Options = {}): Candidate {
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
  return checkCypCandidate(ctxOf(input, options.symbol), options.t ?? END, pts, options.libras);
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

const BASE = cyp([100, 130, 115, 139, 108.35]);


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

/** B an 118.545: 0.005 vor dem Preis des Levels 0.382; keine Pip-Toleranz */
const B_TOL = cyp([100, 130, 118.545, 139, 108.35]);
/** B an 118.56: 0.02 vor dem Preis des Levels 0.382; keine Pip-Toleranz */
const B_FAR = cyp([100, 130, 118.56, 139, 108.35]);
/** B an 122: Korrektur nur 0.267 */
const B_SHALLOW = cyp([100, 130, 122, 139, 108.35]);
/** C an 138.155: 0.0003 vor der Ausdehnung 0.272 */
const C_TOL = cyp([100, 130, 115, 138.155, 108.35]);
/** C an 138: nur 0.267 jenseits von A */
const C_SHORT = cyp([100, 130, 115, 138, 108.35]);
/** C an 125, unter A: Gartley-Form */
const C_UNDER_A = cyp([100, 130, 115, 125, 108.35]);
/** Docht am C bis 144 (über 1.414 = 142.42), alle Schlüsse bleiben darunter */
const C_WICK = patched(BASE, AT.c, [BASE[AT.c][0], 144, BASE[AT.c][2], BASE[AT.c][3]]);
/** C an 144: die Schlüsse des zweiten Impulses liegen über 1.414 */
const C_CLOSE = cyp([100, 130, 115, 144, 108.35]);
/** Docht am B bis 110 (unter 0.618 = 111.46), alle Schlüsse bleiben darüber */
const B_WICK = patched(BASE, AT.b, [BASE[AT.b][0], BASE[AT.b][1], 110, BASE[AT.b][3]]);
/** B an 110: die Schlüsse der Korrektur liegen unter 0.618 */
const B_CLOSE = cyp([100, 130, 110, 139, 108.35]);
/** D an 109.2: nur 0.766 von X → C */
const D_SHORT = cyp([100, 130, 115, 139, 109.2]);
/** D an 108.355: 0.009 vor dem Level 108.346 (1 Pip = 0.01 bei TEST) */
/** D an 108.37: 0.024 vor dem Level, außerhalb der Toleranz */
const D_FAR = cyp([100, 130, 115, 139, 108.37]);
const D_TOL = cyp([100, 130, 115, 139, 108.355]);
/** C an 150 in 4 Kerzen: die Wave am C ist stärker als am A (keine Divergenz); D an 0.786 von X → C = 110.7 */
const NO_DIVERGENCE_LEGS = [10, 4, 4, 8];
const NO_DIVERGENCE = cyp([100, 130, 115, 150, 110.7], NO_DIVERGENCE_LEGS);
/** Lauter Anlauf zu C: RSI(7) am C bleibt unter 80 */
const CHOP_C = chop(BASE, AT.c - 5, AT.c - 1);
/** Lauter Anlauf zu D: RSI(7) am D bleibt über 20 */
const CHOP_D = chop(BASE, AT.d! - 5, AT.d! - 1);
/** B an 125: die Rückprojektion 1.272 liegt bei 121.2, weit vom D */
const B_HIGH = cyp([100, 130, 125, 139, 108.35]);
/** D1-Aufwärts- und Abwärtstrend für CYP-02 */
const D1_UP = zig([100, 120, 110, 140, 125, 160], 8, 3);
const D1_DOWN = mirror(D1_UP);
/** Gartley-Form (C unter A) und Bat-Form für die Abgrenzung */
const GAR_FORM = cyp([100, 130, 111.46, 122.92, 106.41]);
const BAT_FORM = cyp([100, 130, 115, 120.8, 103.42]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const BASE_EXPECT: Record<string, CheckState> = {
  'CYP-01': M, 'CYP-02': U, 'CYP-03': M, 'CYP-04': M, 'CYP-05': M, 'CYP-06': M, 'CYP-07': M, 'CYP-08': M,
  'CYP-11': N, 'CYP-12': M, 'CYP-13': M, 'CYP-14': N, 'CYP-15': N,
};

const CASES: Case[] = [
  { name: 'Form: B 0.5, C 1.3 der Fib X → A, D an 0.786 von X → C, Kauf', candidate: () => run({ H4: BASE }), expect: BASE_EXPECT },
  { name: 'Spiegel: Verkauf-Cypher hat dieselben Zustände', candidate: () => run({ H4: mirror(BASE) }, AT, { buy: false }), expect: BASE_EXPECT },
  { name: 'CYP 01: A nicht an der Dochtspitze', candidate: () => run({ H4: BASE }, AT, { price: { a: 129.5 } }), expect: { 'CYP-01': N } },
  { name: 'CYP 01: B oberhalb von A, die Punkte wechseln nicht die Seite', candidate: () => run({ H4: BASE }, AT, { price: { b: 135 } }), expect: { 'CYP-01': N } },
  { name: 'CYP 01/CYP 04: C unter A (Gartley-Form) ist keine Cypher', candidate: () => run({ H4: C_UNDER_A }, AT, { price: {} }), expect: { 'CYP-01': N, 'CYP-04': N } },
  { name: 'CYP 02: D1 steigt, Kauf in Trend-Richtung', candidate: () => run({ H4: BASE, D1: D1_UP }), expect: { 'CYP-02': M } },
  { name: 'CYP 02: D1 fällt, Kauf gegen die höhere Zeiteinheit', candidate: () => run({ H4: BASE, D1: D1_DOWN }), expect: { 'CYP-02': N } },
  { name: 'CYP 02: ohne höhere Zeiteinheit nicht messbar', candidate: () => run({ H4: BASE }), expect: { 'CYP-02': U } },
  { name: 'CYP 03: B 0.005 vor dem Preis des Levels 0.382 berührt nicht', candidate: () => run({ H4: B_TOL }), expect: { 'CYP-03': N } },
  { name: 'CYP 03: B 0.0007 vor 0.382 berührt nicht', candidate: () => run({ H4: B_FAR }), expect: { 'CYP-03': N } },
  { name: 'CYP 03: B nur an 0.267', candidate: () => run({ H4: B_SHALLOW }), expect: { 'CYP-03': N } },
  { name: 'CYP 04: C 0.005 vor dem Preis des Levels 1.272 berührt nicht', candidate: () => run({ H4: C_TOL }), expect: { 'CYP-04': N } },
  { name: 'CYP 04: C nur 0.267 jenseits von A', candidate: () => run({ H4: C_SHORT }), expect: { 'CYP-04': N } },
  { name: 'CYP 05: C an 150 in 4 Kerzen: Wave am C stärker als am A, keine Divergenz', candidate: () => run({ H4: NO_DIVERGENCE }, atOf(NO_DIVERGENCE_LEGS)), expect: { 'CYP-05': N } },
  { name: 'CYP 06: lauter Anlauf zu C, RSI(7) am Hoch unter 80', candidate: () => run({ H4: CHOP_C }), expect: { 'CYP-06': N } },
  { name: 'CYP 07: D an 0.766 statt 0.786', candidate: () => run({ H4: D_SHORT }), expect: { 'CYP-07': N } },
  { name: 'CYP 07: D 0.009 vor dem Level 0.786 gilt als Berührung', candidate: () => run({ H4: D_TOL }), expect: { 'CYP-07': M } },
  { name: 'CYP 07: D 0.024 vor dem Level 0.786 berührt nicht', candidate: () => run({ H4: D_FAR }), expect: { 'CYP-07': N } },
  { name: 'CYP 07: ohne Kerze nach C ist D nicht erreicht', candidate: () => run({ H4: BASE.slice(0, AT.c + 1) }, { x: AT.x, a: AT.a, b: AT.b, c: AT.c }), expect: { 'CYP-07': N, 'CYP-08': U } },
  { name: 'CYP 08: lauter Anlauf zu D, RSI(7) am Tief über 20', candidate: () => run({ H4: CHOP_D }), expect: { 'CYP-08': N } },
  { name: 'CYP 11: Docht am C über 1.414, aber kein Schluss darüber', candidate: () => run({ H4: C_WICK }), expect: { 'CYP-11': N } },
  { name: 'CYP 11: Schlüsse des zweiten Impulses über 1.414', candidate: () => run({ H4: C_CLOSE }), expect: { 'CYP-11': M } },
  { name: 'CYP 15: Docht am B unter 0.618, aber kein Schluss darunter', candidate: () => run({ H4: B_WICK }), expect: { 'CYP-15': N } },
  { name: 'CYP 15: Schlüsse der Korrektur unter 0.618 der Fib X → A', candidate: () => run({ H4: B_CLOSE }), expect: { 'CYP-15': M } },
  { name: 'CYP 15: Spiegel, Schlüsse der Korrektur über 0.618 beim Verkauf', candidate: () => run({ H4: mirror(B_CLOSE) }, AT, { buy: false }), expect: { 'CYP-15': M } },
  { name: 'CYP 12: B an 125, die Rückprojektion liegt weit vom D', candidate: () => run({ H4: B_HIGH }), expect: { 'CYP-12': N } },
  { name: 'CYP 13/CYP 14: Formation in M15', candidate: () => run({ M15: BASE }, AT, { tf: 'M15' }), expect: { 'CYP-13': N, 'CYP-14': M } },
  { name: 'CYP 13: Formation in D1', candidate: () => run({ D1: BASE }, AT, { tf: 'D1' }), expect: { 'CYP-13': M, 'CYP-14': N } },
];

test.describe('CYP: Bedingungen auf von Hand gerechneten Reihen', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const cand = c.candidate();
      const got: Record<string, CheckState> = {};
      for (const id of Object.keys(c.expect)) got[id] = state(cand, id);
      expect(got).toEqual(c.expect);
    });
  }
});





test.describe('CYP: Abgrenzung, Urteil und Zeichnungen', () => {
  frm('Abgrenzung Cypher ↔ Gartley/Bat: C jenseits von A ist Cypher (CYP 01 ☑), C unter A ist Gartley/Bat (CYP 01 ☐)', () => {
    const cypher = run({ H4: BASE });
    expect(state(cypher, 'CYP-01')).toBe(M);
    expect(cypher.verdict).toBe('valid');
    const garOnCypher = analyzeGar(ctxOf({ H4: BASE }), END).find((a) => a.tf === 'H4')!.candidate;
    const batOnCypher = analyzeBat(ctxOf({ H4: BASE }), END).find((a) => a.tf === 'H4')!.candidate;
    expect([garOnCypher.verdict, batOnCypher.verdict]).toEqual(['invalid', 'invalid']);
    for (const rows of [GAR_FORM, BAT_FORM]) {
      const asCypher = run({ H4: rows }, AT, { price: {} });
      expect([state(asCypher, 'CYP-01'), state(asCypher, 'CYP-04'), asCypher.verdict]).toEqual([N, N, 'invalid']);
    }
  });

  frm('Abgrenzung Cypher ↔ ABCD: das D der Cypher ist kein AB=CD-D', () => {
    const abcd = analyzeAbcd(ctxOf({ H4: BASE }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(abcd.checks.find((k) => k.id === 'ABCD-08')!.state).toBe(N);
    expect(abcd.verdict).toBe('forming');
    expect(run({ H4: BASE }).verdict).toBe('valid');
  });

  frm('Urteil: gültig, im Aufbau mit zu kurzem D, ungültig mit Ausschluss oder fehlendem Vorlauf', () => {
    expect(run({ H4: BASE }).verdict).toBe('valid');
    expect(run({ H4: D_SHORT }).verdict).toBe('forming');
    expect(run({ H4: C_CLOSE }).verdict).toBe('invalid');
    expect(run({ H4: B_CLOSE }).verdict).toBe('invalid');
    expect(run({ H4: CHOP_C }).verdict).toBe('invalid');
    expect(run({ H4: NO_DIVERGENCE }, atOf(NO_DIVERGENCE_LEGS)).verdict).toBe('invalid');
    expect(run({ H4: B_SHALLOW }).verdict).toBe('invalid');
    expect(run({ M15: BASE }, AT, { tf: 'M15' }).verdict).toBe('invalid');
    expect(run({ H4: BASE, D1: D1_DOWN }).verdict).toBe('invalid');
  });

  frm('Zeichnungen: Z-CYP 01, 02, 04, 05 immer, Z-CYP 03 und 06 nur mit erreichtem D', () => {
    const ok = run({ H4: BASE });
    expect(ok.drawings.map((d) => d.id)).toEqual(['Z-CYP-01', 'Z-CYP-02', 'Z-CYP-04', 'Z-CYP-05', 'Z-CYP-03', 'Z-CYP-06']);
    const short = run({ H4: D_SHORT });
    expect(short.drawings.map((d) => d.id)).toEqual(['Z-CYP-01', 'Z-CYP-02', 'Z-CYP-04', 'Z-CYP-05']);
    expect(ok.drawings.find((d) => d.id === 'Z-CYP-01')!.levels).toEqual([0.382, -0.272, -0.414]);
    expect(ok.drawings.find((d) => d.id === 'Z-CYP-02')!.levels).toEqual([0.786]);
    expect(ok.drawings.find((d) => d.id === 'Z-CYP-03')!.levels).toEqual([0.382, 0.618, -0.382]);
    expect(ok.drawings.find((d) => d.id === 'Z-CYP-04')!.levels).toEqual([1.272]);
    expect(find(ok, 'CYP-07').drawings).toEqual(['Z-CYP-02', 'Z-CYP-05']);
    expect(find(ok, 'CYP-12').drawings).toEqual(['Z-CYP-04']);
    expect(ok.drawings.every((d) => d.side === 'buy')).toBe(true);
  });

  frm('Pflicht und Verstärkung: CYP 05 und CYP 06 sind Pflicht, CYP 08 Verstärkung, CYP 11 und CYP 15 Ausschluss (Annahme)', () => {
    const c = run({ H4: BASE });
    expect([find(c, 'CYP-05').kind, find(c, 'CYP-06').kind, find(c, 'CYP-08').kind, find(c, 'CYP-11').kind, find(c, 'CYP-11').status, find(c, 'CYP-15').kind, find(c, 'CYP-15').status]).toEqual(['required', 'required', 'bonus', 'exclusion', 'assumption', 'exclusion', 'assumption']);
  });

  frm('Automatische Auswahl: Cypher und Spiegelbild liefern X, A, B, C, D aus den Wendepunkten', () => {
    const pick = (rows: Row[]) => analyzeCyp(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate;
    const buy = pick(BASE);
    expect(buy.side).toBe('buy');
    expect(buy.verdict).toBe('valid');
    expect(buy.points).toEqual({
      X: { time: 42 * H4, price: 100 },
      A: { time: 52 * H4, price: 130 },
      B: { time: 56 * H4, price: 115 },
      C: { time: 70 * H4, price: 139 },
      D: { time: 78 * H4, price: 108.35 },
    });
    const sell = pick(mirror(BASE));
    expect(sell.side).toBe('sell');
    expect(sell.checks.map((c) => [c.id, c.state])).toEqual(buy.checks.map((c) => [c.id, c.state]));
  });

  frm('Ohne vier Wendepunkte gibt es keine Formation: alles nicht messbar, im Aufbau', () => {
    const cand = analyzeCyp(ctxOf({ H4: zig([100, 130, 115], [10, 4], 3) }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(cand.checks.every((x) => x.state === U)).toBe(true);
    expect(cand.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [AT.c + 3, AT.d! + 1, AT.d! + 4]) {
      const full = analyzeCyp(ctxOf({ H4: BASE }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeCyp(ctxOf({ H4: BASE.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Eigene Punkte in falscher Reihenfolge oder ohne geschlossene Kerze sind nicht messbar', () => {
    const swapped = checkCypCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', x: wick(BASE, AT.a, true), a: wick(BASE, AT.x, false), b: wick(BASE, AT.b, false), c: wick(BASE, AT.c, true) });
    expect(swapped.checks.every((x) => x.state === U)).toBe(true);
    const missing = checkCypCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', x: { time: 999 * H4, price: 100 }, a: wick(BASE, AT.a, true), b: wick(BASE, AT.b, false), c: wick(BASE, AT.c, true) });
    expect(missing.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- CYP 10 und LIB 09: Libra und Cypher fallen zusammen ----------------------------------------------------

/** Libra-Kandidat mit gewähltem Einstieg `price` und Stopp-Punkt K (LIB-12: E gilt erst mit K) */
const libraAt = (price: number, over: Partial<Candidate> = {}): Candidate => ({
  code: 'LIB',
  side: 'buy',
  tf: 'H4',
  points: { E: { time: 0, price }, K: { time: 0, price: price + 5 } },
  checks: [],
  drawings: [],
  verdict: 'valid',
  ...over,
});

/** Cypher-Kandidat, dessen Einstieg (Level 0.786 der Fib X → C) bei `entry` liegt: C 100, X so, dass 100 + 0.786 × (X − 100) = entry */
const cypherAt = (side: 'buy' | 'sell', entry: number, over: Partial<Candidate> = {}): Candidate => ({
  code: 'CYP',
  side,
  tf: 'H4',
  points: { X: { time: 0, price: 100 + (entry - 100) / 0.786 }, C: { time: 1, price: 100 } },
  checks: [],
  drawings: [],
  verdict: 'valid',
  ...over,
});

/** Libra (Verkauf) aus dem FRM-09-Aufbau: Vorlauf-Tief 100, P1 130 (Index 10), P2 140 (26), P3 105 (30); gewählter Einstieg 129.8 */
const LIB_ROWS = zig([100, 130, 112, 140, 105, 131], [8, 8, 8, 4, 8], 3);
const libRun = (cyphers?: Candidate[]): Candidate =>
  checkLibCandidate(ctxOf({ H4: LIB_ROWS }), END, { tf: 'H4', p1: wick(LIB_ROWS, 10, true), p2: wick(LIB_ROWS, 26, true), p3: wick(LIB_ROWS, 30, false) }, undefined, cyphers);

test.describe('CYP 10 und LIB 09: Libra-Einstieg fällt mit dem Cypher-Einstieg zusammen', () => {
  frm('CYP 10: Libra-Einstieg 0.05 vom Cypher-Einstieg (≤ 0,5 × ATR) ist ☑, 11.65 entfernt ☐', () => {
    expect(state(run({ H4: BASE }, AT, { libras: [libraAt(108.4)] }), 'CYP-10')).toBe(M);
    expect(state(run({ H4: BASE }, AT, { libras: [libraAt(120)] }), 'CYP-10')).toBe(N);
  });

  frm('CYP 10: Libra der Gegenrichtung, ungültige Libra und keine Libra zählen nicht', () => {
    expect(state(run({ H4: BASE }, AT, { libras: [libraAt(108.4, { side: 'sell' })] }), 'CYP-10')).toBe(N);
    expect(state(run({ H4: BASE }, AT, { libras: [libraAt(108.4, { verdict: 'invalid' })] }), 'CYP-10')).toBe(N);
    expect(state(run({ H4: BASE }, AT, { libras: [] }), 'CYP-10')).toBe(N);
  });

  frm('CYP 10: Libra mit Einstieg E, aber ohne Stopp-Punkt K ist kein Einstieg: ☐, mit K ☑', () => {
    const noK = libraAt(108.4);
    delete noK.points.K;
    expect(state(run({ H4: BASE }, AT, { libras: [noK] }), 'CYP-10')).toBe(N);
    expect(state(run({ H4: BASE }, AT, { libras: [libraAt(108.4)] }), 'CYP-10')).toBe(M);
  });

  frm('LIB 09: der Libra-Einstieg 129.8 und ein Cypher-Einstieg 130.0 fallen zusammen: ☑', () => {
    const c = libRun([cypherAt('sell', 130)]);
    expect(c.points.E.price).toBeCloseTo(129.8, 6);
    expect(state(c, 'LIB-09')).toBe(M);
  });

  frm('LIB 09: ein Cypher-Einstieg 135 liegt weit vom Libra-Einstieg: ☐', () => {
    expect(state(libRun([cypherAt('sell', 135)]), 'LIB-09')).toBe(N);
  });

  frm('LIB 09: ohne Cypher derselben Richtung (Gegenrichtung, ungültig, keiner) ist die Bedingung nicht messbar', () => {
    expect(state(libRun([cypherAt('buy', 130)]), 'LIB-09')).toBe(U);
    expect(state(libRun([cypherAt('sell', 130, { verdict: 'invalid' })]), 'LIB-09')).toBe(U);
    expect(state(libRun([]), 'LIB-09')).toBe(U);
  });

  frm('LIB 09: eine im Aufbau stehende Cypher zählt mit', () => {
    expect(state(libRun([cypherAt('sell', 130, { verdict: 'forming' })]), 'LIB-09')).toBe(M);
  });

  frm('Libra und Cypher rufen sich nicht endlos gegenseitig auf', () => {
    const ctx = ctxOf({ H4: BASE });
    const lib = analyzeLib(ctx, END).find((a) => a.tf === 'H4')!.candidate;
    const cypher = analyzeCyp(ctx, END).find((a) => a.tf === 'H4')!.candidate;
    expect(lib.checks.map((k) => k.id)).toEqual([...LIB_CHECK_IDS]);
    expect(state(lib, 'LIB-09')).not.toBe(M);
    expect(cypher.checks.map((k) => k.id)).toEqual([...CYP_CHECK_IDS]);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (name: string, iso: string): Candidate => {
  const fixture = loadFixture(name);
  const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars });
  return analyzeCyp(ctx, at(iso)).find((a) => a.tf === 'H4')!.candidate;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));
const time = (c: Candidate, point: string) => new Date(c.points[point].time * 1000).toISOString().slice(0, 16);
const times = (c: Candidate) => ['X', 'A', 'B', 'C', 'D'].map((p) => time(c, p));
const CORE = ['CYP-01', 'CYP-03', 'CYP-04', 'CYP-05', 'CYP-06', 'CYP-07'];

test.describe('CYP: echte Kerzen', () => {
  frm('cyp-buy-h4-01: Kauf-Cypher mit Divergenz und RSI(7) 80.6 am C ist gültig, D bei 0.873 von X → C', () => {
    const c = analyzeAt('cyp-buy-h4-01', '2025-12-17T00:00');
    expect(c.side).toBe('buy');
    expect(times(c)).toEqual(['2025-12-15T08:00', '2025-12-15T16:00', '2025-12-15T20:00', '2025-12-16T12:00', '2025-12-16T20:00']);
    expect(states(c, CORE)).toEqual([M, M, M, M, M, M]);
    // CYP-09 misst am echten D: Tief 1.17346 liegt 0.00006 über der Oberkante 1.1734 der nächsten Unterstützungszone
    expect(states(c, ['CYP-08', 'CYP-09', 'CYP-10', 'CYP-11', 'CYP-14'])).toEqual([N, N, N, N, N]);
    expect(c.verdict).toBe('valid');
  });

  frm('cyp-sell-h4-01: Negativ – Verkauf-Cypher, C schließt jenseits 1.414 (CYP 11) und ist ungültig', () => {
    const c = analyzeAt('cyp-sell-h4-01', '2025-11-10T08:00');
    expect(c.side).toBe('sell');
    expect(states(c, CORE)).toEqual([M, M, M, M, M, M]);
    expect(state(c, 'CYP-11')).toBe(M);
    expect(c.verdict).toBe('invalid');
  });

  frm('cyp-bad-h4-01: Negativ – ohne Divergenz zwischen A und C (CYP 05 ☐) ist die Cypher ungültig', () => {
    const c = analyzeAt('cyp-bad-h4-01', '2025-12-11T16:00');
    // CYP-09 misst am echten D: Tief 0.93251 liegt in der Unterstützungszone 0.92965 bis 0.93286
    expect(states(c, ['CYP-05', 'CYP-06', 'CYP-07', 'CYP-08', 'CYP-09', 'CYP-12'])).toEqual([N, M, M, M, M, M]);
    expect(c.verdict).toBe('invalid');
  });

  frm('cyp-bad-h4-02: Negativ – Verkauf-Cypher, RSI(7) am C nur 40 (CYP 06 ☐)', () => {
    const c = analyzeAt('cyp-bad-h4-02', '2025-11-26T00:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['CYP-05', 'CYP-06', 'CYP-07', 'CYP-11'])).toEqual([M, N, M, N]);
    expect(c.verdict).toBe('invalid');
  });

  frm('cyp-bad-h4-03: Negativ – B nur an 0.239 (CYP 03 ☐) und D bei 0.092 von X → C noch weit von 0.786 (CYP 07 ☐)', () => {
    const c = analyzeAt('cyp-bad-h4-03', '2025-12-05T20:00');
    expect(states(c, ['CYP-03', 'CYP-04', 'CYP-05', 'CYP-06', 'CYP-07'])).toEqual([N, M, M, M, N]);
    expect(find(c, 'CYP-03').value!).toBeLessThan(0.382);
    expect(find(c, 'CYP-07').value!).toBeLessThan(0.786);
    expect(c.verdict).toBe('invalid');
  });

  frm('cyp-lib-h4-01: Verkauf-Cypher mit einem Libra-Einstieg am D (CYP 10 ☑); ohne RSI am C ungültig, darum LIB 09 nicht messbar', () => {
    const c = analyzeAt('cyp-lib-h4-01', '2025-12-30T20:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['CYP-05', 'CYP-06', 'CYP-07', 'CYP-09', 'CYP-10'])).toEqual([M, N, M, N, M]);
    expect(c.verdict).toBe('invalid');
    const fixture = loadFixture('cyp-lib-h4-01');
    const lib = analyzeLib(new FormationContext(fixture.symbol, { H4: fixture.bars }), at('2025-12-30T20:00')).find((a) => a.tf === 'H4')!.candidate;
    expect(state(lib, 'LIB-09')).toBe(U);
  });

  frm('cyp-lib-h4-02: Kauf-Cypher, Libra-Einstieg am D noch nicht berührt (ohne K): CYP 10 ☐', () => {
    const c = analyzeAt('cyp-lib-h4-02', '2025-12-11T08:00');
    expect(c.side).toBe('buy');
    // die Libra ist `forming` (E 1.16386, kein K, LIB-12 ☐): ihr Einstieg zählt noch nicht
    expect(states(c, ['CYP-05', 'CYP-07', 'CYP-09', 'CYP-10'])).toEqual([M, M, M, N]);
  });
});

// ---- Abdeckung -------------------------------------------------------------------------------------------------

/** Echte Fälle (Fixture, Zeitpunkt), die zur Abdeckung zählen */
const REAL_RUNS: [string, string][] = [
  ['cyp-buy-h4-01', '2025-12-17T00:00'],
  ['cyp-sell-h4-01', '2025-11-10T08:00'],
  ['cyp-bad-h4-01', '2025-12-11T16:00'],
  ['cyp-bad-h4-02', '2025-11-26T00:00'],
  ['cyp-bad-h4-03', '2025-12-05T20:00'],
  ['cyp-lib-h4-01', '2025-12-30T20:00'],
  ['cyp-lib-h4-02', '2025-12-11T08:00'],
];

test.describe('CYP: Abdeckung', () => {
  frm('jede Bedingung der Cypher hat einen Fall mit ☑ und einen mit ☐', () => {
    const candidates = [...CASES.map((c) => c.candidate()), ...REAL_RUNS.map(([name, iso]) => analyzeAt(name, iso))];
    const miss: string[] = [];
    for (const id of CYP_CHECK_IDS) {
      const got = new Set(candidates.map((c) => state(c, id)));
      if (!got.has(M)) miss.push(`${id} ohne ☑`);
      if (!got.has(N)) miss.push(`${id} ohne ☐`);
    }
    expect(miss).toEqual([]);
  });

  frm('LIB 09 hat einen Fall mit ☑ und einen mit ☐', () => {
    const got = new Set([libRun([cypherAt('sell', 130)]), libRun([cypherAt('sell', 135)])].map((c) => state(c, 'LIB-09')));
    expect([...got].sort()).toEqual([M, N].sort());
  });
});
