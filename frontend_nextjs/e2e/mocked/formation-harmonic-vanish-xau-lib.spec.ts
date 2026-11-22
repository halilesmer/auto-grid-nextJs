/**
 * Harmoniken: ein gezeigter, noch laufender Handel verschwindet nicht, wenn sich der letzte Wendepunkt des Trends verschiebt
 * (Entscheidung 1120-A42.1: nur ein beendeter Handel darf wegfallen), und ein Handel, der beim Einstieg nicht gezeigt war, wird nie gezeigt
 * (Entscheidung 1122-A3.2). Live-Befund `candidateVanished` (FRM-39, XAUUSD H4-Scan, 2026-11-21, nach PR 647 noch 3 Fälle aus der Suche selbst).
 *
 * Echte XAUUSD-Kerzen, nur die Formations-Zeiteinheit geladen, Chart-Standard-Trendzug (DEFAULT_TREND_SETTINGS).
 * In allen drei Fällen war beim Einstieg eine andere Basis gezeigt, deren C der letzte, noch wandernde Wendepunkt war:
 *
 * 1. H1 Butterfly (Verkauf): X 01-14 21:00, C 01-29 17:00, Einstieg 5310.80 in der Kerze 01-29 18:00. Der Wendepunkt 01-29 17:00 entsteht erst
 *    zum Schluss 01-29 20:00; zum Schluss der Einstiegskerze war eine Kauf-Basis (C 01-29 01:00) gezeigt. Früher wurde der Butterfly ab
 *    01-29 20:00 mit laufendem Handel gezeigt und fehlte um 01-30 16:00, als der Trend C auf 01-30 11:00 verschob.
 * 2. H4 Gartley (Kauf): X 10-07 12:00, C 10-16 16:00, Einstieg in der Kerze 10-22 20:00. Beim Einstieg war ein Verkaufs-Kandidat
 *    (C 10-21 04:00) gezeigt; früher wurde der Gartley ab 10-23 16:00 gezeigt (offen, dann TP1) und fehlte um 10-28 16:00.
 * 3. H1 Gartley (Kauf): X 10-02 04:00, C 10-05 11:00, Einstieg in der Kerze 10-07 15:00; beim Einstieg war ein Verkaufs-Kandidat
 *    (C 10-07 12:00) gezeigt; früher ab 10-07 20:00 der Gartley (offen, dann TP1), um 10-08 12:00 fehlte er.
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeGar, checkGarCandidate } from '../../src/lib/formation/garChecks';
import { analyzeBut, checkButCandidate } from '../../src/lib/formation/butChecks';
import type { Anchor, Candidate, FormationBar } from '../../src/lib/formation/types';
import type { VanishRow } from '../fixtures/formation-vanish-rows';
import { XAUUSD_H1_0105_0130, XAUUSD_H1_0928_1008, XAUUSD_H4_0908_1028 } from '../fixtures/formation-vanish-xau-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-07' }, fn);

const barsOf = (rows: VanishRow[]): FormationBar[] => rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const DUR = { H1: 3600, H4: 14400 } as const;

type Tf = 'H1' | 'H4';
type Analyze = (ctx: FormationContext, t: number) => { tf: string; candidate: Candidate }[];
type Check = (ctx: FormationContext, t: number, input: { tf: Tf; x: Anchor; a: Anchor; b: Anchor; c: Anchor }) => Candidate;

const ctxOf = (tf: Tf, rows: VanishRow[]) => new FormationContext('XAUUSD', { [tf]: { bars: barsOf(rows), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
/** Punkte und Handel, wie die Suche sie zeigt */
const view = (c: Candidate) => ({
  side: c.side,
  X: c.points.X?.time,
  A: c.points.A?.price,
  B: c.points.B?.price,
  C: c.points.C && [c.points.C.time, c.points.C.price],
  entry: c.trade?.entry ?? null,
  stop: c.trade?.stop ?? null,
});
const running = (c: Candidate) => c.trade?.entry != null && c.trade.status !== undefined && c.trade.status.endIdx === undefined;

