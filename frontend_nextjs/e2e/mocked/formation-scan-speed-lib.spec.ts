/**
 * Die schnellere Suche (1114-A4) ändert kein Ergebnis:
 * - `countTests` (frz.ts) liefert dasselbe wie die alte Rechnung mit `counter.some` je Kerze, auf zufälligen Reihen mit unsortierten Gegenfraktalen.
 * - `buildTrend` (trd.ts) liefert für jede Fixture und drei Schnittpunkte dasselbe Trendmodell (Prüfsumme aus dem Stand vor der Änderung).
 * Die Prüfsummen stehen in e2e/fixtures/formation-trend-digest.json; neu schreiben nur nach einer gewollten Änderung der Trendregeln:
 * `TREND_DIGEST_WRITE=1 npx playwright test e2e/mocked/formation-scan-speed-lib.spec.ts`.
 * FRM-18 Suche der Seite /formasyon
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { countTests, type ZoneSide } from '../../src/lib/formation/frz';
import { FRZ_PARAMS } from '../../src/lib/formation/params';
import { formationTrend } from '../../src/lib/formation/trdFormation';
import type { FormationBar } from '../../src/lib/formation/types';
import { CHART_TREND_HL2 } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-18' }, fn);
const N = FRZ_PARAMS.neighbors;

/** Die Rechnung vor der Änderung: Gegenfraktal-Suche bei jeder Kerze */
function countTestsOld(bars: readonly FormationBar[], side: ZoneSide, zone: { top: number; bottom: number }, from: number, to: number, skip: (k: number) => boolean, counter: readonly number[]): number {
  const reach = FRZ_PARAMS.testReach * (zone.top - zone.bottom);
  let tests = 0;
  let armed = true;
  let last = -1;
  for (let k = from; k <= to; k++) {
    if (!armed && counter.some((f) => f > last && f + N < k)) armed = true;
    if (skip(k)) continue;
    const b = bars[k];
    const touch = side === 'resistance' ? b.high >= zone.bottom - reach : b.low <= zone.top + reach;
    if (touch && armed) {
      tests++;
      armed = false;
      last = k;
    }
  }
  return tests;
}

/** Zufallszahlen mit festem Startwert (mulberry32) */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

frm('countTests = alte Rechnung auf 3000 zufälligen Reihen (auch mit unsortierten Gegenfraktalen)', () => {
  const rand = rng(1114);
  let totalTests = 0;
  for (let c = 0; c < 3000; c++) {
    const n = 20 + Math.floor(rand() * 200);
    const bars: FormationBar[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
      price += (rand() - 0.5) * 2;
      const high = price + rand() * 1.5;
      const low = price - rand() * 1.5;
      bars.push({ time: 1000 + i * 60, open: price, high, low, close: price });
    }
    const side: ZoneSide = rand() < 0.5 ? 'resistance' : 'support';
    const mid = 95 + rand() * 12;
    const zone = { top: mid + rand() * 0.8, bottom: mid - rand() * 0.8 };
    const from = Math.floor(rand() * n * 0.4);
    const to = from + Math.floor(rand() * (n - from));
    const skipSet = new Set(Array.from({ length: Math.floor(rand() * 4) }, () => from + Math.floor(rand() * (to - from + 1))));
    const counter = Array.from({ length: Math.floor(rand() * 12) }, () => Math.floor(rand() * n));
    const want = countTestsOld(bars, side, zone, from, to, (k) => skipSet.has(k), counter);
    expect(countTests(bars, side, zone, from, to, (k) => skipSet.has(k), counter)).toBe(want);
    totalTests += want;
  }
  // die Reihen prüfen wirklich etwas: es gibt Tests, und der Wiederbewaffnungs-Zweig läuft
  expect(totalTests).toBeGreaterThan(3000);
});

const FX = 'e2e/fixtures/formation';
const DIGEST = 'e2e/fixtures/formation-trend-digest.json';

function trendDigests(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of readdirSync(FX).filter((f) => f.endsWith('.json')).sort()) {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars }, { trend: CHART_TREND_HL2 });
    const t = fx.bars[fx.bars.length - 1].time + TIMEFRAME_SEC[fx.timeframe];
    for (const tf of ctx.timeframes()) {
      const view = ctx.view(tf, t)!;
      const n = view.bars.length;
      for (const upTo of [Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]) {
        const m = formationTrend(view, upTo);
        // `spans` (Lebensdauer der Wendepunkte, 1122-A28.1) ist Buchführung über die Wendepunkte, kein Trendergebnis; geprüft in formation-harmonic-base-freeze-lib
        const text = JSON.stringify({ ...m, bars: undefined, wave: undefined, spans: undefined });
        out[`${file}|${tf}|${upTo}`] = createHash('sha256').update(text).digest('hex');
      }
    }
  }
  return out;
}

frm('buildTrend: Trendmodell jeder Fixture gleich dem Stand vor der Beschleunigung (Prüfsumme)', () => {
  const got = trendDigests();
  if (process.env.TREND_DIGEST_WRITE === '1' || !existsSync(DIGEST)) {
    writeFileSync(DIGEST, JSON.stringify(got, null, 0) + '\n');
    return;
  }
  const want = JSON.parse(readFileSync(DIGEST, 'utf-8')) as Record<string, string>;
  expect(Object.keys(got).length).toBeGreaterThan(100);
  expect(got).toEqual(want);
});
