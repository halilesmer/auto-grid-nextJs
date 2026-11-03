/**
 * UI-13 Menü „Ebenen“: ein Knopf neben Trend auf jedem Chart (/chart frei und Setup, /formasyon). Das Menü zeigt oben die
 * gemeinsamen Ebenen (Trendzug, RSI(7), Wave 5/35, Pausen, Datenlücken), darunter den Abschnitt des Modus. Jeder Schalter
 * blendet seine Ebene aus und ein und bleibt nach dem Neuladen. Plan: docs/journal/2026-11-01-unified-chart-page.md.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const SETUP = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const FORMATION = `/formasyon?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const NOW = Date.UTC(2025, 10, 17, 12) / 1000;
const fixtureBars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))).bars;

async function open(page: Page, worker: MockWorker, name: string, url: string) {
  if (name === 'Formation') {
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
    const rows = fixtureBars.filter(b => b.time + 14400 <= NOW).map(b => [b.time, b.open, b.high, b.low, b.close]);
    const last = rows[rows.length - 1];
    worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[NOW - 900, last[4], last[4], last[4], last[4]]] };
  }
  await page.goto(url);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
}

const openMenu = (page: Page) => page.getByRole('button', { name: msg('cw.layers'), exact: true }).click();
/** Der Schalter heißt „<Text> Bilgi“ (Name plus Info-Symbol): wir suchen vom Anfang des Namens */
const layerSwitch = (page: Page, key: Parameters<typeof msg>[0]) =>
  page.getByTestId('layers-menu').getByRole('switch', { name: new RegExp(`^${msg(key).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}( |$)`) });

const PAGES = [['frei', FREE], ['Setup', SETUP], ['Formation', FORMATION]] as const;

for (const [name, url] of PAGES) {
  test.describe(`UI-13 ${name}`, () => {
    test('Der Knopf „Ebenen“ steht neben Trend und öffnet das Menü mit den gemeinsamen Schaltern', { tag: '@UI-13' }, async ({ page, worker }) => {
      await open(page, worker, name, url);
      const button = page.getByRole('button', { name: msg('cw.layers'), exact: true });
      await expect(button).toBeVisible();
      const trend = (await page.getByTestId('trend-toggle').boundingBox())!, layers = (await button.boundingBox())!;
      expect(Math.abs(trend.y - layers.y)).toBeLessThan(40);
      await openMenu(page);
      for (const key of ['cw.layerTrend', 'cw.layerRsi', 'cw.layerWave', 'analysis.settings.pauses', 'analysis.settings.gaps'] as const) await expect(layerSwitch(page, key)).toBeVisible();
      // Der Abschnitt des Modus steht unter den gemeinsamen Schaltern
      if (name === 'Formation') await expect(layerSwitch(page, 'cw.overlayFormations')).toBeVisible();
      else await expect(layerSwitch(page, 'cw.overlayFormations')).toHaveCount(0);
    });

    test('Wave und RSI(7) blenden ihre Fenster aus und ein und bleiben nach dem Neuladen', { tag: '@UI-13' }, async ({ page, worker }) => {
      await open(page, worker, name, url);
      const chart = page.getByTestId('analysis-chart');
      await openMenu(page);
      await layerSwitch(page, 'cw.layerWave').click();
      await expect(chart).toHaveAttribute('data-wave-visible', 'false');
      await layerSwitch(page, 'cw.layerRsi').click();
      await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
      await page.reload();
      await expect(chart).toHaveAttribute('data-wave-visible', 'false');
      await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
      await openMenu(page);
      await expect(layerSwitch(page, 'cw.layerWave')).toHaveAttribute('aria-checked', 'false');
      await layerSwitch(page, 'cw.layerWave').click();
      await layerSwitch(page, 'cw.layerRsi').click();
      await expect(chart).toHaveAttribute('data-wave-visible', 'true');
      await expect(chart).toHaveAttribute('data-rsi-visible', 'true');
    });

    test('Pausen und Datenlücken blenden ihre Ebenen aus und ein und bleiben nach dem Neuladen', { tag: '@UI-13' }, async ({ page, worker }) => {
      await open(page, worker, name, url);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toHaveAttribute('data-pauses-shown', 'true');
      await expect(chart).toHaveAttribute('data-gaps-shown', 'true');
      await openMenu(page);
      await layerSwitch(page, 'analysis.settings.pauses').click();
      await layerSwitch(page, 'analysis.settings.gaps').click();
      await expect(chart).toHaveAttribute('data-pauses-shown', 'false');
      await expect(chart).toHaveAttribute('data-gaps-shown', 'false');
      await page.reload();
      await expect(chart).toHaveAttribute('data-pauses-shown', 'false');
      await expect(chart).toHaveAttribute('data-gaps-shown', 'false');
      await openMenu(page);
      await layerSwitch(page, 'analysis.settings.pauses').click();
      await layerSwitch(page, 'analysis.settings.gaps').click();
      await expect(chart).toHaveAttribute('data-pauses-shown', 'true');
      await expect(chart).toHaveAttribute('data-gaps-shown', 'true');
    });

    test('Der Schalter „Trendzug“ im Menü und der Knopf Trend schalten dieselbe Ebene', { tag: '@UI-13' }, async ({ page, worker }) => {
      await open(page, worker, name, url);
      const trend = page.getByTestId('trend-toggle');
      await expect(trend).toHaveAttribute('aria-pressed', 'false');
      await openMenu(page);
      await layerSwitch(page, 'cw.layerTrend').click();
      await expect(trend).toHaveAttribute('aria-pressed', 'true');
      await page.reload();
      await expect(trend).toHaveAttribute('aria-pressed', 'true');
      await openMenu(page);
      await expect(layerSwitch(page, 'cw.layerTrend')).toHaveAttribute('aria-checked', 'true');
      await layerSwitch(page, 'cw.layerTrend').click();
      await expect(trend).toHaveAttribute('aria-pressed', 'false');
    });
  });
}

