/**
 * VPS · Fernsteuerung des Windows-VPS über die Seite /vps.
 *
 * Die Route /api/vps/* (Next.js-Server, führt SSH aus) wird im Browser gemockt – im Test läuft
 * kein SSH. Nur der Routen-Schutz (VPS-04) spricht den echten Testserver an.
 */
import type { Page, Route } from '@playwright/test';
import { expect, test, type MockWorker } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const STATUS = {
  ok: true,
  hostname: 'VPS-01',
  version: 'v0.7.71',
  git: { branch: 'main', commit: '6e6011d0', updated_at: '2026-09-30T08:15:00.000Z' },
  worker: { listening: true, reachable: true, error: null },
  worker_watchdog: true,
  ngrok: { running: true, public_url: 'https://example-tunnel-subdomain.ngrok-free.dev' },
  ngrok_watchdog: true,
  bots: [{ pid: 4711, account: '12345678' }],
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
  /** Antwort für /api/vps/logs; null = Standardzeilen */
  logs: { body: Record<string, unknown>; code: number } | null;
}

async function mockVps(page: Page, overrides: Partial<VpsMock> = {}): Promise<VpsMock> {
  const mock: VpsMock = { calls: [], status: { ...STATUS }, statusCode: 200, logs: null, ...overrides };
  await page.route('**/api/vps/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const action = url.pathname.replace('/api/vps/', '');
    mock.calls.push(`${req.method()} ${action}${url.search}`);
    const reply = (body: unknown, status = 200) => route.fulfill({ status, json: body });

    if (action === 'status') return reply(mock.status, mock.statusCode);
    if (action === 'check-update') return reply({ ok: true, has_update: true, local_ver: 'v0.7.70', remote_ver: 'v0.7.71' });
    if (action === 'logs') {
      if (mock.logs) return reply(mock.logs.body, mock.logs.code);
      const log = url.searchParams.get('log');
      return reply({
        ok: true,
        log,
        // uvicorn schreibt Farbcodes in worker_console.log
        lines: [`[${log}] Zeile 1`, `\u001b[32mINFO\u001b[0m:     [${log}] Application startup complete.`],
      });
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

    await expect(page.getByRole('heading', { name: msg('vps.title') })).toBeVisible();
    await expect(page.getByTestId('vps-tile-worker')).toContainText(msg('bot.status.running'));
    await expect(page.getByTestId('vps-tile-worker')).toHaveAttribute('data-tone', 'success');
    await expect(page.getByTestId('vps-tile-ngrok')).toContainText('example-tunnel-subdomain');
    await expect(page.getByTestId('vps-tile-bots')).toContainText(msg('vps.tile.bots.running', { count: 1 }));
    await expect(page.getByTestId('vps-tile-bots')).toContainText('12345678');
    await expect(page.getByTestId('vps-tile-version')).toContainText('v0.7.71');
    await expect(page.getByTestId('vps-tile-version')).toContainText('main @ 6e6011d0');
    await expect(page.getByTestId('vps-tile-version')).toContainText(msg('vps.tile.updatedAt', { time: '' }).trim());
    await expect(page.getByTestId('vps-tile-autostart')).toContainText(msg('vps.tile.autostart.ok'));

    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: msg('nav.vps') })).toHaveAttribute('aria-current', 'page');
  });

  test('Worker gestoppt und SSH-Fehler', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    mock.status = { ...STATUS, worker: { listening: false, reachable: false, error: null }, worker_watchdog: false };
    await page.goto('/vps');
    await expect(page.getByTestId('vps-tile-worker')).toContainText(msg('bot.status.stopped'));
    await expect(page.getByTestId('vps-tile-worker')).toContainText(msg('vps.tile.loop', { state: msg('vps.tile.loop.missing') }));
    // Ohne laufenden Worker keine Update-Prüfung, „Update & Neustart“ geht trotzdem (Aufgabe)
    await expect(page.getByTestId('vps-action-check-update')).toBeDisabled();
    await expect(page.getByTestId('vps-action-update')).toBeEnabled();

    mock.status = { ok: false, error: 'SSH fehlgeschlagen (Exit 255): Connection timed out' };
    mock.statusCode = 502;
    await page.getByRole('button', { name: msg('vps.refresh') }).click();
    await expect(page.getByTestId('vps-status')).toContainText(msg('vps.status.unreachable'));
    await expect(page.getByTestId('vps-status')).toContainText('Connection timed out');
  });

  test('Ohne VPS_SSH_HOST: Hinweis statt Steuerung', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page, {
      status: { ok: false, error: 'VPS-Steuerung deaktiviert: VPS_SSH_HOST fehlt in .env.local' },
      statusCode: 404,
    });
    await page.goto('/vps');
    await expect(page.getByTestId('vps-disabled')).toContainText('VPS_SSH_HOST');
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
      ['vps-action-update', 'update', msg('vps.action.update')],
      ['vps-action-restart', 'restart', msg('vps.action.restart')],
      ['vps-action-restart-ngrok', 'restart-ngrok', msg('vps.action.restartNgrok')],
      ['vps-action-reboot', 'reboot', msg('vps.action.reboot')],
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
    await page.getByRole('dialog').getByRole('button', { name: msg('common.cancel') }).click();
    expect(mock.calls.filter((c) => c.startsWith('POST'))).toHaveLength(before);
  });

  test('Admin-Reste: Warnung und Beenden mit Bestätigung', { tag: '@VPS-07' }, async ({ page, worker }) => {
    void worker;
    // Älteres vps.ps1 ohne Feld „elevated“ bzw. keine Reste: keine Warnung
    const mock = await mockVps(page);
    await page.goto('/vps');
    await expect(page.getByTestId('vps-tile-worker')).toContainText(msg('bot.status.running'));
    await expect(page.getByTestId('vps-elevated')).toHaveCount(0);

    mock.status = {
      ...STATUS,
      elevated: [
        { pid: 5068, role: 'worker-loop', account: '' },
        { pid: 424, role: 'worker', account: '' },
        { pid: 7272, role: 'bot', account: '87654321' },
      ],
    };
    await page.getByRole('button', { name: msg('vps.refresh') }).click();
    const warning = page.getByTestId('vps-elevated');
    await expect(warning).toContainText(msg('vps.elevated.title', { count: 3 }));
    await expect(warning).toContainText(`${msg('vps.role.worker-loop')} · PID 5068`);
    await expect(warning).toContainText('Bot 87654321 · PID 7272');

    // Abbrechen löst nichts aus
    await page.getByTestId('vps-action-fix-elevated').click();
    await page.getByRole('dialog').getByRole('button', { name: msg('common.cancel') }).click();
    expect(mock.calls).not.toContain('POST fix-elevated');

    await page.getByTestId('vps-action-fix-elevated').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(msg('vps.elevated.confirmTitle'));
    // Betroffene Bots werden beendet und vom Worker ohne Adminrechte fortgesetzt
    await expect(dialog).toContainText(msg('vps.elevated.infoBots'));
    mock.status = { ...STATUS, elevated: [] };
    await dialog.getByRole('button', { name: msg('vps.action.fixElevated') }).click();
    await expect.poll(() => mock.calls).toContain('POST fix-elevated');
    await expect(page.getByText('fix-elevated ausgeführt')).toBeVisible();
    await expect(warning).toHaveCount(0);
  });

  test('Logs von Worker, ngrok und Update', { tag: '@VPS-03' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    await page.goto('/vps');
    const output = page.getByTestId('vps-log-output');
    await expect(output).toContainText('[worker] Application startup complete.');

    await expect(output).toContainText('INFO:     [worker] Application startup complete.');
    await expect(output).not.toContainText('\u001b');
    await expect(output).not.toContainText('[32m');

    await page.getByRole('tab', { name: msg('vps.log.tab.ngrok') }).click();
    await expect(output).toContainText('[ngrok] Zeile 1');
    await page.getByRole('tab', { name: msg('vps.log.tab.update') }).click();
    await expect(output).toContainText('[update] Zeile 1');
    expect(mock.calls).toContain('GET logs?log=update&lines=300');
    await expect(page.getByTestId('vps-log-hint')).toHaveCount(0);
  });

  test('Log lädt mit dem Status neu und erklärt fehlendes ngrok-Log', { tag: '@VPS-03' }, async ({ page, worker }) => {
    void worker;
    await page.clock.install();
    const mock = await mockVps(page, {
      status: { ...STATUS, ngrok_watchdog: false },
      // Stand vor dem Fix: Antwort zu groß für ssh (maxBuffer)
      logs: { body: { ok: false, error: 'SSH fehlgeschlagen (Exit ERR_CHILD_PROCESS_STDIO_MAXBUFFER)' }, code: 502 },
    });
    await page.goto('/vps');
    const output = page.getByTestId('vps-log-output');
    await expect(output).toContainText('ERR_CHILD_PROCESS_STDIO_MAXBUFFER');

    // VPS hat sich inzwischen aktualisiert: der nächste Status-Poll holt das Log mit
    mock.logs = null;
    await page.clock.fastForward(16_000);
    await expect(output).toContainText('[worker] Application startup complete.');

    // ngrok ohne Neustart-Schleife schreibt kein ngrok.log -> Hinweis statt nur „keine Datei“
    mock.logs = { body: { ok: true, log: 'ngrok', lines: [], note: 'Noch keine Datei ngrok.log' }, code: 200 };
    await page.getByRole('tab', { name: msg('vps.log.tab.ngrok') }).click();
    await expect(output).toContainText('Noch keine Datei ngrok.log');
    await expect(page.getByTestId('vps-log-hint')).toContainText(msg('vps.action.restart'));
  });
});

