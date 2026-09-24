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
import { defaultState, type MockState, type StoredAccount } from './data';
import { E2E_API_KEY, MOCK_API } from './env';

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
  private sockets = new Set<WebSocketRoute>();

  async install(page: Page) {
    await page.route(`${MOCK_API}/**`, (route) => this.handle(route));
    await page.routeWebSocket(/\/ws\/stream/, (ws) => {
      this.wsUrls.push(ws.url());
      this.sockets.add(ws);
      ws.onClose(() => this.sockets.delete(ws));
      // Client sendet nichts; eingehende Nachrichten werden ignoriert
      ws.onMessage(() => {});
    });
  }

  // ------------------------------------------------------------------ Hilfen für Tests
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

  /** METRICS-Nachricht an alle offenen Streams (wie ws_server.real_bot_data_stream). */
  pushMetrics(payload: Partial<Metrics>) {
    const message = JSON.stringify({ type: 'METRICS', payload });
    for (const ws of this.sockets) ws.send(message);
  }

  /** Alle Streams serverseitig schließen (Worker-Neustart); der Client soll neu verbinden. */
  dropWebSockets() {
    for (const ws of this.sockets) ws.close({ code: 1012, reason: 'Service Restart' });
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
    if (headers['x-api-key'] !== E2E_API_KEY) {
      this.unauthorized.push(`${method} ${url.pathname}`);
      return this.reply(route, { status: 401, body: { detail: 'Invalid or missing API key' } });
    }

    const override = this.overrides.get(`${method} ${url.pathname}`);
    if (override) return this.reply(route, override);

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

    const reply = this.dispatch(method, url, body);
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

  private dispatch(method: string, url: URL, body: Json | null): Reply | null {
    const s = this.state;
    const path = url.pathname.replace(/^\/api/, '');
    const seg = path.split('/').filter(Boolean);
    const ok = (b: unknown): Reply => ({ status: 200, body: b });

    // --------------------------------------------------------------- Konten
    if (path === '/accounts' && method === 'GET') {
      return ok({ accounts: s.accounts.map(publicAccount) });
    }
    if (path === '/accounts' && method === 'POST') {
      const account = body as unknown as StoredAccount;
      if (!account.password) return { status: 422, body: { detail: 'Password is required' } };
      const existing = s.accounts.find((a) => String(a.id) === String(account.id));
      if (existing) return this.duplicate(existing);
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
        s.accounts[idx] = { ...update, password };
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
        const metrics = running
          ? { ...(s.metrics[id] ?? {}) }
          : { ...(s.metrics[id] ?? {}), mt5_connected: false };
        const lines = Number(url.searchParams.get('lines') || 100);
        return ok({
          robot_log: (s.robotLog[id] ?? []).slice(-lines),
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
      return ok({ ...s.update });
    }
    if (path === '/system/update' && method === 'POST') {
      s.update = { ...s.update, has_update: false, local_ver: s.update.remote_ver };
      return ok({ status: 'success', message: 'Güncelleme tamamlandı', restarting: false });
    }
    return null;
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
