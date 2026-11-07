/**
 * UI-21 Pencere arka planı (plan 1107-A1): Modal ve yerel <dialog> arkasındaki sayfa bulanıklaşmadan ve kararmadan görünür.
 * Tek değer `--overlay` (globals.css); dışarı tıklayınca kapanma aynen kalır.
 */
import type { Locator, Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;

const backdropStyle = (el: Locator, pseudo?: string) =>
  el.evaluate((node, p) => {
    const s = getComputedStyle(node, p);
    return { color: s.backgroundColor, filter: s.backdropFilter };
  }, pseudo);

const setTheme = (page: Page, theme: string) =>
  page.addInitScript(value => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);

for (const theme of ['light', 'dark']) {
  test(`UI-21: RSI-Einstellungen ohne Unschärfe und ohne Abdunkeln (${theme})`, { tag: '@UI-21' }, async ({ page, worker }) => {
    void worker;
    await setTheme(page, theme);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FREE);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
    await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
    await page.locator('[data-indicator-id="system-rsi"]').getByRole('button', { name: msg('ind.edit'), exact: true }).click();
    await expect(page.getByTestId('indicator-settings')).toBeVisible();

    const backdrop = page.getByTestId('modal-backdrop');
    await expect(backdrop).toHaveCount(1);
    expect(await backdropStyle(backdrop)).toEqual({ color: 'rgba(0, 0, 0, 0)', filter: 'none' });
    await page.screenshot({ path: test.info().outputPath(`modal-backdrop-${theme}.png`) });

    // Dışarı tıklama pencereyi yine kapatır
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('indicator-settings')).toHaveCount(0);
  });

  test(`UI-21: Kontoformular (<dialog>) ohne Unschärfe und ohne Abdunkeln (${theme})`, { tag: '@UI-21' }, async ({ page, dashboard }) => {
    await setTheme(page, theme);
    await dashboard.open(null);
    await dashboard.openAccountMenu();
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: msg('account.dialog.new') })).toBeVisible();

    expect(await backdropStyle(page.locator('dialog[open]'), '::backdrop')).toEqual({ color: 'rgba(0, 0, 0, 0)', filter: 'none' });
  });
}
