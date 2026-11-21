/**
 * AB=CD: ein eingegangener, noch laufender Handel verschwindet nicht aus der Suche, wenn neue Kerzen kommen
 * (Entscheidung 1120-A42.1: nur ein beendeter Handel darf wegfallen). Live-Befund `candidateVanished` (FRM-39, XAUUSD H1-Scan, 2026-11-21, 1121-A11.1).
 *
 * Echte XAUUSD-H1-Kerzen, nur die Formations-Zeiteinheit geladen, Chart-Standard-Trendzug (DEFAULT_TREND_SETTINGS).
 *
 * H1 Kauf: A 06-04 16:00 4515.45, B 06-08 08:00 4268.66, C 06-09 16:00 4363.43; Einstieg 4116.64, Stand TP1 um 06-12 03:00.
 * Mit der Kerze 06-12 03:00 wird D (06-11 02:00, 4023.88) ein Wendepunkt und 06-12 01:00 (4246.77) ein neuer C mit gültiger
 * Korrekturtiefe. `selectPoints` nimmt das jüngste C mit gültiger Tiefe: A, B, C rücken auf C, D, neues C, ohne Handel.
 * Der alte C ist dann der drittletzte Wendepunkt, also noch im Suchfenster `lookbackPivots`: der laufende Handel fällt nur wegen der Wahl weg.
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { XAUUSD_H1_0527_0612, type AbcdVanishRow } from '../fixtures/formation-abcd-vanish-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);

const barsOf = (rows: AbcdVanishRow[]): FormationBar[] => rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;

const candidateAt = (iso: string): Candidate => {
  const ctx = new FormationContext('XAUUSD', { H1: { bars: barsOf(XAUUSD_H1_0527_0612), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
  return analyzeAbcd(ctx, at(iso)).find((a) => a.tf === 'H1')!.candidate;
};
/** Punkte und Handel, wie die Suche sie zeigt */
const view = (c: Candidate) => ({
  side: c.side,
  A: c.points.A && [c.points.A.time, c.points.A.price],
  B: c.points.B && [c.points.B.time, c.points.B.price],
  C: c.points.C && [c.points.C.time, c.points.C.price],
  entry: c.trade?.entry ?? null,
  stop: c.trade?.stop ?? null,
});

test.describe('AB=CD: laufender Handel bleibt in der Suche', () => {
  frm('H1 Kauf (XAUUSD, Einstieg 2026-06-10): TP1 um 06-12 03:00, derselbe Kandidat um 06-12 04:00', () => {
    const before = candidateAt('2026-06-12T03:00');
    // Vorbedingung: eingegangen, TP1, nicht beendet
    expect(view(before)).toEqual({
      side: 'buy',
      A: [at('2026-06-04T16:00'), 4515.45],
      B: [at('2026-06-08T08:00'), 4268.66],
      C: [at('2026-06-09T16:00'), 4363.43],
      entry: expect.closeTo(4116.64, 2),
      stop: expect.closeTo(3964.29, 2),
    });
    expect(before.trade!.status).toMatchObject({ kind: 'tp1' });
    expect(before.trade!.status!.endIdx).toBeUndefined();

    const after = candidateAt('2026-06-12T04:00');
    expect(view(after), 'laufender AB=CD fehlt nach der Kerze 06-12 03:00').toEqual(view(before));
  });
});
