/**
 * UI-29 (S7b, Plan 1110-A4): Vorlagen der schwebenden Leiste gelten für jede Zeichnungsart, nicht nur für Fibonacci.
 * Eine Trendlinie: Vorlage speichern → auf eine neue Linie anwenden → nach dem Neuladen steht die Liste noch; Fibonacci wie bisher.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.setTimeout(90_000);

type Line = { kind: string; style: { width: number; color: string } };
const bar = (page: Page) => page.getByTestId('drawing-floating-toolbar');
async function lines(page: Page) {
  return page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.values(store.documents ?? {}).flatMap(d => JSON.parse((d as { drawings: string }).drawings)) as Line[];
  }, KEY).then(all => all.filter(d => d.kind === 'trend-line'));
}
async function drawLine(page: Page, yOffset: number) {
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  await page.getByTestId('tool-trend-line').click();
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const top = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y1 = top.y + top.height + yOffset, y2 = y1 + 60, x1 = box.x + box.width * .3, x2 = box.x + box.width * .6;
  await page.mouse.click(x1, y1);
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
  await page.mouse.click(x2, y2);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, x1, y1, x2, y2 };
}
type Drawn = Awaited<ReturnType<typeof drawLine>>;
/** Die Enden der Linie rasten auf Kerzenwerte ein (Magnet), die Linie liegt also nicht genau zwischen den Klickpunkten:
 *  von der Mitte aus nach oben und unten abtasten, bis die Leiste erscheint. */
async function select(page: Page, at: Drawn) {
  const offsets = [0];
  for (let d = 4; d <= 72; d += 4) offsets.push(d, -d);
  await expect(async () => {
    for (const dy of offsets) {
      await page.mouse.move(at.x, at.y + dy);
      await page.mouse.click(at.x, at.y + dy);
      if (await bar(page).isVisible()) return;
    }
    throw new Error('Leiste nicht sichtbar');
  }).toPass({ timeout: 30_000 });
  await expect(bar(page)).toBeVisible();
}
async function ready(page: Page) {
  await page.getByTestId('analysis-chart').waitFor();
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

test('UI-29: Trendlinien-Vorlage speichern, auf neue Linie anwenden, nach dem Neuladen noch da, löschen', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  await ready(page);
  const first = await drawLine(page, 100);
  await expect.poll(async () => (await lines(page)).length).toBe(1);
  await select(page, first);
  await expect(page.getByTestId('fbar-template')).toBeVisible();
  await page.getByTestId('fbar-width').click();
  await page.getByTestId('fbar-width-4').click();
  await expect.poll(async () => (await lines(page))[0]?.style.width).toBe(4);
  await page.getByTestId('fbar-template').click();
  await expect(page.getByTestId('fbar-template-preset')).toHaveCount(0);
  await page.getByTestId('fbar-template-save').click();
  await page.getByTestId('fib-template-name').fill('Kalın');
  await page.getByTestId('fib-save-confirm').click();
  await expect.poll(async () => page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || '{}').drawingTemplates?.['trend-line'] ?? {}), KEY)).toEqual(['Kalın']);
  await page.keyboard.press('Escape');

  const second = await drawLine(page, 260);
  await expect.poll(async () => (await lines(page)).length).toBe(2);
  await select(page, second);
  await page.getByTestId('fbar-template').click();
  await page.getByTestId('fbar-template-user').filter({ hasText: 'Kalın' }).click();
  await expect.poll(async () => (await lines(page)).map(l => l.style.width).sort()).toEqual([4, 4]);

  await page.reload();
  await ready(page);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').drawingTemplates, KEY);
  expect(Object.keys(saved['trend-line'])).toEqual(['Kalın']);
  expect(saved['trend-line']['Kalın'].width).toBe(4);
  expect(saved['trend-line']['Kalın'].points).toBeUndefined();

  await select(page, second);
  await page.getByTestId('fbar-template').click();
  await expect(page.getByTestId('fbar-template-user')).toHaveText('Kalın');
  await page.getByTestId('fbar-template-delete').click();
  await page.getByRole('dialog').getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  await expect.poll(async () => page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || '{}').drawingTemplates?.['trend-line'] ?? {}).length, KEY)).toBe(0);
});

test('UI-29: alte Fibonacci-Vorlagen werden aus dem Speicher unverändert gelesen', { tag: '@UI-29' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.drawingTemplates = { 'fib-retracement': { Alt: { lineStyle: 'dashed', width: 3 } }, 'trend-line': 'kaputt' };
    localStorage.setItem(key, JSON.stringify(store));
  }, KEY);
  await page.reload();
  await page.getByTestId('analysis-chart').waitFor();
  await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
  await page.getByTestId('tool-fib-retracement').click();
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const top = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y1 = top.y + top.height + 90, x1 = box.x + box.width * .35, x2 = box.x + box.width * .6;
  await page.mouse.click(x1, y1);
  await page.mouse.move((x1 + x2) / 2, y1 + 80);
  await page.mouse.click(x2, y1 + 160);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.mouse.move((x1 + x2) / 2 - box.width * .01, y1 + 80);
  await page.waitForTimeout(150);
  await page.mouse.click((x1 + x2) / 2 - box.width * .01, y1 + 80);
  await expect(bar(page)).toBeVisible();
  await page.getByTestId('fbar-template').click();
  await expect(page.getByTestId('fbar-template-preset')).toBeVisible();
  await expect(page.getByTestId('fbar-template-user')).toHaveText('Alt');
  await expect(page.getByTestId('fbar-template-defaults')).toBeVisible();
});
