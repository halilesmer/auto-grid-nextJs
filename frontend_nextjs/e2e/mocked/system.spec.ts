/** SYS · Verbindung & Infrastruktur · UPD · Update und Shutdown. */
import { DEMO_ID, MT5_PATH, expect, test } from '../fixtures/test';

test.describe('SYS Verbindung', () => {
  test('WebSocket verbindet mit API-Schlüssel und nach Abbruch neu', { tag: '@SYS-02' }, async ({ page, worker }) => {
    await page.goto('/chart');
    await expect.poll(() => worker.openSockets).toBe(1);
    expect(new URL(worker.wsUrls[0]).searchParams.get('api_key')).toBe('e2e-key');

    worker.pushMetrics({ price: 97.25 });
    await expect(page.getByTestId('chart-stat-price')).toContainText('97.25');

    // Worker-Neustart: Verbindung weg → Client verbindet sich nach 1 s selbst wieder
    worker.dropWebSockets();
    await expect.poll(() => worker.openSockets, { timeout: 5_000 }).toBe(1);
    expect(worker.wsUrls).toHaveLength(2);
    worker.pushMetrics({ price: 98.5 });
    await expect(page.getByTestId('chart-stat-price')).toContainText('98.5');
  });

  test('MT5-Scanner und eigener Pfad', { tag: '@SYS-04' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await page.getByRole('button', { name: 'Add new account' }).click();
    const dialog = page.getByRole('dialog');
    const select = dialog.getByLabel('Select MT5 Path');
    await expect(select.locator('option')).toHaveText([
      '-- MT5 Yolunu Seçin --',
      MT5_PATH,
      'C:/Program Files/MT5_EC_Demo/terminal64.exe',
    ]);

    await dialog.getByLabel('Manuel Gir (Custom Path)').check();
    await expect(select).toBeHidden();
    await expect(dialog.getByLabel('Custom MT5 Path')).toBeVisible();

    // Scan-Fehler: Hinweis + Textfeld für den Pfad
    await dialog.getByLabel('Manuel Gir (Custom Path)').uncheck();
    worker.overrides.set('GET /api/system/scan-mt5', { status: 500, body: { detail: 'boom' } });
    await dialog.getByRole('button', { name: 'Rescan MT5 paths' }).click();
    await expect(dialog.getByText('MT5 yolları taranırken sunucu hatası oluştu.', { exact: false })).toBeVisible();
    await expect(dialog.getByLabel('Custom MT5 Path')).toBeVisible();
  });

  test('Gespeicherter Pfad außerhalb der Scan-Liste öffnet „eigener Pfad“', { tag: '@SYS-04' }, async ({ page, worker, dashboard }) => {
    worker.state.accounts[0].mt5_path = 'D:/Portable/MT5/terminal64.exe';
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: 'Edit account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Manuel Gir (Custom Path)')).toBeChecked();
    await expect(dialog.getByLabel('Custom MT5 Path')).toHaveValue('D:/Portable/MT5/terminal64.exe');
  });
});

test.describe('UPD System', () => {
  test('Update-Prüfung', { tag: '@UPD-01' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByTitle('System Info').click();
    await page.getByRole('button', { name: 'Check for Updates' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('You are up to date');
    await expect(modal).toContainText('v0.7.62');
    await modal.getByRole('button', { name: 'Close', exact: true }).last().click();

    worker.state.update = { has_update: true, local_ver: 'v0.7.61', remote_ver: 'v0.7.62' };
    await page.getByTitle('System Info').click();
    await page.getByRole('button', { name: 'Check for Updates' }).click();
    await expect(modal).toContainText('New version available');
    await expect(modal).toContainText('v0.7.61v0.7.62');
    await expect(modal.getByRole('button', { name: 'Apply Update (git pull)' })).toBeVisible();
  });

  test('Update anwenden lädt die Seite neu', { tag: '@UPD-02' }, async ({ page, worker, dashboard }) => {
    worker.state.update = { has_update: true, local_ver: 'v0.7.61', remote_ver: 'v0.7.62' };
    await dashboard.open(DEMO_ID);
    await page.getByTitle('System Info').click();
    await page.getByRole('button', { name: 'Check for Updates' }).click();

    const reloaded = page.waitForEvent('framenavigated');
    await page.getByRole('button', { name: 'Apply Update (git pull)' }).click();
    await reloaded;
    expect(worker.callsTo('POST', '/api/system/update')).toHaveLength(1);
    expect(worker.callsTo('POST', '/api/system/update')[0].query.get('branch')).toBe('main');
  });

  test('Fehlgeschlagenes Update zeigt die Meldung', { tag: '@UPD-02' }, async ({ page, worker, dashboard }) => {
    worker.state.update = { has_update: true, local_ver: 'v0.7.61', remote_ver: 'v0.7.62' };
    worker.overrides.set('POST /api/system/update', { status: 500, body: { detail: 'git pull fehlgeschlagen' } });
    await dashboard.open(DEMO_ID);
    await page.getByTitle('System Info').click();
    await page.getByRole('button', { name: 'Check for Updates' }).click();
    const message = await dashboard.withDialog(() =>
      page.getByRole('button', { name: 'Apply Update (git pull)' }).click(),
    );
    expect(message).toBe('git pull fehlgeschlagen');
  });

  test('System herunterfahren stoppt den Bot', { tag: '@UPD-03' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await page.locator('header').getByTitle('System Shutdown').click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('This will stop all running bots');
    await modal.getByRole('button', { name: 'Shutdown' }).click();
    await expect.poll(() => worker.callsTo('POST', '/api/stop').length).toBe(1);
    expect(worker.callsTo('POST', '/api/stop')[0].query.get('account_id')).toBe(DEMO_ID);
  });
});