test.describe('VPS Selbstheilung', () => {
  const tunnelTask = { exists: true, state: 'Ready' };

  test('Kachel zeigt Tunnel-Watchdog, Fehlschläge und letzten Auto-Reboot', { tag: '@VPS-10' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page, {
      status: {
        ...STATUS,
        tasks: { ...STATUS.tasks, tunnel: tunnelTask },
        tunnel_watchdog: {
          failures: 0,
          check_age_minutes: 2,
          last_check: '2026-09-30T10:05:00Z',
          last_ok: '2026-09-30T10:05:00Z',
          last_result: 'ok',
          last_action: '',
          reboots: [],
        },
      },
    });
    await page.goto('/vps');
    const tile = page.getByTestId('vps-tile-ngrok');
    const selfHeal = page.getByTestId('vps-self-heal');
    await expect(selfHeal).toHaveText(msg('vps.tile.selfHeal', { state: msg('vps.tile.selfHeal.ok') }));
    await expect(tile).toHaveAttribute('data-tone', 'success');

    // Öffentliche URL antwortet nicht mehr, ein Auto-Reboot liegt hinter uns -> Warnung
    mock.status = {
      ...mock.status,
      tunnel_watchdog: {
        failures: 2,
        check_age_minutes: 1,
        last_check: '2026-09-30T10:15:00Z',
        last_ok: '2026-09-30T10:05:00Z',
        last_result: 'tunnel-down',
        last_action: 'restart-ngrok',
        reboots: ['2026-09-29T03:10:00Z'],
      },
    };
    await page.getByRole('button', { name: msg('vps.refresh') }).click();
    await expect(selfHeal).toHaveText(
      msg('vps.tile.selfHeal', { state: msg('vps.tile.selfHeal.failing', { n: 2 }) }),
    );
    await expect(tile).toHaveAttribute('data-tone', 'warning');
    await expect(tile).toContainText(msg('vps.tile.selfHeal.lastReboot', { time: '' }).trim());

    await page.getByRole('tab', { name: msg('vps.log.tab.tunnel') }).click();
    await expect(page.getByTestId('vps-log-output')).toContainText('[tunnel] Zeile 1');
    expect(mock.calls).toContain('GET logs?log=tunnel&lines=300');

    // Aufgabe prüft seit 40 min nicht mehr (deaktiviert, keine Sitzung): sichtbar statt „ok“
    mock.status = {
      ...mock.status,
      tunnel_watchdog: { ...(mock.status.tunnel_watchdog as object), failures: 0, last_result: 'ok', check_age_minutes: 40 },
    };
    await page.getByRole('button', { name: msg('vps.refresh') }).click();
    await expect(selfHeal).toHaveText(msg('vps.tile.selfHeal', { state: msg('vps.tile.selfHeal.stale', { n: 40 }) }));
  });

  test('ohne Aufgabe AutoGrid-Tunnel: „nicht eingerichtet“', { tag: '@VPS-10' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page);
    await page.goto('/vps');
    await expect(page.getByTestId('vps-self-heal')).toHaveText(
      msg('vps.tile.selfHeal', { state: msg('vps.tile.selfHeal.missing') }),
    );
  });
});

