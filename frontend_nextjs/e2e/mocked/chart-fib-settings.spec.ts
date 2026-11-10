/**
 * UI-27 Fibonacci-Einstellungsfenster (Plan 1110-A4, S1): Doppelklick auf die Zeichnung öffnet das Fenster; Stil-Felder
 * ändern die Zeichnung (Vorschau sofort, Tamam speichert, İptal stellt wieder her); Vorlagen speichern, anwenden, löschen;
 * die feste Vorlage „Erweitertes Fib-Set“ setzt alle 24 Plätze; 375 px ohne Überlauf.
 */
import type { Page } from '@playwright/test';
import { presetFibStyle } from '../../src/lib/chart-workspace/fibStyle';
import { openDrawings } from '../fixtures/chart-dialog';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.setTimeout(90_000);

type Level = { coeff: number; color: string; visible: boolean };
type Fib = { kind: string; name?: string; style: { levels?: Level[]; reverse?: boolean; fibTrendLine?: { visible: boolean }; labelFontSize?: number; extendRight?: boolean; fillBackground?: boolean } };
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
const levelBoxes = (page: Page) => dialog(page).getByTestId('fib-level');

test('UI-27: Doppelklick öffnet das Fenster; Stil ändert die Zeichnung, İptal stellt wieder her', { tag: '@UI-27' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await openByDoubleClick(page, at);
  await expect(dialog(page).getByTestId('fib-title')).toHaveText(msg('fib.title'));
  await expect(dialog(page).getByRole('tab')).toHaveText([msg('fib.tab.style')]);
  await expect(levelBoxes(page)).toHaveCount(24);
  // İptal: Änderungen verschwinden, nichts wird gespeichert
  await levelBoxes(page).first().getByRole('checkbox').uncheck();
  await dialog(page).getByLabel(msg('fib.reverse'), { exact: true }).check();
  await dialog(page).getByTestId('fib-cancel').click();
  await expect(dialog(page)).toHaveCount(0);
  let fib = (await stored(page))[0];
  expect(fib.style.reverse ?? false).toBe(false);
  expect(fib.style.levels?.[0]?.visible ?? true).toBe(true);
  // Tamam: Seviye aus und ters çevir werden gespeichert, Umbenennen ebenso
  await openByDoubleClick(page, at);
  await levelBoxes(page).first().getByRole('checkbox').uncheck();
  await dialog(page).getByLabel(msg('fib.reverse'), { exact: true }).check();
  await dialog(page).getByLabel(msg('fib.trendLine'), { exact: true }).uncheck();
  await dialog(page).getByTestId('fib-fontSize').selectOption('16');
  await dialog(page).getByTestId('fib-rename').click();
  await dialog(page).getByTestId('fib-name').fill('Meine Fib');
  await dialog(page).getByTestId('fib-name').press('Enter');
  await expect(dialog(page).getByTestId('fib-title')).toHaveText('Meine Fib');
  await dialog(page).getByTestId('fib-ok').click();
  await expect(dialog(page)).toHaveCount(0);
  fib = (await stored(page))[0];
  expect(fib).toMatchObject({ name: 'Meine Fib', style: { reverse: true, labelFontSize: 16, fibTrendLine: { visible: false } } });
  expect(fib.style.levels?.[0]?.visible).toBe(false);
  // Rückgängig: ein Schritt stellt den Stand vorher wieder her
  await page.getByRole('button', { name: msg('cw.undo'), exact: true }).click();
  await expect.poll(async () => (await stored(page))[0]?.style.reverse ?? false).toBe(false);
});

