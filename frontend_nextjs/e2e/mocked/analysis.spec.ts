/**
 * Analyse-Seite (/chart), Schritt 1 des Plans: Seitengerüst mit Tabs, Konto/Zone, Kalender, Zahnrad.
 * ANA-01 Seite/Tabs · ANA-02 Konto/Zone ohne fremde Daten · ANA-03 Schalter · ANA-10 Kalender/Brokerzeit
 */
import type { Page } from '@playwright/test';
import { MOCK_API } from '../fixtures/env';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, LIVE_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const tab = (page: Page, key: Parameters<typeof msg>[0]) => page.getByRole('tab', { name: msg(key) });
const accountSelect = (page: Page) => page.getByRole('combobox', { name: msg('account.select.aria') });

async function chooseAccount(page: Page, id: string) {
  await accountSelect(page).click();
  const listId = await accountSelect(page).getAttribute('aria-controls');
  await page.locator(`[id="${listId}"]`).getByRole('option').filter({ hasText: `(${id})` }).click();
}

/** Sichtbare Bedienelemente ohne Hinweis (wie UI-07, tooltips.spec.ts). */
async function unhinted(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls =
      'button, a[href], input, select, textarea, [role="switch"], [role="tab"], [role="radio"], [role="combobox"]';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    const covered = (el: Element) =>
      Boolean(
        el.closest('[data-tooltip-trigger], [data-tooltip-exempt]') ||
          el.closest('label')?.querySelector('[data-tooltip-trigger]') ||
          el.closest('[data-tooltip-scope]')?.querySelector('[data-tooltip-trigger]'),
      );
    return [...document.querySelectorAll(controls)].filter((el) => visible(el) && !covered(el)).map((el) => el.outerHTML.slice(0, 160));
  });
}

