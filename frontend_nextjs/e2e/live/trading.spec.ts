/**
 * Live-Handelstests auf dem DEMO-Konto. Laufen NUR mit E2E_LIVE_DEMO=1 und nur, wenn alle
 * Sicherheitsprüfungen bestehen (RULES.md §3):
 *
 *   1. E2E_LIVE_DEMO=1 (bewusst gesetzt)
 *   2. hooks/test-account.local.md: Tür DEMO, und der Worker meldet env_type DEMO (Fixture `account`)
 *   3. Markt offen, Bot läuft und ist mit MT5 verbunden
 *   4. Keine bestehende aktive Zone deckt den aktuellen Preis ab (sonst würde die Engine sie
 *      statt der Testzone bedienen – bestehende Zonen werden nie verändert)
 *
 * Ablauf: Einstellungen + ui-state sichern → Testzone ANHÄNGEN (0,01 Lot, je 1 Level, max. 1
 * Position) → Orders (ENG-05) → Pause/Start über die Oberfläche (ZON-08) → Zone vom Preis
 * wegschieben (ENG-10, „Otomatik temizlendi“) → Einstellungen wiederherstellen.
 * Die Testzone wird nur angehängt: vorne einfügen würde die Magic-Numbers bestehender Zonen
 * verschieben (200000 + Index + 1).
 *
 * BOT-01/02 (Stop + Start) unterbrechen den laufenden Bot kurz; nur mit zusätzlich
 * E2E_LIVE_BOT_RESTART=1.
 */
import { LiveWorker, expect, test, type LiveZone } from './live';
import { msg } from '../fixtures/i18n';

const DEMO_ENABLED = process.env.E2E_LIVE_DEMO === '1';
const RESTART_ENABLED = process.env.E2E_LIVE_BOT_RESTART === '1';
const TEST_ZONE_ID = 'e2e-live-test-zone';

test.describe.configure({ mode: 'serial' });

/** Zustand vor dem Test, zum Wiederherstellen. */
interface Snapshot {
  settings: Record<string, unknown>;
  zones: LiveZone[];
  uiStates: Record<string, string>;
}

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs: number, what: string): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last = await fn();
  while (!ok(last)) {
    if (Date.now() > until) throw new Error(`Zeitüberschreitung: ${what} (letzter Wert: ${JSON.stringify(last)})`);
    await new Promise((r) => setTimeout(r, 2_000));
    last = await fn();
  }
  return last;
}

/**
 * ui-state vollständig schreiben: jede bestehende Zone behält ihren aktuellen Zustand.
 * Hintergrund: Fehlt eine Zone in der Datei, setzt die Engine (grid_zone_state) sie auf CLEAR
 * und löscht ihre Orders. Deshalb nie nur den Eintrag der Testzone schreiben.
 */
async function writeFullUiState(api: LiveWorker, accountId: string, zones: LiveZone[], extra: Record<string, string>) {
  const { metrics } = await api.botStatus(accountId);
  const current = await api.uiStates(accountId);
  const states: Record<string, string> = {};
  zones.forEach((zone, i) => {
    states[String(i)] =
      current[String(i)] ?? metrics.zone_states?.[String(i)] ?? (zone.is_active === false ? 'PAUSE' : 'START');
  });
  await api.post(`/ui-state/${accountId}`, { settings: { states: { ...states, ...extra } } });
}

