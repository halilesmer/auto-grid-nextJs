/**
 * Verlaufsscan (FRM-39), `candidateVanished` (1122-A1.3.2): der Stand eines verschwundenen Handels zählt zur Zeit des Verschwindens,
 * neu gemessen mit denselben Punkten und nur mit Kerzen bis dahin (`remeasureAtVanish`).
 *
 * 1. Beendet zwischen zwei Scans (kein Verstoß): XAUUSD M15 Verkauf, A 2025-11-11 09:45, B 15:30, C 17:15, Einstieg 4118.72.
 *    Der H1-Scan (Schritt 4) sah ihn um 21:00 mit TP1; in der Kerze 21:30 endet er mit dem Rest am Einstieg, um 02:00 fehlt er.
 *    Live-Befund 1121-A11.1 (erster der 34 Fälle): der Scan zählte ihn als Verstoß, weil er den letzten gesehenen Stand nahm.
 * 2. Läuft noch (Verstoß bleibt): XAUUSD H1 Kauf aus formation-abcd-vanish-lib.spec.ts. Ohne den Vorrang laufender Handel (1122-A1.3)
 *    fehlte er um 06-12 04:00 mit TP1; die Neumessung zur selben Zeit zeigt TP1 ohne Ende.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import type { FormationBar } from '../../src/lib/formation/types';
import { remeasureAtVanish, vanishVerdict } from '../fixtures/formation-vanish';
import { XAUUSD_H1_0527_0612, type AbcdVanishRow } from '../fixtures/formation-abcd-vanish-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-39' }, fn);

const barsOf = (rows: AbcdVanishRow[]): FormationBar[] => rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const ctxOf = (tf: 'H1' | 'M15', rows: AbcdVanishRow[]) => new FormationContext('XAUUSD', { [tf]: { bars: barsOf(rows), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });

test.describe('Verlaufsscan: Stand beim Verschwinden neu gemessen', () => {
  frm('Zwischen zwei Scans beendet (H1, Rest am Einstieg): kein Verstoß', () => {
    // Echte H1-Kerzen (long-leg-Fixture); das Tripel hat gültige Tiefe (0,58), die Form trägt den Handel (1126-A20.2)
    const bars = (JSON.parse(readFileSync('e2e/fixtures/long-leg-xauusd-h1.json', 'utf-8')) as number[][]).map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
    const ctx = new FormationContext('XAUUSD', { H1: { bars, missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
    const trade = {
      tf: 'H1' as const,
      form: 'ABCD' as const,
      points: { A: { time: 1773162000, price: 5238.65 }, B: { time: 1773280800, price: 5125.82 }, C: { time: 1773320400, price: 5191.72 } },
    };
    // Vorbedingung: beim letzten Scan (04:00) mit TP1 und ohne Ende gesehen
    expect(remeasureAtVanish(ctx, at('2026-03-13T04:00'), trade)).toEqual({ state: 'tp1', finished: false, endTime: null });
    const r = remeasureAtVanish(ctx, at('2026-03-13T19:00'), trade);
    expect(r).toEqual({ state: 'breakeven', finished: true, endTime: 1773421200 });
    expect(vanishVerdict(false, r)).toBe('finished');
  });

  frm('Läuft beim Verschwinden noch (H1, TP1): Verstoß bleibt', () => {
    const ctx = ctxOf('H1', XAUUSD_H1_0527_0612);
    const trade = {
      tf: 'H1' as const,
      form: 'ABCD' as const,
      points: { A: { time: at('2026-06-04T16:00'), price: 4515.45 }, B: { time: at('2026-06-08T08:00'), price: 4268.66 }, C: { time: at('2026-06-09T16:00'), price: 4363.43 } },
    };
    const r = remeasureAtVanish(ctx, at('2026-06-12T04:00'), trade);
    expect(r).toEqual({ state: 'tp1', finished: false, endTime: null });
    expect(vanishVerdict(false, r)).toBe('violation');
  });
});
