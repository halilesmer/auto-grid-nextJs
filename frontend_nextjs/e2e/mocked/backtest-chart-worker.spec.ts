import type { WorkerMessage, WorkerRequest } from '../../src/lib/backtest/protocol';
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test('Echter Web Worker: synthetisches Jahr, paginierte M1-Daten, Lücken und Chart-Anfragen', { tag: '@BKT-07' }, async ({ page, worker }) => {
  test.setTimeout(120000);
  // Außerhalb des synthetischen Kurses: Jahreslast ohne Millionen Grid-Ereignisse.
  worker.setZones(DEMO_ID, [makeZone({ min_price: 1000, max_price: 2000 })]);
  worker.state.ratesMissing = [{ from: 1766966400, to: 1767052800, reason: 'unavailable', checked_at: null }]; // 2025-12-29
  await page.addInitScript(() => {
    const traffic: { requests: WorkerRequest[]; messages: WorkerMessage[] } = { requests: [], messages: [] };
    Object.assign(window, { backtestTraffic: traffic });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event: MessageEvent<WorkerMessage>) => traffic.messages.push(event.data));
      }
      override postMessage(request: WorkerRequest) { traffic.requests.push(request); super.postMessage(request); }
    };
  });
  await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&from=2025-01-01&to=2025-12-31`);
  await page.getByTestId('bt-run').click();
  const chart = page.getByTestId('bt-chart');
  await expect(chart.getByTestId('analysis-chart')).toBeVisible({ timeout: 90000 });
  const count = Number(await chart.getAttribute('data-bars'));
  expect(count).toBeGreaterThan(30000);
  expect(count).toBeLessThanOrEqual(50000);
  await expect(chart.getByText(msg('backtest.chart.clipped'), { exact: true })).toBeVisible();
  await expect(chart.getByTestId('analysis-chart')).toHaveAttribute('data-gap-areas', '1');
  expect(worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`).length).toBeGreaterThan(10);
  const requestsBeforeReplay = worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`).length;
  await chart.getByRole('button', { name: msg('backtest.chart.restart'), exact: true }).click();
  await expect(chart).toHaveAttribute('data-bars', '1');
  const firstMinute = Number((await chart.getByTestId('analysis-chart').getAttribute('data-last-bar'))?.split(':')[0]);
  await chart.getByRole('tab', { name: 'H1', exact: true }).click();
  // H1 enthält auch ältere Kerzen, die im begrenzten M1-Fenster nicht angezeigt wurden.
  await expect(chart.getByTestId('analysis-chart')).toBeVisible();
  await expect(chart).toHaveAttribute('data-timeframe', 'H1');
  const lastHour = Number((await chart.getByTestId('analysis-chart').getAttribute('data-last-bar'))?.split(':')[0]);
  expect(lastHour + 3600).toBeLessThanOrEqual(firstMinute + 60);
  await expect(page.getByTestId('bt-sum-end-equity')).toHaveCount(0);
  await chart.getByRole('button', { name: msg('backtest.chart.finish'), exact: true }).click();
  await expect(chart.getByTestId('analysis-chart')).toBeVisible();
  const traffic = await page.evaluate(() => (window as unknown as {
    backtestTraffic: { requests: WorkerRequest[]; messages: WorkerMessage[] };
  }).backtestTraffic);
  const run = traffic.requests.find((request) => request.type === 'run')!;
  const bars = traffic.messages.filter((message) => message.type === 'bars');
  expect(bars.map((message) => [message.runId, message.requestId, message.timeframe])).toEqual([
    [run.runId, 1, 'M1'], [run.runId, 2, 'H1'],
  ]);
  expect(bars[0].bars.some((bar) => bar.time >= 1766966400 && bar.time < 1767052800)).toBe(false);
  expect(bars[1].bars.length).toBeLessThan(8760);
  expect(worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`)).toHaveLength(requestsBeforeReplay);
  expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
});
