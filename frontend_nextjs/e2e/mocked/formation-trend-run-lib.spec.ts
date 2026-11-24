/**
 * Der angehaltene Trendlauf (`TrendRun`, 1124-C1) ändert kein Ergebnis: sein Stand nach n Kerzen ist tief gleich `buildTrend` über die ersten n Kerzen,
 * für jede Fixture, jede Regel des Trendzugs und jede Länge, auch wenn der Lauf danach schon weitergelaufen ist (ein späterer Schritt ändert keinen
 * früheren Stand). Der Lauf über die ganze Reihe gleicht `buildTrend`. `trendOf` (reasons.ts) liefert für eine Ansicht dasselbe wie `formationTrend`.
 * FRM-18 Suche der Seite /formasyon
 */
import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { wave } from '../../src/lib/formation/indicators';
import { DEFAULT_TREND_SETTINGS, TREND_RULES } from '../../src/lib/formation/params';
import { buildEnv, shareEnv } from '../../src/lib/formation/reasons';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import { buildTrend, TrendRun, type TrendModel } from '../../src/lib/formation/trd';
import { formationTrend } from '../../src/lib/formation/trdFormation';

const FX = 'e2e/fixtures/formation';
/** Reihenfolge der Lebensdauer-Einträge gegen die Wendepunkte: die Einträge zeigen auf dieselben Wendepunkte wie die Liste */
const spanIdent = (m: TrendModel) => m.spans.map((x) => m.pivots.indexOf(x.pivot)).join(',');

for (const file of readdirSync(FX).filter((f) => f.endsWith('.json')).sort()) {
  test(`TrendRun: jeder Stand = buildTrend über die ersten n Kerzen: ${file}`, { tag: '@FRM-18' }, () => {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const { bars } = fx;
    const ftf = fx.timeframe as ContextTimeframe;
    const w = wave(bars);
    for (const rule of TREND_RULES) {
      const opt = { ...DEFAULT_TREND_SETTINGS, rule };
      const run = new TrendRun(ftf, bars, w, opt);
      const snaps: [number, TrendModel][] = [];
      for (let n = 1; n <= bars.length; n += n < bars.length - 3 ? 3 : 1) {
        run.advanceTo(n);
        snaps.push([n, run.snapshot()]);
      }
      // erst nach dem ganzen Lauf vergleichen: ein späterer Schritt darf keinen früheren Stand ändern
      for (const [n, got] of snaps) {
        const want = buildTrend(ftf, bars.slice(0, n), w.slice(0, n), opt);
        expect(isDeepStrictEqual(got, want), `${rule} n=${n}`).toBe(true);
        expect(spanIdent(got), `${rule} n=${n} Einträge`).toBe(spanIdent(want));
      }
      expect(isDeepStrictEqual(run.model, buildTrend(ftf, bars, w, opt)), `${rule} ganze Reihe`).toBe(true);
    }
  });

  test(`Trend der Umgebung = formationTrend, auch aus dem Lauf der früheren Kerzen: ${file}`, { tag: '@FRM-18' }, () => {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars } as ContextInput);
    const dur = TIMEFRAME_SEC[fx.timeframe as keyof typeof TIMEFRAME_SEC];
    const tf = ctx.timeframes()[0];
    shareEnv(ctx, () => {
      // steigend, dann absteigend: der zweite Weg fragt eine Länge vor dem Stand des Laufs an (neuer Lauf), das Ergebnis bleibt gleich
      const idxs = fx.bars.map((_, i) => i).filter((i) => i >= 20 && i % 7 === 0);
      for (const i of [...idxs, ...[...idxs].reverse()]) {
        const t = fx.bars[i].time + dur;
        const env = buildEnv(ctx, t, tf)!;
        const view = ctx.view(tf, t)!;
        expect(isDeepStrictEqual(env.trends.get(tf), formationTrend(view)), `Kerze ${i}`).toBe(true);
      }
    });
  });
}
