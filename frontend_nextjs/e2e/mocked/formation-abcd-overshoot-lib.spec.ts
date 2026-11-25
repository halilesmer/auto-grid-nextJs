/**
 * AB=CD: geht die Proportion verloren, wird das AB=CD verlassen und neu gesucht (1123-A: Entscheidung b1, Halil 1123-A11; Schwelle a1 = Annahme; 1123-A15.1: gilt auch für Yeniden giriş).
 *
 * Fall (Chart 2026-11-23, XAUUSD M15, Trendregel `welle`, 2 Schlüsse): Kauf A 3742.54 (11-19 10:00), B 3725.35 (11:45), C 3737.71 (12:45),
 * AB 17.19, Level 1 3720.52. Einstieg 13:45, Stop 3713.95 per Schluss in der Kerze 14:30 (Tief 3710.51). Kein jüngeres Tripel hat eine gültige
 * Korrekturtiefe, also bleibt die Wahl bis 11-20 23:45 dieselbe; D = äußerster Docht seit C wandert bis 3502.81 (11-20 20:45), CD = 13,7 × AB.
 *
 * Regel: Läuft das D-Bein weiter als 1.618 × AB (CD/AB > 1.618), ist die Proportion verloren: das AB=CD wird nicht mehr gewählt,
 * die Suche geht mit den übrigen Tripeln weiter (hier gibt es keines, also kein AB=CD in M15). Ein laufender Handel behält seinen Vorrang
 * (1122-A1.3) und zeigt sein Ende (1120-A42.1); erst danach zählt die Proportion. Kural B (1122-A3.2) und der Handel in der Historie bleiben.
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { ABCD_PARAMS } from '../../src/lib/formation/params';
import { readdirSync, readFileSync } from 'node:fs';
import { parseFixture } from '../../src/lib/formation/fixture';
import { named, trendOf, CHART_TREND_HL2 } from '../fixtures/formation-trend';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { XAUUSD_M15_1114_1120 } from '../fixtures/formation-abcd-overshoot-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);

const bars: FormationBar[] = XAUUSD_M15_1114_1120.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
/** Trendeinstellung des Charts am 2026-11-23 (Regel `welle`, Wechsel nach 2 Schlüssen) */
const CHART_TREND = { ...CHART_TREND_HL2, rule: 'welle' as const, changeCloses: 2 };
const ctxOf = (list: FormationBar[]) => new FormationContext('XAUUSD', { M15: { bars: list, missing: [] } }, { trend: CHART_TREND });
const ctx = ctxOf(bars);
/** Kandidat zum Zeitpunkt `iso` = Schluss der letzten Kerze */
const candidateIn = (c: FormationContext, iso: string): Candidate => analyzeAbcd(c, at(iso)).find((a) => a.tf === 'M15')!.candidate;
const candidateAt = (iso: string): Candidate => candidateIn(ctx, iso);
/** Dieselben Kerzen, die Stop-Kerze 14:30 mit anderem Tief und Schluss (Grenzfälle der Regel) */
const withStopCandle = (low: number, close: number): FormationBar[] =>
  bars.map((b) => (b.time === at('2026-11-19T14:30') ? { ...b, low, close } : b));
