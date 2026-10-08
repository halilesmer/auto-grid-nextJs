/**
 * UI-08 · Mobil (375 px): keine Seite läuft horizontal über, und die Buttons des Zonenbereichs liegen
 * vollständig im Fenster. Kopfzeile des Panels („Kaydedildi“ / „Sembol Ekle“), Symbolkopf und Setup-Kopf (Status, Kaydet,
 * Test, ⋯) brechen um, statt die Karte zu sprengen. Die Tab-Leisten der Logs (Dashboard, /vps) sind bedienbar:
 * jeder Tab ist erreichbar, auch wenn die Leiste breiter ist als die Karte. Deutsch hat die längsten Beschriftungen.
 */
import type { Locator, Page, Route } from '@playwright/test';
import { DEMO_ID, RUNNING_METRICS, ZONE_ID, expect, makeZone, test, type AppLocale, type Dashboard } from '../fixtures/test';
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

/**
 * Kein Element einer Setup-Karte ragt rechts über sein Elternelement hinaus. Die Seite selbst kann dabei
 * schmal genug bleiben (overflow-hidden der Karte schneidet ab), deshalb reicht expectNoPageOverflow nicht.
 * Absolut positionierte Elemente zählen nicht: sie liegen bewusst außerhalb des Flusses (z. B. der
 * pulsierende Ring des Statuspunkts).
 */
async function expectNothingOverflowsInSetupCards(page: Page) {
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="zone-card"] *')].flatMap((el) => {
      const parent = el.parentElement!;
      const box = el.getBoundingClientRect();
      const inFlow = !['absolute', 'fixed'].includes(getComputedStyle(el).position);
      const visibleOverflow = getComputedStyle(parent).overflow === 'visible';
      return box.width > 0 && inFlow && visibleOverflow && box.right > parent.getBoundingClientRect().right + 1
        ? [el.outerHTML.slice(0, 120)]
        : [];
    }),
  );
  expect(overflowing, 'Elemente ragen über ihren Rahmen in der Setup-Karte').toEqual([]);
}

/** Alle Buttons des Zonenbereichs: Panel-Kopf („Sembol Ekle“, Speichern), Symbolkopf („Setup Ekle“) und Setup-Kopf. */
async function expectZoneAreaInViewport(dashboard: Dashboard, lang: AppLocale) {
  const { page } = dashboard;
  const zone = dashboard.zone();
  await expectInViewport(page, page.getByRole('button', { name: msg('zone.panel.add', undefined, lang) }), 'Sembol Ekle');
  await expectInViewport(page, dashboard.symbolCard().getByRole('button', { name: msg('zone.symbol.addSetup', undefined, lang) }), 'Setup Ekle');
  await expectInViewport(page, zone.getByTestId('zone-save'), 'Zone speichern');
  await expectInViewport(page, zone.getByRole('link', { name: msg('zone.header.test', undefined, lang) }), 'Test-Link');
  await expectInViewport(page, zone.getByRole('button', { name: msg('zone.header.menu', undefined, lang) }), 'Zonenmenü');
}

/**
 * Der Tab lässt sich antippen: er liegt ganz im Fenster und ganz in seiner Tab-Leiste, und an beiden Enden und in
 * der Mitte trifft ein Tipp wirklich ihn (ein overflow-hidden-Elternteil würde ihn abschneiden, ohne dass die
 * Seite horizontal überläuft, deshalb reicht die Prüfung der Seitenbreite dafür nicht).
 */
function tabFullyVisible(tab: Locator): Promise<boolean> {
  return tab.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const list = el.closest('[role="tablist"]')!.getBoundingClientRect();
    const inWindow = r.left >= 0 && r.right <= window.innerWidth;
    const inList = r.left >= list.left - 0.5 && r.right <= list.right + 0.5;
    const y = r.top + r.height / 2;
    const hit = [r.left + 3, r.left + r.width / 2, r.right - 3].every((x) => el.contains(document.elementFromPoint(x, y)));
    return inWindow && inList && hit;
  });
}

