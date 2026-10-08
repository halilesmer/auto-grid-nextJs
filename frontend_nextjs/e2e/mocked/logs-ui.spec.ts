/** LOG · Logs und Worker-Status · UI · Navigation, Theme, PWA, Zonen-Test-Link. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test.describe('LOG Logs', () => {
  test('Tabs zeigen Robot- und MT5-Log', { tag: '@LOG-01' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(page.getByRole('tab', { name: msg('logs.tab.activity') })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: msg('logs.tab.robot') }).click();
    await expect(dashboard.logOutput).toContainText('[START] Bot gestartet');
    await expect(dashboard.logOutput).toContainText('3 emir yerleştirildi');

    await page.getByRole('tab', { name: msg('logs.tab.mt5') }).click();
    await expect(dashboard.logOutput).toContainText('buy limit 0.01 USOUSD at 96.750');

    const [call] = worker.callsTo('GET', `/api/logs/${DEMO_ID}`);
    expect(call.query.get('log_type')).toBe('all');
  });

  test('Symbol-Logs zeigen nur das eigene Symbol', { tag: '@LOG-07' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const card = dashboard.symbolCard(0);
    // Der Schalter sitzt einmal in der Symbolkarte, nicht in der Setup-Karte
    await expect(card.getByRole('button', { name: msg('zone.logs.toggle') })).toHaveCount(1);
    await expect(card.getByTestId('zone-card').getByRole('button', { name: msg('zone.logs.toggle') })).toHaveCount(0);
    await card.getByRole('button', { name: msg('zone.logs.toggle') }).click();
    const out = card.getByTestId('zone-log-output');
    await expect(out).toContainText('3 emir yerleştirildi');
    await expect(out).not.toContainText('fremde Zone');
    await expect(out).not.toContainText('[Z:');
    // Ein Setup: keine Setup-Nummer vor der Zeile
    await expect(out.getByTestId('log-setup-badge')).toHaveCount(0);
    const call = worker.callsTo('GET', `/api/logs/${DEMO_ID}`).find((c) => c.query.has('zone_id'));
    expect(call?.query.getAll('zone_id')).toEqual([ZONE_ID]);

    // Eine Eingabe im Setup gibt neue Zonen-Objekte mit denselben ids: keine zusätzliche Abfrage,
    // nur die von „Aktualisieren“
    const symbolLogCalls = () => worker.callsTo('GET', `/api/logs/${DEMO_ID}`).filter((c) => c.query.has('zone_id')).length;
    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    await expect(card.getByText(msg('zone.header.unsaved'), { exact: true })).toBeVisible();
    expect(symbolLogCalls()).toBe(1);
    await card.getByRole('button', { name: msg('logs.refresh') }).click();
    await expect.poll(symbolLogCalls).toBe(2);

    // Robot-Tab: Tag als Badge „Symbol · Setup n“ statt Rohtext
    await page.getByRole('tab', { name: msg('logs.tab.robot') }).click();
    await expect(dashboard.logOutput.getByTestId('log-zone-badge').first()).toHaveText(
      msg('logs.zoneBadge', { symbol: 'USOUSD', n: 1 }),
    );
    await expect(dashboard.logOutput).not.toContainText('[Z:');
  });

  test('Symbol-Logs: ein Symbol mit zwei Setups zeigt die Zeilen beider Setups mit Setup-Nummer', { tag: '@LOG-07' }, async ({ page, worker, dashboard }) => {
    // USOUSD mit Setup 1 (zone-a) und Setup 2 (zone-c), XAUUSD mit einem Setup (zone-b)
    worker.setZones(DEMO_ID, [
      makeZone({ id: 'zone-a' }),
      makeZone({ id: 'zone-c', min_price: 80, max_price: 100 }),
      makeZone({ id: 'zone-b', symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
    ]);
    worker.state.robotLog[DEMO_ID] = [
      '[2026-09-24 08:00:00] [INFO] [Z:zone-c] C eins',
      '[2026-09-24 08:00:01] [INFO] [Z:zone-b] B fremd',
      '[2026-09-24 08:00:02] [INFO] [Z:zone-a] A zwei',
      '[2026-09-24 08:00:03] [INFO] ohne Setup',
    ];
    await dashboard.open(DEMO_ID);

    const uso = dashboard.symbolCard(0);
    await uso.getByRole('button', { name: msg('zone.logs.toggle') }).click();
    const usoOut = uso.getByTestId('zone-log-output');
    await expect(usoOut).toContainText('C eins');
    await expect(usoOut).toContainText('A zwei');
    await expect(usoOut).not.toContainText('B fremd');
    await expect(usoOut).not.toContainText('ohne Setup');
    await expect(usoOut).not.toContainText('[Z:');
    await expect(usoOut.getByTestId('log-setup-badge')).toHaveText([
      msg('zone.setup.title', { n: 2 }),
      msg('zone.setup.title', { n: 1 }),
    ]);
    const call = worker.callsTo('GET', `/api/logs/${DEMO_ID}`).find((c) => c.query.has('zone_id'));
    expect(call?.query.getAll('zone_id')).toEqual(['zone-a', 'zone-c']);

    const xau = dashboard.symbolCard(1);
    await xau.getByRole('button', { name: msg('zone.logs.toggle') }).click();
    const xauOut = xau.getByTestId('zone-log-output');
    await expect(xauOut).toContainText('B fremd');
    await expect(xauOut).not.toContainText('A zwei');
    await expect(xauOut.getByTestId('log-setup-badge')).toHaveCount(0);

    // Robot-Tab: Badge mit Symbol und Setup-Nummer der Symbolkarte
    await page.getByRole('tab', { name: msg('logs.tab.robot') }).click();
    await expect(dashboard.logOutput.getByTestId('log-zone-badge')).toHaveText([
      msg('logs.zoneBadge', { symbol: 'USOUSD', n: 2 }),
      msg('logs.zoneBadge', { symbol: 'XAUUSD', n: 1 }),
      msg('logs.zoneBadge', { symbol: 'USOUSD', n: 1 }),
    ]);
  });

  test('Logs löschen', { tag: '@LOG-02' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('tab', { name: msg('logs.tab.robot') }).click();
    await expect(dashboard.logOutput).toContainText('Bot gestartet');
    const clear = page.getByRole('button', { name: msg('logs.clear.all') });

    const confirm = page.getByRole('dialog').filter({ hasText: msg('logs.clearConfirm.title') });

    // Abbrechen: nichts wird gelöscht
    await clear.click();
    await expect(confirm).toContainText('logları temizlemek');
    await confirm.getByRole('button', { name: msg('logs.clearConfirm.cancel') }).click();
    await expect(confirm).toBeHidden();
    expect(worker.callsTo('DELETE', `/api/logs/${DEMO_ID}`)).toHaveLength(0);

    await clear.click();
    await confirm.getByRole('button', { name: msg('logs.clearConfirm.confirm'), exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(dashboard.logOutput).toHaveText(msg('logs.empty.log'));
    await dashboard.refreshLogs();
    await expect(dashboard.logOutput).toHaveText(msg('logs.empty.log'));
    expect(worker.callsTo('DELETE', `/api/logs/${DEMO_ID}`)).toHaveLength(1);

    // Activity-Tab leert nur die Anzeige, ohne Worker-Aufruf
    await page.getByRole('tab', { name: msg('logs.tab.activity') }).click();
    await page.getByRole('button', { name: msg('logs.clear.activity') }).click();
    await expect(dashboard.logOutput).toContainText(msg('logs.empty.activity'));
    expect(worker.callsTo('DELETE', `/api/logs/${DEMO_ID}`)).toHaveLength(1);
  });

  test('Logs als ZIP herunterladen', { tag: '@LOG-03' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: msg('logs.download') }).click();
    expect((await download).suggestedFilename()).toBe(`MT5_Logs_and_Configs_${DEMO_ID}.zip`);
    await expect(dashboard.logOutput).toContainText(msg('logs.download.done', { size: 1 }));
  });

  test('Worker-Status: online, offline nach dem nächsten Polling, wieder online', { tag: '@LOG-04' }, async ({ page, worker, dashboard }) => {
    test.slow(); // wartet einen echten 10-s-Polling-Zyklus ab
    await dashboard.open(DEMO_ID);
    const status = page.getByTestId('worker-status');
    await expect(status).toContainText(msg('logs.status.onlineUpdated', { time: '' }).trim());
    await expect(page.getByText(`${DEMO_ID} · ${msg('logs.refreshEvery', { seconds: 10 })}`)).toBeVisible();

    worker.offline = true;
    await expect(status).toHaveText(msg('logs.status.offline'), { timeout: 15_000 });
    await expect(page.getByText(msg('error.unreachable')).first()).toBeVisible();

    worker.offline = false;
    await dashboard.refreshLogs();
    await expect(status).toContainText(msg('logs.status.online'));
    await expect(dashboard.logOutput).toContainText(msg('logs.restored'));
  });
});

test.describe('UI Oberfläche', () => {
  test('Navigation und Version', { tag: '@UI-01' }, async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: msg('nav.dashboard') })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('link', { name: msg('nav.formation') }).click();
    await expect(page).toHaveURL(/\/formasyon$/);
    await expect(page.getByRole('heading', { name: msg('formation.title') })).toBeVisible();
    await expect(nav.getByRole('link', { name: msg('nav.formation') })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: msg('nav.dashboard') })).not.toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: msg('nav.vps') })).toHaveAttribute('href', '/vps');

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
    const theme = page.getByRole('radiogroup', { name: msg('common.theme') });

    await page.goto('/');
    await expect(html).toHaveClass(/\bdark\b/); // Standard: dunkel
    await theme.getByRole('radio', { name: msg('common.theme.light') }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);

    await page.reload();
    expect(await darkAtLoad()).toBe(false);
    await expect(theme.getByRole('radio', { name: msg('common.theme.light') })).toHaveAttribute('aria-checked', 'true');

    await theme.getByRole('radio', { name: msg('common.theme.dark') }).click();
    await page.reload();
    expect(await darkAtLoad()).toBe(true);

    // System folgt dem Betriebssystem, auch bei Wechsel zur Laufzeit
    await page.emulateMedia({ colorScheme: 'light' });
    await theme.getByRole('radio', { name: msg('common.theme.system') }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test.describe('Mobil (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('Header scrollt nicht horizontal', { tag: '@UI-01' }, async ({ page }) => {
      await page.goto('/');
      const nav = page.getByRole('navigation');
      await expect(nav.getByRole('link', { name: msg('nav.vps') })).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      // Logo-Text bleibt einzeilig
      const logo = await nav.getByText('Grid Robot', { exact: true }).boundingBox();
      expect(logo!.height).toBeLessThan(24);
    });

    test('Theme-Zyklus-Button statt Radiogroup', { tag: '@UI-02' }, async ({ page }) => {
      await page.goto('/');
      const html = page.locator('html');
      await expect(page.getByRole('radiogroup', { name: msg('common.theme') })).toBeHidden();
      const cycle = page.getByRole('button', { name: /^Tema: / });

      await expect(cycle).toHaveAccessibleName(/^Tema: Koyu/);
      await cycle.click();
      await expect(cycle).toHaveAccessibleName(/^Tema: Sistem/);
      await cycle.click();
      await expect(cycle).toHaveAccessibleName(/^Tema: Açık/);
      await expect(html).not.toHaveClass(/\bdark\b/);
      await page.reload();
      await expect(cycle).toHaveAccessibleName(/^Tema: Açık/);
    });
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

  test('Zonen-Test-Link öffnet /backtest, die Analyse zeigt dieselbe Zone', { tag: '@UI-04' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zone().getByRole('link', { name: msg('zone.header.test') }).click();
    await expect(page).toHaveURL(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByTestId('zone-select')).toContainText(msg('analysis.zone.option', { symbol: 'USOUSD', n: 1 }));
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.analysis') }).click();
    await expect(page).toHaveURL(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByTestId('zone-select')).toContainText(msg('analysis.zone.option', { symbol: 'USOUSD', n: 1 }));
    await expect(page.getByText('90 – 110')).toBeVisible();

    // Stream zeigt ein anderes Symbol → Hinweis, keine Zonenlinien
    await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
    worker.pushMetrics({ price: 1950, symbol: 'XAUUSD' });
    await expect(page.getByRole('alert').filter({ hasText: msg('chart.zone.mismatch.title') })).toBeVisible();
  });

  test('Unbekannte Zone auf /chart', { tag: '@UI-04' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&zone=gibt-es-nicht`);
    await expect(page.getByRole('alert').filter({ hasText: msg('chart.zone.notFound') })).toContainText(
      msg('chart.zone.notFound.withAccount'),
    );
  });
});
