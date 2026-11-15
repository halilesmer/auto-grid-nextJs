/**
 * VPS · Fernsteuerung des Windows-VPS im Einstellungsfenster, Abschnitt „VPS und System“ (Plan 1115-A9; /vps leitet dorthin um).
 *
 * Die Route /api/vps/* (Next.js-Server, führt SSH aus) wird im Browser gemockt – im Test läuft
 * kein SSH. Nur der Routen-Schutz (VPS-04) spricht den echten Testserver an.
 */
import type { Page, Route } from '@playwright/test';
import { expect, test, type MockWorker } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

type SystemTab = 'status' | 'update' | 'restart' | 'logs';

/** Einstellungsfenster öffnen, Abschnitt „VPS und System“ wählen, dann den Tab. */
async function openSystem(page: Page, tab: SystemTab = 'status') {
  await page.goto('/');
  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings-nav-system').click();
  if (tab !== 'status') await page.getByTestId(`settings-tab-${tab}`).click();
}

const localOnly = (page: Page) =>
  page.route('**/api/vps/**', (route) => route.fulfill({ status: 403, json: { ok: false, error: 'lokal', code: 'localOnly' } }));

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
  /** Antwort für POST fix-elevated; null = ok */
  fixElevated: { body: Record<string, unknown>; code: number } | null;
}

async function mockVps(page: Page, overrides: Partial<VpsMock> = {}): Promise<VpsMock> {
  const mock: VpsMock = { calls: [], status: { ...STATUS }, statusCode: 200, logs: null, fixElevated: null, ...overrides };
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
    if (action.startsWith('fix-elevated') && mock.fixElevated) return reply(mock.fixElevated.body, mock.fixElevated.code);
    if (req.method() === 'POST') return reply({ ok: true, message: `${action}${url.search} ausgeführt` });
    return reply({ ok: false, error: 'unbekannt' }, 404);
  });
  return mock;
}

test.describe('VPS und System: Status', () => {
  test('Worker über den Worker, VPS-Zeilen über SSH', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page);
    await openSystem(page);
    await expect(page.getByTestId('sys-worker-state')).toHaveAttribute('data-tone', 'success');
    await expect(page.getByTestId('sys-worker-state')).toContainText(msg('sdlg.sys.worker.running'));
    await expect(page.getByTestId('sys-bots-state')).toContainText(msg('sdlg.sys.bots.value', { running: 1, stopped: 0 }).split(' ')[0]);
    await expect(page.getByTestId('sys-loop-state')).toContainText(msg('sdlg.sys.loop.on'));
    await expect(page.getByTestId('sys-ngrok-state')).toContainText('example-tunnel-subdomain');
    await expect(page.getByTestId('sys-autostart-state')).toContainText(msg('vps.tile.autostart.ok'));
    await expect(page.getByTestId('sys-elevated-state')).toContainText(msg('sdlg.sys.elevated.none'));
    await expect(page.getByTestId('sys-ssh-note')).toHaveCount(0);
  });

  test('SSH fällt aus: die Worker-Zeilen bleiben, die VPS-Zeilen nennen den Fehler', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    mock.status = { ok: false, error: 'SSH fehlgeschlagen (Exit 255): Connection timed out' };
    mock.statusCode = 502;
    await openSystem(page);
    await expect(page.getByTestId('sys-worker-state')).toContainText(msg('sdlg.sys.worker.running'));
    await expect(page.getByTestId('sys-row-ngrok')).toContainText(msg('vps.status.unreachable'));
    await expect(page.getByTestId('sys-row-ngrok')).toContainText('Connection timed out');
  });

  test('Ohne VPS_SSH_HOST: Zeilen gesperrt, Hinweis nennt den Grund', { tag: '@VPS-01' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page, { status: { ok: false, error: 'VPS-Steuerung deaktiviert: VPS_SSH_HOST fehlt in .env.local' }, statusCode: 404 });
    await openSystem(page, 'restart');
    await expect(page.getByTestId('sys-ssh-note').first()).toContainText('VPS_SSH_HOST');
    await expect(page.getByTestId('sys-restart-ngrok')).toBeDisabled();
    await expect(page.getByTestId('sys-restart-reboot')).toBeDisabled();
    await expect(page.getByTestId('sys-restart-worker')).toBeEnabled();
  });

  test('Kennt die Oberfläche den Admin nicht (Worker aus), bleibt „VPS und System“ über /vps erreichbar', { tag: '@VPS-01' }, async ({ page, worker }) => {
    worker.offline = true;
    await mockVps(page);
    await page.goto('/vps');
    await expect(page.getByTestId('settings-pane')).toHaveAttribute('data-section', 'system');
    await expect(page.getByTestId('sys-worker-state')).toContainText(msg('sdlg.sys.worker.down'));
    await expect(page.getByTestId('sys-ngrok-state')).toContainText('example-tunnel-subdomain');
    await expect(page.getByTestId('settings-nav-users')).toHaveCount(0);
  });
});

