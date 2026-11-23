/**
 * AB=CD: geht die Proportion verloren, wird das AB=CD verlassen und neu gesucht (Taslak 1123-A, Vorschlag a1 + b1; Entscheidung offen, Halil).
 *
 * Fall (Chart 2026-11-23, XAUUSD M15, Trendregel `welle`, 2 Schlüsse): Kauf A 3742.54 (11-19 10:00), B 3725.35 (11:45), C 3737.71 (12:45),
 * AB 17.19, Level 1 3720.52. Einstieg 13:45, Stop 3713.95 per Schluss in der Kerze 14:30 (Tief 3710.51). Kein jüngeres Tripel hat eine gültige
 * Korrekturtiefe, also bleibt die Wahl bis 11-20 23:45 dieselbe; D = äußerster Docht seit C wandert bis 3502.81 (11-20 20:45), CD = 13,7 × AB.
 *
 * Regel (Vorschlag): Läuft das D-Bein weiter als 1.618 × AB (CD/AB > 1.618), ist die Proportion verloren: das AB=CD wird nicht mehr gewählt,
 * die Suche geht mit den übrigen Tripeln weiter (hier gibt es keines, also kein AB=CD in M15). Ein laufender Handel behält seinen Vorrang
 * (1122-A1.3) und zeigt sein Ende (1120-A42.1); erst danach zählt die Proportion. Kural B (1122-A3.2) und der Handel in der Historie bleiben.
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

test.describe('AB=CD: verlorene Proportion beendet die Formation (1123-A)', () => {
  frm('Vorbedingung: am Ende des Handels (14:30, CD = 1,58 × AB) ist die Formation mit dem gestoppten Handel gezeigt', () => {
    const c = candidateAt('2026-11-19T14:45');
    expect(c.points).toMatchObject(ABC);
    expect(c.trade?.status).toMatchObject({ kind: 'stopped', stopBy: 'close' });
    expect(bars[c.trade!.status!.endIdx!].time).toBe(D_AT_END.time);
    expect(c.points.D).toEqual(D_AT_END);
  });

  frm('zwei Tage später: CD = 13,7 × AB, die Proportion ist verloren, das AB=CD ist nicht mehr gezeigt', () => {
    // Heute (ohne Regel) gezeigt: dieselbe Formation mit D 3502.81 (11-20 20:45)
    const c = candidateAt('2026-11-21T00:00');
    expect(c.points.A?.time ?? null, 'verlassenes AB=CD (CD > 1.618 × AB) wird weiter gezeigt').not.toBe(ABC.A.time);
  });
});
