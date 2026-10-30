import type { Page } from '@playwright/test';
import { DEMO_ID, LIVE_ID, ZONE_ID, makeZone, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
async function drawLine(page: Page, offset = 60) {
  await page.getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  await page.getByTestId('tool-horizontal-line').click();
  const box = await page.getByTestId('analysis-chart').boundingBox(); if (!box) throw new Error('Chart missing');
  await page.mouse.click(box.x + box.width * .45, box.y + offset);
  await expect(page.getByRole('button', { name: msg('cw.undo'), exact: true })).toBeEnabled();
}
async function storedDrawings(page: Page, shared = false) {
  return page.evaluate(([key, linked]) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    const entries = Object.entries(store.documents ?? {}).filter(([name]) => name.startsWith('@linked:') === linked);
    return entries.flatMap(([, value]) => JSON.parse((value as { drawings: string }).drawings));
  }, [storageKey, shared] as const);
}

test('Gruppen merken das Werkzeug, Favoriten zeigen echte Symbole und bleiben gespeichert', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL);
  await page.getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  await page.getByRole('button', { name: `${msg('cw.favorite')}: ${msg('cw.tool.ray')}`, exact: true }).click();
  await page.getByTestId('tool-ray').click();
  await page.getByRole('button', { name: msg('cw.selection'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.lines'), exact: true }).click();
  const groupButton = page.getByRole('button', { name: msg('cw.rail.lines'), exact: true });
  await expect(groupButton).toHaveAttribute('aria-pressed', 'true');
  await expect(groupButton.locator('[data-tool-icon=ray]')).toBeVisible();
  await page.getByRole('button', { name: msg('cw.rail.favorites'), exact: true }).click();
  await expect(page.getByTestId('drawing-favorites').locator('[data-tool-icon=ray]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: msg('cw.rail.favorites'), exact: true }).click();
  await expect(page.getByTestId('drawing-favorites').locator('[data-tool-icon=ray]')).toBeVisible();
  await expect(page.getByRole('combobox', { name: msg('cw.tools'), exact: true })).toHaveCount(0);
});

test('Messung ist vorübergehend und Bereichszoom kann zurückgesetzt werden', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL);
  const initial = await storedDrawings(page);
  await page.getByRole('button', { name: msg('cw.rail.measure'), exact: true }).click();
  const layer = page.getByTestId('chart-gesture-layer');
  const box = await layer.boundingBox(); if (!box) throw new Error('Gesture layer missing');
  await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 110, { steps: 5 }); await page.mouse.up();
  await expect(page.getByTestId('chart-measurement')).toContainText('%');
  expect(await storedDrawings(page)).toEqual(initial);
  await page.keyboard.press('Escape');
  await expect(layer).toHaveCount(0);
  await page.getByRole('button', { name: msg('cw.rail.zoom'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.zoomArea'), exact: true }).click();
  const zoom = await layer.boundingBox(); if (!zoom) throw new Error('Zoom layer missing');
  await page.mouse.move(zoom.x + 50, zoom.y + 40); await page.mouse.down();
  await page.mouse.move(zoom.x + 180, zoom.y + 120, { steps: 5 }); await page.mouse.up();
  await expect(layer).toHaveCount(0);
  await page.getByRole('button', { name: msg('cw.rail.zoom'), exact: true }).click();
  const reset = page.getByRole('button', { name: msg('cw.rail.zoomReset'), exact: true });
  await expect(reset).toBeEnabled(); await reset.click();
  await page.getByRole('button', { name: msg('cw.rail.zoom'), exact: true }).click();
  await expect(reset).toBeDisabled();
});

test('Magnet merkt Stärke; globale Sperre schützt Bearbeitung und Löschen', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL); await drawLine(page);
  await page.getByRole('button', { name: msg('cw.rail.magnetMenu'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.strong'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.magnet'), exact: true }).click();
  await expect(page.getByRole('button', { name: msg('cw.magnet'), exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: msg('cw.magnet'), exact: true }).click();
  const productKey = await page.getByTestId('chart-workspace').getAttribute('data-context');
  await expect.poll(() => page.evaluate(([key, product]) => JSON.parse(localStorage.getItem(key!) || '{}').documents?.[product!]?.appearance?.magnet, [storageKey, productKey])).toBe('strong');
  await page.getByRole('button', { name: msg('cw.rail.lockAll'), exact: true }).click();
  await page.getByTestId('analysis-chart').focus(); await page.keyboard.press('Delete');
  expect(await storedDrawings(page)).toHaveLength(1);
  await page.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.horizontal-line'), exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('spinbutton', { name: msg('cw.width'), exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: msg('ui.close'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.lockAll'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.trash'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.removeDrawings'), exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(msg('cw.rail.confirmDrawings'));
  await page.getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  await expect.poll(() => storedDrawings(page)).toHaveLength(0);
  await page.getByRole('button', { name: msg('cw.undo'), exact: true }).click();
  await expect.poll(() => storedDrawings(page)).toHaveLength(1);
});

test('Sichtbarkeit und Indikatorlöschung wirken nur auf die eigenen Indikatoren', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL);
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await page.getByRole('button', { name: msg('cw.rail.visibility'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.indicatorsVisibility'), exact: true }).click();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
  await page.getByRole('button', { name: msg('cw.rail.visibility'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.allVisibility'), exact: true }).click();
  await expect(page.getByTestId('workspace-indicator-values')).toContainText('EWO');
  await page.getByRole('button', { name: msg('cw.rail.trash'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.removeIndicators'), exact: true }).click();
  await page.getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
  await page.reload();
  await expect(page.getByTestId('workspace-indicator-values')).not.toContainText('EWO');
});

test('Verknüpfte Ansichten und Tabs teilen Zeichnungen; Trennen stellt privaten Bestand wieder her', { tag: '@ANA-17' }, async ({ page, context, worker }) => {
  test.setTimeout(90_000);
  worker.setZones(DEMO_ID, [makeZone({ symbol: 'EURUSD' })]);
  await page.goto(URL); await drawLine(page);
  await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'linked.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8X8AAAAASUVORK5CYII=', 'base64') });
  await expect.poll(() => storedDrawings(page)).toHaveLength(2);
  const privateBefore = await storedDrawings(page);
  await page.getByRole('button', { name: msg('cw.rail.link'), exact: true }).click();
  await expect.poll(() => storedDrawings(page, true)).toHaveLength(2);
  const second = await context.newPage(); await worker.install(second);
  await second.goto(`/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`);
  await expect(second.getByTestId('drawing-toolbar')).toBeVisible();
  await second.getByRole('button', { name: msg('cw.rail.link'), exact: true }).click();
  await expect(second.getByRole('button', { name: msg('cw.rail.link'), exact: true })).toHaveAttribute('aria-pressed', 'true');
  await drawLine(second, 100);
  await expect.poll(() => storedDrawings(page, true)).toHaveLength(3);
  await second.reload();
  await second.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
  await expect(second.getByRole('dialog').getByRole('button', { name: msg('cw.tool.image'), exact: true })).toBeVisible();
  await second.getByRole('dialog').getByRole('button', { name: msg('ui.close'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.horizontal-line'), exact: true })).toHaveCount(2);
  await page.getByRole('dialog').getByRole('button', { name: msg('ui.close'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.link'), exact: true }).click();
  expect(await storedDrawings(page)).toEqual(privateBefore);
  await page.reload();
  await expect(page.getByRole('button', { name: msg('cw.rail.link'), exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.goto(`/chart?account=${LIVE_ID}&symbol=EURUSD&tf=H1`);
  await expect(page.getByRole('button', { name: msg('cw.rail.link'), exact: true })).toHaveAttribute('aria-pressed', 'false');
  await second.close();
});

for (const width of [1440, 375]) for (const theme of ['light', 'dark']) {
  test(`Werkzeugleiste ${width}px ${theme}: Menüs, Fokus und Vollbild`, { tag: ['@ANA-17', '@UI-07', '@UI-08'] }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width, height: 812 });
    await page.addInitScript(value => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
    await page.goto(URL);
    const rail = page.getByTestId('drawing-toolbar'); await expect(rail).toBeVisible();
    await expect(rail).toHaveCSS('width', '52px');
    const trigger = page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true });
    await trigger.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('tool-gann-fan')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: msg('analysis.chart.fullscreen'), exact: true }).click();
    await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
    await expect(page.getByTestId('tool-fib-retracement')).toBeVisible();
    const bounds = await page.getByTestId('tool-fib-retracement').boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(52);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath(`toolbar-${width}-${theme}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}


test('Einzelne Objektsperren überleben die globale Sperre; ausgewählte Löschung ist rückgängig machbar', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL); await drawLine(page);
  await page.getByRole('button', { name: msg('cw.rail.trash'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.removeSelected'), exact: true }).click();
  await expect.poll(() => storedDrawings(page)).toHaveLength(0);
  await page.getByRole('button', { name: msg('cw.undo'), exact: true }).click();
  await expect.poll(() => storedDrawings(page)).toHaveLength(1);
  await page.getByRole('button', { name: msg('cw.objects'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: msg('cw.tool.horizontal-line'), exact: true }).click();
  await page.getByRole('switch', { name: msg('cw.lock') }).click();
  await page.getByRole('dialog').getByRole('button', { name: msg('ui.close'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.lockAll'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.lockAll'), exact: true }).click();
  await expect.poll(async () => (await storedDrawings(page))[0]?.locked).toBe(true);
  await page.getByRole('button', { name: msg('cw.rail.trash'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.removeDrawings'), exact: true }).click();
  await page.getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  expect(await storedDrawings(page)).toHaveLength(1);
});

test('Mehrere ausgewählte Zeichnungen bleiben bis zur Löschbestätigung vorgemerkt', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  await page.goto(URL);
  await page.getByRole('button', { name: msg('cw.magnet'), exact: true }).click();
  await drawLine(page, 60);
  await drawLine(page, 110);
  await expect.poll(() => storedDrawings(page)).toHaveLength(2);
  await page.getByRole('button', { name: msg('cw.selection'), exact: true }).click();
  const box = await page.getByTestId('analysis-chart').boundingBox();
  if (!box) throw new Error('Chart missing');
  await page.mouse.click(box.x + box.width * .45, box.y + 110);
  await page.keyboard.down('Control');
  await page.mouse.click(box.x + box.width * .45, box.y + 60);
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: msg('cw.rail.trash'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.rail.removeSelected'), exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(msg('cw.rail.confirmSelected'));
  await page.getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  await expect.poll(() => storedDrawings(page)).toHaveLength(0);
  await page.getByRole('button', { name: msg('cw.undo'), exact: true }).click();
  await expect.poll(() => storedDrawings(page)).toHaveLength(2);
});
