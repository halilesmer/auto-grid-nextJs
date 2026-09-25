/**
 * UI-08 · Mobil (375 px): keine Seite läuft horizontal über, und die Buttons des Zonenbereichs liegen
 * vollständig im Fenster. Kopfzeile des Panels („Kaydedildi“ / „Bölge Ekle“) und Zonenkopf (Status, Kaydet,
 * Test, ⋯) brechen um, statt die Karte zu sprengen. Deutsch hat die längsten Beschriftungen.
 */
import type { Locator, Page, Route } from '@playwright/test';
import { DEMO_ID, RUNNING_METRICS, ZONE_ID, expect, test, type AppLocale, type Dashboard } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test.use({ viewport: { width: 375, height: 812 } });

const LOCALES: AppLocale[] = ['tr', 'en', 'de'];

/** Kein horizontaler Scrollbalken der Seite. */
async function expectNoPageOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'Seite scrollt horizontal').toBeLessThanOrEqual(clientWidth);
}

/** Das Element liegt ganz im Fenster (also auch nicht von einem overflow-hidden-Elternteil abgeschnitten). */
async function expectInViewport(page: Page, locator: Locator, name: string) {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x, `${name}: links außerhalb`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name}: rechts außerhalb`).toBeLessThanOrEqual(width);
}

/** Alle Buttons des Zonenbereichs: Panel-Kopf („Bölge Ekle“, Speichern) und Zonenkopf. */
async function expectZoneAreaInViewport(dashboard: Dashboard, lang: AppLocale) {
  const { page } = dashboard;
  const zone = dashboard.zone();
  await expectInViewport(page, page.getByRole('button', { name: msg('zone.panel.add', undefined, lang) }), 'Bölge Ekle');
  await expectInViewport(page, zone.getByTestId('zone-save'), 'Zone speichern');
  await expectInViewport(page, zone.getByRole('link', { name: msg('zone.header.test', undefined, lang) }), 'Test-Link');
  await expectInViewport(page, zone.getByRole('button', { name: msg('zone.header.menu', undefined, lang) }), 'Zonenmenü');
}

for (const lang of LOCALES) {
  test.describe(`Zonenbereich (${lang})`, () => {
    test.use({ appLocale: lang });

    test('Ruhezustand läuft nicht über', { tag: '@UI-08' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await expectZoneAreaInViewport(dashboard, lang);
      await expectNoPageOverflow(page);
    });

    test('Bot läuft, Zone vom Motor gestoppt und ungespeichert', { tag: '@UI-08' }, async ({ page, worker, dashboard }) => {
      worker.setBotRunning(DEMO_ID);
      worker.setMetrics(DEMO_ID, { ...RUNNING_METRICS, zone_states: { '0': 'AUTO_CLEAR' } });
      await dashboard.open(DEMO_ID);
      await dashboard.zoneField(msg('zone.field.minPrice', undefined, lang)).fill('91');
      // Alle Abzeichen und die längste Beschriftung des Statusbuttons sind sichtbar
      const zone = dashboard.zone();
      await expect(zone.getByText(msg('zone.header.unsaved', undefined, lang), { exact: true })).toBeVisible();
      await expect(zone.getByText(msg('zone.stop.autoClear.label', undefined, lang), { exact: true })).toBeVisible();
      await expect(zone.getByRole('button', { name: msg('zone.header.restart', undefined, lang) })).toBeVisible();

      await expectZoneAreaInViewport(dashboard, lang);
      await expectNoPageOverflow(page);
    });
  });
}

test.describe('Weitere Seiten (de)', () => {
  test.use({ appLocale: 'de' });

  test('Formasyon, VPS und Chart laufen nicht über', { tag: '@UI-08' }, async ({ page, worker, dashboard }) => {
    void worker;
    // Status mit Adminprozessen: die längste Variante der Seite „VPS“
    await page.route('**/api/vps/**', async (route: Route) => {
      const action = new URL(route.request().url()).pathname.replace('/api/vps/', '');
      if (action === 'status') {
        return route.fulfill({
          json: {
            ok: true,
            hostname: 'VPS-01',
            version: 'v0.7.71',
            git: { branch: 'main', commit: '6e6011d0' },
            worker: { listening: true, reachable: true, error: null },
            worker_watchdog: true,
            ngrok: { running: true, public_url: 'https://tweet-overlying-monotone.ngrok-free.dev' },
            ngrok_watchdog: true,
            bots: [{ pid: 4711, account: '5039114' }],
            mt5_terminals: 1,
            session_active: true,
            autologon: true,
            auto_update_minutes: null,
            tasks: { start: { exists: true, state: 'Ready' }, update: { exists: true, state: 'Ready' } },
            boot_time: '2026-09-24T08:00:00',
            uptime_minutes: 125,
            elevated: [{ pid: 100, role: 'worker' }, { pid: 200, role: 'bot', account: '5039114' }],
          },
        });
      }
      return route.fulfill({ json: { ok: true, log: 'worker', lines: ['Zeile 1'] } });
    });

    // Über die Navigation, damit das gewählte Konto erhalten bleibt
    await dashboard.open(DEMO_ID);
    const nav = page.getByRole('navigation');

    await nav.getByRole('link', { name: msg('nav.formation', undefined, 'de') }).click();
    await expect(page).toHaveURL(/\/formasyon$/);
    await expectNoPageOverflow(page);

    await nav.getByRole('link', { name: msg('nav.vps', undefined, 'de') }).click();
    await expect(page.getByTestId('vps-elevated')).toBeVisible();
    await expectNoPageOverflow(page);

    await page.goto(`/chart?zone=${ZONE_ID}`);
    await expect(page.getByRole('navigation')).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