test.describe('ANA Analyse-Seite', () => {
  test('Menü „Analyse“ und erste Zone des Kontos', { tag: '@ANA-01' }, async ({ page, worker }) => {
    void worker;
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.analysis') }).click();
    await expect(page.getByRole('heading', { name: msg('analysis.title') })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: msg('analysis.noAccount.title') })).toBeVisible();

    await chooseAccount(page, DEMO_ID);
    // Erste Zone des Kontos wird gewählt und steht mit dem Konto in der URL
    await expect(page).toHaveURL(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByText('90 – 110')).toBeVisible();
  });

  test('Tabs stehen in der URL und überstehen das Neuladen', { tag: '@ANA-01' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByText('90 – 110')).toBeVisible();

    await tab(page, 'analysis.tab.stats').click();
    await expect(page).toHaveURL(/tab=stats/);
    await expect(page.getByTestId('stats-tab')).toBeVisible();

    await page.reload();
    await expect(tab(page, 'analysis.tab.stats')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('zone-select')).toContainText('Bölge 1 · USOUSD');

    await tab(page, 'analysis.tab.backtest').click();
    await expect(page.getByText(msg('analysis.backtest.text'))).toBeVisible();
    await tab(page, 'analysis.tab.chart').click();
    await expect(page).not.toHaveURL(/tab=/);
  });

  test('Lizenzhinweis von TradingView', { tag: '@ANA-01' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}`);
    await page.getByRole('button', { name: msg('analysis.license') }).click();
    const info = page.getByTestId('license-info');
    await expect(info).toContainText('TradingView Lightweight Charts™');
    await expect(info.getByRole('link', { name: 'tradingview.com' })).toHaveAttribute('href', 'https://www.tradingview.com/');
  });

  test('Jedes Bedienelement hat einen Hinweis, auch in Kalender und Zahnrad', { tag: ['@ANA-01', '@UI-07'] }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByTestId('zone-select')).toContainText('USOUSD');
    expect(await unhinted(page)).toEqual([]);

    await page.getByTestId('range-trigger').click();
    await expect(page.getByTestId('range-panel')).toBeVisible();
    expect(await unhinted(page)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: msg('analysis.settings') }).click();
    await expect(page.getByTestId('analysis-settings')).toBeVisible();
    expect(await unhinted(page)).toEqual([]);
  });

  test('Kontowechsel zeigt nie Zonen des alten Kontos', { tag: '@ANA-02' }, async ({ page, worker }) => {
    await page.goto(`/chart?account=${DEMO_ID}`);
    await expect(page.getByTestId('zone-select')).toContainText('Bölge 1 · USOUSD');
    await expect(page.getByText('90 – 110')).toBeVisible();

    // Dasselbe Konto erneut wählen ändert nichts (Zone bleibt)
    await chooseAccount(page, DEMO_ID);
    await expect(page).toHaveURL(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);

    await chooseAccount(page, LIVE_ID);
    await expect(page).toHaveURL(`/chart?account=${LIVE_ID}`);
    await expect(page.getByText('90 – 110')).toBeHidden();
    await expect(page.getByTestId('zone-select')).not.toContainText('USOUSD');
    await expect(page.getByTestId('zone-select').getByRole('combobox')).toBeDisabled();
    // Stream und Dashboard folgen dem Konto der Analyse-Seite
    await expect.poll(() => worker.socketAccounts).toEqual([LIVE_ID]);
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.dashboard') }).click();
    await expect(accountSelect(page)).toContainText(`(${LIVE_ID})`);
  });

  test('Direkt aufgerufenes Konto: Dashboard kennt LIVE/DEMO, unbekanntes Konto wird nicht gewählt', { tag: '@ANA-02' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${LIVE_ID}`);
    await expect(page.getByTestId('zone-select')).toContainText(msg('analysis.zone.empty'));
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.dashboard') }).click();
    await expect(page.getByTestId('env-badge')).toHaveText(msg('dashboard.env.live'));

    await page.goto('/chart?account=9999');
    await expect(page.getByRole('alert').filter({ hasText: msg('analysis.noAccount.title') })).toContainText('9999');
    await expect(page.getByTestId('zone-select')).toBeHidden();
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.dashboard') }).click();
    await expect(accountSelect(page)).toContainText(msg('account.select.placeholder'));
  });

  test('Zonen nicht ladbar: Meldung statt endlosem Laden', { tag: '@ANA-02' }, async ({ page, worker }) => {
    worker.overrides.set(`GET /api/settings/${DEMO_ID}`, { status: 500, body: { detail: 'settings kaputt' } });
    await page.goto(`/chart?account=${DEMO_ID}`);
    await expect(page.getByRole('alert').filter({ hasText: msg('analysis.zone.failed') })).toContainText('settings kaputt');
  });

  test('Verspätete Antwort eines anderen Kontos wird verworfen', { tag: '@ANA-02' }, async ({ page, worker }) => {
    worker.state.settings[LIVE_ID].ZONES = [makeZone({ id: 'zone-live', symbol: 'XAUUSD', min_price: 1900, max_price: 2000 })];
    await page.goto(`/chart?account=${DEMO_ID}`);
    await expect(page.getByTestId('zone-select')).toContainText('USOUSD');

    // Antwort für LIVE kommt erst, nachdem schon wieder DEMO gewählt ist
    let releaseLive: () => void = () => {};
    const liveHeld = new Promise<void>((resolve) => (releaseLive = resolve));
    await page.route(`${MOCK_API}/api/settings/${LIVE_ID}`, async (route) => {
      await liveHeld;
      await route.fallback();
    });
    await chooseAccount(page, LIVE_ID);
    await expect(page.getByTestId('zone-select')).toContainText(msg('analysis.zone.loading'));
    await chooseAccount(page, DEMO_ID);
    await expect(page.getByTestId('zone-select')).toContainText('Bölge 1 · USOUSD');
    releaseLive();
    await expect.poll(() => worker.callsTo('GET', `/api/settings/${LIVE_ID}`).length).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('zone-select')).toContainText('USOUSD');
    await expect(page.getByTestId('zone-select')).not.toContainText('XAUUSD');
    await expect(page.getByText('90 – 110')).toBeVisible();
  });

  test('Anzeige-Schalter bleiben nach dem Neuladen', { tag: '@ANA-03' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByText('90 – 110')).toBeVisible();

    await page.getByRole('button', { name: msg('analysis.settings') }).click();
    const panel = page.getByTestId('analysis-settings');
    await expect(panel).toContainText(msg('analysis.settings.fixed'));
    await panel.getByRole('switch', { name: msg('analysis.settings.zoneCard') }).click();
    await expect(page.getByText('90 – 110')).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('zone-select')).toContainText('USOUSD');
    await expect(page.getByText('90 – 110')).toBeHidden();
    await page.getByRole('button', { name: msg('analysis.settings') }).click();
    await expect(page.getByTestId('analysis-settings').getByRole('switch', { name: msg('analysis.settings.zoneCard') })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

test.describe('ANA-10 Kalender und Brokerzeit', () => {
  test('„Heute“ und „dieses Jahr“ gelten in Brokerzeit, nicht in Browserzeit', { tag: '@ANA-10' }, async ({ page, worker }) => {
    void worker;
    // Browser (Europe/Berlin): 31.12.2026 23:30 – Broker (UTC+3): schon 01.01.2027 01:30
    await page.clock.setFixedTime(new Date('2026-12-31T22:30:00Z'));
    await page.goto(`/chart?account=${DEMO_ID}&range=today`);
    await expect(page.getByTestId('broker-clock')).toHaveText(msg('analysis.clock.badge', { offset: '+3' }));
    await expect(page.getByTestId('range-trigger')).toContainText('01.01.27 – 01.01.27');

    await page.getByTestId('range-trigger').click();
    await page.getByTestId('range-preset-lastYear').click();
    await expect(page).toHaveURL(/range=lastYear/);
    await expect(page.getByTestId('range-trigger')).toContainText('01.01.26 – 31.12.26');

    await page.getByTestId('range-trigger').click();
    await page.getByTestId('range-preset-thisWeek').click();
    // Freitag, 01.01.2027 → Woche ab Montag 28.12.2026
    await expect(page.getByTestId('range-trigger')).toContainText('28.12.26 – 01.01.27');
  });

  test('Eigener Zeitraum als TT.MM.JJ', { tag: '@ANA-10' }, async ({ page, worker }) => {
    void worker;
    await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
    await page.goto(`/chart?account=${DEMO_ID}`);
    await page.getByTestId('range-trigger').click();
    const from = page.getByTestId('range-from');
    const to = page.getByTestId('range-to');
    const apply = page.getByTestId('range-apply');

    await from.fill('31.02.26');
    await expect(page.getByText(msg('analysis.range.invalid'))).toBeVisible();
    await expect(apply).toBeDisabled();

    await from.fill('15.09.26');
    await to.fill('01.09.26');
    await expect(page.getByText(msg('analysis.range.order'))).toBeVisible();
    await expect(apply).toBeDisabled();

    await from.fill('01.09.26');
    await to.fill('15.09.2026');
    await apply.click();
    await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-15/);
    await expect(page.getByTestId('range-trigger')).toContainText('01.09.26 – 15.09.26');

    await page.reload();
    await expect(page.getByTestId('range-trigger')).toContainText('01.09.26 – 15.09.26');
  });

  test('Unsichere oder unbekannte Brokeruhr: Pflicht-Hinweis, Tage vorerst in UTC', { tag: '@ANA-10' }, async ({ page, worker }) => {
    worker.state.brokerClockReliable = false;
    // UTC: 31.12.2026 22:30 – ohne sichere Brokeruhr gilt der UTC-Tag
    await page.clock.setFixedTime(new Date('2026-12-31T22:30:00Z'));
    await page.goto(`/chart?account=${DEMO_ID}&range=today`);
    await expect(page.getByRole('alert').filter({ hasText: msg('analysis.clock.unsure.title') })).toBeVisible();
    await expect(page.getByTestId('broker-clock')).toBeHidden();
    await expect(page.getByTestId('range-trigger')).toContainText('31.12.26 – 31.12.26');

    worker.overrides.set(`GET /api/market/${LIVE_ID}/clock`, { status: 503, body: { detail: '[TIMEOUT] MT5' } });
    await chooseAccount(page, LIVE_ID);
    const unknown = page.getByRole('alert').filter({ hasText: msg('analysis.clock.unknown.title') });
    await expect(unknown).toContainText('[TIMEOUT] MT5');
  });
});
