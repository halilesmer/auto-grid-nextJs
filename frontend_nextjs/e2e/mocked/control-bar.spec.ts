/**
 * UI-09 · Kompakte Steuerleiste: Kontoauswahl, Kontomenü, Bot-Steuerung und Prüfintervall liegen in einer
 * Leiste über den Kennzahlen (Desktop: eine Zeile), bei 375 px brechen die Gruppen um. Das Systemmenü
 * liegt im Kopf-Menü (UI-01), nicht mehr in der Leiste.
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
    // Kein ⚙-Systemmenü mehr in der Leiste (liegt im Kopf-Menü, UI-01)
    await expect(bar.locator('svg.lucide-settings')).toHaveCount(0);
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

  test('Leiste bleibt beim Scrollen oben fixiert', { tag: '@UI-09' }, async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await dashboard.open(DEMO_ID);
    const bar = page.getByTestId('control-bar');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY), 'Seite muss scrollbar sein').toBeGreaterThan(100);
    await expect(bar).toBeInViewport();
    const box = await bar.boundingBox();
    // Direkt unter der Navigation (56 px, --nav-height), nicht weggescrollt
    const nav = await page.getByRole('navigation').boundingBox();
    expect(box!.y).toBeCloseTo(nav!.y + nav!.height, 0);
    await expect(bar.getByRole('button', { name: msg('bot.start') })).toBeInViewport();
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
        await expectInViewport(page, page.getByTestId('connection-chip'), 'Kopf-Menü');
        await expectInViewport(page, bar.getByRole('button', { name: msg('bot.restart', undefined, lang) }), 'Neustart');
        await expectInViewport(page, bar.getByRole('button', { name: msg('bot.stop', undefined, lang) }), 'Stopp');
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, 'Seite scrollt horizontal').toBeLessThanOrEqual(clientWidth);

        // Aufgeklapptes Kontomenü liegt ganz im Fenster
        await dashboard.openAccountMenu();
        await expectInViewport(page, bar.getByRole('button', { name: msg('account.action.add', undefined, lang) }), 'Neues Konto');
        // Das Prüfintervall liegt unter sm im ⋯-Menü (Platz fehlt in der Leiste)
        await expect(bar.getByTestId('general-settings')).toBeHidden();
        const menuSettings = bar.getByTestId('general-settings-menu');
        await expectInViewport(page, menuSettings, 'Intervall im Menü');
        await expectInViewport(page, menuSettings.getByRole('button', { name: msg('common.save', undefined, lang) }), 'Intervall speichern');
      });
    });
  }
});

async function scrollToEnd(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY), 'Seite muss scrollbar sein').toBeGreaterThan(100);
}

async function barTop(page: Page) {
  const nav = await page.getByRole('navigation').boundingBox();
  const bar = await page.getByTestId('control-bar').boundingBox();
  return { nav, bar };
}

for (const size of [{ width: 1440, height: 600 }, { width: 375, height: 600 }]) {
  test.describe(`UI-09 fixierte Leiste ${size.width} px`, () => {
    test.use({ viewport: size });

    test('Leiste und Kennzahlen kleben unter der Navigation', { tag: '@UI-09' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await scrollToEnd(page);
      const { nav, bar } = await barTop(page);
      expect(bar!.y).toBeCloseTo(nav!.y + nav!.height, 0);
      // Eine Zeile: DEMO, Konto, Status und Start in 56 px; sonst höchstens die 3-Zeilen-Höhe der Zonen
      if (size.width === 375) expect(bar!.height, 'Leiste einzeilig').toBeLessThanOrEqual(64);
      // Standard: Kennzahlen angeheftet, direkt unter der Leiste
      const metrics = page.getByTestId('metric-profit');
      await expect(metrics).toBeInViewport();
      const m = await metrics.boundingBox();
      expect(m!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
      expect(m!.y).toBeLessThan(bar!.y + bar!.height + 40);
    });

    test('jedes Dropdown überdeckt die Leiste und verschiebt sie nicht', { tag: '@UI-09' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await scrollToEnd(page);
      const before = (await barTop(page)).bar!;
      const sameBar = async (name: string) => {
        const now = (await barTop(page)).bar!;
        expect(now.y, `${name}: Leiste y`).toBeCloseTo(before.y, 0);
        expect(now.height, `${name}: Leiste Höhe`).toBeCloseTo(before.height, 0);
      };
      const onTop = async (panel: Locator, name: string) => {
        await expect(panel, name).toBeVisible();
        const hit = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 20));
          const low = document.elementFromPoint(r.x + r.width / 2, r.bottom - 2);
          return !!top && el.contains(top) && !!low && el.contains(low);
        });
        expect(hit, `${name}: Panel liegt oben`).toBe(true);
      };

      // Kontoliste
      await dashboard.accountSelect.click();
      const list = page.locator(`[id="${await dashboard.accountSelect.getAttribute('aria-controls')}"]`);
      await onTop(list, 'Kontoliste');
      const lb = await list.boundingBox();
      expect(lb!.width, 'Kontoliste lesbar breit').toBeGreaterThanOrEqual(200);
      expect(lb!.x + lb!.width, 'Kontoliste im Fenster').toBeLessThanOrEqual(size.width);
      await sameBar('Kontoliste');
      await dashboard.closeAccountList();

      // ⋯-Menü
      await dashboard.openAccountMenu();
      await onTop(page.getByTestId('control-bar').getByRole('button', { name: msg('account.action.add') }), 'Kontomenü');
      await sameBar('Kontomenü');
      await page.keyboard.press('Escape');

      // Kopf-Menü
      await page.getByTestId('connection-chip').click();
      await onTop(page.getByTestId('header-menu-panel'), 'Kopf-Menü');
      await sameBar('Kopf-Menü');
    });

    test('Anheften-Knopf schaltet die Kennzahlen um, Wahl bleibt gespeichert', { tag: '@UI-09' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      // Unter sm liegt der Knopf im ⋯-Menü
      const togglePin = async () => {
        if (size.width < 640) {
          await dashboard.openAccountMenu();
          await page.getByTestId('metrics-pin-menu').click();
        } else {
          await page.getByTestId('metrics-pin').click();
        }
      };
      const pinned = async () => (await page.getByTestId('metrics-pin').getAttribute('data-pinned')) === 'true';
      expect(await pinned()).toBe(true);
      await togglePin();
      await expect.poll(pinned).toBe(false);
      await scrollToEnd(page);
      await expect(page.getByTestId('metric-profit')).not.toBeInViewport();
      await expect(page.getByTestId('control-bar')).toBeInViewport();

      await page.reload();
      await dashboard.selectAccount(DEMO_ID);
      await expect.poll(pinned).toBe(false);
      await togglePin();
      await scrollToEnd(page);
      await expect(page.getByTestId('metric-profit')).toBeInViewport();
    });

    test('Speichern-Hinweis erscheint nur bei Änderungen', { tag: '@UI-09' }, async ({ page, worker, dashboard }) => {
      await dashboard.open(DEMO_ID);
      const hint = page.getByTestId('bar-unsaved');
      await expect(hint).toBeHidden();
      await dashboard.zoneField(msg('zone.field.maxPrice')).fill('135');
      await scrollToEnd(page);
      await expect(hint).toBeInViewport();
      await expect(page.getByTestId('control-bar')).toContainText(msg('saveBar.unsaved.short'));
      await hint.getByRole('button', { name: msg('common.save') }).click();
      await expect(hint).toBeHidden();
      expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ max_price: 135 });
    });
  });
}
