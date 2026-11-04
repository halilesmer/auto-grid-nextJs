/**
 * UI-10 Chartseiten mit gemeinsamem Gerüst: Zielzustand von /chart (frei und Setup) nach dem freigegebenen Entwurf
 * (docs/journal/2026-11-01-unified-chart-page.md). Der Chart füllt die Seite, Steuerungen sitzen in der Kopfleiste
 * und in der schwebenden Karte.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const SETUP = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.innerWidth);
  expect(size.scrollHeight).toBeLessThanOrEqual(size.innerHeight);
}

for (const viewport of VIEWPORTS) {
  test.describe(`UI-10 ${viewport.width} px`, () => {
    test.use({ viewport });

    test('Setup-Modus: Chart füllt die Seite, Steuerungen in Kopfleiste und schwebender Karte', { tag: '@UI-10' }, async ({ page, worker }) => {
      void worker; // installiert den gemockten Worker
      await page.goto(SETUP);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toBeVisible();

      // Kein Seitentitel, keine Karte um den Chart
      await expect(page.getByText(msg('analysis.subtitle'))).toHaveCount(0);
      await expect(page.getByTestId('analysis-chart-frame')).toHaveCount(0);
      await expect(page.getByTestId('analysis-chart-card')).toHaveCount(0);
      await noOverflow(page);

      // Der Chart liegt in der Seitenfläche und füllt sie (links die Zeichenleiste)
      const surface = await page.getByTestId('formation-surface').boundingBox();
      const box = await chart.boundingBox();
      expect(surface && box).toBeTruthy();
      // links bleibt die 52 px breite Zeichenleiste (Entwurf)
      expect(box!.width).toBeGreaterThanOrEqual(surface!.width - 52 - 2);
      // Chart plus Reserven (Werkzeugkarte, zugeklappte Setup-Karte) füllen die Fläche unter der Kopfleiste (UI-12).
      // Obergrenze: eine Reserve ist höchstens so hoch wie ihr Element plus Randabstand und 4 px, sonst könnte der Chart schrumpfen.
      const vars = await page.getByTestId('formation-main').evaluate(el => ({ workspace: parseFloat(el.style.getPropertyValue('--workspace-card')) || 0, floating: parseFloat(el.style.getPropertyValue('--floating-card')) || 0 }));
      const tools = await page.getByTestId('workspace-toolbar').evaluate(el => el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).bottom) + 8);
      const cardHeight = (await page.getByTestId('chart-floating-card').boundingBox())!.height;
      expect(vars.workspace).toBeLessThanOrEqual(tools + 4);
      expect(vars.floating).toBeLessThanOrEqual(cardHeight + 4 + 4);
      const reserve = vars.workspace + vars.floating;
      expect(box!.height + reserve).toBeGreaterThanOrEqual(surface!.height - 2);

      // Kopfleiste: Setup, Zeiteinheit, Bereich; zweite Zeile: Legenden-Schalter
      const topbar = page.getByTestId('chart-topbar');
      await expect(topbar.getByTestId('zone-select')).toBeVisible();
      await expect(topbar.getByTestId('timeframe-H1')).toBeVisible();
      await expect(topbar.getByTestId('range-trigger')).toBeVisible();
      // Auf dem Handy (unter 30 rem) steht die Legende hinter dem Knopf „Lejant“
      if (viewport.width < 480) await topbar.getByTestId('chart-legend-toggle').click();
      await expect(topbar.getByTestId('chart-key')).toBeVisible();

      // Schwebende Karte: Zonenkarte und Live-Werte, Trades im zweiten Reiter
      const card = page.getByTestId('chart-floating-card');
      await expect(card).toBeVisible();
      // Unter 1024 px ist die Karte eingeklappt
      const expand = card.getByRole('button', { name: msg('chart.card.expand') });
      if (viewport.width < 1024) await expand.click();
      await expect(card.getByText('90 – 110')).toBeVisible();
      await expect(card.getByTestId('chart-stat-price')).toBeVisible();
      await card.getByRole('tab', { name: msg('chart.card.trades') }).click();
      await expect(card.getByTestId('trades-archive')).toBeVisible();
      await noOverflow(page);
    });

    test('Freier Modus: Chart füllt die Seite, Steuerungen in der Kopfleiste', { tag: '@UI-10' }, async ({ page, worker }) => {
      void worker;
      await page.goto(FREE);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toBeVisible();

      await expect(page.getByText(msg('analysis.subtitle'))).toHaveCount(0);
      await expect(page.getByTestId('analysis-chart-frame')).toHaveCount(0);
      await expect(page.getByTestId('chart-floating-card')).toHaveCount(0);
      await noOverflow(page);

      const surface = await page.getByTestId('formation-surface').boundingBox();
      const box = await chart.boundingBox();
      expect(surface && box).toBeTruthy();
      // links bleibt die 52 px breite Zeichenleiste (Entwurf)
      expect(box!.width).toBeGreaterThanOrEqual(surface!.width - 52 - 2);

      const topbar = page.getByTestId('chart-topbar');
      await expect(topbar.getByTestId('timeframe-H1')).toBeVisible();
      await expect(topbar.getByTestId('range-trigger')).toBeVisible();
      await expect(topbar.getByRole('tab', { name: msg('analysis.tab.stats'), exact: true })).toBeVisible();
    });
  });
}
