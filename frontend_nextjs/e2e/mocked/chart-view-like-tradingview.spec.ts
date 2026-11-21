import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { nowMs } from '../fixtures/mock-worker';
import { dragLeft } from '../fixtures/chart-older';

// 1118-A5.1 = B and 1118-A2.1 = B (Halil, 2026-11-18: "Trading View nasıl yapıyorsa biz de öyle yapalım."):
// - Each opening of the chart shows the latest candles at the default bar spacing of lightweight-charts (6 px), scrolled to
//   the last candle. The zoom is not stored and does not come back after a reload. "Reset view" goes back to this view.
// - A range in the top bar fits that range one time; it is not a mode. A new candle on the right then moves the view by one
//   candle (`shiftVisibleRangeOnNewBar`), the chart does not fit all candles again.
// Journal 2026-11-18-chart-view-like-tradingview. The chart is H1: the M15 request belongs only to the formation search;
// holding it holds back the running candle of the search.
// Exception to `chartReady(page)` (.claude/rules/tests.md): these tests do not click at fixed pixels on drawings.
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`;
const storageKey = 'grid-robot-chart-workspaces-v1';
/** Default bar spacing of lightweight-charts (`timeScale.barSpacing`) */
const DEFAULT_BAR_SPACING = 6;
test.setTimeout(60_000);
// Fixed weekday clock (Wednesday, market open): at the weekend the mock has no running candle and no last price.
test.use({ fakeNow: '2026-11-18T12:00:00Z' });
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

async function holdRunningCandle(page: Page) {
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(/\/api\/market\/[^/]+\/rates\?.*timeframe=M15/, async (route) => { await gate; await route.fallback(); });
  return release;
}
const rangeOf = async (page: Page) => {
  const text = await page.getByTestId('analysis-chart').getAttribute('data-visible-range');
  return text ? text.split(',').map(Number) as [number, number] : null;
};
/** No document of the chart holds a stored view (the field of the old decision of 2026-10-31) */
const storedViews = (page: Page) => page.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k) || '{}').documents ?? {}).filter((d) => !!(d as { visibleTime?: unknown }).visibleTime).length, storageKey);
/** Number of candle slots in the view, at H1 */
const slots = (range: [number, number]) => (range[1] - range[0]) / 3600 + 1;
/** The view shows the default bar spacing: the chart width less the price axis, divided by 6 px */
async function expectDefaultSpacing(page: Page, range: [number, number]) {
  const width = (await page.getByTestId('analysis-chart').boundingBox())!.width;
  expect(slots(range)).toBeLessThanOrEqual(width / DEFAULT_BAR_SPACING + 1);
  expect(slots(range)).toBeGreaterThanOrEqual((width - 200) / DEFAULT_BAR_SPACING);
}
async function zoomIn(page: Page) {
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.wheel(0, -400);
}
/**
 * `closed` H1 candles up to the hour before the current hour, then the candle of the current hour (`latest`). The mock sends it as
 * the running one (`live_from`): the chart leaves it out of its series; the formation search adds it as its running candle, or the
 * stream adds a live candle at `latest`.
 */
function hourSeries(worker: { state: { brokerOffset: number; ratesSeries?: unknown; ratesLive?: unknown } }, closed: number) {
  const latest = Math.floor((nowMs() / 1000 + worker.state.brokerOffset) / 3600) * 3600;
  const series = Array.from({ length: closed + 1 }, (_, i) => [latest - (closed - i) * 3600, 1 + i * .0001, 1.002 + i * .0001, .999 + i * .0001, 1.001 + i * .0001]);
  worker.state.ratesSeries = { H1: series };
  worker.state.ratesLive = { H1: latest };
  return { latest, series, lastClosed: series[closed - 1] };
}

/** Logical range of the view (candle index): the gap on the right is `to - index of the last candle` */
const logicalOf = async (page: Page) => {
  const text = await page.getByTestId('analysis-chart').getAttribute('data-visible-logical');
  return text ? text.split(',').map(Number) as [number, number] : null;
};

test('Son mumun sağında 10 mumluk boşluk var; yeni canlı mumdan, sıfırlamadan ve aralık seçiminden sonra da', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // 1119-A1.1 = B (Halil, 2026-11-19): `rightOffset` 10. 1000 closed candles: indexes 0..999, the last closed candle has index 999.
  const { latest, lastClosed: [lastClosed, , , , close] } = hourSeries(worker, 1000);
  await holdRunningCandle(page); // the new candle comes only from the stream
  await page.goto(URL);
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(lastClosed);
  await expect.poll(async () => (await logicalOf(page))?.[1]).toBeCloseTo(999 + 10, 0);
  // A new live candle: the view moves by one candle, the gap stays 10 (last index 1000)
  await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
  await expect.poll(async () => {
    worker.pushMetrics({ account_id: DEMO_ID, symbol: 'EURUSD', price: close, market_open: true });
    return page.getByTestId('analysis-chart').getAttribute('data-last-bar');
  }).toBe(`${latest}:${close}`);
  await expect.poll(async () => (await logicalOf(page))?.[1]).toBeCloseTo(1000 + 10, 0);
  // Zoom and reset view: back to the gap of 10
  await page.waitForTimeout(300);
  await zoomIn(page);
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.fit'), exact: true }).click();
  await expect.poll(async () => (await logicalOf(page))?.[1]).toBeCloseTo(1000 + 10, 0);
  // A range in the top bar fits all candles and keeps the gap of 10 on the right (as TradingView)
  await page.getByTestId('range-trigger').click();
  await page.getByTestId('range-preset-last7').click();
  await expect.poll(async () => { const l = await logicalOf(page); return l && [Math.round(l[0]) + 0, Math.round(l[1])]; }).toEqual([0, 1010]); // + 0: a start of -1e-12 rounds to -0, which toEqual tells apart from 0
});

test('Açılışta son mumlar varsayılan genişlikte görünür, zoom saklanmaz ve yeniden yüklemede geri gelmez', { tag: '@ANA-19' }, async ({ page, worker }) => {
  const { latest, series, lastClosed: [lastClosed] } = hourSeries(worker, 1000);
  const release = await holdRunningCandle(page);
  await page.goto(URL);
  // (a) The last candle is in the view, the first candle is not (1000 candles do not fit at 6 px)
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(lastClosed);
  const opened = (await rangeOf(page))!;
  expect(opened[0]).toBeGreaterThan(series[0][0]);
  await expectDefaultSpacing(page, opened);
  // The running candle of the search comes after the first view: the view keeps the width and moves to the new last candle
  release();
  await expect(page.locator('[data-last-price]')).toHaveCount(1);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  const running = Number((await page.locator('[data-last-price]').getAttribute('data-last-price'))!.split(':')[0]);
  expect(running).toBe(latest);
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(running);
  const shown = (await rangeOf(page))!;
  // Same width: at the end of the search the price axis gets a few pixels wider (journal 2026-11-16-chart-refit-on-running-candle,
  // 2 px), the time scale keeps the bar spacing and shows one candle less at most
  expect(Math.abs(slots(shown) - slots(opened))).toBeLessThanOrEqual(1);
  // Zoom in: the view changes, nothing is stored
  await page.waitForTimeout(300);
  await zoomIn(page);
  await expect.poll(async () => slots((await rangeOf(page))!)).toBeLessThan(slots(shown));
  await page.waitForTimeout(500);
  expect(await storedViews(page)).toBe(0);
  // "Reset view" goes back to the opening view
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.fit'), exact: true }).click();
  await expect.poll(() => rangeOf(page)).toEqual(shown);
  // Zoom again, then reload: the zoom does not come back
  await zoomIn(page);
  await expect.poll(async () => slots((await rangeOf(page))!)).toBeLessThan(slots(shown));
  // A view stored by the old code (decision of 2026-10-31) is not read either
  const key = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
  await page.evaluate(([k, contextKey, from, to]) => {
    const saved = JSON.parse(localStorage.getItem(k as string) || '{}');
    saved.documents = { ...saved.documents, [contextKey]: { ...saved.documents?.[contextKey], visibleTime: { from, to } } };
    localStorage.setItem(k as string, JSON.stringify(saved));
  }, [storageKey, key, series[0][0], series[50][0]] as const);
  await page.reload();
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(running);
  const reloaded = (await rangeOf(page))!;
  expect(reloaded[0]).toBeGreaterThan(series[50][0]);
  await expectDefaultSpacing(page, reloaded);
});

test('Bir zaman aralığı seçmek onu bir kez sığdırır; yeni canlı mum görünümü bir mum kaydırır, yeniden sığdırmaz', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // 600 candles: they do not fit at 6 px, but they fit when the range is chosen (about 2 px each).
  // The candle of the current hour is the running one (`live_from`): the chart shows the closed candles, the first live
  // price adds the running candle on the right.
  const { latest, series, lastClosed: [lastClosed, , , , close] } = hourSeries(worker, 600);
  await holdRunningCandle(page); // the running candle of the search stays out: the new candle comes only from the stream
  await page.goto(URL);
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(lastClosed);
  expect((await rangeOf(page))![0]).toBeGreaterThan(series[0][0]);
  // The same range again in the top bar: it fits all candles one time
  await page.getByTestId('range-trigger').click();
  await page.getByTestId('range-preset-last7').click();
  await expect.poll(() => rangeOf(page)).toEqual([series[0][0], lastClosed]);
  await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
  await expect.poll(async () => {
    worker.pushMetrics({ account_id: DEMO_ID, symbol: 'EURUSD', price: close, market_open: true });
    return page.getByTestId('analysis-chart').getAttribute('data-last-bar');
  }).toBe(`${latest}:${close}`);
  // (b) The view moves by one candle: the first candle leaves the view, the new one is in it; no new fit
  await expect.poll(() => rangeOf(page)).toEqual([series[1][0], latest]);
  await page.waitForTimeout(500);
  expect(await rangeOf(page)).toEqual([series[1][0], latest]);
  expect(await storedViews(page)).toBe(0);
});

test('Aynı aralık ikinci kez seçilince yine bir kez sığdırır (arada zoom)', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // Review finding of this PR: the number of the fit request started again at 1 after each fit, so the second choice did nothing
  const { series, lastClosed: [lastClosed] } = hourSeries(worker, 600);
  await holdRunningCandle(page);
  await page.goto(URL);
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(lastClosed);
  for (let round = 0; round < 2; round++) {
    await page.getByTestId('range-trigger').click();
    await page.getByTestId('range-preset-last7').click();
    await expect.poll(() => rangeOf(page)).toEqual([series[0][0], lastClosed]);
    await page.waitForTimeout(300);
    await zoomIn(page);
    await expect.poll(async () => (await rangeOf(page))![0]).toBeGreaterThan(series[0][0]);
  }
});

test('Son mumdan uzaktaki görünüm yeni mumla kaymaz', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // Library default (shiftVisibleRangeOnNewBar): the view moves with a new candle only when the last candle is in the view.
  // Replaces test 2 of PR 584 ("the user zoomed, the running candle changes neither the view nor the stored zoom") without the store
  const { latest, lastClosed: [lastClosed] } = hourSeries(worker, 1000);
  const release = await holdRunningCandle(page);
  await page.goto(URL);
  await expect.poll(async () => (await rangeOf(page))?.[1]).toBe(lastClosed);
  await page.waitForTimeout(300);
  await dragLeft(page);
  await expect.poll(async () => (await rangeOf(page))![1]).toBeLessThan(lastClosed);
  const away = (await rangeOf(page))!;
  release();
  await expect(page.locator('[data-last-price]')).toHaveCount(1);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  expect(Number((await page.locator('[data-last-price]').getAttribute('data-last-price'))!.split(':')[0])).toBe(latest);
  await page.waitForTimeout(500);
  const after = (await rangeOf(page))!;
  // The right edge stays; at the end of the search the price axis gets a few pixels wider, the left edge moves by one candle at most
  expect(after[1]).toBe(away[1]);
  expect(Math.abs(after[0] - away[0])).toBeLessThanOrEqual(3600);
});

test('Kurulum bölgesi grafikten sonra gelince grafik yeniden kurulmaz, zoom kaybolmaz', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // 1119-A11.1 = B: `notes` exist only with a setup zone; they must not rebuild the chart. The settings answer comes late.
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(new RegExp(`/api/settings/${DEMO_ID}$`), async (route) => { await gate; await route.fallback(); });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=USOUSD&tf=M15&range=last7`);
  const chart = page.getByTestId('analysis-chart');
  await expect.poll(async () => (await logicalOf(page))?.[1]).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await zoomIn(page);
  await expect.poll(async () => slots((await rangeOf(page))!)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const zoomed = await logicalOf(page);
  const builds = await chart.getAttribute('data-chart-builds');
  release();
  // The zone arrives: the setup card shows the symbol zone
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect.poll(() => worker.callsTo('GET', `/api/settings/${DEMO_ID}`).length).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(await chart.getAttribute('data-chart-builds')).toBe(builds);
  expect(await logicalOf(page)).toEqual(zoomed);
});
