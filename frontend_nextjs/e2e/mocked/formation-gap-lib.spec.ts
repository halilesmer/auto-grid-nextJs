/**
 * Fraktal über eine Datenlücke (FRM-33): Eine fehlende Kerzenstrecke (MissingRange) trennt die Nachbarn.
 * Fünf Kerzen mit einer Lücke dazwischen sind kein Fraktal; der Chart (findFractals) macht es genauso.
 * Kerzen sind Zeilen [Open, High, Low, Close]; die Reihe peak() hat ein Fraktal-Hoch auf Index 2.
 * FRM-33 Formationserkennung: Fraktal nicht über eine Datenlücke
 */
import { expect, test } from '@playwright/test';
import { checkAbcdCandidate } from '../../src/lib/formation/abcdChecks';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { fractalIndices, probeFractal } from '../../src/lib/formation/frz';
import type { Anchor } from '../../src/lib/formation/types';
import { END, H4, barsOf, type Row } from '../fixtures/formation-rows';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-33' }, fn);

const flat = (c: number): Row => [c, c + 1, c - 1, c];
/** Fünf Kerzen, Fraktal-Hoch 110 auf Index 2; die Nachbarn schließen deutlich tiefer */
const PEAK: Row[] = [flat(100), flat(104), [106, 110, 105, 108], flat(104), flat(100)];

const viewBars = (rows: Row[], missing: { from: number; to: number }[]) => {
  const ctx = new FormationContext('TEST', { H4: { bars: barsOf(rows, H4), missing } });
  return ctx.view('H4', END)!.bars;
};

frm('Lücke zwischen zwei der fünf Kerzen: kein Fraktal', () => {
  // Lücke zwischen Kerze 1 (Zeit 4 h) und Kerze 2 (Zeit 8 h)
  const bars = viewBars(PEAK, [{ from: 1.5 * H4, to: 2 * H4 }]);
  expect(fractalIndices(bars, 'resistance')).toEqual([]);
  const p = probeFractal(bars, 2, 'resistance');
  expect(p.leftBars).toBe(0);
  expect(p.rightBars).toBe(2);
});

frm('Lücke rechts der Fraktalkerze: kein Fraktal', () => {
  const bars = viewBars(PEAK, [{ from: 3.5 * H4, to: 4 * H4 }]);
  expect(fractalIndices(bars, 'resistance')).toEqual([]);
  expect(probeFractal(bars, 2, 'resistance').rightBars).toBe(1);
});

frm('Ohne Lücke: Fraktal', () => {
  expect(fractalIndices(viewBars(PEAK, []), 'resistance')).toEqual([2]);
  const plain: ContextInput = { H4: barsOf(PEAK, H4) };
  expect(fractalIndices(new FormationContext('TEST', plain).view('H4', END)!.bars, 'resistance')).toEqual([2]);
});

frm('Lücke außerhalb der fünf Kerzen: Fraktal', () => {
  // Zwei flache Kerzen davor, Lücke zwischen Kerze 1 und 2 der Reihe, das Fraktal liegt auf Index 4 und braucht Index 2 bis 6
  const rows: Row[] = [flat(100), flat(100), ...PEAK];
  const bars = viewBars(rows, [{ from: 0.5 * H4, to: H4 }]);
  expect(fractalIndices(bars, 'resistance')).toEqual([4]);
});

frm('Lücke hinter den Nachbarn des Fraktals: Fraktal bleibt', () => {
  const rows: Row[] = [flat(100), flat(100), ...PEAK, flat(100)];
  const bars = viewBars(rows, [{ from: 6.5 * H4, to: 7 * H4 }]);
  expect(fractalIndices(bars, 'resistance')).toEqual([4]);
});

frm('Wie der Worker: Bereich ersetzt einen ganzen fehlenden Kerzenplatz', () => {
  const rows = PEAK.filter((_, i) => i !== 3);
  const bars = rows.map((r, i) => ({ time: (i < 3 ? i : i + 1) * H4, open: r[0], high: r[1], low: r[2], close: r[3] }));
  const ctx = new FormationContext('TEST', { H4: { bars, missing: [{ from: 3 * H4, to: 4 * H4 }] } });
  expect(fractalIndices(ctx.view('H4', END)!.bars, 'resistance')).toEqual([]);
});

frm('Bereich, der nur an die Nachbarkerzen grenzt, ist keine Lücke', () => {
  // from == Zeit der späteren, to == Zeit der früheren Kerze: halb offen, trennt nichts
  const bars = viewBars(PEAK, [{ from: 3 * H4, to: 4 * H4 }, { from: 0, to: H4 }]);
  expect(fractalIndices(bars, 'resistance')).toEqual([2]);
});

// ABCD-02: C muss ein fertiges Fraktal sein
const S: Row[] = [
  flat(110), flat(105), flat(100), flat(95), flat(90), flat(95), flat(100), flat(105),
  flat(110), flat(115), [118, 120, 117, 118], flat(115), flat(110), flat(105),
  flat(100), flat(99), flat(98), flat(97), [96, 97, 94, 96], flat(98), flat(100), flat(102),
];
const wick = (idx: number, high: boolean): Anchor => ({ time: idx * H4, price: high ? S[idx][1] : S[idx][2] });

const abcd02 = (missing: { from: number; to: number }[]) => {
  const ctx = new FormationContext('TEST', { H4: { bars: barsOf(S, H4), missing } });
  const c = checkAbcdCandidate(ctx, END, { tf: 'H4', a: wick(4, false), b: wick(10, true), c: wick(18, false) });
  return c.checks.find((x) => x.id === 'ABCD-02')!.state;
};

frm('ABCD-02: C ohne Lücke ein fertiges Fraktal', () => {
  expect(abcd02([])).toBe('met');
});

frm('ABCD-02: Lücke neben C: C ist kein fertiges Fraktal', () => {
  expect(abcd02([{ from: 19.5 * H4, to: 20 * H4 }])).toBe('unmet');
});
