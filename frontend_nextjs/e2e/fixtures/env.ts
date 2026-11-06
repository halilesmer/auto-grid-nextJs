/**
 * Gemeinsame Werte für playwright.config.ts und die gemockten Tests.
 *
 * Der Testserver wird mit NEXT_PUBLIC_API_URL = MOCK_API gebaut. Diese Adresse existiert
 * nicht: jede Anfrage an sie (REST und WebSocket) beantwortet der MockWorker im Browser.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** Die Umgebungsvariablen, die die Port-Wahl liest (Teilmenge von process.env). */
export type E2EEnv = Record<string, string | undefined>;

/** Fester Port in CI (ein Runner = ein Checkout). */
export const E2E_CI_PORT = 3100;
/** Bereich für den aus dem Checkout-Pfad abgeleiteten Port (lokal, SYS-10). */
export const E2E_PORT_MIN = 3300;
export const E2E_PORT_MAX = 3999;

/**
 * Stabiler Port pro Checkout: FNV-1a-Hash des Pfads in [E2E_PORT_MIN, E2E_PORT_MAX].
 * Haupt-Checkout und jeder Worktree bekommen so verschiedene Ports, parallele Läufe
 * teilen sich keinen Testserver mehr (Journal 2026-11-05-e2e-port-isolation).
 */
export function portForPath(root: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return E2E_PORT_MIN + (h % (E2E_PORT_MAX - E2E_PORT_MIN + 1));
}

/**
 * Reihenfolge: explizites E2E_PORT > CI (3100) > Port aus dem Checkout-Pfad.
 * Ein gesetztes, aber ungültiges E2E_PORT (keine ganze Zahl 1–65535) ist ein Fehler, kein stiller
 * Rückfall auf den Pfad-Port: sonst läuft ein Lauf auf einem anderen Port als gedacht (R3-09).
 */
export function resolveE2EPort(env: E2EEnv, root: string): number {
  if (env.E2E_PORT) {
    const explicit = Number(env.E2E_PORT);
    if (!/^\d+$/.test(env.E2E_PORT.trim()) || !Number.isInteger(explicit) || explicit < 1 || explicit > 65535) {
      throw new Error(`E2E_PORT="${env.E2E_PORT}" ist ungültig: erwartet eine ganze Zahl von 1 bis 65535.`);
    }
    return explicit;
  }
  if (env.CI) return E2E_CI_PORT;
  return portForPath(root);
}

/**
 * Wurzel dieses Checkouts (Haupt-Checkout oder Worktree), Symlinks aufgelöst.
 * `git rev-parse --show-toplevel` liefert in einem Worktree dessen eigenen Pfad. Das Ergebnis
 * wird in E2E_CHECKOUT_ROOT abgelegt, damit Playwright-Worker (erben die Umgebung) git nicht
 * erneut starten. __dirname allein ist nicht verlässlich: außerhalb des Playwright-Loaders
 * (z. B. `node` mit Type-Stripping) ist es ".".
 */
export function checkoutRoot(env: E2EEnv = process.env): string {
  if (env.E2E_CHECKOUT_ROOT) return env.E2E_CHECKOUT_ROOT;
  let root: string;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    root = path.resolve(process.cwd(), '..');
  }
  try {
    root = realpathSync(root);
  } catch {
    // Pfad bleibt wie er ist
  }
  env.E2E_CHECKOUT_ROOT = root;
  return root;
}

export const CHECKOUT_ROOT = checkoutRoot();

export const E2E_PORT = resolveE2EPort(process.env, CHECKOUT_ROOT);
export const MOCK_API = 'http://mock-worker.test';
// Kein echtes Geheimnis: prüft nur, dass jede Worker-Anfrage den Schlüssel mitsendet (SYS-05)
export const E2E_API_KEY = 'e2e-key';
// Persönlicher Schlüssel des Test-Benutzers (worker.addUser()); Rolle „Benutzer“ statt Admin (USR-01)
export const E2E_USER_KEY = 'e2e-user-key';
