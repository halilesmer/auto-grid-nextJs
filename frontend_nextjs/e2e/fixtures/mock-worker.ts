/**
 * Gemockter FastAPI-Worker für die Oberflächentests.
 *
 * Fängt im Browser alle Anfragen an MOCK_API ab (REST über page.route, /ws/stream über
 * page.routeWebSocket) und antwortet wie worker_python/src/api/*: gleiche Pfade, gleiche
 * Antwortformen, gleiche Fehlercodes (401 ohne API-Schlüssel, 409 bei doppeltem Konto …).
 * Der Zustand liegt in `state` und kann pro Test verändert werden.
 */
import type { Page, Route, WebSocketRoute } from '@playwright/test';
import type { LiveData, Metrics } from '../../src/store/types';
import { defaultState, type MockState, type MockUser, type StoredAccount } from './data';
import { E2E_API_KEY, E2E_USER_KEY, MOCK_API } from './env';

type Json = Record<string, unknown>;

export interface WorkerCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Json | null;
}

interface Reply {
  status: number;
  body: unknown;
}

/** Wer die Anfrage stellt: Admin (E2E_API_KEY) oder ein Benutzer mit persönlichem Schlüssel. */
interface Principal {
  role: 'admin' | 'user';
  id: string;
  name: string;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/** Wie helpers._public_account: Passwort nie herausgeben, nur ob eines gespeichert ist. */
function publicAccount(account: StoredAccount) {
  const copy: StoredAccount = { ...account };
  delete copy.password;
  return { ...copy, has_password: Boolean(account.password) };
}

/** Wie src/api/settings.py: alte verschachtelte Dateien/Nutzlasten ({settings: {settings: …}}) auspacken. */
function unwrapSettings(value: unknown): Json {
  let current = (value ?? {}) as Json;
  while (current && typeof current === 'object' && 'settings' in current && typeof current.settings === 'object') {
    current = current.settings as Json;
  }
  return current;
}

export class MockWorker {
  state: MockState = defaultState();
  /** Alle REST-Aufrufe in Reihenfolge (für Assertions auf Methode, Pfad, Query, Body). */
  readonly calls: WorkerCall[] = [];
  /** Aufrufe ohne gültigen X-API-Key; der Test-Fixture prüft, dass die Liste leer bleibt. */
  readonly unauthorized: string[] = [];
  /** Aufrufe, die dieser Mock nicht kennt (neuer Endpunkt → Mock erweitern). */
  readonly unhandled: string[] = [];
  /** Worker nicht erreichbar: REST-Anfragen scheitern mit Netzwerkfehler. */
  offline = false;
  /** Erzwungene Antwort je "METHODE /api/pfad" (z. B. Fehler 500 für /system/scan-mt5). */
  readonly overrides = new Map<string, Reply>();
  /** URLs aller WebSocket-Verbindungen (inkl. Reconnects). */
  readonly wsUrls: string[] = [];
  /** Offene Streams und ihr Konto aus ?account_id= (null: ohne Parameter → erstes Konto). */
  private sockets = new Map<WebSocketRoute, string | null>();

  async install(page: Page) {
    await page.route(`${MOCK_API}/**`, (route) => this.handle(route));
    await page.routeWebSocket(/\/ws\/stream/, (ws) => {
      this.wsUrls.push(ws.url());
      this.sockets.set(ws, new URL(ws.url()).searchParams.get('account_id'));
      ws.onClose(() => this.sockets.delete(ws));
      // Client sendet nichts; eingehende Nachrichten werden ignoriert
      ws.onMessage(() => {});
    });
  }

  // ------------------------------------------------------------------ Hilfen für Tests
  /** Legt einen Benutzer an (wie POST /users) und gibt seinen Schlüssel zurück. */
  addUser(name = 'Anna', id = 'u_anna', key = E2E_USER_KEY): MockUser {
    const user: MockUser = { id, name, key, created_at: '2026-09-30T10:00:00+00:00' };
    this.state.users.push(user);
    return user;
  }

  /** Setzt den Besitzer eines Kontos (wie der Admin im Konto-Formular). */
  setOwner(accountId: string, ownerId: string | null) {
    const account = this.state.accounts.find((a) => String(a.id) === accountId);
    if (account) account.owner = ownerId;
  }

