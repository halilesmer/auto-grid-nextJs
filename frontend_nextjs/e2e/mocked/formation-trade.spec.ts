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
import { fixtureTrend, named, seedFixtureTrend } from '../fixtures/formation-trend';
import { zig } from '../fixtures/formation-rows';

// Formationen rechnen auf dem Trendzug des Nutzers (FRM-41); die Fixtures zeigen ihre Formation mit FIXTURE_TREND
test.beforeEach(({ page }) => seedFixtureTrend(page));

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}`;
const load = (file: string) => named(`e2e/fixtures/formation/${file}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')))).bars;

async function openPage(page: Page, worker: MockWorker, file: string, now: number, form: string, tweak?: (bars: ReturnType<typeof load>) => void, series?: { D1?: number[][]; H1?: number[][] }) {
  const narrow = (page.viewportSize()?.width ?? 1280) < 640;
  const bars = load(file);
  tweak?.(bars);
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = bars.filter((b) => b.time + 14400 <= now).map((b) => [b.time, b.open, b.high, b.low, b.close]);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: series?.D1 ?? [], H4: rows, H1: series?.H1 ?? [], M15: [[now - 900, last[4], last[4], last[4], last[4]]] };
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
    // Die Plan-Zeile trägt die Einstiegswerte (+0,50 / +1,31); die große Zahl ist der tatsächliche Wert
    await expect(block.getByTestId('trade-outcome-tp1')).toHaveText(`${msg('formation.trade.outcome.sofar')}+0,43${msg('formation.trade.outcome.plan', { value: '+0,50' })}`);
    await expect(block.getByTestId('trade-outcome-tp12')).toHaveText(`${msg('formation.trade.outcome.ifTp2')}+1,19${msg('formation.trade.outcome.plan', { value: '+1,31' })}`);
    // Von Hand: Werte aus dem Zählpreis von TP1 und dem aktuellen TP2
    await expect(block.getByTestId('trade-outcome-tp1')).toContainText('+0,43');
    await expect(block.getByTestId('trade-outcome-tp12')).toContainText('+1,19');
    await expect(block.getByTestId('trade-outcome-stop')).toContainText('-1,00');
  });

  test('Status TP1 alındı: unter dem tatsächlichen Wert steht der Plan-Wert, der Hinweis nennt beide', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-double-h4-01', 1763452800, 'ABCD');
    const block = page.getByTestId('trade-block');
    const sofar = block.getByTestId('trade-outcome-tp1');
    const ifTp2 = block.getByTestId('trade-outcome-tp12');
    // Groß der tatsächliche Wert, klein darunter der Wert vom Einstieg
    await expect(sofar).toContainText('+0,43');
    await expect(block.getByTestId('trade-outcome-plan-tp1')).toHaveText(msg('formation.trade.outcome.plan', { value: '+0,50' }));
    await expect(block.getByTestId('trade-outcome-plan-tp12')).toHaveText(msg('formation.trade.outcome.plan', { value: '+1,31' }));
    // Hiza: die drei Kästen (auch der ungewrappte Stop-Kasten) haben gleiche obere und untere Kante
    const edges = await block.locator('[data-testid^="trade-outcome-"][data-active]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }));
    expect(edges).toHaveLength(3);
    for (const [top, bottom] of edges) {
      expect(Math.abs(top - edges[0][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(bottom - edges[0][1])).toBeLessThanOrEqual(1);
    }
    // Der Stop-Kasten hat keine Plan-Zeile
    await expect(block.getByTestId('trade-outcome-plan-stop')).toHaveCount(0);
    // Hover: beide Werte im Hinweis
    await sofar.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText(msg('formation.trade.outcome.diff.actual', { value: '+0,43' }));
    await expect(tip).toContainText(msg('formation.trade.outcome.diff.plan', { value: '+0,50' }));
    await expect(tip).toContainText(msg('formation.trade.outcome.diff.drift'));
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
    // Tastaturfokus am bedingten Kasten: erste Zeile ist die „wenn TP2 kommt“-Fassung
    await page.keyboard.press('Tab');
    await ifTp2.focus();
    await expect(ifTp2).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText(msg('formation.trade.outcome.diff.ifTp2', { value: '+1,19' }));
    await expect(page.getByRole('tooltip')).toContainText(msg('formation.trade.outcome.diff.plan', { value: '+1,31' }));
  });

  test('Status açık: keine Plan-Zeile, solange noch kein Ziel erreicht ist', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000 - 30 * 14400, 'ABCD');
    await expect(page.getByTestId('trade-block').locator('[data-testid^="trade-outcome-plan-"]')).toHaveCount(0);
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

test.describe('FRM-39 Handelsblock AB=CD (großes Ziel bei harmonischem D, 1114-A4.3)', () => {
  // gar-buy-h4-03: Kauf-AB=CD mit Gartley-D; 1765569600 Einstieg erreicht und offen, 1765584000 TP1 erreicht
  test('Harmonisches D: Drittel bei TP1, TP2 und großem Ziel, Aktivierungstext unter dem Wert, vier Ergebnisse, kein 0,786-Ziel', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'gar-buy-h4-03', 1765569600, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-tpBig')).not.toHaveText(/^\s*—\s*$/);
    await expect(block.getByTestId('trade-tpBig-distance')).toHaveText(/^\+[\d.,]+ pip$/);
    await expect(block.getByTestId('trade-tpBig-note')).toContainText(/A \(/);
    await expect(block.getByTestId('trade-tp3')).toHaveCount(0);
    for (const f of ['tp1', 'tp2', 'tpBig']) await expect(block.getByTestId(`trade-${f}`).locator('..')).toContainText('⅓');
    await expect(block.getByTestId('trade-outcomes').locator('[data-testid^="trade-outcome-"]')).toHaveCount(4);
    await expect(block.getByTestId('trade-outcome-stop')).toContainText('-1,00');
    await expect(block.getByTestId('trade-outcome-tp123')).toContainText(msg('formation.trade.outcome.tp123'));
  });

  test('TP1 erreicht: Statuszeile nennt den Stop des Rests am Einstieg, „bisher“ steht beim TP1-Weg', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'gar-buy-h4-03', 1765584000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'tp1');
    await expect(block.getByTestId('trade-status')).toContainText(msg('formation.trade.status.tp1.big.sub'));
    await expect(block.getByTestId('trade-outcome-tp1')).toHaveAttribute('data-active', 'true');
    await expect(block.getByTestId('trade-outcome-tp123')).toContainText(msg('formation.trade.outcome.ifBig'));
  });

  test('375 px: der Block mit großem Ziel läuft nicht über', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, 'gar-buy-h4-03', 1765569600, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-tpBig')).toBeVisible();
    expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('Ohne harmonisches D: weiter zwei Anteile, drei Ergebnisse, kein großes Ziel', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000 - 30 * 14400, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-tpBig')).toHaveCount(0);
    await expect(block.getByTestId('trade-outcomes').locator('[data-testid^="trade-outcome-"]')).toHaveCount(3);
    await expect(block.getByTestId('trade-tp2').locator('..')).toContainText('½');
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

test.describe('FRM-39 Handelsblock AB=CD (Yeniden giriş, 1114-A4.4)', () => {
  // Sentetik (1120-A47.1): crb-form-h4-01 mit flacherem Docht der Einstiegskerze (Index 199: Tief 100,30 statt 100,142). Kauf-AB=CD, Einstieg 100,57;
  // TP1 (100,617) und TP2 (100,812) liegen über dem Einstieg und zählen in Kerze 200, danach berührt der Kurs die Engulf-Zone am D erneut.
  // Im echten Fixture zieht der Docht 100,142 TP1 auf 100,519 unter den Einstieg; das zählt seit 1120-A35.1 nicht (Test „Schutz“ unten).
  const profitTargets = (bars: ReturnType<typeof load>) => {
    bars[199].low = 100.3;
  };

  test('Nach zwei Zielen: Yeniden-giriş-Abschnitt mit Einstieg, Stop, Ziel und eigenem Verhältnis; das Ergebnis des ersten Handels bleibt', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD', profitTargets);
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'tp12');
    await expect(block.getByTestId('trade-outcomes')).toBeVisible();
    const re = block.getByTestId('trade-reentry');
    await expect(re).toBeVisible();
    await expect(re).toContainText(msg('formation.trade.reentry.title'));
    await expect(re).toContainText(msg('formation.trade.reentry.sub'));
    await expect(re.getByTestId('trade-reentry-entry')).not.toHaveText(/^\s*—\s*$/);
    await expect(re).toContainText(msg('formation.trade.reentry.entry.buy'));
    await expect(re.getByTestId('trade-reentry-stop')).not.toHaveText(/^\s*—\s*$/);
    await expect(re).toContainText(msg('formation.trade.reentry.stop.buy'));
    await expect(re.getByTestId('trade-reentry-target')).toBeVisible();
    await expect(re).toContainText(msg('formation.trade.reentry.note.buy'));
    await expect(re).toContainText(msg('formation.trade.reentry.footer'));
    await expect(re.getByTestId('trade-reentry-crv')).toBeVisible();
    // Keine Aufteilung und keine Ergebnisfelder im Abschnitt; keine Warnzeile
    await expect(re.locator('[data-testid^="trade-outcome-"]')).toHaveCount(0);
    await expect(block.getByTestId('trade-reentry-warning')).toHaveCount(0);
    // Kein Kürzel und keine Regelkennung im Text des Abschnitts
    await expect(re).not.toContainText(/ABCD-\d|HDL-\d|SIG-\d|TP\d/);
  });

  // gar-buy-h4-01: nur TP1 erreicht (Rest am Einstieg), der Kurs kehrt in die Engulf-Zone am D zurück
  test('Nur TP1 erreicht und Kurs zurück in der Zone: keine Werte, eine Warnzeile', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'gar-buy-h4-01', 1763064000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-reentry')).toHaveCount(0);
    await expect(block.getByTestId('trade-reentry-warning')).toContainText(msg('formation.trade.reentry.warning'));
    await expect(block.getByTestId('trade-outcomes')).toBeVisible();
  });

  test('Ohne Rückkehr in die Zone: weder Abschnitt noch Warnzeile', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'abcd-buy-h4-02', 1752624000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-reentry')).toHaveCount(0);
    await expect(block.getByTestId('trade-reentry-warning')).toHaveCount(0);
  });

  // Ende am Stop (1121-A14.1): im echten crb-form-h4-01 liegt der Docht D 100,142 jenseits des Stops 100,356 (ohne Schluss dort). Vor 1121-A14.1
  // zog er TP1 auf 100,519 unter den Einstieg 100,57 und der Schutz aus 1120-A35.1 hielt den Handel offen; jetzt endet die Ziel-Fib am Stop,
  // TP1 und TP2 liegen über dem Einstieg und zählen, und der Kurs kehrt danach in die Engulf-Zone zurück
  test('Ende am Stop: TP1 und TP2 auf der Gewinnseite zählen, der Yeniden-giriş-Abschnitt erscheint, keine Warnzeile', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD');
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', 'tp12');
    await expect(block.getByTestId('trade-reentry')).toBeVisible();
    await expect(block.getByTestId('trade-reentry-warning')).toHaveCount(0);
  });

  test('375 px: Abschnitt und Warnzeile laufen nicht über', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD', profitTargets);
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-reentry')).toBeVisible();
    expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await block.getByTestId('trade-reentry').scrollIntoViewIfNeeded();
    await block.getByTestId('trade-reentry').screenshot({ path: test.info().outputPath('reentry-375.png') });
  });
  // Sentetik (kein Fixture hat zwei Ziele): wie profitTargets, dazu ein höheres Hoch der Berührungskerze (Index 201). Das Hoch reicht dann in beide Widerstandszonen:
  // Ziel 1 = nahe Kante der nächsten (101,123), Ziel 2 = nahe Kante der weiteren (101,403).
  const twoTargets = (bars: ReturnType<typeof load>) => {
    profitTargets(bars);
    bars[201].high = 101.5;
  };

  test('Zwei Ziele: zwei Zellen „Ziel 1“ und „Ziel 2“, zwei Verhältnis-Zeilen (nur die erste mit Balken), eigener Fußtext', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD', twoTargets);
    const re = page.getByTestId('trade-block').getByTestId('trade-reentry');
    await expect(re).toBeVisible();
    await expect(re).toContainText(msg('formation.trade.reentry.target1'));
    await expect(re).toContainText(msg('formation.trade.reentry.target2'));
    await expect(re).toContainText(msg('formation.trade.reentry.target.buy'));
    await expect(re).toContainText(msg('formation.trade.reentry.target2.buy'));
    await expect(re.getByTestId('trade-reentry-target')).toContainText(/101[.,]123/);
    await expect(re.getByTestId('trade-reentry-target2')).toContainText(/101[.,]403/);
    await expect(re).toContainText(msg('formation.trade.reentry.crv1'));
    await expect(re).toContainText(msg('formation.trade.reentry.crv2'));
    await expect(re.getByTestId('trade-reentry-crv')).not.toHaveText(/^\s*—\s*$/);
    await expect(re.getByTestId('trade-reentry-crv2')).not.toHaveText(/^\s*—\s*$/);
    // Balken nur bei der ersten Zeile
    await expect(re.locator('span.block.bg-danger')).toHaveCount(1);
    await expect(re).toContainText(msg('formation.trade.reentry.footer2'));
    await expect(re).not.toContainText(msg('formation.trade.reentry.footer'));
    await expect(re.locator('[data-testid^="trade-outcome-"]')).toHaveCount(0);
    await expect(re).not.toContainText(/ABCD-\d|HDL-\d|SIG-\d|TP\d/);
  });

  test('Ein Ziel: keine Zelle „Ziel 2“, keine zweite Verhältnis-Zeile, Text wie bisher', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD', profitTargets);
    const re = page.getByTestId('trade-block').getByTestId('trade-reentry');
    await expect(re.getByTestId('trade-reentry-target')).toBeVisible();
    await expect(re.getByTestId('trade-reentry-target2')).toHaveCount(0);
    await expect(re.getByTestId('trade-reentry-crv2')).toHaveCount(0);
    await expect(re).toContainText(msg('formation.trade.reentry.crv'));
    await expect(re).not.toContainText(msg('formation.trade.reentry.target1'));
  });

  test('375 px: der Abschnitt mit zwei Zielen läuft nicht über', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD', twoTargets);
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-reentry-target2')).toBeVisible();
    expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await block.getByTestId('trade-reentry').scrollIntoViewIfNeeded();
    await block.getByTestId('trade-reentry').screenshot({ path: test.info().outputPath('reentry-two-targets-375.png') });
  });
});

