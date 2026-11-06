/**
 * Indikator-Linien: Kontextmenü auf der Linie (Rechtsklick/Doppelklick) mit Stil (Farbe, Typ, Dicke) und den Aktionen der Legende.
 * ANA-24 (Plan 1105-A7/A8, Schritt S3). Der Stil der gezeichneten Reihe steht als JSON in `data-indicator-lines` am Chart-Host.
 */
import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const CHART_URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const STORE_KEY = 'grid-robot-chart-workspaces-v1';
const rowOf = (page: Page, kind: string) => page.locator(`[data-indicator-row="${kind}"]`);
const menu = (page: Page) => page.getByTestId('indicator-line-menu');
const paneBoxOf = (page: Page, kind: string) => rowOf(page, kind).first().evaluate((row) => {
  const table = row.ownerDocument.querySelector('[data-testid="chart-workspace"] table')!;
  const rows = [...table.querySelectorAll('tr')].filter(r => r.querySelector('canvas') && r.children.length === 3);
  const top = row.getBoundingClientRect().top;
  const rect = rows.map(r => r.getBoundingClientRect()).filter(r => r.top <= top + 1).at(-1)!;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});
/** Stil der gezeichneten Reihen laut Chart (Optionen der Lightweight-Charts-Reihe, nicht der Dokumentwert) */
const seriesOf = async (page: Page, kind: string) => {
  const raw = await page.getByTestId('chart-workspace').locator('[data-indicator-lines]').first().getAttribute('data-indicator-lines');
  return (JSON.parse(raw ?? '[]') as { kind: string; lineStyle: number; lineWidth: number; color: string }[]).find(item => item.kind === kind);
};

async function openChart(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(CHART_URL);
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  await expect.poll(async () => (await page.locator('[data-indicator-value="RSI"]').innerText()).length).toBeGreaterThan(0);
}

/** Sucht die RSI-Linie unter der Maus (Treffer meldet das Fadenkreuz; ANA-22 macht es genauso) und gibt den Punkt zurück */
async function findRsiLine(page: Page) {
  const pane = await paneBoxOf(page, 'RSI');
  for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8, 0.42, 0.58, 0.28, 0.72]) {
    const x = pane.x + pane.width * fraction;
    for (let y = pane.y + 4; y < pane.y + pane.height - 4; y += 1) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(15);
      if (await rowOf(page, 'RSI').getAttribute('data-emphasis') === 'hover') return { x, y };
    }
  }
  throw new Error('RSI line not found under the mouse');
}
const rightClickRsi = async (page: Page) => { const p = await findRsiLine(page); await page.mouse.click(p.x, p.y, { button: 'right' }); return p; };

async function setMenuMode(page: Page, mode: string) {
  await page.getByTestId('workspace-settings').click();
  const dialog = page.getByTestId('chart-workspace-settings');
  await dialog.getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
  await dialog.getByLabel(msg('cw.lineMenu'), { exact: true }).selectOption(mode);
  await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Das Dokument wird verzögert geschrieben: erst warten, bis die Einstellung im Speicher steht
  await expect.poll(() => page.evaluate(([key, value]) => JSON.stringify(Object.values(JSON.parse(localStorage.getItem(key) || '{}').documents ?? {})).includes(`"lineMenu":"${value}"`), [STORE_KEY, mode])).toBe(true);
  // Neu laden: der Einstellungsdialog lässt das Fadenkreuz nicht mehr auf der Linie (die Suche findet sie sonst nicht wieder)
  await page.reload();
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  await expect.poll(async () => (await page.locator('[data-indicator-value="RSI"]').innerText()).length).toBeGreaterThan(0);
}

test('Rechtsklick auf die RSI-Linie öffnet das Menü; Farbe, Dicke und Typ wirken im Chart und bleiben nach dem Neuladen', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ lineStyle: 0, lineWidth: 1 });
  await rightClickRsi(page);
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('button', { name: msg('lineStyle.color.green'), exact: true }).click();
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ color: '#16a56b' });
  await menu(page).getByRole('button', { name: msg('lineStyle.width.option', { n: 3 }), exact: true }).click();
  await expect.poll(async () => (await seriesOf(page, 'RSI'))?.lineWidth).toBeGreaterThanOrEqual(3);
  await menu(page).getByRole('button', { name: msg('lineStyle.type.dashed'), exact: true }).click();
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ lineStyle: 2 });
  await menu(page).getByRole('button', { name: msg('lineStyle.type.dotted'), exact: true }).click();
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ lineStyle: 1 });
  await menu(page).getByRole('button', { name: msg('lineStyle.type.dashed'), exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(([key]) => Object.values(JSON.parse(localStorage.getItem(key) || '{}').documents ?? {}).some(d => ((d as { indicators: { kind: string; lineStyle: string }[] }).indicators ?? []).some(i => i.kind === 'RSI' && i.lineStyle === 'dashed')), [STORE_KEY])).toBe(true);
  await page.reload();
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ lineStyle: 2 });
});