test.describe('VPS und System: Weiterleitung', () => {
  test('/vps öffnet die App und das Einstellungsfenster im Abschnitt „VPS und System“', { tag: '@VPS-11' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page);
    await page.goto('/vps');
    await expect(page.getByTestId('settings-dialog')).toBeVisible();
    await expect(page.getByTestId('settings-pane')).toHaveAttribute('data-section', 'system');
    await expect(page.getByTestId('settings-title')).toHaveText(msg('sdlg.sec.system'));
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('VPS und System: Aktionen', () => {
  test('Neustart von ngrok und VPS fragt nach; Abbrechen löst nichts aus', { tag: '@VPS-02' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    await openSystem(page, 'restart');
    for (const [testId, action, confirm] of [
      ['sys-restart-ngrok', 'restart-ngrok', msg('vps.action.restartNgrok')],
      ['sys-restart-reboot', 'reboot', msg('vps.action.reboot')],
    ] as const) {
      await page.getByTestId(testId).click();
      const dialog = page.getByRole('dialog').last();
      await expect(dialog).toContainText(`${confirm}?`);
      // Der Dialog nennt die laufenden Bots
      await expect(dialog).toContainText('12345678');
      await dialog.getByRole('button', { name: confirm }).click();
      await expect.poll(() => mock.calls).toContain(`POST ${action}`);
      await expect(page.getByText(`${action} ausgeführt`)).toBeVisible();
    }
    const before = mock.calls.filter((c) => c.startsWith('POST')).length;
    await page.getByTestId('sys-restart-reboot').click();
    await page.getByRole('dialog').last().getByRole('button', { name: msg('common.cancel') }).click();
    expect(mock.calls.filter((c) => c.startsWith('POST'))).toHaveLength(before);
  });

  test('Worker neu starten geht über den Worker, auch ohne SSH', { tag: '@VPS-09' }, async ({ page, worker }) => {
    await localOnly(page);
    await openSystem(page, 'restart');
    await page.getByTestId('sys-restart-worker').click();
    await page.getByRole('dialog').last().getByRole('button', { name: msg('vps.action.restart') }).click();
    await expect.poll(() => worker.callsTo('POST', '/api/system/restart').length).toBe(1);
  });

  test('Antwortet der Worker nicht, startet derselbe Knopf ihn per SSH neu', { tag: '@VPS-02' }, async ({ page, worker }) => {
    worker.offline = true;
    const mock = await mockVps(page);
    await openSystem(page, 'restart');
    await expect(page.getByTestId('sys-restart-worker')).toBeEnabled();
    await page.getByTestId('sys-restart-worker').click();
    await page.getByRole('dialog').last().getByRole('button', { name: msg('vps.action.restart') }).click();
    await expect.poll(() => mock.calls).toContain('POST restart');
  });

  test('Update: Prüfung und Dialog laufen über den Worker', { tag: '@VPS-02' }, async ({ page, worker }) => {
    await localOnly(page);
    await openSystem(page, 'update');
    await expect(page.getByTestId('settings-version')).toBeVisible();
    await page.getByTestId('settings-sys-apply').click();
    await expect.poll(() => worker.callsTo('GET', '/api/system/update/check').length).toBeGreaterThan(0);
    await expect(page.getByRole('dialog').last()).toBeVisible();
  });
});

test.describe('VPS und System: Sperre außerhalb von localhost', () => {
  test('SSH-Zeilen sichtbar aber gesperrt, Hinweis nennt den Grund, Worker-Teile laufen', { tag: '@VPS-04' }, async ({ page, worker }) => {
    void worker;
    await localOnly(page);
    await openSystem(page);
    await expect(page.getByTestId('sys-ssh-note').first()).toContainText(msg('sdlg.sys.ssh.note.local').slice(0, 20));
    await expect(page.getByTestId('sys-row-ngrok')).toContainText(msg('sdlg.sys.ssh.locked'));
    await expect(page.getByTestId('sys-worker-state')).toContainText(msg('sdlg.sys.worker.running'));

    await page.getByTestId('settings-tab-restart').click();
    await expect(page.getByTestId('sys-restart-ngrok')).toBeDisabled();
    await expect(page.getByTestId('sys-restart-reboot')).toBeDisabled();
    await expect(page.getByTestId('sys-restart-worker')).toBeEnabled();

    await page.getByTestId('settings-tab-logs').click();
    await expect(page.getByTestId('sys-log-output')).toContainText('Application startup complete.');
    await page.getByTestId('sys-log-source-ngrok').click();
    await expect(page.getByTestId('sys-log-output')).toContainText(msg('sdlg.sys.ssh.locked'));
    await expect(page.getByTestId('sys-log-refresh')).toBeDisabled();
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

test.describe('VPS und System: Admin-Reste', () => {
  test('Warnung und Beenden mit Bestätigung', { tag: '@VPS-07' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    await openSystem(page);
    await expect(page.getByTestId('sys-elevated-state')).toContainText(msg('sdlg.sys.elevated.none'));
    await expect(page.getByTestId('vps-elevated')).toHaveCount(0);

    mock.status = { ...STATUS, elevated: [{ pid: 5068, role: 'worker-loop', account: '' }, { pid: 5070, role: 'ngrok-loop', account: '' }] };
    await page.getByTestId('sys-refresh').click();
    await expect(page.getByTestId('vps-elevated')).toContainText(msg('vps.elevated.title', { count: 2 }));
    await expect(page.getByTestId('sys-elevated-state')).toContainText(msg('sdlg.sys.elevated.count', { count: 2 }));
    await expect(page.getByTestId('vps-elevated-stop')).toHaveCount(0);
    await page.getByTestId('vps-action-fix-elevated').click();
    const loops = page.getByRole('dialog').last();
    await expect(loops).toContainText(msg('vps.elevated.infoNoBots'));
    await loops.getByRole('button', { name: msg('vps.elevated.fix') }).click();
    await expect.poll(() => mock.calls).toContain('POST fix-elevated');

    mock.calls.length = 0;
    mock.status = { ...STATUS, elevated: [{ pid: 5068, role: 'worker-loop', account: '' }, { pid: 7272, role: 'bot', account: '87654321' }, { pid: 7300, role: 'mt5', account: '' }] };
    await page.getByTestId('sys-refresh').click();
    await expect(page.getByTestId('vps-elevated-stop')).toContainText('Bot 87654321');
    await page.getByTestId('vps-action-fix-elevated').click();
    const dialog = page.getByRole('dialog').last();
    const confirm = dialog.getByRole('button', { name: msg('vps.elevated.fixWithBots') });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('checkbox').click();
    await expect(confirm).toBeEnabled();
    mock.status = { ...STATUS, elevated: [] };
    await confirm.click();
    await expect.poll(() => mock.calls).toContain('POST fix-elevated?stopBots=1');
    await expect(page.getByTestId('vps-elevated')).toHaveCount(0);
  });

  test('veraltete Liste, Skript beendet nichts (409)', { tag: '@VPS-07' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page, {
      status: { ...STATUS, elevated: [{ pid: 5068, role: 'worker-loop', account: '' }] },
      fixElevated: { code: 409, body: { ok: false, code: 'botsElevated', error: 'Bots oder MT5 laufen mit Adminrechten - nichts beendet.', elevated: [{ pid: 7272, role: 'bot', account: '87654321' }] } },
    });
    await openSystem(page);
    await page.getByTestId('vps-action-fix-elevated').click();
    await page.getByRole('dialog').last().getByRole('button', { name: msg('vps.elevated.fix') }).click();
    await expect.poll(() => mock.calls).toContain('POST fix-elevated');
    await expect(page.getByText(msg('vps.err.botsElevated.title'))).toBeVisible();
  });
});

test.describe('VPS und System: Logs', () => {
  test('Worker-Log über den Worker, ngrok-Log über SSH; Farbcodes entfernt', { tag: '@VPS-03' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page);
    await openSystem(page, 'logs');
    const output = page.getByTestId('sys-log-output');
    await expect(output).toHaveText('INFO:     Application startup complete.');
    await expect(output).not.toContainText('\u001b');

    await page.getByTestId('sys-log-source-ngrok').click();
    await expect(output).toContainText('[ngrok] Zeile 1');
    await expect(output).toContainText('INFO:     [ngrok] Application startup complete.');
    await expect(output).not.toContainText('[32m');
    expect(mock.calls).toContain('GET logs?log=ngrok&lines=300');
  });

  test('Log-Kasten scrollt in sich, die Seite nicht', { tag: '@VPS-03' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await openSystem(page, 'logs');
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
    await expect(page.getByTestId('sys-log-output')).toHaveCSS('overflow-x', 'auto');
  });
});

test.describe('VPS und System: Selbstheilung', () => {
  const tunnelTask = { exists: true, state: 'Ready' };

  test('Zeile zeigt Tunnel-Watchdog, Fehlschläge und letzten Auto-Reboot', { tag: '@VPS-10' }, async ({ page, worker }) => {
    void worker;
    const mock = await mockVps(page, {
      status: {
        ...STATUS,
        tasks: { ...STATUS.tasks, tunnel: tunnelTask },
        tunnel_watchdog: { failures: 0, check_age_minutes: 2, last_check: '2026-09-30T10:05:00Z', last_ok: '2026-09-30T10:05:00Z', last_result: 'ok', last_action: '', reboots: [] },
      },
    });
    await openSystem(page);
    const heal = page.getByTestId('sys-heal-state');
    await expect(heal).toContainText(msg('vps.tile.selfHeal.ok'));
    await expect(heal).toHaveAttribute('data-tone', 'success');

    mock.status = {
      ...mock.status,
      tunnel_watchdog: { failures: 2, check_age_minutes: 1, last_check: '2026-09-30T10:15:00Z', last_ok: '2026-09-30T10:05:00Z', last_result: 'tunnel-down', last_action: 'restart-ngrok', reboots: ['2026-09-29T03:10:00Z'] },
    };
    await page.getByTestId('sys-refresh').click();
    await expect(heal).toContainText(msg('vps.tile.selfHeal.failing', { n: 2 }));
    await expect(heal).toHaveAttribute('data-tone', 'warning');
    await expect(heal).toContainText(msg('vps.tile.selfHeal.lastReboot', { time: '' }).trim());
  });

  test('ohne Aufgabe AutoGrid-Tunnel: „nicht eingerichtet“', { tag: '@VPS-10' }, async ({ page, worker }) => {
    void worker;
    await mockVps(page);
    await openSystem(page);
    await expect(page.getByTestId('sys-heal-state')).toContainText(msg('vps.tile.selfHeal.missing'));
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
    await openSystem(page, 'update');
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
    await openSystem(page, 'update');
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
    await page.getByTestId('settings-tab-status').click();
    await page.getByTestId('sys-refresh').click();
    await page.getByTestId('settings-tab-update').click();
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');
  });

  test('ein unbekanntes Ergebnis eines neueren Workers zeigt „unbekannt“', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await openWith(page, worker, { ...RUNNING, result: 'neuer_wert' });
    await expect(row(page)).toHaveAttribute('data-state', 'unknown');
    await expect(row(page)).toContainText(msg('vps.autoUpdate.state.unknown'));
  });

  test('ohne SSH von Anfang an zeigt die Seite die Zeile trotzdem', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await page.clock.setFixedTime(NOW);
    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { auto_update: { ...RUNNING, result: 'pull_failed', detail: 'Permission denied' } },
    });
    await mockVps(page, { status: { ok: false, error: 'SSH-Zeitüberschreitung' }, statusCode: 502 });
    await openSystem(page, 'update');
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');
  });

  test('eine späte alte Antwort überschreibt keinen neueren Zustand', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await page.clock.setFixedTime(NOW);
    worker.overrides.set('GET /api/system/worker/status', { status: 200, body: { auto_update: RUNNING }, delayMs: 1500 });
    await mockVps(page);
    const isWorkerStatus = (url: string) => url.endsWith('/api/system/worker/status');
    let finished = 0;
    page.on('requestfinished', (req) => {
      if (req.method() === 'GET' && isWorkerStatus(req.url())) finished += 1;
    });
    await openSystem(page, 'update');
    // Erst wenn der Mock die erste Anfrage hat: sie muss die verzögerte Antwort bekommen
    await expect.poll(() => worker.callsTo('GET', '/api/system/worker/status').length).toBe(1);

    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { auto_update: { ...RUNNING, result: 'pull_failed', detail: 'Permission denied' } },
    });
    await page.getByTestId('settings-tab-status').click();
    await page.getByTestId('sys-refresh').click();
    await page.getByTestId('settings-tab-update').click();
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');

    await expect.poll(() => finished).toBe(2);
    // Nichts Sichtbares zeigt, dass die Antwort verworfen wurde: kurzes Fenster, damit React sie verarbeitet hätte
    await page.waitForTimeout(300);
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');
  });

  test('ohne SSH meldet die Zeile „unbekannt“, wenn der Worker wegbricht', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await page.clock.setFixedTime(NOW);
    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { version: 'v0.7.304', uptime_sec: 60, supervised: true, bots_running: 0, bots_total: 1, auto_update: RUNNING },
    });
    await localOnly(page);
    await openSystem(page, 'update');
    await expect(row(page)).toHaveAttribute('data-state', 'current');

    worker.offline = true;
    await page.getByTestId('settings-tab-status').click();
    await page.getByTestId('sys-refresh').click();
    await expect(page.getByTestId('sys-worker-state')).toContainText(msg('sdlg.sys.worker.stale'));
    await page.getByTestId('settings-tab-update').click();
    await expect(row(page)).toHaveAttribute('data-state', 'unknown');
  });

  test('ohne SSH zeigt dieselbe Zeile den Fehler des Workers', { tag: '@UPD-07' }, async ({ page, worker }) => {
    await page.clock.setFixedTime(NOW);
    worker.overrides.set('GET /api/system/worker/status', {
      status: 200,
      body: { version: 'v0.7.304', uptime_sec: 60, supervised: true, bots_running: 0, bots_total: 1, auto_update: { ...RUNNING, result: 'pull_failed', detail: 'Permission denied' } },
    });
    await localOnly(page);
    await openSystem(page, 'update');
    await expect(row(page)).toHaveAttribute('data-state', 'pullFailed');
    await expect(row(page)).toContainText(msg('vps.autoUpdate.state.pullFailed'));
  });
});
