import { defineConfig, devices } from '@playwright/test';
import { E2E_API_KEY, E2E_PORT, MOCK_API } from './e2e/fixtures/env';

/**
 * Oberflächentests (Funktionskatalog docs/features/features.yaml, Ebenen „e2e“ und „live“).
 *
 * Projekt `mocked` (Standard): Produktions-Build gegen einen gemockten Worker
 * (e2e/fixtures/mock-worker.ts), kein VPS, kein MT5.
 *
 * Projekt `live-demo` (nur mit E2E_LIVE=1): Produktions-Build mit frontend_nextjs/.env.local,
 * also gegen den echten Worker auf dem VPS und das DEMO-Testkonto aus hooks/test-account.local.md.
 * Nur lesend; Handelstests (e2e/live/trading.spec.ts) laufen zusätzlich nur mit E2E_LIVE_DEMO=1.
 * Mit E2E_LIVE_BASE_URL (z. B. http://localhost:3000) wird ein laufender Dev-Server benutzt.
 *
 * Jeder Test trägt die Feature-ID als Tag (z. B. `@ZON-05`), daraus erzeugt
 * scripts/features/update_checklist.py die Checkliste.
 *
 *   npm run test:e2e                      alle gemockten Tests
 *   npm run test:live                     Live-Tests (nur lesend)
 *   npx playwright test --grep @ZON      nur eine Kategorie
 *   npx playwright test --ui             interaktiv
 *
 * Builds landen in .next-e2e bzw. .next-live (NEXT_DIST_DIR), damit sie neben
 * `npm run dev:frontend` laufen können.
 */
const LIVE = process.env.E2E_LIVE === '1';
const LIVE_PORT = Number(process.env.E2E_LIVE_PORT || 3200);
const LIVE_BASE_URL = process.env.E2E_LIVE_BASE_URL;

const mockedServer = {
  command: `npx next build && npx next start -p ${E2E_PORT}`,
  url: `http://localhost:${E2E_PORT}`,
  env: {
    NEXT_DIST_DIR: '.next-e2e',
    NEXT_PUBLIC_API_URL: MOCK_API,
    NEXT_PUBLIC_WORKER_API_KEY: E2E_API_KEY,
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

// NEXT_PUBLIC_* kommen hier bewusst aus .env.local (Next lädt sie beim Build selbst)
const liveServer = {
  command: `npx next build && npx next start -p ${LIVE_PORT}`,
  url: `http://localhost:${LIVE_PORT}`,
  env: { NEXT_DIST_DIR: '.next-live', NEXT_TELEMETRY_DISABLED: '1' },
};

const server = LIVE ? liveServer : mockedServer;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !LIVE,
  // Live: nacheinander, damit der VPS/ngrok nicht mit parallelen Browsern belastet wird
  workers: LIVE ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: LIVE ? 90_000 : 30_000,
  expect: { timeout: LIVE ? 20_000 : 7_000 },
  use: {
    baseURL: LIVE ? (LIVE_BASE_URL ?? server.url) : server.url,
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Service Worker würden Anfragen an page.route vorbei leiten; UI-03 schaltet sie gezielt ein
    serviceWorkers: 'block',
  },
  projects: LIVE
    ? [{ name: 'live-demo', testDir: './e2e/live', use: { ...devices['Desktop Chrome'] } }]
    : [{ name: 'mocked', testDir: './e2e/mocked', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    LIVE && LIVE_BASE_URL
      ? undefined
      : {
          ...server,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
});