test.describe('Live-Handel (DEMO)', () => {
  test.skip(!DEMO_ENABLED, 'Handelstests nur mit E2E_LIVE_DEMO=1');

  let snapshot: Snapshot | null = null;
  let testIdx = -1;
  let accountId = '';

  test('Sicherheitsprüfungen', async ({ api, account }) => {
    const status = await api.botStatus(account.id);
    test.skip(!status.bot_running || !status.metrics.mt5_connected, 'Bot läuft nicht / nicht mit MT5 verbunden');
    test.skip(!status.metrics.market_open, 'Markt geschlossen');
    test.skip(Boolean(status.metrics.remote_paused), 'Bot per Telefon gestoppt (remote_paused)');

    const settings = await api.settings(account.id);
    const zones = settings.ZONES ?? [];
    const price = Number(status.metrics.current_price);
    expect(price).toBeGreaterThan(0);
    const covering = zones.findIndex(
      (z) => z.is_active !== false && z.min_price <= price && price <= z.max_price && z.id !== TEST_ZONE_ID,
    );
    test.skip(
      covering >= 0,
      `Zone ${covering + 1} (${zones[covering]?.symbol} ${zones[covering]?.min_price}–${zones[covering]?.max_price}) ` +
        `deckt den Preis ${price} ab; die Testzone würde nie aktiv. Eigenes DEMO-Testkonto verwenden ` +
        `oder die Zone so einschränken, dass ein freier Preisbereich bleibt.`,
    );
    expect(zones.some((z) => z.id === TEST_ZONE_ID), 'Testzone von einem abgebrochenen Lauf vorhanden').toBe(false);

    snapshot = { settings, zones, uiStates: await api.uiStates(account.id) };
    accountId = account.id;
  });

  test.afterAll(async ({ playwright }) => {
    if (!snapshot) return;
    // Eigener Request-Kontext: der `request` der Tests ist hier schon geschlossen
    const request = await playwright.request.newContext();
    try {
      const api = new LiveWorker(request);
      // Testzone entfernen (bestehende Zonen exakt wie vorher) und ihren Zustand neutral setzen.
      // Übrig gebliebene Orders mit der Magic der Testzone räumt clean_zombie_orders ab.
      await api.post(`/settings/${accountId}`, { settings: { ...snapshot.settings, ZONES: snapshot.zones } });
      if (testIdx >= 0) {
        await api.post(`/ui-state/${accountId}`, { settings: { states: { [String(testIdx)]: 'START' } } });
      }
      const after = await api.settings(accountId);
      expect(after.ZONES).toEqual(snapshot.zones);
    } finally {
      await request.dispose();
    }
  });

  test('Testzone setzt Orders mit TP (Platzierung)', { tag: '@ENG-05' }, async ({ api, account, dashboard }) => {
    test.skip(!snapshot, 'Sicherheitsprüfungen nicht bestanden');
    const { zones } = snapshot!;
    const base = await api.botStatus(account.id);
    const price = Number(base.metrics.current_price);
    const symbol = zones[0]?.symbol ?? 'USOUSD';
    testIdx = zones.length;

    // Zuerst ui-state vollständig schreiben, dann die Zone anhängen
    await writeFullUiState(api, account.id, zones, { [String(testIdx)]: 'START' });
    const testZone: LiveZone = {
      ...(zones[0] ?? {}),
      id: TEST_ZONE_ID,
      is_active: true,
      symbol,
      order_type: 'BUY',
      min_price: Number((price - 1).toFixed(3)),
      max_price: Number((price + 1).toFixed(3)),
      grid_step: 0.3,
      lot_size: 0.01,
      take_profit: 0.3,
      stop_loss: 0,
      sync_buy_sell: true,
      is_breakout: false,
      levels_below: 1,
      levels_above: 1,
      max_positions: 1,
      clear_on_exit: true,
      clear_exit_side: 'Farketmez',
      clear_scope: 'Sadece Bekleyen Emirler',
      clear_target_side: 'Farketmez (Hepsi)',
      exit_condition: 'Anlık Fiyat',
    };
    await api.post(`/settings/${account.id}`, { settings: { ZONES: [...zones, testZone] } });

    const basePending = Number(base.metrics.pending_orders ?? 0);
    await waitFor(
      () => api.botStatus(account.id),
      (s) => Number(s.metrics.pending_orders ?? 0) > basePending,
      60_000,
      'neue Pending Orders der Testzone',
    );
    const logs = await api.logs(account.id);
    expect(logs.robot_log.join('\n')).toContain(`Bölge ${testIdx + 1}`);

    await dashboard.open(account.id);
    await expect(dashboard.zone(testIdx).getByRole('button', { name: msg('zone.header.started') })).toBeVisible();
  });

  test('Pause/Start der Testzone über die Oberfläche', { tag: '@ZON-08' }, async ({ api, account, dashboard }) => {
    test.skip(!snapshot || testIdx < 0, 'Testzone fehlt');
    await dashboard.open(account.id);
    const zone = dashboard.zone(testIdx);
    await zone.getByRole('button', { name: msg('zone.header.started') }).click();
    await expect(zone.getByRole('button', { name: msg('zone.header.start'), exact: true })).toBeVisible();
    await waitFor(() => api.uiStates(account.id), (s) => s[String(testIdx)] === 'PAUSE', 20_000, 'PAUSE im ui-state');
    // Bestehende Zonen bleiben unverändert gestartet
    const states = await api.uiStates(account.id);
    snapshot!.zones.forEach((_, i) => expect(states[String(i)]).not.toBe('CLEAR'));

    await zone.getByRole('button', { name: msg('zone.header.start'), exact: true }).click();
    await expect(zone.getByRole('button', { name: msg('zone.header.started') })).toBeVisible();
    await waitFor(() => api.uiStates(account.id), (s) => s[String(testIdx)] === 'START', 20_000, 'START im ui-state');
  });

  test('Zone verlassen: Orders gelöscht, „Otomatik temizlendi“', { tag: '@ENG-10' }, async ({ api, account, dashboard }) => {
    test.skip(!snapshot || testIdx < 0, 'Testzone fehlt');
    const now = await api.botStatus(account.id);
    const price = Number(now.metrics.current_price);
    const settings = await api.settings(account.id);
    const zones = (settings.ZONES ?? []).map((z) =>
      z.id === TEST_ZONE_ID ? { ...z, min_price: Number((price + 5).toFixed(3)), max_price: Number((price + 6).toFixed(3)) } : z,
    );
    await api.post(`/settings/${account.id}`, { settings: { ZONES: zones } });

    await waitFor(
      () => api.botStatus(account.id),
      (s) => s.metrics.zone_states?.[String(testIdx)] === 'AUTO_CLEAR',
      60_000,
      'AUTO_CLEAR der Testzone',
    );
    await dashboard.open(account.id);
    await expect(dashboard.zone(testIdx).getByText(msg('zone.stop.autoClear.label'))).toBeVisible();
    // Die bestehenden Zonen laufen weiter
    const after = await api.botStatus(account.id);
    snapshot!.zones.forEach((_, i) => expect(after.metrics.zone_states?.[String(i)]).not.toMatch(/CLEAR|PAUSE/));
  });
});

