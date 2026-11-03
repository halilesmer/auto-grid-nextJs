/**
 * UI-14 Eine Seite Chart: /chart hat die drei Modi Formation, Setup und Frei. Alte Links (/formasyon, /chart?mode=…, ?zone=, ?symbol=)
 * öffnen den richtigen Modus, das Konto bleibt beim Moduswechsel, die Zeiteinheit folgt dem Modus, und die Seite hat nur einen Menüpunkt „Chart“.
 * Dazu zwei Befunde der Prüfung: Menüs „Ebenen“ und Trend-Einstellungen bei 812 × 375 und die Werkzeugleiste über der Kopfleiste.
 * Plan: docs/journal/2026-11-01-unified-chart-page.md.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { formationUrl } from '../../src/lib/formation/alarmNotify';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const NOW = Date.UTC(2025, 10, 17, 12) / 1000;
const fixtureBars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))).bars;

const SETUP = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const FORMATION = `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const MODES = [['Formation', FORMATION], ['Setup', SETUP], ['Frei', FREE]] as const;

/** Öffnet eine Seite mit Chart; in Formation mit den Kerzen der Prüfung (wie chart-layers-menu.spec.ts) */
async function open(page: Page, worker: MockWorker, name: string, url: string) {
  if (name === 'Formation') {
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
    const rows = fixtureBars.filter(b => b.time + 14400 <= NOW).map(b => [b.time, b.open, b.high, b.low, b.close]);
    const last = rows[rows.length - 1];
    worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[NOW - 900, last[4], last[4], last[4], last[4]]] };
  }
  await page.goto(url);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
}

const pressed = (page: Page, mode: 'formation' | 'setup' | 'free') => expect(page.getByTestId(`chart-mode-${mode}`)).toHaveAttribute('aria-pressed', 'true');