test.describe('VPS Routen-Schutz', () => {
  // Öffentliche Version (Vercel): die Route bleibt zu, die Seite erklärt das statt ein rotes Fehlerpanel zu zeigen
  test('nicht-lokale Version: Hinweis statt Fehler', { tag: '@VPS-04' }, async ({ page, worker }) => {
    void worker;
    await page.route('**/api/vps/**', (route) =>
      route.fulfill({
        status: 403,
        json: { ok: false, error: 'VPS-Steuerung nur lokal (localhost) erlaubt', code: 'localOnly' },
      }),
    );
    await page.goto('/vps');
    await expect(page.getByTestId('vps-local-only')).toContainText(msg('vps.localOnly.title'));
    await expect(page.getByTestId('vps-status')).toBeHidden();
  });

  // Online-Steuerung über die Worker-API, wenn die SSH-Route zu ist (Vercel)
  test('Worker online steuern: Status, Log, Neustart', { tag: '@VPS-09' }, async ({ page, worker }) => {
    await page.route('**/api/vps/**', (route) =>
      route.fulfill({ status: 403, json: { ok: false, error: 'lokal', code: 'localOnly' } }),
    );
    await page.goto('/vps');
    const panel = page.getByTestId('vps-online');
    await expect(panel.getByTestId('vps-online-bots')).toContainText('1/');
    await expect(panel.getByTestId('vps-online-uptime')).toBeVisible();
    // Farbcodes von uvicorn werden entfernt
    await expect(panel.getByTestId('vps-online-log')).toHaveText('INFO:     Application startup complete.');

    await panel.getByTestId('vps-online-restart').click();
    await page.getByRole('dialog').getByRole('button', { name: msg('vps.action.restart') }).click();
    await expect.poll(() => worker.callsTo('POST', '/api/system/restart').length).toBe(1);
  });

  // Echter Testserver: fremder Host/fremde Origin wird abgewiesen, bevor irgendetwas per SSH läuft
  test('nur localhost und gleiche Origin', { tag: '@VPS-04' }, async ({ request }) => {
    const foreignHost = await request.get('/api/vps/status', { headers: { 'X-Forwarded-Host': 'evil.example' } });
    expect(foreignHost.status()).toBe(403);

    const noOrigin = await request.post('/api/vps/reboot');
    expect(noOrigin.status()).toBe(403);

    const foreignOrigin = await request.post('/api/vps/reboot', { headers: { Origin: 'https://evil.example' } });
    expect(foreignOrigin.status()).toBe(403);
    expect(await foreignOrigin.json()).toMatchObject({ ok: false, error: 'Ungültige Origin', code: 'badOrigin' });
  });
});

