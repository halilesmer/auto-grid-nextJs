/**
 * Goldene Aufzeichnung der Formationssuche (Regression PR 647/648: die Suche wurde 10× langsamer): `scanFormations` liefert auf allen
 * Formations-Fixtures zu mehreren Zeitpunkten genau dieselben Treffer (Kandidaten, Punkte, Prüfungen, Handelsblöcke) wie beim Stand
 * vor der Beschleunigung. Ein Hash je Fixture und Zeitpunkt (Datei formation-scan-golden.json). Neu schreiben nur nach einer Regeländerung:
 * GOLDEN_UPDATE=1 npx playwright test e2e/mocked/formation-scan-golden-lib.spec.ts --project=mocked
 * Arbeitsgrenze: die Suche zählt ihre Arbeit (`xabcdWork`); die Seitenläufe prüfen die Zahl der in `historicBases` gebauten Schlüssel, nicht die Zeit (stabil unter Last).
 * FRM-08 Formationserkennung
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { scanFormations } from '../../src/lib/formation/scan';
import { HISTORY_DAYS } from '../../src/lib/formation/params';
import { splitDaily } from '../../src/lib/formation/weekly';
import { W1_HISTORY_DAYS } from '../../src/lib/formation/weekly';
import { DAY_SEC } from '../../src/lib/serverTime';
import type { FormationBar } from '../../src/lib/formation/types';
import { xabcdWork } from '../../src/lib/formation/xabcd';
import { fixtureTrend, named, trendOf } from '../fixtures/formation-trend';

const DIR = 'e2e/fixtures/formation';
const GOLDEN = 'e2e/fixtures/formation-scan-golden.json';
const UPDATE = process.env.GOLDEN_UPDATE === '1';

const names = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const golden: Record<string, string> = existsSync(GOLDEN) && !UPDATE ? JSON.parse(readFileSync(GOLDEN, 'utf-8')) : {};
const written: Record<string, string> = {};

const resetWork = () => Object.assign(xabcdWork, { evaluated: 0, keys: 0, bases: 0, entered: 0, running: 0, keyBuilds: 0 });
/** Treffer mit Handelsblock (Einstieg gesetzt) */
const blocksOf = (hits: readonly { candidate: { trade?: { entry?: number | null } } }[]) => hits.filter((h) => h.candidate.trade?.entry != null).length;
/** Hash des vollen Ergebnisses; mit GOLDEN_FULL_DIR liegt das volle JSON dort (Vorher/Nachher-Vergleich mit diff -r) */
function hashOf(key: string, hits: unknown): string {
  const json = JSON.stringify(hits);
  if (process.env.GOLDEN_FULL_DIR) writeFileSync(`${process.env.GOLDEN_FULL_DIR}/${key.replace(/[^\w@.:-]/g, '_')}.json`, json);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}
function scansOf(name: string) {
  const fx = named(`${DIR}/${name}.json`, parseFixture(JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf-8'))));
  const tf = fx.timeframe as keyof typeof TIMEFRAME_SEC;
  const out: { key: string; hash: string; work: typeof xabcdWork; blocks: number }[] = [];
  for (const share of [1, 0.8, 0.6, 0.4]) {
    const i = Math.floor((fx.bars.length - 1) * share);
    if (i < 60) continue;
    const t = fx.bars[i].time + TIMEFRAME_SEC[tf];
    const bars = fx.bars.slice(0, i + 1);
    const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: bars } as ContextInput, { trend: trendOf(fx.bars) });
    resetWork();
    const hits = scanFormations(ctx, t);
    out.push({ key: `${name}@${share}`, hash: hashOf(`${name}@${share}`, hits), work: { ...xabcdWork }, blocks: blocksOf(hits) });
  }
  return out;
}

for (const name of names) {
  test(`Suche auf ${name} liefert denselben Treffer-Hash wie die Aufzeichnung`, { tag: '@FRM-08' }, () => {
    for (const s of scansOf(name)) {
      written[s.key] = s.hash;
      if (!UPDATE) expect(s.hash, s.key).toBe(golden[s.key]);
    }
  });
}

test.afterAll(() => {
  if (UPDATE) writeFileSync(GOLDEN, `${JSON.stringify({ __keyBuildsMax: Number(process.env.KEY_MAX ?? 0), ...Object.fromEntries(Object.entries(written).sort()) }, null, 1)}\n`);
});

