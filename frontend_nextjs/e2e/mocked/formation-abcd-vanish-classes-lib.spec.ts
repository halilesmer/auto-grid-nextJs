/**
 * AB=CD: die drei Fälle, die nach dem Vorrang laufender Handel (1122-A1.3) im Verlaufsscan noch verschwanden (1122-A1.4, ausgerichtet an den
 * Entscheidungen der Harmoniken 1122-A3.2 = B und 1122-A3.3.2). Echte XAUUSD-Kerzen, nur die Formations-Zeiteinheit, DEFAULT_TREND_SETTINGS.
 *
 * a) Das Verlaufsfenster gilt für einen laufenden Handel ab dem Einstieg, nicht ab A (das Fenster begrenzt nur die Kosten der Suche).
 *    M15 Kauf, A 2026-03-18 09:30, C 03-20 06:15, Einstieg 03-23: am 03-30 liegt A über 10 Tage zurück, der Handel läuft mit TP1.
 * b) Ein Handel, der beim Einstieg nicht gezeigt war, wird nie gezeigt; es gilt der nächstbeste Kandidat (1122-A3.2 = B).
 *    M15 Kauf, A 2026-07-06 04:45, C 07-07 01:30, Einstieg 07-07 22:15: zum Schluss der Einstiegskerze war ein anderer Kandidat gezeigt.
 * c) Die Identität des Handels hat keine Wendepunkte (Seite, Einstiegskerze, Einstiegspreis; wie 1122-A3.3.2); die Wahl beim Einstieg bleibt gespeichert.
 *    H1 Verkauf, A 2025-12-09 08:00, B 18:00, C 12-10 12:00, Einstieg 12-10 22:00 (4239.26): eine Kerze später rückt der C-Wendepunkt
 *    auf 12-10 21:00, das Tripel ist nicht mehr unter den Wendepunkten. Die gespeicherte Wahl hängt nur von Kerzen bis zum Einstieg ab.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { FIXTURE_TREND, named } from '../fixtures/formation-trend';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import type { AbcdVanishRow } from '../fixtures/formation-abcd-vanish-rows';
import { XAUUSD_H1_1201_1211, XAUUSD_M15_0316_0330, XAUUSD_M15_0701_0708 } from '../fixtures/formation-abcd-vanish-classes-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);

type Tf = 'H1' | 'M15';
const barsOf = (rows: AbcdVanishRow[]): FormationBar[] => rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const ctxOf = (tf: Tf, rows: AbcdVanishRow[]) => new FormationContext('XAUUSD', { [tf]: { bars: barsOf(rows), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
const candidateAt = (ctx: FormationContext, tf: Tf, iso: string): Candidate => analyzeAbcd(ctx, at(iso)).find((a) => a.tf === tf)!.candidate;
/** A, B, C (Zeiten) und Stand, wie die Suche sie zeigt */
const view = (c: Candidate) => ({
  side: c.side,
  A: c.points.A?.time ?? null,
  B: c.points.B?.time ?? null,
  C: c.points.C?.time ?? null,
  entry: c.trade?.entry ?? null,
  state: c.trade?.status?.kind ?? null,
});

test.describe('AB=CD: verschwundene laufende Handel, Klassen a bis c (1122-A1.4)', () => {
  frm('a) Verlaufsfenster ab dem Einstieg: der M15-Handel (A 03-18) bleibt am 03-30, solange er läuft', () => {
    const ctx = ctxOf('M15', XAUUSD_M15_0316_0330);
    const trade = { side: 'buy', A: at('2026-03-18T09:30'), C: at('2026-03-20T06:15') };
    // Vorbedingung: am 03-28 gezeigt, eingegangen, TP1
    expect(view(candidateAt(ctx, 'M15', '2026-03-28T00:00'))).toMatchObject({ ...trade, state: 'tp1' });
    for (const iso of ['2026-03-30T01:00', '2026-03-30T05:00']) {
      expect(view(candidateAt(ctx, 'M15', iso)), `laufender Handel fehlt zur Zeit ${iso}`).toMatchObject({ ...trade, state: 'tp1' });
    }
  });

  frm('b) Beim Einstieg nicht gezeigt: der M15-Handel (A 07-06 04:45) erscheint nie, auch nicht nach dem Einstieg', () => {
    const ctx = ctxOf('M15', XAUUSD_M15_0701_0708);
    const tradeA = at('2026-07-06T04:45');
    // Vorbedingung: zum Schluss der Einstiegskerze (22:30) ist ein anderer Kandidat gezeigt
    expect(view(candidateAt(ctx, 'M15', '2026-07-07T22:30')).A).not.toBe(tradeA);
    for (let t = at('2026-07-07T22:30'); t <= at('2026-07-08T07:00'); t += 900) {
      const iso = new Date(t * 1000).toISOString().slice(0, 16);
      expect(view(candidateAt(ctx, 'M15', iso)).A, `nicht gezeigter Handel erscheint zur Zeit ${iso}`).not.toBe(tradeA);
    }
  });

  frm('c) C rückt nach dem Einstieg: der H1-Handel bleibt mit der Wahl beim Einstieg, bis er endet', () => {
    const ctx = ctxOf('H1', XAUUSD_H1_1201_1211);
    const shown = { side: 'sell', A: at('2025-12-09T08:00'), B: at('2025-12-09T18:00'), C: at('2025-12-10T12:00'), entry: expect.closeTo(4239.26, 2) };
    // Vorbedingung: zum Schluss der Einstiegskerze (23:00) gezeigt, eingegangen
    expect(view(candidateAt(ctx, 'H1', '2025-12-10T23:00'))).toMatchObject({ ...shown, state: 'open' });
    for (const iso of ['2025-12-11T00:00', '2025-12-11T02:00', '2025-12-11T04:00']) {
      expect(view(candidateAt(ctx, 'H1', iso)), `laufender Handel fehlt zur Zeit ${iso}`).toMatchObject({ ...shown, state: 'open' });
    }
  });

  frm('c) Kein Blick nach vorn: die gespeicherte Wahl beim Einstieg hängt nur von Kerzen bis zum Schluss der Einstiegskerze ab', () => {
    const rows = XAUUSD_H1_1201_1211;
    const cutAt = (iso: string) => rows.filter((r) => r[0] + 3600 <= at(iso));
    // Wahl zum Schluss der Einstiegskerze nur aus Kerzen bis dahin
    const atEntry = view(candidateAt(ctxOf('H1', cutAt('2025-12-10T23:00')), 'H1', '2025-12-10T23:00'));
    for (const iso of ['2025-12-11T00:00', '2025-12-11T04:00']) {
      const full = view(candidateAt(ctxOf('H1', rows), 'H1', iso));
      const part = view(candidateAt(ctxOf('H1', cutAt(iso)), 'H1', iso));
      expect(part, iso).toEqual(full);
      expect({ ...full, state: null }, iso).toEqual({ ...atEntry, state: null });
    }
  });
});

