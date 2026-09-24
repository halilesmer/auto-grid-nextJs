import { defineConfig, devices } from '@playwright/test';
import { E2E_API_KEY, E2E_PORT, MOCK_API } from './e2e/fixtures/env';

/**
 * Oberflächentests (Funktionskatalog docs/features/features.yaml, Ebene „e2e“).
 *
 * Projekt `mocked`: Produktions-Build gegen einen gemockten Worker (e2e/fixtures/mock-worker.ts),
 * kein VPS, kein MT5. Jeder Test trägt die Feature-ID als Tag (z. B. `@ZON-05`), daraus
 * erzeugt scripts/features/update_checklist.py die Checkliste.
 *
 *   npm run test:e2e                      alle gemockten Tests
 *   npx playwright test --grep @ZON      nur eine Kategorie
 *   npx playwright test --ui             interaktiv
 *
 * Der Build landet in .next-e2e (NEXT_DIST_DIR), damit er neben `npm run dev:frontend` laufen kann.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Service Worker würden Anfragen an page.route vorbei leiten; UI-03 schaltet sie gezielt ein
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'mocked',
      testDir: './e2e/mocked',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      NEXT_PUBLIC_API_URL: MOCK_API,
      NEXT_PUBLIC_WORKER_API_KEY: E2E_API_KEY,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