test('UI-27: die feste Vorlage setzt 24 Plätze; Vorlage speichern, anwenden, überschreiben, löschen; Fabrikwerte', { tag: '@UI-27' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await openByDoubleClick(page, at);
  const menu = () => dialog(page).getByTestId('fib-template-menu');
  await menu().click();
  await expect(page.getByTestId('fib-template-preset')).toContainText(msg('fib.builtin'));
  await page.getByTestId('fib-template-preset').click();
  await dialog(page).getByTestId('fib-ok').click();
  const preset = presetFibStyle();
  const fib = (await stored(page))[0];
  expect(fib.style.levels).toHaveLength(24);
  expect(fib.style.levels!.map(l => [l.coeff, l.color.toLowerCase(), l.visible])).toEqual(preset.levels.map(l => [l.coeff, l.color.toLowerCase(), l.visible]));
  expect(fib.style).toMatchObject({ extendRight: true, fillBackground: false, labelFontSize: 12 });
  // Das Fenster zeigt die Vorlage als angewendet (Haken) und der Menüpunkt „Farklı kaydet“ lehnt den festen Namen ab
  await openByDoubleClick(page, at);
  await menu().click();
  await page.getByTestId('fib-save-as').click();
  const name = page.getByTestId('fib-template-name');
  await name.fill(msg('fib.presetName'));
  await expect(page.getByTestId('fib-save-warning')).toHaveText(msg('fib.reserved'));
  await expect(page.getByTestId('fib-save-confirm')).toBeDisabled();
  await name.fill('Meine');
  await page.getByTestId('fib-save-confirm').click();
  await expect.poll(() => page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || '{}').drawingTemplates?.['fib-retracement'] ?? {}), KEY)).toEqual(['Meine']);
  // Fabrikwerte, dann die gespeicherte Vorlage wieder anwenden
  await menu().click();
  await page.getByTestId('fib-apply-defaults').click();
  await expect(levelBoxes(page).first().locator('input[type=number]')).toHaveValue('0');
  await expect(levelBoxes(page).nth(1).locator('input[type=number]')).toHaveValue('0.236');
  await menu().click();
  await page.getByTestId('fib-template-row').filter({ hasText: 'Meine' }).getByRole('button').first().click();
  await expect(levelBoxes(page).nth(1).locator('input[type=number]')).toHaveValue('0.886');
  // Gleicher Name: Warnung und „Üzerine yaz“
  await menu().click();
  await page.getByTestId('fib-save-as').click();
  await page.getByTestId('fib-template-name').fill('Meine');
  await expect(page.getByTestId('fib-save-warning')).toHaveText(msg('fib.exists', { name: 'Meine' }));
  await expect(page.getByTestId('fib-save-confirm')).toHaveText(msg('fib.overwrite'));
  await page.getByTestId('fib-save-confirm').click();
  // Löschen mit Rückfrage
  await menu().click();
  await page.getByTestId('fib-template-delete').click();
  await page.getByRole('dialog').getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
  await expect.poll(() => page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || '{}').drawingTemplates?.['fib-retracement'] ?? {}), KEY)).toEqual([]);
  await dialog(page).getByTestId('fib-cancel').click();
});

for (const [width, scheme] of [[375, 'dark'], [375, 'light'], [1280, 'dark'], [1280, 'light']] as const) {
  test(`UI-27: Fenster über „Ayarlar…“ ohne Überlauf bei ${width} px (${scheme})`, { tag: '@UI-27' }, async ({ page, worker }) => {
    void worker;
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(URL);
    await drawFib(page);
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    const panel = await openDrawings(page);
    await panel.getByTestId('drawing-objects').getByRole('button', { name: msg('cw.tool.fib-retracement'), exact: true }).click();
    // Fib hat statt des Kommafeldes die Schaltfläche „Ayarlar…“
    await expect(panel.getByLabel(msg('cw.levels'), { exact: true })).toHaveCount(0);
    await panel.getByTestId('fib-open-settings').click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByTestId('fib-template-menu').click();
    await page.getByTestId('fib-template-preset').click();
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await dialog(page).evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    // Die Log-Option ist bei linearer Skala aus
    await expect(dialog(page).getByRole('checkbox', { name: msg('fib.log') })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath(`fib-${width}-${scheme}.png`) });
    await dialog(page).getByTestId('fib-cancel').click();
  });
}
