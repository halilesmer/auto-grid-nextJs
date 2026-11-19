/**
 * UI-15 Kopfleiste von /chart, solange die Kontoliste lädt (1119-A9.1, Entwurf B „Platzhalter“): Auf dem Desktop steht die Leiste
 * schon in ihrer endgültigen Form (graue Platzhalter für Symbol und Zeiteinheiten, auf der Fläche „lädt“); wenn die Liste da ist, rückt nichts.
 * Auf dem Handy (Container unter 30 rem) bleibt der bisherige Ladezustand (Handy-Oberfläche folgt später, Halil 2026-11-17).
 */
import type { Page, Route } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;

/** Hält die Antwort auf GET /accounts, bis der Test sie freigibt (fällt danach auf den Mock zurück) */
async function holdAccounts(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/accounts(\?.*)?$/, async (route: Route) => {
    await gate;
    await route.fallback();
  });
  return release;
}

/** Linke Kante (x) des Kontos, des Zeitraums und der Zeiteinheiten in einem einzigen Aufruf (UI-15: Locator.evaluate misst in zwei Schritten) */
function xPositions(page: Page, timeframes: string) {
  return page.evaluate(([tf, accountLabel]) => {
    const left = (el: Element | null) => el ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null;
    return {
      account: left(document.querySelector(`[aria-label="${accountLabel}"]`)),
      range: left(document.querySelector('[data-testid="range-trigger"]')),
      timeframes: left(document.querySelector(`[data-testid="${tf}"]`)),
    };
  }, [timeframes, msg('account.select.aria')] as const);
}

test.describe('UI-15 Kopfleiste beim Laden der Kontoliste', () => {
  test('1440 × 900: Platzhalter für Symbol und Zeiteinheiten, nach dem Laden rückt kein Element', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await holdAccounts(page);
    await page.goto(URL);

    const bar = page.getByTestId('chart-topbar');
    await expect(bar).toBeVisible();
    const symbol = page.getByTestId('chart-topbar-symbol-loading');
    const timeframes = page.getByTestId('chart-topbar-timeframes-loading');
    await expect(symbol).toBeVisible();
    await expect(symbol).toHaveAttribute('aria-busy', 'true');
    await expect(timeframes).toBeVisible();
    await expect(timeframes).toHaveAttribute('aria-busy', 'true');
    await expect(timeframes).toContainText('H4');
    await expect(page.getByTestId('chart-loading')).toBeVisible();
    const before = await xPositions(page, 'chart-topbar-timeframes-loading');
    const barBefore = await bar.evaluate((el) => Math.round(el.getBoundingClientRect().height));

    release();
    await expect(page.getByTestId('timeframe-select')).toBeVisible();
    await expect(symbol).toHaveCount(0);
    await expect(timeframes).toHaveCount(0);
    const after = await xPositions(page, 'timeframe-select');
    expect(before.account).not.toBeNull();
    expect(before.range).not.toBeNull();
    expect(before.timeframes).not.toBeNull();
    expect(Math.abs(after.account! - before.account!), 'Konto').toBeLessThanOrEqual(1);
    expect(Math.abs(after.range! - before.range!), 'Zeitraum').toBeLessThanOrEqual(1);
    expect(Math.abs(after.timeframes! - before.timeframes!), 'Zeiteinheiten').toBeLessThanOrEqual(1);
    expect(Math.abs((await bar.evaluate((el) => Math.round(el.getBoundingClientRect().height))) - barBefore), 'Höhe der Leiste').toBeLessThanOrEqual(1);
  });

  test('375 × 812: auf dem Handy keine Platzhalter, der bisherige Ladezustand bleibt', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 375, height: 812 });
    const release = await holdAccounts(page);
    await page.goto(URL);
    await expect(page.getByTestId('chart-topbar')).toBeVisible();
    await expect(page.getByTestId('chart-topbar-symbol-loading')).toHaveCount(0);
    await expect(page.getByTestId('chart-topbar-timeframes-loading')).toHaveCount(0);
    release();
    await expect(page.getByTestId('timeframe-select')).toBeVisible();
  });

  test('1440 × 900: schlägt das Laden der Kontoliste fehl, bleiben die Platzhalter nicht', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/\/accounts(\?.*)?$/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"down"}' }));
    await page.goto(URL);
    await expect(page.getByTestId('chart-topbar')).toBeVisible();
    await expect(page.getByTestId('chart-topbar-symbol-loading')).toHaveCount(0);
    await expect(page.getByTestId('chart-topbar-timeframes-loading')).toHaveCount(0);
    await expect(page.getByTestId('chart-loading')).toHaveCount(0);
  });

  test('1440 × 900: ohne Konto in der Adresse erscheint nach dem Laden der Hinweis, nicht der Platzhalter', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/chart?symbol=EURUSD');
    await expect(page.getByText(msg('analysis.noAccount.title')).first()).toBeVisible();
    await expect(page.getByTestId('chart-topbar-timeframes-loading')).toHaveCount(0);
  });
});
