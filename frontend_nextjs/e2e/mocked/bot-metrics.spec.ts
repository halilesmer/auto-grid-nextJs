/** BOT-04 Statusanzeige + Alarme · MET · Kennzahlenleiste und Chart. */
import { DEMO_ID, expect, test } from '../fixtures/test';
import { fmt, msg } from '../fixtures/i18n';

test.describe('BOT Status und Alarme', () => {
  test('Start: Connecting → Running, Stop mit Rückfrage', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const controls = page.getByTestId('bot-controls');
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.stopped'));

    await controls.getByRole('button', { name: msg('bot.start') }).click();
    // Während des Verbindens pollt das Dashboard alle 2 s und wechselt dann auf „Running“
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.running'), { timeout: 8_000 });
    expect(worker.callsTo('POST', '/api/start')[0].query.get('account_id')).toBe(DEMO_ID);
    await expect(dashboard.logOutput).toContainText(msg('bot.activity.connected'));

    await controls.getByRole('button', { name: msg('bot.stop') }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(msg('bot.disconnect.info'));
    await modal.getByRole('button', { name: msg('bot.disconnect.confirm') }).click();
    await expect(dashboard.logOutput).toContainText(msg('bot.activity.stopped'));
    await dashboard.refreshLogs();
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.stopped'));
  });

  test('Start-Fehler wird angezeigt', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.overrides.set('POST /api/start', {
      status: 500,
      body: { detail: 'MT5 Connection Failed: Authorization failed' },
    });
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('bot.start') }).click();
    await expect(page.getByTestId('bot-controls').getByRole('alert')).toContainText('Authorization failed');
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.stopped'));
  });

  test('Alarme: Algo Trading aus, abgelehnte Order, Startfehler', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { algo_trading_error: true });
    await dashboard.open(DEMO_ID);
    const controls = page.getByTestId('bot-controls');
    await expect(controls.getByRole('alert')).toContainText(msg('bot.alert.algoOff'));

    worker.setMetrics(DEMO_ID, { algo_trading_error: false, order_rejected_alarm: true, last_error: 'Invalid volume (10014)' });
    await dashboard.refreshLogs();
    await expect(controls.getByText(msg('bot.alert.algoOff'))).toBeHidden();
    await expect(controls.getByRole('alert')).toContainText(msg('bot.alert.orderRejected'));
    await expect(controls.getByRole('alert')).toContainText('Invalid volume (10014)');

    // Bot-Prozess beendet, weil MT5 die Anmeldung abgelehnt hat
    worker.setBotRunning(DEMO_ID, false);
    worker.setMetrics(DEMO_ID, { order_rejected_alarm: false, last_error: null, startup_error: 'Authorization failed' });
    await dashboard.refreshLogs();
    await expect(controls.getByRole('alert')).toContainText(msg('bot.alert.startupFailed'));
    await expect(controls.getByRole('alert')).toContainText('Authorization failed');
  });

  test('Bot-Prozess ohne MT5-Verbindung bietet Neustart und Stopp', { tag: '@BOT-04' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { mt5_connected: false });
    await dashboard.open(DEMO_ID);
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.processNoMt5'));
    const controls = page.getByTestId('bot-controls');
    await expect(controls.getByRole('button', { name: msg('bot.restart') })).toBeVisible();
    await expect(controls.getByRole('button', { name: msg('bot.stop') })).toBeVisible();
  });
});

test.describe('MET Live-Daten', () => {
  test('Kennzahlenleiste zeigt und aktualisiert die Werte', { tag: '@MET-01' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('metric-price')).toHaveAttribute('data-value', fmt().price(97.25, 3));
    // Zonen-Karte zeigt den Preis ihres Symbols (USOUSD, 3 Stellen)
    await expect(page.getByTestId('zone-price').first()).toHaveText(fmt().price(97.25, 3));
    await expect(page.getByTestId('metric-profit')).toHaveAttribute('data-value', fmt().money(-12.5));
    await expect(page.getByTestId('metric-positions')).toHaveAttribute('data-value', '3');
    await expect(page.getByTestId('metric-pending')).toHaveAttribute('data-value', '4');
    await expect(page.getByTestId('metric-profit')).toContainText(msg('metrics.live'));

    // Marktstatus gehört zur Zone (jedes Symbol hat eigene Handelszeiten)
    await expect(page.getByTestId('zone-market').first()).toHaveText(msg('zone.market.open'));
    // Hover zeigt die übliche Handelszeit
    await page.getByTestId('zone-market').first().hover();
    await expect(page.getByRole('tooltip')).toContainText('02:00–00:00');
    worker.setMetrics(DEMO_ID, { zone_market_open: { '0': false } });
    await dashboard.refreshLogs();
    await expect(page.getByTestId('zone-market').first()).toHaveText(msg('zone.market.closed'));

    worker.setMetrics(DEMO_ID, { current_price: 98.5, symbol_prices: { USOUSD: 98.5 }, profit: 4.2, open_positions: 5 });
    await dashboard.refreshLogs();
    await expect(page.getByTestId('metric-price')).toHaveAttribute('data-value', fmt().price(98.5, 3));
    await expect(page.getByTestId('metric-profit')).toHaveAttribute('data-value', fmt().money(4.2, true));
    await expect(page.getByTestId('metric-positions')).toHaveAttribute('data-value', '5');

    worker.setBotRunning(DEMO_ID, false);
    await dashboard.refreshLogs();
    await expect(page.getByTestId('metric-profit')).toContainText(msg('metrics.engineStopped'));
  });

  test('Chart zeigt Preis, RSI, P/L und Positionen aus dem Stream', { tag: '@MET-02' }, async ({ page, worker }) => {
    await page.goto('/formasyon');
    await expect.poll(() => worker.openSockets).toBe(1);
    await expect(page.getByTestId('chart-stat-rsi')).toContainText('--');

    worker.pushMetrics({ price: 97.25, rsi: 55.123, profit: 3.5, open_positions: 2 });
    await expect(page.getByTestId('chart-stat-price')).toContainText(fmt().number(97.25, { maximumFractionDigits: 8 }));
    await expect(page.getByTestId('chart-stat-rsi')).toContainText(fmt().number(55.123, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    await expect(page.getByTestId('chart-stat-pl')).toContainText(fmt().money(3.5));
    await expect(page.getByTestId('chart-stat-positions')).toContainText('2');
    // lightweight-charts zeichnet in <canvas>
    await expect(page.locator('canvas').first()).toBeVisible();

    // Metrik-Fallback ohne RSI (Bot-Datei): Chart bleibt stabil
    worker.pushMetrics({ price: 97.5, rsi: undefined });
    await expect(page.getByTestId('chart-stat-price')).toContainText(fmt().number(97.5));
  });
});
