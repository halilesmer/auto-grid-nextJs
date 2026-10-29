/**
 * Crab (CRB) mit Variante Deep Crab: je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen und auf echten Reihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts); Bausteine in e2e/fixtures/formation-harmonic.ts.
 *
 * Basis (Crab, Kauf): X 100, A 130 (Länge 30). B an 112 = 0.6 von X → A. C an 123.68 = 0.649 von A → B (A → B = 18; 112 + 0.649 × 18).
 * D an 1.618 von X → A jenseits von X: 130 − 1.618 × 30 = 81.46; das Tief von D liegt bei 81.4 (1.62).
 * BC-Rückprojektion 3.618: 123.68 − 3.618 × 11.68 = 81.42 (0.04 vom Ziel-D); 2 und 2.618 liegen bei 100.32 und 93.10.
 * Deep Crab: B an 103 = 0.9, C an 124.54; die BC-Rückprojektion 2 liegt bei 2 × 103 − 124.54 = 81.46 = Ziel-D.
 * FRM-14 Formationserkennung: Crab
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeCrb, checkCrbCandidate, CRB_CHECK_IDS } from '../../src/lib/formation/crbChecks';
import { checkButCandidate } from '../../src/lib/formation/butChecks';
import { analyzeGar } from '../../src/lib/formation/garChecks';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { END, H4, mirror, zig, type Row } from '../fixtures/formation-rows';
import { M, N, U, atOf, chop, ctxOf, find, harmonic as harmonicWith, lowerRows, makeRun, state, wick, wickOnlyD } from '../fixtures/formation-harmonic';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-14' }, fn);

/** Kerzen je Zug X → A, A → B, B → C, C → D: der lange Zug A → B und der kurze Zug C → D lassen die Wave am D schwächer sein als am B (Divergenz) */
const CRAB_LEGS = [10, 40, 6, 3];
const AT = atOf(CRAB_LEGS);
const harmonic = (points: number[], legs: number[] = CRAB_LEGS) => harmonicWith(points, legs);
const run = makeRun(checkCrbCandidate, AT);
const runBut = makeRun(checkButCandidate, AT);

const BASE = harmonic([100, 130, 112, 123.68, 81.4]);
const DEEP = harmonic([100, 130, 103, 124.54, 81.4]);

// ---- Reihen ----------------------------------------------------------------------------------------------------

