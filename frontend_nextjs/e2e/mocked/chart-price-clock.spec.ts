import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { dragLeft } from '../fixtures/chart-older';
import { axisLabelHeight } from '../../src/lib/chart-workspace/priceClock';

// 1123-A10.1 = B: under the last price label of the live chart a second box shows the broker time (SS:DD:ss, same colour).
// The canvas draws it, so the primitive writes the text to `data-price-clock` on the chart host. Mock broker offset: +3 h.
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`;
test.use({ fakeNow: '2026-11-18T12:00:00Z' });
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));
const clock = (page: Page) => page.getByTestId('analysis-chart').getAttribute('data-price-clock');

async function toggleClock(page: Page) {
  await page.getByTestId('workspace-settings').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: msg('cw.scales'), exact: true }).click();
  await dialog.getByRole('checkbox', { name: msg('cw.priceClock') }).click();
  return dialog;
}

test('Live-Chart am Desktop zeigt die Brokerzeit unter dem Preislabel', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', /^15:00:\d\d$/);
  const first = await clock(page);
  await expect.poll(() => clock(page), { timeout: 5000 }).not.toBe(first);
});

test('Einstellung „Fiyat etiketinde saat“ schaltet die Uhr aus und ein', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', /^15:/);
  const dialog = await toggleClock(page);
  await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await expect(page.getByTestId('analysis-chart')).not.toHaveAttribute('data-price-clock', /.*/);
});

test('Ohne Preislabel keine Uhr', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', /^15:/);
  await page.getByTestId('workspace-settings').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: msg('cw.scales'), exact: true }).click();
  await dialog.getByRole('checkbox', { name: msg('cw.priceLabel') }).click();
  await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await expect(page.getByTestId('analysis-chart')).not.toHaveAttribute('data-price-clock', /.*/);
});

test('Beim Blick in die Vergangenheit keine Uhr', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${URL}&at=2026-11-17T10:00`);
  await expect(page.getByTestId('analysis-chart')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('analysis-chart')).not.toHaveAttribute('data-price-clock', /.*/);
});

test('Am Telefon keine Uhr', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('analysis-chart')).not.toHaveAttribute('data-price-clock', /.*/);
});

test('W1 zeigt die Uhr auch im Kalender-Zeitraum', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=W1&range=all`);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', /^15:/);
});

test('Nach dem Scrollen folgt die Uhr dem Preislabel (sichtbare letzte Kerze)', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-price-clock', /^15:/);
  const num = async (name: string) => Number(await chart.getAttribute(name));
  // Both attributes are written in one draw, but two reads can fall on two draws: poll on the pair, not on single values
  const gap = async () => (await num('data-price-clock-y')) - (await num('data-price-label-y'));
  // The label height of the library at the default font size (11 px)
  await expect.poll(gap).toBeCloseTo(axisLabelHeight(11), 0);
  // The view must be at rest before the reference value is read
  let rest = NaN;
  await expect.poll(async () => { const now = await num('data-price-label-y'); const same = now === rest; rest = now; return same; }, { intervals: [300] }).toBe(true);
  const before = rest;
  // The user scrolls the last candle out of the view: the library label drops to the last visible candle, so the clock does too
  await dragLeft(page);
  await expect.poll(() => num('data-price-label-y')).not.toBeCloseTo(before, 0);
  await expect.poll(gap).toBeCloseTo(axisLabelHeight(11), 0);
  await expect(chart).toHaveAttribute('data-price-clock', /^15:/);
});
