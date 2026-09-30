/**
 * UI-09 · Kompakte Steuerleiste: Kontoauswahl, Kontomenü, Bot-Steuerung, Prüfintervall und Systemmenü
 * liegen in einer Leiste über den Kennzahlen (Desktop: eine Zeile), bei 375 px brechen die Gruppen um.
 */
import type { Locator, Page } from '@playwright/test';
import { DEMO_ID, expect, test, type AppLocale } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

async function expectInViewport(page: Page, locator: Locator, name: string) {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  expect(box!.x, `${name}: links außerhalb`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name}: rechts außerhalb`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test.describe('UI-09 Steuerleiste (Desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Konto, Bot-Steuerung und Intervall in einer Zeile', { tag: '@UI-09' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const bar = page.getByTestId('control-bar');
    await expect(bar.getByTestId('env-badge')).toBeVisible();
    await expect(bar.getByRole('combobox', { name: msg('account.select.aria') })).toBeVisible();
    await expect(bar.getByTestId('bot-status')).toHaveText(msg('bot.status.stopped'));
    await expect(bar.getByRole('button', { name: msg('bot.start') })).toBeVisible();
    await expect(bar.getByLabel(msg('settings.interval'))).toHaveValue('2');
    await expect(bar.getByRole('button', { name: msg('dashboard.sysinfo.title') })).toBeVisible();
    // Eine Zeile: 36 px Bedienelemente + Innenabstand
    expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(72);
  });

  test('Kontomenü bündelt Log, Bearbeiten, Löschen und Neues Konto', { tag: '@UI-09' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const bar = page.getByTestId('control-bar');
    // Geschlossen: keine einzelnen Konto-Buttons in der Leiste
    await expect(bar.getByRole('button', { name: msg('account.action.add') })).toBeHidden();
    await dashboard.openAccountMenu();
    for (const key of ['account.action.downloadLog', 'account.action.editTitle', 'account.action.deleteTitle', 'account.action.add'] as const) {
      await expect(bar.getByRole('button', { name: msg(key) })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(bar.getByRole('button', { name: msg('account.action.add') })).toBeHidden();

    // Ohne Konto bleibt nur „Neues Konto“
    await page.reload();
    await dashboard.openAccountMenu();
    await expect(bar.getByRole('button', { name: msg('account.action.add') })).toBeVisible();
    await expect(bar.getByRole('button', { name: msg('account.action.editTitle') })).toBeHidden();
  });
});

test.describe('UI-09 Steuerleiste (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const lang of ['tr', 'en', 'de'] as AppLocale[]) {
    test.describe(lang, () => {
      test.use({ appLocale: lang });

      test(`Leiste bricht um, nichts läuft über (${lang})`, { tag: '@UI-09' }, async ({ page, worker, dashboard }) => {
        // Längster Zustand: Prozess ohne MT5 zeigt Neustart und Stopp
        worker.setBotRunning(DEMO_ID);
        worker.setMetrics(DEMO_ID, { mt5_connected: false });
        await dashboard.open(DEMO_ID);
        const bar = page.getByTestId('control-bar');
        await expectInViewport(page, bar.getByRole('button', { name: msg('account.action.menu', undefined, lang) }), 'Kontomenü');
        await expectInViewport(page, bar.getByRole('button', { name: msg('dashboard.sysinfo.title', undefined, lang) }), 'Systemmenü');
        await expectInViewport(page, bar.getByRole('button', { name: msg('bot.restart', undefined, lang) }), 'Neustart');
        await expectInViewport(page, bar.getByRole('button', { name: msg('bot.stop', undefined, lang) }), 'Stopp');
        await expectInViewport(page, bar.getByRole('button', { name: msg('common.save', undefined, lang) }), 'Intervall speichern');
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, 'Seite scrollt horizontal').toBeLessThanOrEqual(clientWidth);

        // Aufgeklapptes Kontomenü liegt ganz im Fenster
        await dashboard.openAccountMenu();
        await expectInViewport(page, bar.getByRole('button', { name: msg('account.action.add', undefined, lang) }), 'Neues Konto');
      });
    });
  }
});
