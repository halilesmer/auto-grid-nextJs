/**
 * UI-30 Formation buttons of /chart toggle the drawing (1112-A1): a click on the selected button hides the drawing
 * (the button stays selected, outline instead of fill, badge stays), a click on it again shows it, the hidden state
 * lives in the address (`hide=1`) and survives a reload, another button shows its own drawing again.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
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

const btn = (page: Page, form: string) => page.getByTestId('chart-topbar').getByTestId(`formation-form-${form}`);

test.describe('UI-30 Formasyon düğmesi aç/kapa', () => {
  test('ikinci tık çizimi kaldırır, rozet kalır, adres taşır, başka düğme açar', { tag: '@UI-30' }, async ({ page, worker }) => {
    await open(page, worker);
    const selected = page.getByTestId('chart-topbar').locator('button[data-testid^="formation-form-"][aria-pressed="true"]');
    await expect(selected).toHaveCount(1);
    const id = (await selected.getAttribute('data-testid'))!.replace('formation-form-', '');
    const badge = await btn(page, id).getByTestId('hit-badge').textContent();
    await expect(page.getByTestId('formation-overlay')).toBeVisible();
    await expect(page.getByTestId('formation-legend')).toBeAttached();

    await btn(page, id).click();
    await expect(page).toHaveURL(/hide=1/);
    await expect(page.getByTestId('formation-overlay')).toBeHidden();
    await expect(page.getByTestId('formation-legend')).toHaveCount(0);
    await expect(btn(page, id)).toHaveAttribute('aria-pressed', 'false');
    await expect(btn(page, id)).toHaveAttribute('data-hidden', '');
    await expect(btn(page, id).getByTestId('hit-badge')).toHaveText(badge!);

    await page.reload();
    await expect(page.getByTestId('chart-topbar')).toBeVisible();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(btn(page, id)).toHaveAttribute('data-hidden', '');
    await expect(page.getByTestId('formation-overlay')).toBeHidden();

    await btn(page, id).click();
    await expect(page).not.toHaveURL(/hide=1/);
    await expect(page.getByTestId('formation-overlay')).toBeVisible();
    await expect(btn(page, id)).toHaveAttribute('aria-pressed', 'true');

    await btn(page, id).click();
    await expect(page).toHaveURL(/hide=1/);
    const other = page.getByTestId('chart-topbar').locator(`button[data-testid^="formation-form-"]:not([data-testid="formation-form-${id}"])`).first();
    await other.click();
    await expect(page).not.toHaveURL(/hide=1/);
    await expect(other).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('formation-overlay')).toBeVisible();
  });
});