test.describe('UI-14 Eine Seite Chart', () => {
  test('/formasyon leitet nach /chart?mode=formation weiter und behält den Query-String', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/formasyon?account=${DEMO_ID}&symbol=EURUSD&form=GAR&tf=H1`);
    await expect(page).toHaveURL(/\/chart\?/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/chart');
    expect(url.searchParams.get('mode')).toBe('formation');
    expect(url.searchParams.get('account')).toBe(DEMO_ID);
    expect(url.searchParams.get('symbol')).toBe('EURUSD');
    expect(url.searchParams.get('form')).toBe('GAR');
    expect(url.searchParams.get('tf')).toBe('H1');
    await pressed(page, 'formation');
  });

  test('/formasyon ohne Query-String öffnet Formation', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.goto('/formasyon');
    await expect(page).toHaveURL(/\/chart\?mode=formation/);
    await pressed(page, 'formation');
  });

  const LINKS = [
    [`/chart?account=${DEMO_ID}`, 'formation'],
    [`/chart?account=${DEMO_ID}&mode=setup`, 'setup'],
    [`/chart?account=${DEMO_ID}&mode=free`, 'free'],
    [`/chart?account=${DEMO_ID}&zone=${ZONE_ID}`, 'setup'],
    [`/chart?account=${DEMO_ID}&symbol=EURUSD`, 'free'],
    [`/chart?account=${DEMO_ID}&mode=formation&zone=${ZONE_ID}&symbol=EURUSD`, 'formation'],
    [`/chart?account=${DEMO_ID}&mode=free&zone=${ZONE_ID}`, 'free'],
  ] as const;
  for (const [link, mode] of LINKS) {
    test(`${link} öffnet den Modus ${mode}`, { tag: '@UI-14' }, async ({ page, worker }) => {
      void worker;
      await page.goto(link);
      await pressed(page, mode);
    });
  }

  test('Ein alter Statistik-Link (?tab=stats) öffnet die Statistik, nicht Formation', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&tab=stats&zone=${ZONE_ID}`);
    await expect(page.getByTestId('analysis-controls')).toBeVisible();
    await expect(page.getByTestId('chart-mode-formation')).toHaveCount(0);
  });

  test('Das Konto bleibt beim Moduswechsel, ein unerlaubtes tf fällt auf den Standard des Modus', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?mode=formation&account=${DEMO_ID}&symbol=EURUSD&tf=D1`);
    await page.getByTestId('chart-mode-setup').click();
    await pressed(page, 'setup');
    expect(new URL(page.url()).searchParams.get('account')).toBe(DEMO_ID);
    expect(new URL(page.url()).searchParams.get('tf')).toBe('D1');
    await page.goto(`/chart?mode=setup&account=${DEMO_ID}&tf=M5`);
    await page.getByTestId('chart-mode-formation').click();
    await pressed(page, 'formation');
    expect(new URL(page.url()).searchParams.get('account')).toBe(DEMO_ID);
    expect(new URL(page.url()).searchParams.get('tf')).toBeNull();
    await expect(page.getByTestId('formation-tf-H4')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('chart-mode-free').click();
    await pressed(page, 'free');
    expect(new URL(page.url()).searchParams.get('account')).toBe(DEMO_ID);
    expect(new URL(page.url()).searchParams.get('form')).toBeNull();
  });

  test('Von Setup nach Frei kommt das Produkt der Zone mit, zurück nach Setup fällt symbol= weg', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`);
    await expect(page.getByTestId('zone-select')).toBeVisible();
    await page.getByTestId('chart-mode-free').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('symbol')).toBe('USOUSD');
    await expect(page.getByTestId('free-chart-panel')).toBeVisible();
    await page.getByTestId('chart-mode-setup').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('mode')).toBe('setup');
    expect(new URL(page.url()).searchParams.get('symbol')).toBeNull();
  });

  test('Standard der Zeiteinheit: Formation H4, Setup und Frei M15', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/chart?mode=formation&account=${DEMO_ID}`);
    await expect(page.getByTestId('formation-tf-H4')).toHaveAttribute('aria-pressed', 'true');
    await page.goto(`/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=M5`);
    await page.getByTestId('chart-mode-formation').click();
    await expect(page.getByTestId('formation-tf-H4')).toHaveAttribute('aria-pressed', 'true');
    await page.goto(`/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD`);
    await expect(page.getByTestId('timeframe-select')).toContainText('M15');
  });

  test('Das Menü hat genau einen Punkt „Chart“ und keinen für /formasyon', { tag: '@UI-14' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: msg('nav.chart'), exact: true })).toHaveCount(1);
    await expect(nav.locator('a[href="/formasyon"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/chart"]')).toHaveCount(1);
  });

  test('formationUrl() erzeugt die neue Adresse mit mode=formation', { tag: '@UI-14' }, async () => {
    const notice = { symbol: 'EURUSD', form: 'GAR', tf: 'H4' } as unknown as Parameters<typeof formationUrl>[1];
    expect(formationUrl('7')).toBe('/chart?mode=formation&account=7');
    expect(formationUrl('7', notice)).toBe('/chart?mode=formation&account=7&symbol=EURUSD&form=GAR&tf=H4');
  });

  for (const [name, url] of MODES.slice(1)) {
    for (const width of [375, 1440]) {
      test(`${name}, ${width} px: rechts bleibt kein leerer Streifen`, { tag: '@UI-14' }, async ({ page, worker }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, worker, name, url);
        const box = await page.getByTestId('formation-main').boundingBox();
        expect(box!.x + box!.width, 'rechte Kante der Chartfläche').toBeCloseTo(width, 0);
      });
    }
  }
});

test.describe('UI-14 Menüs bei 812 × 375 (Handy quer)', () => {
  for (const [name, url] of MODES) {
    test(`${name}: „Ebenen“ und Trend-Einstellungen haben Höhe und liegen im Fenster`, { tag: '@UI-14' }, async ({ page, worker }) => {
      await page.setViewportSize({ width: 812, height: 375 });
      await open(page, worker, name, url);
      for (const [button, content] of [['layers-button', 'layers-menu'], ['trend-settings', 'trend-settings-panel']] as const) {
        await page.getByTestId(button).click();
        const panel = page.getByTestId(content).first();
        await expect(panel).toBeVisible();
        const container = panel.locator('xpath=ancestor::*[contains(@class,"overflow-y-auto")][1]');
        const box = await container.boundingBox();
        expect(box!.height, `${button}: Höhe des Menüs`).toBeGreaterThanOrEqual(120);
        expect(box!.y, `${button}: Oberkante im Fenster`).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, `${button}: Unterkante im Fenster`).toBeLessThanOrEqual(375);
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
      }
    });
  }
});

test.describe('UI-14 Werkzeugleiste und Kopfleiste', () => {
  /** Ab dieser Containerbreite liegt die Werkzeugleiste in der Kopfleiste (rem × 16 px; Rechnung in FormationToolbar.tsx) */
  const THRESHOLD = 71 * 16;
  for (const [name, url] of MODES) {
    test(`${name}: kein Element der Kopfleiste liegt unter der Werkzeugleiste (Container von der Schwelle bis 1250 px)`, { tag: '@UI-14' }, async ({ page, worker }) => {
      await page.setViewportSize({ width: 1500, height: 900 });
      await open(page, worker, name, url);
      // formation-main hat rechts 40 px Leiste (Formation) bzw. keinen Rand (Setup, Frei); wir lesen die echte Breite
      for (let viewport = THRESHOLD + 40; viewport <= 1560; viewport += 16) {
        await page.setViewportSize({ width: viewport, height: 900 });
        const width = (await page.getByTestId('formation-main').boundingBox())!.width;
        if (width < THRESHOLD || width > 1250) continue;
        const overlaps = await page.evaluate(() => {
          const tools = document.querySelector('[data-testid="workspace-toolbar"]')!.getBoundingClientRect();
          const bar = document.querySelector('[data-testid="chart-topbar"], [data-testid="formation-toolbar"]')!;
          const hits: string[] = [];
          for (const el of bar.querySelectorAll<HTMLElement>('button, input, select, a, [role="combobox"]')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > tools.left + 0.5 && r.left < tools.right - 0.5 && r.bottom > tools.top + 0.5 && r.top < tools.bottom - 0.5) hits.push(`${el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20)}`);
          }
          return hits;
        });
        expect(overlaps, `Containerbreite ${Math.round(width)} px`).toEqual([]);
      }
    });
  }
});