// Pausen und Datenlücken stehen im Menü und im Zahnrad „Anzeige“ (analysis-settings): beide zeigen denselben Zustand (U3 baut das Zahnrad ab)
for (const [name, url] of [['frei', FREE], ['Setup', SETUP]] as const) {
  test(`UI-13 ${name}: Menü und Zahnrad zeigen für Pausen und Datenlücken denselben Zustand`, { tag: '@UI-13' }, async ({ page, worker }) => {
    await open(page, worker, name, url);
    const chart = page.getByTestId('analysis-chart');
    const gear = () => page.getByTestId('analysis-settings');
    const gearSwitch = (key: Parameters<typeof msg>[0]) => gear().getByRole('switch', { name: new RegExp(`^${msg(key).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}( |$)`) });
    const openGear = () => page.getByRole('button', { name: msg('analysis.settings'), exact: true }).click();
    for (const [key, attr] of [['analysis.settings.pauses', 'data-pauses-shown'], ['analysis.settings.gaps', 'data-gaps-shown']] as const) {
      // Menü schaltet aus: Zahnrad zeigt aus
      await openMenu(page);
      await layerSwitch(page, key).click();
      await expect(chart).toHaveAttribute(attr, 'false');
      await page.keyboard.press('Escape');
      await openGear();
      await expect(gearSwitch(key)).toHaveAttribute('aria-checked', 'false');
      // Zahnrad schaltet ein: Menü zeigt ein
      await gearSwitch(key).click();
      await expect(chart).toHaveAttribute(attr, 'true');
      await page.keyboard.press('Escape');
      await openMenu(page);
      await expect(layerSwitch(page, key)).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
    }
  });
}

test('UI-13 Formation: der Schalter „Formationszeichnung“ blendet die Zeichnung aus und ein', { tag: '@UI-13' }, async ({ page, worker }) => {
  await open(page, worker, 'Formation', FORMATION);
  const overlay = page.getByTestId('formation-overlay');
  await expect(overlay).toBeVisible();
  await openMenu(page);
  await layerSwitch(page, 'cw.overlayFormations').click();
  await expect(overlay).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await expect(overlay).toBeHidden();
  await openMenu(page);
  await layerSwitch(page, 'cw.overlayFormations').click();
  await expect(overlay).toBeVisible();
});

test('UI-13 Formation: die Brokeruhr steht auf dem Chart', { tag: '@UI-13' }, async ({ page, worker }) => {
  await open(page, worker, 'Formation', FORMATION);
  await expect(page.getByTestId('broker-clock')).toBeVisible();
});

test('UI-13 schmale Breite: das Menü öffnet vollständig im Bildschirm', { tag: '@UI-13' }, async ({ page, worker }) => {
  for (const [name, url] of PAGES) {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, worker, name, url);
    await openMenu(page);
    const menu = (await page.getByTestId('layers-menu').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(375);
    expect(menu.y).toBeGreaterThanOrEqual(0);
    expect(menu.y + menu.height).toBeLessThanOrEqual(812);
    for (const key of ['cw.layerTrend', 'cw.layerRsi', 'cw.layerWave', 'analysis.settings.pauses', 'analysis.settings.gaps'] as const) await expect(layerSwitch(page, key)).toBeInViewport();
    await page.keyboard.press('Escape');
  }
});

test('UI-13 schmale Breite: das TradingView-Logo liegt nicht über der Legende des untersten Bereichs', { tag: '@UI-13' }, async ({ page, worker }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, url] of PAGES) {
    await open(page, worker, name, url);
    const logo = page.locator('#tv-attr-logo').first();
    await expect(logo).toBeVisible();
    const l = (await logo.boundingBox())!;
    // Die Legende des untersten Bereichs ist die Zeile des EWO (frei und Setup); auf /formasyon gibt es keinen Nutzer-Indikator darin
    const row = page.getByTestId('workspace-indicator-values').getByText('EWO').last();
    if (name === 'Formation' && await row.count() === 0) continue;
    const legend = (await row.boundingBox())!;
    const overlap = l.x < legend.x + legend.width && l.x + l.width > legend.x && l.y < legend.y + legend.height && l.y + l.height > legend.y;
    expect(overlap, `${name}: Logo ${JSON.stringify(l)} über Legende ${JSON.stringify(legend)}`).toBe(false);
  }
});
