/**
 * UI-18 Ein einziger RSI (Plan 1106-A2): der System-RSI(7) ist ein gewöhnlicher Indikator mit fester Kennung `system-rsi`.
 * Er ersetzt den Standard-RSI(14); Löschen schaltet nur die Ebene aus; alte Dokumente wandern auf ihn; die Achse zeigt nur die Bänder.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const SETUP = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const STORAGE = 'grid-robot-chart-workspaces-v1';
const rows = (page: Page) => page.locator('[data-indicator-row="RSI"]');

for (const [name, url] of [['frei', FREE], ['Setup', SETUP]] as const) {
  test(`UI-18 ${name}: genau ein RSI, RSI(7) mit zwei Nachkommastellen, kein Setup-Schalter RSI (14)`, { tag: '@UI-18' }, async ({ page, worker }) => {
    void worker;
    await page.goto(url);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
    await expect(rows(page)).toHaveCount(1);
    const text = page.locator('[data-indicator-value="RSI"]');
    await expect(text).toContainText('RSI (7)');
    await expect(text).toHaveText(/\d+[.,]\d{2}$/);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-rsi-scale', '20:80:32:10');
    expect(await page.evaluate(key => localStorage.getItem(key) ?? '', STORAGE)).not.toContain('initial-RSI');
  });
}

test('UI-18: Mülleimer und Menüpunkt schalten nur die Ebene aus, der Schalter im Menü Ebenen holt sie zurück', { tag: '@UI-18' }, async ({ page, worker }) => {
  void worker;
  await page.goto(FREE);
  const chart = page.getByTestId('analysis-chart');
  await expect(rows(page)).toHaveCount(1);
  await rows(page).locator('svg.lucide-trash-2').click();
  await expect(rows(page)).toHaveCount(0);
  await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
  await page.getByRole('button', { name: msg('cw.layers'), exact: true }).click();
  await expect(page.locator('#layer-rsi')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#layer-rsi').click();
  await expect(rows(page)).toHaveCount(1);
  // The eye hides the line but keeps the layer
  await rows(page).locator('svg.lucide-eye').click();
  await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: msg('cw.layers'), exact: true }).click();
  await expect(page.locator('#layer-rsi')).toHaveAttribute('aria-checked', 'true');
});

test('UI-18: ein gespeichertes Dokument der Version 1 wandert auf den neuen RSI, Nutzer-RSIs bleiben', { tag: '@UI-18' }, async ({ page, worker }) => {
  void worker;
  await page.goto(FREE);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: msg('cw.layers'), exact: true }).click();
  await page.locator('#layer-wave').click(); // creates the document
  const key = await page.evaluate(storage => Object.keys(JSON.parse(localStorage.getItem(storage) || '{}').documents ?? {})[0], STORAGE);
  expect(key).toBeTruthy();
  await page.evaluate(([storage, docKey]) => {
    const raw = JSON.parse(localStorage.getItem(storage) || '{}');
    raw.version = 1;
    raw.documents[docKey] = { drawings: '[]', images: {}, alarms: [], overlays: { rsi: true, wave: true },
      indicators: [{ id: 'initial-RSI', kind: 'RSI' }, { id: 'user-rsi', kind: 'RSI', period: 21 }], systemPanes: { rsi: { hidden: true } }, paneOrder: ['rsi', 'wave', 'user-rsi'] };
    localStorage.setItem(storage, JSON.stringify(raw));
  }, [STORAGE, key] as const);
  await page.reload();
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  // system RSI (hidden by the old eye) + the user's RSI(21); the old default RSI(14) is gone
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator('[data-system-row="rsi"] svg.lucide-eye-off')).toHaveCount(1);
  await expect(page.locator('[data-indicator-value="RSI"]').filter({ hasText: '(14)' })).toHaveCount(0);
  await expect(page.locator('[data-indicator-value="RSI"]').filter({ hasText: '(21)' })).toHaveCount(1);
});
