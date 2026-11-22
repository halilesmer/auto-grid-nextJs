/**
 * AB=CD: ein eingegangener, noch laufender Handel verschwindet nicht aus der Suche, wenn neue Kerzen kommen
 * (Entscheidung 1120-A42.1: nur ein beendeter Handel darf wegfallen). Live-Befund `candidateVanished` (FRM-39, XAUUSD H1-Scan, 2026-11-21, 1121-A11.1).
 *
 * Echte XAUUSD-H1-Kerzen, nur die Formations-Zeiteinheit geladen, Chart-Standard-Trendzug (DEFAULT_TREND_SETTINGS).
 *
 * H1 Kauf: A 06-04 16:00 4515.45, B 06-08 08:00 4268.66, C 06-09 16:00 4363.43; Einstieg 4116.64, Stand TP1 um 06-12 03:00.
 * Mit der Kerze 06-12 03:00 wird D (06-11 02:00, 4023.88) ein Wendepunkt und 06-12 01:00 (4246.77) ein neuer C mit gültiger
 * Korrekturtiefe. `selectPoints` nimmt das jüngste C mit gültiger Tiefe: A, B, C rücken auf C, D, neues C, ohne Handel.
 * Der alte C ist dann der drittletzte Wendepunkt, also noch im Suchfenster `lookbackPivots`: der laufende Handel fiel nur wegen der Wahl weg.
 * Seit 1122-A1.3 (Regel 1121-A1.3 der Harmoniken) hat ein laufender Handel Vorrang, wenn er beim Einstieg der gezeigte Kandidat war;
 * der verdrängte Kandidat steht in `displaced`.
 * Schutz „die Vergangenheit bleibt“: Kerze für Kerze durch das Fenster. Schutz „kein Blick nach vorn“: das Ergebnis zur Zeit t hängt nicht von Kerzen nach t ab.
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

const ctxOf = (rows: AbcdVanishRow[]) => new FormationContext('XAUUSD', { H1: { bars: barsOf(rows), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
const analysisAt = (iso: string, rows = XAUUSD_H1_0527_0612) => analyzeAbcd(ctxOf(rows), at(iso)).find((a) => a.tf === 'H1')!;
const candidateAt = (iso: string): Candidate => analysisAt(iso).candidate;
const HOUR = 3600;
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
    // Der verdrängte Kandidat (A = alter C, B = altes D, C 06-12 01:00) ist verdeckt, ohne Handel
    const displaced = analysisAt('2026-06-12T04:00').displaced;
    expect(displaced && view(displaced)).toEqual({
      side: 'buy',
      A: [at('2026-06-09T16:00'), 4363.43],
      B: [at('2026-06-11T02:00'), 4023.88],
      C: [at('2026-06-12T01:00'), 4246.77],
      entry: null,
      stop: null,
    });
  });

  frm('Die Vergangenheit bleibt: ein eingegangener Handel fehlt in der nächsten Kerze nur, wenn er beendet ist', () => {
    const ctx = ctxOf(XAUUSD_H1_0527_0612);
    const rows = XAUUSD_H1_0527_0612;
    const keyOf = (c: Candidate) => `${c.side}|${c.points.A?.time}|${c.points.B?.time}|${c.points.C?.time}`;
    let prev: Candidate | null = null;
    let running = 0;
    for (let i = 60; i < rows.length; i++) {
      const t = rows[i][0] + HOUR;
      const c = analyzeAbcd(ctx, t).find((a) => a.tf === 'H1')!.candidate;
      if (prev?.trade?.status && prev.trade.entry !== null && prev.trade.status.endIdx === undefined) {
        running++;
        expect(keyOf(c), `laufender Handel ${keyOf(prev)} fehlt zur Zeit ${new Date(t * 1000).toISOString()}`).toBe(keyOf(prev));
        expect(c.trade?.entry).toBe(prev.trade.entry);
        expect(c.trade?.stop).toBe(prev.trade.stop);
      }
      prev = c;
    }
    // Vorbedingung: das Fenster enthält laufende Handelsstände
    expect(running).toBeGreaterThan(5);
  });

  frm('Kein Blick nach vorn: das Ergebnis zur Zeit t hängt nicht von späteren Kerzen ab', () => {
    const rows = XAUUSD_H1_0527_0612;
    for (const iso of ['2026-06-10T22:00', '2026-06-12T03:00', '2026-06-12T04:00', '2026-06-12T07:00']) {
      const cut = rows.filter((r) => r[0] + HOUR <= at(iso));
      const full = analysisAt(iso);
      const part = analysisAt(iso, cut);
      expect(view(part.candidate), iso).toEqual(view(full.candidate));
      expect(part.displaced && view(part.displaced), iso).toEqual(full.displaced && view(full.displaced));
    }
  });

  frm('Zwischenspeicher ändert nichts: Kerze für Kerze auf einem Kontext gleich wie mit frischem Kontext je Zeit', () => {
    const rows = XAUUSD_H1_0527_0612;
    const shared = ctxOf(rows);
    for (let i = 60; i < rows.length; i++) {
      const t = rows[i][0] + HOUR;
      const a = analyzeAbcd(shared, t).find((x) => x.tf === 'H1')!;
      const b = analyzeAbcd(ctxOf(rows), t).find((x) => x.tf === 'H1')!;
      const when = new Date(t * 1000).toISOString();
      expect(view(a.candidate), when).toEqual(view(b.candidate));
      expect(a.candidate.trade?.status, when).toEqual(b.candidate.trade?.status);
      expect(a.displaced && view(a.displaced), when).toEqual(b.displaced && view(b.displaced));
    }
  });
});
