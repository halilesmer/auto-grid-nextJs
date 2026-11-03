/**
 * UI-12 Kompakte Kopfleiste der Chartseiten bei schmaler Breite: Unter lg (1024 px) steht die Kopfleiste über dem Chart
 * (im Fluss) und deckt keine Kerzen ab. Ab lg liegt sie auf dem Chart (Desktop unverändert). Entwurf: „Ein Chart · 03.11.“,
 * Handy-Zeichenflächen. Plan: docs/journal/2026-11-01-unified-chart-page.md.
 */
import type { Page } from '@playwright/test';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const PAGES = [
  { name: 'frei', url: `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`, bar: 'chart-topbar' },
  { name: 'Setup', url: `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`, bar: 'chart-topbar' },
  { name: 'Formation', url: `/formasyon?account=${DEMO_ID}&zone=${ZONE_ID}`, bar: 'formation-toolbar' },
] as const;

/** Ränder des Kursbereichs (erste Zeile mit Canvas in der Chart-Tabelle) und der Kopfleiste in px */
async function measure(page: Page, bar: string) {
  const workspace = page.getByTestId('chart-workspace');
  await expect(workspace.locator('table').first().locator('tr canvas').first()).toBeVisible();
  const top = await page.getByTestId(bar).evaluate(el => el.getBoundingClientRect().bottom);
  const price = await workspace.locator('table').first().evaluate(table => {
    const row = [...table.querySelectorAll('tr')].find(r => r.querySelector('canvas') && r.children.length === 3)!;
    const box = row.getBoundingClientRect();
    return { top: box.top, height: box.height };
  });
  return { barBottom: top, priceTop: price.top, priceHeight: price.height };
}

test.describe('UI-12 Kopfleiste bei schmaler Breite', () => {
  for (const { name, url, bar } of PAGES) {
    test(`375 × 812, ${name}: die Kopfleiste liegt über dem Kursbereich und verdeckt keine Kerzen`, { tag: '@UI-12' }, async ({ page, worker }) => {
      void worker;
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(url);
      await expect(page.getByTestId(bar)).toBeVisible();
      await expect.poll(async () => (await measure(page, bar)).priceHeight).toBeGreaterThan(0);
      const m = await measure(page, bar);
      expect(m.barBottom, 'Unterkante der Kopfleiste ≤ Oberkante des Kursbereichs').toBeLessThanOrEqual(m.priceTop + 0.5);
      expect(m.priceHeight, 'sichtbare Höhe des Kursbereichs').toBeGreaterThanOrEqual(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });

    test(`375 × 812 mit 20 px Browser-Schrift, ${name}: die Kopfleiste verdeckt keine Kerzen, kein waagerechter Überlauf`, { tag: '@UI-12' }, async ({ page, worker }) => {
      void worker;
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(url);
      await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
      await expect(page.getByTestId(bar)).toBeVisible();
      await expect.poll(async () => (await measure(page, bar)).priceHeight).toBeGreaterThan(0);
      const m = await measure(page, bar);
      expect(m.barBottom).toBeLessThanOrEqual(m.priceTop + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  }

  test('375 × 812, Setup: die zugeklappte Setup-Karte liegt unter dem untersten Bereich, nicht darüber', { tag: '@UI-12' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PAGES[1].url);
    const card = page.getByTestId('chart-floating-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-system-panes', '3');
    await expect.poll(async () => {
      const c = (await card.boundingBox())!, chart = (await page.getByTestId('analysis-chart').boundingBox())!;
      return c.y - (chart.y + chart.height);
    }).toBeGreaterThanOrEqual(0);
    const tools = (await page.getByTestId('workspace-toolbar').boundingBox())!, c = (await card.boundingBox())!;
    expect(c.y + c.height).toBeLessThanOrEqual(tools.y);
  });

  test('1440 × 900: die Kopfleiste bleibt über dem Chart (Desktop unverändert)', { tag: '@UI-12' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PAGES[1].url);
    await expect(page.getByTestId('chart-topbar')).toBeVisible();
    await expect.poll(async () => (await measure(page, 'chart-topbar')).priceHeight).toBeGreaterThan(0);
    const m = await measure(page, 'chart-topbar');
    expect(m.priceTop, 'Kursbereich beginnt oben im Chart, unter der Kopfleiste der App').toBeLessThan(m.barBottom);
  });
});
