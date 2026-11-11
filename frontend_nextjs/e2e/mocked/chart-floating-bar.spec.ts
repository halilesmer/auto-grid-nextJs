/**
 * UI-29 Schwebende Leiste der gewählten Zeichnung (Plan 1110-A4.13, S7): erscheint oben in der Mitte, Esc schließt;
 * Farbe gilt für alle Fibonacci-Level; Sperre schaltet Farbe/Löschen ab, „…“ öffnet das Rechtsklick-Menü ohne Alarm;
 * Löschen ist ein Rückgängig-Schritt; der gezogene Platz bleibt nach dem Neuladen; bei 375 px unten ohne Griff und ohne Überlauf.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.setTimeout(90_000);

type Fib = { kind: string; locked?: boolean; style: { levels: { color: string }[] } };
const bar = (page: Page) => page.getByTestId('drawing-floating-toolbar');
async function stored(page: Page) {
  return page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.values(store.documents ?? {}).flatMap(d => JSON.parse((d as { drawings: string }).drawings)) as Fib[];
  }, KEY).then(all => all.filter(d => d.kind === 'fib-retracement'));
}
async function drawFib(page: Page, phone = false) {
  await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
  await page.getByTestId('tool-fib-retracement').click();
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const top = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y1 = phone ? 240 : top.y + top.height + 90, y2 = y1 + (phone ? 90 : 160);
  const x1 = phone ? 110 : box.x + box.width * .35, x2 = phone ? 240 : box.x + box.width * .6;
  await page.mouse.click(x1, y1);
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
  await page.mouse.click(x2, y2);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  await page.waitForTimeout(800);
  return { x: (x1 + x2) / 2 - (phone ? 0 : box.width * .01), y: (y1 + y2) / 2, empty: { x: box.x + box.width * .9, y: top.y + top.height + 30 } };
}
async function select(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(150);
  await page.mouse.click(at.x, at.y);
}

test('UI-29: Leiste oben in der Mitte, Knöpfe der Fibonacci-Zeichnung, Esc schließt', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await select(page, at);
  await expect(bar(page)).toBeVisible();
  for (const id of ['handle', 'template', 'color', 'width', 'settings', 'lock', 'remove', 'more']) await expect(page.getByTestId(`fbar-${id}`)).toBeVisible();
  for (const id of ['style', 'fill', 'size']) await expect(page.getByTestId(`fbar-${id}`)).toHaveCount(0);
  const chart = (await page.getByTestId('analysis-chart').boundingBox())!, b = (await bar(page).boundingBox())!;
  expect(Math.abs(b.y - chart.y)).toBeLessThan(120);
  expect(b.x).toBeGreaterThan(chart.x);
  expect(b.x + b.width).toBeLessThan(chart.x + chart.width);
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
});

test('UI-29: Farbe gilt für alle Level; Löschen ist ein Schritt und ⌘Z bringt die Zeichnung zurück; Ayarlar öffnet das Fenster', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await select(page, at);
  await page.getByTestId('fbar-color').click();
  await page.getByTestId('fbar-swatch').nth(5).click();
  await expect.poll(async () => { const [d] = await stored(page); return new Set(d.style.levels.map(l => l.color.slice(0, 7))).size; }).toBe(1);
  await page.getByTestId('fbar-settings').click();
  await expect(page.getByTestId('fib-settings')).toBeVisible();
  await page.getByTestId('fib-cancel').click();
  await expect(page.getByTestId('fib-settings')).toHaveCount(0);
  await select(page, at);
  await page.getByTestId('fbar-remove').click();
  await expect.poll(async () => (await stored(page)).length).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await stored(page)).length).toBe(1);
});

test('UI-29: Sperre schaltet Farbe und Löschen ab; „…“ öffnet das Menü ohne Alarm', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await select(page, at);
  await page.getByTestId('fbar-lock').click();
  await expect.poll(async () => (await stored(page)).filter(d => d.locked).length).toBe(1);
  for (const id of ['template', 'color', 'width', 'remove']) await expect(page.getByTestId(`fbar-${id}`)).toBeDisabled();
  for (const id of ['settings', 'lock', 'more']) await expect(page.getByTestId(`fbar-${id}`)).toBeEnabled();
  await page.getByTestId('fbar-more').click();
  await expect(page.getByTestId('drawing-context-menu')).toBeVisible();
  await expect(page.getByTestId('ctx-remove')).toBeDisabled();
  await expect(page.getByTestId('drawing-context-menu').getByText(/alarm/i)).toHaveCount(0);
});

test('UI-29: gezogener Platz bleibt nach dem Neuladen, Doppelklick stellt den ersten Platz wieder her', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await select(page, at);
  const first = (await bar(page).boundingBox())!, handle = (await page.getByTestId('fbar-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 200, handle.y + handle.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  const moved = (await bar(page).boundingBox())!;
  expect(moved.y - first.y).toBeGreaterThan(80);
  expect(first.x - moved.x).toBeGreaterThan(120);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').floatingBar, KEY)).toBeTruthy();
  await page.reload();
  await page.waitForTimeout(1500);
  await select(page, at);
  await expect(bar(page)).toBeVisible();
  const again = (await bar(page).boundingBox())!;
  expect(Math.abs(again.x - moved.x)).toBeLessThan(4);
  expect(Math.abs(again.y - moved.y)).toBeLessThan(4);
  await page.getByTestId('fbar-handle').dblclick();
  await expect.poll(async () => Math.abs((await bar(page).boundingBox())!.y - first.y)).toBeLessThan(4);
});

test('UI-29: bei 375 px unten ohne Griff und ohne seitliches Scrollen', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(URL);
  const at = await drawFib(page, true);
  await select(page, at);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toHaveAttribute('data-phone', 'true');
  await expect(page.getByTestId('fbar-handle')).toHaveCount(0);
  const chart = (await page.getByTestId('analysis-chart').boundingBox())!, b = (await bar(page).boundingBox())!;
  expect(b.y).toBeGreaterThan(chart.y + chart.height / 2);
  expect(b.x + b.width).toBeLessThanOrEqual(375 + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
