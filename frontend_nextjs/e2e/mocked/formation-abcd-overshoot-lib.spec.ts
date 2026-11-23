/**
 * AB=CD: nach dem Ende des Handels läuft D nicht weiter (Taslak 1123-A, Option B; Entscheidung offen, Halil).
 *
 * Fall (Chart 2026-11-23, XAUUSD M15, Trendregel `welle`, 2 Schlüsse): Kauf A 3742.54 (11-19 10:00), B 3725.35 (11:45), C 3737.71 (12:45),
 * AB 17.19, Level 1 3720.52. Einstieg 13:45, Stop 3713.95 per Schluss in der Kerze 14:30 (Tief 3710.51). Kein jüngeres Tripel hat eine gültige
 * Korrekturtiefe, also bleibt die Wahl bis 11-20 23:45 dieselbe; D = äußerster Docht seit C wandert bis 3502.81 (11-20 20:45), CD = 13,7 × AB.
 *
 * Regel (Vorschlag): Hat der Handel geendet, ist D der äußerste Docht von C bis zur Endkerze (einschließlich). Spätere Kerzen ändern weder D
 * noch Zickzack, Ziel-Fib oder Prüfungen am D. Wie 1121-A2.1 (C am Einstieg), 1122-A28.1 (Basis am Einstieg), 1121-A14.1 (Ziel-Fib am Stop).
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { XAUUSD_M15_1114_1120 } from '../fixtures/formation-abcd-overshoot-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);

const bars: FormationBar[] = XAUUSD_M15_1114_1120.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
/** Trendeinstellung des Charts am 2026-11-23 (Regel `welle`, Wechsel nach 2 Schlüssen) */
const CHART_TREND = { ...DEFAULT_TREND_SETTINGS, rule: 'welle' as const, changeCloses: 2 };
const ctx = new FormationContext('XAUUSD', { M15: { bars, missing: [] } }, { trend: CHART_TREND });
/** Kandidat zum Zeitpunkt `iso` = Schluss der letzten Kerze */
const candidateAt = (iso: string): Candidate => analyzeAbcd(ctx, at(iso)).find((a) => a.tf === 'M15')!.candidate;

const ABC = {
  A: { time: at('2026-11-19T10:00'), price: 3742.54 },
  B: { time: at('2026-11-19T11:45'), price: 3725.35 },
  C: { time: at('2026-11-19T12:45'), price: 3737.71 },
};
/** Docht der Stop-Kerze (14:30): das tiefste Tief von C bis zum Ende des Handels */
const D_AT_END = { time: at('2026-11-19T14:30'), price: 3710.51 };

test.describe('AB=CD: D endet mit dem Handel (1123-A)', () => {
  frm('Vorbedingung: gleiche Wahl, Handel gestoppt in der Kerze 14:30, D zu diesem Zeitpunkt am Docht der Stop-Kerze', () => {
    const c = candidateAt('2026-11-19T14:45');
    expect(c.points).toMatchObject(ABC);
    expect(c.trade?.status).toMatchObject({ kind: 'stopped', stopBy: 'close' });
    expect(bars[c.trade!.status!.endIdx!].time).toBe(D_AT_END.time);
    expect(c.points.D).toEqual(D_AT_END);
  });

  frm('zwei Tage später: dieselbe Formation, D und Zickzack bleiben an der Stop-Kerze (heute 3502.81, CD = 13,7 × AB)', () => {
    const c = candidateAt('2026-11-21T00:00');
    // Vorbedingung: dieselbe Wahl, derselbe beendete Handel
    expect(c.points).toMatchObject(ABC);
    expect(c.trade?.status).toMatchObject({ kind: 'stopped', stopBy: 'close' });
    // Regel
    expect(c.points.D, 'D läuft nach dem Ende des Handels weiter').toEqual(D_AT_END);
    const zig = c.drawings.find((d) => d.id === 'Z-ABCD-01')!;
    expect(zig.anchors[zig.anchors.length - 1]).toEqual(D_AT_END);
    const cdOverAb = Math.abs(c.points.D!.price - ABC.C.price) / Math.abs(ABC.B.price - ABC.A.price);
    expect(cdOverAb).toBeLessThanOrEqual(1.618);
  });
});
