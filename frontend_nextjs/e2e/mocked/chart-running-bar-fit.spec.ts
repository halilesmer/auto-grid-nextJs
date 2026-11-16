import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { nowMs } from '../fixtures/mock-worker';

// 1116-A28.1: the formation search adds the running candle to the chart. When it comes after the first fit of the chart,
// lightweight-charts moves the view by one candle (`shiftVisibleRangeOnNewBar`), and the first candle leaves the view. A view
// that showed all candles must show all candles again, and the move must not be stored as a zoom of the user.
// The chart is H1: the M15 request belongs only to the formation search. Holding it holds back the running candle.
// Exception to `chartReady(page)` (.claude/rules/tests.md): these tests do not click at fixed pixels on drawings.
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

async function holdRunningCandle(page: Page) {
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(/\/api\/market\/[^/]+\/rates\?.*timeframe=M15/, async (route) => { await gate; await route.fallback(); });
  return release;
}
const rangeOf = (page: Page) => page.getByTestId('analysis-chart').getAttribute('data-visible-range');
async function savedZoom(page: Page) {
  const key = (await page.getByTestId('chart-workspace').getAttribute('data-context')) ?? '';
  return page.evaluate(([k, contextKey]) => {
    const zoom = JSON.parse(localStorage.getItem(k) || '{}').documents?.[contextKey]?.visibleTime;
    return zoom ? `${zoom.from},${zoom.to}` : null;
  }, [storageKey, key] as const);
}
/** The running candle is drawn and the search is finished (the price axis has its final width) */
async function runningCandleShown(page: Page) {
  await expect(page.locator('[data-last-price]')).toHaveCount(1);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}
/** A change of the look writes the candles again (`setData`): the chart reports its range once more */
async function changeLook(page: Page) {
  await page.getByTestId('workspace-settings').click();
  await page.getByTestId('chart-workspace-settings').getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
  await page.getByLabel(msg('cw.background'), { exact: true }).fill('#123456');
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
}
async function zoomIn(page: Page) {
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.wheel(0, -400);
}

test('Kommt die laufende Kerze nach dem ersten Einpassen, zeigt der Chart weiter alle Kerzen und speichert keinen Zoom', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker; // the mocked worker answers only when the test asks for it
  const release = await holdRunningCandle(page);
  await page.goto(URL);
  await expect.poll(() => rangeOf(page)).toMatch(/^\d+,\d+$/);
  const firstTime = (await rangeOf(page))!.split(',')[0];
  release();
  await runningCandleShown(page);
  await changeLook(page);
  await page.waitForTimeout(500); // the chart stores a zoom 180 ms after the last change of the range
  const shown = await rangeOf(page);
  expect.soft(shown!.split(',')[0]).toBe(firstTime); // the first candle stays in the view
  expect.soft(await savedZoom(page)).toBeNull(); // the move of the library is no zoom of the user
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.fit'), exact: true }).click();
  await page.waitForTimeout(300);
  expect(await rangeOf(page)).toBe(shown); // "fit" shows the same range
  expect(await savedZoom(page)).toBeNull();
});

test('Hat der Nutzer gezoomt, ändert die laufende Kerze weder die Ansicht noch den gespeicherten Zoom', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  const release = await holdRunningCandle(page);
  await page.goto(URL);
  await expect.poll(() => rangeOf(page)).toMatch(/^\d+,\d+$/);
  const fitRange = await rangeOf(page);
  await page.waitForTimeout(500);
  await zoomIn(page);
  await expect.poll(() => rangeOf(page)).not.toBe(fitRange);
  const zoomed = await rangeOf(page);
  await expect.poll(() => savedZoom(page)).toBe(zoomed);
  release();
  await runningCandleShown(page);
  await page.waitForTimeout(500);
  expect(await rangeOf(page)).toBe(zoomed);
  expect(await savedZoom(page)).toBe(zoomed);
});

test('Eine neue Live-Kerze (Stream) hält die Ansicht ebenfalls bei allen Kerzen', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // Fixed series up to the current hour; the candle of the current hour is the running one (`live_from`), so the chart leaves it
  // out and shows the closed candles only. The first live price adds the running candle on the right.
  const latest = Math.floor((nowMs() / 1000 + worker.state.brokerOffset) / 3600) * 3600;
  const series = Array.from({ length: 121 }, (_, i) => [latest - (120 - i) * 3600, 1 + i * .0001, 1.002 + i * .0001, .999 + i * .0001, 1.001 + i * .0001]);
  worker.state.ratesSeries = { H1: series };
  worker.state.ratesLive = { H1: latest };
  await holdRunningCandle(page); // the running candle of the search stays out: the new candle comes only from the stream
  await page.goto(URL);
  await expect.poll(() => rangeOf(page)).toBe(`${series[0][0]},${series[119][0]}`);
  await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
  const close = series[119][4];
  await expect.poll(async () => {
    worker.pushMetrics({ account_id: DEMO_ID, symbol: 'EURUSD', price: close, market_open: true });
    return page.getByTestId('analysis-chart').getAttribute('data-last-bar');
  }).toBe(`${latest}:${close}`);
  await page.waitForTimeout(500);
  expect(await rangeOf(page)).toBe(`${series[0][0]},${latest}`); // the first candle stays in the view, the new one is in it too
  expect(await savedZoom(page)).toBeNull();
});
