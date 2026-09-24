/**
 * Live, nur lesend: echter Worker auf dem VPS, DEMO-Testkonto. Es wird nichts gespeichert,
 * gestartet oder gestoppt; die Tests öffnen nur Seiten und lesen die API.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './live';

/** Sammelt METRICS-Nachrichten des echten Streams, bis `count` erreicht ist. */
async function collectMetrics(page: Page, count: number, timeout = 15_000) {
  const messages: Array<Record<string, unknown>> = [];
  const wsUrls: string[] = [];
  page.on('websocket', (ws) => {
    wsUrls.push(ws.url());
    ws.on('framereceived', ({ payload }) => {
      try {
        const msg = JSON.parse(String(payload));
        if (msg.type === 'METRICS') messages.push(msg.payload);
      } catch {
        /* keine JSON-Nachricht */
      }
    });
  });
  await page.goto('/chart');
  await expect.poll(() => messages.length, { timeout }).toBeGreaterThanOrEqual(count);
  return { messages, wsUrls };
}

/**
 * Öffnet im Browser einen WebSocket: 'open', wenn er nach `holdMs` noch offen ist,
 * 'closed', wenn der Worker ihn abweist, 'timeout' ohne Antwort.
 */
function probeWebSocket(page: Page, url: string, holdMs = 0): Promise<string> {
  return page.evaluate(
    ([u, hold]) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(u);
        let settled = false;
        const done = (r: string) => {
          if (settled) return;
          settled = true;
          ws.onopen = ws.onclose = null;
          ws.close();
          resolve(r);
        };
        ws.onopen = () => setTimeout(() => done('open'), hold);
        ws.onclose = () => done('closed');
        setTimeout(() => done('timeout'), 15_000);
      }),
    [url, holdMs] as const,
  );
}

