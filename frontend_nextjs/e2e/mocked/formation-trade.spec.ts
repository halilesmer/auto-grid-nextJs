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

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}`;
const load = (file: string) => named(`e2e/fixtures/formation/${file}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')))).bars;

async function openPage(page: Page, worker: MockWorker, file: string, now: number, form: string) {
  const narrow = (page.viewportSize()?.width ?? 1280) < 640;
  const bars = load(file);
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = bars.filter((b) => b.time + 14400 <= now).map((b) => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[now - 900, last[4], last[4], last[4], last[4]]] };
  await page.goto(`${URL}&form=${form}`);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  // Unter 1024 px ist die Karte zu: die Taste „Karte“ öffnet sie über dem Chart, dann der Reiter Bedingungen
  if (narrow) await page.getByTestId('chart-card-open').click();
  await page.getByTestId('chart-card-tab-conditions').click();
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
    for (const field of ['entry', 'stop', 'tp1', 'crv']) {
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

  test('Abstand zum Einstieg: Pips unter Stop und TP1 (3 Nachkommastellen im Mock-Symbol), kein eigenes Feld „Abstand“', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'tdf-flag-h4-02', 1770782400, 'LIB');
    await expect(page.getByTestId('trade-stop-distance')).toHaveText(/^−[\d.,]+ pip$/);
    await expect(page.getByTestId('trade-tp1-distance')).toHaveText(/^\+[\d.,]+ pip$/);
    await expect(page.getByTestId('trade-distance')).toHaveCount(0);
  });

  test('Sichtbarer Text des Blocks nennt keine Regelkennung und kein „CRV“', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 't618-buy-h4-01', 1767643200, 'OBO');
    // Die SIG-29-Zeile ist eine Prüfzeile der Liste mit ihrer Kennung und ihrem Regeltext; alles andere im Block nicht
    const text = await page.getByTestId('trade-block').evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelector('[data-testid="trade-sig29"]')?.remove();
      return copy.innerText ?? copy.textContent ?? '';
    });
    expect(text).not.toMatch(/HDL-\d|ABCD-\d|CRV|SIG-\d/);
  });

  test('ABCD im Aufbau: der Grund nennt keine Regelkennung', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'gar-buy-h4-01', 1761192000, 'ABCD');
    await expect(page.getByTestId('trade-entry-reason')).not.toContainText(/[A-Z]{2,4}-\d/);
  });
});

