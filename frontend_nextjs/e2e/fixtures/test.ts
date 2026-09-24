/**
 * `test` mit gemocktem Worker. Jeder Test bekommt einen eigenen MockWorker (frische Daten),
 * der vor dem ersten Seitenaufruf installiert ist.
 *
 *   test('…', { tag: '@ZON-05' }, async ({ page, worker, dashboard }) => { … })
 */
import { test as base, expect } from '@playwright/test';
import { Dashboard } from './dashboard';
import { MockWorker } from './mock-worker';

export { expect, Dashboard };
export * from './data';
export type { MockWorker };

// Fixture-Callback heißt `provide` statt `use`: sonst hält react-hooks/rules-of-hooks ihn für React.use
export const test = base.extend<{ worker: MockWorker; dashboard: Dashboard }>({
  worker: async ({ page }, provide) => {
    const worker = new MockWorker();
    await worker.install(page);
    await provide(worker);
    // Jede Worker-Anfrage muss den API-Schlüssel senden, und der Mock muss sie kennen
    expect(worker.unauthorized, 'Worker-Aufrufe ohne X-API-Key').toEqual([]);
    expect(worker.unhandled, 'Worker-Endpunkte, die der Mock nicht kennt').toEqual([]);
  },
  dashboard: async ({ page, worker }, provide) => {
    void worker; // stellt sicher, dass der Mock vor dem ersten Seitenaufruf installiert ist
    await provide(new Dashboard(page));
  },
});
