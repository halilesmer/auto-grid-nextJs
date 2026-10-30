import type { Page } from '@playwright/test';
import { DEMO_ID, LIVE_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test('Freier Chart lädt Broker-Symbol ohne Setup und stellt URL wieder her', { tag: '@ANA-16' }, async ({ page, worker }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
  await expect(page.getByTestId('free-chart-panel')).toBeVisible();
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect(page.getByTestId('zone-select')).toHaveCount(0);
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  expect(worker.calls.filter(c => c.path === `/api/settings/${DEMO_ID}`)).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('chart-workspace')).toHaveAttribute('data-context', /EURUSD/);
  expect(errors).toEqual([]);
});

test('Chart-Vorschau: Abbrechen, Anwenden und Neuladen', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
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
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
});

test('Bestehendes Chart-Dokument übernimmt die bisherige Darstellung', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
  const chart = page.getByTestId('chart-workspace');
  await expect(chart).toBeVisible();
  const key = await chart.getAttribute('data-context');
  await expect.poll(() => page.evaluate(contextKey => {
    const saved = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}');
    return saved.documents?.[contextKey!]?.appearance ?? null;
  }, key)).not.toBeNull();
  // Vor dem App-Code schreiben: Die laufende Seite speichert den Ausschnitt verzögert und würde Altdaten überschreiben.
  await page.addInitScript(contextKey => {
    const saved = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1')!);
    delete saved.documents[contextKey!].appearance;
    saved.appearance.background = '#123456';
    localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify(saved));
  }, key);
  await page.reload();
  await expect.poll(() => page.evaluate(contextKey => {
    const saved = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}');
    return saved.documents?.[contextKey!]?.appearance?.background;
  }, key)).toBe('#123456');
});

test('Vorlagenmenü speichert eine Vorlage, setzt zurück und lädt sie wieder', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
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

test('Zurückgesetzte Darstellung und Ansicht bleiben je Symbol gespeichert', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  const url = (symbol: string) => `/chart?account=${DEMO_ID}&symbol=${symbol}&tf=H1&range=7d`;
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
  await expect.poll(async () => (await readDocument(eurKey!))?.appearance?.background).toBe('');

  const beforeZoom = await page.getByTestId('analysis-chart').getAttribute('data-visible-range');
  await eurChart.getByRole('button', { name: '+', exact: true }).click();
  await expect.poll(() => page.getByTestId('analysis-chart').getAttribute('data-visible-range')).not.toBe(beforeZoom);
  const zoomedRange = await page.getByTestId('analysis-chart').getAttribute('data-visible-range');
  await eurChart.getByRole('button', { name: msg('cw.fit'), exact: true }).click();
  await expect.poll(() => page.getByTestId('analysis-chart').getAttribute('data-visible-range')).not.toBe(zoomedRange);
  const eurRange = await page.getByTestId('analysis-chart').getAttribute('data-visible-range');
  expect(eurRange).toBeTruthy();
  await expect.poll(async () => {
    const viewport = (await readDocument(eurKey!))?.viewport;
    return viewport ? `${viewport.from},${viewport.to}` : null;
  }).toBe(eurRange);

  await page.goto(url('XAUUSD'));
  const goldChart = page.getByTestId('chart-workspace');
  await expect(goldChart).toBeVisible();
  const goldKey = await goldChart.getAttribute('data-context');
  expect(goldKey).not.toBe(eurKey);
  await expect.poll(async () => (await readDocument(goldKey!))?.appearance?.background).toBe('');

  await page.goto(url('EURUSD'));
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect.poll(() => page.getByTestId('analysis-chart').getAttribute('data-visible-range')).toBe(eurRange);
  expect((await readDocument(eurKey!)).appearance.background).toBe('');
  await page.reload();
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect.poll(() => page.getByTestId('analysis-chart').getAttribute('data-visible-range')).toBe(eurRange);
});