test.describe('Live Bot Stop/Start (DEMO)', () => {
  test.skip(!DEMO_ENABLED || !RESTART_ENABLED, 'Nur mit E2E_LIVE_DEMO=1 und E2E_LIVE_BOT_RESTART=1');

  test('Bot stoppen und wieder starten', { tag: ['@BOT-01', '@BOT-02'] }, async ({ page, api, account, dashboard }) => {
    test.setTimeout(300_000);
    const before = await api.botStatus(account.id);
    test.skip(!before.bot_running, 'Bot läuft nicht – Stop/Start-Test startet keinen fremden Bot');
    const positionsBefore = Number(before.metrics.open_positions ?? 0);

    try {
      await dashboard.open(account.id);
      const controls = page.getByTestId('bot-controls');
      await controls.getByRole('button', { name: msg('bot.stop') }).click();
      await page.getByRole('dialog').getByRole('button', { name: msg('bot.disconnect.confirm') }).click();
      await waitFor(() => api.botStatus(account.id), (s) => !s.bot_running, 60_000, 'Bot gestoppt');
      await dashboard.refreshLogs();
      await expect(dashboard.botStatus).toHaveText(msg('bot.status.stopped'));

      await controls.getByRole('button', { name: msg('bot.start') }).click();
      await expect(dashboard.botStatus).toHaveText(msg('bot.status.running'), { timeout: 180_000 });
      // Positionen bleiben beim Broker (Stop schließt nichts); TP kann zwischendurch Positionen schließen
      const after = await api.botStatus(account.id);
      if (positionsBefore > 0) expect(Number(after.metrics.open_positions ?? 0)).toBeGreaterThan(0);
    } finally {
      // Nie gestoppt zurücklassen
      const status = await api.botStatus(account.id);
      if (!status.bot_running) await api.post(`/start?account_id=${account.id}`);
    }
  });
});