test.describe('AB=CD: nächstbester Kandidat nach Regel B (1122-A1.4 b)', () => {
  // abcd-buy-h4-02 (EURUSD H4): ab 07-14 16:00 ist unter den letzten Wendepunkten nur ein Tripel gültig (Verkauf, A 07-10 16:00, C 07-11 00:00);
  // sein Handel (Einstiegskerze 07-11 04:00) war beim Einstieg nicht gezeigt. Dann gelten die letzten drei Wendepunkte (Tiefe ungültig, noch kein Einstieg).
  const file = 'e2e/fixtures/formation/abcd-buy-h4-02.json';
  const bars = named(file, parseFixture(JSON.parse(readFileSync(file, 'utf-8')))).bars;
  const H4 = 4 * 3600;
  const shownAt = (iso: string, cut: boolean) => {
    const b = cut ? bars.filter((x) => x.time + H4 <= at(iso)) : bars;
    return analyzeAbcd(new FormationContext('EURUSD', { H4: b }, { trend: FIXTURE_TREND }), at(iso)).find((a) => a.tf === 'H4')!.candidate;
  };
  frm('b) Trägt das einzige gültige Tripel einen nicht gezeigten Handel, zeigt die Suche die letzten drei Wendepunkte, aus Kerzen bis zur Zeit', () => {
    for (const iso of ['2025-07-14T16:00', '2025-07-14T20:00', '2025-07-15T00:00']) {
      for (const cut of [false, true]) {
        const c = shownAt(iso, cut);
        expect([c.side, c.points.A?.time, c.points.C?.time, c.trade?.entry ?? null], `${iso} ${cut ? 'gekürzt' : 'ganz'}`).toEqual([
          'sell',
          at('2025-07-11T12:00'),
          at('2025-07-14T04:00'),
          null,
        ]);
      }
    }
  });
  frm('b) Der beim Einstieg nicht gezeigte Verkauf (A 07-10 16:00, C 07-11 00:00) erscheint auch mit TP1 und TP2 nicht (07-16 00:00)', () => {
    // bis 1122-A1.4 zeigte die Suche ihn hier als „TP1 und TP2 alındı“ (früherer Zeitpunkt von formation-trade.spec.ts)
    for (const cut of [false, true]) {
      const c = shownAt('2025-07-16T00:00', cut);
      expect([c.points.A?.time, c.points.C?.time], cut ? 'gekürzt' : 'ganz').not.toEqual([at('2025-07-10T16:00'), at('2025-07-11T00:00')]);
    }
  });
  frm('b) Beim Einstieg zeigte die Suche einen älteren laufenden Handel: der neue Handel (A 07-10 00:00) erscheint auch nach dessen Ende nie', () => {
    // Einstiegskerze 07-11 00:00; zu ihrem Schluss zeigte die Suche den laufenden Verkauf A 07-09 00:00 (Vorrang), nicht diesen Handel
    expect(shownAt('2025-07-11T04:00', false).points.A?.time).toBe(at('2025-07-09T00:00'));
    for (let t = at('2025-07-11T04:00'); t <= at('2025-07-14T12:00'); t += H4) {
      const iso = new Date(t * 1000).toISOString().slice(0, 16);
      const c = shownAt(iso, false);
      expect(c.points.A?.time === at('2025-07-10T00:00') && c.points.C?.time === at('2025-07-10T16:00') && c.trade?.entry != null, `nicht gezeigter Handel erscheint zur Zeit ${iso}`).toBe(false);
    }
  });
});
