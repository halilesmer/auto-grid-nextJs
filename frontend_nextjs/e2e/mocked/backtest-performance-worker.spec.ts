import type { CDPSession } from '@playwright/test';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
import { E2E_API_KEY, MOCK_API } from '../fixtures/env';
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const FIRST = 1704067200;
const CANDLES = Number(process.env.BKT_PROFILE_CANDLES ?? 10000);

interface Measurement {
  started: number;
  runStarted: number | null;
  finished: number | null;
  progress: number;
  heartbeats: number;
  runHeartbeats: number;
  maxHeartbeatGap: number;
  terminated: boolean;
  result: { candles: number; trades: number; counts: Record<string, number>; dropped: number; equity: number } | null;
  error: string | null;
}

// Playwright exposes a CDP session for pages only. Route the documented child-session protocol to the worker.
async function workerProtocol(root: CDPSession, url: string) {
  const { targetInfos } = await root.send('Target.getTargets');
  const target = targetInfos.find((info: { type: string; url: string }) => info.type === 'worker' && info.url === url);
  if (!target) throw new Error('Backtest worker target missing');
  const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  root.on('Target.receivedMessageFromTarget', (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
    else callback.resolve(message.result);
  });
  return async (method: string, params: Record<string, unknown> = {}) => {
    const id = ++nextId;
    const response = new Promise<Record<string, unknown>>((resolve, reject) => pending.set(id, { resolve, reject }));
    await root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  };
}

