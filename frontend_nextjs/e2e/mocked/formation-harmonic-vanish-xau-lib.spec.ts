/**
 * Harmoniken: ein gezeigter, noch laufender Handel verschwindet nicht, wenn sich der letzte Wendepunkt des Trends verschiebt
 * (Entscheidung 1120-A42.1: nur ein beendeter Handel darf wegfallen). Live-Befund `candidateVanished` (FRM-39, XAUUSD H4-Scan,
 * 2026-11-21, nach PR 647 noch 3 Fälle aus der Suche selbst).
 *
 * Echte XAUUSD-Kerzen, nur die Formations-Zeiteinheit geladen, Chart-Standard-Trendzug (DEFAULT_TREND_SETTINGS).
 *
 * 1. H1 Butterfly (Verkauf): X 01-14 21:00, C 01-29 17:00 (letzter Wendepunkt), Einstieg 5310.80 in der Kerze 01-29 18:00, Stand TP1 um 01-30 12:00.
 *    Der Preis läuft danach unter C; der Trend verschiebt den letzten Wendepunkt auf 01-30 11:00. Die Basis X, A, B, C des Handels
 *    gibt es in den Wendepunkten nicht mehr, der Handel fehlt um 01-30 16:00.
 * 2. H4 Gartley (Kauf): X 10-07 12:00, C 10-16 16:00, Einstieg in der Kerze 10-22 20:00. Beim Einstieg war ein Verkaufs-Kandidat
 *    (C 10-21 04:00) gezeigt; erst als dessen C (der letzte Wendepunkt) wanderte, wurde der Gartley ab 10-23 16:00 gezeigt (offen, dann TP1).
 *    Mit dem neuen Wendepunkt 10-28 04:00 fehlt er um 10-28 16:00.
 * 3. H1 Gartley (Kauf): X 10-02 04:00, C 10-05 11:00, Einstieg in der Kerze 10-07 15:00; beim Einstieg war ein Verkaufs-Kandidat
 *    (C 10-07 12:00) gezeigt, ab 10-07 20:00 der Gartley (offen, dann TP1); um 10-08 12:00 fehlt er.
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

test.describe('Harmonik: laufender Handel bleibt, wenn der letzte Wendepunkt wandert (XAUUSD)', () => {
  frm('H1 Butterfly (Verkauf, Einstieg 01-29 18:00): TP1 um 01-30 12:00, derselbe Handel um 01-30 16:00 trotz verschobenem C-Wendepunkt', () => {
    const ctx = ctxOf('H1', XAUUSD_H1_0105_0130);
    const before = analyzeBut(ctx, at('2026-01-30T12:00')).find((a) => a.tf === 'H1')!.candidate;
    // Vorbedingung: eingegangen, TP1, kein Ende
    expect(view(before)).toMatchObject({ side: 'sell', X: at('2026-01-14T21:00'), C: [at('2026-01-29T17:00'), expect.any(Number)], entry: expect.closeTo(5310.8, 1) });
    expect(before.trade!.status).toMatchObject({ kind: 'tp1' });
    expect(before.trade!.status!.endIdx).toBeUndefined();

    const after = analyzeBut(ctx, at('2026-01-30T16:00')).find((a) => a.tf === 'H1')!.candidate;
    expect(view(after), 'laufender Butterfly fehlt, nachdem der Trend C auf 01-30 11:00 verschob').toEqual(view(before));
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
