import type { WorkerMessage, WorkerRequest } from '../../src/lib/backtest/protocol';
import type { RunResult } from '../../src/lib/backtest/runner';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

// Der Browser-Worker ist die externe Grenze. Feste Ereignisse prüfen die Anzeige
// unabhängig von der Engine; ein weiterer Test benutzt den echten Web Worker.
const result: RunResult = {
  path: 'lowFirst', candles: 200, avgRange: 1, missing: [],
  trades: [30, 60, 180].map((exitTime, i) => ({
    id: `t${i}`, positionId: i + 1, symbol: 'USOUSD', side: 'buy', volume: 0.1,
    entryTime: i === 2 ? 120 : 0, entryPrice: 70, exitTime, exitPrice: 71,
    exitTicket: i + 1, exitReason: 5, profit: 10, commission: 0, fee: 0, swap: 0, net: 10,
    partial: false, reversal: false, closeBy: false, magic: 200001,
    zone: { kind: 'zone', magic: 200001, label: null }, fractal: null,
  })),
  excursions: { t0: { ok: true, mfe: 1, mae: 0.2, mfePts: 100, maePts: 20, mfeMoney: 10, maeMoney: 2 } },
  equity: [{ time: 59, value: 10010 }, { time: 60, value: 99999 }, { time: 119, value: 10020 }, { time: 11999, value: 10030 }],
  summary: { realized: 30, openResult: 0, endEquity: 10030, startCapital: 10000,
    openPositions: 0, closedAtEnd: false, maxDrawdown: 0, trades: 3, commission: 0, swap: 0, spreadInfo: 0 },
  log: { lines: [{ level: 'INFO', code: 'run.marginNotChecked' }], counts: {}, dropped: 0 },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((template) => {
    class ReplayWorker {
      onmessage: ((event: { data: WorkerMessage }) => void) | null = null;
      runId = 0;
      from = 0;
      postMessage(request: WorkerRequest) {
        if (request.type === 'run') {
          this.runId = request.runId;
          this.from = request.params.from;
          const shift = (path: RunResult['path']) => ({ ...template, path,
            trades: template.trades.map((trade) => ({ ...trade, entryTime: (trade.entryTime ?? 0) + this.from, exitTime: trade.exitTime + this.from })),
            equity: template.equity.map((point) => ({ ...point, time: point.time + this.from })),
          });
          this.emit({ type: 'result', runId: this.runId, results: request.params.path === 'both'
            ? [shift('lowFirst'), shift('highFirst')] : [shift('lowFirst')] });
        } else {
          const sec = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 }[request.timeframe];
          const bars = Array.from({ length: Math.floor(12000 / sec) }, (_, i) => ({
            time: this.from + i * sec, open: 70, high: 71, low: 69, close: 70 + i / 100,
          }));
          this.emit({ type: 'bars', runId: this.runId, requestId: request.requestId, timeframe: request.timeframe, bars, missing: [], clipped: false });
        }
      }
      emit(data: WorkerMessage) { window.setTimeout(() => this.onmessage?.({ data }), 0); }
      terminate() { this.onmessage = null; }
    }
    window.Worker = ReplayWorker as unknown as typeof Worker;
  }, result);
});

