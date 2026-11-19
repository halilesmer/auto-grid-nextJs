import type { Page } from '@playwright/test';
import { DEMO_ID, LIVE_ID, ZONE_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { nowMs } from '../fixtures/mock-worker';
import { OLDER_PAGE_BARS, OPEN_RANGE_BARS } from '../../src/lib/analysis/candles';
import { dragLeft, fitChosenRange, openNearLeftEdge, panToFirstCandle } from '../fixtures/chart-older';
import { dialogTab, openDrawings } from '../fixtures/chart-dialog';
import { formationRequests } from '../../src/lib/formation/requests';
import { openCardTab } from '../fixtures/card';
import { chartReady } from '../fixtures/chart-ready';

// These tests are about the chart itself. The side bar of the one chart starts open from 1024 px and takes 288 px (1107-A21, U4-4a): closed, the chart has its old width
// `range=7d` was no preset: it fell back to the default range (30 days), which is "All" since 1107-A21. The tests mean seven days: `range=last7`.
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

/** Die Formationssuche (UI-22) läuft auf jeder Zeiteinheit und holt D1, H4, H1 und M15 mit festem Zeitraum (`formationRequests`); das sind keine Anfragen des Charts */
const isScanQuery = (query: string) => {
  const q = new URLSearchParams(query);
  const scan = (formationRequests(DEMO_ID, 'EURUSD', Number(q.get('to'))) as Record<string, { from: number }>)[q.get('timeframe') ?? ''];
  return !!scan && scan.from === Number(q.get('from'));
};
const chartQueries = (worker: { ratesQueries: string[] }) => ({ get ratesQueries() { return worker.ratesQueries.filter((q) => !isScanQuery(q)); } });

/** Zoom in per Mausrad auf der Mitte des Charts: das Overlay-Layout (UI-10) hat keine +/−-Knöpfe */
async function zoomIn(page: Page) {
  const box = await page.getByTestId('analysis-chart').boundingBox();
  if (!box) throw new Error('Chart missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.wheel(0, -400);
}

test('Freier Chart lädt Broker-Symbol ohne Setup und stellt URL wieder her', { tag: '@ANA-16' }, async ({ page, worker }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await expect(page.getByTestId('free-chart-panel')).toBeVisible();
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect(page.getByTestId('zone-select')).toHaveCount(0);
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  // 1107-A21: the one chart reads the setups of the account to show the setup layers of the symbol (here: none, so the card says that the symbol has no setup)
  expect(worker.calls.filter(c => c.path === `/api/settings/${DEMO_ID}`).length).toBeGreaterThan(0);
  await expect(await openCardTab(page, 'overview')).toContainText('EURUSD');
  await page.reload();
  await expect(page.getByTestId('chart-workspace')).toHaveAttribute('data-context', /EURUSD/);
  expect(errors).toEqual([]);
});

test('Chart-Vorschau: Abbrechen, Anwenden und Neuladen', { tag: '@ANA-19' }, async ({ page, worker }) => {
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await page.getByTestId('workspace-settings').click();
  const modal = page.getByTestId('chart-workspace-settings');
  await modal.getByRole('button', { name: msg('cw.status'), exact: true }).click();
  const toggle = modal.getByRole('checkbox', { name: msg('cw.names') });
  await toggle.click();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
  await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await page.getByTestId('workspace-settings').click();
  await modal.getByRole('button', { name: msg('cw.status'), exact: true }).click();
  await modal.getByRole('checkbox', { name: msg('cw.names') }).click();
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  // S7.1: the look is a user preference (one for every symbol). It reaches the worker and the local cache; reload only after the write, or the reload loses it.
  await expect.poll(() => (worker.userPrefs.admin?.chart_appearance as { appearance?: { names?: boolean } } | undefined)?.appearance?.names).toBe(false);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').appearance?.names)).toBe(false);
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
});

test('Bestehende Darstellung aus dem Browser wird zur Darstellung des Benutzers', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // S7.1: the look was stored per symbol in the document; now it is one user preference. The old browser value is written to the worker once.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify({ version: 3, appearance: { background: '#123456' }, documents: {} }));
  });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect.poll(() => (worker.userPrefs.admin?.chart_appearance as { appearance?: { background?: string } } | undefined)?.appearance?.background).toBe('#123456');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').appearance?.background)).toBe('#123456');
});

test('Vorlagenmenü speichert eine Vorlage, setzt zurück und lädt sie wieder', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await page.getByTestId('workspace-settings').click();
  const modal = page.getByTestId('chart-workspace-settings');
  await modal.getByRole('button', { name: msg('cw.status'), exact: true }).click();
  const names = modal.getByRole('checkbox', { name: msg('cw.names') });
  const menu = modal.getByRole('button', { name: msg('cw.template'), exact: true });
  await names.click();
  await expect(names).not.toBeChecked();
  await menu.click();
  const templateName = modal.getByRole('textbox', { name: msg('cw.templateName') });
  await templateName.fill('Ohne Namen');
  await templateName.press('Home');
  await expect(templateName).toBeFocused();
  await modal.getByRole('button', { name: msg('cw.saveTemplate'), exact: true }).click();
  await modal.getByRole('button', { name: msg('cw.reset'), exact: true }).click();
  await expect(names).toBeChecked();
  await menu.click();
  await modal.getByRole('button', { name: 'Ohne Namen', exact: true }).click();
  await expect(names).not.toBeChecked();
});

