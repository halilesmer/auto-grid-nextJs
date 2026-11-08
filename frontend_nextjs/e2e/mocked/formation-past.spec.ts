/**
 * Formationssuche zu einem Zeitpunkt in der Vergangenheit (Plan A13.6, P2): Schalter „Stand“, Hinweis und Linie, Schritte, Glocke, Favoriten.
 * Die Kerzen sind die H4-Kerzen der Fixture gar-buy-h4-01.json (Reihe bis 2025-11-17 12:00 Brokerzeit); der Stand liegt davor.
 * FRM-38 Formation-Suche zu einem Zeitpunkt in der Vergangenheit
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { named, seedFixtureTrend, trendOf } from '../fixtures/formation-trend';

// Formationen rechnen auf dem Trendzug des Nutzers (FRM-41); die Fixtures zeigen ihre Formation mit FIXTURE_TREND
test.beforeEach(({ page }) => seedFixtureTrend(page, trendOf(fixtureBars)));

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}`;
/** 2025-10-23 04:00 Brokerzeit: mit diesem Stand steht in der Fixture ein ABCD im Aufbau */
const AT = 1761192000;
const AT_PARAM = '2025-10-23T04:00';
const NOW = Date.UTC(2025, 10, 17, 12) / 1000;

const fixtureBars = named('e2e/fixtures/formation/gar-buy-h4-01.json', parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8')))).bars;
/** H4-Kerzen der Fixture, die zum Zeitpunkt `until` geschlossen sind */
const rowsUntil = (until: number) => fixtureBars.filter((b) => b.time + 14400 <= until).map((b) => [b.time, b.open, b.high, b.low, b.close]);

/** H4 bis `h4Until`, M15 mit einer Kerze vor dem Stand (legt die Suchzeit der Live-Seite fest) */
function serve(worker: MockWorker, h4Until: number, m15End = AT) {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = rowsUntil(h4Until);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[m15End - 900, last[4], last[4], last[4], last[4]]] };
}

