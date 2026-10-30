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
  const toggle = modal.getByRole('switch', { name: msg('cw.names') });
  await toggle.click();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
  await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await page.getByTestId('workspace-settings').click();
  await modal.getByRole('button', { name: msg('cw.status'), exact: true }).click();
  await modal.getByRole('switch', { name: msg('cw.names') }).click();
  await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
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
  await workspace.getByRole('combobox', { name: msg('cw.tools') }).selectOption('horizontal-line');
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
