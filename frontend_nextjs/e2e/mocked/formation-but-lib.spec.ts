/**
 * Butterfly (BUT): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen und auf echten Reihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts); Bausteine in e2e/fixtures/formation-harmonic.ts.
 *
 * Basis (Kauf): X 100, A 130 (Länge 30). B an 106 = 0.8 von X → A. C an 120.16 = 0.59 von A → B (A → B = 24; 106 + 0.59 × 24).
 * D an 1.272 von X → A jenseits von X: 130 − 1.272 × 30 = 91.84; das Tief von D liegt bei 91.8 (1.2733).
 * BC-Rückprojektion 2: 2 × 106 − 120.16 = 91.84 = Ziel-D (Abstand 0). AB-Ausdehnung 1.618: 106 − 0.618 × 24 = 91.168 (0.672 vom Ziel-D).
 * AB = CD: Level 1 = 120.16 − 24 = 96.16 (4.32 vom Ziel-D).
 * FRM-13 Formationserkennung: Butterfly
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeBut, checkButCandidate, BUT_CHECK_IDS } from '../../src/lib/formation/butChecks';
import { checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { analyzeGar } from '../../src/lib/formation/garChecks';
import { analyzeBat } from '../../src/lib/formation/batChecks';
import { analyzeCyp } from '../../src/lib/formation/cypChecks';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { END, H4, mirror, zig, type Row } from '../fixtures/formation-rows';
import { AT, M, N, U, atOf, chop, ctxOf, find, harmonic, lowerRows, makeRun, state, wick, wickOnlyD } from '../fixtures/formation-harmonic';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-13' }, fn);
const run = makeRun(checkButCandidate);
const runCrab = makeRun(checkCrbCandidate);

const BASE = harmonic([100, 130, 106, 120.16, 91.8]);

// ---- Reihen ----------------------------------------------------------------------------------------------------

/** B an 106.425: 0.005 über dem Level 0.786 (106.42), innerhalb der Toleranz von 1 Pip (0.01) */
const B_TOL = harmonic([100, 130, 106.425, 120.16, 91.8]);
/** B an 106.44: 0.02 über dem Level, außerhalb der Toleranz */
const B_FAR = harmonic([100, 130, 106.44, 120.16, 91.8]);
/** B an 109: nur 0.7 */
const B_SHALLOW = harmonic([100, 130, 109, 120.16, 91.8]);
/** B an 103: 0.9 von X → A, über 0.886 */
const B_DEEP = harmonic([100, 130, 103, 120.16, 91.8]);
/** B an 103.6: 0.88, unter 0.886 */
const B_EDGE = harmonic([100, 130, 103.6, 120.16, 91.8]);
/** C an 115.163: 0.005 unter dem Level 0.382 von A → B (115.168), innerhalb der Toleranz */
const C_TOL = harmonic([100, 130, 106, 115.163, 91.8]);
/** C an 115.15: 0.018 unter dem Level, außerhalb */
const C_FAR = harmonic([100, 130, 106, 115.15, 91.8]);
/** C an 113.2: nur 0.3 */
const C_SHALLOW = harmonic([100, 130, 106, 113.2, 91.8]);
/** C an 127.6: 0.9 von A → B, über 0.886 */
const C_DEEP = harmonic([100, 130, 106, 127.6, 91.8]);
/** C an 127.12: 0.88, unter 0.886 */
const C_EDGE = harmonic([100, 130, 106, 127.12, 91.8]);
/** C an 120.825: 0.007 unter dem Level 0.618 (120.832), innerhalb der Toleranz */
const C_STRONG_TOL = harmonic([100, 130, 106, 120.825, 91.8]);
/** C an 120.81: 0.022 unter dem Level, außerhalb */
const C_STRONG_FAR = harmonic([100, 130, 106, 120.81, 91.8]);
/** C an 125: die BC-Rückprojektion 2 liegt bei 87, weit vom Ziel-D */
const C_HIGH = harmonic([100, 130, 106, 125, 91.8]);
/** C an 115.84: AB = CD (Level 1 bei 91.84) fällt auf das Ziel-D */
const C_INNER = harmonic([100, 130, 106, 115.84, 91.8]);
/** B an 104.5: die AB-Ausdehnung 1.618 liegt bei 88.74, weit vom Ziel-D */
const B_EXT = harmonic([100, 130, 104.5, 120.16, 91.8]);
/** D an 92.4: nur 1.2533 */
const D_SHORT = harmonic([100, 130, 106, 120.16, 92.4]);
/** D an 91.845: 0.005 über dem Level 1.272 (91.84), innerhalb der Toleranz */
const D_TOL = harmonic([100, 130, 106, 120.16, 91.845]);
/** D an 91.86: 0.02 über dem Level, außerhalb */
const D_FAR = harmonic([100, 130, 106, 120.16, 91.86]);
/** Nur der Docht von D reicht unter B, kein Schluss zwischen C und D unter 106 */
const NO_CLOSE = wickOnlyD(BASE, AT, 112);
/** Lange Züge A → B und C → D gleich: keine Divergenz zwischen B und D */
const FLAT_LEGS = [10, 10, 6, 6];
const NO_DIVERGENCE = harmonic([100, 130, 106, 120.16, 91.8], FLAT_LEGS);
/** Lauter Anlauf zu D: RSI(7) am Tief bleibt über 20 */
const CHOP_D = chop(BASE, AT.d! - 5, AT.d! - 1);
/** D1-Aufwärts- und Abwärtstrend für BUT-15 */
const D1_UP = zig([100, 120, 110, 140, 125, 160], 8, 3);
const D1_DOWN = mirror(D1_UP);
/** Gartley-, Bat-, Cypher- und Crab-Form (gleiche X, A; andere B, C, D) für die Abgrenzung */
const GAR_FORM = harmonic([100, 130, 111.46, 122.92, 106.41]);
const BAT_FORM = harmonic([100, 130, 115, 120.8, 103.42]);
const CYP_FORM = harmonic([100, 130, 115, 139, 108.35]);
const CRAB_FORM = harmonic([100, 130, 112, 123.68, 81.4]);
const DEEP_CRAB_FORM = harmonic([100, 130, 103, 124.54, 81.4]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const BASE_EXPECT: Record<string, CheckState> = {
  'BUT-01': M, 'BUT-02': M, 'BUT-03': N, 'BUT-04': M, 'BUT-05': N, 'BUT-06': M, 'BUT-07': M, 'BUT-08': N, 'BUT-09': M, 'BUT-10': M,
  'BUT-11': N, 'BUT-13': M, 'BUT-14': M, 'BUT-15': U, 'BUT-16': U,
};

const CASES: Case[] = [
  { name: 'Form: B 0.8, C 0.59, D 1.2733 der Fib X → A jenseits von X, Kauf', candidate: () => run({ H4: BASE }), expect: BASE_EXPECT },
  { name: 'Spiegel: Verkauf-Butterfly hat dieselben Zustände', candidate: () => run({ H4: mirror(BASE) }, AT, { buy: false }), expect: BASE_EXPECT },
  { name: 'BUT 01: A nicht an der Dochtspitze', candidate: () => run({ H4: BASE }, AT, { price: { a: 129.5 } }), expect: { 'BUT-01': N } },
  { name: 'BUT 01: B oberhalb von A, die Punkte wechseln nicht die Seite', candidate: () => run({ H4: BASE }, AT, { price: { b: 135 } }), expect: { 'BUT-01': N } },
  { name: 'BUT 02: B 0.005 über dem Level 0.786 gilt als Berührung (1 Pip = 0.01)', candidate: () => run({ H4: B_TOL }), expect: { 'BUT-02': M } },
  { name: 'BUT 02: B 0.02 über dem Level 0.786 berührt nicht', candidate: () => run({ H4: B_FAR }), expect: { 'BUT-02': N } },
  { name: 'BUT 02: B nur an 0.7', candidate: () => run({ H4: B_SHALLOW }), expect: { 'BUT-02': N } },
  { name: 'BUT 03: B an 0.9 berührt 0.886', candidate: () => run({ H4: B_DEEP }), expect: { 'BUT-02': M, 'BUT-03': M } },
  { name: 'BUT 03: B an 0.88 berührt 0.886 nicht', candidate: () => run({ H4: B_EDGE }), expect: { 'BUT-03': N } },
  { name: 'BUT 04: C 0.005 unter dem Level 0.382 gilt als Berührung', candidate: () => run({ H4: C_TOL }), expect: { 'BUT-04': M } },
  { name: 'BUT 04: C 0.018 unter dem Level 0.382 berührt nicht', candidate: () => run({ H4: C_FAR }), expect: { 'BUT-04': N } },
  { name: 'BUT 04: C nur an 0.3', candidate: () => run({ H4: C_SHALLOW }), expect: { 'BUT-04': N } },
  { name: 'BUT 05: C an 0.9 berührt 0.886', candidate: () => run({ H4: C_DEEP }), expect: { 'BUT-05': M } },
  { name: 'BUT 05: C an 0.88 berührt 0.886 nicht', candidate: () => run({ H4: C_EDGE }), expect: { 'BUT-05': N } },
  { name: 'BUT 06: ein Schluss zwischen C und D unter B (Basis)', candidate: () => run({ H4: BASE }), expect: { 'BUT-06': M } },
  { name: 'BUT 06: nur der Docht von D reicht unter B, kein Schluss darunter', candidate: () => run({ H4: NO_CLOSE }), expect: { 'BUT-06': N, 'BUT-07': M } },
  { name: 'BUT 07: D an 1.2533 statt 1.272', candidate: () => run({ H4: D_SHORT }), expect: { 'BUT-07': N } },
  { name: 'BUT 07: D 0.005 über dem Level 1.272 gilt als Berührung', candidate: () => run({ H4: D_TOL }), expect: { 'BUT-07': M } },
  { name: 'BUT 07: D 0.02 über dem Level 1.272 berührt nicht', candidate: () => run({ H4: D_FAR }), expect: { 'BUT-07': N } },
  { name: 'BUT 07: ohne Kerze nach C ist D nicht erreicht', candidate: () => run({ H4: BASE.slice(0, AT.c + 1) }, { x: AT.x, a: AT.a, b: AT.b, c: AT.c }), expect: { 'BUT-06': N, 'BUT-07': N, 'BUT-13': U } },
  { name: 'BUT 08: C 0.007 unter dem Level 0.618 gilt als Berührung', candidate: () => run({ H4: C_STRONG_TOL }), expect: { 'BUT-08': M } },
  { name: 'BUT 08: C 0.022 unter dem Level 0.618 berührt nicht', candidate: () => run({ H4: C_STRONG_FAR }), expect: { 'BUT-08': N } },
  { name: 'BUT 09: C an 125, die BC-Rückprojektion 2 liegt weit vom Ziel-D', candidate: () => run({ H4: C_HIGH }), expect: { 'BUT-09': N } },
  { name: 'BUT 10: B an 104.5, die AB-Ausdehnung 1.618 liegt weit vom Ziel-D', candidate: () => run({ H4: B_EXT }), expect: { 'BUT-10': N } },
  { name: 'BUT 11: C an 115.84, AB = CD fällt auf das Ziel-D', candidate: () => run({ H4: C_INNER }), expect: { 'BUT-11': M } },
  { name: 'BUT 13: lauter Anlauf zu D, RSI(7) am Tief über 20', candidate: () => run({ H4: CHOP_D }), expect: { 'BUT-13': N } },
  { name: 'BUT 14: gleich lange Züge A → B und C → D, keine Divergenz', candidate: () => run({ H4: NO_DIVERGENCE }, atOf(FLAT_LEGS)), expect: { 'BUT-14': N } },
  { name: 'BUT 15: D1 steigt, Kauf in Trend-Richtung', candidate: () => run({ H4: BASE, D1: D1_UP }), expect: { 'BUT-15': M } },
  { name: 'BUT 15: D1 fällt, Kauf gegen die höhere Zeiteinheit', candidate: () => run({ H4: BASE, D1: D1_DOWN }), expect: { 'BUT-15': N } },
  { name: 'BUT 15: ohne höhere Zeiteinheit nicht messbar', candidate: () => run({ H4: BASE }), expect: { 'BUT-15': U } },
  { name: 'BUT 16: Engulf in H1 ab der Kerze von D', candidate: () => run({ H4: BASE, H1: lowerRows(AT, 91.8, true) }), expect: { 'BUT-16': M } },
  { name: 'BUT 16: H1 ohne Umkehrkerze', candidate: () => run({ H4: BASE, H1: lowerRows(AT, 91.8, false) }), expect: { 'BUT-16': N } },
  { name: 'BUT 16: ohne tiefere Zeiteinheit nicht messbar', candidate: () => run({ H4: BASE }), expect: { 'BUT-16': U } },
];

test.describe('BUT: Bedingungen auf von Hand gerechneten Reihen', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const cand = c.candidate();
      const got: Record<string, CheckState> = {};
      for (const id of Object.keys(c.expect)) got[id] = state(cand, id);
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('BUT: Abgrenzung, Urteil und Zeichnungen', () => {
  frm('Abgrenzung Butterfly ↔ Gartley, Bat, Cypher: gleiche X und A, B und D passen nur zur eigenen Form', () => {
    const pick = (fn: typeof analyzeBut, rows: Row[]) => fn(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate.verdict;
    expect(run({ H4: BASE }).verdict).toBe('valid');
    expect(pick(analyzeGar, BASE)).toBe('invalid');
    expect(pick(analyzeBat, BASE)).toBe('invalid');
    expect(pick(analyzeCyp, BASE)).toBe('invalid');
    for (const rows of [GAR_FORM, BAT_FORM, CYP_FORM]) {
      const asBut = run({ H4: rows }, AT, { price: {} });
      expect(asBut.verdict).toBe('invalid');
      expect(state(asBut, 'BUT-02')).toBe(N);
    }
  });

  frm('Abgrenzung Butterfly ↔ Crab: D bei 1.272 ist Butterfly, D bei 1.618 mit tieferem B ist Crab', () => {
    const crab = runCrab({ H4: BASE });
    expect([state(crab, 'CRB-04'), state(crab, 'CRB-07'), crab.verdict]).toEqual([N, M, 'invalid']);
    const asBut = run({ H4: CRAB_FORM }, AT, { price: {} });
    expect([state(asBut, 'BUT-02'), asBut.verdict]).toEqual([N, 'invalid']);
    const deep = run({ H4: DEEP_CRAB_FORM }, AT, { price: {} });
    expect([state(deep, 'BUT-03'), deep.verdict]).toEqual([M, 'invalid']);
  });

  frm('Urteil: gültig, im Aufbau ohne D oder ohne Schluss unter B, ungültig mit Ausschluss oder fehlender Form', () => {
    expect(run({ H4: BASE }).verdict).toBe('valid');
    expect(run({ H4: D_SHORT }).verdict).toBe('forming');
    expect(run({ H4: NO_CLOSE }).verdict).toBe('forming');
    expect(run({ H4: B_DEEP }).verdict).toBe('invalid');
    expect(run({ H4: C_DEEP }).verdict).toBe('invalid');
    expect(run({ H4: B_SHALLOW }).verdict).toBe('invalid');
    expect(run({ H4: C_SHALLOW }).verdict).toBe('invalid');
    expect(run({ H4: BASE }, AT, { price: { a: 129.5 } }).verdict).toBe('invalid');
    expect(run({ H4: BASE, D1: D1_DOWN }).verdict).toBe('valid');
  });

  frm('Zeichnungen: Z-BUT 01, 02, 03, 04, 06 immer, Z-BUT 05 nur mit erreichtem D', () => {
    const ok = run({ H4: BASE });
    expect(ok.drawings.map((d) => d.id)).toEqual(['Z-BUT-01', 'Z-BUT-02', 'Z-BUT-03', 'Z-BUT-04', 'Z-BUT-06', 'Z-BUT-05']);
    const short = run({ H4: D_SHORT });
    expect(short.drawings.map((d) => d.id)).toEqual(['Z-BUT-01', 'Z-BUT-02', 'Z-BUT-03', 'Z-BUT-04', 'Z-BUT-06']);
    expect(ok.drawings.find((d) => d.id === 'Z-BUT-01')!.levels).toEqual([0.786, 0.886, 1.272]);
    expect(ok.drawings.find((d) => d.id === 'Z-BUT-02')!.levels).toEqual([0.382, 0.618, 0.786, 0.886, -0.618]);
    expect(ok.drawings.find((d) => d.id === 'Z-BUT-03')!.levels).toEqual([2]);
    expect(ok.drawings.find((d) => d.id === 'Z-BUT-04')!.levels).toEqual([1]);
    expect(ok.drawings.find((d) => d.id === 'Z-BUT-05')!.levels).toEqual([0.382, 0.618, -0.382]);
    expect(find(ok, 'BUT-07').drawings).toEqual(['Z-BUT-01', 'Z-BUT-06']);
    expect(find(ok, 'BUT-09').drawings).toEqual(['Z-BUT-03']);
    expect(ok.drawings.every((d) => d.side === 'buy')).toBe(true);
  });

  frm('Pflicht, Ausschluss und Verstärkung: Formkern BUT 01 bis 07, Filter BUT 08 bis 16', () => {
    const c = run({ H4: BASE });
    expect(c.checks.map((k) => k.kind)).toEqual([
      'required', 'required', 'exclusion', 'required', 'exclusion', 'required', 'required',
      'bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus',
    ]);
    expect(c.checks.every((k) => k.status === 'secondary')).toBe(true);
  });

  frm('Automatische Auswahl: Butterfly und Spiegelbild liefern X, A, B, C, D aus den Wendepunkten', () => {
    const pick = (rows: Row[]) => analyzeBut(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate;
    const buy = pick(BASE);
    expect(buy.side).toBe('buy');
    expect(buy.verdict).toBe('valid');
    expect(buy.points).toEqual({
      X: { time: 42 * H4, price: 100 },
      A: { time: 52 * H4, price: 130 },
      B: { time: 82 * H4, price: 106 },
      C: { time: 88 * H4, price: 120.16 },
      D: { time: 94 * H4, price: 91.8 },
    });
    const sell = pick(mirror(BASE));
    expect(sell.side).toBe('sell');
    expect(sell.checks.map((c) => [c.id, c.state])).toEqual(buy.checks.map((c) => [c.id, c.state]));
  });

  frm('Ohne vier Wendepunkte gibt es keine Formation: alles nicht messbar, im Aufbau', () => {
    const cand = analyzeBut(ctxOf({ H4: zig([100, 130, 106], [10, 30], 3) }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(cand.checks.every((x) => x.state === U)).toBe(true);
    expect(cand.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [AT.c + 3, AT.d! + 1, AT.d! + 4]) {
      const full = analyzeBut(ctxOf({ H4: BASE }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeBut(ctxOf({ H4: BASE.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Eigene Punkte in falscher Reihenfolge oder ohne geschlossene Kerze sind nicht messbar', () => {
    const swapped = checkButCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', x: wick(BASE, AT.a, true), a: wick(BASE, AT.x, false), b: wick(BASE, AT.b, false), c: wick(BASE, AT.c, true) });
    expect(swapped.checks.every((x) => x.state === U)).toBe(true);
    const missing = checkButCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', x: { time: 999 * H4, price: 100 }, a: wick(BASE, AT.a, true), b: wick(BASE, AT.b, false), c: wick(BASE, AT.c, true) });
    expect(missing.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (name: string, iso: string): Candidate => {
  const fixture = loadFixture(name);
  const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars });
  return analyzeBut(ctx, at(iso)).find((a) => a.tf === 'H4')!.candidate;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));
const time = (c: Candidate, point: string) => new Date(c.points[point].time * 1000).toISOString().slice(0, 16);
const times = (c: Candidate) => ['X', 'A', 'B', 'C', 'D'].map((p) => time(c, p));
const CORE = ['BUT-01', 'BUT-02', 'BUT-03', 'BUT-04', 'BUT-05', 'BUT-06', 'BUT-07'];

test.describe('BUT: echte Kerzen', () => {
  frm('but-buy-h4-01: Kauf-Butterfly, B bei 0.879, D bei 1.37, AB=CD und PRZ am Ziel-D ist gültig', () => {
    const c = analyzeAt('but-buy-h4-01', '2026-01-14T12:00');
    expect(c.side).toBe('buy');
    expect(times(c)).toEqual(['2026-01-09T00:00', '2026-01-09T16:00', '2026-01-12T00:00', '2026-01-12T12:00', '2026-01-13T00:00']);
    expect(states(c, CORE)).toEqual([M, M, N, M, N, M, M]);
    expect(states(c, ['BUT-08', 'BUT-09', 'BUT-10', 'BUT-11', 'BUT-12', 'BUT-13', 'BUT-14'])).toEqual([M, M, M, M, N, N, N]);
    expect(c.verdict).toBe('valid');
  });

  frm('but-sell-h4-01: Verkauf-Butterfly mit RSI(7) 85 am D und einer Zone am Ziel-D ist gültig', () => {
    const c = analyzeAt('but-sell-h4-01', '2026-02-19T08:00');
    expect(c.side).toBe('sell');
    expect(times(c)).toEqual(['2026-02-12T12:00', '2026-02-12T16:00', '2026-02-13T08:00', '2026-02-16T00:00', '2026-02-19T04:00']);
    expect(states(c, CORE)).toEqual([M, M, N, M, N, M, M]);
    expect(states(c, ['BUT-08', 'BUT-09', 'BUT-10', 'BUT-11', 'BUT-12', 'BUT-13'])).toEqual([M, N, M, M, M, M]);
    expect(c.verdict).toBe('valid');
  });

  frm('but-bad-h4-01: Negativ – B weit jenseits von X (BUT 03 ☑), die Butterfly ist ungültig', () => {
    const c = analyzeAt('but-bad-h4-01', '2025-11-06T00:00');
    expect(c.side).toBe('buy');
    expect(states(c, ['BUT-01', 'BUT-02', 'BUT-03', 'BUT-04', 'BUT-05'])).toEqual([M, M, M, M, N]);
    expect(find(c, 'BUT-02').value!).toBeGreaterThan(0.886);
    expect(c.verdict).toBe('invalid');
  });

  frm('but-bad-h4-02: Negativ – C nur an 0.264 von A → B (BUT 04 ☐), die Butterfly ist ungültig', () => {
    const c = analyzeAt('but-bad-h4-02', '2026-01-20T12:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['BUT-02', 'BUT-03', 'BUT-04', 'BUT-07'])).toEqual([M, N, N, M]);
    expect(find(c, 'BUT-04').value!).toBeLessThan(0.382);
    expect(c.verdict).toBe('invalid');
  });

  frm('but-form-h4-01: im Aufbau – D erst bei 1.091 (BUT 07 ☐), Form sonst ☑', () => {
    const c = analyzeAt('but-form-h4-01', '2025-10-30T16:00');
    expect(c.side).toBe('buy');
    expect(states(c, CORE)).toEqual([M, M, N, M, N, M, N]);
    expect(find(c, 'BUT-07').value!).toBeLessThan(1.272);
    expect(c.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft bei echten Reihen: ohne die späteren Kerzen dasselbe Ergebnis', () => {
    for (const [name, iso] of REAL_RUNS) {
      const fixture = loadFixture(name);
      const t = at(iso);
      const cut = fixture.bars.filter((b) => b.time < t);
      const full = analyzeBut(new FormationContext(fixture.symbol, { H4: fixture.bars }), t).find((a) => a.tf === 'H4')!;
      const prefix = analyzeBut(new FormationContext(fixture.symbol, { H4: cut }), t).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Abgrenzung echt: Gartley-, Bat- und Cypher-Fälle sind keine gültige Butterfly', () => {
    for (const [name, iso] of [['gar-buy-h4-01', '2025-11-17T12:00'], ['gar-sell-h4-01', '2026-01-09T08:00'], ['bat-buy-h4-01', '2025-12-16T16:00'], ['cyp-buy-h4-01', '2025-12-17T00:00'], ['cyp-sell-h4-01', '2025-11-10T08:00']]) {
      expect(analyzeAt(name, iso).verdict).not.toBe('valid');
    }
  });
});

// ---- Abdeckung -------------------------------------------------------------------------------------------------

/** Echte Fälle (Fixture, Zeitpunkt), die zur Abdeckung zählen */
const REAL_RUNS: [string, string][] = [
  ['but-buy-h4-01', '2026-01-14T12:00'],
  ['but-sell-h4-01', '2026-02-19T08:00'],
  ['but-bad-h4-01', '2025-11-06T00:00'],
  ['but-bad-h4-02', '2026-01-20T12:00'],
  ['but-form-h4-01', '2025-10-30T16:00'],
];

test.describe('BUT: Abdeckung', () => {
  frm('jede Bedingung der Butterfly hat einen Fall mit ☑ und einen mit ☐', () => {
    const candidates = [...CASES.map((c) => c.candidate()), ...REAL_RUNS.map(([name, iso]) => analyzeAt(name, iso))];
    const miss: string[] = [];
    for (const id of BUT_CHECK_IDS) {
      const got = new Set(candidates.map((c) => state(c, id)));
      if (!got.has(M)) miss.push(`${id} ohne ☑`);
      if (!got.has(N)) miss.push(`${id} ohne ☐`);
    }
    expect(miss).toEqual([]);
  });
});