test('Indikatorinstanzen und Parameter bleiben je Symbol getrennt', { tag: '@ANA-18' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.getByRole('button', { name: '+ SMA', exact: true }).click();
  await page.locator('[data-indicator="RSI"]').getByRole('spinbutton', { name: msg('cw.period'), exact: true }).fill('10');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('SMA');
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await expect(page.locator('[data-indicator="RSI"]').getByRole('spinbutton', { name: msg('cw.period'), exact: true })).toHaveValue('10');
  await page.goto(`/chart?account=${LIVE_ID}&symbol=USOUSD&tf=H1&range=7d`);
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
    let bottom = -1;
    for (const c of canvases.filter(c => c.getBoundingClientRect().top === rows[1])) {
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

test('Zeichnen, Rückgängig, Wiederholen, Bearbeiten und Neuladen', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
  const workspace = page.getByTestId('chart-workspace');
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toBeVisible();
  await workspace.getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  await page.getByTestId('tool-horizontal-line').click();
  const box = await chart.boundingBox(); if (!box) throw new Error('Chart missing');
  await page.mouse.click(box.x + box.width * .45, box.y + 60);
  const undo = workspace.getByRole('button', { name: msg('cw.undo'), exact: true });
  await expect(undo).toBeEnabled();
  await chart.focus(); await chart.press('ControlOrMeta+z');
  await expect(workspace.getByRole('button', { name: msg('cw.redo'), exact: true })).toBeEnabled();
  await chart.press('ControlOrMeta+Shift+z');
  await expect(undo).toBeEnabled();
  await undo.click();
  const redo = workspace.getByRole('button', { name: msg('cw.redo'), exact: true });
  await expect(redo).toBeEnabled(); await redo.click();
  await workspace.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
  const object = page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.horizontal-line'), exact: true });
  await object.click();
  await page.getByRole('dialog').getByRole('spinbutton', { name: msg('cw.width'), exact: true }).fill('3');
  await expect(page.getByRole('dialog').getByRole('spinbutton', { name: msg('cw.width'), exact: true })).toHaveValue('3');
  await page.keyboard.press('Escape');
  const drawings = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents).map(d => (d as { drawings: string }).drawings));
  await page.getByRole('radio', { name: 'H4', exact: true }).click();
  await expect(page).toHaveURL(/tf=H4/);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents).map(d => (d as { drawings: string }).drawings))).toEqual(drawings);
  await page.reload();
  await workspace.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
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
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('chart-workspace');
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
  await page.goto(`/chart?account=${DEMO_ID}`);
  await page.getByRole('combobox', { name: msg('cw.symbol') }).fill('Gold');
  await page.getByRole('option').filter({ hasText: 'Gold.m' }).click();
  await expect(page.getByTestId('chart-workspace')).toHaveAttribute('data-context', /Gold\.m/);
  expect(worker.calls.filter(c => c.path === `/api/market/${DEMO_ID}/rates`).every(c => c.query.get('symbol') === 'Gold.m')).toBe(true);
  worker.overrides.set(`GET /api/symbols/${LIVE_ID}`, { status: 200, body: { status: 'success', account_id: LIVE_ID, symbols: worker.state.symbols.filter(s => s.name === 'EURUSD') } });
  await page.goto(`/chart?account=${LIVE_ID}&symbol=Gold.m`);
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

test('Anzeige-Schalter speichern erst beim Anwenden, auch nach hartem Neuladen', { tag: '@ANA-19' }, async ({ page, worker }) => {
  void worker;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1`);
  const chart = page.getByTestId('analysis-chart');
  await page.getByTestId('workspace-settings').click();
  await page.getByTestId('chart-workspace-settings').getByRole('button', { name: msg('cw.overlays'), exact: true }).click();
  await page.getByRole('dialog').getByRole('switch', { name: msg('analysis.settings.gaps') }).click();
  await expect(chart).toHaveAttribute('data-gaps-shown', 'false');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-analysis-prefs') || '{}').state.showGaps)).toBe(true);
  await page.reload();
  await expect(chart).toHaveAttribute('data-gaps-shown', 'true');
  await page.getByTestId('workspace-settings').click();
  await page.getByTestId('chart-workspace-settings').getByRole('button', { name: msg('cw.overlays'), exact: true }).click();
  await page.getByRole('dialog').getByRole('switch', { name: msg('analysis.settings.gaps') }).click();
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await page.reload();
  await expect(chart).toHaveAttribute('data-gaps-shown', 'false');
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
  await workspace.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
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
  await workspace.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.image'), exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

const CHART_URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
type StoredIndicator = { id: string; kind: string; paneId: string; paneCollapsed: boolean; visible: boolean; scaleSide: string; maxTimeframe: number };
type StoredAlarm = { armed: boolean; value: number };

async function openOscillatorChart(page: Page) {
  await page.goto(CHART_URL);
  const controls = page.getByTestId('oscillator-controls');
  await expect(controls).toBeVisible();
  const context = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
  return { controls, context };
}
const storedDocument = (page: Page, key: string) => page.evaluate(k => {
  const state = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}');
  return state.documents[k] as { indicators: StoredIndicator[]; alarms: StoredAlarm[] };
}, key);
/** Height of each chart pane in pixels, price pane first. Lightweight Charts draws one table row per pane. */
const paneHeights = (page: Page) => page.getByTestId('chart-workspace').locator('table').first().evaluate(table =>
  [...table.querySelectorAll('tr')].filter(row => row.querySelector('canvas') && row.children.length === 3).map(row => Math.round(row.getBoundingClientRect().height)).slice(0, -1));
const rsiValue = async (page: Page) => Number((await page.locator('[data-indicator-value="RSI"]').innerText()).replace(/^.*\)\s*/, '').replace(',', '.'));

test('Bereiche lassen sich verschieben, einklappen, vergrößern und entfernen; nur das Vergrößern ist vorübergehend', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
  test.slow();
  void worker;
  await page.setViewportSize({ width: 375, height: 812 });
  const { controls, context } = await openOscillatorChart(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect.poll(async () => (await paneHeights(page)).length).toBe(3);

  await controls.getByRole('button', { name: msg('cw.paneDown', { indicator: 'RSI' }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.map(item => item.kind)).toEqual(['EWO', 'RSI']);
  await expect(controls.getByRole('button', { name: msg('cw.paneDown', { indicator: 'RSI' }) })).toBeDisabled();

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
  await expect(values).not.toContainText('RSI');
  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorShow', { indicator: 'RSI' }) }).click();
  await expect(values).toContainText('RSI');

  await menu('RSI');
  await page.getByRole('button', { name: msg('cw.indicatorSettings') }).click();
  await page.locator('[data-indicator="RSI"]').getByRole('spinbutton', { name: msg('cw.maxTimeframe') }).fill('3600');
  await page.keyboard.press('Escape');
  await expect(values).toContainText('RSI');
  await page.getByRole('radio', { name: 'H4', exact: true }).click();
  await expect(values).toContainText('EWO');
  await expect(values).not.toContainText('RSI');
  await page.getByRole('radio', { name: 'H1', exact: true }).click();
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
  await controls.getByRole('button', { name: `+ ${msg('cw.addIndicator')}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(msg('cw.favoriteIndicators'));
  await dialog.getByRole('button', { name: 'RSI', exact: true }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.filter(item => item.kind === 'RSI').length).toBe(3);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: msg('cw.objects') }).click();
  const objects = page.getByTestId('object-indicators');
  await expect(objects).toContainText('RSI 3');
  await expect(objects).toContainText('EWO');
  await objects.getByRole('button', { name: `+ ${msg('cw.addIndicator')}` }).click();
  await expect(page.getByTestId('indicator-instances')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(controls.getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'RSI 3' }) })).toBeVisible();
  await menu('RSI 1');
  await expect(page.getByRole('button', { name: msg('cw.indicatorUnfavorite') })).toBeVisible();
});

