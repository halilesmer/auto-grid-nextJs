/**
 * Live-Tests gegen den echten Worker (VPS/ngrok) und das DEMO-Testkonto.
 *
 * - Worker-URL und API-Schlüssel kommen aus frontend_nextjs/.env.local (wie beim Frontend).
 * - Das Konto kommt aus hooks/test-account.local.md (gitignored, ohne Passwort; RULES.md §3).
 * - Jeder Test prüft vorher: Konto existiert im Worker und ist DEMO. Sonst wird übersprungen.
 *
 * Diese Datei schreibt nichts. Schreibende Helfer (Einstellungen, ui-state, Start/Stop) liegen in
 * trading.spec.ts und laufen nur mit E2E_LIVE_DEMO=1.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { Dashboard } from '../fixtures/dashboard';

export { expect, Dashboard };

const FRONTEND_DIR = path.resolve(__dirname, '../..');
const ACCOUNT_FILE =
  process.env.E2E_TEST_ACCOUNT_FILE ?? path.resolve(FRONTEND_DIR, '../hooks/test-account.local.md');

loadEnvConfig(FRONTEND_DIR);

export interface TestAccount {
  id: string;
  type: string;
  mt5Path: string | null;
}

/** Liest Hesap ID, Tür und MT5-Pfad aus hooks/test-account.local.md; null, wenn die Datei fehlt. */
export function readTestAccount(): TestAccount | null {
  if (!existsSync(ACCOUNT_FILE)) return null;
  const text = readFileSync(ACCOUNT_FILE, 'utf-8');
  const id = text.match(/Hesap ID[^:\n]*:\*\*\s*(\d+)/)?.[1];
  const type = text.match(/\*\*Tür:\*\*\s*([A-Z]+)/)?.[1];
  const mt5Path = text.match(/MT5 yolu[^:\n]*:\*\*\s*(\S.*\.exe)/)?.[1] ?? null;
  return id && type ? { id, type, mt5Path } : null;
}

type Json = Record<string, unknown>;

export interface LiveMetrics {
  mt5_connected?: boolean;
  market_open?: boolean;
  current_price?: number;
  profit?: number;
  open_positions?: number;
  pending_orders?: number;
  zone_states?: Record<string, string>;
  zone_market_open?: Record<string, boolean>;
  zone_market_hours?: Record<string, string>;
  remote_paused?: boolean;
  [key: string]: unknown;
}

export interface LiveZone {
  id: string;
  symbol: string;
  order_type: string;
  min_price: number;
  max_price: number;
  is_active?: boolean;
  [key: string]: unknown;
}

/** Dünner REST-Client für den echten Worker (gleiche Header wie das Frontend). */
export class LiveWorker {
  readonly base: string;
  readonly key: string;

  constructor(private request: APIRequestContext) {
    const raw = process.env.NEXT_PUBLIC_API_URL ?? '';
    this.base = raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
    this.key = process.env.NEXT_PUBLIC_WORKER_API_KEY ?? '';
  }

  get configured(): boolean {
    return Boolean(this.base);
  }

  headers(withKey = true): Record<string, string> {
    return {
      'ngrok-skip-browser-warning': 'true',
      ...(withKey && this.key ? { 'X-API-Key': this.key } : {}),
    };
  }

  wsUrl(withKey = true): string {
    const url = this.base.replace(/^http/, 'ws') + '/ws/stream';
    return withKey && this.key ? `${url}?api_key=${encodeURIComponent(this.key)}` : url;
  }

  async get<T = Json>(apiPath: string, withKey = true): Promise<T> {
    const res = await this.request.get(`${this.base}/api${apiPath}`, { headers: this.headers(withKey) });
    expect(res.status(), `GET ${apiPath}`).toBe(200);
    return (await res.json()) as T;
  }

  async status(apiPath: string, withKey = true): Promise<number> {
    const res = await this.request.get(`${this.base}/api${apiPath}`, { headers: this.headers(withKey) });
    return res.status();
  }

  async post<T = Json>(apiPath: string, body: unknown = {}): Promise<T> {
    const res = await this.request.post(`${this.base}/api${apiPath}`, {
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      data: body,
    });
    expect(res.status(), `POST ${apiPath}: ${await res.text()}`).toBeLessThan(300);
    return (await res.json()) as T;
  }

  accounts() {
    return this.get<{ accounts: Json[] }>('/accounts').then((r) => r.accounts);
  }

  async settings(accountId: string): Promise<{ LOOP_INTERVAL_SECONDS?: number; ZONES?: LiveZone[]; [k: string]: unknown }> {
    return (await this.get<{ settings: Json }>(`/settings/${accountId}`)).settings;
  }

  async botStatus(accountId: string): Promise<{ metrics: LiveMetrics; bot_running: boolean }> {
    return this.get(`/logs/${accountId}?log_type=metrics`);
  }

  async logs(accountId: string): Promise<{ robot_log: string[]; mt5_log: string[] }> {
    return this.get(`/logs/${accountId}?log_type=all&lines=200`);
  }

  async uiStates(accountId: string): Promise<Record<string, string>> {
    return (await this.get<{ states: Record<string, string> }>(`/ui-state/${accountId}`)).states;
  }
}

export interface LiveContext {
  api: LiveWorker;
  account: TestAccount;
  dashboard: Dashboard;
}

// Fixture-Callback heißt `provide` statt `use` (react-hooks/rules-of-hooks, siehe fixtures/test.ts)
export const test = base.extend<LiveContext>({
  api: async ({ request }, provide) => {
    const api = new LiveWorker(request);
    test.skip(!api.configured, 'NEXT_PUBLIC_API_URL fehlt (frontend_nextjs/.env.local)');
    await provide(api);
  },
  account: async ({ api }, provide) => {
    const account = readTestAccount();
    test.skip(!account, 'hooks/test-account.local.md fehlt oder ist unvollständig');
    test.skip(account!.type !== 'DEMO', `Testkonto ist ${account!.type}, nicht DEMO (RULES.md §3)`);
    const registered = (await api.accounts()).find((a) => String(a.id) === account!.id);
    test.skip(!registered, `Konto ${account!.id} ist im Worker nicht registriert`);
    test.skip(registered!.env_type !== 'DEMO', `Worker meldet env_type=${registered!.env_type}`);
    await provide(account!);
  },
  dashboard: async ({ page }, provide) => {
    await provide(new Dashboard(page));
  },
});