test('Zurückgesetzte Darstellung bleibt je Symbol gespeichert, der Zoom nicht (1118-A5.1)', { tag: '@ANA-19' }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: this test checks per-product records
  const url = (symbol: string) => `/chart?account=${DEMO_ID}&symbol=${symbol}&tf=H1&range=last7`;
  // S7.1: the look is one user preference for every symbol (local cache at the root). 1118-A5.1 = B: the zoom is not stored,
  // each opening shows the latest candles at the default bar spacing (before: the zoom stayed in the symbol document)
  const look = () => page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').appearance?.background);
  const readDocument = (key: string) => page.evaluate(contextKey => {
    const state = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}');
    return state.documents?.[contextKey] ?? null;
  }, key);
  await page.goto(url('EURUSD'));
  const eurChart = page.getByTestId('chart-workspace');
  await expect(eurChart).toBeVisible();
  const eurKey = await eurChart.getAttribute('data-context');
  expect(eurKey).toBeTruthy();

  await page.getByTestId('workspace-settings').click();
  const settings = page.getByTestId('chart-workspace-settings');
  await settings.getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
  await page.getByLabel(msg('cw.background'), { exact: true }).fill('#123456');
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await page.getByTestId('workspace-settings').click();
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.template'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.reset'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await expect.poll(look).toBe('');

  const rangeOf = () => page.getByTestId('analysis-chart').getAttribute('data-visible-range');
  const storedZoom = async () => (await readDocument(eurKey!))?.visibleTime ?? null;
  // The chart rounds a view by at most one candle (3600 s)
  const near = async (want: string | null) => { const shown = await rangeOf(); if (!shown || !want) return false; const [from, to] = shown.split(',').map(Number), [wantFrom, wantTo] = want.split(',').map(Number); return Math.max(Math.abs(from - wantFrom), Math.abs(to - wantTo)) <= 3600; };
  await chartReady(page);
  const opened = await rangeOf();
  expect(opened).toBeTruthy();
  // 1119-A1.1: the gap of 10 candles on the right is empty space, so a zoom does not always change the time range (it is cut at
  // the first and the last candle); the zoom shows in the logical range (candle index)
  const logicalOf = () => page.getByTestId('analysis-chart').getAttribute('data-visible-logical');
  const openedLogical = await logicalOf();
  expect(openedLogical).toBeTruthy();
  await zoomIn(page);
  await expect.poll(logicalOf).not.toBe(openedLogical);
  await page.waitForTimeout(500);
  expect(await storedZoom()).toBeNull();
  await eurChart.getByRole('button', { name: msg('cw.fit'), exact: true }).click();
  await expect.poll(rangeOf).toBe(opened);
  await expect.poll(logicalOf).toBe(openedLogical);
  await zoomIn(page);
  await expect.poll(logicalOf).not.toBe(openedLogical);

  await page.goto(url('XAUUSD'));
  const goldChart = page.getByTestId('chart-workspace');
  await expect(goldChart).toBeVisible();
  const goldKey = await goldChart.getAttribute('data-context');
  expect(goldKey).not.toBe(eurKey);
  await expect.poll(look).toBe('');

  // Back to EURUSD and after a reload: the opening view, not the zoom
  await page.goto(url('EURUSD'));
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await chartReady(page);
  await expect.poll(() => near(opened)).toBe(true);
  expect(await look()).toBe('');
  await page.reload();
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await chartReady(page);
  await expect.poll(() => near(opened)).toBe(true);
  expect(await storedZoom()).toBeNull();
});

test('Ein gewählter Zeitraum passt auch mehr als 2000 Kerzen einmal ein (1118-A5.1)', { tag: '@ANA-19' }, async ({ page, worker }) => {
  // Der Chart lässt höchstens 0,2 px je Kerze zu: 2100 Kerzen passen in eine breite Ansicht. Geöffnet zeigt er die letzten Kerzen
  // (Standard-Kerzenabstand); erst die Wahl des Zeitraums oben passt alle ein
  await page.setViewportSize({ width: 1440, height: 900 });
  const latest = Math.floor((Date.now() / 1000 + worker.state.brokerOffset) / 3600) * 3600;
  const series = Array.from({ length: 2100 }, (_, i) => [latest - (2100 - i) * 3600, 1 + i * .0001, 1.002 + i * .0001, .999 + i * .0001, 1.001 + i * .0001]);
  worker.state.ratesSeries = { H1: series };
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  const chart = page.getByTestId('analysis-chart');
  await chartReady(page);
  const firstShown = async () => Number((await chart.getAttribute('data-visible-range'))?.split(',')[0]);
  expect(await firstShown()).toBeGreaterThan(series[0][0]);
  await page.getByTestId('range-trigger').click();
  await page.getByTestId('range-preset-last7').click();
  // The series sets no `ratesLive`: there is no running candle, the last candle of the view is the last of the series
  await expect.poll(() => chart.getAttribute('data-visible-range')).toBe(`${series[0][0]},${series[2099][0]}`);
});

test('Neue Kerze und Größenänderung speichern keinen Zoom, ein Zeitrahmenwechsel öffnet die Standardansicht (1118-A5.1)', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  const chart = page.getByTestId('chart-workspace');
  await expect(chart).toBeVisible();
  const key = (await chart.getAttribute('data-context'))!;
  const zoom = () => page.evaluate(contextKey => JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents?.[contextKey]?.visibleTime ?? null, key);
  const rangeOf = () => page.getByTestId('analysis-chart').getAttribute('data-visible-range');
  await expect.poll(rangeOf).toBeTruthy();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.waitForTimeout(600);
  expect(await zoom()).toBeNull();
  await zoomIn(page);
  await page.waitForTimeout(600);
  expect(await zoom()).toBeNull();
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H4&range=30d`);
  await chartReady(page);
  const opened = await rangeOf();
  expect(opened).toMatch(/^\d+,\d+$/);
  // The view after the change is the opening view: "Reset view" does not change it
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.fit'), exact: true }).click();
  await page.waitForTimeout(300);
  expect(await rangeOf()).toBe(opened);
  expect(await zoom()).toBeNull();
});

test('Indikatorinstanzen und Parameter bleiben je Symbol getrennt', { tag: '@ANA-18' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.getByRole('button', { name: '+ SMA', exact: true }).click();
  // Adding opens the settings of the new indicator; OK keeps it
  await page.locator('[data-indicator="SMA"]').getByRole('spinbutton', { name: msg('cw.period'), exact: true }).fill('10');
  await page.getByRole('button', { name: msg('ind.ok'), exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('SMA');
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.locator('[data-indicator="SMA"]').getByRole('button', { name: msg('ind.edit'), exact: true }).click();
  await expect(page.locator('[data-indicator="SMA"]').getByRole('spinbutton', { name: msg('cw.period'), exact: true })).toHaveValue('10');
  await page.goto(`/chart?account=${LIVE_ID}&symbol=USOUSD&tf=H1&range=last7`);
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('SMA');
});

test('RSI-Füllung verwendet nach Wechsel auf die linke Achse weiter die RSI-Skala', { tag: ['@ANA-18', '@ANA-19'] }, async ({ page, worker }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const latest = Math.floor((Date.now() / 1000 + worker.state.brokerOffset) / 3600) * 3600;
  worker.state.ratesSeries = { H1: Array.from({ length: 200 }, (_, i) => [latest - (200 - i) * 3600, 1 + i * .001, 1.002 + i * .001, .999 + i * .001, 1.001 + i * .001]) };
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1`);
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await page.getByTestId('workspace-settings').click();
  await page.getByTestId('chart-workspace-settings').getByRole('button', { name: msg('cw.scales'), exact: true }).click();
  await page.getByRole('combobox', { name: msg('cw.side'), exact: true }).selectOption('left');
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  // RSI=100: the green fill belongs above 70, in the top part of the 0..100 pane.
  // An independent auto-scaled axis would fill almost the entire pane instead.
  const fillBottom = () => page.getByTestId('analysis-chart').evaluate(host => {
    const canvases = [...host.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 200 && c.getBoundingClientRect().height > 40);
    const rows = [...new Set(canvases.map(c => c.getBoundingClientRect().top))].sort((a, b) => a - b);
    // The user RSI pane is the pane that holds its legend row (the system RSI(7) pane lies above it)
    const legendTop = host.ownerDocument.querySelector('[data-indicator-row="RSI"]')!.getBoundingClientRect().top;
    const rsiRow = rows.filter(top => top <= legendTop).at(-1);
    let bottom = -1;
    for (const c of canvases.filter(c => c.getBoundingClientRect().top === rsiRow)) {
      const context = c.getContext('2d'); if (!context) continue;
      const pixels = context.getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let x = 20; x < c.width - 20; x += 8) {
        const p = (y * c.width + x) * 4;
        if (pixels[p + 1] > pixels[p] * 1.3 && pixels[p + 1] > pixels[p + 2] * 1.02 && pixels[p + 1] > 35 && pixels[p + 3] > 0) bottom = Math.max(bottom, y / c.height);
      }
    }
    return bottom;
  });
  await expect.poll(fillBottom).toBeGreaterThan(0);
  expect(await fillBottom()).toBeLessThan(.5);
});

