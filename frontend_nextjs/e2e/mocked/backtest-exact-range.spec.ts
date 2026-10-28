/**
 * BKT-15 · Backtest-Zeitraum sekundengenau: Zeitfelder im Zeitraum-Panel (Brokerzeit), Adresse `ft=`/`tt=`.
 * Die Grenzen in MT5-Sekunden prüft server-time.spec.ts (rangeBounds).
 */
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`;

test.describe('BKT-15 Zeitraum mit Uhrzeit', () => {
  test('Datum und Uhrzeit übernehmen, Adresse trägt sie, Neuladen behält sie', { tag: '@BKT-15' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
    await page.goto(URL);
    await page.getByTestId('range-trigger').click();
    await page.getByTestId('range-from').fill('22.10.26');
    await page.getByTestId('range-to').fill('28.10.26');
    await page.getByTestId('bt-time-from').fill('09:30:00');
    await page.getByTestId('bt-time-to').fill('17:45:30');
    await page.getByTestId('range-apply').click();
    await expect(page).toHaveURL(/from=2026-10-22&to=2026-10-28&ft=09%3A30%3A00&tt=17%3A45%3A30/);
    await expect(page.getByTestId('range-trigger')).toContainText('09:30:00');
    await expect(page.getByTestId('range-trigger')).toContainText('17:45:30');

    await page.reload();
    await expect(page.getByTestId('range-trigger')).toContainText('09:30:00');
    await page.getByTestId('range-trigger').click();
    await expect(page.getByTestId('bt-time-from')).toHaveValue('09:30:00');
    await expect(page.getByTestId('bt-time-to')).toHaveValue('17:45:30');
  });

  test('Ungültige Uhrzeit und Ende vor Start sperren „Übernehmen“', { tag: '@BKT-15' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
    await page.goto(URL);
    await page.getByTestId('range-trigger').click();
    await page.getByTestId('range-from').fill('28.10.26');
    await page.getByTestId('range-to').fill('28.10.26');
    await expect(page.getByTestId('range-apply')).toBeEnabled();
    await page.getByTestId('bt-time-from').fill('25:00:00');
    await expect(page.getByTestId('range-apply')).toBeDisabled();
    await page.getByTestId('bt-time-from').fill('12:00:00');
    await page.getByTestId('bt-time-to').fill('11:59:59');
    await expect(page.getByTestId('range-apply')).toBeDisabled();
    await page.getByTestId('bt-time-to').fill('12:00:01');
    await expect(page.getByTestId('range-apply')).toBeEnabled();
  });
});