const cdOverAb = (c: Candidate) => Math.abs(c.points.D!.price - c.points.C!.price) / Math.abs(c.points.B!.price - c.points.A!.price);

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

  frm('die Messung beginnt nach der Endkerze: endet der Handel in einer Kerze jenseits von 1.618 × AB, zeigt er sein Ende einmal', () => {
    // Stop-Kerze 14:30 mit Tief 3706 (CD = 1,84 × AB), Schluss wie echt unter dem Stop
    const c2 = ctxOf(withStopCandle(3706, 3713.18));
    const atEnd = candidateIn(c2, '2026-11-19T14:45');
    expect(atEnd.points).toMatchObject(ABC);
    expect(atEnd.trade?.status).toMatchObject({ kind: 'stopped' });
    expect(cdOverAb(atEnd)).toBeGreaterThan(ABCD_PARAMS.maxCdAb);
    // eine Kerze später ist die Formation verlassen
    expect(candidateIn(c2, '2026-11-19T15:00').points.A?.time ?? null).not.toBe(ABC.A.time);
  });

  frm('ein laufender Handel fällt nicht wegen der Proportion weg', () => {
    // Kerze 14:30 mit Tief 3707 (CD = 1,79 × AB, über dem Not-SL) und Schluss 3716 über dem Stop: der Handel läuft (TP1 14:45, Ende 15:00)
    const c2 = ctxOf(withStopCandle(3707, 3716));
    const running = candidateIn(c2, '2026-11-19T15:00');
    expect(running.points).toMatchObject(ABC);
    expect(running.trade?.status?.endIdx).toBeUndefined();
    expect(cdOverAb(running)).toBeGreaterThan(ABCD_PARAMS.maxCdAb);
    // nach dem Ende (Breakeven in der Kerze 15:00) zeigt er sein Ende einmal, danach ist er verlassen
    expect(candidateIn(c2, '2026-11-19T15:15').trade?.status).toMatchObject({ kind: 'breakeven' });
    expect(candidateIn(c2, '2026-11-19T15:30').points.A?.time ?? null).not.toBe(ABC.A.time);
  });

  frm('nach dem Verlassen gilt das nächste Tripel der Reihenfolge (hier die letzten drei Wendepunkte)', () => {
    const c = candidateAt('2026-11-21T00:00');
    expect(c.points.A).toEqual({ time: at('2026-11-20T07:30'), price: 3514.65 });
    expect(c.points.B).toEqual({ time: at('2026-11-20T12:45'), price: 3595.19 });
    expect(c.points.C).toEqual({ time: at('2026-11-20T20:45'), price: 3502.81 });
  });

  // 1123-A15.1 (Halil: „orantı her zaman“): auch ein beendeter Handel mit Yeniden giriş oder Nur-TP1-Hinweis wird bei verlorener Proportion verlassen
  const fixtureAt = (file: string, now: number): Candidate | undefined => {
    const path = `e2e/fixtures/formation/${file}.json`;
    const fx = named(path, parseFixture(JSON.parse(readFileSync(path, 'utf-8'))));
    const rows = fx.bars.filter((b) => b.time + 14400 <= now);
    const fctx = new FormationContext(fx.symbol, { H4: { bars: rows, missing: [] } }, { trend: trendOf(fx.bars) });
    return analyzeAbcd(fctx, now).find((a) => a.tf === 'H4')?.candidate;
  };

  frm('crb-form-h4-01: D-Docht im laufenden Handel 1,77 × AB; das Ende (TP1+2) einmal gezeigt, danach verlassen, kein Yeniden giriş', () => {
    const atEnd = fixtureAt('crb-form-h4-01', 1763467200);
    expect(atEnd?.points.A?.time).toBe(1763136000);
    expect(atEnd?.trade?.status).toMatchObject({ kind: 'tp12' });
    expect(cdOverAb(atEnd!)).toBeGreaterThan(ABCD_PARAMS.maxCdAb);
    // Ohne Regel zeigte die Kerze danach den Yeniden-giriş-Abschnitt dieses Handels
    const later = fixtureAt('crb-form-h4-01', 1763481600);
    expect(later?.points.A?.time ?? null).not.toBe(1763136000);
    expect(later?.trade?.reentry).toBeUndefined();
  });

  frm('gar-buy-h4-01: D wandert nach dem Ende auf 2,36 × AB; das Ende (Breakeven) einmal gezeigt, danach kein AB=CD und kein Nur-TP1-Hinweis', () => {
    const atEnd = fixtureAt('gar-buy-h4-01', 1763049600);
    expect(atEnd?.points.A?.time).toBe(1762948800);
    expect(atEnd?.trade?.status).toMatchObject({ kind: 'breakeven' });
    const later = fixtureAt('gar-buy-h4-01', 1763064000);
    expect(later?.points.A?.time ?? null).not.toBe(1762948800);
    expect(later?.trade?.reentryTp1Only).toBeUndefined();
  });

  frm('ohne Einstieg liegt D nie jenseits von maxCdAb × AB (110 Fixtures, jede achte Kerze)', () => {
    let seen = 0;
    for (const f of readdirSync('e2e/fixtures/formation').filter((x) => x.endsWith('.json')).sort()) {
      const path = `e2e/fixtures/formation/${f}`;
      const fx = named(path, parseFixture(JSON.parse(readFileSync(path, 'utf-8'))));
      if (fx.bars.length < 60 || !['M15', 'H1', 'H4', 'D1'].includes(fx.timeframe)) continue;
      const tf = fx.timeframe as 'M15' | 'H1' | 'H4' | 'D1';
      const fctx = new FormationContext(fx.symbol, { [tf]: { bars: fx.bars, missing: [] } }, { trend: trendOf(fx.bars) });
      const sec = { M15: 900, H1: 3600, H4: 14400, D1: 86400 }[tf];
      for (let i = 40; i < fx.bars.length; i += 8) {
        const c = analyzeAbcd(fctx, fx.bars[i].time + sec).find((a) => a.tf === tf)?.candidate;
        if (!c?.points.A || !c.points.D || c.trade?.status) continue;
        seen++;
        expect(cdOverAb(c), `${f} ${i}`).toBeLessThanOrEqual(ABCD_PARAMS.maxCdAb);
      }
    }
    expect(seen).toBeGreaterThan(500);
  });
});
