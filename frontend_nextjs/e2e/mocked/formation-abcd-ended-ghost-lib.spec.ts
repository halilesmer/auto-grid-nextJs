/**
 * AB=CD: ein beendeter Handel kommt nicht mit anderen Punkten wieder („Hayalet“; das Ende zeigt sich einmal, 1120-A42.1, wie bei den Harmoniken).
 * Die Identität des Handels hat keine Wendepunkte (1122-A1.4 c): Seite + Einstiegskerze + Einstieg.
 *
 * Fall (Fixture bat-buy-h4-01, H4, Trendzug der Fixture): AB=CD Kauf A 10-14 16:00, B 10-15 08:00, C 10-15 16:00, Einstieg 150.464 in der Kerze
 * 10-16 00:00, Stop 149.980, zum Schluss 10-16 04:00 gezeigt. TP1 und TP2 in der Kerze 10-16 08:00, das Ende zeigt sich zum Schluss 10-16 12:00.
 * Befund: zu den Schlüssen 10-16 16:00 und 20:00 zeigte die Suche ein anderes Tripel (A 10-10 00:00, B 10-10 20:00, C 10-14 00:00) mit demselben
 * Einstieg in derselben Kerze, Stop 149.645, Stand TP1 und dann Breakeven, als laufenden Handel. Regel B ließ es durch (gleicher Schlüssel).
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { named, trendOf } from '../fixtures/formation-trend';

const frm = (title: string, fn: () => void) => test(title, { tag: ['@FRM-05', '@FRM-39'] }, fn);

const H4 = 14400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);
const PATH = 'e2e/fixtures/formation/bat-buy-h4-01.json';
const fx = named(PATH, parseFixture(JSON.parse(readFileSync(PATH, 'utf-8'))));
const bars = fx.bars as FormationBar[];
const ctxOf = () => new FormationContext(fx.symbol, { H4: bars } as ContextInput, { trend: trendOf(fx.bars) });
const shownIn = (ctx: FormationContext, t: number) => analyzeAbcd(ctx, t).find((a) => a.tf === 'H4')!.candidate;

const entered = (c: Candidate) => c.trade?.entry != null && c.trade.status !== undefined && c.trade.entryIdx !== undefined;
const keyOf = (c: Candidate) => (entered(c) ? `${c.side}|${iso(bars[c.trade!.entryIdx!].time)}|${c.trade!.entry}` : null);
/** Punkte A, B, C und Stop des Handels */
const viewOf = (c: Candidate) => ({
  A: c.points.A && iso(c.points.A.time),
  B: c.points.B && iso(c.points.B.time),
  C: c.points.C && iso(c.points.C.time),
  stop: c.trade?.stop ?? null,
});

const KEY = 'buy|2025-10-16T00:00|150.464';

test.describe('AB=CD: ein beendeter Handel kommt nicht mit anderen Punkten wieder (1120-A42.1)', () => {
  frm('bat-buy-h4-01 (Einstieg 10-16 00:00): nach dem gezeigten Ende zeigt keine Suche denselben Handel mit anderen Punkten', () => {
    const ctx = ctxOf();
    const atEntry = shownIn(ctx, at('2025-10-16T04:00'));
    // Vorbedingung: zum Schluss der Einstiegskerze gezeigt, offen
    expect(keyOf(atEntry)).toBe(KEY);
    expect(viewOf(atEntry)).toMatchObject({ A: '2025-10-14T16:00', B: '2025-10-15T08:00', C: '2025-10-15T16:00' });
    expect(atEntry.trade?.status?.kind).toBe('open');
    const frozen = JSON.stringify(viewOf(atEntry));

    const other: string[] = [];
    let endShown: string | null = null;
    for (let t = at('2025-10-16T08:00'); t <= at('2025-10-17T04:00'); t += H4) {
      const c = shownIn(ctx, t);
      if (endShown && keyOf(c) === KEY && JSON.stringify(viewOf(c)) !== frozen) other.push(`${iso(t)} ${JSON.stringify(viewOf(c))} ${c.trade?.status?.kind}`);
      if (!endShown && keyOf(c) === KEY && c.trade!.status!.endIdx !== undefined) endShown = iso(t);
    }
    // Vorbedingung: das Ende (TP1 und TP2 in der Kerze 10-16 08:00) zeigt sich zum Schluss 10-16 12:00
    expect(endShown).toBe('2025-10-16T12:00');
    expect(other, 'derselbe Handel mit anderen Punkten nach seinem Ende').toEqual([]);
  });

  frm('Ohne Vorgeschichte: ein frischer Kontext zeigt zum Schluss 10-16 16:00 nicht denselben Handel mit anderen Punkten', () => {
    const c = shownIn(ctxOf(), at('2025-10-16T16:00'));
    expect(keyOf(c) === KEY ? viewOf(c).A : null).not.toBe('2025-10-10T00:00');
  });
});
