/**
 * X auf dem äußersten Docht (Halil 2026-11-13): der Trend meldet einen Pivot oft eine Kerze zu spät (EWO-Regel);
 * die harmonische Messung nimmt X an der echten Dochtspitze der Schwingung. Fälle: GBPUSD H4 vom 14.10.2026 (Cypher) und gerechnete Reihen.
 * FRM-12 Formationserkennung: Cypher
 */
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { analyzeCyp } from '../../src/lib/formation/cypChecks';
import { analyzeGar } from '../../src/lib/formation/garChecks';
import { deepestWickX, extremeWick, pivotIdxOf, shapeOfX, shiftBase, shiftC } from '../../src/lib/formation/xabcd';
import type { FormationBar } from '../../src/lib/formation/types';
import { END, H4, barsOf, patched, plain, zig, type Row } from '../fixtures/formation-rows';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-12' }, fn);
const bar = (time: number, o: number, h: number, l: number, c: number): FormationBar => ({ time, open: o, high: h, low: l, close: c, volume: 1 }) as FormationBar;

// GBPUSD H4, 14.10.2026 12:00 bis 15.10.2026 00:00 (Hochs und Opens grob, Lows und Schlüsse echt)
const GBP: FormationBar[] = [
  bar(0, 1.3205, 1.3215, 1.32023, 1.32035),
  bar(1, 1.32035, 1.3205, 1.31364, 1.31548),
  bar(2, 1.31548, 1.3196, 1.31528, 1.31936),
  bar(3, 1.31936, 1.3235, 1.31788, 1.32328),
];

frm('X-Docht: GBPUSD, die 16:00-Kerze (1.31364) ersetzt den Pivot der 20:00-Kerze (1.31528)', () => {
  const x = deepestWickX(GBP, { idx: 2, price: 1.31528 }, 'support', null, 3);
  expect(x).toEqual({ idx: 1, price: 1.31364 });
});

frm('X-Docht: Gleichstand und kein tieferer Docht lassen den Pivot stehen', () => {
  expect(deepestWickX(GBP, { idx: 1, price: 1.31364 }, 'support', null, 3)).toEqual({ idx: 1, price: 1.31364 });
  expect(deepestWickX(GBP, { idx: 2, price: 1.31528 }, 'support', 1, 3)).toEqual({ idx: 2, price: 1.31528 });
});

frm('X-Docht: Hoch-Seite nimmt den höchsten High, die Kerze von A zählt nicht', () => {
  expect(deepestWickX(GBP, { idx: 1, price: 1.3205 }, 'resistance', null, 3)).toEqual({ idx: 0, price: 1.3215 });
  expect(deepestWickX(GBP, { idx: 1, price: 1.3205 }, 'resistance', null, 0)).toEqual({ idx: 1, price: 1.3205 });
});

const ctxOf = (rows: Row[]) => {
  const bars: ContextInput = { H4: barsOf(rows, H4) };
  return new FormationContext('TEST', bars, { trend: { ...FIXTURE_TREND, rule: 'welle' } });
};
/**
 * 36 Kerzen steigen von 100 auf 140, dann fällt der Preis schnell: die Wave (SMA 5 − SMA 35) ist an der Kerze mit dem tiefsten Docht
 * (99.4) noch grün (+3.1) und erst an der nächsten Kerze (Tief 100) rot (−4.2). Die Regel `welle` setzt den Pivot daher eine Kerze zu spät.
 */
const RAMP: Row[] = Array.from({ length: 36 }, (_, i): Row => plain(i === 0 ? 100 : 100 + (40 * i) / 36, 100 + (40 * (i + 1)) / 36));
const BASE: Row[] = [...RAMP, ...zig([100, 130, 115, 139, 108.35], [10, 4, 14, 8], 3)];
const XI = RAMP.length + 2;
const DEEP = XI - 1;