test('Göstergeler-Fenster hat die Reiter Göstergeler und Çizimler; ohne Zeichnung steht ein Hinweis', { tag: '@UI-20' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: msg('cw.indicatorsAndDrawings') })).toBeVisible();
  await expect(dialogTab(page, 'cw.tab.indicators')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('indicator-instances')).toBeVisible();
  await dialogTab(page, 'cw.tab.drawings').click();
  await expect(dialogTab(page, 'cw.tab.drawings')).toHaveText(`${msg('cw.tab.drawings')} · 0`);
  await expect(page.getByTestId('drawing-objects')).toContainText(msg('cw.drawingsEmpty'));
  await dialogTab(page, 'cw.tab.indicators').click();
  await expect(page.getByTestId('indicator-instances')).toBeVisible();
});

test('Zeichnen, Rückgängig, Wiederholen, Bearbeiten und Neuladen', { tag: ['@ANA-17', '@UI-20'] }, async ({ page, worker }) => {
  void worker;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  const workspace = page.getByTestId('chart-workspace');
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toBeVisible();
  await workspace.getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  await page.getByTestId('tool-horizontal-line').click();
  const box = await chart.boundingBox(); if (!box) throw new Error('Chart missing');
  // The top bar of the one chart has two rows (timeframes and formations, to y 126): the line is drawn below them
  await page.mouse.click(box.x + box.width * .45, box.y + 160);
  const undo = workspace.getByRole('button', { name: msg('cw.undo'), exact: true });
  await expect(undo).toBeEnabled();
  await chart.focus(); await chart.press('ControlOrMeta+z');
  await expect(workspace.getByRole('button', { name: msg('cw.redo'), exact: true })).toBeEnabled();
  await chart.press('ControlOrMeta+Shift+z');
  await expect(undo).toBeEnabled();
  await undo.click();
  const redo = workspace.getByRole('button', { name: msg('cw.redo'), exact: true });
  await expect(redo).toBeEnabled(); await redo.click();
  await openDrawings(workspace);
  await expect(dialogTab(page, 'cw.tab.drawings')).toHaveText(`${msg('cw.tab.drawings')} · 1`);
  const object = page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.horizontal-line'), exact: true });
  await object.click();
  await page.getByRole('dialog').getByRole('spinbutton', { name: msg('cw.width'), exact: true }).fill('3');
  await expect(page.getByRole('dialog').getByRole('spinbutton', { name: msg('cw.width'), exact: true })).toHaveValue('3');
  await page.keyboard.press('Escape');
  const drawings = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents).map(d => (d as { drawings: string }).drawings));
  await page.getByTestId('timeframe-H4').click();
  // H4 is the default timeframe now: it leaves the URL
  await expect(page).not.toHaveURL(/tf=H1/);
  await expect(page.getByTestId('timeframe-H4')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents).map(d => (d as { drawings: string }).drawings))).toEqual(drawings);
  await page.reload();
  await openDrawings(workspace);
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.horizontal-line'), exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('spinbutton', { name: msg('cw.width'), exact: true })).toHaveValue('3');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test.describe(`Chart-Fenster ${viewport.width}px`, () => {
    test.use({ viewport, appLocale: 'de' });
    test('Canvas-Vorschau wirkt und Vollbild-Dialog bleibt erreichbar', { tag: ['@ANA-19', '@UI-07'] }, async ({ page, worker }) => {
      void worker;
      await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1`);
      const workspace = page.getByTestId('chart-workspace');
      await expect(workspace).toBeVisible();
      await workspace.getByRole('button', { name: msg('analysis.chart.fullscreen', {}, 'de'), exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('chart-page');
      const before = await page.getByTestId('analysis-chart').screenshot();
      await page.getByTestId('workspace-settings').click();
      const settings = page.getByTestId('chart-workspace-settings');
      await settings.getByRole('button', { name: msg('cw.canvas', {}, 'de'), exact: true }).click();
      await settings.getByLabel(msg('cw.background', {}, 'de'), { exact: true }).fill('#123456');
      await page.getByRole('button', { name: msg('cw.apply', {}, 'de'), exact: true }).click();
      const after = await page.getByTestId('analysis-chart').screenshot();
      expect(before.equals(after)).toBe(false);
      await page.getByTestId('workspace-settings').click();
      await expect(settings).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: test.info().outputPath(`chart-settings-${viewport.width}.png`) });
      await page.getByRole('button', { name: msg('cw.cancel', {}, 'de'), exact: true }).click();
      await workspace.getByRole('button', { name: msg('analysis.chart.fullscreen.exit', {}, 'de'), exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });
}

test('Broker-Suche bewahrt Originalnamen und verwirft ungültige Symbole nach Kontowechsel', { tag: '@ANA-16' }, async ({ page, worker }) => {
  worker.setZones(DEMO_ID, []);
  worker.state.symbols = worker.state.symbols.map(s => s.name === 'XAUUSD' ? { ...s, name: 'Gold.m' } : s);
  await page.goto(`/chart?account=${DEMO_ID}&tf=M15`);
  await page.getByRole('combobox', { name: msg('formation.symbol') }).fill('Gold');
  await page.getByRole('option').filter({ hasText: 'Gold.m' }).click();
  await expect(page.getByTestId('chart-workspace')).toHaveAttribute('data-context', /Gold\.m/);
  expect(worker.calls.filter(c => c.path === `/api/market/${DEMO_ID}/rates`).every(c => c.query.get('symbol') === 'Gold.m')).toBe(true);
  worker.overrides.set(`GET /api/symbols/${LIVE_ID}`, { status: 200, body: { status: 'success', account_id: LIVE_ID, symbols: worker.state.symbols.filter(s => s.name === 'EURUSD') } });
  await page.goto(`/chart?account=${LIVE_ID}&symbol=Gold.m&tf=M15`);
  await expect(page.getByRole('alert').filter({ hasText: msg('cw.invalidSymbol') })).toBeVisible();
  await expect(page.getByTestId('chart-workspace')).toHaveCount(0);
  expect(worker.calls.filter(c => c.path === `/api/market/${LIVE_ID}/rates`)).toHaveLength(0);
});

test('Speicherfehler wird angezeigt und die aktuelle Sitzung bleibt bedienbar', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('grid-robot-chart-workspaces')) throw new DOMException('Synthetic quota', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1`);
  await expect(page.getByRole('alert').filter({ hasText: msg('cw.storageError') })).toBeVisible();
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.getByRole('button', { name: '+ ATR', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('ATR');
});

test.describe('ohne Formationssuche', () => {
  // The toast "formation search finished" (7 s) covers Cancel and Apply of the settings dialog; each click waited until it went away
  // (7.6 to 8.5 s per click, 2 clicks in a 23 s test; journal 2026-11-17-ana20-legend-shift-ana19-toast). The test needs no search.
  test.use({ formationAsk: 'manual' });
  test('Anzeige-Einstellung speichert erst beim Anwenden, auch nach hartem Neuladen', { tag: '@ANA-19' }, async ({ page, worker }) => {
    void worker;
    // Setup-Modus: „Namen anzeigen“ (Statuszeile) hat eine messbare Wirkung (Namen in `workspace-indicator-values`). Der Abschnitt „Ebenen“ des Dialogs gibt es nicht mehr (U3b); die Setup-Ebenen stehen im Menü „Ebenen“ und wirken sofort.
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H1`);
    const values = page.getByTestId('workspace-indicator-values');
    await expect(values).toContainText('EWO');
    const savedNames = () => page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').appearance?.names);
    const toggleNames = async () => {
      await page.getByTestId('workspace-settings').click();
      const modal = page.getByTestId('chart-workspace-settings');
      await modal.getByRole('button', { name: msg('cw.status'), exact: true }).click();
      await modal.getByRole('checkbox', { name: msg('cw.names') }).click();
    };
    // Vorschau: schon vor „Anwenden“ sichtbar am Chart, gespeichert ist noch nichts
    await toggleNames();
    await expect(values).not.toContainText('EWO');
    expect(await savedNames()).not.toBe(false);
    // „Abbrechen“ stellt den Ausgangszustand wieder her
    await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
    await expect(values).toContainText('EWO');
    // Hartes Neuladen ohne Anwenden: weiter der Ausgangszustand
    await toggleNames();
    await expect(values).not.toContainText('EWO');
    await page.reload();
    await expect(values).toContainText('EWO');
    expect(await savedNames()).not.toBe(false);
    // „Anwenden“ speichert, auch nach dem Neuladen
    await toggleNames();
    await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
    await expect.poll(savedNames).toBe(false);
    await page.reload();
    await expect(values).not.toContainText('EWO');
  });
});

test('Lokales Bild bleibt getrennt gespeichert und überlebt Löschen/Rückgängig und Neuladen', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  // A slow decode must not let the drawing library treat an uncached local image as missing.
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value: string) { window.setTimeout(() => descriptor.set!.call(this, value), 500); } });
  });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1`);
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'local-test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8X8AAAAASUVORK5CYII=', 'base64') });
  const workspace = page.getByTestId('chart-workspace');
  // addImage places and selects the image at the pane centre immediately.
  await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents ?? {}).some(d => JSON.parse((d as { drawings: string }).drawings).some((drawing: { kind: string }) => drawing.kind === 'image')))).toBe(true);
  await openDrawings(workspace);
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.image'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.remove'), exact: true }).click();
  await page.keyboard.press('Escape');
  await workspace.getByRole('button', { name: msg('cw.undo'), exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents ?? {}).some(d => JSON.parse((d as { drawings: string }).drawings).some((drawing: { kind: string }) => drawing.kind === 'image')))).toBe(true);
  const images = await page.evaluate(() => {
    const key = 'grid-robot-chart-workspaces-v1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    return { metadata: JSON.stringify(data), assets: Object.keys(localStorage).filter(k => k.startsWith(`${key}-image-`)) };
  });
  expect(images.assets).toHaveLength(1);
  expect(images.metadata).not.toContain('data:image');
  expect(images.metadata).toContain('\\"kind\\":\\"image\\"');
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await openDrawings(workspace);
  await expect(page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.image'), exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

const CHART_URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`;
type StoredIndicator = { id: string; kind: string; paneId: string; paneCollapsed: boolean; visible: boolean; scaleSide: string; maxTimeframe: number };
type StoredAlarm = { armed: boolean; value: number };

async function openOscillatorChart(page: Page) {
  await page.goto(CHART_URL);
  const controls = page.getByTestId('oscillator-controls');
  await expect(controls).toBeVisible();
  const context = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
  // UI-18: the system RSI is an indicator of its own now. These tests are about user panes, so they start from a document with
  // the layer RSI off and a user RSI(14) + EWO (the former default); the system RSI stays at the start of the stored list and is left out by `storedDocument`.
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{"version":2}');
    state.version = 2;
    state.documents = { ...state.documents, [key]: { drawings: '[]', images: {}, alarms: [], overlays: { rsi: false }, indicators: [{ id: 'user-rsi', kind: 'RSI' }, { id: 'user-ewo', kind: 'EWO' }] } };
    localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify(state));
  }, context);
  await page.reload();
  await expect(controls).toBeVisible();
  // UI-11: the RSI layer is off here and no system pane is left; the checks below count the user panes only
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-system-panes', '1');
  return { controls, context };
}
const storedDocument = (page: Page, key: string) => page.evaluate(k => {
  const state = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}');
  return state.documents[k] as { indicators: StoredIndicator[]; alarms: StoredAlarm[] };
}, key).then(doc => ({ ...doc, indicators: doc.indicators.filter(item => item.id !== 'system-rsi') }));
/** Height of the price pane and of each user pane in pixels, price pane first. Lightweight Charts draws one table row per pane. No system pane is left since the Wave pane was removed (UI-11); the filter below keeps the hook for a future one. */
const SYSTEM_PANES = 0;
const paneHeights = (page: Page) => page.getByTestId('chart-workspace').locator('table').first().evaluate(table =>
  [...table.querySelectorAll('tr')].filter(row => row.querySelector('canvas') && row.children.length === 3).map(row => Math.round(row.getBoundingClientRect().height)).slice(0, -1))
  .then(heights => heights.filter((_, i) => i === 0 || i > SYSTEM_PANES));
// The legend shows the value under the crosshair, so move the mouse off the chart to read the latest value.
const rsiValue = async (page: Page) => { await page.mouse.move(0, 0); return Number((await page.locator('[data-indicator-value="RSI"]').innerText()).replace(/^.*\)\s*/, '').replace(',', '.')); };

test('Bereiche lassen sich verschieben, einklappen, vergrößern und entfernen; nur das Vergrößern ist vorübergehend', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: this test checks per-product records
  test.slow();
  void worker;
  await page.setViewportSize({ width: 375, height: 812 });
  const { controls, context } = await openOscillatorChart(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect.poll(async () => (await paneHeights(page)).length).toBe(3);

  await controls.getByRole('button', { name: msg('cw.paneDown', { indicator: 'RSI' }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.map(item => item.kind)).toEqual(['EWO', 'RSI']);
  // The last pane has no down button (TradingView hides a move that is not possible)
  await expect(controls.getByRole('button', { name: msg('cw.paneDown', { indicator: 'RSI' }) })).toHaveCount(0);

  await controls.getByRole('button', { name: msg('cw.paneCollapse', { indicator: 'RSI' }) }).click();
  await expect.poll(async () => (await paneHeights(page))[2]).toBeLessThanOrEqual(34);
  await expect(controls.getByRole('button', { name: msg('cw.paneExpand', { indicator: 'RSI' }) })).toHaveAttribute('aria-expanded', 'false');

  const before = await paneHeights(page);
  await controls.getByRole('button', { name: msg('cw.paneMaximize', { indicator: 'EWO' }) }).click();
  await expect.poll(async () => (await paneHeights(page))[1]).toBeGreaterThan(before[1] * 2);
  await controls.getByRole('button', { name: msg('cw.paneRestore', { indicator: 'EWO' }) }).click();
  await expect.poll(async () => (await paneHeights(page))[1]).toBe(before[1]);

  await controls.getByRole('button', { name: msg('cw.paneMaximize', { indicator: 'EWO' }) }).click();
  await expect(controls.getByRole('button', { name: msg('cw.paneRestore', { indicator: 'EWO' }) })).toBeVisible();
  await page.reload();
  await expect(controls.getByRole('button', { name: msg('cw.paneMaximize', { indicator: 'EWO' }) })).toBeVisible();
  await expect(controls.getByRole('button', { name: msg('cw.paneExpand', { indicator: 'RSI' }) })).toBeVisible();
  await expect.poll(async () => (await paneHeights(page))[2]).toBeLessThanOrEqual(34);

  await controls.getByRole('button', { name: msg('cw.paneRemoveNamed', { indicator: 'RSI' }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.map(item => item.kind)).toEqual(['EWO']);
  await expect.poll(async () => (await paneHeights(page)).length).toBe(2);
});

test('Indikatormenü: Sichtbarkeit, Zeitrahmen, Skala, Bereichswechsel, Kopie, Formel und Favorit', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: this test checks per-product records
  test.slow();
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { controls, context } = await openOscillatorChart(page);
  // A closed menu fades out first. Open the next one only after the old items are gone, or both match.
  const menu = async (indicator: string) => {
    await expect(page.getByRole('button', { name: msg('cw.indicatorCopy'), exact: true })).toHaveCount(0);
    await controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator }) }).click();
  };
  const values = page.getByTestId('workspace-indicator-values');

  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorHide', { indicator: 'RSI' }) }).click();
  // A hidden indicator keeps its pane and its legend row (grey, eye off) so it can be shown again.
  await expect(page.locator('[data-indicator-row="RSI"]')).toHaveAttribute('data-visible', 'false');
  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorShow', { indicator: 'RSI' }) }).click();
  await expect(page.locator('[data-indicator-row="RSI"]')).toHaveAttribute('data-visible', 'true');
  await expect(values).toContainText('RSI');

  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorSettings') }).click();
  await page.getByRole('tab', { name: msg('ind.tab.visibility') }).click();
  await page.locator('[data-indicator="RSI"]').getByRole('spinbutton', { name: msg('ind.vis.hour.to') }).fill('1');
  await page.getByRole('button', { name: msg('ind.ok'), exact: true }).click();
  await expect(values).toContainText('RSI');
  await page.getByTestId('timeframe-H4').click();
  await expect(values).toContainText('EWO');
  // Outside its timeframe range the indicator is not drawn: its row stays, dimmed and without a value.
  await expect(page.locator('[data-indicator-row="RSI"]')).toHaveAttribute('data-drawn', 'false');
  await page.getByTestId('timeframe-H1').click();
  await expect(page.locator('[data-indicator-row="RSI"]')).toHaveAttribute('data-drawn', 'true');
  await expect(values).toContainText('RSI');

  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorScale', { side: msg('cw.option.left') }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.find(item => item.kind === 'RSI')?.scaleSide).toBe('left');

  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorMovePane', { pane: 'EWO' }) }).click();
  await expect(controls.locator('[data-oscillator-pane="EWO + RSI"], [data-oscillator-pane="RSI + EWO"]')).toBeVisible();
  await expect.poll(async () => (await paneHeights(page)).length).toBe(2);
  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorNewPane') }).click();
  await expect.poll(async () => (await paneHeights(page)).length).toBe(3);

  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorCopy') }).click();
  await expect(controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'RSI 2' }) })).toBeVisible();
  await expect.poll(async () => (await paneHeights(page)).length).toBe(4);

  await menu('RSI 1');
  await page.getByRole('button', { name: msg('cw.indicatorSource') }).click();
  await expect(page.getByTestId('indicator-formula')).toContainText('RMA(gain, 14)');
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await menu('EWO');
  await page.getByRole('button', { name: msg('cw.indicatorSource') }).click();
  await expect(page.getByTestId('indicator-formula')).toContainText('SMA(close, 5) - SMA(close, 35)');
  await page.keyboard.press('Escape');
  await menu('EWO');
  await page.getByRole('button', { name: msg('cw.indicatorInfo') }).click();
  await expect(page.getByTestId('indicator-info')).toContainText('35');
  await page.keyboard.press('Escape');

  await menu('RSI 1');
  await page.getByRole('button', { name: msg('cw.indicatorFavorite') }).click();
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(msg('cw.favoriteIndicators'));
  await dialog.getByRole('button', { name: 'RSI', exact: true }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.filter(item => item.kind === 'RSI').length).toBe(3);
  await page.keyboard.press('Escape');

  // Göster/gizle eski „Çizim nesneleri“ penceresinden Göstergeler sekmesine taşındı (UI-20, 1106-A3)
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  const ewo = page.getByTestId('indicator-instances').locator('[data-indicator="EWO"]').first().getByTestId('indicator-visibility');
  await expect(ewo).toContainText(msg('cw.visible'));
  await ewo.click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.find(item => item.kind === 'EWO')?.visible).toBe(false);
  await expect(ewo).toContainText(msg('cw.hidden'));
  await ewo.click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.find(item => item.kind === 'EWO')?.visible).toBe(true);
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'RSI 3' }) })).toBeVisible();
  await menu('RSI 1');
  await expect(page.getByRole('button', { name: msg('cw.indicatorUnfavorite') })).toBeVisible();
});

test('Lejant: imleç grafikten düğmeye geçince satırın düğmeleri yerinde kalır', { tag: ['@ANA-20'] }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: openOscillatorChart writes a per-product record
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { controls } = await openOscillatorChart(page);
  await chartReady(page);
  const rows = ['RSI', 'EWO'] as const;
  const value = (kind: string) => page.locator(`[data-indicator-value="${kind}"]`);
  const trigger = (kind: string) => controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: kind }) });
  const triggerX = async () => Promise.all(rows.map(async kind => (await trigger(kind).boundingBox())!.x));
  // Off the chart the legend shows the latest values (a number after the parameters; the parameters have digits too)
  await page.mouse.move(0, 0);
  for (const kind of rows) await expect(value(kind)).toContainText(/\) -?\d/);
  // The crosshair on the first candles: RSI(14) and EWO(5/35) have no value there yet, the legend shows "—" (journal 2026-11-17-ana20-legend-shift-ana19-toast).
  // The chart opens with the latest candles (1118-A5.1): the chosen range again fits all candles, the first one at the left edge
  await fitChosenRange(page);
  await page.mouse.move(0, 0);
  const chart = (await page.getByTestId('analysis-chart').boundingBox())!;
  await page.mouse.move(chart.x + 8, chart.y + chart.height * 0.3);
  for (const kind of rows) await expect(value(kind)).toContainText('—');
  const before = await triggerX();
  // The mouse goes to the button: the crosshair goes away and the latest value comes back; the buttons must not move under the mouse
  const box = (await trigger('RSI').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const kind of rows) await expect(value(kind)).toContainText(/\) -?\d/);
  expect(await triggerX()).toEqual(before);
});

test('Lejant 375 px: imleç grafikteyken "—" kesilmez, düğmeler yerinde kalır', { tag: ['@ANA-20', '@UI-08'] }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: the document below is a per-product record
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(CHART_URL);
  const controls = page.getByTestId('oscillator-controls');
  await expect(controls).toBeVisible();
  const context = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
  // MACD and EWO: their rows with the latest value are wider than the legend at 375 px (measured 2 and 16 px, journal 2026-11-17-ana20-legend-shift-ana19-toast)
  const rows = ['RSI', 'EWO', 'MACD'] as const;
  await page.evaluate(([key, kinds]) => {
    const state = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{"version":2}');
    state.version = 2;
    state.documents = { ...state.documents, [key]: { drawings: '[]', images: {}, alarms: [], overlays: { rsi: false }, indicators: kinds.map(kind => ({ id: `user-${kind.toLowerCase()}`, kind })) } };
    localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify(state));
  }, [context, rows] as const);
  await page.reload();
  await expect(controls).toBeVisible();
  await chartReady(page);
  const value = (kind: string) => page.locator(`[data-indicator-value="${kind}"]`);
  const trigger = (kind: string) => controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: kind }) });
  const triggerX = async () => Promise.all(rows.map(async kind => (await trigger(kind).boundingBox())!.x));
  // Width of the text that does not fit, for each row (the text element and its parts)
  const cut = () => Promise.all(rows.map(kind => value(kind).evaluate(el => Math.max(0, ...[el, ...el.querySelectorAll('*')].map(e => e.scrollWidth - e.clientWidth)))));
  await page.mouse.move(0, 0);
  for (const kind of rows) await expect(value(kind)).toContainText(/\) -?\d/);
  const latest = await triggerX();
  // The chart opens with the latest candles (1118-A5.1): the chosen range again fits all candles, the first one at the left edge
  await fitChosenRange(page);
  await page.mouse.move(0, 0);
  const chart = (await page.getByTestId('analysis-chart').boundingBox())!;
  await page.mouse.move(chart.x + 8, chart.y + chart.height * 0.3);
  for (const kind of rows) await expect(value(kind)).toContainText('—');
  // Name, parameters and "—" fit: nothing of the row is cut, and the buttons stay where they were with the latest value
  expect(await cut()).toEqual([0, 0, 0]);
  expect(await triggerX()).toEqual(latest);
});

test('Alarm: ein Zeitrahmenwechsel ist kein Übertritt, ein Live-Kurs löst ihn einmal aus', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: this test checks per-product records
  test.slow();
  const latestH1 = Math.floor((Date.now() / 1000 + worker.state.brokerOffset) / 3600) * 3600;
  const latestH4 = Math.floor((Date.now() / 1000 + worker.state.brokerOffset) / 14400) * 14400;
  // Fallend H1 (RSI 0), steigend H4 (RSI 100): nur der Wechsel selbst springt über die Schwelle.
  worker.state.ratesSeries = {
    H1: Array.from({ length: 32 }, (_, index) => { const close = 2 - index * 0.01; return [latestH1 - (31 - index) * 3600, close + 0.005, close + 0.01, close - 0.01, close]; }),
    H4: Array.from({ length: 32 }, (_, index) => { const close = 1 + index * 0.01; return [latestH4 - (31 - index) * 14400, close - 0.005, close + 0.01, close - 0.01, close]; }),
  };
  const { controls, context } = await openOscillatorChart(page);
  const toasts = page.getByRole('status').filter({ hasText: msg('cw.alarmTriggered', { indicator: 'RSI', value: '55' }) });
  await controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'RSI' }) }).click();
  await page.getByRole('button', { name: msg('cw.indicatorAlarm') }).click();
  await page.getByRole('spinbutton', { name: msg('cw.alarmValue') }).fill('55');
  await page.getByRole('button', { name: msg('cw.alarmSave') }).click();
  await expect.poll(async () => (await storedDocument(page, context)).alarms.length).toBe(1);

  await expect.poll(() => rsiValue(page)).toBeLessThan(55);
  await page.getByTestId('timeframe-H4').click();
  await expect.poll(() => rsiValue(page)).toBeGreaterThan(55);
  await expect(toasts).toHaveCount(0);
  expect((await storedDocument(page, context)).alarms[0].armed).toBe(true);

  // Ohne feste Reihe liefert der Mock eine laufende Kerze, in die Live-Preise einfließen. Am Wochenende (Brokerzeit,
  // also ab Freitag 21:00 UTC) gäbe es sie ohne ratesAllDays nicht.
  worker.state.ratesSeries = null;
  worker.state.ratesAllDays = true;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=USOUSD&tf=H1&range=last7`);
  await page.goto(CHART_URL);
  await expect(page.getByTestId('chart-workspace')).toHaveAttribute('data-context', context);
  await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
  await expect.poll(() => rsiValue(page).then(Number.isFinite)).toBe(true);
  const push = (price: number) => worker.pushMetrics({ account_id: DEMO_ID, symbol: 'EURUSD', price, market_open: true });
  // FreeChartPanel verwirft Live-Kurse ab 20 % Abstand zum letzten Schluss. Die Mock-Kerzen schließen je nach Uhrzeit
  // zwischen 94,7 und 99,3, darum müssen beide Kurse zwischen 79,5 und 113,6 liegen.
  await expect.poll(async () => { push(80); return rsiValue(page); }).toBeLessThan(55);
  expect((await storedDocument(page, context)).alarms[0].armed).toBe(true);
  await expect.poll(async () => { push(112); return rsiValue(page); }).toBeGreaterThan(55);
  await expect(toasts).toHaveCount(1);
  await expect.poll(async () => (await storedDocument(page, context)).alarms[0].armed).toBe(false);

  // Einmalig: erneutes Über- und Unterschreiten meldet nichts mehr, der Alarm bleibt gespeichert.
  push(80); await expect.poll(() => rsiValue(page)).toBeLessThan(55);
  push(112); await expect.poll(() => rsiValue(page)).toBeGreaterThan(55);
  await expect(toasts).toHaveCount(1);
  await page.reload();
  await expect.poll(async () => (await storedDocument(page, context)).alarms).toHaveLength(1);
});

