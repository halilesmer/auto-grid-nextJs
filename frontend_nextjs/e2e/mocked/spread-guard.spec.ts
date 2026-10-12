/** ENG-31: Einstellungs-Rundweg, Modusauswahl und aktuelle Schutzdaten. */
import { DEMO_ID, LIVE_ID, RUNNING_METRICS, expect, makeZone, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test('Drei Methoden und beide Lernstarts speichern und neu laden', { tag: '@ENG-31' }, async ({ page, dashboard, worker }) => {
  worker.setZones(LIVE_ID, [makeZone({ id: 'other-account-zone', magic: 200005 })]);
  await dashboard.open(DEMO_ID);
  const guard = dashboard.zone().getByTestId('spread-guard');
  await guard.getByRole('switch').click();
  await guard.getByTestId('spread-max_spread').locator('xpath=..').getByTestId('field-hint').hover();
  await expect(page.getByRole('tooltip')).toContainText(msg('spread.max_spread.hint'));
  await page.keyboard.press('Escape');
  await guard.getByTestId('spread-max_spread').fill('0.00012');
  await dashboard.saveAllSettings();
  expect(worker.zonesOf(DEMO_ID)[0].spread_guard).toMatchObject({ enabled: true, mode: 'fixed', max_spread: 0.00012 });
  await guard.getByTestId('spread-mode').selectOption('grid');
  await guard.getByTestId('spread-grid_percent').fill('20');
  await dashboard.saveAllSettings();
  expect(worker.zonesOf(DEMO_ID)[0].spread_guard).toMatchObject({ mode: 'grid', grid_percent: 20 });
  await guard.getByTestId('spread-mode').selectOption('relative');
  await guard.getByTestId('spread-multiplier').fill('3');
  await dashboard.saveAllSettings();
  expect(worker.zonesOf(DEMO_ID)[0].spread_guard).toMatchObject({ mode: 'relative', bootstrap: 'wait', multiplier: 3 });
  await guard.getByTestId('spread-bootstrap').selectOption('manual');
  await guard.getByTestId('spread-initial_spread').fill('0.00015');
  await dashboard.saveAllSettings();
  await page.reload();
  await dashboard.selectAccount(DEMO_ID);
  await expect(guard.getByTestId('spread-mode')).toHaveValue('relative');
  await expect(guard.getByTestId('spread-bootstrap')).toHaveValue('manual');
  await expect(guard.getByTestId('spread-initial_spread')).toHaveValue('0.00015');
  await dashboard.selectAccount(LIVE_ID);
  await expect(dashboard.zone().getByTestId('spread-guard').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('Fraktal zeigt zwei Methoden, Moduswechsel benötigt einen festen Wert', { tag: '@ENG-31' }, async ({ dashboard }) => {
  await dashboard.open(DEMO_ID);
  const guard = dashboard.zone().getByTestId('spread-guard');
  await guard.getByRole('switch').click();
  await guard.getByTestId('spread-mode').selectOption('grid');
  await guard.getByTestId('spread-grid_percent').fill('20');
  await dashboard.zoneField(msg('zone.entryMode')).selectOption('fractal');
  await expect(guard.getByTestId('spread-mode')).toHaveValue('fixed');
  await expect(guard.getByTestId('spread-mode').locator('option')).toHaveCount(2);
  await expect(guard.getByTestId('spread-max_spread')).toHaveValue('');
});

for (const theme of ['light', 'dark']) {
  test(`Status und Felder bei 375 px (${theme})`, { tag: '@ENG-31' }, async ({ page, worker, dashboard }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    worker.setZones(DEMO_ID, [makeZone({ magic: 200001, spread_guard: { enabled: true, mode: 'relative', multiplier: 3, bootstrap: 'manual', initial_spread: 0.01 } })]);
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { ...RUNNING_METRICS, spread_guards: { '200001': {
      blocked: true, reason: 'high', spread: 0.1, limit: 0.03, reference: 0.01, samples: 60,
      recovery_seconds: 30, updated_at: Date.now() / 1000,
    } } });
    await dashboard.open(DEMO_ID);
    await page.evaluate((mode) => document.documentElement.classList.toggle('dark', mode === 'dark'), theme);
    const status = page.getByTestId('spread-status');
    await expect(status).toContainText(msg('spread.reason.high'));
    await expect(status).toContainText(msg('spread.learning', { samples: '60', reference: '0,01' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByTestId('spread-guard').screenshot({ path: `/tmp/spread-guard-mobile-${theme}.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByTestId('spread-guard').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -160));
    await page.getByTestId('spread-guard').screenshot({ path: `/tmp/spread-guard-desktop-${theme}.png` });
    worker.setMetrics(DEMO_ID, { ...RUNNING_METRICS, spread_guards: { '200001': {
      blocked: false, reason: 'ready', spread: 0.01, limit: 0.03, reference: 0.01, samples: 60,
      recovery_seconds: 0, updated_at: Date.now() / 1000 - 120,
    } } });
    await page.getByRole('button', { name: msg('logs.refresh'), exact: true }).click();
    await expect(status).toContainText(msg('spread.reason.unavailable'));
  });
}
