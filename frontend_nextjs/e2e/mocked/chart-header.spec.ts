/**
 * UI-15 Kopfleiste in Statistik und im Querformat: Die Statistik von /chart hat keinen alten Seitentitel („Analiz“, Untertitel) mehr,
 * sondern dieselbe Kopfleiste wie der Chart (seit 1107-A21 ohne Modus-Umschalter, siehe UI-22). Auf dem Handy im Querformat
 * (Höhe bis 480 px, Breite unter 1024 px) ist die Kopfleiste in jedem Modus höchstens 66 px hoch (zwei Zeilen).
 * Entwurf freigegeben am 2026-11-04 (Artifact „Ein Chart Kopfleiste“). Plan: docs/journal/2026-11-01-unified-chart-page.md, „Open points after U3“.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';

// Formationen rechnen auf dem Trendzug des Nutzers (FRM-41); die Fixture zeigt ihre Formation mit ihrer Einstellung
test.beforeEach(({ page }) => seedFixtureTrend(page, fixtureTrend('gar-buy-h4-01')));

const STATS = `/stats?account=${DEMO_ID}&zone=${ZONE_ID}`;
const SIZES = [[1440, 900], [375, 812], [812, 375]] as const;
const MAX_BAR = 66;

/** Sichtbare Überschriften: ein sr-only-Titel (1 px) zählt nicht */
const visibleHeadings = (page: Page) => page.evaluate(() => [...document.querySelectorAll('h1')].filter(h => h.getBoundingClientRect().width > 2).map(h => h.textContent));