/**
 * Kerze für Kerze ab `fromIso`: zeigt die Suche einen laufenden Handel, zeigt sie ihn in der nächsten Kerze wieder (Punkte, Einstieg, Stop),
 * außer derselbe Handel endet dort (Stop, Rest am Einstieg, alle Ziele). Gibt die verlorenen Handel zurück.
 */
function lostRunning(analyze: Analyze, check: Check, tf: Tf, rows: VanishRow[], fromIso: string): string[] {
  const ctx = ctxOf(tf, rows);
  const bars = barsOf(rows);
  const lost: string[] = [];
  let prev: { t: number; c: Candidate } | null = null;
  for (const bar of bars) {
    const t = bar.time + DUR[tf];
    if (t < at(fromIso)) continue;
    const c = analyze(ctx, t).find((a) => a.tf === tf)!.candidate;
    if (prev && JSON.stringify(view(c)) !== JSON.stringify(view(prev.c))) {
      const p = prev.c.points;
      const old = check(ctx, t, { tf, x: p.X, a: p.A, b: p.B, c: p.C });
      if (old.trade?.status?.endIdx === undefined) lost.push(`${tf} ${new Date(prev.t * 1000).toISOString()} ${JSON.stringify(view(prev.c))} -> ${JSON.stringify(view(c))}`);
    }
    prev = running(c) ? { t, c } : null;
  }
  return lost;
}

/** Kerze für Kerze ab `fromIso`: jeder gezeigte eingegangene Handel war zum Schluss seiner Einstiegskerze schon gezeigt (Ergebnis der Suche; Seite, Einstiegskerze, Einstieg). Gibt die Verstöße zurück. */
function shownLate(analyze: Analyze, tf: Tf, rows: VanishRow[], fromIso: string): string[] {
  const ctx = ctxOf(tf, rows);
  const bars = barsOf(rows);
  const shown = (t: number) => analyze(ctx, t).find((a) => a.tf === tf)!.candidate;
  const late: string[] = [];
  for (const bar of bars) {
    const t = bar.time + DUR[tf];
    if (t < at(fromIso)) continue;
    const c = shown(t);
    const e = c.trade?.entryIdx;
    if (c.trade?.entry == null || c.trade.status === undefined || e === undefined) continue;
    const atEntry = shown(bars[e].time + DUR[tf]);
    // derselbe Handel: Seite, Einstiegskerze, Einstieg (wie die Suche ihn erkennt; X und C dürfen sich danach verschieben)
    const same = atEntry.side === c.side && atEntry.trade?.entry === c.trade.entry && atEntry.trade.status !== undefined && atEntry.trade.entryIdx === e;
    if (!same) late.push(`${tf} ${new Date(t * 1000).toISOString()} ${JSON.stringify(view(c))}, Einstieg ${new Date(bars[e].time * 1000).toISOString()}: ${JSON.stringify(view(atEntry))}`);
  }
  return late;
}

/** Zeigt die Suche um `iso` einen Handel dieser Seite mit diesem X? */
const showsTrade = (analyze: Analyze, tf: Tf, rows: VanishRow[], iso: string, side: 'buy' | 'sell', xIso: string) => {
  const c = analyze(ctxOf(tf, rows), at(iso)).find((a) => a.tf === tf)!.candidate;
  return c.side === side && c.points.X?.time === at(xIso) && c.trade?.entry != null;
};