test.describe('Live (nur lesend)', () => {
  test('Worker erreichbar, Konto und Status im Dashboard', { tag: ['@SYS-01', '@ACC-01'] }, async ({ page, account, dashboard }) => {
    await dashboard.open(null);
    await expect(dashboard.accountSelect.locator(`option[value="${account.id}"]`)).toHaveCount(1);
    await dashboard.selectAccount(account.id);
    await expect(page.getByTestId('worker-status')).toContainText('Worker online');
    await expect(page.getByTestId('env-badge')).toHaveText('TEST');
  });

  test('API-Schlüssel wird verlangt (REST und WebSocket)', { tag: '@SYS-05' }, async ({ page, api, account }) => {
    test.skip(!api.key, 'Kein NEXT_PUBLIC_WORKER_API_KEY gesetzt – Worker ist offen');
    expect(await api.status('/accounts', false)).toBe(401);
    expect(await api.status(`/settings/${account.id}`, false)).toBe(401);
    expect(await api.status('/accounts')).toBe(200);

    // Browser-WebSocket ohne Schlüssel wird abgewiesen, mit Schlüssel angenommen
    await page.goto('about:blank');
    expect(await probeWebSocket(page, api.wsUrl(false))).toBe('closed');
    expect(await probeWebSocket(page, api.wsUrl(true))).toBe('open');
  });

  test('WebSocket verbindet und bleibt offen', { tag: '@SYS-02' }, async ({ page, api }) => {
    await page.goto('about:blank');
    // Offen und nach 3 s noch offen (kein sofortiger Abbruch durch Worker/ngrok)
    expect(await probeWebSocket(page, api.wsUrl(true), 3_000)).toBe('open');
  });

  test('WebSocket-Stream liefert Metriken', { tag: '@MET-03' }, async ({ page, api, account }) => {
    const settings = await api.settings(account.id);
    const { messages, wsUrls } = await collectMetrics(page, 3);
    if (api.key) expect(wsUrls.some((u) => u.includes('api_key='))).toBe(true);

    const last = messages.at(-1)!;
    expect(Number(last.price)).toBeGreaterThan(0);
    // Stream zeigt das Symbol der ersten Zone des Kontos
    const firstSymbol = settings.ZONES?.[0]?.symbol;
    if (firstSymbol && last.symbol) expect(String(last.symbol).toUpperCase()).toBe(firstSymbol.toUpperCase());
    await expect(page.getByTestId('chart-stat-price')).not.toContainText('--');
  });

  test('Kontoauswahl zeigt die Einstellungen vom VPS', { tag: ['@ACC-06', '@SET-01'] }, async ({ page, api, account, dashboard }) => {
    const settings = await api.settings(account.id);
    const zones = settings.ZONES ?? [];
    await dashboard.open(account.id);

    await expect(page.getByTestId('zone-count')).toHaveText(String(zones.length));
    await expect(page.getByLabel('Kontrol Sıklığı')).toHaveValue(String(settings.LOOP_INTERVAL_SECONDS ?? 1));
    for (const [i, zone] of zones.entries()) {
      await expect(dashboard.zone(i).getByPlaceholder(/Sembol Ara/)).toHaveValue(zone.symbol);
      await expect(dashboard.zoneField('Emir Tipi', i)).toHaveValue(zone.order_type);
      await expect(dashboard.zoneField('Min Fiyat ($)', i)).toHaveValue(String(zone.min_price));
      await expect(dashboard.zoneField('Max Fiyat ($)', i)).toHaveValue(String(zone.max_price));
    }
    // Nur angesehen, nichts geändert
    await expect(dashboard.saveAll).toHaveText('Kaydedildi');
  });

  test('Symbolliste kommt aus dem Cache', { tag: '@SYM-01' }, async ({ api, account }) => {
    const settings = await api.settings(account.id);
    const first = await api.get<{ symbols: Array<{ name: string }> }>(`/symbols/${account.id}`);
    expect(first.symbols.length).toBeGreaterThan(0);
    for (const zone of settings.ZONES ?? []) {
      expect(first.symbols.map((s) => s.name)).toContain(zone.symbol);
    }
    const started = Date.now();
    await api.get(`/symbols/${account.id}`);
    // Zweiter Aufruf ohne MT5-Abfrage: nur ngrok-Latenz
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test('MT5-Scanner findet das Terminal des Testkontos', { tag: '@SYS-04' }, async ({ api, account }) => {
    const platform = await api.get<{ is_windows: boolean }>('/system/platform');
    expect(platform.is_windows).toBe(true);
    const { paths } = await api.get<{ paths: string[] }>('/system/scan-mt5');
    expect(paths.length).toBeGreaterThan(0);
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    if (account.mt5Path) expect(paths.map(norm)).toContain(norm(account.mt5Path));
  });

  test('Kennzahlenleiste entspricht dem Worker', { tag: '@MET-01' }, async ({ page, api, account, dashboard }) => {
    const before = await api.botStatus(account.id);
    await dashboard.open(account.id);
    const price = page.getByTestId('metric-price');
    await expect(price).toHaveAttribute('data-value', /^\$\d/);

    if (before.bot_running && before.metrics.mt5_connected) {
      await expect(page.getByTestId('metric-profit')).toContainText('Live from MT5');
      await expect(dashboard.botStatus).toHaveText('Running');
      const shown = Number((await price.getAttribute('data-value'))!.replace(/[$,]/g, ''));
      const now = (await api.botStatus(account.id)).metrics.current_price ?? 0;
      // Preis bewegt sich zwischen den Abfragen; 1 % Toleranz
      expect(Math.abs(shown - now) / now).toBeLessThan(0.01);
      const positions = Number(await page.getByTestId('metric-positions').getAttribute('data-value'));
      expect(positions).toBeGreaterThanOrEqual(0);
    } else {
      await expect(page.getByTestId('metric-profit')).toContainText('Engine stopped');
      await expect(dashboard.botStatus).toHaveText(/Stopped|not connected/);
    }
  });

  test('Log-Tabs zeigen Robot- und MT5-Log', { tag: '@LOG-01' }, async ({ page, api, account, dashboard }) => {
    const logs = await api.logs(account.id);
    await dashboard.open(account.id);
    await page.getByRole('tab', { name: 'Robot Logs' }).click();
    if (logs.robot_log.length > 0) {
      await expect(dashboard.logOutput).not.toHaveText('No log entries yet...');
      await expect(dashboard.logOutput).toContainText(/\[\d{4}-\d{2}-\d{2}/);
    }
    await page.getByRole('tab', { name: 'MT5 Terminal' }).click();
    if (logs.mt5_log.length > 0) {
      await expect(dashboard.logOutput).not.toHaveText('No log entries yet...');
    }
  });

  test('Zonenbefehle (ui-state) lesbar', { tag: '@ZON-08' }, async ({ api, account }) => {
    const states = await api.uiStates(account.id);
    for (const value of Object.values(states)) {
      expect(['START', 'PAUSE', 'AUTO_CLEAR', 'CLEAR']).toContain(value);
    }
  });
});
