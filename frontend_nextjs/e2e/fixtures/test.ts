/**
 * `test` mit gemocktem Worker. Jeder Test bekommt einen eigenen MockWorker (frische Daten),
 * der vor dem ersten Seitenaufruf installiert ist.
 *
 *   test('…', { tag: '@ZON-05' }, async ({ page, worker, dashboard }) => { … })
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { DEMO_ID } from './data';
import { MockWorker } from './mock-worker';

export { expect };
export * from './data';
export type { MockWorker };

export class Dashboard {
  constructor(readonly page: Page) {}

  async open(accountId: string | null = DEMO_ID) {
    await this.page.goto('/');
    if (accountId) await this.selectAccount(accountId);
  }

  async selectAccount(accountId: string) {
    await this.accountSelect.selectOption(accountId);
    // Einstellungen + Symbole geladen → Zonenbereich ist da
    await expect(this.page.getByText('Dinamik Bölgeler')).toBeVisible();
  }

  get accountSelect(): Locator {
    return this.page.getByLabel('Select Account');
  }

  zone(index = 0): Locator {
    return this.page.getByTestId('zone-card').nth(index);
  }

  /**
   * Eingabefeld einer Zone über seine Beschriftung. InputField umschließt das Feld mit <label>;
   * getByLabel passt bei <select> nicht, weil der Label-Text dort auch die Optionen enthält.
   */
  zoneField(label: string, index = 0): Locator {
    return this.zone(index)
      .locator('label')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .locator('input, select')
      .first();
  }

  /**
   * Führt `action` aus und beantwortet den Browser-Dialog (alert/confirm), den sie öffnet.
   * Der Handler wird vorher registriert: ein synchrones alert() im Klick-Handler blockiert
   * sonst den Klick selbst.
   */
  async withDialog(action: () => Promise<void>, answer: 'accept' | 'dismiss' = 'dismiss'): Promise<string> {
    let message: string | null = null;
    this.page.once('dialog', (dialog) => {
      message = dialog.message();
      void (answer === 'accept' ? dialog.accept() : dialog.dismiss());
    });
    await action();
    await expect.poll(() => message, { message: 'Browser-Dialog erwartet' }).not.toBeNull();
    return message!;
  }

  zoneSwitch(label: string, index = 0): Locator {
    return this.zone(index).locator('label', { hasText: label }).getByRole('switch');
  }

  get saveAll(): Locator {
    return this.page.getByRole('button', { name: /Tüm Ayarları Kaydet|Kaydedildi|Kaydediliyor/ });
  }

  /** „Tüm Ayarları Kaydet“ klicken und warten, bis der Kopf-Button „Kaydedildi“ zeigt. */
  async saveAllSettings() {
    await this.page.getByRole('button', { name: 'Tüm Ayarları Kaydet' }).click();
    await expect(this.saveAll).toHaveText(/Kaydedildi/);
  }

  get logOutput(): Locator {
    return this.page.getByTestId('log-output');
  }

  get botStatus(): Locator {
    return this.page.getByTestId('bot-status');
  }

  /** Log-Polling sofort auslösen (statt 10 s zu warten). */
  async refreshLogs() {
    await this.page.getByRole('button', { name: 'Refresh' }).click();
  }
}

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
