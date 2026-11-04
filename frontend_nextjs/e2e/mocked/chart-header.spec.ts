/**
 * UI-15 Kopfleiste in Statistik und im Querformat: Die Statistik von /chart hat keinen alten Seitentitel („Analiz“, Untertitel) mehr,
 * sondern dieselbe Kopfleiste wie die Chart-Ansichten mit dem Umschalter Formation/Setup/Frei. Auf dem Handy im Querformat
 * (Höhe bis 480 px, Breite unter 1024 px) ist die Kopfleiste in jedem Modus höchstens 66 px hoch (zwei Zeilen).
 * Entwurf freigegeben am 2026-11-04 (Artifact „Ein Chart Kopfleiste“). Plan: docs/journal/2026-11-01-unified-chart-page.md, „Open points after U3“.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const STATS = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tab=stats`;
const SIZES = [[1440, 900], [375, 812], [812, 375]] as const;
const MAX_BAR = 66;

/** Sichtbare Überschriften: ein sr-only-Titel (1 px) zählt nicht */
const visibleHeadings = (page: Page) => page.evaluate(() => [...document.querySelectorAll('h1')].filter(h => h.getBoundingClientRect().width > 2).map(h => h.textContent));

test.describe('UI-15 Statistik mit Kopfleiste', () => {
  for (const [w, h] of SIZES) {
    test(`${w} × ${h}: Statistik hat keinen Seitentitel, aber den Umschalter mit Setup gedrückt`, { tag: '@UI-15' }, async ({ page, worker }) => {
      void worker;
      await page.setViewportSize({ width: w, height: h });
      await page.goto(STATS);
      await expect(page.getByTestId('chart-mode-setup')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('chart-mode-formation')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('chart-mode-free')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText(msg('analysis.subtitle'))).toHaveCount(0);
      expect(await visibleHeadings(page)).toEqual([]);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg('nav.chart'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    });
  }

  test('Statistik: „Frei“ und „Formation“ öffnen den Chart dieses Modus und behalten das Konto', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.goto(STATS);
    await page.getByTestId('chart-mode-free').click();
    await expect(page).toHaveURL(/mode=free/);
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
    expect(new URL(page.url()).searchParams.get('account')).toBe(DEMO_ID);
    await expect(page.getByTestId('chart-page')).toBeVisible();
    await page.goto(STATS);
    await page.getByTestId('chart-mode-formation').click();
    await expect(page).toHaveURL(/mode=formation/);
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
    await expect(page.getByTestId('formation-page')).toBeVisible();
  });
});

const BARS = [
  { name: 'Formation', url: `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`, bar: 'formation-toolbar' },
  { name: 'Setup', url: `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`, bar: 'chart-topbar' },
  { name: 'Frei', url: `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`, bar: 'chart-topbar' },
] as const;

