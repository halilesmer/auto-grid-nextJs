import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`;

test('Duplikate behalten getrennte Ergebnisse und können verglichen werden', { tag: ['@BKT-08', '@BKT-13'] }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL);
  await page.getByTestId('bt-run').click();
  await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('bt-setup').getByRole('button', { name: msg('backtest.setups.duplicate'), exact: true }).click();
  await expect(page.getByTestId('bt-setup')).toHaveCount(2);
  await expect(page.getByTestId('bt-result')).toHaveCount(0);
  await page.getByTestId('bt-run').click();
  await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('bt-comparison-table').locator('thead th')).toHaveCount(3);
  await page.getByTestId('bt-setup').first().getByRole('button').first().click();
  await expect(page.getByTestId('bt-result')).toBeVisible();
});

test('Preset speichern und nach Neuladen als neue Kopie laden', { tag: '@BKT-11' }, async ({ page, worker }) => {
  await page.goto(URL);
  await page.getByTestId('bt-setup').getByRole('button', { name: msg('backtest.presets.save'), exact: true }).click();
  const panel = page.getByTestId('bt-presets');
  await panel.locator('input').fill('Regression preset');
  await panel.getByRole('button', { name: msg('backtest.presets.save'), exact: true }).click();
  await expect(panel.getByTestId('bt-preset')).toContainText('Regression preset');
  const calls = worker.callsTo('POST', '/api/backtest/presets');
  expect(calls).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: msg('backtest.presets.title'), exact: true }).click();
  await panel.getByRole('button', { name: msg('backtest.presets.load'), exact: true }).click();
  await expect(page.getByTestId('bt-setup')).toHaveCount(2);
  await expect(page.getByTestId('bt-result')).toHaveCount(0);
  expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
});

test('Übernahme erzeugt genau eine neue inaktive ungespeicherte Zone', { tag: '@BKT-12' }, async ({ page, worker, dashboard }) => {
  await page.goto(URL);
  await page.getByTestId('bt-setup').getByRole('button', { name: msg('backtest.transfer.title'), exact: true }).click();
  const dialog = page.getByTestId('bt-transfer-dialog');
  await dialog.getByRole('button', { name: msg('backtest.transfer.apply'), exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('zone-card')).toHaveCount(2);
  await expect(page.getByText(msg('backtest.transfer.unsaved'), { exact: true })).toBeVisible();
  await expect(dashboard.zone(1).getByTestId('zone-save')).toBeEnabled();
  await expect(dashboard.zone(1).getByRole('button', { name: msg('zone.header.off'), exact: true })).toBeVisible();
  expect(worker.zonesOf(DEMO_ID)).toHaveLength(1);
  expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
  expect(worker.callsTo('PUT', /\/api\/settings/)).toHaveLength(0);
  // A reload consumes no second transfer and returns to the saved account state.
  await page.reload();
  // Account selection is intentionally in-memory; select it again after a full reload.
  await dashboard.selectAccount(DEMO_ID);
  await expect(page.getByTestId('zone-card')).toHaveCount(1);
});
