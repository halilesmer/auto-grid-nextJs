import type { Page } from '@playwright/test';
import { DEMO_ID, LIVE_ID, test, expect } from '../fixtures/test';

// UI-24: the height of an oscillator pane (RSI, EWO) that the user dragged stays per product after a reload.
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

/** Height of each chart pane from top to bottom (rows of the chart table with a drawing canvas; the time axis row is not a pane). */
const paneHeights = (page: Page) => page.getByTestId('analysis-chart').evaluate(host => {
  const table = host.querySelector('table');
  if (!table) return [];
  const rows = [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')] as HTMLElement[];
  const panes = rows.filter(row => row.children.length > 1 && row.querySelector('canvas'));
  return panes.slice(0, -1).map(row => Math.round(row.getBoundingClientRect().height));
});

/** Drags the separator above pane `index` (1 = first oscillator pane) by `dy` px. */
async function dragSeparator(page: Page, index: number, dy: number) {
  const top = await page.getByTestId('analysis-chart').evaluate((host, i) => {
    const table = host.querySelector('table')!;
    const rows = [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')] as HTMLElement[];
    const panes = rows.filter(row => row.children.length > 1 && row.querySelector('canvas'));
    const box = panes[i].getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top };
  }, index);
  await page.mouse.move(top.x, top.y);
  await page.mouse.down();
  await page.mouse.move(top.x, top.y + dy / 2, { steps: 5 });
  await page.mouse.move(top.x, top.y + dy, { steps: 5 });
  await page.mouse.up();
}

test('Gezogene Oszillator-Höhe bleibt je Produkt nach dem Neuladen', { tag: '@UI-24' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await expect.poll(async () => (await paneHeights(page)).length).toBeGreaterThan(1);
  const before = await paneHeights(page);
  // Price pane taller, first oscillator pane smaller
  await dragSeparator(page, 1, 60);
  await expect.poll(async () => (await paneHeights(page))[1]).toBeLessThan(before[1] - 30);
  const dragged = await paneHeights(page);
  await page.reload();
  await expect.poll(async () => (await paneHeights(page)).length).toBe(dragged.length);
  await expect.poll(async () => Math.abs((await paneHeights(page))[1] - dragged[1])).toBeLessThan(4);
  // Another product keeps its own (default) heights
  await page.goto(`/chart?account=${LIVE_ID}&symbol=USOUSD&tf=H1&range=last7`);
  await expect.poll(async () => (await paneHeights(page)).length).toBeGreaterThan(1);
  await expect.poll(async () => Math.abs((await paneHeights(page))[1] - before[1])).toBeLessThan(4);
});
