/**
 * Hauptschalter des Formationsalarms und nur lesende Trend-Zeile im Alarm-Menü (Plan 1105-A5, A5.3 / A5.4).
 * FRM-43 Formationsalarm: Hauptschalter und Trend-Zeile
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const URL = `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}`;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function open(page: Page, worker: Parameters<Parameters<typeof test>[2]>[0]['worker'], active: boolean) {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const stored = { active, enabled: [`${DEMO_ID}|EURUSD`, `${DEMO_ID}|GBPUSD`], favoritesEnabled: [] };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('grid-robot-formation-alarm')) localStorage.setItem('grid-robot-formation-alarm', JSON.stringify(value));
  }, stored);
  await page.goto(URL);
  await expect(page.getByTestId('formation-toolbar')).toBeVisible();
  await page.getByTestId('formation-alarm').click();
  await page.getByTestId('formation-alarm-panel').getByRole('tab', { name: msg('formation.alarm.tab.settings') }).click();
}

test.describe('FRM-43 Hauptschalter und Trend-Zeile', () => {
  test('Aus: Glocke aus, Status „seçimler korunuyor“, Auswahlen bleiben gedimmt und bedienbar; An: alles wie vorher', { tag: '@FRM-43' }, async ({ page, worker }) => {
    await open(page, worker, false);
    const bell = page.getByTestId('formation-alarm');
    await expect(bell).toHaveAttribute('data-enabled', 'false');
    await expect(page.getByTestId('formation-alarm-status')).toContainText(msg('formation.alarm.status.paused'));
    await expect(page.getByTestId('formation-alarm-settings')).toHaveAttribute('data-dimmed', 'true');
    await expect(page.getByTestId('formation-alarm-extra-GBPUSD')).toBeVisible();
    // gedimmt, aber bedienbar
    await page.getByTestId('formation-alarm-form-ABCD').click();
    await page.getByTestId('formation-alarm-form-ABCD').click();
    await page.locator('#formation-alarm-active').click();
    await expect(page.locator('#formation-alarm-active')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('formation-alarm-settings')).toHaveAttribute('data-dimmed', 'false');
    await expect(page.getByTestId('formation-alarm-extra-GBPUSD')).toBeVisible();
    await expect(page.getByTestId('formation-alarm-status')).not.toContainText(msg('formation.alarm.status.paused'));
    await page.locator('#formation-alarm-active').click();
    await expect(bell).toHaveAttribute('data-enabled', 'false');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-formation-alarm') ?? '{}').enabled)).toHaveLength(2);
  });

  test('Trend-Zeile zeigt Regel, Größe und Schlüsse nur lesend; [Ayarlar] klappt das Trend-Panel auf', { tag: '@FRM-43' }, async ({ page, worker }) => {
    await open(page, worker, true);
    const row = page.getByTestId('formation-alarm-trend-text');
    await expect(row).toContainText(msg('cw.trend.minSize'));
    await expect(row).toContainText('ATR');
    await page.getByTestId('formation-alarm-trend-settings').click();
    await expect(page.getByTestId('formation-alarm-trend-panel')).toBeVisible();
  });

  test('375 px: kein Querscroll mit Schalter und Trend-Zeile', { tag: '@FRM-43' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, worker, false);
    expect(await noOverflow(page)).toBe(true);
  });

  // Gleicher Aufbau wie der Favoriten-Alarm in FRM-30 (formation-page.spec.ts), der dort eine Gartley meldet
  test('Aus: der Alarm meldet nichts, auch wenn die Suche eine neue Formation findet', { tag: '@FRM-43' }, async ({ page, worker }) => {
    const bars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))).bars;
    const serve = (w: MockWorker, now: number) => {
      w.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
      const rows = bars.filter((b) => b.time + 14400 <= now).map((b) => [b.time, b.open, b.high, b.low, b.close]);
      const last = rows[rows.length - 1];
      w.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[now - 900, last[4], last[4], last[4], last[4]]] };
    };
    const ratesCalls = () => worker.callsTo('GET', /\/market\/.*\/rates$/).length;
    worker.state.favorites[DEMO_ID] = ['EURUSD'];
    serve(worker, 1761192000);
    const stored = { active: false, prefs: { events: { valid: true, target: true }, forms: ['GAR'], system: false }, enabled: [], favoritesEnabled: [DEMO_ID], memory: {} };
    await page.addInitScript((value) => {
      if (!localStorage.getItem('grid-robot-formation-alarm')) localStorage.setItem('grid-robot-formation-alarm', JSON.stringify(value));
    }, stored);
    await page.clock.install();
    await page.goto(`/chart?account=${DEMO_ID}&mode=free`);
    await expect.poll(ratesCalls, { timeout: 15_000 }).toBeGreaterThanOrEqual(4);
    const before = ratesCalls();
    serve(worker, Date.UTC(2025, 10, 17, 12) / 1000);
    await page.clock.runFor(15 * 60_000);
    // Die Suche läuft weiter (Favoriten), der Alarm meldet nichts und merkt nichts
    await expect.poll(ratesCalls, { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 4);
    await page.clock.runFor(5_000);
    const gartley = msg('formation.alarm.notice.both', { form: msg('formation.form.GAR'), side: msg('formation.side.buy'), symbol: 'EURUSD', tf: 'H4', point: 'D' });
    await expect(page.getByText(gartley)).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('grid-robot-formation-alarm') ?? '{}'));
    expect(saved.history?.[DEMO_ID] ?? []).toEqual([]);
    expect(saved.active).toBe(false);
  });
});