  callsTo(method: string, path: string | RegExp): WorkerCall[] {
    return this.calls.filter(
      (c) => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path)),
    );
  }

  settingsOf(accountId: string): Json {
    return this.state.settings[accountId] ?? {};
  }

  zonesOf(accountId: string): Json[] {
    return (this.settingsOf(accountId).ZONES as Json[] | undefined) ?? [];
  }

  /** Bot läuft und ist mit MT5 verbunden (Kennzahlen aus RUNNING_METRICS). */
  setBotRunning(accountId: string, running = true) {
    this.state.botRunning[accountId] = running;
  }

  setMetrics(accountId: string, metrics: Partial<LiveData>) {
    this.state.metrics[accountId] = { ...(this.state.metrics[accountId] ?? {}), ...metrics };
  }

  get openSockets(): number {
    return this.sockets.size;
  }

  /** Konten der offenen Streams (null: ohne ?account_id=). */
  get socketAccounts(): (string | null)[] {
    return [...this.sockets.values()];
  }

  /**
   * METRICS-Nachricht wie ws_server.real_bot_data_stream: mit account_id nur an die Streams
   * dieses Kontos (ohne ?account_id= zählt das erste Konto), ohne account_id an alle.
   */
  pushMetrics(payload: Partial<Metrics>) {
    const message = JSON.stringify({ type: 'METRICS', payload });
    const firstAccount = this.state.accounts[0]?.id ?? 'default';
    for (const [ws, account] of this.sockets) {
      if (payload.account_id == null || String(payload.account_id) === (account ?? firstAccount)) ws.send(message);
    }
  }

  /** Wie ein älterer Worker, der ?account_id= nicht kennt: METRICS an alle Streams. */
  pushMetricsToAll(payload: Partial<Metrics>) {
    const message = JSON.stringify({ type: 'METRICS', payload });
    for (const ws of this.sockets.keys()) ws.send(message);
  }

  /** Alle Streams serverseitig schließen (Worker-Neustart); der Client soll neu verbinden. */
  dropWebSockets() {
    for (const ws of this.sockets.keys()) ws.close({ code: 1012, reason: 'Service Restart' });
    this.sockets.clear();
  }

  // ------------------------------------------------------------------ Routing
  private async handle(route: Route) {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }
    if (this.offline) {
      return route.abort('internetdisconnected');
    }

    let body: Json | null = null;
    try {
      body = request.postDataJSON() as Json | null;
    } catch {
      body = null;
    }
    this.calls.push({ method, path: url.pathname, query: url.searchParams, body });

    const headers = await request.allHeaders();
    const principal = this.principalOf(headers['x-api-key']);
    if (!principal) {
      this.unauthorized.push(`${method} ${url.pathname}`);
      return this.reply(route, { status: 401, body: { detail: 'Invalid or missing API key' } });
    }

    const override = this.overrides.get(`${method} ${url.pathname}`);
    if (override) return this.reply(route, override);

    // Wie access.py: ein Benutzer erreicht nur eigene Konten, jedes andere ist 404
    const denied = this.accessDenied(principal, method, url);
    if (denied) return this.reply(route, denied);

    if (method === 'GET' && url.pathname.startsWith('/api/logs/download/')) {
      const id = url.pathname.split('/').pop()!;
      // Minimales leeres ZIP (End-of-central-directory), Inhalt prüfen die API-Tests
      const zip = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
      return route.fulfill({
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename=MT5_Logs_and_Configs_${id}.zip`,
        },
        body: zip,
      });
    }

    const reply = this.dispatch(method, url, body, principal);
    if (!reply) {
      this.unhandled.push(`${method} ${url.pathname}`);
      return this.reply(route, { status: 404, body: { detail: 'Not Found' } });
    }
    return this.reply(route, reply);
  }

  private reply(route: Route, { status, body }: Reply) {
    return route.fulfill({
      status,
      headers: CORS_HEADERS,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  }

  private principalOf(key: string | undefined): Principal | null {
    if (key === E2E_API_KEY) return { role: 'admin', id: 'admin', name: 'admin' };
    const user = this.state.users.find((u) => u.key === key);
    return user ? { role: 'user', id: user.id, name: user.name } : null;
  }

  /** Konto-ID, auf die sich die Anfrage bezieht (Pfad oder ?account_id=); null bei globalen Routen. */
  private scopedAccountId(method: string, url: URL): string | null {
    const seg = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean);
    if (seg[0] === 'logs' && seg[1] === 'download') return seg[2] ?? null;
    if (['settings', 'ui-state', 'symbols', 'logs'].includes(seg[0]) && seg.length === 2) return seg[1];
    if (seg[0] === 'accounts' && seg.length === 2 && method !== 'GET') return seg[1];
    if (seg[0] === 'start' || seg[0] === 'stop') return url.searchParams.get('account_id') ?? '';
    return null;
  }

  private accessDenied(principal: Principal, method: string, url: URL): Reply | null {
    if (principal.role === 'admin') return null;
    const id = this.scopedAccountId(method, url);
    if (id === null) return null;
    const own = this.state.accounts.some((a) => String(a.id) === id && a.owner === principal.id);
    return own ? null : { status: 404, body: { detail: `Account '${id}' not found` } };
  }

  private dispatch(method: string, url: URL, body: Json | null, principal: Principal): Reply | null {
    const s = this.state;
    const path = url.pathname.replace(/^\/api/, '');
    const seg = path.split('/').filter(Boolean);
    const ok = (b: unknown): Reply => ({ status: 200, body: b });
    const admin = principal.role === 'admin';
    const forbidden: Reply = { status: 403, body: { detail: 'Administrator access required' } };

    // --------------------------------------------------------------- Benutzer (Admin)
    if (path === '/auth/me' && method === 'GET') return ok(principal);
    if (seg[0] === 'users') {
      if (!admin) return forbidden;
      const accountCount = (userId: string) => s.accounts.filter((a) => a.owner === userId).length;
      const publicUser = (u: MockUser) => ({ id: u.id, name: u.name, created_at: u.created_at, account_count: accountCount(u.id) });
      if (path === '/users' && method === 'GET') return ok({ users: s.users.map(publicUser) });
      if (path === '/users' && method === 'POST') {
        const name = String((body as Json | null)?.name ?? '').trim();
        if (!name) return { status: 422, body: { detail: 'name must not be empty' } };
        if (s.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
          return { status: 409, body: { detail: `User '${name}' already exists` } };
        }
        const user = this.addUser(name, `u_${s.users.length + 1}`, `issued-key-${s.users.length + 1}`);
        return { status: 201, body: { user: publicUser(user), key: user.key } };
      }
      const user = s.users.find((u) => u.id === seg[1]);
      if (!user) return { status: 404, body: { detail: `User '${seg[1]}' not found` } };
      if (seg[2] === 'key' && method === 'POST') {
        user.key = `${user.key}-renewed`;
        return ok({ user: publicUser(user), key: user.key });
      }
      if (seg.length === 2 && method === 'DELETE') {
        s.users = s.users.filter((u) => u.id !== user.id);
        for (const account of s.accounts) if (account.owner === user.id) account.owner = null;
        return ok({ status: 'deleted', user_id: user.id });
      }
    }

    // --------------------------------------------------------------- Konten
    if (path === '/accounts' && method === 'GET') {
      const visible = admin ? s.accounts : s.accounts.filter((a) => a.owner === principal.id);
      return ok({ accounts: visible.map(publicAccount) });
    }
    if (path === '/accounts' && method === 'POST') {
      // Kopie: `calls` hält den Body des Aufrufs, den der Test später prüft (unverändert, wie ihn der Browser sandte)
      const account = { ...(body as unknown as StoredAccount) };
      if (!account.password) return { status: 422, body: { detail: 'Password is required' } };
      const existing = s.accounts.find((a) => String(a.id) === String(account.id));
      // Wie accounts.py: Details zum Konto nur, wenn der Aufrufer es sehen darf
      if (existing) return admin || existing.owner === principal.id ? this.duplicate(existing) : this.hiddenDuplicate(existing);
      // Benutzer: Besitzer ist immer man selbst; Admin: aus dem Formular (leer = ohne Besitzer)
      account.owner = admin ? account.owner || null : principal.id;
      s.accounts.push(account);
      return { status: 201, body: { status: 'created', account: publicAccount(account) } };
    }
    if (seg[0] === 'accounts' && seg.length === 2) {
      const idx = s.accounts.findIndex((a) => String(a.id) === seg[1]);
      if (idx < 0) return { status: 404, body: { detail: `Account '${seg[1]}' not found` } };
      if (method === 'PUT') {
        const update = body as unknown as StoredAccount;
        const clash = s.accounts.find((a, i) => i !== idx && String(a.id) === String(update.id));
        if (clash) return this.duplicate(clash);
        // Leeres Passwort = gespeichertes behalten (PR #15)
        const password = update.password || s.accounts[idx].password;
        // Besitzer bleibt; nur der Admin ändert ihn (und nur, wenn das Formular ihn mitsendet)
        const owner = admin && 'owner' in update ? update.owner || null : s.accounts[idx].owner;
        s.accounts[idx] = { ...update, password, owner };
        return ok({ status: 'updated', account: publicAccount(s.accounts[idx]) });
      }
      if (method === 'DELETE') {
        s.accounts.splice(idx, 1);
        return ok({ status: 'deleted', account_id: seg[1] });
      }
    }

    // --------------------------------------------------------------- Einstellungen
    if (seg[0] === 'settings' && seg.length === 2) {
      const id = seg[1];
      if (method === 'GET') {
        return ok({ account_id: id, settings: s.settings[id] ?? {} });
      }
      if (method === 'POST') {
        s.settings[id] = { ...(s.settings[id] ?? {}), ...unwrapSettings(body) };
        return ok({ status: 'saved', account_id: id });
      }
    }
    if (seg[0] === 'ui-state' && seg.length === 2) {
      const id = seg[1];
      if (method === 'POST') {
        const payload = unwrapSettings(body);
        const incoming = ((payload.states as Json | undefined) ?? payload) as Record<string, string>;
        const states = { ...(s.uiState[id] ?? {}) };
        for (const [k, v] of Object.entries(incoming)) {
          if (/^\d+$/.test(k)) states[k] = String(v).toUpperCase();
        }
        s.uiState[id] = states;
        return ok({ status: 'saved', account_id: id, states });
      }
      if (method === 'GET') return ok({ account_id: id, states: s.uiState[id] ?? {} });
    }
    if (seg[0] === 'symbols' && method === 'GET') {
      // Wie symbols.py: leere Liste + „error“, wenn MT5 die Symbole nicht liefern konnte
      if (s.symbolsError) return ok({ status: 'success', account_id: seg[1], symbols: [], error: s.symbolsError });
      return ok({ status: 'success', account_id: seg[1], symbols: s.symbols });
    }

    // --------------------------------------------------------------- Bot
    const accountId = url.searchParams.get('account_id') ?? '';
    if (path === '/start' && method === 'POST') {
      if (!s.accounts.some((a) => String(a.id) === accountId)) {
        return { status: 404, body: { detail: `Account '${accountId}' not found` } };
      }
      s.botRunning[accountId] = true;
      return ok({ status: 'success', message: `MT5 Connected and Bot started for ${accountId}` });
    }
    if (path === '/stop' && method === 'POST') {
      s.botRunning[accountId] = false;
      return ok({ status: 'success', message: `Bot stopped for ${accountId}` });
    }

    // --------------------------------------------------------------- Logs
    if (seg[0] === 'logs' && seg.length === 2) {
      const id = seg[1];
      if (method === 'DELETE') {
        s.robotLog[id] = [];
        s.mt5Log[id] = [];
        return ok({ status: 'success', message: 'Logs cleared' });
      }
      if (method === 'GET') {
        const running = Boolean(s.botRunning[id]);
        const stored = s.metrics[id];
        // Wie logs.py: ohne Metrikdatei null (frisches Konto), sonst mt5_connected nur bei laufendem Bot
        const metrics = stored ? { ...stored, ...(running ? {} : { mt5_connected: false }) } : null;
        const lines = Number(url.searchParams.get('lines') || 100);
        // wie worker_python/src/api/logs.py: zone_id süzt den Robot-Log auf "[Z:<id>] "
        const zoneId = url.searchParams.get('zone_id');
        const robot = (s.robotLog[id] ?? []).filter((l) => !zoneId || l.includes(`[Z:${zoneId}] `));
        return ok({
          robot_log: robot.slice(-lines),
          mt5_log: (s.mt5Log[id] ?? []).slice(-lines),
          metrics,
          bot_running: running,
        });
      }
    }

    // --------------------------------------------------------------- System
    if (path === '/system/platform' && method === 'GET') {
      return ok({ platform: s.platform, is_windows: s.platform === 'win32' });
    }
    if (path === '/system/scan-mt5' && method === 'GET') {
      return ok({ paths: s.platform === 'win32' ? s.mt5Paths : [], platform: s.platform });
    }
    if (path === '/system/update/check' && method === 'GET') {
      if (!admin) return forbidden;
      return ok({ ...s.update });
    }
    if (path === '/system/update' && method === 'POST') {
      if (!admin) return forbidden;
      s.update = { ...s.update, has_update: false, local_ver: s.update.remote_ver };
      return ok({ status: 'success', message: 'Güncelleme tamamlandı', restarting: false });
    }
    if (path === '/system/worker/status' && method === 'GET') {
      if (!admin) return forbidden;
      return ok({
        version: s.update.local_ver,
        uptime_sec: 7500,
        supervised: true,
        bots_running: 1,
        bots_total: s.accounts.length,
      });
    }
    if (path === '/system/worker/log' && method === 'GET') {
      if (!admin) return forbidden;
      return ok({ lines: ['\u001b[32mINFO\u001b[0m:     Application startup complete.'] });
    }
    if (path === '/system/restart' && method === 'POST') {
      if (!admin) return forbidden;
      return ok({ status: 'success', restarting: true });
    }
    return null;
  }

  private hiddenDuplicate(existing: StoredAccount): Reply {
    return { status: 409, body: { detail: `Account '${existing.id}' already exists` } };
  }

  private duplicate(existing: StoredAccount): Reply {
    return {
      status: 409,
      body: {
        detail: {
          type: 'https://auto-grid.io/errors/duplicate-account',
          title: 'Duplicate Account',
          status: 409,
          code: 'DUPLICATE_ACCOUNT',
          detail: `Account '${existing.id}' already exists`,
          existing_account: publicAccount(existing),
        },
      },
    };
  }
}
