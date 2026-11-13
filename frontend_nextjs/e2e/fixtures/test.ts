/**
 * `test` mit gemocktem Worker. Jeder Test bekommt einen eigenen MockWorker (frische Daten),
 * der vor dem ersten Seitenaufruf installiert ist.
 *
 *   test('…', { tag: '@ZON-05' }, async ({ page, worker, dashboard }) => { … })
 *
 * Sprache der Oberfläche: Standard `tr` (= Standardsprache der App, kein Eintrag nötig). Andere Sprache je
 * Datei/Block mit `test.use({ appLocale: 'de' })`. Der Wert landet vor dem ersten Seitenaufruf im localStorage,
 * überschreibt aber keine Auswahl, die ein Test selbst getroffen hat (Reload behält sie).
 */
import { test as base, expect } from '@playwright/test';
import { Dashboard, openSetup } from './dashboard';
import { MockWorker, setFakeNow } from './mock-worker';

export { expect, Dashboard, openSetup };
export * from './data';
export type { MockWorker };

// Fixture-Callback heißt `provide` statt `use`: sonst hält react-hooks/rules-of-hooks ihn für React.use
export type AppLocale = 'tr' | 'en' | 'de';

export const LOCALE_STORAGE_KEY = 'grid-robot-locale';

export const test = base.extend<{ worker: MockWorker; dashboard: Dashboard; appLocale: AppLocale; fakeNow: string | null }>({
  appLocale: ['tr', { option: true }],
  // Feste Uhr (ISO) für Tests, deren Mock-Kerzen von der Uhrzeit abhängen (Sinuskurve in MockWorker.rates); null = echte Uhr
  fakeNow: [null, { option: true }],
  page: async ({ page, appLocale, fakeNow }, provide) => {
    setFakeNow(fakeNow);
    if (appLocale !== 'tr') {
      await page.addInitScript(
        ([key, locale]) => {
          if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ state: { locale }, version: 0 }));
        },
        [LOCALE_STORAGE_KEY, appLocale],
      );
    }
    const clock = fakeNow ?? process.env.E2E_FAKE_NOW;
    if (clock) await page.clock.install({ time: new Date(clock) });
    await provide(page);
    setFakeNow(null);
  },
  worker: async ({ page }, provide) => {
    const worker = new MockWorker();
    await worker.install(page);
    await provide(worker);
    // Jede Worker-Anfrage muss den API-Schlüssel senden, und der Mock muss sie kennen
    expect(worker.unauthorized, 'Worker-Aufrufe ohne X-API-Key').toEqual([]);
    expect(worker.unhandled, 'Worker-Endpunkte, die der Mock nicht kennt').toEqual([]);
    expect(worker.zonesPayloads, 'Einstellungen mit ZONES gespeichert (ZON-19: nur SYMBOLS)').toEqual([]);
  },
  dashboard: async ({ page, worker, appLocale }, provide) => {
    void worker; // stellt sicher, dass der Mock vor dem ersten Seitenaufruf installiert ist
    await provide(new Dashboard(page, appLocale));
  },
});