test('Menü: „Ayarlar…“ öffnet den Dialog bei diesem Indikator; auch Doppelklick öffnet es', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const p = await findRsiLine(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('menuitem', { name: msg('cw.indicatorSettings'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-indicator="RSI"]')).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
});

test('Mit aktivem Zeichenwerkzeug öffnet sich kein Menü (Rechtsklick)', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const p = await findRsiLine(page);
  await page.getByRole('button', { name: msg('cw.rail.lines'), exact: true }).click();
  await page.mouse.move(p.x + 1, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(menu(page)).toHaveCount(0);
});

test('Mit aktivem Zeichenwerkzeug öffnet auch ein Doppelklick auf die Linie kein Menü', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const p = await findRsiLine(page);
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  // A two-point tool: the first click of the double-click ends it, and no drawing stays under the mouse
  await page.getByTestId('tool-trend-line').click();
  await page.mouse.move(p.x, p.y);
  await page.mouse.dblclick(p.x, p.y);
  await expect(menu(page)).toHaveCount(0);
});

test('Auf leerer Chart-Fläche öffnet sich kein Menü und das Browsermenü bleibt', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  await page.evaluate(() => {
    const seen: boolean[] = [];
    (window as unknown as { __prevented: boolean[] }).__prevented = seen;
    document.addEventListener('contextmenu', (e) => seen.push(e.defaultPrevented));
  });
  // Mitte des Kurs-Bereichs, weit weg von der RSI-Linie (die liegt in ihrem eigenen Bereich darunter)
  const host = (await page.getByTestId('chart-workspace').locator('[data-indicator-lines]').first().boundingBox())!;
  const rsi = await paneBoxOf(page, 'RSI');
  const x = host.x + host.width * 0.5, y = host.y + (rsi.y - host.y) * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented)).toEqual([false]);
});

test('Doppelklick-Menü öffnet an der Klickstelle, auch im unteren Bereich (RSI)', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const p = await findRsiLine(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(menu(page)).toBeVisible();
  const box = (await menu(page).boundingBox())!;
  // Das Menü sitzt mit einer Ecke an der Klickstelle (oder wird am Rand verschoben): nie hunderte Pixel entfernt
  const dx = Math.max(box.x - p.x, p.x - (box.x + box.width), 0), dy = Math.max(box.y - p.y, p.y - (box.y + box.height), 0);
  expect(Math.hypot(dx, dy)).toBeLessThan(40);
});

test('„Themefarbe“ stellt die Linie auf ihre Vorgabefarbe zurück (nicht schwarz)', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  const before = (await seriesOf(page, 'RSI'))!.color;
  await rightClickRsi(page);
  const button = (key: Parameters<typeof msg>[0]) => menu(page).getByRole('button', { name: msg(key), exact: true });
  await button('lineStyle.color.green').click();
  await expect.poll(async () => (await seriesOf(page, 'RSI'))?.color).toBe('#16a56b');
  await button('lineStyle.auto.theme').click();
  await expect.poll(async () => (await seriesOf(page, 'RSI'))?.color).toBe(before);
  expect(before.toLowerCase()).not.toBe('#000000');
  await expect(button('lineStyle.auto.theme')).toHaveAttribute('aria-pressed', 'true');
});

test('„Gri“ folgt dem Thema und bleibt beim erneuten Öffnen gewählt', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  await rightClickRsi(page);
  const gray = () => menu(page).getByRole('button', { name: msg('lineStyle.color.gray'), exact: true });
  await gray().click();
  const muted = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim().toLowerCase());
  await expect.poll(async () => (await seriesOf(page, 'RSI'))?.color.toLowerCase()).toBe(await muted());
  await page.keyboard.press('Escape');
  await rightClickRsi(page);
  await expect(gray()).toHaveAttribute('aria-pressed', 'true');
});

test('Menü: „Favori“ schaltet den Favoriten dieses Indikators', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  await rightClickRsi(page);
  await menu(page).getByRole('menuitem', { name: msg('cw.indicatorFavorite'), exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await rightClickRsi(page);
  await expect(menu(page).getByRole('menuitem', { name: msg('cw.indicatorUnfavorite'), exact: true })).toBeVisible();
});

test('Einstellung „Linienmenü“: nur Doppelklick, nur Rechtsklick, aus', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  test.setTimeout(90_000);
  await openChart(page);
  await setMenuMode(page, 'double');
  let p = await findRsiLine(page);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  await page.mouse.dblclick(p.x, p.y);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await setMenuMode(page, 'right');
  p = await findRsiLine(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(menu(page)).toHaveCount(0);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await setMenuMode(page, 'off');
  p = await findRsiLine(page);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  await page.mouse.dblclick(p.x, p.y);
  await expect(menu(page)).toHaveCount(0);
});

test('Altes Dokument ohne lineStyle zeichnet die Linie durchgezogen', { tag: '@ANA-24' }, async ({ page, worker }) => {
  void worker;
  await openChart(page);
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ lineStyle: 0 });
  await page.addInitScript(([key]) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    for (const doc of Object.values(saved.documents ?? {}) as { indicators?: Record<string, unknown>[] }[]) for (const item of doc.indicators ?? []) { delete item.lineStyle; item.width = 2; }
    localStorage.setItem(key, JSON.stringify(saved));
  }, [STORE_KEY]);
  await page.reload();
  await expect(page.getByTestId('oscillator-controls')).toBeVisible();
  await expect.poll(() => seriesOf(page, 'RSI')).toMatchObject({ lineStyle: 0, lineWidth: 2 });
});

for (const theme of ['light', 'dark']) {
  test(`Menü im Bild (${theme})`, { tag: '@ANA-24' }, async ({ page, worker }) => {
    void worker;
    await page.addInitScript(value => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
    await openChart(page);
    await rightClickRsi(page);
    await expect(menu(page)).toBeVisible();
    // The popup takes the theme's colors: the computed background is dark in the dark theme and light in the light theme
    const luminance = await menu(page).evaluate(el => { const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g)!.map(Number); return (r + g + b) / 3; });
    if (theme === 'dark') expect(luminance).toBeLessThan(110); else expect(luminance).toBeGreaterThan(145);
    await page.screenshot({ path: test.info().outputPath(`indicator-menu-${theme}.png`) });
  });
}
