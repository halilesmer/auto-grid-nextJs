/**
 * UI-23 Statistik als eigene Seite: die Statistik ist der Menüpunkt „Statistik“ (/stats) zwischen „Chart“ und „Backtest“.
 * Die Kopfleiste von /chart hat keine Reiter Chart/Statistik mehr; alte Links /chart?…&tab=stats öffnen /stats ohne `tab`.
 * Plan 1109-A2 (2026-11-09).
 */
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

test.describe('UI-23 Statistik als eigene Seite', () => {
  test('Das Menü hat „Statistik“ zwischen „Chart“ und „Backtest“; der Link öffnet /stats und ist markiert', { tag: '@UI-23' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD`);
    const nav = page.getByTestId('app-nav');
    const hrefs = await nav.locator('a[href^="/"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    const chart = hrefs.indexOf('/chart');
    expect(hrefs.slice(chart, chart + 3)).toEqual(['/chart', '/stats', '/backtest']);
    // Das Werkzeuge-Menü steht hinter Backtest, nicht zwischen Statistik und Backtest
    expect(await nav.locator('a[href="/backtest"], [data-testid="nav-tools"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? e.getAttribute('data-testid')))).toEqual(['/backtest', 'nav-tools']);

    await nav.getByRole('link', { name: msg('nav.stats'), exact: true }).click();
    await expect(page).toHaveURL(/\/stats/);
    await expect(page.getByTestId('analysis-page')).toBeVisible();
    await expect(nav.getByRole('link', { name: msg('nav.stats'), exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: msg('nav.chart'), exact: true })).not.toHaveAttribute('aria-current', 'page');
    // Das Konto kommt über den Store mit
    await expect.poll(() => new URL(page.url()).searchParams.get('account')).toBe(DEMO_ID);
    await expect(page.getByTestId('stats-tab')).toBeVisible();
  });

  test('Die Kopfleiste von /chart hat keine Reiter Chart/Statistik', { tag: '@UI-23' }, async ({ page, worker }) => {
    void worker;
    for (const [w, h] of [[1440, 900], [375, 812]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD`);
      await expect(page.getByTestId('chart-topbar')).toBeVisible();
      await expect(page.getByTestId('range-trigger').first()).toBeVisible();
      await expect(page.getByTestId('chart-topbar').getByRole('tab')).toHaveCount(0);
    }
  });

  test('Ein alter Link /chart?…&tab=stats öffnet /stats und behält Konto und Setup, ohne tab', { tag: '@UI-23' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tab=stats&range=last30`);
    await expect(page).toHaveURL(/\/stats\?/);
    await expect(page.getByTestId('stats-tab')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBeNull();
    const url = new URL(page.url());
    expect(url.searchParams.get('account')).toBe(DEMO_ID);
    expect(url.searchParams.get('zone')).toBe(ZONE_ID);
    expect(url.searchParams.get('range')).toBe('last30');
  });

  test('375 px: „Statistik“ steht im ☰-Menü, /stats scrollt nicht seitwärts', { tag: '@UI-23' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/stats?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByTestId('stats-tab')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.getByTestId('nav-menu').click();
    const panel = page.getByTestId('nav-menu-panel');
    await expect(panel.getByRole('link', { name: msg('nav.stats'), exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('Die Kopfzeile bleibt bei 1024 und 1440 px eine Zeile (56 px) mit allen Menüpunkten', { tag: '@UI-23' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/stats?account=${DEMO_ID}&zone=${ZONE_ID}`);
    const nav = page.getByTestId('app-nav');
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await expect.poll(async () => (await nav.boundingBox())!.height, `${width}px`).toBe(56);
      for (const key of ['nav.dashboard', 'nav.chart', 'nav.stats', 'nav.backtest'] as const) {
        await expect(nav.getByRole('link', { name: msg(key), exact: true }), `${width}px ${key}`).toBeInViewport({ ratio: 1 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
    }
  });
});
