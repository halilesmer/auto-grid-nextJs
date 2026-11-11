/**
 * UI-11 / ANA-20: oscillator panes behave like TradingView (plan 1105-A6, PR 2).
 * System panes (RSI(7), Wave 5/35) and user panes share one model: eye keeps the pane, every oscillator pane is 0.4 times
 * as high as the price pane (two fifths, 1 : 2.5), pane buttons are ordered up, down, delete, collapse, maximize.
 */
import type { Page } from '@playwright/test';
import { enableWaveLayer } from '../fixtures/layers';
import { DEMO_ID, expect, test } from '../fixtures/test';

const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const group = (page: Page) => page.locator('[data-oscillator-pane]');
/** Height of each chart pane in px, price pane first (lightweight-charts draws one table row per pane). */
const heights = (page: Page) => page.getByTestId('chart-workspace').locator('table').first().evaluate(table =>
  [...table.querySelectorAll('tr')].filter(row => row.querySelector('canvas') && row.children.length === 3).map(row => row.getBoundingClientRect().height).slice(0, -1));

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(FREE);
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  await enableWaveLayer(page);
  await expect.poll(async () => group(page).count()).toBeGreaterThanOrEqual(3);
}
/** Deletes the first pane until `left` panes remain. */
async function keep(page: Page, left: number) {
  while (await group(page).count() > left) {
    const before = await group(page).count();
    await group(page).first().hover();
    await group(page).first().locator('[data-pane-action="remove"]').click();
    await expect.poll(() => group(page).count()).toBe(before - 1);
  }
}

test('Jeder Oszillator-Bereich ist 0,4 mal so hoch wie der Kursbereich (1 und 2 Oszillatoren)', { tag: ['@UI-11', '@ANA-20'] }, async ({ page, worker }) => {
  void worker;
  await open(page);
  for (const count of [2, 1]) {
    await keep(page, count);
    await expect.poll(async () => (await heights(page)).length).toBe(count + 1);
    await page.waitForTimeout(300);
    const h = await heights(page);
    for (const item of h.slice(1)) expect(Math.abs(h[0] - 2.5 * item)).toBeLessThanOrEqual(3);
  }
});

test('Auge: der Bereich bleibt an seinem Platz und in gleicher Höhe, die Zeile ist grau ohne Wert', { tag: ['@UI-11', '@ANA-20'] }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const before = await heights(page), count = await group(page).count();
  for (const row of [page.locator('[data-system-row="rsi"]'), page.locator('[data-indicator-row="EWO"]')]) {
    await row.hover();
    await row.getByRole('button', { name: /./ }).first().click();
    await expect(row).toHaveAttribute('data-visible', 'false');
    await expect(row).toHaveCount(1);
  }
  await page.mouse.move(0, 0);
  const after = await heights(page);
  expect(after.length).toBe(before.length);
  after.forEach((item, i) => expect(Math.abs(item - before[i])).toBeLessThanOrEqual(1));
  expect(await group(page).count()).toBe(count);
  // A hidden row is not struck through, shows no value and does not move to the price pane
  const rsi = page.locator('[data-system-row="rsi"]');
  await expect(rsi.locator('svg.lucide-eye-off')).toHaveCount(1);
  await expect(rsi).not.toHaveClass(/line-through/);
  expect(await rsi.locator('.line-through').count()).toBe(0);
  const box = await rsi.boundingBox(), priceBottom = (await page.getByTestId('chart-workspace').locator('table').first().locator('tr').first().boundingBox())!.height;
  expect(box!.y).toBeGreaterThan((await page.getByTestId('chart-workspace').boundingBox())!.y + priceBottom - 1);
  // Pane buttons keep working for a hidden pane
  await group(page).first().hover();
  await group(page).first().locator('[data-pane-action="collapse"]').click();
  await expect.poll(async () => (await heights(page))[1]).toBeLessThanOrEqual(34);
});

test('Bereichsknöpfe: Reihenfolge hoch, runter, löschen, einklappen, vergrößern; unmögliche Verschiebung fehlt', { tag: ['@UI-11', '@ANA-20'] }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const total = await group(page).count();
  for (let i = 0; i < total; i++) {
    const actions = await group(page).nth(i).locator('[data-pane-action]').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-pane-action')));
    const expected = ['up', 'down', 'remove', 'collapse', 'maximize'].filter(action => !(action === 'up' && i === 0) && !(action === 'down' && i === total - 1));
    expect(actions).toEqual(expected);
  }
  // The delete button is a trash can, also in the legend row
  await expect(group(page).first().locator('[data-pane-action="remove"] svg.lucide-trash-2')).toHaveCount(1);
  await expect(page.locator('[data-system-row="rsi"] svg.lucide-trash-2')).toHaveCount(1);
});

test('Bereichsknöpfe: Gruppe ganz rechts am Bereich, Kacheln 34 px hoch wie in TradingView', { tag: ['@UI-11'] }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const chart = (await page.getByTestId('chart-workspace').boundingBox())!;
  const total = await group(page).count();
  for (let i = 0; i < total; i++) {
    const box = (await group(page).nth(i).boundingBox())!;
    // Rechte Kante der Gruppe liegt im rechten Teil des Charts, nicht in der Zeile links
    expect(box.x + box.width).toBeGreaterThan(chart.x + chart.width * 0.6);
    expect(box.x + box.width).toBeLessThanOrEqual(chart.x + chart.width);
    const tile = (await group(page).nth(i).locator('[data-pane-action="remove"]').boundingBox())!;
    expect(Math.round(tile.height)).toBe(34);
  }
});

test('Vergrößern: die anderen Bereiche haben keine Höhe mehr', { tag: ['@UI-11', '@ANA-20'] }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await group(page).nth(1).hover();
  await group(page).nth(1).locator('[data-pane-action="maximize"]').click();
  await expect.poll(async () => {
    const h = await heights(page);
    return h.filter((_, i) => i !== 2).every(item => item <= 1);
  }).toBe(true);
  expect((await heights(page))[2]).toBeGreaterThan(300);
});
