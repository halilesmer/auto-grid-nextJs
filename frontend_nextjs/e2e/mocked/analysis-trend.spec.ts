/**
 * Trend-Button und Einstellungen im Chart (ANA-21): Trendzug auf den echten EURCAD-D1-Kerzen
 * (e2e/fixtures/formation/trd-up-d1-01.json, sechs Segmente zwischen den Punkten 14, 29, 84, 87, 103, 110, 133).
 * ANA-21 Trendzug im Chart
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test, type MockWorker } from '../fixtures/test';

const bars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/trd-up-d1-01.json', 'utf-8'))).bars;
const D1_SERIES = bars.map((b) => [b.time, b.open, b.high, b.low, b.close]);
const PREFS_KEY = 'grid-robot-analysis-prefs';

const ratesCalls = (worker: MockWorker) => worker.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/rates'));
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').state ?? {}, PREFS_KEY);

async function open(page: Page, worker: MockWorker, tf = 'D1') {
  worker.state.ratesSeries = { D1: D1_SERIES, M30: D1_SERIES };
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=${tf}&range=all`);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', String(bars.length));
}

const chart = (page: Page) => page.getByTestId('analysis-chart');
const trend = (page: Page) => page.getByTestId('trend-toggle');

async function openSettings(page: Page) {
  await page.getByTestId('trend-settings').click();
  const panel = page.getByTestId('trend-settings-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('ANA-21 Trendzug im Chart', () => {
  test('Der Button ist zuerst aus und lädt nichts; an zeigt er den Zug und bleibt nach dem Neuladen an', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await open(page, worker);
    await expect(trend(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(chart(page)).toHaveAttribute('data-trend', '0');
    // Aus: nur die Anfrage des Charts selbst, keine für den Zug
    const distinct = () => new Set(ratesCalls(worker).map((c) => c.query.get('from'))).size;
    expect(distinct()).toBe(1);

    await trend(page).click();
    await expect(trend(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    expect(distinct()).toBe(2);
    expect((await stored(page)).showTrend).toBe(true);

    await page.reload();
    await expect(trend(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(chart(page)).toHaveAttribute('data-trend', '6');

    await trend(page).click();
    await expect(chart(page)).toHaveAttribute('data-trend', '0');
  });

  test('Auf M30 ist der Button gesperrt und es wird nichts für den Zug geladen, auch wenn er an gespeichert ist', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ state: { showTrend: true }, version: 0 })), [PREFS_KEY]);
    await open(page, worker, 'M30');
    await expect(trend(page)).toBeDisabled();
    await expect(trend(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(chart(page)).toHaveAttribute('data-trend', '0');
    expect(new Set(ratesCalls(worker).map((c) => c.query.get('timeframe')))).toEqual(new Set(['M30']));
  });

  test('Mindestgröße ändert die Linie, bleibt im Browser gespeichert und der Zurücksetzen-Knopf stellt den Standard her', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await open(page, worker);
    await trend(page).click();
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    const panel = await openSettings(page);
    await panel.getByTestId('trend-minSize').fill('1');
    await expect(chart(page)).not.toHaveAttribute('data-trend', '6');
    expect((await stored(page)).trend.minSize).toBe(1);

    await page.reload();
    await trend(page).waitFor();
    await expect(chart(page)).not.toHaveAttribute('data-trend', '6');
    const again = await openSettings(page);
    await expect(again.getByTestId('trend-minSize')).toHaveValue('1');
    await again.getByTestId('trend-reset').click();
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    expect((await stored(page)).trend.minSize).toBe(2.5);
  });

  test('Regeln: Mindestgröße ist bei „Ein Punkt je EWO-Welle“ gesperrt, der EWO-Rücksetzer nur beim EWO-Filter aktiv', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await open(page, worker);
    const panel = await openSettings(page);
    await expect(panel.getByTestId('trend-minSize')).toBeEnabled();
    await expect(panel.getByTestId('trend-ewoRetreat')).toBeDisabled();
    await panel.getByTestId('trend-rule').selectOption('welle');
    await expect(panel.getByTestId('trend-minSize')).toBeDisabled();
    await panel.getByTestId('trend-rule').selectOption('filter');
    await expect(panel.getByTestId('trend-minSize')).toBeEnabled();
    await expect(panel.getByTestId('trend-ewoRetreat')).toBeEnabled();
    expect((await stored(page)).trend.rule).toBe('filter');
  });

  test('EWO lang kleiner als EWO kurz: Hinweis, die Linie bleibt wie beim Standard, danach verschwindet der Hinweis', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await open(page, worker);
    await trend(page).click();
    const panel = await openSettings(page);
    await expect(panel.getByTestId('trend-ewo-invalid')).toHaveCount(0);
    await panel.getByTestId('trend-ewoSlow').fill('4');
    await expect(panel.getByTestId('trend-ewo-invalid')).toBeVisible();
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    await panel.getByTestId('trend-ewoSlow').fill('40');
    await expect(panel.getByTestId('trend-ewo-invalid')).toHaveCount(0);
    expect((await stored(page)).trend).toMatchObject({ ewoFast: 5, ewoSlow: 40 });
  });

  test('Grundlage der Formationen: Trendzug zeigt den Hinweis mit der Tabelle, Fein den kurzen Hinweis; die Linie bleibt gleich', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await open(page, worker);
    await trend(page).click();
    const panel = await openSettings(page);
    const note = panel.getByTestId('trend-zug-note');
    await expect(note).toContainText(msg('cw.trend.zug.noteFein'));
    await expect(note.locator('table')).toHaveCount(0);

    await panel.getByRole('button', { name: msg('cw.trend.zug.trend'), exact: true }).click();
    await expect(note).toContainText(msg('cw.trend.zug.noteTrend'));
    await expect(note.locator('tr', { hasText: 'ABCD' })).toContainText('24');
    await expect(note.locator('tr', { hasText: 'ABCD' })).toContainText('1');
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    expect((await stored(page)).trend.formationZug).toBe('trend');
  });

  test('Alles ist bei 375 px erreichbar, ohne waagerechten Überlauf', { tag: '@ANA-21' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, worker);
    await trend(page).click();
    const panel = await openSettings(page);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