// ---- C ayağı (2026-11-16): AB=CD'de D'ye (seviye 1) ulaşılmadan, C'den D'ye doğru ters yönde işlem ---------------------------------------
// Gerçek fixture'lar tek zaman dilimlidir (H4). Üst trend için günlük kerzeler H4'ten türetilir (6 H4 = 1 gün); alt zaman dilimi dönüş mumu sentetiktir.
const d1Of = (file: string, now: number): number[][] => {
  const groups = new Map<number, ReturnType<typeof load>>();
  for (const b of load(file)) {
    const k = Math.floor(b.time / 86400) * 86400;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return [...groups]
    .filter(([k, v]) => v.length === 6 && k + 86400 <= now)
    .map(([k, v]) => [k, v[0].open, Math.max(...v.map((b) => b.high)), Math.min(...v.map((b) => b.low)), v[5].close]);
};

// abcd-breakc-h4-01: Satış-AB=CD (alış C ayağı), C = 1785240000 ve 1,32729. C'de bölge yok. Saatlik dolgu kerzeleri C'den 60 saat öncesinden başlar;
// `engulf` ile C'den 8 saat sonra düşen (ayı) ve onu saran (boğa) iki saatlik kerze eklenir (sentetik).
const BREAKC = { file: 'abcd-breakc-h4-01', now: 1785744000, c: { time: 1785240000, price: 1.32729 }, range: 0.0031716667 };
const h1Of = (engulf: boolean, hours = 8): number[][] => {
  const { c, range: r } = BREAKC;
  const rows: number[][] = [];
  for (let ts = c.time - 60 * 3600; ts < c.time + hours * 3600; ts += 3600) rows.push([ts, c.price, c.price + 0.01 * r, c.price, c.price + 0.005 * r]);
  if (engulf) {
    rows.push([c.time + hours * 3600, c.price + 0.3 * r, c.price + 0.32 * r, c.price, c.price + 0.05 * r]);
    rows.push([c.time + (hours + 1) * 3600, c.price + 0.04 * r, c.price + 0.45 * r, c.price, c.price + 0.4 * r]);
  }
  return rows;
};
/**
 * Seit der Regel „Farbe in zwei Kerzen“ (2026-11-19) wählt der Trend der abgeleiteten Tageskerzen von BREAKC das echte Hoch vom 15.07. (1,35575)
 * statt des tieferen Hochs vom 20.07. (1,34805). Der Schluss der letzten Tageskerze liegt darunter, der frühere Wechsel nach oben (31.07.) entfällt.
 * Für den Zustand des Tests (höherer Trend läuft aufwärts, gegen den Verkauf-AB=CD) schließt die letzte Tageskerze deshalb über diesem Hoch (sentetik).
 */
const liftedD1 = (rows: number[][], above: number): number[][] =>
  rows.map((r, i) => (i === rows.length - 1 ? [r[0], r[1], Math.max(r[2], above), r[3], above] : r));
const openCLeg = async (page: Page, worker: MockWorker, o: { file: string; now: number }, h1?: number[][]) => {
  await seedFixtureTrend(page, fixtureTrend(o.file), true);
  const d1 = o.file === BREAKC.file ? liftedD1(d1Of(o.file, o.now), 1.3565) : d1Of(o.file, o.now);
  await openPage(page, worker, o.file, o.now, 'ABCD', undefined, { D1: d1, ...(h1 ? { H1: h1 } : {}) });
};
// Saatlik küçük AB=CD (sentetik): B'den başlayan düz dolgu, sonra a 1,3373 (tepe), b 1,3313, c 1,3343 (derinlik 0,5), d 1,3273 (seviye 1 = 1,3283);
// d, C mumunun ilk saatinde (C + 1 saat) biter. Ölçek: fiyat = 1,3273 + (x − 79) · 0,00015.
const smallAbcdH1 = (): number[][] => {
  const B = 1784145600;
  const price = (x: number) => 1.3273 + (x - 79) * 0.00015;
  const z = zig([140, 100, 120, 79], 16, 3);
  const start = BREAKC.c.time + 3600 - (z.length - 4) * 3600;
  const rows: number[][] = [];
  for (let ts = B; ts < start; ts += 3600) rows.push([ts, price(137.8), price(137.8) + 0.00002, price(137.8) - 0.00002, price(137.8)]);
  z.forEach(([o, h, l, c], i) => rows.push([start + i * 3600, price(o), price(h), price(l), price(c)]));
  return rows;
};
// bat-sell-h4-01: Alış-AB=CD (satış C ayağı), C'de güçlü fraktal bölgesi (kart 9)
const ZONE_CASE = { file: 'bat-sell-h4-01', now: 1762401600 };

test.describe('FRM-39 Handelsblock AB=CD (C ayağı)', () => {
  test('Kart 9: C’de bölge var → zorunlu 3/3, takviye 1/3, giriş/stop/hedef ve oran', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, ZONE_CASE);
    const cl = page.getByTestId('trade-block').getByTestId('trade-cleg');
    await expect(cl).toBeVisible();
    await expect(cl).toHaveAttribute('data-variant', 'zone');
    await expect(cl).toContainText(msg('formation.trade.cleg.title'));
    await expect(cl).toContainText(msg('formation.trade.cleg.sub'));
    await expect(cl.getByTestId('trade-cleg-dir')).toHaveText(msg('formation.trade.cleg.dir.sell'));
    await expect(cl.getByTestId('trade-cleg-group-required')).toHaveAttribute('data-count', '3/3');
    await expect(cl.getByTestId('trade-cleg-group-bonus')).toHaveAttribute('data-count', '1/3');
    for (const key of ['depth', 'trend', 'noDivergence', 'zone']) await expect(cl.getByTestId(`trade-cleg-row-${key}`)).toHaveAttribute('data-state', 'met');
    // yalnız günlük kerzeler yüklü: alt zaman dilimi yok, dönüş mumu takviye ve karşılanmamış
    await expect(cl.getByTestId('trade-cleg-row-candle')).toHaveAttribute('data-state', /^(unmet|unmeasurable)$/);
    await expect(cl.getByTestId('trade-cleg-row-lowerAbcd')).toHaveAttribute('data-state', 'unmeasurable');
    await expect(cl.getByTestId('trade-cleg-value-depth')).toHaveText(/^0[.,]\d{3}$/);
    await expect(cl.getByTestId('trade-cleg-row-zone')).toContainText(msg('formation.trade.cleg.row.zone.sell'));
    await expect(cl.getByTestId('trade-cleg-row-noDivergence')).toContainText(msg('formation.trade.cleg.row.noDivergence.sell'));
    for (const f of ['entry', 'stop', 'target', 'crv']) await expect(cl.getByTestId(`trade-cleg-${f}`)).not.toHaveText(/^\s*—\s*$/);
    await expect(cl).toContainText(msg('formation.trade.cleg.target.sub'));
    await expect(cl.getByTestId('trade-cleg-footer')).toHaveText(msg('formation.trade.cleg.footer'));
    await expect(cl.getByTestId('trade-cleg-waiting')).toHaveCount(0);
    // Kural kimliği ve kısaltma yok; pay ve sonuç kutuları yok
    await expect(cl).not.toContainText(/ABCD-\d|HDL-\d|SIG-\d|TP\d/);
    await expect(cl.locator('[data-testid^="trade-outcome-"]')).toHaveCount(0);
  });

  test('Kart 10: C’de bölge yok, alt zaman diliminde dönüş mumu var → zorunlu 4/4, takviye 0/2, giriş mumun kapanışı', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, BREAKC, h1Of(true));
    const cl = page.getByTestId('trade-block').getByTestId('trade-cleg');
    await expect(cl).toHaveAttribute('data-variant', 'candle');
    await expect(cl.getByTestId('trade-cleg-dir')).toHaveText(msg('formation.trade.cleg.dir.buy'));
    await expect(cl.getByTestId('trade-cleg-group-required')).toHaveAttribute('data-count', '4/4');
    await expect(cl.getByTestId('trade-cleg-group-bonus')).toHaveAttribute('data-count', '0/2');
    await expect(cl.getByTestId('trade-cleg-row-candle')).toHaveAttribute('data-state', 'met');
    await expect(cl.getByTestId('trade-cleg-value-candle')).toHaveText(msg('formation.trade.cleg.tf.H1'));
    await expect(cl.getByTestId('trade-cleg-row-zone')).toHaveAttribute('data-state', 'unmet');
    await expect(cl).toContainText(msg('formation.trade.cleg.entry.candle'));
    await expect(cl).toContainText(msg('formation.trade.cleg.stop.candle.buy'));
    for (const f of ['entry', 'stop', 'target', 'crv']) await expect(cl.getByTestId(`trade-cleg-${f}`)).not.toHaveText(/^\s*—\s*$/);
  });

  test('Alt zaman diliminde AB=CD karşılanınca satır yeşil ve sağda zaman diliminin adı görünür; zorunlu satırlar ve değerler bundan etkilenmez', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, BREAKC, smallAbcdH1());
    const cl = page.getByTestId('trade-block').getByTestId('trade-cleg');
    await expect(cl).toBeVisible();
    const row = cl.getByTestId('trade-cleg-row-lowerAbcd');
    await expect(row).toHaveAttribute('data-state', 'met');
    await expect(cl.getByTestId('trade-cleg-value-lowerAbcd')).toHaveText(msg('formation.trade.cleg.tf.H1'));
    // takviye grubunda sayılır; zorunlu grup sayısı değişmez (mum satırı zorunlu ve karşılanmamış)
    await expect(cl.getByTestId('trade-cleg-group-bonus')).toHaveAttribute('data-count', '1/2');
    // bölge ve dönüş mumu yok: değerler yine yok, bekleme satırı durur
    await expect(cl.getByTestId('trade-cleg-waiting')).toHaveText(msg('formation.trade.cleg.waiting'));
    await expect(cl.getByTestId('trade-cleg-entry')).toHaveCount(0);
  });

  test('Bekleme satırı: bölge yok, mum yok → değer yok, “C ayağı bekleniyor” satırı', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, BREAKC, h1Of(false));
    const cl = page.getByTestId('trade-block').getByTestId('trade-cleg');
    await expect(cl).toBeVisible();
    await expect(cl.getByTestId('trade-cleg-group-required')).toHaveAttribute('data-count', '3/4');
    await expect(cl.getByTestId('trade-cleg-row-candle')).toHaveAttribute('data-state', 'unmet');
    await expect(cl.getByTestId('trade-cleg-waiting')).toHaveText(msg('formation.trade.cleg.waiting'));
    for (const f of ['entry', 'stop', 'target', 'crv']) await expect(cl.getByTestId(`trade-cleg-${f}`)).toHaveCount(0);
  });

  test('Üst zaman dilimi yüklü değil: trend ve dönüş mumu ölçülemedi, değer yok, bekleme satırı yok', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await seedFixtureTrend(page, fixtureTrend(BREAKC.file), true);
    await openPage(page, worker, BREAKC.file, BREAKC.now, 'ABCD');
    const cl = page.getByTestId('trade-block').getByTestId('trade-cleg');
    await expect(cl.getByTestId('trade-cleg-row-trend')).toHaveAttribute('data-state', 'unmeasurable');
    await expect(cl.getByTestId('trade-cleg-row-candle')).toHaveAttribute('data-state', 'unmeasurable');
    await expect(cl.getByTestId('trade-cleg-waiting')).toHaveCount(0);
    await expect(cl.getByTestId('trade-cleg-entry')).toHaveCount(0);
  });

  // Geçmişe ait giriş: C ancak sağındaki iki mum kapandıktan sonra tanınır; giriş N mum önce, fiyat şimdi girişten uzakta
  test('Geçmişe ait not: bölge girişi (satış, fiyat girişin üstünde) → “2 mum önce” ve girişin gerisinde', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, ZONE_CASE);
    const cl = page.getByTestId('trade-cleg');
    // C ayağı girişi C mumunda (temas); görünümde C’den sonra 2 mum var. Son kapanış 177,053, giriş 176,763: satışta giriş alınabilir tarafın gerisinde, fark 29,0 pip
    await expect(cl.getByTestId('trade-cleg-past')).toHaveText(msg('formation.trade.cleg.past.many', { n: '2' }));
    const gap = cl.getByTestId('trade-cleg-past-gap');
    await expect(gap).toHaveAttribute('data-side', 'behind');
    await expect(gap).toHaveText(msg('formation.trade.cleg.past.behind', { d: msg('formation.trade.away.pips', { n: '29,0' }) }));
  });

  test('Geçmişe ait not: rozetin ipucu sola açılır, giriş fiyatı hücresini örtmez', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, ZONE_CASE);
    const cl = page.getByTestId('trade-cleg');
    const badge = cl.getByTestId('trade-cleg-past');
    await badge.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toHaveText(msg('formation.trade.cleg.past.hint'));
    const [t, b, e] = await Promise.all([tip.boundingBox(), badge.boundingBox(), cl.getByTestId('trade-cleg-entry').boundingBox()]);
    if (!t || !b || !e) throw new Error('kutu yok');
    // rozetin solunda (sağ kenar rozetin sol kenarını aşmaz)
    expect(t.x + t.width).toBeLessThanOrEqual(b.x + 0.5);
    // giriş fiyatı hücresiyle kesişmez
    const overlap = t.x < e.x + e.width && t.x + t.width > e.x && t.y < e.y + e.height && t.y + t.height > e.y;
    expect(overlap).toBe(false);
  });

  test('Geçmişe ait not: mum girişi (alış, fiyat girişin üstünde) → “20 mum önce” ve girişin ötesinde', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, BREAKC, h1Of(true));
    const cl = page.getByTestId('trade-cleg');
    // Dönüş mumu C’den 9 saat sonra açılır = H4 kerzesi C + 2; görünümde 272 kerze, C = 249 → 271 − 251 = 20
    await expect(cl.getByTestId('trade-cleg-past')).toHaveText(msg('formation.trade.cleg.past.many', { n: '20' }));
    const gap = cl.getByTestId('trade-cleg-past-gap');
    await expect(gap).toHaveAttribute('data-side', 'beyond');
    await expect(gap).toHaveText(msg('formation.trade.cleg.past.beyond', { d: msg('formation.trade.away.pips', { n: '1,9' }) }));
    await expect(gap).not.toContainText(/ABCD-\d|HDL-\d|SIG-\d/);
  });

  test('Geçmişe ait not: giriş son mumda (N = 0) ve bekleme hâlinde rozet ve satır yok', { tag: '@FRM-39' }, async ({ page, worker }) => {
    // Dönüş mumu (saatlik) görünümün son H4 kerzesinde açılır (C + 22): 0 mum önce
    await openCLeg(page, worker, BREAKC, h1Of(true, 136));
    const cl = page.getByTestId('trade-cleg');
    await expect(cl).toHaveAttribute('data-variant', 'candle');
    await expect(cl.getByTestId('trade-cleg-entry')).toBeVisible();
    await expect(cl.getByTestId('trade-cleg-past')).toHaveCount(0);
    await expect(cl.getByTestId('trade-cleg-past-gap')).toHaveCount(0);
  });

  test('Geçmişe ait not: tek mum önce → tekil metin', { tag: '@FRM-39' }, async ({ page, worker }) => {
    // Dönüş mumu sondan bir önceki H4 kerzesinde açılır (C + 21): 1 mum önce
    await openCLeg(page, worker, BREAKC, h1Of(true, 132));
    await expect(page.getByTestId('trade-cleg-past')).toHaveText(msg('formation.trade.cleg.past.one', { n: '1' }));
  });

  test('Geçmişe ait not: bekleme hâlinde (giriş yok) rozet ve satır yok', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, BREAKC, h1Of(false));
    const cl = page.getByTestId('trade-cleg');
    await expect(cl.getByTestId('trade-cleg-waiting')).toBeVisible();
    await expect(cl.getByTestId('trade-cleg-past')).toHaveCount(0);
    await expect(cl.getByTestId('trade-cleg-past-gap')).toHaveCount(0);
  });

  test('Geçmişe ait rozet: fareyle ve klavye odağıyla ipucu açılır', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, ZONE_CASE);
    const badge = page.getByTestId('trade-cleg').getByTestId('trade-cleg-past');
    await badge.hover();
    await expect(page.getByRole('tooltip')).toContainText(msg('formation.trade.cleg.past.hint'));
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await badge.focus({ timeout: 5000 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(badge).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText(msg('formation.trade.cleg.past.hint'));
  });

  test('Geçmişe ait rozet sütun hizasını bozmaz: ipucu sarmalayıcısı rozetle aynı genişlikte, girişin sol kenarında', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openCLeg(page, worker, ZONE_CASE);
    const cl = page.getByTestId('trade-cleg');
    const badge = cl.getByTestId('trade-cleg-past');
    const wrapper = badge.locator('xpath=..');
    const [b, w, entry, stop, cell] = await Promise.all([
      badge.boundingBox(),
      wrapper.boundingBox(),
      cl.getByTestId('trade-cleg-entry').boundingBox(),
      cl.getByTestId('trade-cleg-stop').boundingBox(),
      cl.getByTestId('trade-cleg-entry').locator('xpath=..').boundingBox(),
    ]);
    expect(b && w && entry && stop && cell).toBeTruthy();
    expect(Math.abs(w!.width - b!.width)).toBeLessThanOrEqual(0.5);
    expect(b!.width).toBeLessThan(cell!.width * 0.7);
    expect(Math.abs(b!.x - entry!.x)).toBeLessThanOrEqual(0.5);
    // Stop-Spalte beginnt rechts der Giriş-Zelle, auf derselben Zeile wie der Stop-Wert über dem Hinweis
    expect(stop!.x).toBeGreaterThan(cell!.x + cell!.width - 0.5);
    expect(Math.abs(stop!.y - entry!.y)).toBeLessThanOrEqual(1);
  });

  test('Seviye 1’e ulaşılmışsa bölüm yok', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'crb-form-h4-01', 1763496000, 'ABCD');
    await expect(page.getByTestId('trade-block')).toBeVisible();
    await expect(page.getByTestId('trade-cleg')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`375 px, ${theme} tema: bölüm yatay kaydırma üretmez`, { tag: '@FRM-39' }, async ({ page, worker }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.addInitScript((value) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
      await openCLeg(page, worker, ZONE_CASE);
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      const block = page.getByTestId('trade-block');
      await expect(block.getByTestId('trade-cleg')).toBeVisible();
      expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await block.getByTestId('trade-cleg').scrollIntoViewIfNeeded();
      await block.getByTestId('trade-cleg').screenshot({ path: test.info().outputPath(`cleg-375-${theme}.png`) });
    });
  }
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

