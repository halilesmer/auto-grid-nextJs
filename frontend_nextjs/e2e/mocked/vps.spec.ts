/**
 * VPS · Fernsteuerung des Windows-VPS über die Seite /vps.
 *
 * Die Route /api/vps/* (Next.js-Server, führt SSH aus) wird im Browser gemockt – im Test läuft
 * kein SSH. Nur der Routen-Schutz (VPS-04) spricht den echten Testserver an.
 */
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../fixtures/test';

const STATUS = {
  ok: true,
  hostname: 'VPS-01',
  version: 'v0.7.71',
  git: { branch: 'main', commit: '6e6011d0' },
  worker: { listening: true, reachable: true, error: null },
  worker_watchdog: true,
  ngrok: { running: true, public_url: 'https://tweet-overlying-monotone.ngrok-free.dev' },
  ngrok_watchdog: true,
  bots: [{ pid: 4711, account: '5039114' }],
  mt5_terminals: 1,
  session_active: true,
  autologon: true,
  auto_update_minutes: null,
  tasks: { start: { exists: true, state: 'Ready' }, update: { exists: true, state: 'Ready' } },
  boot_time: '2026-09-24T08:00:00',
  uptime_minutes: 125,
};

interface VpsMock {
  calls: string[];
  status: Record<string, unknown>;
  statusCode: number;
}

async function mockVps(page: Page, overrides: Partial<VpsMock> = {}): Promise<VpsMock> {
  const mock: VpsMock = { calls: [], status: { ...STATUS }, statusCode: 200, ...overrides };
  await page.route('**/api/vps/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const action = url.pathname.replace('/api/vps/', '');
    mock.calls.push(`${req.method()} ${action}${url.search}`);
    const reply = (body: unknown, status = 200) => route.fulfill({ status, json: body });

    if (action === 'status') return reply(mock.status, mock.statusCode);
    if (action === 'check-update') return reply({ ok: true, has_update: true, local_ver: 'v0.7.70', remote_ver: 'v0.7.71' });
    if (action === 'logs') {
      const log = url.searchParams.get('log');
      return reply({ ok: true, log, lines: [`[${log}] Zeile 1`, `[${log}] Application startup complete.`] });
    }
    if (req.method() === 'POST') return reply({ ok: true, message: `${action} ausgeführt` });
    return reply({ ok: false, error: 'unbekannt' }, 404);
  });
  return mock;
}

