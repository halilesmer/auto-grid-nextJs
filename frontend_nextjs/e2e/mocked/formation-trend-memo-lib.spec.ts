/**
 * Das Trend-Memo (`withTrendDirMemo`, `formationTrendDir`) ändert kein Ergebnis: die Richtung des Formationstrends bis zu einer früheren Kerze
 * ist im Bereich dieselbe wie die alte Rechnung `formationTrend(view, idx).dir`, für jede Kerze jeder geladenen Zeiteinheit aller Fixtures,
 * auch beim zweiten Abruf, in anderer Reihenfolge und bei zwei Ansichten desselben Kontexts.
 * FRM-18 Suche der Seite /formasyon
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
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

frm('Trend-Memo trennt Ansichten: gleiche Kerze, andere Ansicht, anderes Ergebnis', () => {
  const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${readdirSync(FX).filter((f) => f.endsWith('.json')).sort()[0]}`, 'utf-8')));
  const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars });
  const t = fx.bars[fx.bars.length - 1].time + TIMEFRAME_SEC[fx.timeframe];
  const [tf] = ctx.timeframes();
  const full = ctx.view(tf, t)!;
  const short = ctx.view(tf, fx.bars[Math.floor(fx.bars.length / 2)].time + TIMEFRAME_SEC[fx.timeframe])!;
  const i = short.bars.length - 1;
  withTrendDirMemo(() => {
    expect(formationTrendDir(short, i)).toBe(formationTrend(short, i).dir);
    expect(formationTrendDir(full, i)).toBe(formationTrend(full, i).dir);
    // innerer Bereich nutzt den äußeren weiter und räumt ihn nicht ab
    withTrendDirMemo(() => formationTrendDir(full, i));
    expect(formationTrendDir(full, i)).toBe(formationTrend(full, i).dir);
  });
});
