/**
 * X auf dem äußersten Docht (Halil 2026-11-13): der Trend meldet einen Pivot oft eine Kerze zu spät (EWO-Regel);
 * die harmonische Messung nimmt X an der echten Dochtspitze der Schwingung. Fälle: GBPUSD H4 vom 14.10.2026 (Cypher) und gerechnete Reihen.
 * FRM-12 Formationserkennung: Cypher
 */
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { analyzeCyp } from '../../src/lib/formation/cypChecks';
import { deepestWickX } from '../../src/lib/formation/xabcd';
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
