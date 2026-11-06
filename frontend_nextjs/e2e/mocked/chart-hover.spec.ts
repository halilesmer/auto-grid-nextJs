import type { Locator, Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const CHART_URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const rsiText = (page: Page) => page.locator('[data-indicator-value="RSI"]').innerText();
const rowOf = (page: Page, kind: string) => page.locator(`[data-indicator-row="${kind}"]`);
/** Screen box of one chart pane (price pane first). Lightweight Charts draws one table row per pane. */
const paneBox = (page: Page, index: number) => page.getByTestId('chart-workspace').locator('table').first().evaluate((table, i) => {
  const rows = [...table.querySelectorAll('tr')].filter(row => row.querySelector('canvas') && row.children.length === 3);
  const rect = rows[i].getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}, index);
/** Screen box of the pane that holds the legend row of an indicator (the system panes RSI(7) and wave, UI-11, lie above the user panes). */
const paneBoxOf = (page: Page, kind: string) => rowOf(page, kind).first().evaluate((row) => {
  const table = row.ownerDocument.querySelector('[data-testid="chart-workspace"] table')!;
  const rows = [...table.querySelectorAll('tr')].filter(r => r.querySelector('canvas') && r.children.length === 3);
  const top = row.getBoundingClientRect().top;
  const rect = rows.map(r => r.getBoundingClientRect()).filter(r => r.top <= top + 1).at(-1)!;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});
/** Opacity does not inherit, so the effective value is the product over all ancestors. */
const opacity = (locator: Locator) => locator.evaluate(element => {
  let value = 1;
  for (let node: Element | null = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
  return String(Math.round(value));
});

async function openChart(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(CHART_URL);
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  await expect.poll(async () => (await rsiText(page)).length).toBeGreaterThan(0);
}

/**
 * Moves down the RSI pane in small steps until the crosshair reports the RSI line under the mouse.
 * The hit zone of a line is only a few pixels wide and the mock candles move with the clock, so one column can miss the line
 * (a flat or very steep part). Therefore the search tries several columns, the middle one first.
 */
async function hoverRsiLine(page: Page, firstX?: number) {
  const pane = await paneBoxOf(page, 'RSI');
  const columns = [...(firstX === undefined ? [] : [firstX]), ...[0.5, 0.35, 0.65, 0.2, 0.8, 0.42, 0.58, 0.28, 0.72].map(fraction => pane.x + pane.width * fraction)];
  for (const x of columns) {
    for (let y = pane.y + 4; y < pane.y + pane.height - 4; y += 1) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(15);
      if (await rowOf(page, 'RSI').getAttribute('data-emphasis') === 'hover') return { x, y };
    }
  }
  throw new Error('RSI line not found under the mouse');
}

test('Indikatorwerte folgen dem Fadenkreuz und kehren zum letzten Wert zurück', { tag: '@ANA-22' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const last = await rsiText(page);
  const pane = await paneBox(page, 0);
  await page.mouse.move(pane.x + pane.width * 0.3, pane.y + pane.height * 0.5);
  await expect.poll(() => rsiText(page)).not.toBe(last);
  const first = await rsiText(page);
  await page.mouse.move(pane.x + pane.width * 0.6, pane.y + pane.height * 0.5);
  await expect.poll(() => rsiText(page)).not.toBe(first);
  await page.mouse.move(5, 5);
  await expect.poll(() => rsiText(page)).toBe(last);
});

test('Zeilenknöpfe erscheinen erst beim Hover oder Fokus', { tag: ['@ANA-22', '@UI-07'] }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const row = rowOf(page, 'RSI'), visibility = row.getByRole('button', { name: msg('cw.legend.visibility', { indicator: 'RSI' }) });
  await expect(row.getByRole('button', { name: msg('cw.legend.settings', { indicator: 'RSI' }) })).toHaveCount(1);
  await expect(row.getByRole('button', { name: msg('cw.legend.hideLayer', { layer: 'RSI' }) })).toHaveCount(1);
  await expect(row.getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'RSI' }) })).toHaveCount(1);
  await page.mouse.move(5, 5);
  await expect.poll(() => opacity(visibility)).toBe('0');
  await row.hover();
  await expect.poll(() => opacity(visibility)).toBe('1');
  await page.mouse.move(5, 5);
  await expect.poll(() => opacity(visibility)).toBe('0');
  await visibility.focus();
  await expect.poll(() => opacity(visibility)).toBe('1');
});

test.describe('Touch-Gerät', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test('Zeilen- und Bereichsknöpfe bleiben sichtbar', { tag: ['@ANA-22', '@UI-08'] }, async ({ page, worker }) => {
    void worker;
    await page.goto(CHART_URL);
    const row = rowOf(page, 'RSI');
    await expect(row).toBeVisible();
    await expect.poll(() => opacity(row.getByRole('button', { name: msg('cw.legend.visibility', { indicator: 'RSI' }) }))).toBe('1');
    await expect.poll(() => opacity(page.getByTestId('oscillator-controls').getByRole('button', { name: msg('cw.paneDown', { indicator: 'RSI' }) }))).toBe('1');
  });
});

test('Bereichsknöpfe erscheinen beim Hover über den Bereich', { tag: ['@ANA-22', '@UI-07'] }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const up = page.getByTestId('oscillator-controls').getByRole('button', { name: msg('cw.paneDown', { indicator: 'RSI' }) });
  await page.mouse.move(5, 5);
  await expect.poll(() => opacity(up)).toBe('0');
  const pane = await paneBoxOf(page, 'RSI');
  await page.mouse.move(pane.x + pane.width * 0.4, pane.y + pane.height * 0.7);
  await expect.poll(() => opacity(up)).toBe('1');
  await page.mouse.move(5, 5);
  await expect.poll(() => opacity(up)).toBe('0');
});