/** Kerzen wie der Mock-Worker sie liefert (Sinuskurve, Wochenende nur bei D1), für die vier Zeiteinheiten der Seite; feste Uhr, daher stabil */
const mid = (t: number) => 97 + 2 * Math.sin(t / 43200) + 0.3 * Math.sin(t / 2700);
function mockBars(tf: number, from: number, to: number): FormationBar[] {
  const out: FormationBar[] = [];
  for (let t = Math.ceil(from / tf) * tf; t < to; t += tf) {
    const wd = new Date(t * 1000).getUTCDay();
    if (tf < 86400 && (wd === 0 || wd === 6)) continue;
    const open = mid(t), close = mid(t + tf);
    out.push({ time: t, open: Number(open.toFixed(3)), high: Number((Math.max(open, close) + 0.05).toFixed(3)), low: Number((Math.min(open, close) - 0.05).toFixed(3)), close: Number(close.toFixed(3)) });
  }
  return out;
}
export function pageScan(nowIso: string, symbol: string) {
  const now = Date.parse(nowIso) / 1000;
  const dayEnd = Math.floor(now / DAY_SEC) * DAY_SEC + DAY_SEC;
  const from = (days: number) => dayEnd - days * DAY_SEC;
  const d1 = mockBars(86400, from(Math.max(HISTORY_DAYS.D1, W1_HISTORY_DAYS)), dayEnd).filter((b) => b.time <= now);
  const upTo = (bars: FormationBar[], tf: number) => bars.filter((b) => b.time <= Math.floor(now / tf) * tf);
  const h4 = upTo(mockBars(14400, from(HISTORY_DAYS.H4), dayEnd), 14400);
  const h1 = upTo(mockBars(3600, from(HISTORY_DAYS.H1), dayEnd), 3600);
  const m15 = upTo(mockBars(900, from(HISTORY_DAYS.M15), dayEnd), 900);
  const daily = splitDaily(d1, [], dayEnd);
  const input = { D1: daily.d1, W1: daily.w1, H4: { bars: h4, missing: [] }, H1: { bars: h1, missing: [] }, M15: { bars: m15, missing: [] } } as ContextInput;
  const at = m15[m15.length - 1].time;
  const ctx = new FormationContext(symbol, input, { trend: fixtureTrend('gar-buy-h4-01') });
  resetWork();
  const started = performance.now();
  const hits = scanFormations(ctx, at);
  return { hash: hashOf(`page:${symbol}@${nowIso}`, hits), ms: Math.round(performance.now() - started), work: { ...xabcdWork }, hits: hits.length, blocks: blocksOf(hits) };
}

// Seitenläufe (alle vier Zeiteinheiten wie der Chart, Mock-Kerzen, feste Uhr): Treffer wie aufgezeichnet; Arbeit begrenzt (Zahl der Messungen, nicht Zeit)
const PAGE = [['2026-11-12T16:21:00Z', 'USOUSD'], ['2026-11-12T05:00:00Z', 'EURUSD'], ['2026-11-12T14:00:00Z', 'EURUSD']] as const;
const KEY_MAX = JSON.parse(readFileSync('e2e/fixtures/formation-scan-golden.json', 'utf-8')).__keyBuildsMax as number | undefined;
for (const [now, sym] of PAGE) {
  test(`Seitenlauf ${sym} ${now}: gleiche Treffer, begrenzte Arbeit`, { tag: '@FRM-08' }, () => {
    const r = pageScan(now, sym);
    appendFileSync('/private/tmp/claude-501/work.log', `${sym} ${now} ${JSON.stringify(r)}\n`);
    expect(r.hits, 'Treffer').toBeGreaterThan(0);
    written[`page:${sym}@${now}`] = r.hash;
    if (!UPDATE) {
      expect(r.hash, `page:${sym}@${now}`).toBe(golden[`page:${sym}@${now}`]);
      expect(r.work.keyBuilds, 'Schlüssel in historicBases').toBeLessThanOrEqual(KEY_MAX ?? 0);
    }
  });
}

// Kerze für Kerze (FRM-07/FRM-39: Einstieg, Einfrieren, laufender Handel): die Fälle der Tests „beim Einstieg gezeigt“ und „Basis friert ein“
const WALK = ['bat-sell-h4-01', 'abcd-breakc-h4-01', 'gar-buy-h4-01', 'but-sell-h4-01', 'crb-buy-h4-01'];
for (const name of WALK) {
  test(`Kerze für Kerze auf ${name}: gleiche Treffer, Abdeckung der Handelspfade`, { tag: ['@FRM-07', '@FRM-39'] }, () => {
    const fx = named(`${DIR}/${name}.json`, parseFixture(JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf-8'))));
    const dur = TIMEFRAME_SEC[fx.timeframe as keyof typeof TIMEFRAME_SEC];
    const all: unknown[] = [];
    const cover = { evaluated: 0, keys: 0, bases: 0, entered: 0, running: 0, blocks: 0 };
    for (let i = Math.max(60, fx.bars.length - 120); i < fx.bars.length; i++) {
      const bars = fx.bars.slice(0, i + 1);
      const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: bars } as ContextInput, { trend: trendOf(fx.bars) });
      resetWork();
      const hits = scanFormations(ctx, bars[i].time + dur);
      all.push(hits);
      for (const k of ['evaluated', 'keys', 'bases', 'entered', 'running'] as const) cover[k] += xabcdWork[k];
      cover.blocks += blocksOf(hits);
    }
    const key = `walk:${name}`;
    const hash = hashOf(key, all);
    appendFileSync('/private/tmp/claude-501/work.log', `${key} ${JSON.stringify(cover)}\n`);
    written[key] = hash;
    if (!UPDATE) expect(hash, key).toBe(golden[key]);
  });
}
