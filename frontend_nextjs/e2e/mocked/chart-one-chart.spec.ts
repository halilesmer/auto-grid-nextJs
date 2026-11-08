/**
 * UI-22 One chart without modes (plan 1107-A21, step U4-4a): /chart has no mode switch, shows all nine timeframes, draws the
 * formation layer on D1/H4/H1/M15 and the setup layers of the symbol on the same chart. Old links keep working.
 * Lib tests of the URL model: chart-url-lib.spec.ts.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { CHART_TIMEFRAMES } from '../../src/lib/analysis/candles';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { MOCK_API } from '../fixtures/env';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';

// Formations compute on the user's trend line (FRM-41); the fixture shows its formation with its setting
test.beforeEach(({ page }) => seedFixtureTrend(page, fixtureTrend('gar-buy-h4-01')));

const NOW = Date.UTC(2025, 10, 17, 12) / 1000;
const fixtureBars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))).bars;
const WORKSPACE_KEY = 'grid-robot-chart-workspaces-v1';

/** EURUSD with one setup and the H4 candles of the formation fixture */
function serve(worker: MockWorker) {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = fixtureBars.filter((b) => b.time + 14400 <= NOW).map((b) => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[NOW - 900, last[4], last[4], last[4], last[4]]] };
}

async function open(page: Page, worker: MockWorker, query: string) {
  serve(worker);
  await page.goto(`/chart?account=${DEMO_ID}${query}`);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const cardTab = (page: Page, id: string) => page.getByTestId(`chart-card-tab-${id}`);
const param = (page: Page, key: string) => new globalThis.URL(page.url()).searchParams.get(key);

test.describe('UI-22 Ein Chart ohne Modi', () => {
  test('Die Seite hat keinen Modus-Schalter', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD');
    await expect(page.getByTestId('chart-page')).toBeVisible();
    await expect(page.locator('[data-testid="chart-mode"], [data-testid^="chart-mode-"]')).toHaveCount(0);
  });

  for (const [name, size] of [['375 px', { width: 375, height: 812 }], ['812 × 375 px', { width: 812, height: 375 }], ['1024 px', { width: 1024, height: 768 }], ['1440 px', { width: 1440, height: 900 }]] as const) {
    test(`Alle neun Zeiteinheiten stehen auf dem Chart, ${name}: kein waagerechtes Scrollen`, { tag: '@UI-22' }, async ({ page, worker }) => {
      await page.setViewportSize(size);
      await open(page, worker, '&symbol=EURUSD');
      const select = page.getByTestId('timeframe-select');
      await expect(select.locator('[data-testid^="timeframe-"]')).toHaveCount(CHART_TIMEFRAMES.length);
      for (const tf of CHART_TIMEFRAMES) await expect(page.getByTestId(`timeframe-${tf}`)).toBeAttached();
      expect(await noOverflow(page)).toBe(true);
    });
  }

  test('Ohne tf öffnet der Chart auf H4; ein Klick auf eine Zeiteinheit schreibt tf', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD');
    await expect(page.getByTestId('timeframe-H4')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('timeframe-W1').click();
    await expect.poll(() => param(page, 'tf')).toBe('W1');
    await page.getByTestId('timeframe-H4').click();
    await expect.poll(() => param(page, 'tf')).toBeNull();
  });

  test('Auf M5 ist die Formationsebene leer mit Hinweis; Stand und Bild sind aus, der Alarm bleibt an', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD&tf=M5');
    await expect(page.getByTestId('formation-off-tf')).toBeVisible();
    await expect(page.getByTestId('formation-overlay')).toHaveCount(0);
    await expect(page.getByTestId('formation-asof')).toBeDisabled();
    await expect(page.getByTestId('formation-shot')).toBeDisabled();
    await expect(page.getByTestId('formation-alarm')).toBeEnabled();
    await expect(page.getByTestId('formation-forms-empty')).toBeVisible();
  });

  test('Auf H4 stehen die Formationszeichnung und die Setup-Ebenen auf demselben Chart', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD&form=GAR');
    await expect(page.getByTestId('formation-overlay')).toBeAttached();
    // One card (U4-4b): open from lg, its tab "Overview" holds the setup of the symbol
    await expect(page.getByTestId('chart-floating-card')).toContainText('EURUSD');
    await cardTab(page, 'overview').click();
    await expect(page.getByTestId('chart-card-overview')).toBeVisible();
    await expect(page.getByTestId('formation-off-tf')).toHaveCount(0);
    await expect(page.getByTestId('formation-asof')).toBeEnabled();
  });

  test('Das Menü „Ebenen“ hat die Gruppen Formation und Setup mit sieben Setup-Schaltern', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD');
    await page.getByTestId('layers-button').click();
    const menu = page.getByTestId('layers-menu');
    await expect(menu.getByTestId('layers-group-formation')).toBeVisible();
    await expect(menu.getByTestId('layers-group-setup')).toBeVisible();
    await expect(menu.getByTestId('layers-group-setup').getByRole('switch')).toHaveCount(7);
  });

  test('Die Formationsreihe zeigt nur Formationen mit Kandidaten auf der Zeiteinheit; ohne Kandidaten steht ein Hinweis', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD');
    await expect(page.locator('[data-testid^="formation-form-"]').first()).toBeVisible();
    await expect(page.getByTestId('formation-forms-empty')).toHaveCount(0);
    // The fixture has one M15 candle only: no candidate, so no button and a note
    await page.getByTestId('timeframe-M15').click();
    await expect(page.locator('[data-testid^="formation-form-"]')).toHaveCount(0);
    await expect(page.getByTestId('formation-forms-empty')).toContainText(msg('chart.formation.noneTf'));
  });

  test('Alte Links: mode wird ignoriert, zone gibt das Symbol, tab=stats öffnet die Statistik', { tag: '@UI-22' }, async ({ page, worker }) => {
    serve(worker);
    for (const link of [`/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`, `/chart?mode=setup&account=${DEMO_ID}&zone=${ZONE_ID}&tf=H4`, `/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=H4`]) {
      await page.goto(link);
      await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
      await expect(page.getByTestId('formation-symbol').locator('input')).toHaveValue(/EURUSD/);
      await expect(page.locator('[data-testid^="chart-mode-"]')).toHaveCount(0);
    }
    await page.goto(`/chart?account=${DEMO_ID}&tab=stats&zone=${ZONE_ID}`);
    await expect(page.getByTestId('stats-tab')).toBeVisible();
    await expect(page.getByTestId('analysis-chart')).toHaveCount(0);
  });

  test('/formasyon leitet nach /chart ohne mode weiter und behält den Query-String', { tag: '@UI-22' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/formasyon?account=${DEMO_ID}&symbol=EURUSD&form=GAR&tf=H1`);
    await expect(page).toHaveURL(/\/chart\?/);
    expect(param(page, 'mode')).toBeNull();
    expect(param(page, 'symbol')).toBe('EURUSD');
    expect(param(page, 'form')).toBe('GAR');
    expect(param(page, 'tf')).toBe('H1');
  });

  test('Der Zeitraum ist im Chart „Alle“; /backtest behält 30 Tage', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD');
    await expect(page.getByTestId('range-trigger')).toContainText(msg('analysis.range.preset.all'));
    expect(param(page, 'range')).toBeNull();
    await page.goto(`/backtest?account=${DEMO_ID}`);
    await expect(page.getByTestId('range-trigger')).toContainText(msg('analysis.range.preset.last30'));
  });

  test('Ein Zeitpunkt in der Vergangenheit (at) fällt weg, wenn die neue Zeiteinheit keine Formationen hat', { tag: '@UI-22' }, async ({ page, worker }) => {
    await open(page, worker, '&symbol=EURUSD&at=2025-10-23T04:00');
    expect(param(page, 'at')).toBe('2025-10-23T04:00');
    await page.getByTestId('timeframe-M5').click();
    await expect.poll(() => param(page, 'at')).toBeNull();
    await expect.poll(() => param(page, 'tf')).toBe('M5');
  });

  test('Die Zeichnungen der drei alten Speicherschlüssel werden beim ersten Öffnen zusammengeführt, die alten bleiben', { tag: '@UI-22' }, async ({ page, worker }) => {
    serve(worker);
    await page.addInitScript(([storageKey, account, source]) => {
      if (localStorage.getItem(storageKey)) return;
      const doc = (drawings: unknown[]) => ({ drawings: JSON.stringify(drawings), indicators: [], images: {}, overlays: {}, alarms: [] });
      const k = (view: string, mode: string) => JSON.stringify([source, view, mode, account, 'EURUSD', '']);
      localStorage.setItem(storageKey, JSON.stringify({ version: 3, documents: {
        [k('analysis', 'free')]: doc([{ id: 'a', type: 'line' }, { id: 'shared', type: 'line' }]),
        [k('analysis', 'setup')]: doc([{ id: 'b', type: 'line' }, { id: 'shared', type: 'line' }]),
        [k('formation', '')]: doc([{ id: 'c', type: 'line' }]),
      } }));
    }, [WORKSPACE_KEY, DEMO_ID, MOCK_API]);
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD`);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
    const merged = () => page.evaluate((storageKey) => {
      const docs = JSON.parse(localStorage.getItem(storageKey) ?? '{}').documents as Record<string, { drawings: string }>;
      const entry = Object.entries(docs).find(([key]) => JSON.parse(key)[1] === 'chart');
      return entry ? (JSON.parse(entry[1].drawings) as { id: string }[]).map((d) => d.id).sort() : null;
    }, WORKSPACE_KEY);
    await expect.poll(merged).toEqual(['a', 'b', 'c', 'shared']);
    const keys = await page.evaluate((storageKey) => Object.keys(JSON.parse(localStorage.getItem(storageKey) ?? '{}').documents).length, WORKSPACE_KEY);
    expect(keys).toBeGreaterThanOrEqual(4);
  });
  test('Der verknüpfte Zeichnungssatz eines alten Schlüssels geht auf den neuen Schlüssel über; ein vorhandener Link bleibt', { tag: '@UI-22' }, async ({ page, worker }) => {
    serve(worker);
    await page.addInitScript(([storageKey, account, source]) => {
      if (localStorage.getItem(storageKey)) return;
      const doc = { drawings: '[]', indicators: [], images: {}, overlays: {}, alarms: [] };
      const k = (view: string, mode: string, symbol: string) => JSON.stringify([source, view, mode, account, symbol, '']);
      localStorage.setItem(storageKey, JSON.stringify({
        version: 3,
        links: { [k('analysis', 'setup', 'EURUSD')]: '@linked:e2e-set', [k('formation', '', 'EURUSD')]: '@linked:e2e-form', [k('analysis', 'free', 'GBPUSD')]: '@linked:e2e-other' },
        documents: { [k('analysis', 'setup', 'EURUSD')]: doc, [k('formation', '', 'EURUSD')]: doc },
      }));
    }, [WORKSPACE_KEY, DEMO_ID, MOCK_API]);
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD`);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
    const linksOf = () => page.evaluate((storageKey) => {
      const links = (JSON.parse(localStorage.getItem(storageKey) ?? '{}').links ?? {}) as Record<string, string>;
      return Object.entries(links).filter(([key]) => JSON.parse(key)[1] === 'chart').map(([key, value]) => [JSON.parse(key)[4], value]);
    }, WORKSPACE_KEY);
    // Setup comes before Formation in the order of the old keys; the other symbol is not touched
    await expect.poll(linksOf).toEqual([['EURUSD', '@linked:e2e-set']]);
    // A second open does not change it (the new key exists now)
    await page.reload();
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
    expect(await linksOf()).toEqual([['EURUSD', '@linked:e2e-set']]);
  });

  for (const width of [1024, 1100]) {
    test(`Bei offener Karte (${width} px) ist „Statistik“ erreichbar, auch im Pfeilmenü`, { tag: '@UI-22' }, async ({ page, worker }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, worker, '&symbol=EURUSD');
      await expect(cardTab(page, 'conditions')).toBeVisible();
      const topbar = page.getByTestId('chart-topbar');
      const direct = topbar.getByRole('tab', { name: msg('analysis.tab.stats') });
      const more = topbar.locator('[data-dock-pkg="actions"]').getByTestId('dock-more');
      await expect(direct.or(more).first()).toBeVisible();
      if (await direct.isVisible()) await direct.click();
      else {
        await more.click();
        await page.getByTestId('dock-more-menu').getByRole('tab', { name: msg('analysis.tab.stats') }).click();
      }
      await expect(page).toHaveURL(/tab=stats/);
    });
  }

  // U4-4b: one card instead of side bar + setup card (decision 1107-A21.4)
  const CARD_TABS = ['conditions', 'favorites', 'overview', 'trades'] as const;

  test('Es gibt eine Karte mit vier Reitern; Seitenleiste und Favoritenstreifen sind weg', { tag: '@UI-22' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, worker, '&symbol=EURUSD');
    await expect(page.getByTestId('chart-floating-card')).toHaveCount(1);
    for (const id of CARD_TABS) await expect(cardTab(page, id)).toBeVisible();
    await expect(page.locator('[data-testid="formation-sidebar"], [data-testid="favorites-strip"], [data-testid^="sidebar-tab-"]')).toHaveCount(0);
  });

  test('Die Karte ist beim ersten Besuch ab 1024 px offen, darunter zu', { tag: '@UI-22' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await open(page, worker, '&symbol=EURUSD');
    await expect(cardTab(page, 'conditions')).toBeVisible();
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.evaluate(() => localStorage.removeItem('grid-robot-formation-sidebar'));
    await page.reload();
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
    await expect(page.getByTestId('chart-floating-card')).toBeVisible();
    await expect(cardTab(page, 'conditions')).toHaveCount(0);
  });

  test('Jeder Reiter zeigt seinen Inhalt; der gewählte Reiter bleibt im Browser', { tag: '@UI-22' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, worker, '&symbol=EURUSD&form=GAR');
    await expect(page.getByTestId('conditions-panel')).toBeVisible();
    await cardTab(page, 'favorites').click();
    await expect(page.getByTestId('favorites-panel')).toBeVisible();
    await cardTab(page, 'overview').click();
    await expect(page.getByTestId('chart-card-overview')).toBeVisible();
    await cardTab(page, 'trades').click();
    await expect(page.getByTestId('chart-card-overview')).toHaveCount(0);
    await expect(cardTab(page, 'trades')).toHaveAttribute('aria-selected', 'true');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('grid-robot-formation-sidebar') ?? 'null')).tab).toBe('trades');
    await page.reload();
    await expect(cardTab(page, 'trades')).toHaveAttribute('aria-selected', 'true');
  });

  test('Der Statuschip öffnet die zugeklappte Karte auf Bedingungen', { tag: '@UI-22' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'overview' })));
    await open(page, worker, '&symbol=EURUSD&form=GAR');
    await expect(cardTab(page, 'conditions')).toHaveCount(0);
    await page.getByTestId('formation-status-chip').click();
    await expect(cardTab(page, 'conditions')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('conditions-panel')).toBeVisible();
  });

  test('Auf M5 sagt der Reiter Bedingungen, dass es hier keine Formationen gibt', { tag: '@UI-22' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, worker, '&symbol=EURUSD&tf=M5');
    await expect(page.getByTestId('conditions-off-tf')).toHaveText(msg('chart.formation.offTf'));
  });

  test('Auf dem Handy öffnet die Taste „Karte“ die Karte; ab lg gibt es sie nicht', { tag: '@UI-22' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, worker, '&symbol=EURUSD');
    await expect(cardTab(page, 'overview')).toHaveCount(0);
    await page.getByTestId('chart-card-open').click();
    await expect(cardTab(page, 'overview')).toBeVisible();
    await cardTab(page, 'overview').click();
    await expect(page.getByTestId('chart-card-overview')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('chart-card-open')).toBeHidden();
  });

  for (const [name, size] of [['375 px', { width: 375, height: 812 }], ['1440 px', { width: 1440, height: 900 }]] as const) {
    test(`Der Datenhinweis ist ein Einzeilen-Chip links oben; Klick öffnet den Text, Escape schließt (${name})`, { tag: '@UI-22' }, async ({ page, worker }) => {
      await page.setViewportSize(size);
      await open(page, worker, '&symbol=EURUSD');
      const chip = page.getByTestId('data-quality-chip');
      await expect(chip).toBeVisible();
      await expect(chip).toContainText(msg('analysis.data.scroll.title'));
      await expect(chip).toHaveAttribute('aria-expanded', 'false');
      const box = (await chip.boundingBox())!;
      // One line: a pill of at most 24 px, at the top left of the chart (right of the drawing rail)
      expect(box.height).toBeLessThanOrEqual(24);
      expect(box.x).toBeGreaterThanOrEqual(52);
      await expect(page.getByTestId('data-quality-chip-text')).toHaveCount(0);
      await chip.click();
      await expect(chip).toHaveAttribute('aria-expanded', 'true');
      // The full text follows the date (the date itself depends on the clock)
      await expect(page.getByTestId('data-quality-chip-text')).toContainText(msg('analysis.data.scroll.textAll', { from: '@@' }).split('@@')[1].trim())
      await expect(page.getByTestId('data-quality-chip-text')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('data-quality-chip-text')).toHaveCount(0);
      await expect(chip).toHaveAttribute('aria-expanded', 'false');
      expect(await noOverflow(page)).toBe(true);
    });
  }
});
