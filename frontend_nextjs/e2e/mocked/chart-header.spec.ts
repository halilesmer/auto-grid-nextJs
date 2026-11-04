/**
 * UI-15 Kopfleiste in Statistik und im Querformat: Die Statistik von /chart hat keinen alten Seitentitel („Analiz“, Untertitel) mehr,
 * sondern dieselbe Kopfleiste wie die Chart-Ansichten mit dem Umschalter Formation/Setup/Frei. Auf dem Handy im Querformat
 * (Höhe bis 480 px, Breite unter 1024 px) ist die Kopfleiste in jedem Modus höchstens 66 px hoch (zwei Zeilen).
 * Entwurf freigegeben am 2026-11-04 (Artifact „Ein Chart Kopfleiste“). Plan: docs/journal/2026-11-01-unified-chart-page.md, „Open points after U3“.
 */
import type { Page } from '@playwright/test';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

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
