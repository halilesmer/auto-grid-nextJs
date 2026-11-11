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
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';
import { cardRoot } from '../fixtures/card';

// Formationen rechnen auf dem Trendzug des Nutzers (FRM-41); die Fixture zeigt ihre Formation mit ihrer Einstellung
test.beforeEach(({ page }) => seedFixtureTrend(page, fixtureTrend('gar-buy-h4-01')));

const SETUP = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const FORMATION = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
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

/** Die Karte ist unter 1024 px zu (UI-10): bei Bedarf aufklappen und „Übersicht“ wählen */
async function openCard(page: Page) {
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  const expand = cardRoot(page).getByRole('button', { name: msg('chart.card.expand'), exact: true });
  if (await expand.count()) await expand.click();
  await page.getByTestId('chart-card-tab-overview').click();
  await expect(page.getByTestId('chart-card-overview')).toBeVisible();
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
      for (const key of ['cw.layerTrend', 'cw.layerRsi', 'analysis.settings.pauses', 'analysis.settings.gaps'] as const) await expect(layerSwitch(page, key)).toBeVisible();
      // Formasyon çizimleri ist seit FRM-45 ein Schalter in der Symbolleiste, nicht mehr im Menü
      await expect(layerSwitch(page, 'cw.overlayFormations')).toHaveCount(0);
    });

    test('RSI(7) blendet sein Fenster aus und ein und bleiben nach dem Neuladen', { tag: '@UI-13' }, async ({ page, worker }) => {
      await open(page, worker, name, url);
      const chart = page.getByTestId('analysis-chart');
      await openMenu(page);
      await layerSwitch(page, 'cw.layerRsi').click();
      await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
      await page.reload();
      await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
      await openMenu(page);
      await layerSwitch(page, 'cw.layerRsi').click();
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

// Pausen und Datenlücken stehen nur im Menü (das Zahnrad „Anzeige-Einstellungen“ ist weg, U3b): ein Schalter wirkt am Chart und bleibt nach dem Neuladen
for (const [name, url] of [['frei', FREE], ['Setup', SETUP]] as const) {
  test(`UI-13 ${name}: Pausen und Datenlücken schalten aus dem Menü und bleiben nach dem Neuladen`, { tag: '@UI-13' }, async ({ page, worker }) => {
    await open(page, worker, name, url);
    const chart = page.getByTestId('analysis-chart');
    for (const [key, attr] of [['analysis.settings.pauses', 'data-pauses-shown'], ['analysis.settings.gaps', 'data-gaps-shown']] as const) {
      await openMenu(page);
      await layerSwitch(page, key).click();
      await expect(chart).toHaveAttribute(attr, 'false');
      await page.reload();
      await expect(chart).toHaveAttribute('data-bars', /^[1-9]\d*$/);
      await expect(chart).toHaveAttribute(attr, 'false');
      await openMenu(page);
      await expect(layerSwitch(page, key)).toHaveAttribute('aria-checked', 'false');
      await layerSwitch(page, key).click();
      await expect(chart).toHaveAttribute(attr, 'true');
      await page.keyboard.press('Escape');
    }
  });
}

test('UI-13 kein Zahnrad „Anzeige-Einstellungen“ mehr, in keinem Modus', { tag: '@UI-13' }, async ({ page, worker }) => {
  for (const [name, url] of PAGES) {
    await open(page, worker, name, url);
    await expect(page.getByTestId('analysis-settings')).toHaveCount(0);
  }
});

// Die Legende (chart-key-<pref>) gibt es nicht mehr (UI-22): die Setup-Schalter stehen nur im Menü, und ihr Zustand bleibt beim Schließen und Öffnen des Menüs
test('UI-13 Setup: die Schalter der Setup-Ebenen im Menü halten ihren Zustand', { tag: '@UI-13' }, async ({ page, worker }) => {
  await open(page, worker, 'Setup', SETUP);
  const pairs = [
    ['showZoneLines', 'analysis.settings.zoneLines'], ['showLevels', 'analysis.settings.levels'], ['showTrades', 'analysis.settings.trades'],
    ['showOrders', 'analysis.settings.orders'], ['showHistory', 'analysis.settings.history'],
  ] as const;
  await expect(page.getByTestId('chart-key')).toHaveCount(0);
  for (const [, key] of pairs) {
    // Menü schaltet aus
    await openMenu(page);
    await expect(layerSwitch(page, key)).toHaveAttribute('aria-checked', 'true');
    await layerSwitch(page, key).click();
    await expect(layerSwitch(page, key)).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
    // Neu geöffnet zeigt das Menü aus; ein Klick schaltet wieder ein
    await openMenu(page);
    await expect(layerSwitch(page, key)).toHaveAttribute('aria-checked', 'false');
    await layerSwitch(page, key).click();
    await page.keyboard.press('Escape');
    await openMenu(page);
    await expect(layerSwitch(page, key)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
  }
});

// showZoneCard und die sechs Setup-Ebenen sind im Setup-Menü erreichbar, bei 1440 und bei 375 px (Menü scrollt)
for (const [width, height] of [[1440, 900], [375, 812]] as const) {
  test(`UI-13 Setup ${width} px: jeder Setup-Schalter ist im Menü erreichbar`, { tag: '@UI-13' }, async ({ page, worker }) => {
    await page.setViewportSize({ width, height });
    await open(page, worker, 'Setup', SETUP);
    if (width >= 1024) await openCard(page);
    await openMenu(page);
    for (const key of ['analysis.settings.zoneLines', 'analysis.settings.levels', 'analysis.settings.trades', 'analysis.settings.orders', 'analysis.settings.history', 'analysis.settings.zoneCard'] as const) {
      const sw = layerSwitch(page, key);
      await sw.scrollIntoViewIfNeeded();
      await expect(sw).toBeInViewport();
    }
    await expect(page.getByTestId('layers-menu')).toContainText(msg('analysis.settings.fixed'));
    // showZoneCard wirkt über das Menü: die Karte mit den Setup-Einstellungen verschwindet und kommt zurück
    const zoneCard = layerSwitch(page, 'analysis.settings.zoneCard');
    await zoneCard.scrollIntoViewIfNeeded();
    await zoneCard.click();
    await expect(zoneCard).toHaveAttribute('aria-checked', 'false');
    // Bei 375 px liegt die schwebende Karte eingeklappt; die Wirkung auf die Karte prüfen wir nur in der breiten Ansicht
    if (width >= 1024) await expect(page.getByText('90 – 110')).toBeHidden();
    await zoneCard.click();
    await expect(zoneCard).toHaveAttribute('aria-checked', 'true');
    if (width >= 1024) await expect(page.getByText('90 – 110')).toBeVisible();
  });
}

test('UI-13 Formation: der Schalter „Formasyon çizimleri“ in der Symbolleiste blendet die Zeichnung aus und ein und bleibt nach dem Neuladen', { tag: ['@UI-13', '@FRM-45'] }, async ({ page, worker }) => {
  await open(page, worker, 'Formation', FORMATION);
  const overlay = page.getByTestId('formation-overlay');
  const toggle = page.getByRole('button', { name: msg('cw.overlayFormations'), exact: true });
  await expect(overlay).toBeVisible();
  await toggle.click();
  await expect(overlay).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await expect(overlay).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
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
    // Mit den Gruppen Formation und Setup (UI-22) ist der Inhalt länger als der Bildschirm und scrollt im Menü: gemessen wird das Menü (Rahmen), nicht sein ganzer Inhalt
    const menu = (await page.getByTestId('layers-menu').locator('xpath=..').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(375);
    expect(menu.y).toBeGreaterThanOrEqual(0);
    expect(menu.y + menu.height).toBeLessThanOrEqual(812);
    for (const key of ['cw.layerTrend', 'cw.layerRsi', 'analysis.settings.pauses', 'analysis.settings.gaps'] as const) await expect(layerSwitch(page, key)).toBeInViewport();
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
