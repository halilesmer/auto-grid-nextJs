import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { dragLeft } from '../fixtures/chart-older';
import { axisLabelHeight } from '../../src/lib/chart-workspace/priceClock';

// 1124-A9: under the last price label of the live chart a second box shows the time left to the close of the last bar (same colour).
// The canvas draws it, so the primitive writes the text to `data-price-clock` on the chart host. Mock broker offset: +3 h.
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`;
test.use({ fakeNow: '2026-11-18T11:30:00Z' });
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));
// Mock broker offset +3 h: 11:30:00Z = 14:30 broker on Wednesday 2026-11-18. Fixed candles end with the bars that are open then (H1 of 14:00, D1 of
// 2026-11-18); the sine candles of the mock leave out the running bar, which needs a live price. The test takes some seconds, so only the minutes are fixed.
const WED = Date.UTC(2026, 10, 18) / 1000;
const rows = (step: number, last: number, count: number) => Array.from({ length: count }, (_, i) => { const t = last - (count - 1 - i) * step; const p = 1.1 + (t % 7) / 1000; return [t, p, p + 0.001, p - 0.001, p + 0.0005]; });
test.beforeEach(({ worker }) => { worker.state.ratesSeries = { H1: rows(3600, WED + 14 * 3600, 120), D1: rows(86400, WED, 90) }; });
const H1_LEFT = /^29:\d\d$/; // closes at 15:00
const D1_LEFT = /^09:29:\d\d$/; // closes at broker midnight
const W1_LEFT = /^3[gdT] 09:29$/; // weeks start on Sunday in MT5: the week of 2026-11-15 closes on 2026-11-22 at 00:00
const MN_LEFT = /^12[gdT] 09:29$/; // November closes on 2026-12-01 at 00:00
const ANY_LEFT = /^(\d\d:\d\d(:\d\d)?|\d+[gdT] \d\d:\d\d)$/;
const clock = (page: Page) => page.getByTestId('analysis-chart').getAttribute('data-price-clock');

async function toggleClock(page: Page) {
  await page.getByTestId('workspace-settings').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: msg('cw.scales'), exact: true }).click();
  await dialog.getByRole('checkbox', { name: msg('cw.priceClock') }).click();
  return dialog;
}

test('Live-Chart am Desktop zeigt die Restzeit bis Kerzenschluss unter dem Preislabel', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', H1_LEFT);
  const first = await clock(page);
  await expect.poll(() => clock(page), { timeout: 5000 }).not.toBe(first);
});

test('Einstellung „Fiyat etiketinde saat“ schaltet die Uhr aus und ein', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', ANY_LEFT);
  const dialog = await toggleClock(page);
  await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await expect(page.getByTestId('analysis-chart')).not.toHaveAttribute('data-price-clock', /.*/);
});

test('Ohne Preislabel keine Uhr', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', ANY_LEFT);
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

for (const [tf, expected, name] of [['D1', D1_LEFT, 'D1 schließt um Mitternacht der Brokerzeit'], ['W1', W1_LEFT, 'W1 zeigt Tage bis zum Wochenschluss'], ['MN', MN_LEFT, 'MN zählt bis zum Monatsende nach Kalender']] as const) {
  test(name, { tag: '@ANA-28' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=${tf}&range=all`);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', expected);
  });
}

test('Ohne neue Kerze nach dem Kerzenschluss (Markt zu) ist die Box versteckt', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-price-clock', H1_LEFT);
  // The market stays closed: the clock moves past 15:00 broker time and no new candle comes
  await page.route(/\/api\/market\/[^/]+\/rates\?/, (route) => route.abort());
  await page.clock.fastForward('01:00:00');
  await expect(page.getByTestId('analysis-chart')).not.toHaveAttribute('data-price-clock', /.+/);
});

test('Nach dem Scrollen folgt die Uhr dem Preislabel (sichtbare letzte Kerze)', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-price-clock', ANY_LEFT);
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
  await expect(chart).toHaveAttribute('data-price-clock', ANY_LEFT);
});

test('Die Uhr tickt auch, wenn der Chart vor den Kerzen steht (späte Antwort)', { tag: '@ANA-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 900 });
  // The chart is built first, the candles come 1.5 s later: the clock starts with no data in the series
  await page.route(/\/api\/market\/[^/]+\/rates\?/, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fallback(); });
  await page.goto(URL);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-price-clock', ANY_LEFT);
  const first = await clock(page);
  await expect.poll(() => clock(page), { timeout: 5000 }).not.toBe(first);
});
