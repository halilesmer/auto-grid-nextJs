/**
 * Das Trend-Memo (`withTrendDirMemo`, `formationTrendDir`) ändert kein Ergebnis: die Richtung des Formationstrends bis zu einer früheren Kerze
 * ist im Bereich dieselbe wie die alte Rechnung `formationTrend(view, idx).dir`, für jede Kerze jeder geladenen Zeiteinheit aller Fixtures,
 * auch beim zweiten Abruf, in anderer Reihenfolge und bei zwei Ansichten desselben Kontexts.
 * FRM-18 Suche der Seite /formasyon
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { FormationContext, type ContextInput, type TimeframeView } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { shareEnv } from '../../src/lib/formation/reasons';
import { formationTrend, formationTrendDir, withTrendDirMemo } from '../../src/lib/formation/trdFormation';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-18' }, fn);

const FX = 'e2e/fixtures/formation';
for (const file of readdirSync(FX).filter((f) => f.endsWith('.json')).sort()) {
  frm(`Trend-Memo = alte Rechnung für jede Kerze: ${file}`, () => {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars });
    const t = fx.bars[fx.bars.length - 1].time + TIMEFRAME_SEC[fx.timeframe];
    for (const tf of ctx.timeframes()) {
      const view = ctx.view(tf, t)!;
      const idxs = Array.from({ length: view.bars.length }, (_, i) => i);
      const old = idxs.map((i) => formationTrend(view, i).dir);
      const got = withTrendDirMemo(() => {
        const first = idxs.map((i) => formationTrendDir(view, i));
        const again = [...idxs].reverse().map((i) => formationTrendDir(view, i)).reverse();
        expect(again).toEqual(first);
        return first;
      });
      expect(got).toEqual(old);
      // außerhalb des Bereichs: wie bisher, ohne Merken
      expect(idxs.map((i) => formationTrendDir(view, i))).toEqual(old);
    }
  });
}

const fixtureCtx = (name: string, zug: 'trend' | 'fein') => {
  const trend = { ...DEFAULT_TREND_SETTINGS, minSize: zug === 'trend' ? 2.5 : 1 };
  const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${name}.json`, 'utf-8')));
  const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars } as ContextInput, { trend });
  const [tf] = ctx.timeframes();
  return ctx.view(tf, fx.bars[fx.bars.length - 1].time + TIMEFRAME_SEC[fx.timeframe])!;
};

/** Ansicht, deren `bars.slice` mitzählt: jeder Aufbau von `formationTrend` ruft es genau einmal */
function counted(view: TimeframeView): { view: TimeframeView; builds: () => number } {
  let n = 0;
  const bars = view.bars.slice();
  bars.slice = (...args) => {
    n++;
    return Array.prototype.slice.apply(view.bars, args);
  };
  return { view: { ...view, bars }, builds: () => n };
}

frm('Trend-Memo trennt Ansichten: gleiche Kerze, zwei Ansichten mit verschiedener Richtung', () => {
  const trend = fixtureCtx('trd-ref-h4-audnzd', 'trend');
  const fein = fixtureCtx('trd-ref-h4-audnzd', 'fein');
  const at = [150, 200, 250, 300, 350];
  const want = (v: TimeframeView) => at.map((k) => formationTrend(v, k).dir);
  expect(want(trend)).not.toEqual(want(fein));
  withTrendDirMemo(() => {
    expect(at.map((k) => formationTrendDir(trend, k))).toEqual(want(trend));
    expect(at.map((k) => formationTrendDir(fein, k))).toEqual(want(fein));
  });
});

frm('Trend-Memo spart Arbeit: im Bereich ein Aufbau je Ansicht und Kerze, danach wieder jeder', () => {
  const { view, builds } = counted(fixtureCtx('trd-ref-h4-audnzd', 'fein'));
  const ask = () => [200, 250, 200, 250, 200].map((k) => formationTrendDir(view, k));
  withTrendDirMemo(() => {
    ask();
    expect(builds()).toBe(2);
    // innerer Bereich nutzt den äußeren weiter und räumt ihn nicht ab
    withTrendDirMemo(ask);
    ask();
    expect(builds()).toBe(2);
  });
  ask();
  expect(builds()).toBe(2 + 5);
});

frm('Trend-Memo gehört zur Suche: shareEnv öffnet den Bereich und schließt ihn wieder', () => {
  const view = fixtureCtx('trd-ref-h4-audnzd', 'fein');
  const ctx = new FormationContext('X', { H4: view.bars });
  const { view: probe, builds } = counted(view);
  shareEnv(ctx, () => {
    formationTrendDir(probe, 200);
    formationTrendDir(probe, 200);
  });
  expect(builds()).toBe(1);
  formationTrendDir(probe, 200);
  expect(builds()).toBe(2);
});
