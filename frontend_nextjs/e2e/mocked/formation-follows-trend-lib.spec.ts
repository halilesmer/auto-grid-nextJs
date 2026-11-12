/**
 * FRM-41: Formationen rechnen nur auf dem Trendzug des Nutzers (Halil 2026-11-05). Dieselben Kerzen und Einstellungen:
 * jeder Punkt einer Formation ist ein Eckpunkt von `buildTrendPath` (der Linie im Chart); eine andere Mindestgröße ändert
 * die Formationen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { DEFAULT_TREND_SETTINGS, type TrendSettings } from '../../src/lib/formation/params';
import { buildEnv } from '../../src/lib/formation/reasons';
import { analyzeCrb } from '../../src/lib/formation/crbChecks';
import { scanFormations } from '../../src/lib/formation/scan';
import { buildTrendPath } from '../../src/lib/formation/trdPath';
import { FIXTURE_TRENDS, trendProblems } from '../fixtures/formation-trend';

const FX = 'e2e/fixtures/formation';
const DUR = { D1: 86400, H4: 14400, H1: 3600, M15: 900 } as const;
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-41' }, fn);
const load = (name: string) => parseFixture(JSON.parse(readFileSync(`${FX}/${name}.json`, 'utf-8')));
/** Die Zahlen gehören zur Regel „Mindestgröße“; der Chart-Standard ist seit 2026-11-12 EWO + Fibo 382 */
const SIZE: TrendSettings = { ...DEFAULT_TREND_SETTINGS, rule: 'groesse' };
const SETTINGS: TrendSettings[] = [SIZE, { ...SIZE, minSize: 1 }, { ...SIZE, minSize: 3.5, changeCloses: 2 }];
const NAMES = readdirSync(FX).filter((f) => /^(trd-|crb-|abcd-)/.test(f) && f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

const contextOf = (name: string, trend: TrendSettings) => {
  const fx = load(name);
  const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars } as ContextInput, { trend });
  const tf = fx.timeframe as 'D1' | 'H4';
  return { ctx, fx, tf, t: fx.bars[fx.bars.length - 1].time + DUR[tf] };
};

frm('Jeder Wendepunkt der Formationen ist ein Eckpunkt der Linie (gleiche Kerzen, gleiche Einstellungen)', () => {
  expect(NAMES.length).toBeGreaterThan(3);
  for (const name of NAMES) {
    for (const trend of SETTINGS) {
      const { ctx, fx, tf, t } = contextOf(name, trend);
      if (tf !== 'D1' && tf !== 'H4') continue;
      const env = buildEnv(ctx, t, tf);
      if (!env) continue;
      const pivots = env.trends.get(tf)!.pivots.map((p) => fx.bars[p.idx].time);
      const path = buildTrendPath(tf, fx.bars.slice(0, ctx.closedCount(tf, t)), trend);
      const vertices = new Set(path.flatMap((s) => [s.from.time, s.to.time]));
      // ein einzelner Punkt ergibt noch keine Linie
      if (pivots.length < 2) continue;
      expect(pivots.every((time) => vertices.has(time)), `${name} ${JSON.stringify(trend)}`).toBe(true);
    }
  }
});

frm('X, A, B und C einer Crab liegen auf Eckpunkten der Linie', () => {
  for (const trend of SETTINGS) {
    const { ctx, fx, tf, t } = contextOf('crb-buy-h4-01', trend);
    const path = buildTrendPath(tf, fx.bars.slice(0, ctx.closedCount(tf, t)), trend);
    const vertices = new Set(path.flatMap((s) => [s.from.time, s.to.time]));
    for (const a of analyzeCrb(ctx, t).filter((x) => x.candidate.points.X)) {
      const { X, A, B, C } = a.candidate.points;
      expect([X, A, B, C].every((p) => vertices.has(p.time))).toBe(true);
    }
  }
});

frm('Eine andere Mindestgröße ändert die Formationen', () => {
  const signature = (name: string, trend: TrendSettings) => {
    const { ctx, t } = contextOf(name, trend);
    return JSON.stringify(scanFormations(ctx, t).map((h) => [h.form, h.tf, h.candidate.points]));
  };
  const changed = NAMES.filter((n) => signature(n, SETTINGS[0]) !== signature(n, SETTINGS[1]));
  expect(changed.length).toBeGreaterThan(0);
});

// Fixture-Einstellungen (Audit R3-01/R3-02): jede Einstellung ist eine, die der Nutzer wählen kann, und ihre Fixture-Datei gibt es.
frm('Jede Einstellung in FIXTURE_TRENDS ist im Chart wählbar und hat eine Fixture-Datei', () => {
  const names = Object.keys(FIXTURE_TRENDS);
  expect(names.length).toBeGreaterThan(30);
  for (const name of names) expect(trendProblems(name, FIXTURE_TRENDS[name]), name).toEqual([]);
});

frm('Eine kaputte Fixture-Einstellung wird rot: fehlende Datei, Wert außerhalb der Regler, falsches Raster, EWO schnell ≥ langsam', () => {
  expect(trendProblems('gibt-es-nicht-h4-99', { minSize: 1 }).join()).toContain('Fixture-Datei fehlt');
  expect(trendProblems('bat-sell-h4-01', { atrPeriod: 1 }).join()).toContain('atrPeriod');
  expect(trendProblems('bat-sell-h4-01', { atrPeriod: 101 }).join()).toContain('atrPeriod');
  expect(trendProblems('bat-sell-h4-01', { minSize: 0.3 }).join()).toContain('minSize');
  expect(trendProblems('bat-sell-h4-01', { minSize: 1.1 }).join()).toContain('Raster');
  expect(trendProblems('bat-sell-h4-01', { ewoRetreat: 0.85 }).join()).toContain('ewoRetreat');
  expect(trendProblems('bat-sell-h4-01', { ewoFast: 50, ewoSlow: 40 }).join()).toContain('EWO');
  expect(trendProblems('bat-sell-h4-01', { rule: 'quatsch' as never }).join()).toContain('rule');
  expect(trendProblems('bat-sell-h4-01', { atrPeriod: 7, minSize: 1.25, ewoFast: 8, ewoSlow: 50, ewoRetreat: 0.6 })).toEqual([]);
});