test.describe('UI-15 Kopfleiste im Querformat', () => {
  for (const { name, url, bar } of BARS) {
    test(`812 × 375, ${name}: die Kopfleiste ist höchstens ${MAX_BAR} px hoch`, { tag: '@UI-15' }, async ({ page, worker }) => {
      worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
      await page.setViewportSize({ width: 812, height: 375 });
      await page.goto(url);
      const el = page.getByTestId(bar);
      await expect(el).toBeVisible();
      await expect(page.getByTestId('chart-mode-formation')).toBeVisible();
      await expect.poll(() => el.evaluate(e => e.getBoundingClientRect().height), { message: 'Höhe der Kopfleiste' }).toBeLessThanOrEqual(MAX_BAR);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(812);
    });
  }

  for (const [w, h, short] of [[1440, 900, false], [1280, 400, false], [1024, 480, false], [1023, 480, true], [812, 375, true]] as const) {
    test(`${w} × ${h}: Querformat-Leiste ${short ? 'gilt' : 'gilt nicht'}`, { tag: '@UI-15' }, async ({ page, worker }) => {
      void worker;
      await page.setViewportSize({ width: w, height: h });
      await page.goto(BARS[2].url);
      const bar = page.getByTestId('chart-topbar');
      await expect(bar).toBeVisible();
      await expect.poll(() => bar.evaluate(e => getComputedStyle(e).display === 'grid')).toBe(short);
    });
  }

  test('812 × 375: die Menüs der Kopfleiste (Zeitraum, Konto) liegen nicht abgeschnitten', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 812, height: 375 });
    await page.goto(BARS[2].url);
    for (const [trigger, panel] of [['range-trigger', 'range-panel']] as const) {
      await page.getByTestId(trigger).click();
      const box = (await page.getByTestId(panel).boundingBox())!;
      expect(box.height, `${panel} sichtbar`).toBeGreaterThan(100);
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid=range-panel]') !== null, { x: box.x + box.width / 2, y: box.y + box.height - 8 });
      expect(hit, `${panel}: der untere Rand liegt oben auf`).toBe(true);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('combobox').first().click();
    const list = page.getByRole('listbox').first();
    await expect(list).toBeVisible();
    const lb = (await list.boundingBox())!;
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role=listbox]') !== null, { x: lb.x + lb.width / 2, y: lb.y + lb.height - 4 });
    expect(top, 'Kontoliste: der untere Rand liegt oben auf').toBe(true);
  });

  test('?mode=free&tab=stats (alter Link): ein Klick auf „Frei“ öffnet den Chart', { tag: '@UI-15' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&mode=free&symbol=EURUSD&tab=stats`);
    await page.getByTestId('chart-mode-free').click();
    await expect(page.getByTestId('chart-page')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
  });
});

/** Formation mit Treffern und Favoriten: die Ergebniszeile (Formationen mit Zahl) und die Zeiteinheiten der Favoriten liegen unter der Kopfleiste */
test.describe('UI-15 Formation mit Ergebniszeile im Querformat', () => {
  const NOW = Date.UTC(2025, 10, 17, 12) / 1000;
  const bars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))).bars;
  // Platzhalter-Kontoname mit Ziffern wie eine Kontonummer, länger als die Leiste ohne Mindestbreite zeigt
  const ACCOUNT_NAME = '1234567890';

  async function open(page: Page, worker: MockWorker, favorites: string[]) {
    worker.state.accounts[0].account_name = ACCOUNT_NAME;
    worker.state.favorites[DEMO_ID] = favorites;
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
    const rows = bars.filter(b => b.time + 14400 <= NOW).map(b => [b.time, b.open, b.high, b.low, b.close]);
    const last = rows[rows.length - 1];
    worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[NOW - 900, last[4], last[4], last[4], last[4]]] };
    await page.setViewportSize({ width: 812, height: 375 });
    await page.goto(`/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`);
    await expect(page.getByTestId('formation-toolbar')).toBeVisible();
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  }

  const height = (page: Page) => page.getByTestId('formation-toolbar').evaluate(e => e.getBoundingClientRect().height);

  test('812 × 375, Formation ohne Favoriten: Formationszeile sichtbar, Kopfleiste höchstens 66 px', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, []);
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await expect.poll(() => height(page)).toBeLessThanOrEqual(MAX_BAR);
  });

  test('812 × 375, Formation mit Favoriten: Ergebniszeile sichtbar, Kopfleiste höchstens 66 px', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-favorites-scan-ms', /^\d+$/);
    await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
    await expect(page.getByTestId('favorites-timeframes')).toBeVisible();
    await expect(page.getByTestId('favorites-forms')).toHaveCSS('flex-wrap', 'nowrap');
    await expect.poll(() => height(page)).toBeLessThanOrEqual(MAX_BAR);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(812);
  });

  test('812 × 375, Formation: die Kontoauswahl zeigt den Kontonamen ganz', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    const select = page.getByRole('combobox', { name: msg('account.select.aria') });
    await expect(select).toContainText(ACCOUNT_NAME);
    // Kein Element im Knopf (Text oder Knopf selbst) ist abgeschnitten
    const clipped = await select.evaluate(el => [el, ...el.querySelectorAll('*')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => `${n.tagName} sw=${n.scrollWidth} cw=${n.clientWidth}`));
    expect(clipped, 'abgeschnittene Elemente im Kontoknopf').toEqual([]);
  });

  const rect = (page: Page, id: string) => page.getByTestId(id).first().evaluate(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });

  /** Querformat (A8.2): Zeiteinheiten links in Zeile 2 vor der Formationsliste, Symbolfeld zeigt den Namen ganz, kein Seitenscroll */
  async function expectRow2(page: Page, tfId: string, formsId: string, tfLastId = tfId) {
    const tf = { ...(await rect(page, tfId)), right: (await rect(page, tfLastId)).right };
    const forms = await rect(page, formsId);
    const sel = await rect(page, 'formation-selectors');
    expect(tf.top, 'Zeiteinheiten unter Zeile 1').toBeGreaterThanOrEqual(sel.bottom - 1);
    expect(Math.abs(forms.top - tf.top), 'Formationen in derselben Zeile wie die Zeiteinheiten').toBeLessThanOrEqual(4);
    const status = await rect(page, 'formation-status-chip');
    expect(status.top, 'Werkzeuge in Zeile 1').toBeLessThan(sel.bottom);
    const bar = await rect(page, 'formation-toolbar');
    expect(status.right, 'Werkzeuge ragen nicht aus der Leiste').toBeLessThanOrEqual(bar.right + 1);
    expect(tf.right, 'Zeiteinheiten links vor den Formationen').toBeLessThanOrEqual(forms.left + 1);
    expect(tf.left).toBeLessThan(40);
    const input = page.getByTestId('formation-symbol').locator('input');
    await expect(input).toHaveValue(/EURUSD/);
    expect(await input.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Symbolfeld abgeschnitten').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(812);
    await expect.poll(() => height(page)).toBeLessThanOrEqual(MAX_BAR);
  }

  test('812 × 375, Formation mit Favoriten: Zeiteinheiten links in Zeile 2, Symbolfeld und Konto ganz', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
    await expectRow2(page, 'favorites-timeframes', 'favorites-forms');
    await expect(page.getByTestId('favorites-timeframes')).toHaveCount(1);
    const select = page.getByRole('combobox', { name: msg('account.select.aria') });
    await expect(select).toContainText(ACCOUNT_NAME);
  });

  test('812 × 375, Formation ohne Favoriten: D1–M15 links in Zeile 2 vor der Formationsliste', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, []);
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await expectRow2(page, 'formation-tf-D1', 'formation-forms', 'formation-tf-M15');
    await expect(page.getByTestId('formation-tf-D1')).toHaveCount(1);
  });

  test('Formation hochkant (375 × 812): Zeiteinheiten liegen über der Formationszeile (kein Raster)', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
    const tf = await rect(page, 'favorites-timeframes');
    const forms = await rect(page, 'favorites-forms');
    expect(tf.bottom, 'Zeiteinheiten über der Formationszeile').toBeLessThanOrEqual(forms.top + 1);
  });

  /** Zwei feste Zeilen auch auf dem Desktop (A13.7): bis 91rem Container brach die Leiste in zwei Bändern auf drei Zeilen (94 px) um. Ab 91rem bleibt es eine Zeile + Formationszeile (68 bis 69 px). Gemessen nur bei 16 px Schrift; die 20-px-Werte stehen im Journal. */
  for (const sidebar of [true, false]) {
    test(`Formation Desktop, Seitenleiste ${sidebar ? 'offen' : 'zu'}: die Kopfleiste ist bei jeder Breite höchstens 70 px hoch (nie drei Zeilen)`, { tag: '@UI-15' }, async ({ page, worker }) => {
      await page.addInitScript((open) => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open, tab: 'conditions' })), sidebar);
      await open(page, worker, ['EURUSD', 'GBPUSD']);
      await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
      const tallest: string[] = [];
      for (let width = 1100; width <= 1900; width += 40) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
        const h = await height(page);
        if (h > 70) tallest.push(`${width} px: ${Math.round(h)} px`);
      }
      expect(tallest, 'Fensterbreiten mit mehr als zwei Zeilen').toEqual([]);
    });
  }

  test('Formation 1440 × 900 mit offener Seitenleiste: Zeiteinheiten und Formationen stehen in Zeile 2, Aktionen in Zeile 1, die Leiste ist höchstens 70 px hoch', { tag: '@UI-15' }, async ({ page, worker }) => {
    await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: true, tab: 'conditions' })));
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
    const tf = await rect(page, 'favorites-timeframes');
    const forms = await rect(page, 'favorites-forms');
    const sel = await rect(page, 'formation-selectors');
    const status = await rect(page, 'formation-status-chip');
    expect(tf.top, 'Zeiteinheiten unter Zeile 1').toBeGreaterThanOrEqual(sel.bottom - 1);
    expect(Math.abs(forms.top - tf.top), 'Formationen in der Zeile der Zeiteinheiten').toBeLessThanOrEqual(4);
    expect(tf.right, 'Zeiteinheiten links vor den Formationen').toBeLessThanOrEqual(forms.left + 1);
    expect(status.top, 'Aktionen in Zeile 1').toBeLessThan(sel.bottom);
    await expect.poll(() => height(page)).toBeLessThanOrEqual(70);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test('Formation mit Favoriten hochkant (375 × 812): die Favoriten-Zeilen behalten ihre Höhen', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    for (const [w, h] of [[375, 812]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
      expect(await page.getByTestId('formation-toolbar').getByTestId('favorites-forms').evaluate(e => getComputedStyle(e).flexWrap), `${w} × ${h}`).toBe('wrap');
      expect(await page.getByTestId('formation-toolbar').getByTestId('favorites-forms').evaluate(e => e.getBoundingClientRect().height), `${w} × ${h}`).toBeGreaterThanOrEqual(30);
      expect(await page.getByTestId('formation-toolbar').getByTestId('favorites-timeframes').evaluate(e => e.getBoundingClientRect().height), `${w} × ${h}`).toBeGreaterThanOrEqual(30);
    }
  });
});
