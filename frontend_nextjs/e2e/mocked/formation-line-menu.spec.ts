/**
 * Formasyon-Linien: Kontextmenü auf der Linie (Rechtsklick/Doppelklick) und Tabelle „Formasyon-Linien“ in den Chart-Einstellungen.
 * FRM-47 (Plan 1105-A7, Schritt S2): Stil je Rolle, Einstellung „Linienmenü“ (A7.7), Abbruch macht die Tabelle rückgängig.
 */
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { named, seedFixtureTrend, trendOf } from '../fixtures/formation-trend';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const URL = `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=ABCD`;
const FORMING_NOW = 1761192000;
const bars = named('e2e/fixtures/formation/gar-buy-h4-01.json', parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8')))).bars;

async function openPage(page: Page, worker: MockWorker) {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = bars.filter(b => b.time + 14400 <= FORMING_NOW).map(b => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[FORMING_NOW - 900, last[4], last[4], last[4], last[4]]] };
  await seedFixtureTrend(page, trendOf(bars), true);
  await page.goto(URL);
  await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

/** Klickpunkt auf der Linie: Mitte der unsichtbaren Treffer-Linie in Seitenkoordinaten (der Mittelpunkt des Rahmens liegt bei einer Schräge neben der Linie) */
async function pointOn(page: Page, hit: Locator) {
  const box = (await page.getByTestId('formation-overlay').boundingBox())!;
  const [x1, y1, x2, y2] = await Promise.all(['x1', 'y1', 'x2', 'y2'].map(async a => Number(await hit.getAttribute(a))));
  return { x: box.x + (x1 + x2) / 2, y: box.y + (y1 + y2) / 2 };
}
const hitOf = (page: Page, role: string) => page.getByTestId('formation-overlay').locator(`[data-testid="line-hit"][data-hit-role="${role}"]`).first();
const legs = (page: Page) => page.getByTestId('formation-overlay').locator('line[data-role="zigzag"]');
const menu = (page: Page) => page.getByTestId('line-menu');

async function rightClick(page: Page, role = 'zigzag') {
  const p = await pointOn(page, hitOf(page, role));
  await page.mouse.click(p.x, p.y, { button: 'right' });
}
async function doubleClick(page: Page, role = 'zigzag') {
  const p = await pointOn(page, hitOf(page, role));
  await page.mouse.dblclick(p.x, p.y);
}

/** Speicher vor dem Neuladen sichern und danach nach dem Fixture-Seed wieder einspielen (openPage schreibt bei jedem Laden eine alte Version) */
async function reloadKeepingStorage(page: Page) {
  const saved = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  await page.addInitScript(json => { for (const [k, v] of Object.entries(JSON.parse(json) as Record<string, string>)) localStorage.setItem(k, v); }, saved);
  await page.reload();
  await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

async function openSettings(page: Page, section?: string) {
  await page.getByTestId('workspace-settings').click();
  const dialog = page.getByTestId('chart-workspace-settings');
  if (section) await dialog.getByRole('button', { name: msg(section as never), exact: true }).click();
  return dialog;
}

test('Rechtsklick auf den Zickzack öffnet das Menü: Dicke 3, Typ durchgezogen, Escape schließt, Stil bleibt nach dem Neuladen', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  expect(await legs(page).count()).toBeGreaterThan(1);
  await expect(menu(page)).toHaveCount(0);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  await expect(menu(page)).toHaveAttribute('role', 'menu');
  await menu(page).getByRole('button', { name: msg('lineStyle.width.option', { n: 3 }), exact: true }).click();
  for (const leg of await legs(page).all()) await expect(leg).toHaveAttribute('stroke-width', '3');
  await menu(page).getByRole('button', { name: msg('lineStyle.type.solid'), exact: true }).click();
  for (const leg of await legs(page).all()) await expect(leg).not.toHaveAttribute('stroke-dasharray', /.+/);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await reloadKeepingStorage(page);
  for (const leg of await legs(page).all()) {
    await expect(leg).toHaveAttribute('stroke-width', '3');
    await expect(leg).not.toHaveAttribute('stroke-dasharray', /.+/);
  }
});

test('Doppelklick öffnet dasselbe Menü; „Bu çizgiyi gizle“ blendet die Rolle aus, „Varsayılana dön“ stellt sie wieder her', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await doubleClick(page);
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('button', { name: msg('lineStyle.width.option', { n: 4 }), exact: true }).click();
  await menu(page).getByRole('menuitem', { name: msg('formation.line.reset'), exact: true }).click();
  for (const leg of await legs(page).all()) await expect(leg).toHaveAttribute('stroke-width', '2');
  await menu(page).getByRole('menuitem', { name: msg('formation.line.hide'), exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(legs(page)).toHaveCount(0);
});

test('Ein Klick außerhalb schließt das Menü; auf leerer Fläche bleibt das Browsermenü (kein eigenes Menü)', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(menu(page)).toHaveCount(0);
  const box = (await page.getByTestId('formation-chart').boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + 60, { button: 'right' });
  await expect(menu(page)).toHaveCount(0);
});

test('Einstellung „Linienmenü“: nur Rechtsklick, nur Doppelklick, aus; bleibt nach dem Neuladen', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  const setMode = async (mode: string) => {
    const dialog = await openSettings(page, 'cw.canvas');
    await dialog.getByLabel(msg('cw.lineMenu'), { exact: true }).selectOption(mode);
    await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
  };
  await setMode('right');
  await doubleClick(page);
  await expect(menu(page)).toHaveCount(0);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await setMode('double');
  await rightClick(page);
  await expect(menu(page)).toHaveCount(0);
  await doubleClick(page);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await setMode('off');
  await rightClick(page);
  await expect(menu(page)).toHaveCount(0);
  await doubleClick(page);
  await expect(menu(page)).toHaveCount(0);
  await reloadKeepingStorage(page);
  await rightClick(page);
  await expect(menu(page)).toHaveCount(0);
  const dialog = await openSettings(page, 'cw.canvas');
  await expect(dialog.getByLabel(msg('cw.lineMenu'), { exact: true })).toHaveValue('off');
});

