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
import { defaultState, groupZones, type CsvImportRow, type MockState, type MockUser, type StoredAccount } from './data';
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

/** Wie src/utils/zone_magic.py (ENG-27): feste Magic je Zone, nur der Worker vergibt sie, nie doppelt. */
function assignZoneMagics(previous: Json, merged: Json): Json {
  const BASE = 200000;
  const oldZones = (previous.ZONES as Json[] | undefined) ?? [];
  // Schlüssel wie _zone_key: id, sonst (sehr alte Datei) der Listenplatz; bei doppelter id gilt die erste
  const keyOf = (z: Json, i: number) => (z.id ? `id:${String(z.id)}` : `idx:${i}`);
  const known = new Map<string, number>();
  oldZones.forEach((z, i) => {
    const m = Number(z.magic);
    if (!known.has(keyOf(z, i))) {
      known.set(keyOf(z, i), Number.isInteger(m) && m > BASE && m < BASE + 1000 ? m : BASE + i + 1);
    }
  });
  let highest = Math.max(BASE, Number(previous.ZONE_MAGIC_MAX) || BASE, ...Array.from(known.values()));
  const taken = new Set<number>();
  const zones = ((merged.ZONES as Json[] | undefined) ?? []).map((z) => ({ ...z }));
  const pending: Json[] = [];
  for (const [i, z] of zones.entries()) {
    const m = known.get(keyOf(z, i));
    if (m !== undefined && !taken.has(m)) {
      z.magic = m;
      taken.add(m);
    } else pending.push(z);
  }
  for (const z of pending) {
    highest += 1;
    z.magic = highest;
    taken.add(highest);
  }
  const result: Json = { ...merged };
  if (merged.ZONES !== undefined) result.ZONES = zones;
  if (highest > BASE) result.ZONE_MAGIC_MAX = highest;
  else delete result.ZONE_MAGIC_MAX;
  return result;
}

/** Wie settings._drop_fractal_setup_fields (ENG-29): Felder der entfernten Fraktal-Zusatz-Setups fallen beim Speichern weg. */
function dropFractalSetupFields(merged: Json): Json {
  if (!Array.isArray(merged.ZONES)) return merged;
  const zones = (merged.ZONES as Json[]).map((z) => {
    const zone: Json = { ...z };
    delete zone.fractal_setups;
    delete zone.fractal_setup_seq;
    delete zone.fractal_kept_sids;
    return zone;
  });
  return { ...merged, ZONES: zones };
}

/** Wie symbol_setups.flatten_symbols (ZON-19): Symbol → Setups als flache Zonenliste, `index` aus dem GET fällt weg. */
function flattenSymbols(symbols: unknown): Json[] {
  if (!Array.isArray(symbols)) return [];
  return (symbols as Json[]).flatMap((group) =>
    ((group.setups as Json[] | undefined) ?? []).map((setup) => {
      const zone: Json = { ...setup, symbol: group.symbol ?? '' };
      delete zone.index;
      return zone;
    }),
  );
}

/** Wie symbol_setups.settings_zones: ZONES (alte Datei) gilt vor SYMBOLS. */
function settingsZones(settings: Json): Json[] {
  if ('ZONES' in settings) return (settings.ZONES as Json[] | undefined) ?? [];
  return flattenSymbols(settings.SYMBOLS);
}

/**
 * Wie zone_magic.remap_ui_states: sortiert die Zonenbefehle (Schlüssel = Engine-Platz) auf die neue
 * Reihenfolge um; eine gelöschte Zone fällt weg. Der Worker paart alte und neue Plätze über die Magic,
 * hier über die id (im Mock trägt jede Zone eine eindeutige id).
 */
function remapUiStates(states: Record<string, string>, oldZones: Json[], newZones: Json[]): Record<string, string> {
  const oldIds = oldZones.map((z) => String(z.id));
  const newIds = newZones.map((z) => String(z.id));
  if (oldIds.length === 0 || oldIds.join('|') === newIds.join('|')) return states;
  const remapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(states)) {
    if (!/^\d+$/.test(key)) {
      remapped[key] = value;
      continue;
    }
    const newIdx = Number(key) < oldIds.length ? newIds.indexOf(oldIds[Number(key)]) : -1;
    if (newIdx >= 0) remapped[String(newIdx)] = value;
  }
  return remapped;
}