test.describe('UI-15 Statistik mit Kopfleiste', () => {
  for (const [w, h] of SIZES) {
    test(`${w} × ${h}: Statistik hat keinen Seitentitel, aber die Kopfleiste ohne Reiter Chart/Statistik und ohne Modus-Schalter`, { tag: ['@UI-15', '@UI-23'] }, async ({ page, worker }) => {
      void worker;
      await page.setViewportSize({ width: w, height: h });
      await page.goto(STATS);
      await expect(page.getByTestId('stats-tab')).toBeVisible();
      await expect(page.getByTestId('analysis-controls').getByRole('tab')).toHaveCount(0);
      await expect(page.locator('[data-testid^="chart-mode"]')).toHaveCount(0);
      await expect(page.getByText(msg('analysis.subtitle'))).toHaveCount(0);
      expect(await visibleHeadings(page)).toEqual([]);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg('nav.stats'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    });
  }

  // Seit UI-23 ist die Statistik eine eigene Seite: der Menüpunkt „Chart“ öffnet den Chart, das Konto bleibt (über den Store)
  test('Statistik: der Menüpunkt „Chart“ öffnet den Chart, behält das Konto und schreibt weder tab noch mode', { tag: ['@UI-15', '@UI-23'] }, async ({ page, worker }) => {
    void worker;
    await page.goto(STATS);
    await expect(page.getByTestId('stats-tab')).toBeVisible();
    await page.getByTestId('app-nav').getByRole('link', { name: msg('nav.chart'), exact: true }).click();
    await expect(page.getByTestId('chart-page')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
    expect(new URL(page.url()).searchParams.get('mode')).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get('account')).toBe(DEMO_ID);
    await expect(page.locator('[data-testid^="chart-mode"]')).toHaveCount(0);
  });
});

const BARS = [
  { name: 'Formation', url: `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`, bar: 'chart-topbar' },
  { name: 'Setup', url: `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H1`, bar: 'chart-topbar' },
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
      await expect.poll(() => el.evaluate(e => e.getBoundingClientRect().height), { message: 'Höhe der Kopfleiste' }).toBeLessThanOrEqual(MAX_BAR);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(812);
      await expect(page.locator('[data-testid^="chart-mode"]')).toHaveCount(0);
      if (name !== 'Formation') {
        // Satır 1 dar (satır 796 px): plan 1106-A4.10 sırası: önce araçlar, en son Zeitraum ok menüsüne girer.
        // Der Modus-Schalter ist weg (UI-22), die Reiter Chart/Statistik auch (UI-23): Aksiyonlar bleiben Zeitraum + Werkzeuge.
        const actions = page.locator('[data-dock-pkg="actions"]');
        await expect(actions.getByTestId('range-trigger')).toBeVisible();
        await expect(page.getByTestId('chart-topbar').getByRole('tab')).toHaveCount(0);
        // Steht der Lizenzknopf im ok-Menü, ist er dort der einzige Eintrag ohne Reiter (plan 1106-A4.14)
        if (await actions.getByTestId('dock-more').isVisible()) {
          await actions.getByTestId('dock-more').click();
          const items = page.getByTestId('dock-more-menu').locator('button:visible, [role=tab]:visible');
          expect(await items.evaluateAll(b => b.map(x => `${x.getAttribute('role') ?? 'button'}:${x.getAttribute('aria-label') ?? x.textContent?.trim()}`))).toEqual([`button:${msg('analysis.license')}`]);
        } else await expect(actions.getByRole('button', { name: msg('analysis.license') })).toBeVisible();
      }
    });
  }

  for (const [w, h, short] of [[1440, 900, false], [1280, 400, false], [1024, 480, false], [1023, 480, true], [812, 375, true]] as const) {
    test(`${w} × ${h}: Querformat-Leiste ${short ? 'gilt' : 'gilt nicht'}`, { tag: '@UI-15' }, async ({ page, worker }) => {
      void worker;
      await page.setViewportSize({ width: w, height: h });
      await page.goto(BARS[2].url);
      const bar = page.getByTestId('chart-topbar');
      await expect(bar).toBeVisible();
      // S4 (A4.5): iki yönlü, kesin gözlem: Querformat-Leiste uygulanırsa Zeitraum tetikleyicisi 28 px'e kısılır, uygulanmazsa sınırsızdır
      await expect.poll(() => page.getByTestId('range-trigger').locator('xpath=ancestor::button[1]').evaluate(e => getComputedStyle(e).maxHeight)).toBe(short ? '28px' : 'none');
      if (short) await expect.poll(() => bar.evaluate(e => e.getBoundingClientRect().height)).toBeLessThanOrEqual(MAX_BAR);
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

  test('?tab=stats mit symbol (alter Link) öffnet die Seite Statistik; der Menüpunkt „Chart“ führt zurück', { tag: ['@UI-15', '@UI-23'] }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tab=stats`);
    await expect(page).toHaveURL(/\/stats\?/);
    await expect(page.getByTestId('analysis-page')).toBeVisible();
    await page.getByTestId('app-nav').getByRole('link', { name: msg('nav.chart'), exact: true }).click();
    await expect(page.getByTestId('chart-page')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
  });
});

/** Setup-Schalter: die Legendenzeile mit dem Knopf „Lejant“ gibt es nicht mehr (UI-22); die Schalter stehen im Menü „Ebenen“, auf dem Handy ohne Seitwärts-Scrollen; Desktop ebenso */
test.describe('UI-15 Setup-Schalter im Menü „Ebenen“', () => {
  const SETUP_URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H1`;

  async function open(page: Page, worker: MockWorker, w: number, h: number) {
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
    await page.setViewportSize({ width: w, height: h });
    await page.goto(SETUP_URL);
    await expect(page.getByTestId('layers-button')).toBeVisible();
  }

  test('375 × 812: das Menü klappt die Setup-Schalter auf und zu, nichts läuft seitwärts', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, 375, 812);
    await expect(page.getByTestId('chart-legend-toggle')).toHaveCount(0);
    await expect(page.getByTestId('chart-key')).toHaveCount(0);
    const toggle = page.getByTestId('layers-button');
    await toggle.click();
    const menu = page.getByTestId('layers-menu');
    await expect(menu).toBeVisible();
    const group = menu.getByTestId('layers-group-setup');
    const switches = group.getByRole('switch');
    await expect(switches).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      const sw = switches.nth(i);
      await sw.scrollIntoViewIfNeeded();
      const box = (await sw.boundingBox())!;
      expect(box.x + box.width, `Schalter ${i} liegt im Bild`).toBeLessThanOrEqual(375);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('1440 × 900: kein Knopf „Lejant“ und keine Legendenzeile, die Schalter stehen im Menü', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, 1440, 900);
    await expect(page.getByTestId('chart-legend-toggle')).toHaveCount(0);
    await expect(page.getByTestId('chart-key')).toHaveCount(0);
    await page.getByTestId('layers-button').click();
    await expect(page.getByTestId('layers-menu').getByTestId('layers-group-setup').getByRole('switch')).toHaveCount(7);
  });
});