/** B an 118.545: 0.005 unter dem Level 0.382 (118.54), verfehlt das Level um weniger als 1 Pip */
const B_TOL = harmonic([100, 130, 118.545, 123.68, 81.4]);
/** B an 118.56: 0.02 unter dem Level, verfehlt das Level um mehr als 1 Pip */
const B_FAR = harmonic([100, 130, 118.56, 123.68, 81.4]);
/** B an 121 (0.3), C an 126 */
const B_SHALLOW = harmonic([100, 130, 121, 126, 81.4]);
/** B an 106: 0.8, über 0.786 (Butterfly-Gebiet), C an 123.68 */
const B_BUT = harmonic([100, 130, 106, 123.68, 81.4]);
/** B an 106.6: 0.78, unter 0.786 */
const B_EDGE = harmonic([100, 130, 106.6, 123.68, 81.4]);
/** Deep: B an 103.425, 0.005 über dem Level 0.886 (103.42) */
const DEEP_TOL = harmonic([100, 130, 103.425, 124.54, 81.4]);
/** Deep: B an 103.44, 0.02 über dem Level */
const DEEP_FAR = harmonic([100, 130, 103.44, 124.54, 81.4]);
/** Deep: B an 99, unter X (1.033) */
const B_BEYOND_X = harmonic([100, 130, 99, 124.54, 81.4]);
/** Deep: B an 100.5 (0.983), knapp vor X */
const B_AT_X = harmonic([100, 130, 100.5, 124.54, 81.4]);
/** C an 118.871: 0.005 unter dem Level 0.382 von A → B (118.876), verfehlt das Level um weniger als 1 Pip */
const C_TOL = harmonic([100, 130, 112, 118.871, 81.4]);
/** C an 118.86: 0.016 unter dem Level, außerhalb */
const C_FAR = harmonic([100, 130, 112, 118.86, 81.4]);
/** C an 115: nur 0.167 */
const C_SHALLOW = harmonic([100, 130, 112, 115, 81.4]);
/** C an 128.2: 0.9 von A → B, über 0.886 */
const C_DEEP = harmonic([100, 130, 112, 128.2, 81.4]);
/** C an 127.84: 0.88, unter 0.886 */
const C_EDGE = harmonic([100, 130, 112, 127.84, 81.4]);
/** D an 85: nur 1.5 */
const D_SHORT = harmonic([100, 130, 112, 123.68, 85]);
/** D an 81.465: 0.005 über dem Level 1.618 (81.46), verfehlt das Level um weniger als 1 Pip */
const D_TOL = harmonic([100, 130, 112, 123.68, 81.465]);
/** D an 81.48: 0.02 über dem Level, außerhalb */
const D_FAR = harmonic([100, 130, 112, 123.68, 81.48]);
/** Nur der Docht von D reicht unter B, kein Schluss zwischen C und D unter 112 */
const NO_CLOSE = wickOnlyD(BASE, AT, 118);
/** C an 126: die BC-Rückprojektionen 2.618 und 3.618 liegen bei 89.35 und 75.35, weit vom Ziel-D */
const C_HIGH = harmonic([100, 130, 112, 126, 81.4]);
/** Kurzer Zug A → B (10 Kerzen): die Wave am B ist nicht stärker als am D, keine Divergenz */
const FLAT_LEGS = [10, 10, 6, 6];
const NO_DIVERGENCE = harmonic([100, 130, 112, 123.68, 81.4], FLAT_LEGS);
/** Langer Zug C → D (12 Kerzen) mit lautem Anlauf: RSI(7) am Tief bleibt über 20 */
const LONG_LEGS = [10, 40, 6, 12];
const AT_LONG = atOf(LONG_LEGS);
const CHOP_D = chop(harmonic([100, 130, 112, 123.68, 81.4], LONG_LEGS), AT_LONG.d! - 6, AT_LONG.d! - 1);
const D1_UP = zig([100, 120, 110, 140, 125, 160], 8, 3);
const D1_DOWN = mirror(D1_UP);
/** Gartley-, Bat-, Cypher- und Butterfly-Form für die Abgrenzung */
const GAR_FORM = harmonic([100, 130, 111.46, 122.92, 106.41]);
const BAT_FORM = harmonic([100, 130, 115, 120.8, 103.42]);
const CYP_FORM = harmonic([100, 130, 115, 139, 108.35]);
const BUT_FORM = harmonic([100, 130, 106, 120.16, 91.8]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const BASE_EXPECT: Record<string, CheckState> = {
  'CRB-01': M, 'CRB-02': M, 'CRB-03': N, 'CRB-04': M, 'CRB-05': M, 'CRB-06': M, 'CRB-07': N, 'CRB-08': N, 'CRB-09': N,
  'CRB-10': M, 'CRB-11': N, 'CRB-13': M, 'CRB-14': M, 'CRB-15': M, 'CRB-16': U,
};
const DEEP_EXPECT: Record<string, CheckState> = {
  ...BASE_EXPECT, 'CRB-06': M, 'CRB-07': M, 'CRB-08': M, 'CRB-09': N, 'CRB-10': N, 'CRB-11': M,
};

const CASES: Case[] = [
  { name: 'Crab: B 0.6, C 0.649, D 1.62 der Fib X → A jenseits von X, Kauf', candidate: () => run({ H4: BASE }), expect: BASE_EXPECT },
  { name: 'Spiegel: Verkauf-Crab hat dieselben Zustände', candidate: () => run({ H4: mirror(BASE) }, AT, { buy: false }), expect: BASE_EXPECT },
  { name: 'Deep Crab: B 0.9, C 0.798, BC-Rückprojektion 2 am Ziel-D', candidate: () => run({ H4: DEEP }), expect: DEEP_EXPECT },
  { name: 'Spiegel: Verkauf-Deep-Crab hat dieselben Zustände', candidate: () => run({ H4: mirror(DEEP) }, AT, { buy: false }), expect: DEEP_EXPECT },
  { name: 'CRB 01: A nicht an der Dochtspitze', candidate: () => run({ H4: BASE }, AT, { price: { a: 129.5 } }), expect: { 'CRB-01': N } },
  { name: 'CRB 01: B oberhalb von A, die Punkte wechseln nicht die Seite', candidate: () => run({ H4: BASE }, AT, { price: { b: 135 } }), expect: { 'CRB-01': N } },
  { name: 'CRB 02: C 0.005 unter dem Level 0.382 berührt nicht', candidate: () => run({ H4: C_TOL }), expect: { 'CRB-02': N } },
  { name: 'CRB 02: C 0.016 unter dem Level 0.382 berührt nicht', candidate: () => run({ H4: C_FAR }), expect: { 'CRB-02': N } },
  { name: 'CRB 02: C nur an 0.167', candidate: () => run({ H4: C_SHALLOW }), expect: { 'CRB-02': N } },
  { name: 'CRB 03: C an 0.9 berührt 0.886', candidate: () => run({ H4: C_DEEP }), expect: { 'CRB-03': M } },
  { name: 'CRB 03: C an 0.88 berührt 0.886 nicht', candidate: () => run({ H4: C_EDGE }), expect: { 'CRB-03': N } },
  { name: 'CRB 04: D an 1.5 statt 1.618', candidate: () => run({ H4: D_SHORT }), expect: { 'CRB-04': N } },
  { name: 'CRB 04: D 0.005 über dem Level 1.618 berührt nicht', candidate: () => run({ H4: D_TOL }), expect: { 'CRB-04': N } },
  { name: 'CRB 04: D 0.02 über dem Level 1.618 berührt nicht', candidate: () => run({ H4: D_FAR }), expect: { 'CRB-04': N } },
  { name: 'CRB 04: ohne Kerze nach C ist D nicht erreicht', candidate: () => run({ H4: BASE.slice(0, AT.c + 1) }, { x: AT.x, a: AT.a, b: AT.b, c: AT.c }), expect: { 'CRB-04': N, 'CRB-05': N, 'CRB-13': U } },
  { name: 'CRB 05: ein Schluss zwischen C und D unter B (Basis)', candidate: () => run({ H4: BASE }), expect: { 'CRB-05': M } },
  { name: 'CRB 05: nur der Docht von D reicht unter B, kein Schluss darunter', candidate: () => run({ H4: NO_CLOSE }), expect: { 'CRB-05': N, 'CRB-04': M } },
  { name: 'CRB 06: B 0.005 unter dem Level 0.382 berührt nicht', candidate: () => run({ H4: B_TOL }), expect: { 'CRB-06': N } },
  { name: 'CRB 06: B 0.02 unter dem Level 0.382 berührt nicht', candidate: () => run({ H4: B_FAR }), expect: { 'CRB-06': N } },
  { name: 'CRB 06: B nur an 0.3', candidate: () => run({ H4: B_SHALLOW }), expect: { 'CRB-06': N } },
  { name: 'CRB 07: B an 0.8 berührt 0.786, stattdessen Butterfly', candidate: () => run({ H4: B_BUT }), expect: { 'CRB-06': M, 'CRB-07': M, 'CRB-08': N } },
  { name: 'CRB 07: B an 0.78 berührt 0.786 nicht', candidate: () => run({ H4: B_EDGE }), expect: { 'CRB-07': N } },
  { name: 'CRB 08: B 0.005 über dem Level 0.886 berührt nicht', candidate: () => run({ H4: DEEP_TOL }), expect: { 'CRB-08': N } },
  { name: 'CRB 08: B 0.02 über dem Level 0.886 berührt nicht', candidate: () => run({ H4: DEEP_FAR }), expect: { 'CRB-08': N } },
  { name: 'CRB 09: B unter X (1.033) berührt X', candidate: () => run({ H4: B_BEYOND_X }), expect: { 'CRB-08': M, 'CRB-09': M } },
  { name: 'CRB 09: B an 0.983 berührt X nicht', candidate: () => run({ H4: B_AT_X }), expect: { 'CRB-09': N } },
  { name: 'CRB 10: C an 126, die BC-Rückprojektionen 2.618 und 3.618 liegen weit vom Ziel-D', candidate: () => run({ H4: C_HIGH }), expect: { 'CRB-10': N } },
  { name: 'CRB 13: lauter Anlauf zu D, RSI(7) am Tief über 20', candidate: () => run({ H4: CHOP_D }, AT_LONG), expect: { 'CRB-13': N } },
  { name: 'CRB 14: gleich lange Züge A → B und C → D, keine Divergenz', candidate: () => run({ H4: NO_DIVERGENCE }, atOf(FLAT_LEGS)), expect: { 'CRB-14': N } },
  { name: 'CRB 15: Formation in H4', candidate: () => run({ H4: BASE }), expect: { 'CRB-15': M } },
  { name: 'CRB 15: Formation in D1', candidate: () => run({ D1: BASE }, AT, { tf: 'D1' }), expect: { 'CRB-15': N } },
  { name: 'CRB 15: Formation in H1', candidate: () => run({ H1: BASE }, AT, { tf: 'H1' }), expect: { 'CRB-15': N } },
  { name: 'CRB 16: Engulf in H1 ab der Kerze von D', candidate: () => run({ H4: BASE, H1: lowerRows(AT, 81.4, true) }), expect: { 'CRB-16': M } },
  { name: 'CRB 16: H1 ohne Umkehrkerze', candidate: () => run({ H4: BASE, H1: lowerRows(AT, 81.4, false) }), expect: { 'CRB-16': N } },
  { name: 'CRB 16: Engulf in H1 weit weg von D (SIG-26)', candidate: () => run({ H4: BASE, H1: lowerRows(AT, 120, true) }), expect: { 'CRB-16': N } },
  { name: 'CRB 16: ohne tiefere Zeiteinheit nicht messbar', candidate: () => run({ H4: BASE }), expect: { 'CRB-16': U } },
];

test.describe('CRB: Bedingungen auf von Hand gerechneten Reihen', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const cand = c.candidate();
      const got: Record<string, CheckState> = {};
      for (const id of Object.keys(c.expect)) got[id] = state(cand, id);
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('CRB: Abgrenzung, Urteil und Zeichnungen', () => {
  frm('Abgrenzung Crab ↔ Gartley, Bat, Cypher: D jenseits von X bei 1.618 gibt es nur bei der Crab', () => {
    expect(run({ H4: BASE }).verdict).toBe('valid');
    expect(analyzeGar(ctxOf({ H4: BASE }), END).find((a) => a.tf === 'H4')!.candidate.verdict).toBe('invalid');
    for (const rows of [GAR_FORM, BAT_FORM, CYP_FORM]) {
      const asCrab = run({ H4: rows }, AT);
      expect(asCrab.verdict).not.toBe('valid');
      expect(state(asCrab, 'CRB-04')).toBe(N);
    }
  });

  frm('Abgrenzung Crab ↔ Butterfly: gleiche X und A, B an 0.8 und D bei 1.272 sind Butterfly, B an 0.6 und D bei 1.618 sind Crab', () => {
    const but = runBut({ H4: BUT_FORM });
    expect(but.verdict).toBe('valid');
    const asCrab = run({ H4: BUT_FORM }, AT);
    expect([state(asCrab, 'CRB-04'), state(asCrab, 'CRB-07'), asCrab.verdict]).toEqual([N, M, 'invalid']);
    const crabAsBut = runBut({ H4: BASE }, AT);
    expect([state(crabAsBut, 'BUT-02'), crabAsBut.verdict]).toEqual([N, 'invalid']);
  });

  frm('Deep Crab ist eine Variante der Crab: dieselbe Prüfung, B an 0.9 statt 0.6, beide gültig; die Butterfly lehnt B an 0.9 ab', () => {
    const crab = run({ H4: BASE });
    const deep = run({ H4: DEEP });
    expect([crab.verdict, deep.verdict]).toEqual(['valid', 'valid']);
    expect([state(crab, 'CRB-08'), state(deep, 'CRB-08')]).toEqual([N, M]);
    expect([state(crab, 'CRB-10'), state(crab, 'CRB-11'), state(deep, 'CRB-10'), state(deep, 'CRB-11')]).toEqual([M, N, N, M]);
    const asBut = runBut({ H4: DEEP }, AT);
    expect([state(asBut, 'BUT-03'), asBut.verdict]).toEqual([M, 'invalid']);
  });

  frm('Urteil: gültig, im Aufbau ohne D oder ohne Schluss unter B, ungültig mit Ausschluss, fehlender Variante oder fehlender Form', () => {
    expect(run({ H4: BASE }).verdict).toBe('valid');
    expect(run({ H4: DEEP }).verdict).toBe('valid');
    expect(run({ H4: D_SHORT }).verdict).toBe('forming');
    expect(run({ H4: NO_CLOSE }).verdict).toBe('forming');
    expect(run({ H4: C_DEEP }).verdict).toBe('invalid');
    expect(run({ H4: C_SHALLOW }).verdict).toBe('invalid');
    expect(run({ H4: B_SHALLOW }).verdict).toBe('invalid');
    expect(run({ H4: B_BUT }).verdict).toBe('invalid');
    expect(run({ H4: B_BEYOND_X }).verdict).toBe('invalid');
    expect(run({ H4: BASE }, AT, { price: { a: 129.5 } }).verdict).toBe('invalid');
    expect(run({ H4: BASE, D1: D1_DOWN }).verdict).toBe('valid');
  });

  frm('Zeichnungen: Z-CRB 01, 02, 03, 05 immer, Z-CRB 04 nur mit erreichtem D', () => {
    const ok = run({ H4: BASE });
    expect(ok.drawings.map((d) => d.id)).toEqual(['Z-CRB-01', 'Z-CRB-02', 'Z-CRB-03', 'Z-CRB-05', 'Z-CRB-04']);
    const short = run({ H4: D_SHORT });
    expect(short.drawings.map((d) => d.id)).toEqual(['Z-CRB-01', 'Z-CRB-02', 'Z-CRB-03', 'Z-CRB-05']);
    expect(ok.drawings.find((d) => d.id === 'Z-CRB-01')!.levels!.map((v) => Math.round(v * 1000) / 1000)).toEqual([0.382, 0.618, 0.786, 0.886, 1, 1.618]);
    expect(ok.drawings.find((d) => d.id === 'Z-CRB-02')!.levels).toEqual([0.382, 0.786, 0.886]);
    expect(ok.drawings.find((d) => d.id === 'Z-CRB-03')!.levels).toEqual([2, 2.618, 3.618]);
    expect(ok.drawings.find((d) => d.id === 'Z-CRB-04')!.levels).toEqual([0.382, 0.618, -0.382]);
    expect(find(ok, 'CRB-04').drawings).toEqual(['Z-CRB-01', 'Z-CRB-05']);
    expect(find(ok, 'CRB-10').drawings).toEqual(['Z-CRB-03']);
    expect(ok.drawings.every((d) => d.side === 'buy')).toBe(true);
  });

  frm('Pflicht, Ausschluss und Verstärkung: gemeinsamer Kern CRB 01 bis 05, Varianten CRB 06 bis 09, Filter CRB 10 bis 16', () => {
    const c = run({ H4: BASE });
    expect(c.checks.map((k) => k.kind)).toEqual([
      'required', 'required', 'exclusion', 'required', 'required', 'required', 'exclusion', 'required', 'exclusion',
      'bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus',
    ]);
    expect(c.checks.every((k) => k.status === 'secondary')).toBe(true);
  });

  frm('Automatische Auswahl: Crab, Deep Crab und Spiegelbild liefern X, A, B, C, D aus den Wendepunkten', () => {
    const pick = (rows: Row[]) => analyzeCrb(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate;
    const buy = pick(BASE);
    expect(buy.side).toBe('buy');
    expect(buy.verdict).toBe('valid');
    expect(buy.points).toEqual({
      X: { time: 42 * H4, price: 100 },
      A: { time: 52 * H4, price: 130 },
      B: { time: 92 * H4, price: 112 },
      C: { time: 98 * H4, price: 123.68 },
      D: { time: 101 * H4, price: 81.4 },
    });
    const deep = pick(DEEP);
    expect(deep.verdict).toBe('valid');
    expect(state(deep, 'CRB-08')).toBe(M);
    const sell = pick(mirror(BASE));
    expect(sell.side).toBe('sell');
    expect(sell.checks.map((c) => [c.id, c.state])).toEqual(buy.checks.map((c) => [c.id, c.state]));
  });

  frm('Ohne vier Wendepunkte gibt es keine Formation: alles nicht messbar, im Aufbau', () => {
    const cand = analyzeCrb(ctxOf({ H4: zig([100, 130, 112], [10, 30], 3) }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(cand.checks.every((x) => x.state === U)).toBe(true);
    expect(cand.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [AT.c + 3, AT.d! + 1, AT.d! + 4]) {
      const full = analyzeCrb(ctxOf({ H4: BASE }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeCrb(ctxOf({ H4: BASE.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Eigene Punkte in falscher Reihenfolge oder ohne geschlossene Kerze sind nicht messbar', () => {
    const swapped = checkCrbCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', x: wick(BASE, AT.a, true), a: wick(BASE, AT.x, false), b: wick(BASE, AT.b, false), c: wick(BASE, AT.c, true) });
    expect(swapped.checks.every((x) => x.state === U)).toBe(true);
    const missing = checkCrbCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', x: { time: 999 * H4, price: 100 }, a: wick(BASE, AT.a, true), b: wick(BASE, AT.b, false), c: wick(BASE, AT.c, true) });
    expect(missing.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (name: string, iso: string): Candidate => {
  const fixture = loadFixture(name);
  const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars });
  return analyzeCrb(ctx, at(iso)).find((a) => a.tf === 'H4')!.candidate;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));
const time = (c: Candidate, point: string) => new Date(c.points[point].time * 1000).toISOString().slice(0, 16);
const times = (c: Candidate) => ['X', 'A', 'B', 'C', 'D'].map((p) => time(c, p));
const CORE = ['CRB-01', 'CRB-02', 'CRB-03', 'CRB-04', 'CRB-05'];
const VARIANT = ['CRB-06', 'CRB-07', 'CRB-08', 'CRB-09'];

test.describe('CRB: echte Kerzen', () => {
  frm('crb-buy-h4-01: Kauf-Crab, B bei 0.611, D bei 1.686, PRZ 3.618 am Ziel-D und Zone am D ist gültig', () => {
    const c = analyzeAt('crb-buy-h4-01', '2025-11-19T20:00');
    expect(c.side).toBe('buy');
    expect(times(c)).toEqual(['2025-11-13T00:00', '2025-11-13T16:00', '2025-11-14T12:00', '2025-11-14T16:00', '2025-11-19T16:00']);
    expect(states(c, CORE)).toEqual([M, M, N, M, M]);
    expect(states(c, VARIANT)).toEqual([M, N, N, N]);
    expect(states(c, ['CRB-10', 'CRB-11', 'CRB-12', 'CRB-13', 'CRB-14', 'CRB-15'])).toEqual([M, N, M, N, N, M]);
    expect(find(c, 'CRB-06').value!).toBeCloseTo((1.16556 - 1.16085) / (1.16556 - 1.15785), 3);
    expect(find(c, 'CRB-04').value!).toBeCloseTo((1.16556 - 1.15256) / (1.16556 - 1.15785), 3);
    expect(c.verdict).toBe('valid');
  });

  frm('crb-sell-h4-01: Verkauf-Crab, B bei 0.761, RSI(7) 83 am D ist gültig', () => {
    const c = analyzeAt('crb-sell-h4-01', '2025-12-23T12:00');
    expect(c.side).toBe('sell');
    expect(times(c)).toEqual(['2025-12-16T20:00', '2025-12-17T08:00', '2025-12-17T16:00', '2025-12-18T08:00', '2025-12-23T08:00']);
    expect(states(c, CORE)).toEqual([M, M, N, M, M]);
    expect(states(c, VARIANT)).toEqual([M, N, N, N]);
    expect(states(c, ['CRB-10', 'CRB-11', 'CRB-13'])).toEqual([M, M, M]);
    expect(c.verdict).toBe('valid');
  });

  frm('crb-deep-h4-01: Kauf-Deep-Crab, B bei 0.9, BC-Rückprojektion 2 und eine Zone am Ziel-D, D noch nicht erreicht', () => {
    const c = analyzeAt('crb-deep-h4-01', '2026-03-25T20:00');
    expect(c.side).toBe('buy');
    expect(times(c)).toEqual(['2026-03-20T12:00', '2026-03-20T16:00', '2026-03-20T20:00', '2026-03-23T08:00', '2026-03-23T16:00']);
    expect(states(c, CORE)).toEqual([M, M, N, N, M]);
    expect(states(c, VARIANT)).toEqual([M, M, M, N]);
    expect(states(c, ['CRB-10', 'CRB-11', 'CRB-12'])).toEqual([N, M, M]);
    expect(c.verdict).toBe('forming');
  });

  frm('crb-deep-h4-02: Verkauf-Deep-Crab, B bei 0.967 ist gültig', () => {
    const c = analyzeAt('crb-deep-h4-02', '2025-11-26T08:00');
    expect(c.side).toBe('sell');
    expect(states(c, CORE)).toEqual([M, M, N, M, M]);
    expect(states(c, VARIANT)).toEqual([M, M, M, N]);
    expect(find(c, 'CRB-08').value!).toBeGreaterThan(0.886);
    expect(c.verdict).toBe('valid');
  });

  frm('crb-bad-h4-01: Negativ – B bei 0.844 liegt zwischen den Varianten (CRB 07 ☑, CRB 08 ☐), keine Crab', () => {
    const c = analyzeAt('crb-bad-h4-01', '2026-02-19T08:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['CRB-04', ...VARIANT])).toEqual([M, M, M, N, N]);
    expect(c.verdict).toBe('invalid');
  });

  frm('crb-bad-h4-02: Negativ – B bei 1.069 jenseits von X (CRB 09 ☑), keine Deep Crab', () => {
    const c = analyzeAt('crb-bad-h4-02', '2026-01-21T16:00');
    expect(states(c, VARIANT)).toEqual([M, M, M, M]);
    expect(find(c, 'CRB-09').value!).toBeGreaterThan(1);
    expect(c.verdict).toBe('invalid');
  });

  frm('crb-bad-h4-03: Negativ – C weit jenseits von A (CRB 03 ☑) und D noch nicht erreicht, ungültig', () => {
    const c = analyzeAt('crb-bad-h4-03', '2025-11-06T00:00');
    expect(states(c, CORE)).toEqual([M, M, M, N, N]);
    expect(c.verdict).toBe('invalid');
  });

  frm('crb-form-h4-01: im Aufbau – D erst bei 0.621 (CRB 04 ☐), Form sonst ☑', () => {
    const c = analyzeAt('crb-form-h4-01', '2025-11-10T00:00');
    expect(c.side).toBe('sell');
    expect(states(c, CORE)).toEqual([M, M, N, N, N]);
    expect(states(c, VARIANT)).toEqual([M, N, N, N]);
    expect(find(c, 'CRB-04').value!).toBeLessThan(1.618);
    expect(c.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft bei echten Reihen: ohne die späteren Kerzen dasselbe Ergebnis', () => {
    for (const [name, iso] of REAL_RUNS) {
      const fixture = loadFixture(name);
      const t = at(iso);
      const cut = fixture.bars.filter((b) => b.time < t);
      const full = analyzeCrb(new FormationContext(fixture.symbol, { H4: fixture.bars }), t).find((a) => a.tf === 'H4')!;
      const prefix = analyzeCrb(new FormationContext(fixture.symbol, { H4: cut }), t).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Abgrenzung echt: Gartley-, Bat- und Cypher-Fälle sind keine gültige Crab', () => {
    for (const [name, iso] of [['gar-buy-h4-01', '2025-11-17T12:00'], ['gar-sell-h4-01', '2026-01-09T08:00'], ['bat-buy-h4-01', '2025-12-16T16:00'], ['cyp-buy-h4-01', '2025-12-17T00:00'], ['cyp-sell-h4-01', '2025-11-10T08:00']]) {
      expect(analyzeAt(name, iso).verdict).not.toBe('valid');
    }
  });
});

// ---- Abdeckung -------------------------------------------------------------------------------------------------

/** Echte Fälle (Fixture, Zeitpunkt), die zur Abdeckung zählen */
const REAL_RUNS: [string, string][] = [
  ['crb-buy-h4-01', '2025-11-19T20:00'],
  ['crb-sell-h4-01', '2025-12-23T12:00'],
  ['crb-deep-h4-01', '2026-03-25T20:00'],
  ['crb-deep-h4-02', '2025-11-26T08:00'],
  ['crb-bad-h4-01', '2026-02-19T08:00'],
  ['crb-bad-h4-02', '2026-01-21T16:00'],
  ['crb-bad-h4-03', '2025-11-06T00:00'],
  ['crb-form-h4-01', '2025-11-10T00:00'],
];

test.describe('CRB: Abdeckung', () => {
  frm('jede Bedingung der Crab hat einen Fall mit ☑ und einen mit ☐', () => {
    const candidates = [...CASES.map((c) => c.candidate()), ...REAL_RUNS.map(([name, iso]) => analyzeAt(name, iso))];
    const miss: string[] = [];
    for (const id of CRB_CHECK_IDS) {
      const got = new Set(candidates.map((c) => state(c, id)));
      if (!got.has(M)) miss.push(`${id} ohne ☑`);
      if (!got.has(N)) miss.push(`${id} ohne ☐`);
    }
    expect(miss).toEqual([]);
  });
});
