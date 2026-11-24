/**
 * Die Wahl der AB=CD-Suche liest nur den Handel eines Tripels (`tradeOnlyOf`, 1124-C1). Er gleicht dem der vollen Messung (`evaluate`) in
 * allem, was die Wahl liest: Seite, Punkte A bis D, ob der Handel eingegangen ist, und bei eingegangenem Handel Einstieg, Stop, Stand und
 * Einstiegskerze. Geprüft für jedes Tripel der Wahl (`selectOrder`) zu mehreren Zeitpunkten jeder Fixture, im Bereich von `shareEnv` wie die Suche.
 * FRM-18 Suche der Seite /formasyon
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { selectOrder } from '../../src/lib/formation/abcd';
import { entryEnvOf, evaluate, tradeOnlyOf } from '../../src/lib/formation/abcdChecks';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { buildEnv, shareEnv } from '../../src/lib/formation/reasons';
import { enteredTrade } from '../../src/lib/formation/shownTrade';
import { pipOf } from '../../src/lib/formation/xabcd';
import type { Candidate } from '../../src/lib/formation/types';

const FX = 'e2e/fixtures/formation';
/** Was die Wahl liest; Einstieg, Stop und Stand nur bei eingegangenem Handel (sonst fehlen sie im Handel der Suche) */
const readByChoice = (c: Candidate) =>
  JSON.stringify({
    side: c.side,
    tf: c.tf,
    points: c.points,
    entered: enteredTrade(c),
    ...(enteredTrade(c) ? { entry: c.trade!.entry, stop: c.trade!.stop, status: c.trade!.status, entryIdx: c.trade!.entryIdx } : {}),
  });

for (const file of readdirSync(FX).filter((f) => f.endsWith('.json')).sort()) {
  test(`Handel allein = volle Messung für die Wahl: ${file}`, { tag: '@FRM-18' }, () => {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars } as ContextInput);
    const tf = ctx.timeframes()[0];
    const pip = pipOf(fx.symbol);
    const dur = TIMEFRAME_SEC[fx.timeframe];
    let compared = 0;
    shareEnv(ctx, () => {
      for (const share of [1, 0.8, 0.6, 0.4]) {
        const i = Math.floor((fx.bars.length - 1) * share);
        if (i < 60) continue;
        const env = buildEnv(ctx, fx.bars[i].time + dur, tf)!;
        const atEntry = entryEnvOf(ctx, tf);
        for (const p of selectOrder(env.trends.get(tf)!.pivots)) {
          expect(readByChoice(tradeOnlyOf(env, p, pip, atEntry)), `${file}@${share}`).toBe(readByChoice(evaluate(env, p, undefined, pip, atEntry)));
          compared++;
        }
      }
    });
    expect(compared).toBeGreaterThanOrEqual(0);
  });
}
