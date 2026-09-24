/**
 * Seitenobjekt des Dashboards, gemeinsam für gemockte (e2e/mocked) und Live-Tests (e2e/live).
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class Dashboard {
  constructor(readonly page: Page) {}

  async open(accountId: string | null) {
    await this.page.goto('/');
    if (accountId) await this.selectAccount(accountId);
  }

  async selectAccount(accountId: string) {
    const options = await this.accountOptions();
    await options.filter({ hasText: `(${accountId})` }).click();
    await expect(this.accountSelect).toHaveAttribute('aria-expanded', 'false');
    // Einstellungen + Symbole geladen → Zonenbereich ist da
    await expect(this.page.getByText('Dinamik Bölgeler')).toBeVisible();
  }

  /** Trigger der Konto-Combobox; zeigt das gewählte Konto als „Name (ID)“ bzw. den Platzhalter. */
  get accountSelect(): Locator {
    return this.page.getByRole('combobox', { name: 'Select Account' });
  }

  /** Öffnet die Kontoliste (falls geschlossen) und liefert ihre Einträge („Name (ID)“ + DEMO/LIVE). */
  async accountOptions(): Promise<Locator> {
    if ((await this.accountSelect.getAttribute('aria-expanded')) !== 'true') await this.accountSelect.click();
    const listId = await this.accountSelect.getAttribute('aria-controls');
    return this.page.locator(`[id="${listId}"]`).getByRole('option');
  }

  /** Schließt die offene Kontoliste (Fokus liegt im Suchfeld). */
  async closeAccountList() {
    await this.page.keyboard.press('Escape');
    await expect(this.accountSelect).toHaveAttribute('aria-expanded', 'false');
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