test.describe('FRM-39 Handelsblock AB=CD (TP2, Ergebnisse in R)', () => {
  test('AB=CD zeigt TP2 mit Anteil und Abstand, drei Ergebnisse in R; ohne Divergenz kein TP3', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000 - 30 * 14400, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-tp2')).not.toHaveText(/^\s*—\s*$/);
    await expect(block.getByTestId('trade-tp2-distance')).toHaveText(/^\+[\d.,]+ pip$/);
    await expect(block.getByTestId('trade-tp3')).toHaveCount(0);
    await expect(block.getByTestId('trade-outcomes')).toContainText(msg('formation.trade.outcome.title'));
    // Verkauf an Level 1 mit 1:1-Stop: TP1 = 0,5 R; TP1 und TP2 = 0,5 × (0,382 + 0,618) / 0,382 R
    await expect(block.getByTestId('trade-outcome-stop')).toContainText('-1,00');
    await expect(block.getByTestId('trade-outcome-tp1')).toContainText('+0,50');
    await expect(block.getByTestId('trade-outcome-tp12')).toContainText('+1,31');
  });

  test('Status TP1 und TP2 alındı: Stop auf dem Einstieg, beide Ziele erreicht, Ergebnis-Kasten hervorgehoben', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'tp12');
    await expect(block.getByTestId('trade-status')).toContainText(msg('formation.trade.status.tp12'));
    await expect(block.getByTestId('trade-stop')).toHaveText(await block.getByTestId('trade-entry').innerText());
    await expect(block.getByTestId('trade-stop-moved')).toContainText(msg('formation.trade.stop.moved'));
    await expect(block.getByTestId('trade-stop-emergency')).toHaveCount(0);
    await expect(block.getByTestId('trade-tp1-state')).toContainText(msg('formation.trade.target.taken'));
    await expect(block.getByTestId('trade-tp2-state')).toContainText(msg('formation.trade.target.taken'));
    await expect(block.getByTestId('trade-outcome-tp12')).toHaveAttribute('data-active', 'true');
    await expect(block.getByTestId('trade-outcome-stop')).toHaveAttribute('data-active', 'false');
  });

  test('Status TP1 und TP2 alındı: der hervorgehobene Kasten zeigt das tatsächliche Ergebnis, die blassen bleiben beim Einstiegswert', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-outcome-tp12')).toHaveAttribute('data-active', 'true');
    // Das mitlaufende Ziel lag beim Erreichen näher am Einstieg als am Einstieg selbst: 1,08 statt 1,31
    await expect(block.getByTestId('trade-outcome-tp12')).toContainText('+1,08');
    await expect(block.getByTestId('trade-outcome-stop')).toContainText('-1,00');
    await expect(block.getByTestId('trade-outcome-tp1')).toContainText('+0,50');
  });

  test('Status TP1 alındı: „bisher“ zeigt das tatsächliche TP1, „TP2 gelirse“ das tatsächliche TP1 plus das aktuelle TP2', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-double-h4-01', 1763452800, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'tp1');
    await expect(block.getByTestId('trade-outcome-tp1')).toHaveAttribute('data-active', 'true');
    await expect(block.getByTestId('trade-outcome-tp1')).toContainText(msg('formation.trade.outcome.sofar'));
    await expect(block.getByTestId('trade-outcome-tp12')).toContainText(msg('formation.trade.outcome.ifTp2'));
    // Gleiche Werte wie am Einstieg (+0,50 / +1,31) wären das Fehlerbild: das mitlaufende Ziel liegt bei Erreichen anders als am Einstieg
    await expect(block.getByTestId('trade-outcome-tp1')).not.toContainText('+0,50');
    await expect(block.getByTestId('trade-outcome-tp12')).not.toContainText('+1,31');
    // Von Hand: Werte aus dem Zählpreis von TP1 und dem aktuellen TP2
    await expect(block.getByTestId('trade-outcome-tp1')).toContainText('+0,43');
    await expect(block.getByTestId('trade-outcome-tp12')).toContainText('+1,19');
    await expect(block.getByTestId('trade-outcome-stop')).toContainText('-1,00');
  });

  test('Status açık: kein Treffer, Stop bleibt, kein Ergebnis-Kasten hervorgehoben', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000 - 30 * 14400, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'open');
    await expect(block.getByTestId('trade-status')).toContainText(msg('formation.trade.status.open'));
    await expect(block.getByTestId('trade-stop-moved')).toHaveCount(0);
    await expect(block.getByTestId('trade-stop-emergency')).toHaveCount(1);
    await expect(block.getByTestId('trade-tp1-state')).toHaveCount(0);
    for (const k of ['stop', 'tp1', 'tp12']) await expect(block.getByTestId(`trade-outcome-${k}`)).toHaveAttribute('data-active', 'false');
  });

  test('Status: Harmonik und andere Formationen haben keine Statuszeile', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'tdf-flag-h4-02', 1770782400, 'LIB');
    await expect(page.getByTestId('trade-block').getByTestId('trade-status')).toHaveCount(0);
  });

  test('Harmonik und andere Formationen: keine TP2-Zelle, kein Ergebnisfeld', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'tdf-flag-h4-02', 1770782400, 'LIB');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-tp2')).toHaveCount(0);
    await expect(block.getByTestId('trade-outcomes')).toHaveCount(0);
  });

  test('375 px: der AB=CD-Block läuft nicht über', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-outcomes')).toBeVisible();
    await expect(block.getByTestId('trade-status')).toBeVisible();
    expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('FRM-39 Handelsblock AB=CD (Erken dönüş, 1114-A4.5)', () => {
  // frz-support-h4-01: Kauf-AB=CD, D dreht in einer Stütze vor Level 1 mit einer Engulf-Kerze; Ziel 1 aus einer Gegenzone, an C keine Zone
  test('Kauf: Status Erken dönüş, Hinweiskasten, Einstieg/Stop/Ziel 1, kein Ziel 2, keine Ergebnisse', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'frz-support-h4-01', 1759766400, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'early');
    await expect(block.getByTestId('trade-status')).toContainText(msg('formation.trade.early'));
    await expect(block.getByTestId('trade-early-note')).toContainText(msg('formation.trade.early.note'));
    await expect(block.getByTestId('trade-entry')).not.toHaveText(/^\s*—\s*$/);
    await expect(block.getByTestId('trade-entry-reason')).toHaveText(msg('formation.trade.early.entry'));
    await expect(block.getByTestId('trade-stop')).not.toHaveText(/^\s*—\s*$/);
    await expect(block.getByTestId('trade-stop-zone')).toContainText(msg('formation.trade.early.stop.below'));
    await expect(block.getByTestId('trade-tp1')).not.toHaveText(/^\s*—\s*$/);
    await expect(block.getByTestId('trade-tp1-note')).toContainText(msg('formation.trade.early.target1.sub'));
    await expect(block.getByTestId('trade-tp2')).toHaveCount(0);
    await expect(block.getByTestId('trade-tp3')).toHaveCount(0);
    await expect(block.getByTestId('trade-outcomes')).toHaveCount(0);
    await expect(block.getByTestId('trade-early-footer')).toContainText(msg('formation.trade.early.footer'));
    await expect(block).toContainText(msg('formation.trade.early.crv'));
    // Hüküm bleibt „im Aufbau“
    await expect(page.getByTestId('candidate-item').first()).toBeVisible();
  });

  // kei-sell-h4-01: Verkauf; in Handelsrichtung liegt keine Zone: Ziel 1 „—“ mit Grund, kein Verhältnis
  test('Verkauf ohne Gegenzone: Ziel 1 „—“ mit Grund, Verhältnis nicht messbar', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'kei-sell-h4-01', 1763668800, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block).toHaveAttribute('data-side', 'sell');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'early');
    await expect(block.getByTestId('trade-stop-zone')).toContainText(msg('formation.trade.early.stop.above'));
    await expect(block.getByTestId('trade-tp1')).toHaveText('—');
    await expect(block.getByTestId('trade-tp1-reason')).toHaveText(msg('formation.trade.reason.noZone'));
    await expect(block.getByTestId('trade-crv')).toHaveText('—');
    await expect(block.getByTestId('trade-tp2')).toHaveCount(0);
    await expect(block.getByTestId('trade-outcomes')).toHaveCount(0);
  });

  test('375 px: der Erken-dönüş-Block läuft nicht über', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, 'frz-support-h4-01', 1759766400, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-early-note')).toBeVisible();
    expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await block.screenshot({ path: test.info().outputPath('early-reversal-375.png') });
  });
});

test.describe('FRM-40 Veto', () => {
  test('Erfülltes Veto: Streifen im Block, Zeile in der Dışlama-Gruppe, Abzeichen am Kandidaten; das Urteil bleibt gültig', { tag: '@FRM-40' }, async ({ page, worker }) => {
    await openPage(page, worker, 't618-buy-h4-01', 1767643200, 'OBO');
    await expect(page.getByTestId('candidate-item').first().getByTestId('verdict-pill')).toHaveAttribute('data-verdict', 'valid');
    await expect(page.getByTestId('candidate-item').first().getByTestId('veto-badge')).toBeVisible();
    const block = page.getByTestId('trade-block');
    await expect(block).toHaveAttribute('data-veto', 'true');
    await expect(block.getByTestId('trade-veto')).toContainText(msg('formation.trade.veto.title'));
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