test.describe('FRM-39 Handelsblock: Hinweis „harmonisches D gebrochen“ (1120-A14.2)', () => {
  // gar-buy-h4-03, Einstieg offen (1765569600); die letzte sichtbare Kerze schließt unter X: Ziel bleibt (am Einstieg festgelegt), ABCD-16 wird ☐
  const breakX = (bars: ReturnType<typeof load>, now: number) => {
    const shown = bars.filter((b) => b.time + 14400 <= now);
    const lo = Math.min(...shown.slice(-60, -1).map((b) => b.low));
    const b = shown[shown.length - 1];
    b.close = b.low = lo - 0.0005;
  };

  test('Ohne Bruch kein Hinweis', { tag: '@FRM-39' }, async ({ page, worker }) => {
    await openPage(page, worker, 'gar-buy-h4-03', 1765569600, 'ABCD');
    await expect(page.getByTestId('trade-block').getByTestId('trade-tpBig')).toBeVisible();
    await expect(page.getByTestId('trade-tpBig-broken-note')).toHaveCount(0);
  });

  test('Harmonisches D nach dem Einstieg gebrochen: großes Ziel bleibt, Hinweis steht darunter', { tag: '@FRM-39' }, async ({ page, worker }) => {
    const now = 1765569600 + 14400;
    await openPage(page, worker, 'gar-buy-h4-03', now, 'ABCD', (bars) => breakX(bars, now));
    const block = page.getByTestId('trade-block');
    await expect(block.getByTestId('trade-tpBig')).not.toHaveText(/^\s*—\s*$/);
    await expect(block.getByTestId('trade-tpBig-broken-note')).toHaveText(msg('formation.trade.big.harmonicBroken'));
  });
});
