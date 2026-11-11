import type { Page } from '@playwright/test';
import { msg } from './i18n';
import { expect } from './test';

/**
 * A product opened for the first time shows RSI(7) and EWO only; the Wave 5/35 layer is off (UI-11).
 * Tests that need the former three panes (RSI(7), EWO, Wave) switch the layer on through the menu "Ebenen".
 * Call it after `page.goto`; it waits for the chart, turns Wave on and closes the menu again.
 */
export async function enableWaveLayer(page: Page) {
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await expect(chart).toHaveAttribute('data-wave-visible', 'false');
  await page.getByRole('button', { name: msg('cw.layers'), exact: true }).click();
  await page.locator('#layer-wave').click();
  await expect(chart).toHaveAttribute('data-wave-visible', 'true');
  await page.keyboard.press('Escape');
}