frm('X-Docht: Cypher-Scan (Regel welle) misst X an der tieferen Dochtspitze der grünen Kerze vor dem Pivot', () => {
  const rows = patched(BASE, DEEP, [BASE[DEEP][0], BASE[DEEP][1], 99.4, BASE[DEEP][3]]);
  const cand = analyzeCyp(ctxOf(rows), END)[0].candidate;
  expect(cand.points.X).toEqual({ time: DEEP * H4, price: 99.4 });
});

frm('X-Docht: ohne tieferen Docht vor dem Pivot bleibt X am Pivot', () => {
  const cand = analyzeCyp(ctxOf(BASE), END)[0].candidate;
  expect(cand.points.X).toEqual({ time: XI * H4, price: BASE[XI][2] });
});

/**
 * A und B (Halil 2026-11-13): gleiche Regel wie X. 36 flache Kerzen (120), dann X = 100 (Tief), A = 125 (Hoch), B = 113 (Tief), C = 133 (Hoch).
 * Die Wave dreht an der Dochtspitze von A (Kerze 44: −2,55) und B noch nicht; der Trend setzt beide Pivots eine Kerze später (45 und 51).
 */
const FLAT: Row[] = Array.from({ length: 36 }, (): Row => plain(120, 120));
const AB: Row[] = [...FLAT, ...zig([100, 125, 113, 133, 119], [6, 6, 8, 6], 3)];
const AI = FLAT.length + 2 + 6;
const BI = AI + 6;

frm('A-Docht: Cypher-Scan (Regel welle) misst A an der Dochtspitze vor dem Pivot', () => {
  const cand = analyzeCyp(ctxOf(AB), END)[0].candidate;
  expect(cand.points.X).toEqual({ time: (FLAT.length + 2) * H4, price: 100 });
  expect(cand.points.A).toEqual({ time: AI * H4, price: AB[AI][1] });
});

frm('B-Docht: Cypher-Scan (Regel welle) misst B an der Dochtspitze vor dem Pivot', () => {
  const cand = analyzeCyp(ctxOf(AB), END)[0].candidate;
  expect(cand.points.B).toEqual({ time: BI * H4, price: AB[BI][2] });
});

frm('A-Docht: die Struktur-Prüfung CYP-01 (Impuls) bleibt am Pivot von A erfüllt, auch wenn A auf der Dochtspitze liegt', () => {
  const cand = analyzeCyp(ctxOf(AB), END)[0].candidate;
  expect(cand.points.A?.time).toBe(AI * H4);
  expect(cand.checks.find((c) => c.id === 'CYP-01')?.state).toBe('met');
});

frm('A/B-Docht: extremeWick ist allgemein, Gleichstand lässt den Punkt stehen', () => {
  expect(extremeWick(GBP, { idx: 2, price: 1.31528 }, 'support', 0, 3)).toEqual({ idx: 1, price: 1.31364 });
  expect(extremeWick(GBP, { idx: 1, price: 1.31364 }, 'support', 0, 3)).toEqual({ idx: 1, price: 1.31364 });
  expect(extremeWick(GBP, { idx: 1, price: 1.3205 }, 'resistance', 2, 4)).toEqual({ idx: 3, price: 1.3235 });
});

frm('A-Docht: GAR-21 (Pivot X → Pivot A ohne Zwischenpivot) rechnet mit den Pivots, nicht mit den verschobenen Punkten', () => {
  const cand = analyzeGar(ctxOf(AB), END)[0].candidate;
  expect(cand.points.A?.time).toBe(AI * H4);
  expect(cand.checks.find((c) => c.id === 'GAR-21')?.state).toBe('met');
});

/**
 * C (Halil 2026-11-13): erst nach bestätigtem C→D-Bein, d. h. nach dem ersten Schluss jenseits von B. Der Trend wählt den Pivot von C auf
 * einem Fraktal in grüner Welle, daher entsteht „Docht vor dem Pivot“ hier nur auf gebauten Kerzen (reine Funktionen), nicht in der Scan-Reihe.
 */
// Kauf-Formation: X und B sind Tiefs (Seite `support`), A und C Hochs (`resistance`)
const CBARS = [bar(0, 10, 12, 9, 11), bar(1, 11, 15, 10, 14), bar(2, 14, 13, 11, 12), bar(3, 12, 20, 6, 7), bar(4, 7, 8, 5, 6)];
const CB = { idx: 0, price: 9 };
const CC = { idx: 2, price: 13 };

