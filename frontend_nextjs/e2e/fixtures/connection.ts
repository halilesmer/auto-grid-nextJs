/**
 * Zustand der Worker-Verbindung im Browser (SYS-07). Ohne Eintrag im localStorage gilt der Startwert aus
 * dem Build (NEXT_PUBLIC_API_URL = MOCK_API): dann ist die Seite „verbunden".
 */
import type { Page } from '@playwright/test';

export const CONNECTION_STORAGE_KEY = 'grid-robot-connection';

/**
 * Getrennt: ein gespeicherter Eintrag mit leerer Adresse, wie ihn „Trennen" schreibt. Gilt nur beim
 * ersten Laden, ein späteres Speichern (Verbinden + Reload) bleibt erhalten.
 */
export async function startDisconnected(page: Page) {
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ state: { baseUrl: '', apiKey: '' }, version: 0 }));
    }
  }, CONNECTION_STORAGE_KEY);
}

/**
 * Verbunden mit einem anderen Schlüssel als dem Admin-Schlüssel (z. B. E2E_USER_KEY): der Eintrag steht
 * vor dem ersten Laden im localStorage, die Seite ist danach „als Benutzer“ verbunden.
 */
export async function connectWithKey(page: Page, baseUrl: string, apiKey: string) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [CONNECTION_STORAGE_KEY, JSON.stringify({ state: { baseUrl, apiKey }, version: 0 })],
  );
}

/** Der gespeicherte Eintrag (oder null). */
export function storedConnection(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, CONNECTION_STORAGE_KEY);
}