async function open(page: Page, worker: MockWorker, query = `&at=${AT_PARAM}`, h4Until = NOW) {
  serve(worker, h4Until);
  await page.goto(`${URL}${query}`);
  await expect(page.getByTestId('chart-topbar')).toBeVisible();
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

const badges = (page: Page) =>
  page.locator('[data-testid^="formation-form-"]').evaluateAll((els) => els.map((el) => `${el.getAttribute('data-testid')}:${el.querySelector('[data-testid="hit-badge"]')?.textContent ?? '0'}`));
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
/** Schritte und Schließen stehen in der Kopfleiste (Container ab 106 rem) oder schweben im Chart: je Fall ist genau eines sichtbar */
const control = (page: Page, name: 'prev' | 'next' | 'close') => page.locator(`[data-testid="formation-asof-${name}"], [data-testid="formation-asof-${name}-float"]`).locator('visible=true');
const atFromUrl = (page: Page) => new globalThis.URL(page.url()).searchParams.get('at');

test.describe('FRM-38 Stand in der Vergangenheit', () => {
  test('Mit ?at= gehen die Kerzen-Anfragen bis zum Stand (M15 genau, höhere Zeiteinheiten bis zur Kerzengrenze darüber)', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await open(page, worker);
    const rates = worker.callsTo('GET', /\/market\/.*\/rates$/);
    const to = (tf: string) => rates.filter((c) => c.query.get('timeframe') === tf).map((c) => Number(c.query.get('to')));
    const step = { M15: 900, H1: 3600, H4: 14400, D1: 86400 } as const;
    for (const tf of ['M15', 'H1', 'H4', 'D1'] as const) {
      expect(to(tf).length, tf).toBeGreaterThan(0);
      for (const value of to(tf)) {
        expect(value, tf).toBeGreaterThanOrEqual(AT);
        expect(value, tf).toBeLessThan(AT + step[tf]);
      }
    }
    expect(to('M15')).toEqual(to('M15').map(() => AT));
  });

  test('Die Treffer hängen nicht von Kerzen nach dem Stand ab (Reihe bis zum Stand = ganze Reihe)', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await open(page, worker, `&at=${AT_PARAM}&form=ABCD`, AT);
    const cut = await badges(page);
    serve(worker, NOW);
    await page.reload();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    const full = await badges(page);
    expect(full).toEqual(cut);
    expect(cut.some((x) => x !== undefined && /:[1-9]/.test(x))).toBe(true);
  });

  test('Nach 60 s kommt keine neue Kerzen-Anfrage', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await page.clock.install();
    await open(page, worker);
    const before = worker.callsTo('GET', /\/market\/.*\/rates$/).length;
    await page.clock.runFor(125_000);
    expect(worker.callsTo('GET', /\/market\/.*\/rates$/).length).toBe(before);
  });

  test('Hinweis, Schalter, Linie, Glocke und Favoriten zeigen den Vergangenheits-Stand', { tag: '@FRM-38' }, async ({ page, worker }) => {
    worker.state.favorites[DEMO_ID] = ['EURUSD', 'GBPUSD'];
    await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: true, tab: 'favorites' })));
    await open(page, worker);
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-favorites-scan-ms', /^\d+$/);
    await expect(page.getByTestId('formation-asof-notice')).toBeVisible();
    await expect(page.getByTestId('formation-asof')).toHaveAttribute('data-state', 'past');
    await expect(page.getByTestId('formation-asof')).toHaveAttribute('aria-label', /23\.10\.25 04:00/);
    await expect(page.getByTestId('formation-asof-line')).toBeVisible();
    await expect(page.getByTestId('formation-alarm')).toBeDisabled();
    await expect(page.getByTestId('favorites-live-tag')).toHaveText(msg('formation.fav.live'));
    // Ein Klick auf einen Favoriten öffnet das Produkt live: der Stand fällt weg
    await page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"] button:not([data-testid="favorite-flag"])').click();
    await expect(page).toHaveURL(/symbol=GBPUSD/);
    expect(atFromUrl(page)).toBeNull();
    await expect(page.getByTestId('formation-asof')).toHaveAttribute('data-state', 'live');
    await expect(page.getByTestId('formation-asof-notice')).toHaveCount(0);
    await expect(page.getByTestId('formation-alarm')).toBeEnabled();
  });

  test('Zurück und vor gehen um eine Kerze der gewählten Zeiteinheit; das Schließen entfernt at', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await open(page, worker, `&at=${AT_PARAM}&tf=H4`);
    await control(page, 'prev').click();
    await expect.poll(() => atFromUrl(page)).toBe('2025-10-23T00:00');
    await control(page, 'next').click();
    await expect.poll(() => atFromUrl(page)).toBe('2025-10-23T04:00');
    await control(page, 'next').click();
    await expect.poll(() => atFromUrl(page)).toBe('2025-10-23T08:00');
    await control(page, 'close').click();
    await expect.poll(() => atFromUrl(page)).toBeNull();
    await expect(page.getByTestId('formation-asof')).toHaveAttribute('data-state', 'live');
    await expect(page.getByTestId('formation-asof-steps-float')).toHaveCount(0);
  });

  test('Der Schalter wählt einen Stand; die Zeit springt in 15-Minuten-Schritten; Live setzt zurück', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await open(page, worker, '');
    await expect(page.getByTestId('formation-asof')).toHaveAttribute('data-state', 'live');
    await page.getByTestId('formation-asof').click();
    await expect(page.getByTestId('formation-asof-panel')).toBeVisible();
    await page.getByTestId('formation-asof-mode-past').click();
    await page.getByTestId('formation-asof-date').fill('2025-10-23');
    await page.getByTestId('formation-asof-time').selectOption('04:15');
    await page.getByTestId('formation-asof-apply').click();
    await expect.poll(() => atFromUrl(page)).toBe('2025-10-23T04:15');
    await expect(page.getByTestId('formation-asof-panel')).toHaveCount(0);
    await page.getByTestId('formation-asof').click();
    await page.getByTestId('formation-asof-mode-live').click();
    await page.getByTestId('formation-asof-apply').click();
    await expect.poll(() => atFromUrl(page)).toBeNull();
  });

  test('Ein Stand in der Zukunft fällt auf live zurück', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await open(page, worker, '&at=2099-01-01T00:00');
    await expect(page.getByTestId('formation-asof')).toHaveAttribute('data-state', 'live');
    await expect(page.getByTestId('formation-asof-notice')).toHaveCount(0);
    await expect.poll(() => atFromUrl(page)).toBeNull();
  });

  test('Datenlücken zum Stand zeigen einen Hinweis', { tag: '@FRM-38' }, async ({ page, worker }) => {
    worker.state.ratesMissing = [{ from: AT - 5 * 86400, to: AT - 4 * 86400, reason: 'unavailable', checked_at: null }];
    await open(page, worker);
    await expect(page.getByTestId('formation-asof-gap')).toHaveText(msg('formation.asof.gap'));
  });

  test('Ein Stand vor dem Verlauf lädt nicht ewig, sondern zeigt den Lückenhinweis', { tag: '@FRM-38' }, async ({ page, worker }) => {
    serve(worker, NOW);
    worker.state.ratesSeries = { D1: [], H4: [], H1: [], M15: [] };
    await page.goto(`${URL}&at=2020-01-06T10:00`);
    await expect(page.getByTestId('formation-asof-gap')).toHaveText(msg('formation.asof.gap'));
    await expect(page.getByTestId('formation-asof-notice')).toBeVisible();
    await expect(page.getByTestId('formation-loading')).toHaveCount(0);
  });

  test('Im Band 91 bis 106 rem schwebt der Schalter im Chart, die Kopfleiste bleibt zwei Zeilen hoch (UI-15)', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' })));
    await page.setViewportSize({ width: 1500, height: 900 });
    await open(page, worker);
    await expect(page.getByTestId('formation-asof-float')).toBeVisible();
    await expect(page.getByTestId('formation-asof')).toBeHidden();
    expect(await page.getByTestId('chart-topbar').evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(70);
    await page.getByTestId('formation-asof-float').click();
    const box = await page.getByTestId('formation-asof-panel').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await page.getByTestId('formation-asof-mode-live').click();
    await page.getByTestId('formation-asof-apply').click();
    await expect.poll(() => atFromUrl(page)).toBeNull();
    await expect(page.getByTestId('formation-asof-float')).toHaveAttribute('data-state', 'live');
  });

  test('Bei 375 px und 812 x 375 px: kein Querscroll, Schalter und Schritte im Bild', { tag: '@FRM-38' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, worker);
    const inView = async (id: string, width: number, height: number) => {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.x, id).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, id).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height, id).toBeLessThanOrEqual(height);
    };
    await inView('formation-asof', 375, 812);
    await inView('formation-asof-steps-float', 375, 812);
    await expect(page.getByTestId('formation-asof-steps')).toBeHidden();
    expect(await noOverflow(page)).toBe(true);
    // Das Blatt von unten bleibt im Bild
    await page.getByTestId('formation-asof').click();
    await inView('formation-asof-panel', 375, 812);
    expect(await noOverflow(page)).toBe(true);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 812, height: 375 });
    await inView('formation-asof', 812, 375);
    await inView('formation-asof-prev-float', 812, 375);
    await expect(page.getByTestId('formation-asof-steps')).toBeHidden();
    expect(await noOverflow(page)).toBe(true);
    await page.getByTestId('formation-asof').click();
    await inView('formation-asof-panel', 812, 375);
    expect(await noOverflow(page)).toBe(true);
  });
});