test('Alarm: ein Zeitrahmenwechsel ist kein Übertritt, ein Live-Kurs löst ihn einmal aus', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
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
  await page.getByRole('radio', { name: 'H4', exact: true }).click();
  await expect.poll(() => rsiValue(page)).toBeGreaterThan(55);
  await expect(toasts).toHaveCount(0);
  expect((await storedDocument(page, context)).alarms[0].armed).toBe(true);

  // Ohne feste Reihe liefert der Mock eine laufende Kerze, in die Live-Preise einfließen. Am Wochenende (Brokerzeit,
  // also ab Freitag 21:00 UTC) gäbe es sie ohne ratesAllDays nicht.
  worker.state.ratesSeries = null;
  worker.state.ratesAllDays = true;
  await page.goto(`/chart?account=${DEMO_ID}&symbol=USOUSD&tf=H1&range=7d`);
  await page.goto(CHART_URL);
  await expect(page.getByTestId('chart-workspace')).toHaveAttribute('data-context', context);
  await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
  await expect.poll(() => rsiValue(page).then(Number.isFinite)).toBe(true);
  const push = (price: number) => worker.pushMetrics({ account_id: DEMO_ID, symbol: 'EURUSD', price, market_open: true });
  await expect.poll(async () => { push(80); return rsiValue(page); }).toBeLessThan(55);
  expect((await storedDocument(page, context)).alarms[0].armed).toBe(true);
  await expect.poll(async () => { push(115); return rsiValue(page); }).toBeGreaterThan(55);
  await expect(toasts).toHaveCount(1);
  await expect.poll(async () => (await storedDocument(page, context)).alarms[0].armed).toBe(false);

  // Einmalig: erneutes Über- und Unterschreiten meldet nichts mehr, der Alarm bleibt gespeichert.
  push(80); await expect.poll(() => rsiValue(page)).toBeLessThan(55);
  push(115); await expect.poll(() => rsiValue(page)).toBeGreaterThan(55);
  await expect(toasts).toHaveCount(1);
  await page.reload();
  await expect.poll(async () => (await storedDocument(page, context)).alarms).toHaveLength(1);
});

test('Bereichseinstellungen und Alarme bleiben im Chart-Kontext; alte Dokumente laden unverändert', { tag: ['@ANA-20', '@UI-07'] }, async ({ page, worker }) => {
  test.slow();
  void worker;
  const { controls, context } = await openOscillatorChart(page);
  await controls.getByRole('button', { name: msg('cw.paneCollapse', { indicator: 'RSI' }) }).click();
  await expect.poll(async () => (await storedDocument(page, context)).indicators.find(item => item.kind === 'RSI')?.paneCollapsed).toBe(true);

  await page.goto(`/chart?account=${LIVE_ID}&symbol=USOUSD&tf=H1&range=7d`);
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
