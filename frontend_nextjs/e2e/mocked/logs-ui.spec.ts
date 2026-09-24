/** LOG · Logs und Worker-Status · UI · Navigation, Theme, PWA, Zonen-Test-Link. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

test.describe('LOG Logs', () => {
  test('Tabs zeigen Robot- und MT5-Log', { tag: '@LOG-01' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Robot Logs' }).click();
    await expect(dashboard.logOutput).toContainText('[START] Bot gestartet');
    await expect(dashboard.logOutput).toContainText('3 emir yerleştirildi');

    await page.getByRole('tab', { name: 'MT5 Terminal' }).click();
    await expect(dashboard.logOutput).toContainText('buy limit 0.01 USOUSD at 96.750');

    const [call] = worker.callsTo('GET', `/api/logs/${DEMO_ID}`);
    expect(call.query.get('log_type')).toBe('all');
  });

  test('Logs löschen', { tag: '@LOG-02' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('tab', { name: 'Robot Logs' }).click();
    await expect(dashboard.logOutput).toContainText('Bot gestartet');
    const clear = page.getByTitle('Clear all logs');

    const confirm = page.getByRole('dialog').filter({ hasText: 'Logları Temizle' });

    // Abbrechen: nichts wird gelöscht
    await clear.click();
    await expect(confirm).toContainText('logları temizlemek');
    await confirm.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(confirm).toBeHidden();
    expect(worker.callsTo('DELETE', `/api/logs/${DEMO_ID}`)).toHaveLength(0);

    await clear.click();
    await confirm.getByRole('button', { name: 'Temizle', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(dashboard.logOutput).toHaveText('No log entries yet...');
    await dashboard.refreshLogs();
    await expect(dashboard.logOutput).toHaveText('No log entries yet...');
    expect(worker.callsTo('DELETE', `/api/logs/${DEMO_ID}`)).toHaveLength(1);

    // Activity-Tab leert nur die Anzeige, ohne Worker-Aufruf
    await page.getByRole('tab', { name: 'Activity' }).click();
    await page.getByTitle('Clear activity').click();
    await expect(dashboard.logOutput).toContainText('No activity yet');
    expect(worker.callsTo('DELETE', `/api/logs/${DEMO_ID}`)).toHaveLength(1);
  });

  test('Logs als ZIP herunterladen', { tag: '@LOG-03' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const download = page.waitForEvent('download');
    await page.getByTitle('Download log file').click();
    expect((await download).suggestedFilename()).toBe(`MT5_Logs_and_Configs_${DEMO_ID}.zip`);
    await expect(dashboard.logOutput).toContainText('Log archive downloaded');
  });

  test('Worker-Status: online, offline nach dem nächsten Polling, wieder online', { tag: '@LOG-04' }, async ({ page, worker, dashboard }) => {
    test.slow(); // wartet einen echten 10-s-Polling-Zyklus ab
    await dashboard.open(DEMO_ID);
    const status = page.getByTestId('worker-status');
    await expect(status).toContainText('Worker online · updated');
    await expect(page.getByText(`${DEMO_ID} · refresh 10s`)).toBeVisible();

    worker.offline = true;
    await expect(status).toHaveText('Worker offline', { timeout: 15_000 });
    await expect(page.getByText('worker not reachable (VPS or ngrok offline?)').first()).toBeVisible();

    worker.offline = false;
    await dashboard.refreshLogs();
    await expect(status).toContainText('Worker online');
    await expect(dashboard.logOutput).toContainText('Connection to worker restored.');
  });
});

test.describe('UI Oberfläche', () => {
  test('Navigation und Version', { tag: '@UI-01' }, async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('link', { name: 'Formasyon' }).click();
    await expect(page).toHaveURL(/\/formasyon$/);
    await expect(page.getByRole('heading', { name: 'Formasyon Grafiği' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Formasyon' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current', 'page');

    const version = readFileSync(path.join(__dirname, '../../../VERSION'), 'utf-8').trim();
    await expect(nav).toContainText(version);
  });

  test('Theme hell / dunkel / System bleibt erhalten', { tag: '@UI-02' }, async ({ page }) => {
    // Theme-Klasse vor dem ersten Rendern festhalten (kein helles Aufblitzen im Dunkelmodus)
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __darkAtLoad: boolean }).__darkAtLoad =
          document.documentElement.classList.contains('dark');
      });
    });
    const html = page.locator('html');
    const darkAtLoad = () => page.evaluate(() => (window as unknown as { __darkAtLoad: boolean }).__darkAtLoad);
    const theme = page.getByRole('radiogroup', { name: 'Tema' });

    await page.goto('/');
    await expect(html).toHaveClass(/\bdark\b/); // Standard: dunkel
    await theme.getByRole('radio', { name: 'Açık' }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);

    await page.reload();
    expect(await darkAtLoad()).toBe(false);
    await expect(theme.getByRole('radio', { name: 'Açık' })).toHaveAttribute('aria-checked', 'true');

    await theme.getByRole('radio', { name: 'Koyu' }).click();
    await page.reload();
    expect(await darkAtLoad()).toBe(true);

    // System folgt dem Betriebssystem, auch bei Wechsel zur Laufzeit
    await page.emulateMedia({ colorScheme: 'light' });
    await theme.getByRole('radio', { name: 'Sistem' }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test.describe('PWA', () => {
    test.use({ serviceWorkers: 'allow' });

    test('Service Worker und Manifest', { tag: '@UI-03' }, async ({ page }) => {
      const notFound: string[] = [];
      page.on('response', (res) => {
        if (res.status() === 404) notFound.push(res.url());
      });
      await page.goto('/');
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      expect(scope).toMatch(/localhost:\d+\/$/);

      const manifest = await page.request.get('/manifest.json');
      expect(manifest.ok()).toBe(true);
      expect(await manifest.json()).toMatchObject({ short_name: 'AutoGrid', display: 'standalone' });
      for (const icon of ['/icon-192.png', '/icon-512.png']) {
        expect((await page.request.get(icon)).ok(), icon).toBe(true);
      }
      expect(notFound).toEqual([]);
    });
  });

  test('Zonen-Test-Link öffnet /chart mit der Zone', { tag: '@UI-04' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zone().getByRole('link', { name: 'Test' }).click();
    await expect(page).toHaveURL(`/chart?zone=${ZONE_ID}`);
    await expect(page.getByText('Bölge 1 · USOUSD')).toBeVisible();
    await expect(page.getByText('90 – 110')).toBeVisible();

    // Stream zeigt ein anderes Symbol → Hinweis, keine Zonenlinien
    await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
    worker.pushMetrics({ price: 1950, symbol: 'XAUUSD' });
    await expect(page.getByRole('alert').filter({ hasText: 'Farklı sembol' })).toBeVisible();
  });

  test('Unbekannte Zone auf /chart', { tag: '@UI-04' }, async ({ page }) => {
    await page.goto('/chart?zone=gibt-es-nicht');
    await expect(page.getByRole('alert').filter({ hasText: 'Bölge bulunamadı' })).toContainText(
      "önce Dashboard'da hesabı seçin",
    );
  });
});
