import type { Locator, Page } from '@playwright/test';
import { msg } from './i18n';

/** Tab of the "Göstergeler ve çizimler" window; its label also carries a count ("Çizimler · 2"). */
export const dialogTab = (page: Page, key: 'cw.tab.indicators' | 'cw.tab.drawings') =>
  page.getByRole('dialog').getByRole('tab', { name: new RegExp(`^${msg(key)} · `) });

/**
 * Opens the Indicators button's window and switches to its Drawings tab (1106-A3: the former "Çizim nesneleri" window).
 * `root` is the page or the chart workspace that holds the button; the dialog renders into the page body.
 */
export async function openDrawings(root: Page | Locator): Promise<Locator> {
  const page = 'goto' in root ? root : root.page();
  await root.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await dialogTab(page, 'cw.tab.drawings').click();
  return page.getByRole('dialog');
}
