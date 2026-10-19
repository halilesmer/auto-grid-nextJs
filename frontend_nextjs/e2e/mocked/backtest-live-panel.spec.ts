/**
 * Seite /backtest: Live-Vergleich-Bereich erscheint genau einmal (BKT-14) und die Setup-Karten zeigen fünfstellige
 * Forex-Werte (BKT-08). Beides fiel beim Probelauf mit 24 Setups auf.
 */
import { fmt, msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`;

test('Live-Vergleich steht nach dem Öffnen und sechs Setups genau einmal da, ohne doppelten Schlüssel', { tag: '@BKT-14' }, async ({ page, worker }) => {
  worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
  const duplicateKeyWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('two children with the same key')) duplicateKeyWarnings.push(message.text());
  });
  await page.goto(URL);
  await expect(page.getByTestId('bt-setup')).toHaveCount(1);

  await page.getByTestId('bt-live-toggle').click();
  await expect(page.getByTestId('bt-live')).toHaveCount(1);
  const add = page.getByRole('button', { name: msg('backtest.setups.add'), exact: true });
  for (let n = 2; n <= 6; n += 1) {
    await add.click();
    await expect(page.getByTestId('bt-setup')).toHaveCount(n);
  }

  await expect(page.getByTestId('bt-live')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: msg('backtest.live.title'), exact: true })).toHaveCount(1);
  await expect(page.getByTestId('lc-saved')).toHaveCount(1);
  expect(duplicateKeyWarnings).toEqual([]);
});

test('Setup-Karte zeigt Abstand, TP und Lot fünfstelliger Forex-Werte vollständig', { tag: '@BKT-08' }, async ({ page, worker }) => {
  worker.setZones(DEMO_ID, [makeZone({ grid_step: 0.0004, take_profit: 0.00085, lot_size: 0.01, magic: 200001 })]);
  await page.goto(URL);
  await expect(page.getByTestId('bt-setup')).toHaveCount(1);
  const expected = msg('backtest.setups.parameters', { step: fmt().number(0.0004, { maximumFractionDigits: 8 }), tp: fmt().number(0.00085, { maximumFractionDigits: 8 }), lot: '0,01' });
  expect(expected).toBe('Adım 0,0004 · TP 0,00085 · Lot 0,01');
  await expect(page.getByTestId('bt-setup').first()).toContainText(expected);
});