/** Wie symbol_setups.to_flat: Zonen als ZONES (Magic-Vergabe), ZONES gilt vor SYMBOLS. */
function toFlat(settings: Json): Json {
  const flat: Json = { ...settings };
  delete flat.SYMBOLS;
  if (!('ZONES' in settings) && 'SYMBOLS' in settings) flat.ZONES = flattenSymbols(settings.SYMBOLS);
  return flat;
}

/** Wie symbol_setups.to_grouped: gespeichert wird SYMBOLS. */
function toGrouped(settings: Json): Json {
  if (!('ZONES' in settings)) return settings;
  const grouped: Json = { ...settings };
  delete grouped.ZONES;
  grouped.SYMBOLS = groupZones(settings.ZONES as Json[]);
  return grouped;
}

/** Wie symbol_setups.for_client: GET liefert nur SYMBOLS, jedes Setup mit seinem Engine-Platz (index). */
function forClient(settings: Json): Json {
  if (!('ZONES' in settings) && !('SYMBOLS' in settings)) return settings;
  const client: Json = { ...settings };
  delete client.ZONES;
  client.SYMBOLS = groupZones(settingsZones(settings).map((zone, index): Json => ({ ...zone, index })));
  return client;
}

/** Wie settings._check_symbols (models.SymbolSettings: symbol str, setups list[dict]): kaputtes SYMBOLS ohne ZONES gibt 422. */
function symbolsInvalid(incoming: Json): boolean {
  if (!('SYMBOLS' in incoming) || 'ZONES' in incoming) return false;
  const symbols = incoming.SYMBOLS;
  const isObject = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value);
  return (
    !Array.isArray(symbols) ||
    symbols.some((g) => typeof g?.symbol !== 'string' || !Array.isArray(g?.setups) || !g.setups.every(isObject))
  );
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
  /** Speichern mit der alten Form ZONES; die Oberfläche schickt seit ZON-19 Teil B nur SYMBOLS. */
  readonly zonesPayloads: string[] = [];
  /** Worker nicht erreichbar: REST-Anfragen scheitern mit Netzwerkfehler. */
  offline = false;
  /** Erzwungene Antwort je "METHODE /api/pfad" (z. B. Fehler 500 für /system/scan-mt5). */
  readonly overrides = new Map<string, Reply>();
  /** Anzahl Kerzen je Antwort von /market/{id}/rates, in Reihenfolge (der Chart darf nicht mehr zeigen). */
  readonly ratesDelivered: number[] = [];
  /** Rohkörper der laufenden Anfrage (Chunk-Upload des CSV-Imports) */
  private rawBody = '';
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

  /** Zonen so, wie die Engine sie liest (flach, mit Symbol). */
  zonesOf(accountId: string): Json[] {
    return settingsZones(this.settingsOf(accountId));
  }

  /** Legt Zonen als gespeicherte Datei im heutigen Format an (SYMBOLS, wie nach einem Speichern). */
  setZones<Z extends { symbol?: unknown }>(accountId: string, zones: Z[]) {
    const settings: Json = { ...this.settingsOf(accountId) };
    delete settings.ZONES;
    settings.SYMBOLS = groupZones(zones);
    this.state.settings[accountId] = settings;
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

    this.rawBody = request.postDataBuffer()?.toString('utf8') ?? '';
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
    if (seg[0] === 'market' && seg.length === 3) return seg[1];
    if (seg[0] === 'history' && seg.length === 3) return seg[1];
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

  /**
   * Wie market_sync.get_deals/market_db.read_deals: Deals [from, to) + Einstiege älterer Positionen
   * (für die Zuordnung), Kontodaten, Zonen-Register und fehlende Teile.
   */
  private deals(accountId: string, q: URLSearchParams) {
    const from = Number(q.get('from') ?? 0);
    const to = q.get('to') ? Number(q.get('to')) : Number.MAX_SAFE_INTEGER;
    const all = [...(this.state.deals[accountId] ?? [])].sort((a, b) => a.time - b.time || a.ticket - b.ticket);
    const inside = all.filter((d) => d.time >= from && d.time < to);
    const positions = new Set(inside.map((d) => d.position_id).filter(Boolean));
    const earlier = all.filter((d) => d.time < from && positions.has(d.position_id));
    return {
      account_id: accountId,
      from,
      to,
      deals: [...earlier, ...inside],
      account: { currency: 'USD', balance: 10000, margin_mode: this.state.marginMode, updated_at: Math.floor(Date.now() / 1000) },
      zones: this.state.zoneRegistry[accountId] ?? [],
      missing: this.state.dealsMissing.filter((m) => m.to > from && m.from < to),
    };
  }

  /**
   * Wie market_sync.get_rates: Kerzen [from, to) in MT5-Zeit, spaltenweise, höchstens 50.000 (Rest über
   * next_from). Wochenende = keine Kerzen (Pause), `ratesMissing` = keine Kerzen + Eintrag in `missing`.
   * Die neueste Kerze (jetzt auf der Brokeruhr) ist die laufende (`live_from`).
   */
  private rates(accountId: string, q: URLSearchParams) {
    const TF: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
    const timeframe = q.get('timeframe') ?? 'M1';
    const tf = TF[timeframe] ?? 60;
    const a = Math.floor(Number(q.get('from')) / tf) * tf;
    const b = Math.ceil(Number(q.get('to')) / tf) * tf;
    const end = Math.min(b, a + 50_000 * tf);
    const latest = Math.floor((Date.now() / 1000 + this.state.brokerOffset) / tf) * tf;
    const missing = this.state.ratesMissing
      .filter((m) => m.to > a && m.from < end)
      .map((m) => ({ ...m, from: Math.max(m.from, a), to: Math.min(m.to, end) }));
    const cols = { t: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[] };
    const mid = (t: number) => 97 + 2 * Math.sin(t / 43200) + 0.3 * Math.sin(t / 2700);
    for (let t = a; t < end && t <= latest; t += tf) {
      const weekday = new Date(t * 1000).getUTCDay();
      if (tf < 86400 && (weekday === 0 || weekday === 6)) continue;
      if (missing.some((m) => t >= m.from && t < m.to)) continue;
      const open = mid(t);
      const close = mid(t + tf);
      cols.t.push(t);
      cols.o.push(Number(open.toFixed(3)));
      cols.c.push(Number(close.toFixed(3)));
      cols.h.push(Number((Math.max(open, close) + 0.05).toFixed(3)));
      cols.l.push(Number((Math.min(open, close) - 0.05).toFixed(3)));
    }
    this.ratesDelivered.push(cols.t.length);
    const now = Date.now() / 1000;
    return {
      account_id: accountId,
      source: 'Broker-Demo',
      symbol: q.get('symbol'),
      timeframe,
      from: a,
      to: b,
      ...cols,
      v: cols.t.map(() => 10),
      s: cols.t.map(() => 3),
      live_from: cols.t.length && cols.t[cols.t.length - 1] === latest ? latest : null,
      digits: 3,
      point: 0.001,
      next_from: end < b ? end : null,
      missing,
      db_full: false,
      server_now: this.state.brokerClockReliable ? now + this.state.brokerOffset : null,
      offset_sec: this.state.brokerClockReliable ? this.state.brokerOffset : null,
    };
  }

  /**
   * Wie csv_import.get_rates: nur ein abgeschlossener Import (sonst 409), nur sein Symbol und Zeitrahmen (sonst 400),
   * nie MT5. Eine Kerze je Zeitrahmen im Bereich [first_t, last_t] (auch am Wochenende); der Rest ist `csv_gap`
   * (Lücken innerhalb der Datei bildet der Mock nicht ab).
   * Kein Spread, keine laufende Kerze, keine Brokeruhr in der Antwort.
   */
  private csvRates(accountId: string, importId: string, q: URLSearchParams): Reply {
    const TF: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
    const item = this.state.csvImports.find((i) => i.account_id === accountId && i.import_id === importId);
    if (!item) return { status: 404, body: { detail: 'Import not found' } };
    if (item.status !== 'committed') return { status: 409, body: { detail: 'Import is not committed' } };
    const timeframe = q.get('timeframe') ?? 'M1';
    if (q.get('symbol') !== item.symbol || timeframe !== item.timeframe) {
      return { status: 400, body: { detail: `Import holds ${item.symbol} ${item.timeframe} only` } };
    }
    const tf = TF[timeframe];
    const a = Math.floor(Number(q.get('from')) / tf) * tf;
    const b = Math.ceil(Number(q.get('to')) / tf) * tf;
    const end = Math.min(b, a + 50_000 * tf);
    // committed ⇒ first_t und last_t sind gesetzt (Commit oben)
    const first = Math.max(a, item.first_t!);
    const stop = Math.min(end, item.last_t! + tf);
    const t: number[] = [];
    for (let time = first; time < stop; time += tf) t.push(time);
    const missing: { from: number; to: number; reason: string; checked_at: null }[] = [];
    if (first > a) missing.push({ from: a, to: Math.min(first, end), reason: 'csv_gap', checked_at: null });
    if (stop < end) missing.push({ from: Math.max(stop, a), to: end, reason: 'csv_gap', checked_at: null });
    const price = (time: number) => Number((97 + Math.sin(time / 3600)).toFixed(3));
    return {
      status: 200,
      body: {
        source: `csv:${importId}`, symbol: item.symbol, timeframe, from: a, to: b,
        t, o: t.map(price), h: t.map((time) => price(time) + 0.05), l: t.map((time) => price(time) - 0.05), c: t.map((time) => price(time + tf)),
        v: t.map(() => null), s: t.map(() => null), live_from: null, digits: null, point: null,
        next_from: end < b ? end : null, missing, db_full: false,
      },
    };
  }

  /**
   * Wie csv_import.py in klein: Anlegen, Teile in Reihenfolge, Commit (422 bei Text „BAD“ oder nicht
   * steigender Zeit, 409 bei Überlappung ohne `replace`), Löschen. Erste Spalte = Epoche in Sekunden.
   */
  private csvImports(method: string, seg: string[], body: Json | null): Reply | null {
    const s = this.state;
    const account = seg[1];
    if (!s.accounts.some((a) => String(a.id) === account)) {
      return { status: 404, body: { detail: `Account '${account}' not found` } };
    }
    const pub = (row: CsvImportRow) => {
      const copy: Partial<CsvImportRow> = { ...row };
      delete copy.account_id;
      delete copy.next_chunk;
      delete copy.text;
      return copy;
    };
    const mine = () => s.csvImports.filter((i) => i.account_id === account);
    if (seg.length === 3 && method === 'GET') return { status: 200, body: { imports: mine().map(pub) } };
    if (seg.length === 3 && method === 'POST') {
      const b = (body ?? {}) as Record<string, unknown>;
      const importId = (s.csvImports.length + 1).toString(16).padStart(32, '0');
      s.csvImports.push({
        import_id: importId,
        account_id: account,
        symbol: String(b.symbol),
        timeframe: String(b.timeframe),
        filename: String(b.filename ?? ''),
        status: 'staging',
        size_bytes: Number(b.size),
        received_bytes: 0,
        next_chunk: 0,
        bars: null,
        first_t: null,
        last_t: null,
        gaps: null,
        offset_sec: Number(b.time_offset_sec ?? 0),
        created_at: Math.floor(Date.now() / 1000),
        committed_at: null,
        text: '',
      });
      return { status: 200, body: { import_id: importId, chunk_bytes: 4 * 1024 * 1024 } };
    }
    const item = mine().find((i) => i.import_id === seg[3]);
    if (!item) return { status: 404, body: { detail: 'Import not found' } };
    if (seg.length === 5 && seg[4] === 'chunk' && method === 'PUT') {
      item.text += this.rawBody;
      item.received_bytes += Buffer.byteLength(this.rawBody);
      item.next_chunk += 1;
      return { status: 200, body: { received_bytes: item.received_bytes, next_chunk: item.next_chunk } };
    }
    if (seg.length === 5 && seg[4] === 'commit' && method === 'POST') {
      const replace = Boolean((body as Record<string, unknown> | null)?.replace);
      const times = item.text
        .split('\n')
        .map((line) => Number(line.split(',')[0]))
        .filter((t) => Number.isFinite(t) && t > 0);
      const invalid = item.text.includes('BAD') || times.length === 0 || times.some((t, i) => i > 0 && t <= times[i - 1]);
      if (invalid) {
        s.csvImports = s.csvImports.filter((i) => i !== item);
        const errors = [{ line: 2, message: 'high/low do not contain open and close' }];
        return { status: 422, body: { detail: { detail: 'The file has errors', errors } } };
      }
      const first = times[0];
      const last = times[times.length - 1];
      const overlaps = mine().filter(
        (i) => i !== item && i.status === 'committed' && i.symbol === item.symbol && i.timeframe === item.timeframe &&
          i.first_t! <= last && i.last_t! >= first,
      );
      if (overlaps.length > 0 && !replace) {
        return { status: 409, body: { detail: { detail: 'Overlaps an existing import', errors: overlaps.map(pub) } } };
      }
      s.csvImports = s.csvImports.filter((i) => !overlaps.includes(i));
      Object.assign(item, { status: 'committed', bars: times.length, first_t: first, last_t: last, gaps: 0,
        committed_at: Math.floor(Date.now() / 1000), text: '' });
      return { status: 200, body: pub(item) };
    }
    if (seg.length === 4 && method === 'DELETE') {
      s.csvImports = s.csvImports.filter((i) => i !== item);
      return { status: 200, body: { deleted: item.import_id } };
    }
    return null;
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
        return ok({ account_id: id, settings: forClient(s.settings[id] ?? {}) });
      }
      if (method === 'POST') {
        const previous = toFlat(s.settings[id] ?? {});
        const incoming = unwrapSettings(body);
        if ('ZONES' in incoming) this.zonesPayloads.push(`${method} ${path}`);
        if (symbolsInvalid(incoming)) return { status: 422, body: { detail: 'SYMBOLS' } };
        // Wie settings._check_legacy_mode (ENG-29)
        if ('LEGACY_SETUP_ORDERS' in incoming && !['delete', 'keep'].includes(String(incoming.LEGACY_SETUP_ORDERS))) {
          return { status: 422, body: { detail: 'LEGACY_SETUP_ORDERS: delete | keep' } };
        }
        // Wie settings.update_settings: flach zusammenführen, Magic vergeben, gruppiert speichern (ZON-19)
        const merged = { ...previous, ...toFlat(incoming) };
        s.settings[id] = toGrouped(dropFractalSetupFields(assignZoneMagics(previous, merged)));
        // Wie settings._remap_ui_state_of_stopped_bot: einen laufenden Bot zieht er beim Einlesen selbst um
        if (!s.botRunning[id] && s.uiState[id]) {
          s.uiState[id] = remapUiStates(s.uiState[id], settingsZones(previous), settingsZones(s.settings[id]));
        }
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

    // --------------------------------------------------------------- Analyse (market.py)
    if (seg[0] === 'market' && seg[2] === 'clock' && method === 'GET') {
      if (!s.accounts.some((a) => String(a.id) === seg[1])) {
        return { status: 404, body: { detail: `Account '${seg[1]}' not found` } };
      }
      // Wie market.py: ohne sichere Messung (Markt zu) kein Abstand
      if (!s.brokerClockReliable) {
        return ok({ account_id: seg[1], reliable: false, offset_sec: null, offset_hours: null, server_now: null, cached: false });
      }
      const now = Date.now() / 1000;
      const offset = s.brokerOffset;
      return ok({
        account_id: seg[1],
        offset_sec: offset,
        offset_hours: offset / 3600,
        raw_sec: offset - 2,
        reliable: true,
        source_symbol: 'USOUSD',
        measured_at: now,
        server_now: now + offset,
        cached: false,
      });
    }

    if (seg[0] === 'market' && seg[2] === 'rates' && method === 'GET') {
      if (!s.accounts.some((a) => String(a.id) === seg[1])) {
        return { status: 404, body: { detail: `Account '${seg[1]}' not found` } };
      }
      const source = url.searchParams.get('source');
      if (source) {
        if (!source.startsWith('csv:')) return { status: 400, body: { detail: 'source must be csv:<import_id>' } };
        return this.csvRates(seg[1], source.slice('csv:'.length), url.searchParams);
      }
      if (s.ratesError) return { status: s.ratesError.status, body: { detail: s.ratesError.detail } };
      return ok(this.rates(seg[1], url.searchParams));
    }

    // --------------------------------------------------------------- CSV-Import (market.py, BKT-05)
    if (seg[0] === 'market' && seg[2] === 'imports') {
      return this.csvImports(method, seg, body);
    }

    if (seg[0] === 'history' && seg[2] === 'deals' && method === 'GET') {
      const account = s.accounts.find((a) => String(a.id) === seg[1]);
      if (!account) return { status: 404, body: { detail: `Account '${seg[1]}' not found` } };
      return ok(this.deals(seg[1], url.searchParams));
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
        // wie worker_python/src/api/logs.py: zone_id (wiederholbar) süzt den Robot-Log auf "[Z:<id>] "
        const tags = url.searchParams.getAll('zone_id').map((zoneId) => `[Z:${zoneId}] `);
        const robot = (s.robotLog[id] ?? []).filter((l) => tags.length === 0 || tags.some((tag) => l.includes(tag)));
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
