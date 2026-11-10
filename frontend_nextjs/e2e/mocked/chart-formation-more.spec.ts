/**
 * UI-25 Formation row of /chart: only formations with a counted match on the selected timeframe (badge) and the selected
 * formation stay in the row; formations with only invalid or early candidates are in the menu behind the arrow button.
 * Fixture abcd-double-h4-01 at its end: a head-and-shoulders (OBO) is forming without right shoulder, so it has no badge.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { named, seedFixtureTrend, trendOf } from '../fixtures/formation-trend';

const bars = named('e2e/fixtures/formation/abcd-double-h4-01.json', parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/abcd-double-h4-01.json', 'utf-8')))).bars;
const NOW = bars[bars.length - 1].time + 14400;
const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H4`;

function serve(worker: MockWorker) {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = bars.filter((b) => b.time + 14400 <= NOW).map((b) => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[NOW - 900, last[4], last[4], last[4], last[4]]] };
}

async function open(page: Page, worker: MockWorker, url = URL) {
  serve(worker);
  await seedFixtureTrend(page, trendOf(bars), true);
  await page.goto(url);
  await expect(page.getByTestId('chart-topbar')).toBeVisible();
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

const row = (page: Page) => page.getByTestId('chart-topbar').getByTestId('formation-forms');
/** The element at the centre of the locator is the locator itself (not clipped or covered) */
const onTop = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });

test.describe('UI-25 Formationsreihe: Treffer sichtbar, Kandidaten im Menü', () => {
  for (const [name, size] of [['1440 px', { width: 1440, height: 900 }], ['375 px', { width: 375, height: 812 }]] as const) {
    test(`${name}: ein Kandidat ohne Badge steht nur im Menü und kommt nach der Wahl in die Reihe`, { tag: '@UI-25' }, async ({ page, worker }) => {
      await page.setViewportSize(size);
      await open(page, worker);
      // Every unselected button in the row has a badge; the forming OBO is not in the row
      const buttons = row(page).locator('button[data-testid^="formation-form-"]');
      for (const b of await buttons.all()) {
        if ((await b.getAttribute('aria-pressed')) !== 'true') await expect(b.getByTestId('hit-badge')).toBeVisible();
      }
      await expect(row(page).locator('button[data-testid="formation-form-OBO"]')).toHaveCount(0);
      await page.getByTestId('formation-forms-more').click();
      const item = page.getByTestId('formation-more-OBO');
      await expect(item).toBeVisible();
      await expect(item).toContainText(msg('formation.forms.state.forming'));
      expect(await onTop(page, 'formation-more-OBO')).toBe(true);
      await item.click();
      await expect(page).toHaveURL(/form=OBO/);
      const picked = row(page).locator('button[data-testid="formation-form-OBO"]');
      await expect(picked).toHaveAttribute('aria-pressed', 'true');
      await expect(picked.getByTestId('hit-badge')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
});
