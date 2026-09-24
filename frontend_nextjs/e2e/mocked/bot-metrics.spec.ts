/** BOT-04 Statusanzeige + Alarme · MET · Kennzahlenleiste und Chart. */
import { DEMO_ID, expect, test } from '../fixtures/test';

test.describe('BOT Status und Alarme', () => {
  test('Start: Connecting → Running, Stop mit Rückfrage', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.setMetrics(DEMO_ID, { market_open: false });
    await dashboard.open(DEMO_ID);
    const controls = page.getByTestId('bot-controls');
    await expect(dashboard.botStatus).toHaveText('Stopped');
    await expect(controls).toContainText('Market Closed');
    worker.setMetrics(DEMO_ID, { market_open: true });

    await controls.getByRole('button', { name: 'Start Bot' }).click();
    // Während des Verbindens pollt das Dashboard alle 2 s und wechselt dann auf „Running“
    await expect(dashboard.botStatus).toHaveText('Running', { timeout: 8_000 });
    await expect(controls).toContainText('Market Open');
    expect(worker.callsTo('POST', '/api/start')[0].query.get('account_id')).toBe(DEMO_ID);
    await expect(dashboard.logOutput).toContainText('Bot connected to MT5 – running.');

    await controls.getByRole('button', { name: 'Stop Bot' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Open positions and pending orders are preserved');
    await modal.getByRole('button', { name: 'Disconnect' }).click();
    await expect(dashboard.logOutput).toContainText('Bot stopped. Positions and pending orders stay at the broker.');
    await dashboard.refreshLogs();
    await expect(dashboard.botStatus).toHaveText('Stopped');
  });

  test('Start-Fehler wird angezeigt', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.overrides.set('POST /api/start', {
      status: 500,
      body: { detail: 'MT5 Connection Failed: Authorization failed' },
    });
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: 'Start Bot' }).click();
    await expect(page.getByTestId('bot-controls').getByRole('alert')).toContainText('Authorization failed');
    await expect(dashboard.botStatus).toHaveText('Stopped');
  });

  test('Alarme: Algo Trading aus, abgelehnte Order, Startfehler', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { algo_trading_error: true });
    await dashboard.open(DEMO_ID);
    const controls = page.getByTestId('bot-controls');
    await expect(controls.getByRole('alert')).toContainText('Algo Trading is off');

    worker.setMetrics(DEMO_ID, { algo_trading_error: false, order_rejected_alarm: true, last_error: 'Invalid volume (10014)' });
    await dashboard.refreshLogs();
    await expect(controls.getByText('Algo Trading is off')).toBeHidden();
    await expect(controls.getByRole('alert')).toContainText('Order rejected by MT5/Broker');
    await expect(controls.getByRole('alert')).toContainText('Invalid volume (10014)');

    // Bot-Prozess beendet, weil MT5 die Anmeldung abgelehnt hat
    worker.setBotRunning(DEMO_ID, false);
    worker.setMetrics(DEMO_ID, { order_rejected_alarm: false, last_error: null, startup_error: 'Authorization failed' });
    await dashboard.refreshLogs();
    await expect(controls.getByRole('alert')).toContainText('MT5 connection failed');
    await expect(controls.getByRole('alert')).toContainText('Authorization failed');
  });

  test('Bot-Prozess ohne MT5-Verbindung bietet Neustart und Stopp', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { mt5_connected: false });
    await dashboard.open(DEMO_ID);
    await expect(dashboard.botStatus).toHaveText('Bot process running – not connected to MT5');
    const controls = page.getByTestId('bot-controls');
    await expect(controls.getByRole('button', { name: 'Restart Bot' })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Stop Bot' })).toBeVisible();
  });
});

test.describe('MET Live-Daten', () => {
  test('Kennzahlenleiste zeigt und aktualisiert die Werte', { tag: '@MET-01' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('metric-price')).toHaveAttribute('data-value', '$97.25');
    await expect(page.getByTestId('metric-profit')).toHaveAttribute('data-value', '-$12.50');
    await expect(page.getByTestId('metric-positions')).toHaveAttribute('data-value', '3');
    await expect(page.getByTestId('metric-pending')).toHaveAttribute('data-value', '4');
    await expect(page.getByTestId('metric-profit')).toContainText('Live from MT5');
    await expect(page.getByTestId('metric-price')).toContainText('Market open');

    worker.setMetrics(DEMO_ID, { current_price: 98.5, profit: 4.2, open_positions: 5 });
    await dashboard.refreshLogs();
    await expect(page.getByTestId('metric-price')).toHaveAttribute('data-value', '$98.50');
    await expect(page.getByTestId('metric-profit')).toHaveAttribute('data-value', '+$4.20');
    await expect(page.getByTestId('metric-positions')).toHaveAttribute('data-value', '5');

    worker.setBotRunning(DEMO_ID, false);
    await dashboard.refreshLogs();
    await expect(page.getByTestId('metric-profit')).toContainText('Engine stopped');
  });

  test('Chart zeigt Preis, RSI, P/L und Positionen aus dem Stream', { tag: '@MET-02' }, async ({ page, worker }) => {
    await page.goto('/formasyon');
    await expect.poll(() => worker.openSockets).toBe(1);
    await expect(page.getByTestId('chart-stat-rsi')).toContainText('--');

    worker.pushMetrics({ price: 97.25, rsi: 55.123, profit: 3.5, open_positions: 2 });
    await expect(page.getByTestId('chart-stat-price')).toContainText('97.25');
    await expect(page.getByTestId('chart-stat-rsi')).toContainText('55.12');
    await expect(page.getByTestId('chart-stat-pl')).toContainText('$3.50');
    await expect(page.getByTestId('chart-stat-positions')).toContainText('2');
    // lightweight-charts zeichnet in <canvas>
    await expect(page.locator('canvas').first()).toBeVisible();

    // Metrik-Fallback ohne RSI (Bot-Datei): Chart bleibt stabil
    worker.pushMetrics({ price: 97.5, rsi: undefined });
    await expect(page.getByTestId('chart-stat-price')).toContainText('97.5');
  });
});
