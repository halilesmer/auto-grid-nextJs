/** Die Karte des Charts (1107-A21.22): ab lg das Seitenpanel hinter der rechten Leiste, darunter die schwebende Karte. Beide Tests-IDs sind nie gleichzeitig da. */
import type { Locator, Page } from '@playwright/test';

import { msg } from './i18n';

export type CardTabId = 'conditions' | 'favorites' | 'overview' | 'trades';

/** Der Rahmen der Karte: `chart-panel` (ab lg) oder `chart-floating-card` (darunter) */
export const cardRoot = (page: Page): Locator => page.locator('[data-testid="chart-panel"], [data-testid="chart-floating-card"]');

/**
 * Öffnet die Karte, falls nötig, und wählt den Reiter. Ab lg: Knopf „Karte“ der Leiste (Favoriten: Knopf „Favoriten“, ein eigenes Panel statt eines Reiters);
 * darunter: Taste „Karte“ bzw. Aufklappen der schwebenden Karte.
 */
export async function openCardTab(page: Page, id: CardTabId): Promise<Locator> {
  const rail = page.getByTestId('chart-rail');
  if (await rail.isVisible()) {
    if (id === 'favorites') {
      if ((await page.getByTestId('chart-rail-favorites').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('chart-rail-favorites').click();
      return page.getByTestId('chart-panel');
    }
    const panel = page.getByTestId('chart-panel');
    const shown = (await panel.count()) ? await panel.getAttribute('data-panel') : null;
    if (shown !== 'card') await page.getByTestId('chart-rail-card').click();
    await page.getByTestId(`chart-card-tab-${id}`).click();
    return page.getByTestId('chart-panel');
  }
  const card = page.getByTestId('chart-floating-card');
  if (!(await page.getByTestId(`chart-card-tab-${id}`).count())) {
    if (await page.getByTestId('chart-card-open').isVisible()) await page.getByTestId('chart-card-open').click();
    else await card.getByRole('button', { name: msg('chart.card.expand'), exact: true }).click();
  }
  await page.getByTestId(`chart-card-tab-${id}`).click();
  return card;
}
