/**
 * Harmoniken: ein beendeter Handel kommt nicht mit einer anderen Basis wieder („Hayalet“). Das Ende zeigt sich einmal (1120-A42.1), Basis und
 * Einstieg frieren am Einstieg ein (1122-A28.1); die Identität des Handels ist Seite + Einstiegskerze + Einstieg (1122-A3.4.1), ohne Stop.
 *
 * Fall (echte XAUUSD-Kerzen, nur M15 geladen, Chart-Standard-Trendzug): Butterfly Kauf, X 10-06 05:30, A 10-06 15:00, B 10-06 17:30,
 * C 10-06 18:45, Einstieg 4080.3 in der Kerze 10-07 15:15, Stop 4042.356, zum Schluss 10-07 15:30 gezeigt. Der Handel nimmt TP1 und TP2 in der
 * Kerze 10-08 04:45 und zeigt sein Ende zum Schluss 10-08 05:00. Befund: ab 10-08 05:15 zeigte die Suche eine andere Basis mit demselben
 * Einstieg in derselben Kerze (X 09-28 17:45, Stop 4027.206, Stand TP1) als laufenden Handel. Ursache: die beendete eingefrorene Basis hat keinen
 * Vorrang mehr; Regel B (1122-A3.2) ließ die andere Basis durch, weil ihr Schlüssel ohne Punkte zum gezeigten Handel beim Einstieg passt.
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeBut } from '../../src/lib/formation/butChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { XAUUSD_M15_0925_1008 } from '../fixtures/formation-ghost-xau-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-07' }, fn);

const M15 = 900;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);
const bars: FormationBar[] = XAUUSD_M15_0925_1008.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const ctxOf = () => new FormationContext('XAUUSD', { M15: { bars, missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
const shownIn = (ctx: FormationContext, t: number) => analyzeBut(ctx, t).find((a) => a.tf === 'M15')!.candidate;

const entered = (c: Candidate) => c.trade?.entry != null && c.trade.status !== undefined && c.trade.entryIdx !== undefined;
/** Identität des Handels (1122-A3.4.1): Seite, Einstiegskerze, Einstieg */
const keyOf = (c: Candidate) => (entered(c) ? `${c.side}|${iso(bars[c.trade!.entryIdx!].time)}|${c.trade!.entry}` : null);
/** Was die Suche vom Handel zeigt: X, A, B, C, Stop, Stand */
const viewOf = (c: Candidate) => ({
  X: c.points.X && iso(c.points.X.time),
  A: c.points.A && iso(c.points.A.time),
  B: c.points.B && iso(c.points.B.time),
  C: c.points.C && iso(c.points.C.time),
  stop: c.trade?.stop ?? null,
  status: c.trade?.status?.kind ?? null,
  end: c.trade?.status?.endIdx !== undefined ? iso(bars[c.trade.status.endIdx].time) : null,
});

const KEY = 'buy|2026-10-07T15:15|4080.3';

test.describe('Harmonik: ein beendeter Handel kommt nicht mit einer anderen Basis wieder (1120-A42.1, 1122-A28.1)', () => {
  frm('Butterfly Kauf XAUUSD M15 (Einstieg 10-07 15:15): nach dem gezeigten Ende zeigt keine Suche denselben Handel mit einer anderen Basis', () => {
    const ctx = ctxOf();
    const atEntry = shownIn(ctx, at('2026-10-07T15:30'));
    // Vorbedingung: zum Schluss der Einstiegskerze gezeigt, offen
    expect(keyOf(atEntry)).toBe(KEY);
    expect(viewOf(atEntry)).toMatchObject({ X: '2026-10-06T05:30', A: '2026-10-06T15:00', B: '2026-10-06T17:30', C: '2026-10-06T18:45', status: 'open' });
    expect(atEntry.trade?.stop).toBeCloseTo(4042.356, 3);

    const after: string[] = [];
    let ended: { t: number; view: ReturnType<typeof viewOf> } | null = null;
    for (let t = at('2026-10-07T15:45'); t <= at('2026-10-08T06:00'); t += M15) {
      const c = shownIn(ctx, t);
      if (ended && keyOf(c) === KEY) after.push(`${iso(t)} ${JSON.stringify(viewOf(c))}`);
      if (!ended && keyOf(c) === KEY && c.trade!.status!.endIdx !== undefined) ended = { t, view: viewOf(c) };
    }
    // Vorbedingung: das Ende (TP1 und TP2 in der Kerze 10-08 04:45) zeigt sich zum Schluss 10-08 05:00 mit den eingefrorenen Punkten
    expect(ended && iso(ended.t)).toBe('2026-10-08T05:00');
    expect(ended!.view).toMatchObject({ X: '2026-10-06T05:30', status: 'tp12', end: '2026-10-08T04:45' });
    expect(after, 'derselbe Handel nach seinem Ende').toEqual([]);
  });

  frm('Ohne Vorgeschichte: ein frischer Kontext zeigt den beendeten Handel zum Schluss 10-08 06:00 nicht mit einer anderen Basis', () => {
    const c = shownIn(ctxOf(), at('2026-10-08T06:00'));
    expect(keyOf(c) === KEY ? JSON.stringify(viewOf(c)) : null).toBeNull();
  });
});
