/**
 * Die artige Suche der historischen Basen (`historicBases`) liefert dieselbe Liste in derselben Reihenfolge wie die Vergleichsrechnung
 * (`historicBasesRef`, der Schritt-für-Schritt-Durchlauf von PR 655), auf allen Formations-Fixtures, mit mehreren Fensteranfängen.
 * FRM-08 Formationserkennung
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { formationTrend } from '../../src/lib/formation/trdFormation';
import { historicBases, historicBasesRef, selectBases } from '../../src/lib/formation/xabcd';
import { named, trendOf } from '../fixtures/formation-trend';

const DIR = 'e2e/fixtures/formation';
const names = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();

for (const name of names) {
  test(`historicBases auf ${name}: gleiche Basen wie die Vergleichsrechnung`, { tag: '@FRM-08' }, () => {
    const fx = named(`${DIR}/${name}.json`, parseFixture(JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf-8'))));
    const tf = fx.timeframe as 'H4';
    const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars } as ContextInput, { trend: trendOf(fx.bars) });
    for (const share of [1, 0.7, 0.4]) {
      const n = Math.floor((fx.bars.length - 1) * share);
      if (n < 20) continue;
      const view = ctx.view(tf, fx.bars[n].time + 1)!;
      const trend = formationTrend(view);
      const recent = new Set(selectBases(trend.pivots).map((b) => b.c.idx));
      for (const start of [0, 0.3, 0.6, 0.9, 1]) {
        const windowStart = view.bars[Math.floor((view.bars.length - 1) * start)].time;
        const got = JSON.stringify(historicBases(trend, view.bars, windowStart, recent));
        expect(got, `${name}@${share} Fenster ${start}`).toBe(JSON.stringify(historicBasesRef(trend, view.bars, windowStart, recent)));
      }
    }
  });
}
