/**
 * Seite /chart (Modus Formation), Reiter „Bedingungen“: Handelsblock (Einstieg, Stop, Not-SL, TP1, Mesafe, CRV), Veto-Streifen und -Zeile,
 * SIG-29-Zeile und HDL-02-Hinweis (A40.2, A40.3). Die Kerzen sind echte H4-Kerzen aus e2e/fixtures/formation; die Zeitpunkte wurden
 * so gewählt, dass die Treffer ein erfülltes Veto (OBO, LIB), ein CRV unter 1 (OBO, 2618) oder fehlende Werte (ABCD im Aufbau) haben.
 * FRM-39 Handelsblock · FRM-40 Veto
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { named, seedFixtureTrend } from '../fixtures/formation-trend';

// Formationen rechnen auf dem Trendzug des Nutzers (FRM-41); die Fixtures zeigen ihre Formation mit FIXTURE_TREND
test.beforeEach(({ page }) => seedFixtureTrend(page));

const URL = `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}`;
const load = (file: string) => named(`e2e/fixtures/formation/${file}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')))).bars;

async function openPage(page: Page, worker: MockWorker, file: string, now: number, form: string) {
  const narrow = (page.viewportSize()?.width ?? 1280) < 640;
  const bars = load(file);
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = bars.filter((b) => b.time + 14400 <= now).map((b) => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[now - 900, last[4], last[4], last[4], last[4]]] };
  await page.goto(`${URL}&form=${form}`);
  await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  // Unter 640 px ist die Seitenleiste zu und öffnet über dem Chart
  if (narrow) await page.getByTestId('conditions-toggle').click();
  await expect(page.getByTestId('candidate-item').first()).toBeVisible();
}

test.describe('FRM-39 Handelsblock', () => {
  test('Kopf nennt „gezeigt, keine Order“, die Felder stehen mit Werten, Seite und CRV', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'tdf-flag-h4-02', 1770782400, 'LIB');
    const block = page.getByTestId('trade-block');
    await expect(block).toBeVisible();
    await expect(block).toContainText(msg('formation.trade.title'));
    await expect(block).toContainText(msg('formation.trade.disclaimer'));
    await expect(block).toHaveAttribute('data-side', 'buy');
    for (const field of ['entry', 'stop', 'tp1', 'distance', 'crv']) {
      await expect(block.getByTestId(`trade-${field}`)).not.toHaveText(/^\s*—\s*$/);
    }
    await expect(block.getByTestId('trade-stop-emergency')).toBeVisible();
    // CRV 2,89: weder SIG-29 noch HDL-02
    await expect(block.getByTestId('trade-sig29')).toHaveCount(0);
    await expect(block.getByTestId('trade-hdl02')).toHaveCount(0);
  });

  test('Fehlende Werte stehen als „—“ mit Grund; CRV ist dann nicht messbar', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'gar-buy-h4-01', 1761192000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block).toBeVisible();
    await expect(block.getByTestId('trade-entry')).toContainText('—');
    await expect(block.getByTestId('trade-entry-reason')).not.toBeEmpty();
    await expect(block.getByTestId('trade-crv')).toContainText('—');
    await expect(block.getByTestId('trade-sig29')).toHaveCount(0);
  });

  test('CRV unter 1: SIG-29-Zeile mit Zustand und HDL-02-Hinweis (Kauf OBO)', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 't618-buy-h4-01', 1767643200, 'OBO');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-sig29')).toBeVisible();
    await expect(block.getByTestId('trade-sig29')).toHaveAttribute('data-state', /^(met|unmet|unmeasurable)$/);
    await expect(block.getByTestId('trade-hdl02')).toBeVisible();
  });

  test('2618 (ohne Veto): CRV unter 1 zeigt HDL-02, aber weder Veto-Streifen noch Veto-Zeile', { tag: ['@FRM-39', '@FRM-40'] }, async ({ page, worker }) => {
    await openPage(page, worker, 'cdt-top-h4-01', 1761782400, '2618');
    await expect(page.getByTestId('trade-hdl02')).toBeVisible();
    await expect(page.getByTestId('trade-veto')).toHaveCount(0);
    await expect(page.getByTestId('veto-row')).toHaveCount(0);
    await expect(page.getByTestId('veto-badge')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark']) {
    test(`375 px (${theme}): kein Querscroll, der längste Fall (Veto, HDL-02, SIG-29) passt in den Block`, { tag: '@FRM-39' }, async ({ page, worker }) => {
      await page.addInitScript((value) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
      await page.setViewportSize({ width: 375, height: 812 });
      await openPage(page, worker, 't618-buy-h4-01', 1767643200, 'OBO');
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      const block = page.getByTestId('trade-block');
      await expect(block.getByTestId('trade-veto')).toBeVisible();
      await expect(block.getByTestId('trade-hdl02')).toBeVisible();
      await expect(block.getByTestId('trade-sig29')).toBeVisible();
      // Der Block schneidet ab (overflow-hidden): sein Inhalt darf nicht breiter sein als er selbst
      expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await page.getByTestId('conditions-panel').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('Abstand: Pips bei 3 Nachkommastellen (Mock-Symbol), Beschriftung nennt die Einheit', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'tdf-flag-h4-02', 1770782400, 'LIB');
    await expect(page.getByTestId('trade-distance')).toHaveText(/^−[\d.,]+ \/ \+[\d.,]+$/);
    await expect(page.getByTestId('trade-block')).toContainText(msg('formation.trade.distance.pips'));
  });
});

test.describe('FRM-40 Veto', () => {
  test('Erfülltes Veto: Streifen im Block, Zeile in der Dışlama-Gruppe, Abzeichen am Kandidaten; das Urteil bleibt gültig', { tag: '@FRM-40' }, async ({ page, worker }) => {
    await openPage(page, worker, 't618-buy-h4-01', 1767643200, 'OBO');
    await expect(page.getByTestId('candidate-item').first().getByTestId('verdict-pill')).toHaveAttribute('data-verdict', 'valid');
    await expect(page.getByTestId('candidate-item').first().getByTestId('veto-badge')).toBeVisible();
    const block = page.getByTestId('trade-block');
    await expect(block).toHaveAttribute('data-veto', 'true');
    await expect(block.getByTestId('trade-veto')).toContainText('SIG-15');
    const row = page.getByTestId('formation-checklist').getByTestId('veto-row');
    await expect(row).toHaveAttribute('data-rule-id', 'SIG-15');
    await expect(row).toHaveAttribute('data-state', 'excluded');
    await expect(row).toContainText(msg('formation.mark.veto'));
    // Die Zeile steht in der Gruppe Dışlama
    await expect(page.getByTestId('group-exclusion').getByTestId('veto-row')).toHaveCount(1);
  });

  test('Veto nicht erfüllt: Zeile da (Zustand „gerealisiert nicht“), kein Streifen, kein Abzeichen', { tag: '@FRM-40' }, async ({ page, worker }) => {
    await openPage(page, worker, 'cdt-top-h4-01', 1761782400, 'CDT');
    const row = page.getByTestId('formation-checklist').getByTestId('veto-row');
    await expect(row).toHaveAttribute('data-rule-id', 'SIG-16');
    await expect(row).toHaveAttribute('data-state', /^(clear|unmeasurable)$/);
    await expect(page.getByTestId('trade-veto')).toHaveCount(0);
    await expect(page.getByTestId('veto-badge')).toHaveCount(0);
  });
});