test.describe('VPS Fernsteuerung', () => {
  test('Status von Worker, ngrok, Bots und Version', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page);
    await page.goto('/vps');

    await expect(page.getByRole('heading', { name: 'VPS-Steuerung' })).toBeVisible();
    await expect(page.getByTestId('vps-tile-worker')).toContainText('Läuft');
    await expect(page.getByTestId('vps-tile-worker')).toHaveAttribute('data-tone', 'success');
    await expect(page.getByTestId('vps-tile-ngrok')).toContainText('tweet-overlying-monotone');
    await expect(page.getByTestId('vps-tile-bots')).toContainText('1 Bot läuft');
    await expect(page.getByTestId('vps-tile-bots')).toContainText('5039114');
    await expect(page.getByTestId('vps-tile-version')).toContainText('v0.7.71');
    await expect(page.getByTestId('vps-tile-version')).toContainText('main @ 6e6011d0');
    await expect(page.getByTestId('vps-tile-autostart')).toContainText('Eingerichtet');

    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'VPS' })).toHaveAttribute('aria-current', 'page');
  });

  test('Worker gestoppt und SSH-Fehler', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    mock.status = { ...STATUS, worker: { listening: false, reachable: false, error: null }, worker_watchdog: false };
    await page.goto('/vps');
    await expect(page.getByTestId('vps-tile-worker')).toContainText('Gestoppt');
    await expect(page.getByTestId('vps-tile-worker')).toContainText('Neustart-Schleife: fehlt');
    // Ohne laufenden Worker keine Update-Prüfung, „Update & Neustart“ geht trotzdem (Aufgabe)
    await expect(page.getByTestId('vps-action-check-update')).toBeDisabled();
    await expect(page.getByTestId('vps-action-update')).toBeEnabled();

    mock.status = { ok: false, error: 'SSH fehlgeschlagen (Exit 255): Connection timed out' };
    mock.statusCode = 502;
    await page.getByRole('button', { name: 'Status neu laden' }).click();
    await expect(page.getByTestId('vps-status')).toContainText('VPS nicht erreichbar');
    await expect(page.getByTestId('vps-status')).toContainText('Connection timed out');
  });

  test('Ohne VPS_SSH_HOST: Hinweis statt Steuerung', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page, {
      status: { ok: false, error: 'VPS-Steuerung deaktiviert: VPS_SSH_HOST fehlt in .env.local' },
      statusCode: 404,
    });
    await page.goto('/vps');
    await expect(page.getByTestId('vps-disabled')).toContainText('VPS_SSH_HOST fehlt');
    await expect(page.getByTestId('vps-action-restart')).toHaveCount(0);
  });

  test('Update prüfen und Aktionen mit Bestätigung', { tag: '@VPS-02' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    await page.goto('/vps');

    await page.getByTestId('vps-action-check-update').click();
    await expect(page.getByTestId('vps-update-result')).toContainText('v0.7.70');
    await expect(page.getByTestId('vps-update-result')).toContainText('v0.7.71');

    for (const [testId, action, confirm] of [
      ['vps-action-update', 'update', 'Update & Neustart'],
      ['vps-action-restart', 'restart', 'Worker neu starten'],
      ['vps-action-restart-ngrok', 'restart-ngrok', 'ngrok neu starten'],
      ['vps-action-reboot', 'reboot', 'VPS neu starten'],
    ] as const) {
      await page.getByTestId(testId).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(`${confirm}?`);
      await dialog.getByRole('button', { name: confirm }).click();
      await expect.poll(() => mock.calls).toContain(`POST ${action}`);
      await expect(page.getByText(`${action} ausgeführt`)).toBeVisible();
    }

    // Abbrechen löst nichts aus
    const before = mock.calls.filter((c) => c.startsWith('POST')).length;
    await page.getByTestId('vps-action-reboot').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    expect(mock.calls.filter((c) => c.startsWith('POST'))).toHaveLength(before);
  });

  test('Logs von Worker, ngrok und Update', { tag: '@VPS-03' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    await page.goto('/vps');
    const output = page.getByTestId('vps-log-output');
    await expect(output).toContainText('[worker] Application startup complete.');

    await page.getByRole('tab', { name: 'ngrok' }).click();
    await expect(output).toContainText('[ngrok] Zeile 1');
    await page.getByRole('tab', { name: 'Update' }).click();
    await expect(output).toContainText('[update] Zeile 1');
    expect(mock.calls).toContain('GET logs?log=update&lines=300');
  });
});

test.describe('VPS Routen-Schutz', () => {
  // Echter Testserver: fremder Host/fremde Origin wird abgewiesen, bevor irgendetwas per SSH läuft
  test('nur localhost und gleiche Origin', { tag: '@VPS-04' }, async ({ request }) => {
    const foreignHost = await request.get('/api/vps/status', { headers: { 'X-Forwarded-Host': 'evil.example' } });
    expect(foreignHost.status()).toBe(403);

    const noOrigin = await request.post('/api/vps/reboot');
    expect(noOrigin.status()).toBe(403);

    const foreignOrigin = await request.post('/api/vps/reboot', { headers: { Origin: 'https://evil.example' } });
    expect(foreignOrigin.status()).toBe(403);
    expect(await foreignOrigin.json()).toMatchObject({ ok: false, error: 'Ungültige Origin' });
  });
});