for (const cancel of [false, true]) {
  test(cancel ? 'Aktive Grid-Zone: Abbruch während der Simulation beendet den echten Worker' : 'Aktive Grid-Zone: echter Worker bleibt bedienbar und liefert Trades', { tag: '@BKT-04' }, async ({ page, worker, browser }, testInfo) => {
    test.setTimeout(CANDLES > 10000 ? 1200000 : 90000);
    worker.setZones(DEMO_ID, [makeZone({ order_type: 'BOTH', grid_step: 0.1, take_profit: 0.2, stop_loss: 0.5, sell_grid_step: 0.1, sell_take_profit: 0.2, sell_stop_loss: 0.5, max_positions: 10 })]);
    let delivered = 0;
    await page.route(`${MOCK_API}/api/market/${DEMO_ID}/rates?*`, async (route) => {
      expect(route.request().headers()['x-api-key']).toBe(E2E_API_KEY);
      const query = new URL(route.request().url()).searchParams;
      const from = Math.max(FIRST, Number(query.get('from')));
      const end = Math.min(FIRST + CANDLES * 60, from + 50000 * 60);
      const cols = { t: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], s: [] as number[] };
      const mid = (i: number) => 100 + 1.5 * Math.sin(i / 90) + 0.2 * Math.sin(i / 7);
      for (let time = from; time < end; time += 60) {
        const i = (time - FIRST) / 60;
        const open = mid(i), close = mid(i + 1);
        cols.t.push(time);
        cols.o.push(Number(open.toFixed(3))); cols.c.push(Number(close.toFixed(3)));
        cols.h.push(Number((Math.max(open, close) + 0.06).toFixed(3)));
        cols.l.push(Number((Math.min(open, close) - 0.06).toFixed(3))); cols.s.push(20);
      }
      delivered += cols.t.length;
      await route.fulfill({ json: { ...cols, next_from: end < FIRST + CANDLES * 60 ? end : null, missing: [], live_from: null, digits: 3, point: 0.001 } });
    });
    await page.addInitScript(({ first, candles }) => {
      const measurement: Measurement = { started: 0, runStarted: null, finished: null, progress: 0, heartbeats: 0, runHeartbeats: 0, maxHeartbeatGap: 0, terminated: false, result: null, error: null };
      const NativeWorker = window.Worker;
      let startCurrent: (() => void) | null = null;
      let queued: RunRequest | null = null;
      let previous = performance.now();
      setInterval(() => {
        const now = performance.now();
        if (measurement.started && !measurement.finished && !measurement.terminated) {
          measurement.heartbeats++;
          if (measurement.runStarted !== null) measurement.runHeartbeats++;
          measurement.maxHeartbeatGap = Math.max(measurement.maxHeartbeatGap, now - previous);
        }
        previous = now;
      }, 50);
      Object.assign(window, { bktMeasurement: measurement, bktStart: () => {
        if (!startCurrent || !queued) throw new Error('No queued worker run');
        measurement.started = performance.now();
        startCurrent();
      } });
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          startCurrent = () => NativeWorker.prototype.postMessage.call(this, queued);
          this.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            if (message.type === 'progress' && message.phase === 'run') {
              measurement.runStarted ??= performance.now();
              measurement.progress = message.fraction;
            }
            if (message.type === 'result') {
              measurement.finished = performance.now();
              const result = message.results[0];
              measurement.result = { candles: result.candles, trades: result.trades.length, counts: result.log.counts, dropped: result.log.dropped, equity: result.equity.length };
            }
            if (message.type === 'error') measurement.error = message.code;
          });
        }
        override postMessage(request: RunRequest) {
          if (request.type === 'run') queued = { ...request, params: { ...request.params, from: first, to: first + candles * 60, path: 'lowFirst', swapEnabled: false } };
          else super.postMessage(request);
        }
        override terminate() { measurement.terminated = true; super.terminate(); }
      };
    }, { first: FIRST, candles: CANDLES });
    await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&from=2024-01-01&to=2024-01-07`);
    const created = page.waitForEvent('worker');
    await page.getByTestId('bt-run').click();
    const nativeWorker = await created;
    const root = await browser.newBrowserCDPSession();
    const send = await workerProtocol(root, nativeWorker.url());
    await nativeWorker.evaluate(() => {
      const timing = { started: 0, runStarted: 0, resultStarted: 0, resultPosted: 0 };
      Object.assign(self, { bktTiming: timing });
      const receive = self.onmessage;
      self.onmessage = function (event) {
        if (event.data.type === 'run') timing.started = performance.now();
        receive?.call(self, event);
      };
      const post = self.postMessage.bind(self);
      self.postMessage = (message: WorkerMessage) => {
        if (message.type === 'progress' && message.phase === 'run' && !timing.runStarted) timing.runStarted = performance.now();
        if (message.type === 'result') timing.resultStarted = performance.now();
        post(message);
        if (message.type === 'result') timing.resultPosted = performance.now();
      };
    });
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 1000 });
    const heap: Record<string, unknown>[] = [{ atMs: 0, ...await send('Runtime.getHeapUsage') }];
    await send('Profiler.start');
    await page.evaluate(() => (window as unknown as { bktStart: () => void }).bktStart());
    await expect.poll(() => page.evaluate(() => (window as unknown as { bktMeasurement: Measurement }).bktMeasurement.runStarted), { timeout: 90000 }).not.toBeNull();
    if (cancel) {
      await expect.poll(() => page.evaluate(() => (window as unknown as { bktMeasurement: Measurement }).bktMeasurement.progress), { timeout: 90000 }).toBeGreaterThan(0.3);
      const start = performance.now();
      await page.getByTestId('bt-cancel').click();
      await expect(page.getByTestId('bt-run')).toBeVisible();
      await expect(page.getByTestId('bt-result')).toHaveCount(0);
      const cancelMs = performance.now() - start;
      const measurement = await page.evaluate(() => (window as unknown as { bktMeasurement: Measurement }).bktMeasurement);
      expect(measurement.terminated).toBe(true);
      expect(measurement.result).toBeNull();
      await page.waitForTimeout(1000); // Nach terminate darf auch ein verspätetes Ergebnis nicht erscheinen.
      await expect(page.getByTestId('bt-result')).toHaveCount(0);
      const report = { browser: browser.version(), delivered, cancelMs, measurement };
      console.log('BKT_PROFILE', JSON.stringify(report));
      await testInfo.attach('bkt-profile.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      await root.detach();
      return;
    }
    const sampleStart = performance.now();
    await expect.poll(async () => {
      heap.push({ requestedAtMs: performance.now() - sampleStart, ...await send('Runtime.getHeapUsage'), atMs: performance.now() - sampleStart });
      return page.evaluate(() => (window as unknown as { bktMeasurement: Measurement }).bktMeasurement.finished);
    }, { timeout: 1100000, intervals: [5000] }).not.toBeNull();
    const timing = await nativeWorker.evaluate(() => (self as unknown as { bktTiming: { started: number; runStarted: number; resultStarted: number; resultPosted: number } }).bktTiming);
    const profile = await send('Profiler.stop');
    const measurement = await page.evaluate(() => (window as unknown as { bktMeasurement: Measurement }).bktMeasurement);
    expect(measurement.error).toBeNull();
    expect(delivered).toBe(CANDLES);
    expect(measurement.result?.candles).toBe(CANDLES);
    expect(measurement.result?.trades).toBeGreaterThan(CANDLES / 10);
    expect(measurement.result?.counts['zone.entered']).toBe(1);
    expect(measurement.heartbeats).toBeGreaterThan(5);
    expect(measurement.runHeartbeats).toBeGreaterThan(0);
    await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 90000 });
    expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
    const report = { browser: browser.version(), delivered, loadMs: timing.runStarted - timing.started, simulationMs: timing.resultStarted - timing.runStarted, resultSerializationMs: timing.resultPosted - timing.resultStarted, simulationAndDeliveryMs: measurement.finished! - measurement.runStarted!, heap, measurement };
    console.log('BKT_PROFILE', JSON.stringify(report));
    await testInfo.attach('bkt-profile.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    await testInfo.attach('worker.cpuprofile', { body: JSON.stringify(profile.profile), contentType: 'application/json' });
    await root.detach();
  });
}