/**
 * Tab-Leiste bedienbar: sie ragt nicht über ihre Karte hinaus, ist bei zu wenig Platz selbst horizontal scrollbar,
 * und jeder Tab lässt sich wählen und liegt danach vollständig sichtbar in der Leiste.
 */
async function expectTabsReachable(page: Page, tablist: Locator, tabCount: number) {
  await expectInViewport(page, tablist, 'Tab-Leiste');
  const list = (await tablist.boundingBox())!;
  const card = (await tablist.locator('xpath=..').boundingBox())!;
  expect(list.x + list.width, 'Tab-Leiste ragt rechts über ihre Karte hinaus').toBeLessThanOrEqual(card.x + card.width + 0.5);
  const scrollable = await tablist.evaluate((el) => {
    const { overflowX } = getComputedStyle(el);
    return el.scrollWidth <= el.clientWidth || overflowX === 'auto' || overflowX === 'scroll';
  });
  expect(scrollable, 'Tab-Leiste ist breiter als ihr Platz, aber nicht scrollbar').toBe(true);

  const tabs = tablist.getByRole('tab');
  await expect(tabs).toHaveCount(tabCount);
  for (let i = 0; i < tabCount; i++) {
    const tab = tabs.nth(i);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => tabFullyVisible(tab), { message: `Tab ${i + 1} ist nach dem Wählen nicht ganz sichtbar` }).toBe(true);
  }
  // Auch der erste Tab ist nach dem Zurückwählen wieder ganz da (Leiste scrollt nach links zurück)
  await tabs.first().click();
  await expect.poll(() => tabFullyVisible(tabs.first())).toBe(true);
}

/** Antworten der Route /api/vps/* (läuft im Next.js-Server, im Test gemockt). */
async function mockVps(page: Page) {
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
          ngrok: { running: true, public_url: 'https://example-tunnel-subdomain.ngrok-free.dev' },
          ngrok_watchdog: true,
          bots: [{ pid: 4711, account: '12345678' }],
          mt5_terminals: 1,
          session_active: true,
          autologon: true,
          auto_update_minutes: null,
          tasks: { start: { exists: true, state: 'Ready' }, update: { exists: true, state: 'Ready' } },
          boot_time: '2026-09-24T08:00:00',
          uptime_minutes: 125,
          elevated: [{ pid: 100, role: 'worker' }, { pid: 200, role: 'bot', account: '12345678' }],
        },
      });
    }
    return route.fulfill({ json: { ok: true, log: 'worker', lines: ['Zeile 1'] } });
  });
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

    test('Symbolkarten mit mehreren Setups und der Dialog „Sembol Ekle“ laufen nicht über', { tag: ['@UI-08', '@ZON-20'] }, async ({ page, worker, dashboard }) => {
      worker.setZones(DEMO_ID, [
        makeZone(),
        makeZone({ id: 'zone-e2e-2', order_type: 'BOTH' }),
        makeZone({ id: 'zone-e2e-3', symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
      ]);
      worker.setBotRunning(DEMO_ID);
      await dashboard.open(DEMO_ID);
      await expect(page.getByTestId('symbol-card')).toHaveCount(2);
      await expect(dashboard.symbolCard().getByTestId('zone-market')).toBeVisible();
      for (const index of [0, 1]) {
        await expectInViewport(page, dashboard.symbolCard(index).getByTestId('setup-count'), `Setup-Zahl ${index}`);
        await expectInViewport(
          page,
          dashboard.symbolCard(index).getByRole('button', { name: msg('zone.symbol.addSetup', undefined, lang) }),
          `Setup Ekle ${index}`,
        );
      }
      await expectZoneAreaInViewport(dashboard, lang);
      await expectNothingOverflowsInSetupCards(page);
      await expectNoPageOverflow(page);

      await page.getByRole('button', { name: msg('zone.panel.add', undefined, lang) }).click();
      const dialog = page.getByTestId('add-symbol-dialog');
      await dialog.getByPlaceholder(msg('zone.symbol.placeholder', undefined, lang)).fill('XAUUSD');
      await expect(dialog).toContainText(msg('zone.addSymbol.exists', { symbol: 'XAUUSD' }, lang));
      await expectInViewport(page, dialog.getByRole('button', { name: msg('zone.addSymbol.confirm', undefined, lang), exact: true }), 'Ekle');
      await expectNoPageOverflow(page);
    });

    test('Kompaktes Setup: alle Schalter an, zwei Felder je Zeile, nichts läuft über', { tag: ['@UI-08', '@ZON-20'] }, async ({ page, worker, dashboard }) => {
      worker.setZones(DEMO_ID, [
        makeZone({ order_type: 'BOTH', sync_buy_sell: false, step_by_loss: true, instant_entry: true, is_breakout: true, clear_on_exit: true, exit_condition: 'Mum Kapanışı' }),
        makeZone({ id: 'zone-e2e-2', order_type: 'BOTH', sync_buy_sell: false, entry_mode: 'fractal', fractal_use_sl: true, fractal_tp_by_money: true }),
      ]);
      await dashboard.open(DEMO_ID);
      await expect(page.getByTestId('zone-card')).toHaveCount(2);

      // Kurze Felder: Grid-Schritt und Lot stehen auch bei 375 px nebeneinander
      const step = await dashboard.zoneField(msg('zone.field.buyGridLoss', undefined, lang)).boundingBox();
      const lot = await dashboard.zoneField(msg('zone.field.buyLot', undefined, lang)).boundingBox();
      expect(Math.abs(step!.y - lot!.y), 'Grid-Schritt und Lot in verschiedenen Zeilen').toBeLessThanOrEqual(1);

      await expectZoneAreaInViewport(dashboard, lang);
      await expectNothingOverflowsInSetupCards(page);
      await expectNoPageOverflow(page);
    });
  });

  test.describe(`Log-Tabs (${lang})`, () => {
    test.use({ appLocale: lang });

    test('Dashboard: Tab-Leiste des Log-Viewers ist bedienbar', { tag: '@UI-08' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await expectTabsReachable(page, page.getByRole('tablist'), 3);
      await expectNoPageOverflow(page);
    });

    test('/vps: Tab-Leiste des VPS-Logs ist bedienbar', { tag: '@UI-08' }, async ({ page, worker }) => {
      void worker;
      await mockVps(page);
      await page.goto('/vps');
      await expect(page.getByTestId('vps-log-output')).toBeVisible();
      await expectTabsReachable(page, page.getByRole('tablist'), 4);
      await expectNoPageOverflow(page);
    });
  });
}

