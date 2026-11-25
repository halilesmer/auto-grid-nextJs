/**
 * Harmoniken: ein eingegangener, noch laufender Handel verschwindet nicht aus der Suche, wenn neue Kerzen kommen
 * (Entscheidung 1120-A42.1: nur ein beendeter Handel darf wegfallen). Live-Befund `candidateVanished` (FRM-39, EURUSD H4-Scan, 2026-11-20).
 *
 * Echte EURUSD-Kerzen, nur die Formations-Zeiteinheit geladen, Chart-Standard-Trendzug bis 2026-11-24 (CHART_TREND_HL2, EWO aus (Hoch + Tief) / 2).
 *
 * 1. H1 Bat (Kauf): X 08-18 09:00, A 1.17109, B 1.16507, C 1.16792; Einstieg 1.15827, Stop 1.15337, Einstieg 08-29, Stand offen.
 *    Mit der Kerze 08-31 19:00 wird D (08-31 00:00) ein Wendepunkt und 08-31 17:00 ein neuer C. Früher suchte `selectBases` C nur unter den
 *    letzten `lookbackPivots` Wendepunkten, und `analyzeXabcd` gab den Kandidaten mit den wenigsten `misses` zurück, jetzt einen ohne Handel.
 *    Seit 1121-A1.3 hat ein laufender Handel Vorrang, wenn er beim Einstieg der gezeigte Kandidat war (gesucht im Verlaufsfenster `HISTORY_DAYS`).
 * 2. H4 Gartley (Kauf): X 09-02 08:00, A 1.16537, B 1.15918, C 09-10 20:00 1.16226; Einstieg 1.15750, Stop 1.15449, Stand TP1.
 *    Der Einstieg (Kerze 09-11 12:00) kam vor dem ersten Schluss jenseits von B (Kerze 09-14 00:00). Früher verschob `shiftC` C dann
 *    rückwirkend auf den Docht 09-10 16:00 (1.16309), und das Urteil wechselte. Seit 1121-A2.1 bleibt C nach dem Einstieg, wie es war.
 * 3. Schutz „die Vergangenheit bleibt“: Kerze für Kerze durch beide Fenster, alle Harmoniken.
 * 4. Schutz „kein Blick nach vorn“: das Ergebnis zur Zeit t hängt nicht von Kerzen nach t ab.
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { analyzeBat, checkBatCandidate } from '../../src/lib/formation/batChecks';
import { analyzeGar, checkGarCandidate } from '../../src/lib/formation/garChecks';
import { analyzeBut, checkButCandidate } from '../../src/lib/formation/butChecks';
import { analyzeCrb, checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { analyzeCyp, checkCypCandidate } from '../../src/lib/formation/cypChecks';
import { buildEnv } from '../../src/lib/formation/reasons';
import { shiftC } from '../../src/lib/formation/xabcd';
import type { Anchor, Candidate, FormationBar } from '../../src/lib/formation/types';
import { EURUSD_H1_0817_0831, EURUSD_H4_0720_0914, type VanishRow } from '../fixtures/formation-vanish-rows';
import { CHART_TREND_HL2 } from '../fixtures/formation-trend';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-07' }, fn);

const barsOf = (rows: VanishRow[]): FormationBar[] => rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;

type Analyze = (ctx: FormationContext, t: number) => { tf: string; candidate: Candidate }[];
const candidateAt = (analyze: Analyze, tf: 'H1' | 'H4', rows: VanishRow[], iso: string): Candidate => {
  const ctx = new FormationContext('EURUSD', { [tf]: { bars: barsOf(rows), missing: [] } }, { trend: CHART_TREND_HL2 });
  return analyze(ctx, at(iso)).find((a) => a.tf === tf)!.candidate;
};
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

test.describe('Harmonik: laufender Handel bleibt in der Suche', () => {
  frm('H1 Bat (EURUSD, Kauf, Einstieg 2026-08-29): offen um 08-31 16:00, derselbe Kandidat um 08-31 20:00', () => {
    const before = candidateAt(analyzeBat, 'H1', EURUSD_H1_0817_0831, '2026-08-31T16:00');
    // Vorbedingung: eingegangen und offen (kein Ende)
    expect(view(before)).toEqual({
      side: 'buy',
      X: at('2026-08-18T09:00'),
      A: 1.17109,
      B: 1.16507,
      C: [at('2026-08-25T23:00'), 1.16792],
      entry: expect.closeTo(1.15827, 5),
      stop: expect.closeTo(1.15337, 5),
    });
    expect(before.trade!.status).toMatchObject({ kind: 'open' });
    expect(before.trade!.status!.endIdx).toBeUndefined();

    const after = candidateAt(analyzeBat, 'H1', EURUSD_H1_0817_0831, '2026-08-31T20:00');
    expect(view(after), 'laufender Bat fehlt nach der Kerze 08-31 19:00').toEqual(view(before));
  });

  frm('H4 Gartley (EURUSD, Kauf, Einstieg 2026-09-11): Punkte am Einstieg bleiben nach dem späten Schluss jenseits von B', () => {
    const before = candidateAt(analyzeGar, 'H4', EURUSD_H4_0720_0914, '2026-09-12T00:00');
    expect(view(before)).toEqual({
      side: 'buy',
      X: at('2026-09-02T08:00'),
      A: 1.16537,
      B: 1.15918,
      C: [at('2026-09-10T20:00'), 1.16226],
      entry: expect.closeTo(1.1575, 5),
      stop: expect.closeTo(1.15449, 5),
    });
    expect(before.trade!.status).toMatchObject({ kind: 'tp1' });
    expect(before.trade!.status!.endIdx).toBeUndefined();

    const after = candidateAt(analyzeGar, 'H4', EURUSD_H4_0720_0914, '2026-09-14T04:00');
    expect(view(after), 'C des eingegangenen Gartley wandert nach dem Einstieg').toEqual(view(before));
    expect(after.verdict).toBe(before.verdict);
  });

  type Check = (ctx: FormationContext, t: number, input: { tf: 'H1' | 'H4'; x: Anchor; a: Anchor; b: Anchor; c: Anchor }) => Candidate;
  const FORMS: [string, Analyze, Check][] = [
    ['GAR', analyzeGar, checkGarCandidate],
    ['BAT', analyzeBat, checkBatCandidate],
    ['BUT', analyzeBut, checkButCandidate],
    ['CRB', analyzeCrb, checkCrbCandidate],
    ['CYP', analyzeCyp, checkCypCandidate],
  ];
  const WINDOWS: ['H1' | 'H4', VanishRow[]][] = [
    ['H1', EURUSD_H1_0817_0831],
    ['H4', EURUSD_H4_0720_0914],
  ];
  const DUR = { H1: 3600, H4: 14400 } as const;
  const running = (c: Candidate) => c.trade?.entry != null && c.trade.status !== undefined && c.trade.status.endIdx === undefined;

  frm('Schutz: ein laufender Handel bleibt Kerze für Kerze mit Punkten, Einstieg und Stop, solange seine Wendepunkte bleiben', () => {
    const lost: string[] = [];
    let checked = 0;
    for (const [tf, rows] of WINDOWS) {
      const bars = barsOf(rows);
      const ctx = new FormationContext('EURUSD', { [tf]: { bars, missing: [] } }, { trend: CHART_TREND_HL2 });
      const pivotsAt = (t: number) => {
        const env = buildEnv(ctx, t, tf)!;
        const view = env.views.get(tf)!.bars;
        return env.trends.get(tf)!.pivots.map((p) => `${view[p.idx].time}|${p.side}`);
      };
      for (const [form, analyze, check] of FORMS) {
        let prev: { t: number; c: Candidate; pivots: string[] } | null = null;
        for (let i = 60; i < bars.length; i++) {
          const t = bars[i].time + DUR[tf];
          const c = analyze(ctx, t).find((a) => a.tf === tf)!.candidate;
          if (prev) {
            checked++;
            // Wendepunkte bis einschließlich dem Pivot von C (C liegt zwischen B und seinem Pivot) sind unverändert: dieselbe Basis gibt es noch
            const pivots = pivotsAt(t);
            const cTime = prev.c.points.C.time;
            const upTo = prev.pivots.findIndex((p) => Number(p.split('|')[0]) >= cTime);
            const sameBase = upTo >= 0 && prev.pivots.slice(0, upTo + 1).every((p) => pivots.includes(p));
            if (sameBase && JSON.stringify(view(c)) !== JSON.stringify(view(prev.c))) {
              // derselbe Handel endet in dieser Kerze (Stop, Rest am Einstieg, alle Ziele): er darf wegfallen (1120-A42.1)
              const p = prev.c.points;
              const old = check(ctx, t, { tf, x: p.X, a: p.A, b: p.B, c: p.C });
              if (old.trade?.status?.endIdx === undefined) lost.push(`${tf} ${form} ${new Date(prev.t * 1000).toISOString()} ${JSON.stringify(view(prev.c))} -> ${JSON.stringify(view(c))}`);
            }
          }
          prev = running(c) ? { t, c, pivots: pivotsAt(t) } : null;
        }
      }
    }
    expect(checked, 'laufende Handel geprüft').toBeGreaterThan(50);
    expect(lost).toEqual([]);
  });

  frm('Schutz: kein Blick nach vorn — das Ergebnis zur Zeit t ist mit und ohne spätere Kerzen gleich', () => {
    for (const [tf, rows] of WINDOWS) {
      const bars = barsOf(rows);
      const full = new FormationContext('EURUSD', { [tf]: { bars, missing: [] } }, { trend: CHART_TREND_HL2 });
      for (let i = 80; i < bars.length; i += 15) {
        const t = bars[i].time + DUR[tf];
        const cut = new FormationContext('EURUSD', { [tf]: { bars: bars.slice(0, i + 1), missing: [] } }, { trend: CHART_TREND_HL2 });
        for (const [form, analyze] of FORMS) {
          const a = analyze(full, t).find((x) => x.tf === tf)!.candidate;
          const b = analyze(cut, t).find((x) => x.tf === tf)!.candidate;
          expect(b, `${tf} ${form} ${new Date(t * 1000).toISOString()}`).toEqual(a);
        }
      }
    }
  });

  frm('eine leere Zeiteinheit neben der Formations-Zeiteinheit bricht die Suche nicht ab', () => {
    const bars = barsOf(EURUSD_H4_0720_0914);
    const ctx = new FormationContext('EURUSD', { D1: { bars: [], missing: [] }, H4: { bars, missing: [] }, H1: { bars: [], missing: [] } }, { trend: CHART_TREND_HL2 });
    const t = bars[bars.length - 1].time + DUR.H4;
    for (const [form, analyze] of FORMS) {
      const res = analyze(ctx, t);
      expect(res.find((a) => a.tf === 'H4')?.candidate.points.X, form).toBeDefined();
    }
  });

  frm('shiftC: ein Schluss jenseits von B bis zur Einstiegskerze verschiebt C, ein späterer nicht', () => {
    const bar = (time: number, high: number, low: number, close: number): FormationBar => ({ time, open: close, high, low, close });
    // Kauf: B ist ein Tief (1.0), C ein Hoch; der höchste Docht zwischen B und dem Pivot von C liegt vor dem Pivot
    const bars = [bar(0, 1.05, 1.0, 1.02), bar(1, 1.3, 1.1, 1.2), bar(2, 1.25, 1.15, 1.2), bar(3, 1.2, 1.05, 1.1), bar(4, 1.1, 1.01, 1.05), bar(5, 1.05, 0.95, 0.98)];
    const b = { idx: 0, price: 1.0 };
    const c = { idx: 2, price: 1.25 };
    const shifted = { idx: 1, price: 1.3, pivotIdx: 2 };
    expect(shiftC(bars, c, b, 'resistance', 'support')).toEqual(shifted);
    expect(shiftC(bars, c, b, 'resistance', 'support', 5), 'Schluss in der Einstiegskerze').toEqual(shifted);
    expect(shiftC(bars, c, b, 'resistance', 'support', 4), 'Schluss erst nach dem Einstieg').toBe(c);
    expect(shiftC(bars.slice(0, 5), c, b, 'resistance', 'support'), 'noch kein Schluss').toBe(c);
  });
});