test('Bereichseinstellungen und Alarme bleiben im Chart-Kontext; alte Dokumente laden unverändert', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
  worker.userPrefs.admin = { ...worker.userPrefs.admin, chart_osc_scope: { mode: 'product' } }; // USR-17: this test checks per-product records
  test.slow();
  void worker;
  const { controls, context } = await openOscillatorChart(page);
  await controls.getByRole('button', { name: msg('cw.paneCollapse', { indicator: 'RSI' }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.find(item => item.kind === 'RSI')?.paneCollapsed).toBe(true);

  await page.goto(`/chart?account=${LIVE_ID}&symbol=USOUSD&tf=H1&range=last7`);
  await expect(controls.getByRole('button', { name: msg('cw.paneCollapse', { indicator: 'RSI' }) })).toBeVisible();

  // Stand vor ANA-20: keine Bereichsfelder, keine Alarme.
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1')!);
    const legacy = { id: 'legacy-macd', kind: 'MACD', visible: true, period: 12, slow: 26, signal: 9 };
    state.documents[key] = { drawings: '[]', indicators: [legacy], images: {}, overlays: {} };
    localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify(state));
  }, context);
  await page.goto(CHART_URL);
  await expect(controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'MACD' }) })).toBeVisible();
  await controls.getByRole('button', { name: msg('cw.paneCollapse', { indicator: 'MACD' }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators[0]).toMatchObject({ id: 'legacy-macd', paneId: 'legacy-macd', paneCollapsed: true, scaleSide: 'auto' });
  expect((await storedDocument(page, context)).alarms).toEqual([]);
});