test('Linie unter der Maus: Zeile hervorgehoben, Hand-Zeiger, Klick wählt, Escape und Klick ins Leere heben auf', { tag: '@ANA-22' }, async ({ page, worker }) => {
  test.slow();
  void worker;
  await openChart(page);
  const row = rowOf(page, 'RSI'), pointer = () => page.evaluate(() => !!document.querySelector('[data-testid="chart-workspace"] [style*="cursor: pointer"]'));
  const spot = await hoverRsiLine(page);
  await expect(row).toHaveAttribute('data-emphasis', 'hover');
  expect(await pointer()).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  await expect(row).toHaveAttribute('data-emphasis', 'selected');
  await page.mouse.move(5, 5);
  await expect(row).toHaveAttribute('data-emphasis', 'selected');
  await expect.poll(() => opacity(row.getByRole('button', { name: msg('cw.legend.visibility', { indicator: 'RSI' }) }))).toBe('1');
  await page.keyboard.press('Escape');
  await expect(row).not.toHaveAttribute('data-emphasis', /.+/);
  const again = await hoverRsiLine(page, spot.x);
  await page.mouse.click(again.x, again.y);
  await expect(row).toHaveAttribute('data-emphasis', 'selected');
  const price = await paneBox(page, 0);
  // Leerer Punkt ohne Linie im Kursbereich: Klick dort hebt die Auswahl auf. Die Kopfleiste liegt über dem oberen Rand des Bereichs (--chart-top); der Punkt liegt darunter (plan 1106-A4.16.3)
  const bar = (await page.getByTestId('chart-topbar').boundingBox())!;
  const empty = { x: price.x + price.width * 0.5, y: Math.max(price.y, bar.y + bar.height) + 4 };
  expect(await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('[data-testid="chart-workspace"]') && !e.closest('[data-testid="chart-topbar"]'); }, empty), 'Klickpunkt muss im Chart liegen, nicht in der Kopfleiste').toBe(true);
  await page.mouse.click(empty.x, empty.y);
  await expect(row).not.toHaveAttribute('data-emphasis', /.+/);
});

test('Preisindikator hat eine Legendenzeile mit Knöpfen im Kursbereich', { tag: '@ANA-22' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.getByRole('button', { name: '+ SMA', exact: true }).first().click();
  await page.keyboard.press('Escape');
  const row = rowOf(page, 'SMA');
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: msg('cw.legend.settings', { indicator: 'SMA' }) })).toHaveCount(1);
  await row.hover();
  await row.getByRole('button', { name: msg('cw.legend.visibility', { indicator: 'SMA' }) }).click();
  await expect(row).toHaveAttribute('data-visible', 'false');
  await row.getByRole('button', { name: msg('cw.legend.remove', { indicator: 'SMA' }) }).click();
  await expect(rowOf(page, 'SMA')).toHaveCount(0);
});

test('Legende bleibt in 375 px ohne horizontales Scrollen', { tag: ['@ANA-22', '@UI-08'] }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(CHART_URL);
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('Hover-Werte lösen keinen Alarm aus; der Alarm gilt für den letzten Wert', { tag: ['@ANA-22', '@ANA-20'] }, async ({ page, worker }) => {
  test.slow();
  void worker;
  await openChart(page);
  const context = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
  const armed = () => page.evaluate(key => JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents[key].alarms.map((alarm: { armed: boolean }) => alarm.armed), context);
  await rowOf(page, 'RSI').getByRole('button', { name: msg('cw.indicatorActions', { indicator: 'RSI' }) }).click();
  await page.getByRole('button', { name: msg('cw.indicatorAlarm') }).click();
  await page.getByRole('spinbutton', { name: msg('cw.alarmValue') }).fill('50');
  await page.getByRole('button', { name: msg('cw.alarmSave') }).click();
  await expect.poll(armed).toEqual([true]);
  // Sweep over the whole chart: the hovered RSI passes 50 several times, the latest value does not move.
  const pane = await paneBox(page, 0);
  const seen = new Set<string>();
  for (let step = 1; step < 40; step++) {
    await page.mouse.move(pane.x + pane.width * step / 40, pane.y + pane.height * 0.5);
    await page.waitForTimeout(30);
    seen.add(await rsiText(page));
  }
  expect(seen.size).toBeGreaterThan(5);
  await expect(page.getByRole('status').filter({ hasText: msg('cw.alarmTriggered', { indicator: 'RSI', value: '50' }) })).toHaveCount(0);
  expect(await armed()).toEqual([true]);
});

test('System-Bereiche RSI(7) und Wave 5/35 haben eine Legendenzeile; Ausblenden geht in jedem Bereich', { tag: ['@ANA-22', '@UI-07'] }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  for (const [id, label] of [['rsi', 'RSI'], ['wave', 'Wave 5/35']] as const) {
    const row = page.locator(`[data-system-row="${id}"]`), hide = row.getByRole('button', { name: msg('cw.legend.hideLayer', { layer: label }) });
    await expect(row).toHaveCount(1);
    await page.mouse.move(5, 5);
    await expect.poll(() => opacity(hide)).toBe('0');
    await row.hover();
    await expect.poll(() => opacity(hide)).toBe('1');
    // The row has a background while hovered, so the text stays readable over bars and lines.
    await expect.poll(() => row.evaluate(el => getComputedStyle(el).backgroundColor)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    await hide.click();
    await expect(row).toHaveCount(0);
  }
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-rsi-visible', 'false');
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-wave-visible', 'false');
});
