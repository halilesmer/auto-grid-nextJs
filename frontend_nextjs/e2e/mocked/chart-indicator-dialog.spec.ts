/**
 * UI-19 Gösterge ayar penceresi (plan 1106-A2, S2): Girdiler / Stil / Görünürlük sekmeleri, canlı önizleme, İptal, Tamam,
 * Varsayılanlar. Depo sürümü 3 ve sürüm 2 belgelerinin taşınması.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { parseIndicators, visibilityFromSeconds } from '../../src/lib/chart-workspace/indicatorStorage';
import { calculateIndicator, newIndicator, sourceValue, visibleAtInterval, DEFAULT_VISIBILITY } from '../../src/lib/chart-workspace/indicators';

const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const STORAGE = 'grid-robot-chart-workspaces-v1';
const dialog = (page: Page) => page.getByTestId('indicator-settings');

async function openSystemRsiSettings(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(FREE);
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.locator('[data-indicator-id="system-rsi"]').getByRole('button', { name: msg('ind.edit'), exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}
const field = (page: Page, key: Parameters<typeof msg>[0]) => dialog(page).getByLabel(msg(key), { exact: true });

test('UI-19: drei Sekmeler; Girdiler mit Quellen, Glättungstypen, BB-Feld und Formasyon-Hinweis', { tag: '@UI-19' }, async ({ page, worker }) => {
  void worker;
  await openSystemRsiSettings(page);
  await expect(dialog(page).getByRole('tab')).toHaveText([msg('ind.tab.inputs'), msg('ind.tab.style'), msg('ind.tab.visibility')]);
  const sources = await field(page, 'ind.source').locator('option').allTextContents();
  expect(sources).toEqual(['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'].map(k => msg(`ind.src.${k}` as Parameters<typeof msg>[0])));
  const smoothing = await field(page, 'ind.smoothType').locator('option').allTextContents();
  expect(smoothing).toEqual(['none', 'SMA', 'BB', 'EMA', 'RMA', 'WMA'].map(k => msg(`ind.sm.${k}` as Parameters<typeof msg>[0])));
  // BB deviation works only with "SMA + Bollinger Bands"
  await expect(field(page, 'ind.bbDeviation')).toBeDisabled();
  await field(page, 'ind.smoothType').selectOption('BB');
  await expect(field(page, 'ind.bbDeviation')).toBeEnabled();
  await field(page, 'ind.smoothType').selectOption('none');
  // Formation warning: not shown with 7 / Close / chart, shown otherwise, and the button goes back
  await expect(page.getByTestId('formation-rsi-warning')).toHaveCount(0);
  await field(page, 'ind.rsiLength').fill('14');
  await expect(page.getByTestId('formation-rsi-warning')).toBeVisible();
  await page.getByRole('button', { name: msg('ind.formationBack'), exact: true }).click();
  await expect(page.getByTestId('formation-rsi-warning')).toHaveCount(0);
  await expect(field(page, 'ind.rsiLength')).toHaveValue('7');
});

test('UI-19: Stil – Zeichnungstyp, Bollinger- und Divergenzgruppe nur bei Bedarf, Bandwerte, Zeilenfenster', { tag: '@UI-19' }, async ({ page, worker }) => {
  void worker;
  await openSystemRsiSettings(page);
  await dialog(page).getByRole('tab', { name: msg('ind.tab.style') }).click();
  await expect(dialog(page).locator('[data-style-row]')).toHaveCount(8);
  await expect(dialog(page).locator('[data-group="bollinger"]')).toHaveCount(0);
  await expect(dialog(page).locator('[data-group="divergence"]')).toHaveCount(0);
  await expect(field(page, 'ind.bandValue.upper')).toHaveValue('80');
  await expect(field(page, 'ind.bandValue.lower')).toHaveValue('20');
  // Plot type shows on the chart at once
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-rsi-plot', 'line');
  await dialog(page).getByRole('button', { name: msg('ind.plotType'), exact: true }).click();
  await page.getByRole('button', { name: msg('ind.plot.area'), exact: true }).click();
  await expect(chart).toHaveAttribute('data-rsi-plot', 'area');
  // Row panel: width and pattern of the upper band
  await dialog(page).locator('[data-style-trigger="upper"]').click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: msg('ind.ls.dotted'), exact: true }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key) ?? '', STORAGE)).toContain('"upper":{"width":3,"lineStyle":"dotted"}');
});

test('UI-19: Bollinger- und Divergenzgruppe erscheinen mit ihrem Schalter', { tag: '@UI-19' }, async ({ page, worker }) => {
  void worker;
  await openSystemRsiSettings(page);
  await field(page, 'ind.smoothType').selectOption('BB');
  await page.getByRole('checkbox', { name: msg('cw.divergence') }).check();
  await dialog(page).getByRole('tab', { name: msg('ind.tab.style') }).click();
  await expect(dialog(page).locator('[data-group="bollinger"] [data-style-row]')).toHaveCount(3);
  await expect(dialog(page).locator('[data-group="divergence"] [data-style-row]')).toHaveCount(2);
});

test('UI-19: İptal macht alles rückgängig, Tamam behält; Statuszeile zeigt die Eingaben', { tag: '@UI-19' }, async ({ page, worker }) => {
  void worker;
  await openSystemRsiSettings(page);
  const legend = page.locator('[data-indicator-value="RSI"]');
  await field(page, 'ind.rsiLength').fill('21');
  await expect(legend).toContainText('(21)'); // live preview
  await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  await expect(legend).toContainText('(7)');
  // OK keeps; inputs in the status line change the text to "RSI 21 Kapanış"
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.locator('[data-indicator-id="system-rsi"]').getByRole('button', { name: msg('ind.edit'), exact: true }).click();
  await field(page, 'ind.rsiLength').fill('21');
  await dialog(page).getByRole('tab', { name: msg('ind.tab.style') }).click();
  await page.getByRole('checkbox', { name: msg('ind.statusInputs') }).check();
  await page.getByRole('button', { name: msg('ind.ok'), exact: true }).click();
  await expect(legend).toContainText(`RSI 21 ${msg('ind.src.close')}`);
  await page.reload();
  await expect(page.locator('[data-indicator-value="RSI"]')).toContainText(`RSI 21 ${msg('ind.src.close')}`);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').version, STORAGE)).toBe(3);
});

test('UI-19: Görünürlük – Saat-Bereich blendet auf H4 aus; Varsayılanlar: sıfırla und kaydet', { tag: '@UI-19' }, async ({ page, worker }) => {
  void worker;
  await openSystemRsiSettings(page);
  await dialog(page).getByRole('tab', { name: msg('ind.tab.visibility') }).click();
  await expect(dialog(page).getByRole('checkbox')).toHaveCount(3);
  await field(page, 'ind.vis.hour.to').fill('1');
  await page.getByRole('button', { name: msg('ind.ok'), exact: true }).click();
  await page.getByRole('radio', { name: 'H4', exact: true }).click();
  await expect(page.locator('[data-indicator-row="RSI"]')).toHaveAttribute('data-drawn', 'false');
  await page.getByRole('radio', { name: 'H1', exact: true }).click();
  await expect(page.locator('[data-indicator-row="RSI"]')).toHaveAttribute('data-drawn', 'true');
  // Reset restores the factory look of the system RSI
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.locator('[data-indicator-id="system-rsi"]').getByRole('button', { name: msg('ind.edit'), exact: true }).click();
  await field(page, 'ind.rsiLength').fill('9');
  await dialog(page).getByRole('button', { name: msg('ind.defaults'), exact: true }).click();
  await page.getByRole('button', { name: msg('ind.reset'), exact: true }).click();
  await expect(field(page, 'ind.rsiLength')).toHaveValue('7');
  // Save as default: a new RSI starts from it
  await field(page, 'ind.rsiLength').fill('9');
  await dialog(page).getByRole('button', { name: msg('ind.defaults'), exact: true }).click();
  await page.getByRole('button', { name: msg('ind.saveDefault'), exact: true }).click();
  await page.getByRole('button', { name: msg('ind.ok'), exact: true }).click();
  await page.getByRole('button', { name: msg('cw.indicators'), exact: true }).click();
  await page.getByRole('button', { name: '+ RSI', exact: true }).click();
  await expect(field(page, 'ind.rsiLength')).toHaveValue('9');
});

test('UI-19: Kaynak (Y+D+K+K)/4, Sichtbarkeitsregeln und Taşıma von Version 2', { tag: '@UI-19' }, () => {
  expect(sourceValue({ time: 0, open: 1, high: 4, low: 2, close: 6 }, 'hlcc4')).toBe((4 + 2 + 12) / 4);
  const rsi = calculateIndicator(Array.from({ length: 12 }, (_, i) => ({ time: i * 60, open: i, high: i + 1, low: i, close: i + (i % 3) })), { ...newIndicator('RSI'), period: 3, source: 'hlcc4', smoothing: 'none' });
  expect(rsi.main.at(-1)).not.toBeNull();
  expect(visibleAtInterval(DEFAULT_VISIBILITY, 60)).toBe(true);
  expect(visibleAtInterval({ ...DEFAULT_VISIBILITY, hour: { on: true, from: 1, to: 1 } }, 14400)).toBe(false);
  expect(visibleAtInterval({ ...DEFAULT_VISIBILITY, day: false }, 86400)).toBe(false);
  expect(visibleAtInterval({ ...DEFAULT_VISIBILITY, minute: { on: false, from: 1, to: 59 } }, 900)).toBe(false);
  // Version 2 stored one range of seconds
  expect(visibilityFromSeconds(0, 3600)).toMatchObject({ minute: { on: true }, hour: { on: true }, day: false });
  const [old] = parseIndicators([{ id: 'x', kind: 'RSI', period: 21, minTimeframe: 0, maxTimeframe: 3600, source: 'hlc3' }]);
  expect(old.period).toBe(21);
  expect(old.visibility.day).toBe(false);
  expect(old.plotType).toBe('line'); expect(old.precision).toBe(-1); expect(old.statusInputs).toBe(false); expect(old.rowStyles).toEqual({});
  // Unknown or malformed values fall back
  const [bad] = parseIndicators([{ id: 'y', kind: 'RSI', plotType: 'cube', precision: 99, rowStyles: { upper: { color: 'red', width: 9, opacity: 500, lineStyle: 'dashed' } }, visibility: { hour: { on: true, from: 30, to: 2 } } }]);
  expect(bad.plotType).toBe('line'); expect(bad.precision).toBe(-1);
  expect(bad.rowStyles).toEqual({ upper: { opacity: 100, lineStyle: 'dashed' } });
  expect(bad.visibility.hour).toEqual({ on: true, from: 2, to: 24 });
});
