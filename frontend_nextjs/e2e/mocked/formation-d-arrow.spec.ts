/**
 * D-Pfeil (1124-F2) auf der Seite /chart: die fünf Zustände auf echten Butterfly-Kerzen (e2e/fixtures/formation/but-*.json), die der Mock-Worker ausliefert.
 * „D nah“ nimmt dieselbe Reihe wie „D wartet“ und setzt nur den Schluss der letzten Kerze 3 Pips über das D-Niveau (keine echte Reihe hat einen Rest unter 5 Pips).
 * FRM-49 D-Pfeil vor dem D
 */
import { readFileSync } from 'node:fs';
import { noPriceClock } from '../fixtures/no-price-clock';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { FormationContext } from '../../src/lib/formation/context';
import { analyzeBut } from '../../src/lib/formation/butChecks';
import { pipOf } from '../../src/lib/formation/xabcd';
import { groupZones, makeZone } from '../fixtures/data';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { named, seedFixtureTrend, trendOf } from '../fixtures/formation-trend';

const H4 = 14400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const load = (name: string) => {
  const path = `e2e/fixtures/formation/${name}.json`;
  return named(path, parseFixture(JSON.parse(readFileSync(path, 'utf-8'))));
};

interface Case {
  state: string;
  fixture: string;
  iso: string;
  /** Nur „D nah“: Schluss der letzten Kerze in Pips über dem D-Niveau */
  nearPips?: number;
  expect: { state: string; level?: 'strong' | 'faint'; reason?: boolean; reasonArrow?: boolean; ring?: boolean; arrow?: boolean; pill?: RegExp };
}

const CASES: Case[] = [
  { state: 'wait', fixture: 'but-buy-h4-02', iso: '2025-11-19T04:00', expect: { state: 'wait', level: 'strong', arrow: true, ring: false, pill: /^AL / } },
  { state: 'near', fixture: 'but-buy-h4-02', iso: '2025-11-19T04:00', nearPips: 3, expect: { state: 'near', level: 'strong', arrow: true, ring: true, pill: /^AL / } },
  { state: 'bBreak', fixture: 'but-buy-h4-02', iso: '2025-10-23T16:00', expect: { state: 'bBreak', level: 'faint', arrow: true, ring: false, pill: /^B / } },
  { state: 'invalidShort', fixture: 'but-form-h4-01', iso: '2025-10-06T08:00', expect: { state: 'invalid', level: 'faint', arrow: false, reason: true, reasonArrow: false, pill: /^Geçersiz/ } },
  { state: 'invalid', fixture: 'but-sell-h4-01', iso: '2026-01-27T20:00', expect: { state: 'invalid', level: 'faint', arrow: false, reason: true, reasonArrow: true, pill: /^Geçersiz/ } },
  { state: 'done', fixture: 'but-buy-h4-02', iso: '2025-11-19T12:00', expect: { state: 'none' } },
];

async function serve(worker: MockWorker, c: Case) {
  const f = load(c.fixture);
  const now = at(c.iso);
  // Das Konto kennt nur wenige Symbole: das der Fixture kommt als Kopie von EURUSD dazu
  const eur = worker.state.symbols.find((x) => x.name === 'EURUSD')!;
  if (!worker.state.symbols.some((x) => x.name === f.symbol)) worker.state.symbols = [...worker.state.symbols, { ...eur, name: f.symbol }];
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: f.symbol })]) };
  const rows = f.bars.filter((b) => b.time + H4 <= now).map((b) => [b.time, b.open, b.high, b.low, b.close]);
  if (c.nearPips !== undefined) {
    const ctx = new FormationContext(f.symbol, { H4: f.bars }, { trend: trendOf(f.bars) });
    // D-Niveau der Butterfly: XA 1,272 = A + 1.272 × (X − A)
    const { X, A } = analyzeBut(ctx, now).find((a) => a.tf === 'H4')!.candidate.points;
    const d = A.price + 1.272 * (X.price - A.price);
    const row = rows[rows.length - 1];
    const close = d + c.nearPips * pipOf(f.symbol);
    row[4] = close;
    row[2] = Math.max(row[2], close);
    row[3] = Math.min(row[3], close);
  }
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[now - 900, last[4], last[4], last[4], last[4]]] };
  return f;
}

async function open(page: Page, worker: MockWorker, c: Case) {
  const f = await serve(worker, c);
  await seedFixtureTrend(page, trendOf(f.bars), true);
  await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=BUT&tf=H4`);
  await expect(page.getByTestId('chart-topbar')).toBeVisible();
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

test.beforeEach(({ page }) => noPriceClock(page));

test.describe('FRM-49 D-Pfeil auf der Seite', () => {
  for (const c of CASES) {
    test(`Zustand ${c.state} auf echten Kerzen`, { tag: '@FRM-49' }, async ({ page, worker }) => {
      await open(page, worker, c);
      const root = page.getByTestId('formation-d-arrow');
      const e = c.expect;
      if (e.state === 'none') {
        await expect(root).toHaveCount(0);
        await expect(page.getByTestId('formation-d-arrow-line')).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath(`formation-d-arrow-${c.state}.png`) });
      } else {
        await expect(root).toHaveAttribute('data-state', e.state);
        await expect(page.getByTestId('formation-d-level')).toHaveAttribute('data-strength', e.level!);
        await expect(page.getByTestId('formation-d-arrow-line')).toHaveCount(e.arrow ? 1 : 0);
        await expect(page.getByTestId('formation-d-ring-near')).toHaveCount(e.ring ? 1 : 0);
        await expect(page.getByTestId('formation-d-reason')).toHaveCount(e.reason ? 1 : 0);
        if (e.reason) {
          await expect(page.getByTestId('formation-d-reason-arrow')).toHaveCount(e.reasonArrow ? 1 : 0);
          // „n pip eksik“ steht genau einmal: neben dem Pfeil oder in der Zeile der Linie
          await expect(page.getByTestId('formation-d-reason')).toContainText('pip eksik');
          expect(((await page.getByTestId('formation-d-reason').textContent()) ?? '').split('pip eksik').length - 1).toBe(1);
        }
        await expect(page.getByTestId('formation-d-pill')).toHaveAttribute('data-main', e.pill!);
        await page.mouse.move(5, 5);
        await page.screenshot({ path: test.info().outputPath(`formation-d-arrow-${c.state}.png`) });
        // Hover: der Hinweis nennt Titel und Rest
        await page.getByTestId('formation-d-arrow-hit').locator('span').first().hover({ force: true });
        await expect(page.getByRole('tooltip')).toContainText(/\S/);
        await page.screenshot({ path: test.info().outputPath(`formation-d-arrow-${c.state}-hover.png`) });
      }
    });
  }

  test('reduzierte Bewegung: der Ring blinkt nicht', { tag: '@FRM-49' }, async ({ page, worker }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, worker, CASES[1]);
    const name = await page.getByTestId('formation-d-ring-near').evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });
});