test.describe('ANA-26 W1 und MN im freien Chart', () => {
  const DAY = 86400;
  const FIRST = Date.UTC(2024, 0, 3) / 1000; // Mittwoch
  /** Mo–Fr von 2024-01-03 bis 2024-02-09 als feste D1-Reihe */
  function dailySeries() {
    const rows: number[][] = [];
    for (let t = FIRST; t < Date.UTC(2024, 1, 10) / 1000; t += DAY) {
      const wd = new Date(t * 1000).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      rows.push([t, 100, 110, 90, 105]);
    }
    return rows;
  }

  for (const c of [
    { tf: 'W1', bars: 6, from: Date.UTC(2023, 11, 31) / 1000 },
    { tf: 'MN', bars: 2, from: Date.UTC(2024, 0, 1) / 1000 },
  ]) {
    test(`${c.tf} fragt D1 ab, beginnt am Periodenbeginn und hat ${c.bars} Kerzen`, { tag: '@ANA-26' }, async ({ page, worker }) => {
      worker.state.ratesSeries = { D1: dailySeries() };
      await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=${c.tf}&from=2024-01-03&to=2024-02-10`);
      await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', String(c.bars));
      expect(chartQueries(worker).ratesQueries.length).toBeGreaterThan(0);
      for (const q of chartQueries(worker).ratesQueries) {
        const p = new URLSearchParams(q);
        expect(p.get('timeframe')).toBe('D1');
        expect(Number(p.get('from'))).toBe(c.from);
      }
      await expect(page.getByTestId(`timeframe-${c.tf}`)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('trend-toggle')).toBeDisabled();
    });
  }

  // Vorher kannte der Setup-Modus W1 nicht (Rückfall auf M15). Der eine Chart (UI-22) hat alle neun Zeiteinheiten, auch mit einem Link mit `zone`.
  test('Ein Link mit zone kennt W1: tf=W1 wird gewählt, alle neun Zeiteinheiten stehen da', { tag: '@ANA-26' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=W1`);
    await expect(page.getByTestId('timeframe-W1')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('timeframe-M15')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('timeframe-select').locator('[data-testid^="timeframe-"]')).toHaveCount(9);
  });
});

