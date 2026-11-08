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

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=ABCD`;
const FORMING_NOW = 1761192000;
const bars = named('e2e/fixtures/formation/gar-buy-h4-01.json', parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8')))).bars;

async function openPage(page: Page, worker: MockWorker) {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = bars.filter(b => b.time + 14400 <= FORMING_NOW).map(b => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[FORMING_NOW - 900, last[4], last[4], last[4], last[4]]] };
  await seedFixtureTrend(page, trendOf(bars), true);
  // The open card (from lg) lies over the right edge, where the formation is drawn: these tests click the drawing, so the card starts closed (open point of U4-4b)
  await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' })));
  await page.goto(URL);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

/**
 * Klickpunkt auf der Linie: ein Punkt der unsichtbaren Treffer-Linie in Seitenkoordinaten, an dem sie obenauf liegt (elementFromPoint).
 * Auf dem einen Chart (1107-A21) zeigt der Chart alle Kerzen, die Linien der Formation liegen eng beieinander; die Mitte der Linie kann unter einer anderen Rolle liegen.
 */
async function pointOn(page: Page, hit: Locator) {
  const p = await hit.evaluate((el) => {
    const line = el as unknown as SVGLineElement, matrix = line.getScreenCTM()!;
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(line.getAttribute(a)));
    let fallback: { x: number; y: number } | null = null;
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
      const point = new DOMPoint(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t).matrixTransform(matrix);
      fallback ??= { x: point.x, y: point.y };
      if (document.elementFromPoint(point.x, point.y) === el) return { x: point.x, y: point.y };
    }
    return fallback!;
  });
  return p;
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
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
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
  await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 3 }), exact: true }).click();
  for (const leg of await legs(page).all()) await expect(leg).toHaveAttribute('stroke-width', '3');
  await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.type.solid'), exact: true }).click();
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
  await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 4 }), exact: true }).click();
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
  await expect(page.getByTestId('chart-card-tab-conditions')).toHaveCount(0);
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
    // Echte Prüfung: der Menühintergrund ist die Popover-Farbe des gewählten Themes
    const popover = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--popover)';
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    expect(popover).not.toBe('rgba(0, 0, 0, 0)');
    await expect(menu(page)).toHaveCSS('background-color', popover);
    await page.screenshot({ path: test.info().outputPath(`line-menu-${theme}.png`) });
  });
}

/** Öffnet das Menü per contextmenu-Ereignis an einer Viewport-Position, ohne den Fokus per Mausklick zu verschieben */
async function openAt(page: Page, at?: { x: number; y: number }, role = 'zigzag') {
  const p = at ?? (await pointOn(page, hitOf(page, role)));
  await hitOf(page, role).evaluate((el, pt) => {
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, button: 2 }));
  }, p);
}

test('Pfeiltasten, Home und End wandern durch die Knöpfe des Menüs', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await expect(menu(page)).toBeFocused();
  const buttons = menu(page).locator('button:not(:disabled)');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(3);
  await page.keyboard.press('ArrowDown');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(buttons.nth(count - 1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(buttons.nth(count - 1)).toBeFocused();
  await expect(menu(page)).toBeVisible();
});

test('Tab aus dem Menü schließt es; ein Pfeil außerhalb zieht den Fokus nicht zurück', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  await page.getByTestId('workspace-settings').focus();
  await expect(menu(page)).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('workspace-settings')).toBeFocused();
});

test('Umschalt+Tab führt aus dem Menü auf die Seite und schließt es (das Menü liegt am Ende von body)', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(menu(page)).toHaveCount(0);
});

test('Escape gibt den Fokus an das vorherige Element zurück', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await page.getByTestId('workspace-settings').focus();
  await openAt(page);
  await expect(menu(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('workspace-settings')).toBeFocused();
});

test('Scrollen und Größenänderung schließen das Menü', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect(menu(page)).toHaveCount(0);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.width - 40, height: vp.height });
  await expect(menu(page)).toHaveCount(0);
});

test('Am rechten unteren Rand geöffnet bleibt das Menü im Bild', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  const vp = page.viewportSize()!;
  await openAt(page, { x: vp.width - 2, y: vp.height - 2 });
  await expect(menu(page)).toBeVisible();
  const box = (await menu(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
});

test('Rechtsklick auf leerer Fläche: das Browsermenü wird nicht unterdrückt', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  const prevented = page.evaluate(() => new Promise<boolean>(resolve => document.addEventListener('contextmenu', e => resolve(e.defaultPrevented), { once: true })));
  const box = (await page.getByTestId('formation-chart').boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + 60, { button: 'right' });
  expect(await prevented).toBe(false);
  await expect(menu(page)).toHaveCount(0);
});

test('Menü-Rollen: Farb-, Typ- und Dickenwahl sind menuitemradio mit aria-checked, keine nackten Schaltflächen (R2-03)', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  await expect(menu(page)).toBeVisible();
  const radios = menu(page).getByRole('menuitemradio');
  // 7 Farben + 3 Typen + 4 Dicken
  await expect(radios).toHaveCount(14);
  await expect(menu(page).locator('button:not([role])')).toHaveCount(0);
  await expect(menu(page).getByRole('menuitemradio', { checked: true })).toHaveCount(3);
  await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 3 }), exact: true }).click();
  await expect(menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 3 }), exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 2 }), exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(menu(page).getByRole('menuitem', { name: msg('lineStyle.custom'), exact: true })).toHaveCount(1);
  // Pfeiltasten laufen weiter über die neuen Rollen
  await page.keyboard.press('Home');
  await expect(menu(page).getByRole('menuitemradio').first()).toBeFocused();
  // Die Tabelle bleibt bei Schaltflächen mit aria-pressed
  const dialog = await openSettings(page, 'cw.overlays');
  const row = dialog.locator('[data-testid="line-style-row"][data-role="zigzag"]');
  await expect(row.getByRole('menuitemradio')).toHaveCount(0);
  await expect(row.getByRole('button', { name: msg('lineStyle.width.option', { n: 3 }), exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Eigene Farbe: das Feld ist leer, solange keine feste Farbe gewählt ist, und gefüllt bei Hex (R2-08)', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  const custom = menu(page).locator('span:has(> input[type="color"])').first();
  await expect(custom).toHaveAttribute('data-empty', 'true');
  await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.color.gray'), exact: true }).click();
  await expect(custom).toHaveAttribute('data-empty', 'true');
  await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.color.green'), exact: true }).click();
  await expect(custom).not.toHaveAttribute('data-empty', /.*/);
});

test('Farbfelder haben eine Kante mit genug Kontrast zum Menühintergrund (R2-10)', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  await rightClick(page);
  const swatch = menu(page).getByRole('menuitemradio', { name: msg('lineStyle.color.green'), exact: true });
  const classes = await swatch.getAttribute('class');
  expect(classes).toContain('border-muted-foreground/50');
  expect(classes).not.toMatch(/(^|\s)border-border(\s|$)/);
  const custom = menu(page).locator('span:has(> input[type="color"])').first();
  expect(await custom.getAttribute('class')).toContain('border-muted-foreground/50');
});

test('Texte: Rollenfarbe, Tabellen-Hinweis und Touch-Hinweis stimmen (R2-04, R2-06)', { tag: '@FRM-47' }, async ({ page, worker }) => {
  await openPage(page, worker);
  expect(msg('lineStyle.auto.theme.hint')).not.toContain('varsayılan renk budur');
  expect(msg('lineStyle.auto.theme.hint')).toContain('Rolün kendi rengi');
  expect(msg('formation.line.table.hint')).not.toContain('Tamam');
  expect(msg('formation.line.table.hint')).toContain(msg('cw.apply'));
  expect(msg('cw.lineMenu.hint')).toContain('Android');
  expect(msg('cw.lineMenu.hint')).not.toContain('dokunmatikte uzun basma');
  const dialog = await openSettings(page, 'cw.overlays');
  await dialog.getByRole('heading', { name: msg('formation.line.table'), exact: true }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: msg('formation.line.table.hint') })).toBeVisible();
});