/** Formation mit Treffern (mit und ohne Favoriten): die Ergebniszeile (Formationen mit Zahl) und die Zeiteinheiten liegen in Zeile 2 der Kopfleiste. Die Favoriten-Streifen der Kopfleiste gibt es seit UI-22 nicht mehr (die Favoriten stehen in der Seitenleiste); sie machen die Kopfleiste nicht höher. */
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
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`);
    await expect(page.getByTestId('chart-topbar')).toBeVisible();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  }

  const height = (page: Page) => page.getByTestId('chart-topbar').evaluate(e => e.getBoundingClientRect().height);

  test('812 × 375, Formation ohne Favoriten: Formationszeile sichtbar, Kopfleiste höchstens 66 px', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, []);
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await expect.poll(() => height(page)).toBeLessThanOrEqual(MAX_BAR);
  });

  test('812 × 375, Formation mit Favoriten: Ergebniszeile sichtbar, Kopfleiste höchstens 66 px', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-favorites-scan-ms', /^\d+$/);
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await expect(page.getByTestId('timeframe-select')).toBeVisible();
    await expect(page.getByTestId('formation-forms')).toHaveCSS('flex-wrap', 'nowrap');
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
    const sel = await rect(page, 'chart-topbar-row1');
    expect(tf.top, 'Zeiteinheiten unter Zeile 1').toBeGreaterThanOrEqual(sel.bottom - 1);
    expect(Math.abs(forms.top - tf.top), 'Formationen in derselben Zeile wie die Zeiteinheiten').toBeLessThanOrEqual(4);
    const status = await rect(page, 'formation-status-chip');
    expect(status.top, 'Werkzeuge in Zeile 1').toBeLessThan(sel.bottom);
    const bar = await rect(page, 'chart-topbar');
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
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await expectRow2(page, 'timeframe-M1', 'formation-forms', 'timeframe-MN');
    await expect(page.getByTestId('timeframe-select')).toHaveCount(1);
    const select = page.getByRole('combobox', { name: msg('account.select.aria') });
    await expect(select).toContainText(ACCOUNT_NAME);
  });

  test('812 × 375, Formation ohne Favoriten: D1–M15 links in Zeile 2 vor der Formationsliste', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, []);
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await expectRow2(page, 'timeframe-M1', 'formation-forms', 'timeframe-MN');
    await expect(page.getByTestId('timeframe-D1')).toHaveCount(1);
  });

  test('Formation hochkant (375 × 812): Zeiteinheiten liegen über der Formationszeile (kein Raster)', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    const tf = await rect(page, 'timeframe-select');
    const forms = await rect(page, 'formation-forms');
    expect(tf.bottom, 'Zeiteinheiten über der Formationszeile').toBeLessThanOrEqual(forms.top + 1);
  });

  /** Zwei feste Zeilen auch auf dem Desktop (A13.7): bis 91rem Container brach die Leiste in zwei Bändern auf drei Zeilen (94 px) um. Ab 91rem bleibt es eine Zeile + Formationszeile (68 bis 69 px). Gemessen nur bei 16 px Schrift; die 20-px-Werte stehen im Journal. */
  for (const sidebar of [true, false]) {
    test(`Formation Desktop, Seitenleiste ${sidebar ? 'offen' : 'zu'}: die Kopfleiste ist bei jeder Breite höchstens 70 px hoch (nie drei Zeilen)`, { tag: '@UI-15' }, async ({ page, worker }) => {
      await page.addInitScript((open) => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open, tab: 'conditions' })), sidebar);
      await open(page, worker, ['EURUSD', 'GBPUSD']);
      await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
      const tallest: string[] = [];
      for (let width = 1100; width <= 1900; width += 40) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
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
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    const tf = await rect(page, 'timeframe-select');
    const forms = await rect(page, 'formation-forms');
    const sel = await rect(page, 'chart-topbar-row1');
    const status = await rect(page, 'formation-status-chip');
    expect(tf.top, 'Zeiteinheiten unter Zeile 1').toBeGreaterThanOrEqual(sel.bottom - 1);
    expect(Math.abs(forms.top - tf.top), 'Formationen in der Zeile der Zeiteinheiten').toBeLessThanOrEqual(4);
    expect(tf.right, 'Zeiteinheiten links vor den Formationen').toBeLessThanOrEqual(forms.left + 1);
    expect(status.top, 'Aktionen in Zeile 1').toBeLessThan(sel.bottom);
    await expect.poll(() => height(page)).toBeLessThanOrEqual(70);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  /** Tab-Folge der Kopfleiste (A19.2): Zeile 1 links nach rechts, dann Zeile 2 links nach rechts. Die Folge ist die DOM-Reihenfolge der fokussierbaren Elemente. */
  const tabOrderBreaks = (page: Page) => page.getByTestId('chart-topbar').evaluate((bar) => {
    const items = [...bar.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(e => !(e as HTMLButtonElement).disabled && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0)
      .map(e => ({ id: e.dataset.testid ?? e.getAttribute('aria-label') ?? e.tagName, r: e.getBoundingClientRect() }));
    // Gleiche Zeile: Mitten höchstens 8 px auseinander. Sichtreihenfolge: erst weiter unten = später, in der Zeile weiter rechts = später.
    const breaks: string[] = [];
    const cy = (r: DOMRect) => r.top + r.height / 2;
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      const dy = cy(b.r) - cy(a.r);
      if (dy < -8 || (Math.abs(dy) <= 8 && b.r.left < a.r.left - 1)) breaks.push(`${a.id} (y ${Math.round(cy(a.r))}, x ${Math.round(a.r.left)}) → ${b.id} (y ${Math.round(cy(b.r))}, x ${Math.round(b.r.left)})`);
    }
    return { count: items.length, breaks };
  });

  for (const [w, h, sidebar] of [[812, 375, false], [1440, 900, true], [1440, 900, false], [375, 812, false], [1700, 900, false]] as const) {
    test(`Formation ${w} × ${h}${w === 1440 ? `, Seitenleiste ${sidebar ? 'offen' : 'zu'}` : ''}: die Tab-Folge der Kopfleiste folgt der Sichtreihenfolge`, { tag: '@UI-15' }, async ({ page, worker }) => {
      await page.addInitScript((open) => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open, tab: 'conditions' })), sidebar);
      await open(page, worker, ['EURUSD', 'GBPUSD']);
      await page.setViewportSize({ width: w, height: h });
      await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
      // Die DOM-Reihenfolge stellt sich nach der Messung des Containers um
      await expect.poll(async () => (await tabOrderBreaks(page)).breaks, { message: 'Sprünge der Tab-Folge' }).toEqual([]);
      expect((await tabOrderBreaks(page)).count).toBeGreaterThan(5);
    });
  }

  test('Formation mit Favoriten hochkant (375 × 812): die Favoriten-Zeilen behalten ihre Höhen', { tag: '@UI-15' }, async ({ page, worker }) => {
    await open(page, worker, ['EURUSD', 'GBPUSD']);
    for (const [w, h] of [[375, 812]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
      expect(await page.getByTestId('chart-topbar').getByTestId('formation-forms').evaluate(e => getComputedStyle(e).overflowX), `${w} × ${h}`).toBe('auto');
      expect(await page.getByTestId('chart-topbar').getByTestId('formation-forms').evaluate(e => e.getBoundingClientRect().height), `${w} × ${h}`).toBeGreaterThanOrEqual(30);
      // Die Höhe der Zeiteinheiten-Reihe (28 px; die Favoriten-Streifen mit 30 px gibt es in der Kopfleiste nicht mehr)
      expect(await page.getByTestId('chart-topbar').getByTestId('timeframe-select').evaluate(e => e.getBoundingClientRect().height), `${w} × ${h}`).toBeGreaterThanOrEqual(28);
    }
  });
});

/** Handy 375 px: das Ziel (Symbol bzw. Setup) hat Inhaltsbreite (höchstens 42 %), das Konto bekommt den Rest (Entwurf C, 2026-11-04) */
test.describe('UI-15 Konto und Ziel in Zeile 1 auf dem Handy', () => {
  const LONG_NAME = 'Beispielkonto Demo Hedge Handy';
  const width = (page: Page, locator: ReturnType<Page['getByTestId']>) => locator.evaluate(e => e.getBoundingClientRect().width);

  async function open(page: Page, worker: MockWorker, url: string) {
    worker.state.accounts[0].account_name = LONG_NAME;
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
  }

  for (const [name, url, bar, target] of [
    ['Formation', `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`, 'chart-topbar', 'formation-symbol'],
    ['Frei', `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`, 'chart-topbar', 'formation-symbol'],
    ['Setup', `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H1`, 'chart-topbar', 'formation-symbol'],
  ] as const) {
    test(`375 × 812, ${name}: das Konto ist breiter als das Ziel, das Ziel höchstens 42 % der Zeile`, { tag: '@UI-15' }, async ({ page, worker }) => {
      await open(page, worker, url);
      const account = page.getByRole('combobox', { name: msg('account.select.aria') });
      await expect(account).toBeVisible();
      // Innenbreite der Leiste: 8 px Rand je Seite
      const row = (await page.getByTestId(bar).first().evaluate(e => e.getBoundingClientRect().width)) - 16;
      const targetWidth = await width(page, page.getByTestId(target).first());
      const accountWidth = await width(page, account);
      expect(targetWidth, 'Ziel ≤ 42 % der Zeile').toBeLessThanOrEqual(row * 0.42 + 1);
      expect(accountWidth, 'Konto breiter als das Ziel').toBeGreaterThan(targetWidth);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  }
});
