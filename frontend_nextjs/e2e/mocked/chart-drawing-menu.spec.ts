/**
 * UI-28 Çizim sağ tık menüsü ve Alt+F (Plan 1110-A4.9, S4): sağ tık bir çizimin üstünde menüyü açar, boş grafikte açmaz;
 * Kilitle sonrası Kaldır kapalı; Klonla ikinci çizim üretir; Kaldır sonrası ⌘Z geri getirir; Ayarlar… Fib penceresini açar; Alt+F aracı seçer.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.setTimeout(90_000);

type Fib = { kind: string; locked?: boolean };
const menu = (page: Page) => page.getByTestId('drawing-context-menu');
async function stored(page: Page) {
  return page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.values(store.documents ?? {}).flatMap(d => JSON.parse((d as { drawings: string }).drawings)) as Fib[];
  }, KEY).then(all => all.filter(d => d.kind === 'fib-retracement'));
}
async function drawFib(page: Page) {
  await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
  await page.getByTestId('tool-fib-retracement').click();
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const bar = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y1 = bar.y + bar.height + 90, y2 = y1 + 160;
  await page.mouse.click(box.x + box.width * .35, y1);
  await page.mouse.move(box.x + box.width * .5, (y1 + y2) / 2);
  await page.mouse.click(box.x + box.width * .6, y2);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  await page.waitForTimeout(800);
  return { x: box.x + box.width * .47, y: (y1 + y2) / 2, empty: { x: box.x + box.width * .9, y: bar.y + bar.height + 30 } };
}
async function rightClick(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(150);
  await page.mouse.click(at.x, at.y, { button: 'right' });
}

test('UI-28: sağ tık menüyü açar; boş grafikte açmaz; Esc kapatır', { tag: '@UI-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await rightClick(page, at.empty);
  await expect(menu(page)).toHaveCount(0);
  await rightClick(page, at);
  await expect(menu(page)).toBeVisible();
  for (const id of ['template', 'order', 'visibility', 'tree', 'clone', 'lock', 'hide', 'remove', 'settings']) await expect(page.getByTestId(`ctx-${id}`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('UI-28: Klonla, Kilitle, Kaldır ve ⌘Z', { tag: '@UI-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await rightClick(page, at);
  await page.getByTestId('ctx-clone').click();
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  // Kilitle: Kaldır kapanır
  await rightClick(page, at);
  await page.getByTestId('ctx-lock').click();
  await expect.poll(async () => (await stored(page)).filter(d => d.locked).length).toBe(1);
  await rightClick(page, at);
  await expect(page.getByTestId('ctx-lock')).toHaveText(msg('ctx.unlock'));
  await expect(page.getByTestId('ctx-remove')).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('UI-28: Kaldır sonra ⌘Z; Ayarlar… pencereyi açar; Alt+F aracı seçer', { tag: '@UI-28' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await rightClick(page, at);
  await page.getByTestId('ctx-remove').click();
  await expect.poll(async () => (await stored(page)).length).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  await rightClick(page, at);
  await page.getByTestId('ctx-settings').click();
  await expect(page.getByTestId('fib-settings')).toBeVisible();
  await page.getByTestId('fib-cancel').click();
  await expect(page.getByTestId('fib-settings')).toHaveCount(0);
  await rightClick(page, at);
  await page.getByTestId('ctx-remove').click();
  await expect.poll(async () => (await stored(page)).length).toBe(0);
  // Alt+F: Fibonacci aracı seçilir (sonraki tık yeni çizim başlatır)
  await page.keyboard.press('Alt+KeyF');
  await expect(page.getByRole('button', { name: msg('cw.rail.fib'), exact: true })).toHaveAttribute('aria-pressed', 'true');
  const box = (await page.getByTestId('analysis-chart').boundingBox())!, bar = (await page.getByTestId('chart-topbar').boundingBox())!, y1 = bar.y + bar.height + 90;
  await page.mouse.click(box.x + box.width * .35, y1);
  await page.mouse.move(box.x + box.width * .5, y1 + 80);
  await page.mouse.click(box.x + box.width * .6, y1 + 160);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
});
