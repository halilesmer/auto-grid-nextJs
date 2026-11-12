import { DEMO_ID, test, expect } from '../fixtures/test';
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';

// UI-30: a dragged price axis and vertically moved candles stay after the mouse is released and after the chart updates.
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

/** The canvases of the right price axis (last cell of the first lightweight-charts table row) as data URLs */
const axis = (page: Page) => page.getByTestId('analysis-chart').evaluate(host => {
  const cells = [...(host.querySelector('table tr')?.querySelectorAll('td') ?? [])];
  return [...(cells[cells.length - 1]?.querySelectorAll('canvas') ?? [])].map(c => (c as HTMLCanvasElement).toDataURL()).join('|');
});

/** Axis image with the mouse off the chart, so no crosshair label is drawn on it */
async function still(page: Page) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  return axis(page);
}

/** Re-runs the chart's appearance effect without a visible change (cursor preference); every new candle does the same */
async function refresh(page: Page, mode: 'arrow' | 'crosshair') {
  await page.getByRole('button', { name: msg('cw.rail.cursor') }).click();
  await page.getByRole('button', { name: msg(`cw.rail.${mode}`), exact: true }).click();
  await page.waitForTimeout(400);
}

async function drag(page: Page, x: number, y: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toBeVisible();
  // Wait until the candles are drawn and the axis no longer changes
  let previous = '';
  await expect.poll(async () => { const now = await still(page); const same = now === previous && now.length > 0; previous = now; return same; }, { intervals: [300] }).toBe(true);
  return (await chart.boundingBox())!;
}

test('Fiyat ekseni sürüklenince yeni ölçek bırakınca ve güncellemede kalır', { tag: '@UI-30' }, async ({ page, worker }) => {
  void worker;
  const box = await open(page);
  const before = await still(page);
  // The right price axis is the last ~60 px of the chart
  await drag(page, box.x + box.width - 25, box.y + box.height * 0.3, 80);
  const released = await still(page);
  expect(released).not.toBe(before);
  await refresh(page, 'arrow');
  expect(await still(page)).toBe(released);
});

test('Mumlar dikey sürüklenir ve yerinde kalır; görünümü sıfırla otomatik ölçeğe döner', { tag: '@UI-30' }, async ({ page, worker }) => {
  void worker;
  const box = await open(page);
  const fit = page.getByRole('button', { name: msg('cw.fit') }).first();
  await fit.click();
  const before = await still(page);
  const x = box.x + box.width * 0.5, y = box.y + box.height * 0.3;
  await drag(page, x, y, 120);
  const released = await still(page);
  expect(released).not.toBe(before);
  await refresh(page, 'arrow');
  expect(await still(page)).toBe(released);

  // A second drag (auto scale now off) is done by the chart library itself; it starts below the moved target zone
  await drag(page, x, box.y + box.height * 0.45, -60);
  await refresh(page, 'crosshair');
  const second = await still(page);
  expect(second).not.toBe(released);

  await fit.click();
  await expect.poll(() => still(page)).toBe(before);
});