test('Tabelle „Formasyon-Linien“: Änderung wirkt sofort im Chart, Abbrechen macht sie rückgängig, Übernehmen behält sie', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  let dialog = await openSettings(page, 'cw.overlays');
  const row = dialog.locator('[data-testid="line-style-row"][data-role="zigzag"]');
  await expect(dialog.locator('[data-testid="line-style-row"]')).toHaveCount(8);
  await row.getByRole('button', { name: msg('lineStyle.width.option', { n: 4 }), exact: true }).click();
  for (const leg of await legs(page).all()) await expect(leg).toHaveAttribute('stroke-width', '4');
  await dialog.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  for (const leg of await legs(page).all()) await expect(leg).toHaveAttribute('stroke-width', '2');

  dialog = await openSettings(page, 'cw.overlays');
  await dialog.locator('[data-testid="line-style-row"][data-role="zigzag"]').getByRole('button', { name: msg('lineStyle.width.option', { n: 1 }), exact: true }).click();
  await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  for (const leg of await legs(page).all()) await expect(leg).toHaveAttribute('stroke-width', '1');
});

test('„Tüm formasyon çizgileri…“ öffnet die Einstellungen auf der Tabelle', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await menu(page).getByRole('menuitem', { name: msg('formation.line.all'), exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('chart-workspace-settings').locator('[data-testid="line-style-row"]')).toHaveCount(8);
});

test('375 px: Menü und Tabelle laufen nicht über', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openPage(page, worker);
  const chip = page.getByTestId('formation-status-chip');
  if ((await chip.getAttribute('aria-expanded')) === 'true') await chip.press('Enter');
  await expect(page.getByTestId('formation-sidebar')).toHaveCount(0);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  const box = (await menu(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  const dialog = await openSettings(page, 'cw.overlays');
  await expect(dialog.locator('[data-testid="line-style-row"]').first()).toBeVisible();
  const overflow = await dialog.evaluate(el => [...el.querySelectorAll('[data-testid="line-style-row"]')].some(r => r.scrollWidth > r.clientWidth + 1));
  expect(overflow).toBe(false);
});

for (const theme of ['light', 'dark']) {
  test(`Menü im Bild (${theme})`, { tag: '@FRM-47' }, async ({ page, worker }) => {
    await page.addInitScript(value => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
    await openPage(page, worker);
    await rightClick(page);
    await expect(menu(page)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`line-menu-${theme}.png`) });
  });
}