test('ANA-26 D1-Lücke: Hinweis nennt D1, W1 zeichnet keinen Lückenplatz', { tag: '@ANA-26' }, async ({ page, worker }) => {
  const rows: number[][] = [];
  for (let t = Date.UTC(2024, 0, 3) / 1000; t < Date.UTC(2024, 1, 10) / 1000; t += 86400) {
    const wd = new Date(t * 1000).getUTCDay();
    // 17. and 18. January have no candle: that is the gap
    if (wd !== 0 && wd !== 6 && t !== Date.UTC(2024, 0, 17) / 1000 && t !== Date.UTC(2024, 0, 18) / 1000) rows.push([t, 100, 110, 90, 105]);
  }
  worker.state.ratesSeries = { D1: rows };
  worker.state.ratesMissing = [{ from: Date.UTC(2024, 0, 17) / 1000, to: Date.UTC(2024, 0, 19) / 1000, reason: 'unavailable', checked_at: Date.UTC(2024, 1, 1) / 1000 }];
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=W1&from=2024-01-03&to=2024-02-10`);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', '6');
  await expect(page.getByTestId('missing-ranges').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('data-quality')).toContainText(msg('analysis.data.missing.textCalendar'));
});

test.describe('ANA-27 Ältere Kerzen laden beim Scrollen nach links (leichte Seiten, Fenster „alles“)', () => {
  // Erste Ladung: OPEN_RANGE_BARS Kerzen; die 100.000-Kerzen-Fälle stehen in chart-older-heavy.spec.ts (Journal 2026-11-07-chart-older-candles)
  const ALL_URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=M1&range=all`;
  const PAGE = OLDER_PAGE_BARS;
  /**
   * Erste Ladung bei „alles“: das Fenster endet am Ende des Brokertags und reicht OPEN_RANGE_BARS Minuten zurück (ratesWindow);
   * Kerzen gibt es nur bis jetzt. Also OPEN_RANGE_BARS minus die Minuten bis Tagesende, nicht immer 3000 bis 5999. ±1, weil
   * zwischen dieser Rechnung und der Antwort des Mocks die Minute wechseln kann.
   */
  const firstLoad = (worker: { state: { brokerOffset: number } }) => {
    const latest = Math.floor((nowMs() / 1000 + worker.state.brokerOffset) / 60) * 60;
    const dayEnd = Math.floor(latest / 86_400) * 86_400 + 86_400;
    const expected = (latest - (dayEnd - OPEN_RANGE_BARS * 60)) / 60 + 1;
    return new RegExp(`^(${expected - 1}|${expected}|${expected + 1})$`);
  };

  test('„Tümü“: erst eine Seite ohne Kerzen entscheidet über den Beginn der MT5-Historie, der Bereich davor zählt nicht als fehlend', { tag: '@ANA-27' }, async ({ page, worker }) => {
    test.setTimeout(120_000);
    worker.state.ratesAllDays = true;
    const latest = Math.floor((nowMs() / 1000 + worker.state.brokerOffset) / 60) * 60;
    worker.state.ratesSince = latest - 30_000 * 60;
    await page.goto(ALL_URL);
    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toHaveAttribute('data-bars', firstLoad(worker));
    await expect(page.getByTestId('data-quality')).toContainText(msg('analysis.data.scroll.title'));
    const edge = () => page.evaluate(() => document.querySelector('[data-testid="older-edge"]')?.getAttribute('data-state') ?? null);
    // Bis zur ersten Kerze schieben, bis die Anzeige „Beginn der Historie“ meldet (zwei Seiten mit Kerzen, dann eine leere)
    await panToFirstCandle(page);
    await expect.poll(edge).toBe('history');
    expect(Math.abs(Number(await chart.getAttribute('data-bars')) - 30_000)).toBeLessThanOrEqual(1500);
    await expect(page.getByTestId('data-quality')).toHaveCount(0);
    await expect(chart).toHaveAttribute('data-gap-areas', '0');
    const requests = worker.ratesQueries.length;
    await page.waitForTimeout(1200);
    expect(worker.ratesQueries.length).toBe(requests);
  });

  test('D1 „Tümü“ (mehr als 3000 Kerzen): am linken Rand kommen ältere Seiten, auch wenn eine Seite vor 1970 reichte', { tag: '@ANA-27' }, async ({ page, worker }) => {
    test.setTimeout(150_000);
    worker.state.ratesAllDays = true;
    const latest = Math.floor((Date.now() / 1000 + worker.state.brokerOffset) / 86400) * 86400;
    // Die Historie beginnt 1970-01-04: die erste Seite (20.000 Tage vor 2013) wäre mit from < 0 angefragt worden
    worker.state.ratesSince = 3 * 86400;
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=D1&range=all`);
    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toHaveAttribute('data-bars', /^[45]\d{3}$/);
    await panToFirstCandle(page);
    await expect(page.getByTestId('older-edge')).toHaveAttribute('data-state', 'history');
    expect(Math.abs(Number(await chart.getAttribute('data-bars')) - (latest - 3 * 86400) / 86400)).toBeLessThanOrEqual(5);
    // Keine Anfrage mit from < 0
    expect(worker.ratesQueries.every((q) => Number(new URLSearchParams(q).get('from')) >= 0)).toBe(true);
  });

  test.describe('M1 mit fester Uhr', () => {
    // Der Mock liefert Kerzen bis „jetzt“: eine neue Minute während des Tests brächte eine Kerze mehr (1116-A35)
    test.use({ fakeNow: '2026-11-16T12:00:05Z' });

    test('Ohne Indikator-Reihen und Ebenen bleibt die Ansicht beim Anfügen ebenfalls stehen', { tag: '@ANA-27' }, async ({ page, worker }) => {
      worker.state.ratesAllDays = true;
      const { chart, rangeOf, before, loaded, release } = await openNearLeftEdge(page, chartQueries(worker), { url: ALL_URL, initialBars: firstLoad(worker), extra: { drawings: '[]', indicators: [], images: {}, overlays: { rsi: false, wave: false } } });
      release();
      await expect(chart).toHaveAttribute('data-bars', String(loaded + PAGE));
      await page.waitForTimeout(500);
      const after = await rangeOf();
      expect(Math.max(Math.abs(after[0] - before[0]), Math.abs(after[1] - before[1]))).toBeLessThanOrEqual(60);
    });

    test('Eine Seite pro Zug: nach der ersten Seite holt der Chart nicht gleich die nächste', { tag: '@ANA-27' }, async ({ page, worker }) => {
      // 1117 Schritt 5: die Indikator-Reihen bekamen die Seite vor der Kerzenreihe; die Zeitachse meldete den verschobenen Bereich,
      // und die Prüfung las barsBefore noch aus der alten Kerzenreihe (3 statt 20.003). Gleich danach kam eine zweite Seite.
      // Die Freigabe folgt direkt auf den Zug, also innerhalb der Bedienungsfrist (1,5 s), in der eine zweite Anfrage möglich wäre
      worker.state.ratesAllDays = true;
      const queries = chartQueries(worker);
      const { chart, loaded, loadedFrom, release } = await openNearLeftEdge(page, queries, { url: ALL_URL, initialBars: firstLoad(worker) });
      release();
      await expect.poll(async () => Number(await chart.getAttribute('data-bars'))).toBeGreaterThanOrEqual(loaded + PAGE);
      await page.waitForTimeout(1500);
      const older = queries.ratesQueries.filter((q) => Number(new URLSearchParams(q).get('to')) <= loadedFrom);
      expect(older).toHaveLength(1);
      await expect(chart).toHaveAttribute('data-bars', String(loaded + PAGE));
    });

    test('Tıklama ve kendiliğinden gelen aralık değişikliği eski sayfa istemez, sağa sürükleme ister', { tag: '@ANA-27' }, async ({ page, worker }) => {
      // 1118-A3.1 = C: only a drag or scroll of the user loads older candles. Before, a click marked the next 1.5 s as input,
      // and an automatic change of the range in this time (a new candle, a fit, setData, a new width) requested a page
      // (journal 2026-11-17-chart-older-page-dock-scan-findings §3, 40 of 40)
      await page.setViewportSize({ width: 1920, height: 1000 });
      worker.state.ratesAllDays = true;
      const queries = chartQueries(worker);
      await page.goto(ALL_URL);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toHaveAttribute('data-bars', firstLoad(worker));
      await expect(page.getByTestId('data-quality')).toContainText(msg('analysis.data.scroll.title'));
      const loadedFrom = Math.min(...queries.ratesQueries.map((q) => Number(new URLSearchParams(q).get('from'))));
      const older = () => queries.ratesQueries.filter((q) => Number(new URLSearchParams(q).get('to')) <= loadedFrom).length;
      // "Tümü" fits all candles one time: the first candle is at the left edge of the view
      await page.getByTestId('range-trigger').click();
      await page.getByTestId('range-preset-all').click();
      // The view reaches the first candles (M1 without gaps: the span in minutes is the number of candles). Fewer than 50 candles
      // before the view, so a range change would request a page if it counted; measured: after the fit a few pixels of the width go
      // to the price axis, and the left edge moves by about 10 candles
      const bars = Number(await chart.getAttribute('data-bars'));
      await expect.poll(async () => { const [from, to] = ((await chart.getAttribute('data-visible-range')) ?? '0,0').split(',').map(Number); return (to - from) / 60 + 1; }).toBeGreaterThan(bars - 40);
      await page.waitForTimeout(800);
      expect(older()).toBe(0);
      // (c) A click on the chart, then an automatic change of the range (a wider chart): no page
      const box = (await chart.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
      await page.setViewportSize({ width: 2000, height: 1000 });
      await page.waitForTimeout(1500);
      expect(older()).toBe(0);
      // A drag to the right (the view moves to the left edge) requests the page
      await dragLeft(page, 30);
      await expect.poll(older).toBe(1);
    });

    test('Ein Fehlschlag pausiert das Laden: keine Anfrage im Dauertakt', { tag: '@ANA-27' }, async ({ page, worker }) => {
      worker.state.ratesAllDays = true;
      const { chart, loaded, failures } = await openNearLeftEdge(page, chartQueries(worker), { url: ALL_URL, initialBars: firstLoad(worker), fail: true });
      await expect.poll(failures).toBe(1);
      // Der Chart steht weiter am linken Rand; ohne Pause käme sofort die nächste Anfrage, auch bei weiterer Bedienung
      await dragLeft(page, 30);
      await page.waitForTimeout(1500);
      expect(failures()).toBe(1);
      await expect(chart).toHaveAttribute('data-bars', String(loaded));
    });
  });
});