async function openResult(page: import('@playwright/test').Page) {
  await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`);
  await page.getByTestId('bt-path').selectOption('both');
  await page.getByTestId('bt-run').click();
  await expect(page.getByTestId('bt-chart').first()).toHaveAttribute('data-bars', '200');
}

test('Replay verbirgt Endwerte und zukünftige Trades; Zeitrahmenwechsel behält die Grenze', { tag: '@BKT-07' }, async ({ page, worker }) => {
  void worker;
  await openResult(page);
  const chart = page.getByTestId('bt-chart').first();
  await chart.getByRole('button', { name: msg('backtest.chart.restart'), exact: true }).click();
  await expect(chart).toHaveAttribute('data-bars', '1');
  await expect(chart.getByTestId('trade-row')).toHaveCount(1); // 30 ist vor 60; 60 ist die nächste Kerze
  await expect(page.getByTestId('bt-sum-end-equity')).toHaveCount(0);
  await expect(page.getByTestId('stats-kpis')).toHaveCount(0);
  await expect(page.getByTestId('bt-curves')).toHaveCount(0);
  await expect(page.getByTestId('bt-log')).toHaveCount(0);
  await expect(page.getByTestId('bt-chart')).toHaveCount(1);
  await expect(chart.getByTestId('analysis-chart')).toHaveAttribute('data-markers', '3'); // zwei bekannte Einstiege und ein Ausstieg
  const firstTime = Number((await chart.getByTestId('analysis-chart').getAttribute('data-last-bar'))?.split(':')[0]);
  await expect(chart.getByTestId('analysis-chart')).toHaveAttribute('data-last-equity', `${firstTime + 59}:10010`);
  await expect(chart.getByTestId('analysis-chart')).toHaveAttribute('data-last-balance', `${firstTime + 59}:10010`);
  await expect(page.getByTestId('bt-comparison')).toHaveCount(0);
  await expect(chart.getByTestId('mfe-compute')).toHaveCount(0);
  await expect(chart.getByTestId('trade-mfe')).toContainText('100');

  await chart.getByRole('tab', { name: 'M5', exact: true }).click();
  await expect(chart).toHaveAttribute('data-timeframe', 'M5');
  await expect(chart).toHaveAttribute('data-bars', '0'); // M5 ist bei Sekunde 60 noch nicht abgeschlossen
  await expect(chart.getByTestId('trade-row')).toHaveCount(1);
  await expect(page.getByTestId('bt-sum-end-equity')).toHaveCount(0);
  await chart.getByRole('tab', { name: 'M1', exact: true }).click();
  await expect(chart).toHaveAttribute('data-bars', '1');
  await chart.getByRole('button', { name: msg('backtest.chart.finish'), exact: true }).click();
  await expect(page.getByTestId('bt-chart')).toHaveCount(2);
  await expect(page.getByTestId('bt-sum-end-equity')).toHaveCount(2);
  await expect(page.getByTestId('bt-comparison')).toBeVisible();
});

for (const [speed, count, milliseconds] of [['1', '2', 1000], ['5', '6', 1000], ['10', '11', 1000], ['max', '101', 100]] as const) {
  test(`Replay ${speed}: Zeitsteuerung, Pause und Neustart`, { tag: '@BKT-07' }, async ({ page, worker }) => {
    void worker;
    await openResult(page);
    const chart = page.getByTestId('bt-chart').first();
    await chart.getByRole('button', { name: msg('backtest.chart.restart'), exact: true }).click();
    await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-09T12:00:01Z'));
    await chart.getByRole('tab', { name: speed === 'max' ? msg('backtest.chart.speed.max') : `${speed}×`, exact: true }).click();
    await chart.getByRole('button', { name: msg('backtest.chart.play'), exact: true }).click();
    await page.clock.runFor(milliseconds);
    await expect(chart).toHaveAttribute('data-bars', count);
    await chart.getByRole('button', { name: msg('backtest.chart.pause'), exact: true }).click();
    await page.clock.runFor(2000);
    await expect(chart).toHaveAttribute('data-bars', count);
    await chart.getByRole('button', { name: msg('backtest.chart.restart'), exact: true }).click();
    await expect(chart).toHaveAttribute('data-bars', '1');
  });
}

test('Max erreicht das Ende, hält an und startet wieder bei der ersten Kerze', { tag: '@BKT-07' }, async ({ page, worker }) => {
  void worker;
  await openResult(page);
  const chart = page.getByTestId('bt-chart').first();
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-09T12:00:01Z'));
  await chart.getByRole('tab', { name: msg('backtest.chart.speed.max'), exact: true }).click();
  await chart.getByRole('button', { name: msg('backtest.chart.play'), exact: true }).click();
  await page.clock.runFor(100);
  await expect(chart).toHaveAttribute('data-bars', '101');
  await page.clock.runFor(100);
  await expect(chart).toHaveAttribute('data-bars', '200');
  await expect(chart.getByRole('button', { name: msg('backtest.chart.play'), exact: true })).toBeVisible();
  await expect(page.getByTestId('bt-sum-end-equity')).toHaveCount(0);
  await chart.getByRole('button', { name: msg('backtest.chart.play'), exact: true }).click();
  await expect(chart).toHaveAttribute('data-bars', '1');
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 375]) {
    test(`Replay-Bedienung ${theme}, ${width}px bleibt sichtbar`, { tag: '@BKT-07' }, async ({ page, worker }, testInfo) => {
      void worker;
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme }, version: 0 })), theme);
      await openResult(page);
      const chart = page.getByTestId('bt-chart').first();
      await chart.getByRole('button', { name: msg('backtest.chart.restart'), exact: true }).click();
      const finish = chart.getByRole('button', { name: msg('backtest.chart.finish'), exact: true });
      await expect(finish).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await finish.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`replay-${theme}-${width}.png`) });
    });
  }
}
