/**
 * BKT-14: Live-Vergleich speichern. Ein Lauf im Web Worker gegen den Mock-Worker, dann Übernehmen, Vergleichen,
 * Speichern, Neuladen, Öffnen und Löschen. Die Rechnung des Vergleichs prüft backtest-live-compare-lib.spec.ts.
 */
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`;

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(120_000);
});

async function runAndCollect(page: import('@playwright/test').Page) {
  await page.getByTestId('bt-run').click();
  await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('bt-live-toggle').click();
  await page.getByTestId('lc-collect').click();
}

test('Vergleich speichern, neu laden, öffnen (nur lesen) und löschen', { tag: '@BKT-14' }, async ({ page, worker }) => {
  worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
  const now = Math.floor(Date.now() / 1000);
  worker.state.dealsMissing = [{ from: now - 7200, to: now - 3600, reason: 'busy' }];
  await page.goto(URL);
  await runAndCollect(page);

  await expect(page.getByTestId('lc-collected').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('lc-row')).toHaveCount(1);
  await expect(page.getByTestId('lc-tolerance')).toBeVisible();

  const save = page.getByTestId('lc-save');
  await expect(page.getByTestId('lc-save-button')).toBeDisabled();
  await save.locator('input').fill('Woche 43');
  await save.locator('textarea').fill('Erste Live-Woche');
  await page.getByTestId('lc-save-button').click();
  await expect(page.getByTestId('lc-saved-item')).toHaveCount(1);
  await expect(page.getByTestId('lc-saved-item')).toContainText('Woche 43');

  const posts = worker.callsTo('POST', '/api/backtest/reports');
  expect(posts).toHaveLength(1);
  const body = posts[0].body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(body.accountId).toBe(DEMO_ID);
  expect(body.tolerance).toEqual({ sameTradeCount: true, entrySameCandle: true, priceSpreadFactor: 0.5, profitPercent: 5 });
  expect(body.zones[0].magic).toBe(200001);
  expect(body.run.csvImportId).toBeNull();
  expect(body.symbols[0].magics).toEqual([200001]);
  expect(typeof body.symbols[0].commissionPerLot).toBe('number');
  expect(body.archiveGaps).toEqual([{ start: now - 7200, end: now - 3600, reason: 'busy' }]);

  // Neu laden: der Bericht kommt aus dem Worker, nicht aus dem Browser
  await page.reload();
  await page.getByTestId('bt-live-toggle').click();
  await expect(page.getByTestId('lc-saved-item')).toHaveCount(1);
  await page.getByTestId('lc-saved-item').getByRole('button', { name: msg('backtest.live.saved.open'), exact: true }).click();
  const opened = page.getByTestId('lc-opened');
  await expect(opened).toContainText('Woche 43');
  await expect(opened).toContainText('Erste Live-Woche');
  await expect(opened.getByTestId('lc-opened-tolerance')).toContainText('0,5');
  await expect(opened.getByTestId('lc-row')).toHaveCount(1);
  await expect(opened.getByTestId('lc-opened-gaps')).toBeVisible();
  expect(worker.callsTo('POST', '/api/backtest/reports')).toHaveLength(1);

  // Löschen mit Bestätigung
  await page.getByTestId('lc-saved-item').getByRole('button', { name: msg('backtest.live.saved.delete'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  await expect(page.getByTestId('lc-saved-item')).toHaveCount(0);
  expect(worker.callsTo('DELETE', /\/api\/backtest\/reports\//)).toHaveLength(1);
  expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
});

test('Zone ohne Magic-Nummer wird nicht übernommen', { tag: '@BKT-14' }, async ({ page, worker }) => {
  worker.setZones(DEMO_ID, [makeZone()]); // keine Magic-Nummer
  await page.goto(URL);
  await runAndCollect(page);
  await expect(page.getByTestId('lc-none')).toBeVisible();
  await expect(page.getByTestId('lc-row')).toHaveCount(0);
});

test('Bei 375 px Breite scrollt die Seite nicht seitwärts, die Tabelle scrollt für sich', { tag: '@BKT-14' }, async ({ page, worker }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
  await page.goto(URL);
  await runAndCollect(page);
  await expect(page.getByTestId('lc-row')).toHaveCount(1);
  await page.getByTestId('lc-row').getByRole('button').click();
  await expect(page.getByTestId('lc-detail')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
