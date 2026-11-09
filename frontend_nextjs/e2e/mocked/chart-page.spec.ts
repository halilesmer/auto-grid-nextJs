/**
 * UI-10 Chartseiten mit gemeinsamem Gerüst: Zielzustand von /chart (ein Chart ohne Modi, UI-22; Symbol mit und ohne Setup) nach dem freigegebenen Entwurf
 * (docs/journal/2026-11-01-unified-chart-page.md). Der Chart füllt die Seite, Steuerungen sitzen in der Kopfleiste
 * und in der schwebenden Karte.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const SETUP = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=M15`; // Symbol mit Setup
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
      // The side bar of the one chart starts open from 1024 px (UI-22) and crowds the top bar: closed, the controls stand in the bar as before
      await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' })));
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

      // Kopfleiste: Symbol, Zeiteinheit, Bereich; die Setup-Schalter stehen im Menü „Ebenen“ (keine Legendenzeile mehr)
      const topbar = page.getByTestId('chart-topbar');
      await expect(topbar.getByTestId('formation-symbol')).toBeVisible();
      await expect(topbar.getByTestId('timeframe-H1')).toBeVisible();
      await expect(topbar.getByTestId('range-trigger')).toBeVisible();
      await expect(topbar.getByTestId('chart-key')).toHaveCount(0);
      await page.getByTestId('layers-button').click();
      await expect(page.getByTestId('layers-menu').getByTestId('layers-group-setup').getByRole('switch')).toHaveCount(7);
      await page.keyboard.press('Escape');

      // Schwebende Karte: Zonenkarte und Live-Werte, Trades im zweiten Reiter
      const card = page.getByTestId('chart-floating-card');
      await expect(card).toBeVisible();
      // Die Karte ist unter 1024 px zu und, solange eine Formation gezeichnet wird, auch darüber: nach dem Scan aufklappen
      await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
      const expand = card.getByRole('button', { name: msg('chart.card.expand') });
      if (await expand.count()) await expand.click();
      await card.getByTestId('chart-card-tab-overview').click();
      await expect(card.getByText('90 – 110')).toBeVisible();
      await expect(card.getByTestId('chart-stat-price')).toBeVisible();
      await card.getByRole('tab', { name: msg('chart.card.trades') }).click();
      await expect(card.getByTestId('trades-archive')).toBeVisible();
      await noOverflow(page);
    });

    test('Freier Modus: Chart füllt die Seite, Steuerungen in der Kopfleiste', { tag: '@UI-10' }, async ({ page, worker }) => {
      void worker;
      await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' })));
      await page.goto(FREE);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toBeVisible();

      await expect(page.getByText(msg('analysis.subtitle'))).toHaveCount(0);
      await expect(page.getByTestId('analysis-chart-frame')).toHaveCount(0);
      // Ein Symbol ohne Setup (EURUSD) hat nur die Karte mit dem Hinweis, keine Setup-Werte
      const noSetupCard = page.getByTestId('chart-floating-card');
      await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
      await expect(noSetupCard).toBeVisible();
      const expandCard = noSetupCard.getByRole('button', { name: msg('chart.card.expand') });
      if (await expandCard.count()) await expandCard.click();
      await noSetupCard.getByTestId('chart-card-tab-overview').click();
      await expect(noSetupCard.getByTestId('chart-card-no-setup')).toBeVisible();
      await expect(page.getByTestId('chart-stat-price')).toHaveCount(0);
      await noOverflow(page);
      // The open card stands next to the chart (1107-A21.18) and narrows it: close it again, the checks below are about the full-width bar
      await noSetupCard.getByRole('button', { name: msg('chart.card.collapse'), exact: true }).click();

      const surface = await page.getByTestId('formation-surface').boundingBox();
      const box = await chart.boundingBox();
      expect(surface && box).toBeTruthy();
      // links bleibt die 52 px breite Zeichenleiste (Entwurf)
      expect(box!.width).toBeGreaterThanOrEqual(surface!.width - 52 - 2);

      const topbar = page.getByTestId('chart-topbar');
      await expect(topbar.getByTestId('timeframe-H1')).toBeVisible();
      await expect(topbar.getByTestId('range-trigger')).toBeVisible();
      const stats = topbar.getByRole('tab', { name: msg('analysis.tab.stats'), exact: true });
      if (viewport.width === 1024) {
        // Plan 1106-A4.15 (Halil: „A4.15.1 menü“): bei 1024 px kann Satır 1 zu schmal sein; dann stehen Chart/Statistik im ˅-Menü der Aksiyonlar.
        // Seit 1107-A21 teilt sich das Paket Aksiyonlar den Platz mit den Formations-Aktionen: beide Orte sind richtig, Statistik muss erreichbar sein
        if (await stats.isVisible()) await stats.click();
        else {
          await topbar.locator('[data-dock-pkg="actions"]').getByTestId('dock-more').click();
          const menu = page.getByTestId('dock-more-menu');
          expect(await menu.locator('[role=tab]:visible').evaluateAll(b => b.map(x => x.getAttribute('aria-label') ?? x.textContent?.trim()))).toEqual([msg('analysis.tab.chart'), msg('analysis.tab.stats')]);
          await menu.getByRole('tab', { name: msg('analysis.tab.stats'), exact: true }).click();
        }
        await expect(page).toHaveURL(/tab=stats/);
      } else await expect(stats).toBeVisible();
    });
  });
}
