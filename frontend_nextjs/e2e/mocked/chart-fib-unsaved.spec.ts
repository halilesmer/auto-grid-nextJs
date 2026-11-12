/**
 * UI-27 Fibonacci-Fenster (TradingView-Abgleich, 1112): Rückfrage beim Schließen mit ungespeicherten Änderungen,
 * Farbpanel (Palette, eigene Farben, Deckkraft) und Level in einer Zeile.
 */
import type { Page } from '@playwright/test';
import { openDrawings } from '../fixtures/chart-dialog';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.setTimeout(90_000);

type Level = { coeff: number; color: string; visible: boolean };
type Fib = { kind: string; style: { levels?: Level[]; reverse?: boolean; fibTrendLine?: { color: string } } };
const dialog = (page: Page) => page.getByTestId('fib-settings');

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
  return { x: box.x + box.width * .47, y: (y1 + y2) / 2 };
}
async function openByDoubleClick(page: Page, at: { x: number; y: number }) {
  await page.waitForTimeout(800); // wie lange ein Doppelklick nach dem Setzen zählt (TOOL_GRACE_MS)
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(150);
  await page.mouse.dblclick(at.x, at.y);
  await expect(dialog(page)).toBeVisible();
}

test('UI-27: Schließen mit ungespeicherten Änderungen fragt nach (Speichern, Nicht speichern, Bleiben)', { tag: '@UI-27' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  const d = dialog(page);
  const ask = page.getByRole('heading', { name: msg('fib.unsaved.title') });
  // ohne Änderung: X schließt sofort
  await openByDoubleClick(page, at);
  await d.getByTestId('fib-close').click();
  await expect(d).toHaveCount(0);
  await expect(ask).toHaveCount(0);
  // Änderung + Esc: Rückfrage; „Im Fenster bleiben“ lässt alles stehen
  await openByDoubleClick(page, at);
  await d.getByLabel(msg('fib.reverse'), { exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(ask).toBeVisible();
  await page.getByRole('button', { name: msg('fib.unsaved.stay'), exact: true }).click();
  await expect(ask).toHaveCount(0);
  await expect(d.getByLabel(msg('fib.reverse'), { exact: true })).toBeChecked();
  // „Nicht speichern“: Fenster zu, nichts gespeichert
  await d.getByTestId('fib-close').click();
  await page.getByRole('button', { name: msg('fib.unsaved.discard'), exact: true }).click();
  await expect(d).toHaveCount(0);
  expect((await stored(page))[0].style.reverse ?? false).toBe(false);
  // „Speichern“: wie Tamam
  await openByDoubleClick(page, at);
  await d.getByLabel(msg('fib.reverse'), { exact: true }).check();
  await d.getByTestId('fib-close').click();
  await page.getByRole('button', { name: msg('fib.unsaved.save'), exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect.poll(async () => (await stored(page))[0].style.reverse).toBe(true);
  // İptal fragt nicht: es ist ausdrücklich „verwerfen“
  await openByDoubleClick(page, at);
  await d.getByLabel(msg('fib.reverse'), { exact: true }).uncheck();
  await d.getByTestId('fib-cancel').click();
  await expect(d).toHaveCount(0);
  await expect(ask).toHaveCount(0);
});

test('UI-27: Farbpanel wie TradingView: Palette, eigene Farbe (bleibt), Deckkraft bleibt beim Farbwechsel', { tag: '@UI-27' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await openByDoubleClick(page, at);
  const d = dialog(page);
  await d.getByTestId('fib-trend-color').click();
  const panel = d.getByTestId('color-palette');
  await expect(panel.getByTestId('palette-swatch')).toHaveCount(80);
  await d.getByLabel(msg('fib.trendAlpha'), { exact: true }).fill('50');
  await panel.locator('[data-color="#2962ff"]').click();
  await expect(panel.locator('[data-color="#2962ff"]')).toHaveAttribute('aria-pressed', 'true');
  // eigene Farbe: wird angewendet und neben „+“ angehängt
  await panel.getByTestId('palette-custom').fill('#123456');
  await expect(panel.locator('[data-color="#123456"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await d.getByTestId('fib-ok').click();
  await expect.poll(async () => (await stored(page))[0].style.fibTrendLine?.color).toBe('#12345680');
  // nach dem Neuladen steht die eigene Farbe noch im Panel (jeder Farbknopf)
  await page.reload();
  await openByDoubleClick(page, at);
  await d.getByRole('button', { name: `${msg('fib.levelColor')} 0`, exact: true }).click();
  await expect(d.getByTestId('color-palette').locator('[data-color="#123456"]')).toHaveCount(1);
});

for (const width of [1280, 375]) {
  test(`UI-27: Level in einer Zeile, Zahl im Feld nicht abgeschnitten bei ${width} px`, { tag: '@UI-27' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(URL);
    await drawFib(page);
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    const panel = await openDrawings(page);
    await panel.getByTestId('drawing-objects').getByRole('button', { name: msg('cw.tool.fib-retracement'), exact: true }).click();
    await panel.getByTestId('fib-open-settings').click();
    const row = dialog(page).getByTestId('fib-level').first();
    await expect(row).toBeVisible();
    // Haken · Koeffizient · Farbe in einer Zeile (kein Umbruch)
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(40);
    // die Zahl passt ins Feld (keine Pfeile im Ruhezustand)
    const fits = await row.getByLabel(msg('fib.coeff'), { exact: true }).evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // auch der Inhalt des Fensters läuft nicht seitlich über
    expect(await dialog(page).getByRole('tabpanel').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
}