// Echter Zustand des Auto-Updates statt des Registry-Werts (Vorfall 2026-10-31: Kachel „alle 5 min“, Worker zog nichts)
test.describe('Auto-Update-Zustand', () => {
  const NOW = new Date('2026-11-01T00:00:00Z');
  const NOW_SEC = 1793491200;
  const RUNNING = { enabled: true, interval_minutes: 5, result: 'up_to_date', detail: '0.7.304', checked_at: NOW_SEC - 180 };

  const row = (page: Page) => page.getByTestId('vps-auto-update');

  async function openWith(page: Page, worker: MockWorker, autoUpdate: Record<string, unknown> | null) {
    await page.clock.setFixedTime(NOW);
    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { version: 'v0.7.304', uptime_sec: 60, supervised: true, bots_running: 0, bots_total: 1, ...(autoUpdate && { auto_update: autoUpdate }) },
    });
    const mock = await mockVps(page);
    await page.goto('/vps');
    return mock;
  }

  test('zeigt Ergebnis, Alter und Intervall des letzten Laufs', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, RUNNING);
    await expect(row(page)).toHaveAttribute('data-tone', 'success');
    await expect(row(page)).toContainText(msg('vps.autoUpdate.state.current'));
    await expect(page.getByTestId('vps-auto-update-when')).toHaveText(
      `${msg('vps.autoUpdate.lastRun', { age: msg('vps.autoUpdate.ago.min', { n: 3 }) })} · ${msg('vps.tile.autoUpdate.every', { minutes: 5 })}`,
    );
    await expect(page.getByTestId('vps-auto-update-detail')).toBeHidden();
    // Die Kachel widerspricht nicht mehr: der Registry-Wert steht dort nicht länger
    await expect(page.getByTestId('vps-tile-version')).not.toContainText(msg('vps.tile.autoUpdate.every', { minutes: 5 }));
  });

  test('ein alter Lauf fällt auf, 15 Minuten gelten noch als pünktlich', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, checked_at: NOW_SEC - 15 * 60 });
    await expect(row(page)).toHaveAttribute('data-state', 'current');

    await openWith(page, worker, { ...RUNNING, checked_at: NOW_SEC - 16 * 60 });
    await expect(row(page)).toHaveAttribute('data-state', 'overdue');
    await expect(row(page)).toHaveAttribute('data-tone', 'danger');
    await expect(row(page)).toContainText(msg('vps.autoUpdate.state.overdue'));
  });

  test('die Grenze wächst mit dem Intervall', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, interval_minutes: 60, checked_at: NOW_SEC - 179 * 60 });
    await expect(row(page)).toHaveAttribute('data-state', 'current');

    await openWith(page, worker, { ...RUNNING, interval_minutes: 60, checked_at: NOW_SEC - 181 * 60 });
    await expect(row(page)).toHaveAttribute('data-state', 'overdue');
  });

  test('überfällig nennt das Alter in Tagen und das Datum', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, checked_at: NOW_SEC - 3 * 86_400 });
    const when = page.getByTestId('vps-auto-update-when');
    await expect(when).toContainText(msg('vps.autoUpdate.ago.days', { n: 3 }));
    await expect(when).toContainText('2026');
  });

  test('„Aus“ nennt den Grund und schlägt „überfällig“', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, enabled: false, interval_minutes: 0, result: 'off', checked_at: NOW_SEC - 86_400 });
    await expect(row(page)).toHaveAttribute('data-state', 'offInterval');
    await expect(row(page)).toHaveAttribute('data-tone', 'warning');

    // Ohne Neustart-Schleife läuft die Schleife gar nicht: der Stempel vom Start ist kein Fehler
    await openWith(page, worker, { ...RUNNING, enabled: false, result: 'off', checked_at: NOW_SEC - 86_400 });
    await expect(row(page)).toHaveAttribute('data-state', 'offUnsupervised');
    await expect(page.getByTestId('vps-auto-update-when')).toBeHidden();
  });

  test('vor dem ersten Lauf: eingeschaltet, kein „Letzter Lauf“', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, result: 'on', detail: '', checked_at: NOW_SEC });
    await expect(row(page)).toHaveAttribute('data-state', 'pending');
    await expect(page.getByTestId('vps-auto-update-when')).toHaveText(msg('vps.tile.autoUpdate.every', { minutes: 5 }));
  });

  test('Pause und Fehler zeigen den Text des Workers', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, result: 'local_commits', detail: '0.7.300 → 0.7.304' });
    await expect(row(page)).toHaveAttribute('data-tone', 'warning');
    await expect(row(page)).toContainText(msg('vps.autoUpdate.state.localCommits'));
    await expect(page.getByTestId('vps-auto-update-detail')).toHaveText('0.7.300 → 0.7.304');

    await openWith(page, worker, { ...RUNNING, result: 'other_branch', detail: 'feature/test' });
    await expect(row(page)).toHaveAttribute('data-state', 'otherBranch');
    await expect(row(page)).toHaveAttribute('data-tone', 'warning');

    await openWith(page, worker, { ...RUNNING, result: 'check_failed', detail: 'git fetch hatası' });
    await expect(row(page)).toHaveAttribute('data-state', 'checkFailed');
    await expect(row(page)).toHaveAttribute('data-tone', 'danger');

    await openWith(page, worker, { ...RUNNING, result: 'pull_failed', detail: 'Permission denied' });
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');
    await expect(page.getByTestId('vps-auto-update-detail')).toHaveText('Permission denied');
  });

  test('ohne Antwort des Workers: unbekannt, mit dem eingestellten Wert aus SSH', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, null);
    await expect(row(page)).toHaveAttribute('data-state', 'unknown');
    await expect(row(page)).toHaveAttribute('data-tone', 'neutral');
    await expect(page.getByTestId('vps-auto-update-when')).toHaveText(
      msg('vps.autoUpdate.configured', { state: msg('vps.tile.autoUpdate.every', { minutes: 5 }) }),
    );

    worker.overrides.delete('GET /api/system/worker/status');
    worker.offline = true;
    await page.reload();
    await expect(row(page)).toHaveAttribute('data-state', 'unknown');
  });

  test('fällt SSH aus, liest die Zeile den Worker weiter', { tag: '@UPD-07' }, async ({ page, worker }) => {
    const mock = await openWith(page, worker, RUNNING);
    await expect(row(page)).toHaveAttribute('data-state', 'current');

    mock.status = { ok: false, error: 'SSH-Zeitüberschreitung' };
    mock.statusCode = 500;
    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { auto_update: { ...RUNNING, result: 'pull_failed', detail: 'Permission denied' } },
    });
    await page.getByRole('button', { name: msg('vps.refresh') }).click();
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');
  });

  test('ein unbekanntes Ergebnis eines neueren Workers zeigt „unbekannt“', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, result: 'neuer_wert' });
    await expect(row(page)).toHaveAttribute('data-state', 'unknown');
    await expect(row(page)).toContainText(msg('vps.autoUpdate.state.unknown'));
  });

  test('das Online-Panel zeigt dieselbe Zeile', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await page.clock.setFixedTime(NOW);
    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { version: 'v0.7.304', uptime_sec: 60, supervised: true, bots_running: 0, bots_total: 1, auto_update: { ...RUNNING, result: 'pull_failed', detail: 'Permission denied' } },
    });
    await page.route('**/api/vps/**', (route) =>
      route.fulfill({ status: 403, json: { ok: false, error: 'lokal', code: 'localOnly' } }),
    );
    await page.goto('/vps');
    const panelRow = page.getByTestId('vps-online').getByTestId('vps-auto-update');
    await expect(panelRow).toHaveAttribute('data-state', 'pullFailed');
    await expect(panelRow).toContainText(msg('vps.autoUpdate.state.pullFailed'));
  });
});