test.describe('Harmonik: laufender Handel bleibt, wenn der letzte Wendepunkt wandert (XAUUSD)', () => {
  frm('H1 Butterfly (Verkauf, Einstieg 01-29 18:00): beim Einstieg nicht gezeigt, daher weder um 01-30 12:00 (TP1) noch um 01-30 16:00 gezeigt', () => {
    const ctx = ctxOf('H1', XAUUSD_H1_0105_0130);
    const shown = (iso: string) => analyzeBut(ctx, at(iso)).find((a) => a.tf === 'H1')!.candidate;
    // Vorbedingung: der Handel existiert (eingegangen 5310.80, TP1 um 01-30 12:00, kein Ende) …
    // Punkte, wie die Suche sie bis PR 647 um 01-30 12:00 zeigte
    const own = checkButCandidate(ctx, at('2026-01-30T12:00'), {
      tf: 'H1',
      x: { time: at('2026-01-14T21:00'), price: 4642.88 },
      a: { time: at('2026-01-16T17:00'), price: 4536.75 },
      b: { time: at('2026-01-29T01:00'), price: 5597.53 },
      c: { time: at('2026-01-29T17:00'), price: 5105.51 },
    });
    expect(own.trade?.entry).toBeCloseTo(5310.8, 1);
    expect(own.trade!.status).toMatchObject({ kind: 'tp1' });
    expect(own.trade!.status!.endIdx).toBeUndefined();
    // … aber zum Schluss der Einstiegskerze war eine Kauf-Basis gezeigt
    expect(shown('2026-01-29T19:00').side).toBe('buy');
    for (const iso of ['2026-01-29T20:00', '2026-01-30T12:00', '2026-01-30T16:00']) {
      expect(showsTrade(analyzeBut, 'H1', XAUUSD_H1_0105_0130, iso, 'sell', '2026-01-14T21:00'), `Butterfly-Handel um ${iso} gezeigt`).toBe(false);
    }
  });

  frm('H4 Gartley (Kauf, Einstieg 10-22 20:00) und H1 Gartley (Kauf, Einstieg 10-07 15:00): beim Einstieg nicht gezeigt, später nie gezeigt', () => {
    for (const iso of ['2026-10-23T16:00', '2026-10-27T16:00', '2026-10-28T16:00']) {
      expect(showsTrade(analyzeGar, 'H4', XAUUSD_H4_0908_1028, iso, 'buy', '2026-10-07T12:00'), `H4 Gartley um ${iso} gezeigt`).toBe(false);
    }
    for (const iso of ['2026-10-07T20:00', '2026-10-08T06:00', '2026-10-08T12:00']) {
      expect(showsTrade(analyzeGar, 'H1', XAUUSD_H1_0928_1008, iso, 'buy', '2026-10-02T04:00'), `H1 Gartley um ${iso} gezeigt`).toBe(false);
    }
  });

  frm('Schutz: jeder gezeigte eingegangene Handel war beim Einstieg gezeigt (alle drei Fenster, Kerze für Kerze)', () => {
    expect(shownLate(analyzeBut, 'H1', XAUUSD_H1_0105_0130, '2026-01-26T00:00')).toEqual([]);
    expect(shownLate(analyzeGar, 'H4', XAUUSD_H4_0908_1028, '2026-10-15T00:00')).toEqual([]);
    expect(shownLate(analyzeGar, 'H1', XAUUSD_H1_0928_1008, '2026-10-05T00:00')).toEqual([]);
  });

  frm('Schutz: H1 Butterfly Januar, Kerze für Kerze — kein laufender Handel geht verloren', () => {
    expect(lostRunning(analyzeBut, checkButCandidate, 'H1', XAUUSD_H1_0105_0130, '2026-01-29T12:00')).toEqual([]);
  });

  frm('Schutz: H4 Gartley Oktober (erst nach dem Einstieg gezeigt), Kerze für Kerze — kein laufender Handel geht verloren', () => {
    expect(lostRunning(analyzeGar, checkGarCandidate, 'H4', XAUUSD_H4_0908_1028, '2026-10-20T00:00')).toEqual([]);
  });

  frm('Schutz: H1 Gartley Oktober (erst nach dem Einstieg gezeigt), Kerze für Kerze — kein laufender Handel geht verloren', () => {
    expect(lostRunning(analyzeGar, checkGarCandidate, 'H1', XAUUSD_H1_0928_1008, '2026-10-06T00:00')).toEqual([]);
  });
});