frm('C-Docht: shiftC – Schluss jenseits von B begrenzt den Bereich, die Schlusskerze zählt nicht', () => {
  // Kerze 3 schließt unter B (7 < 9): Bereich 1..2, höchster High 15 (Kerze 1); der High 20 der Schlusskerze zählt nicht
  expect(shiftC(CBARS, CC, CB, 'resistance', 'support')).toEqual({ idx: 1, price: 15, pivotIdx: 2 });
});

frm('C-Docht: shiftC – ein tieferer Docht nach dem Pivot (C→D-Bein) zählt nicht', () => {
  const bars = [...CBARS.slice(0, 3), bar(3, 12, 14, 6, 7), bar(4, 7, 8, 5, 6)];
  // Pivot Kerze 2 (13); Kerze 1 hat 15 davor; Kerze 3 (High 14) liegt nach dem Pivot und bleibt außen vor
  expect(shiftC(bars, { idx: 2, price: 13 }, CB, 'resistance', 'support')).toEqual({ idx: 1, price: 15, pivotIdx: 2 });
  const after = [bar(0, 10, 12, 9, 11), bar(1, 11, 13, 10, 12), bar(2, 12, 13, 11, 12), bar(3, 12, 20, 6, 7)];
  expect(shiftC(after, { idx: 2, price: 13 }, CB, 'resistance', 'support')).toEqual({ idx: 2, price: 13 });
});

frm('C-Docht: shiftC – ohne Schluss jenseits von B (Formation im Aufbau) bleibt C am Pivot', () => {
  expect(shiftC(CBARS.slice(0, 3), CC, CB, 'resistance', 'support')).toBe(CC);
});

frm('C-Docht: shiftC – Gleichstand lässt C stehen; Kerze von B zählt nicht', () => {
  const bars = [bar(0, 10, 16, 9, 11), ...CBARS.slice(1)];
  expect(shiftC(bars, { idx: 1, price: 15 }, CB, 'resistance', 'support')).toEqual({ idx: 1, price: 15 });
});

frm('C-Docht: shiftBase lässt C in der Basis auf der Dochtspitze, pivotIdx hält den Pivot', () => {
  const bars = Array.from({ length: 12 }, (_, i) => bar(i, 10, 11, 9, 10));
  bars[2] = bar(2, 10, 11, 5, 10);
  bars[4] = bar(4, 10, 30, 9, 20);
  bars[6] = bar(6, 10, 11, 8, 10);
  bars[7] = bar(7, 10, 27, 9, 20);
  bars[8] = bar(8, 10, 26, 9, 20);
  bars[9] = bar(9, 10, 12, 4, 7); // Schluss 7 unter B (8)
  const base = { x: { idx: 2, price: 5 }, a: { idx: 4, price: 30 }, b: { idx: 6, price: 8 }, c: { idx: 8, price: 26 } };
  const out = shiftBase(bars, base, 'support', 'resistance', null);
  expect(out.c).toEqual({ idx: 7, price: 27, pivotIdx: 8 });
  expect(pivotIdxOf(out.c)).toBe(8);
});

frm('C-Docht: D sucht ab dem Pivot von C, nicht ab der früheren Dochtspitze', () => {
  const bars = Array.from({ length: 12 }, (_, i) => bar(i, 10, 11, 9, 10));
  bars[7] = bar(7, 10, 27, 3, 20); // tiefer Docht VOR dem Pivot von C
  bars[8] = bar(8, 10, 26, 9, 20);
  bars[9] = bar(9, 10, 12, 4, 7);
  const s = shapeOfX(bars, { x: { idx: 2, price: 5 }, a: { idx: 4, price: 30 }, b: { idx: 6, price: 8 }, c: { idx: 7, price: 27, pivotIdx: 8 } });
  expect(s.d).toEqual({ idx: 9, price: 4 });
});