test.describe('Weitere Seiten (de)', () => {
  test.use({ appLocale: 'de' });

  test('Formasyon, VPS und Chart laufen nicht über', { tag: '@UI-08' }, async ({ page, worker, dashboard }) => {
    void worker;
    await mockVps(page);

    // Über die Navigation, damit das gewählte Konto erhalten bleibt
    await dashboard.open(DEMO_ID);
    const nav = page.getByRole('navigation');

    await nav.getByRole('link', { name: msg('nav.formation', undefined, 'de') }).click();
    await expect(page).toHaveURL(/\/formasyon$/);
    await expectNoPageOverflow(page);

    await nav.getByRole('link', { name: msg('nav.vps', undefined, 'de') }).click();
    await expect(page.getByTestId('vps-elevated')).toBeVisible();
    await expectNoPageOverflow(page);

    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByRole('navigation')).toBeVisible();
    await expectNoPageOverflow(page);
  });

  // Einstellungen, Ergebnis mit zwei Spalten („Beide“), Hinweise und Protokoll (BKT-06)
  test('Backtest-Seite mit Ergebnis läuft nicht über', { tag: '@UI-08' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`);
    await expect(page.getByTestId('backtest-settings')).toBeVisible();
    await expectNoPageOverflow(page);
    await expectInViewport(page, page.getByTestId('bt-run'), 'Test starten');

    await page.getByTestId('bt-path').selectOption('both');
    await page.getByTestId('bt-run').click();
    await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('bt-result-column')).toHaveCount(2);
    await expectNoPageOverflow(page);
    await expectInViewport(page, page.getByTestId('bt-notes'), 'Hinweise');
  });
});
