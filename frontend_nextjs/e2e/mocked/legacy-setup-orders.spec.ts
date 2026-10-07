/**
 * ENG-29 Fraktal-Zusatz-Setups entfernt: Meldet der Bot noch Pending Orders früherer Setups, fragt das
 * Dashboard einmal, ob sie gelöscht werden; die Wahl landet in den Einstellungen (LEGACY_SETUP_ORDERS).
 */
import type { LiveOrder } from '../../src/store/types';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, makeZone, test, type Dashboard, type MockWorker } from '../fixtures/test';

const LEGACY_ORDER: LiveOrder = {
  ticket: 9001,
  symbol: 'USOUSD',
  magic: 200001,
  type: 4,
  volume: 0.02,
  price_open: 98,
  sl: 0,
  tp: 0,
  time: null,
};

/** Fraktal-Zone mit den alten Setup-Feldern; der Bot meldet eine Order eines früheren Setups. */
function seed(worker: MockWorker, orders: LiveOrder[] = [LEGACY_ORDER]) {
  worker.setZones(DEMO_ID, [
    {
      ...makeZone({ magic: 200001, entry_mode: 'fractal', order_type: 'BUY', fractal_timeframe: 'H4' }),
      fractal_setups: [{ sid: 2, id: 's2', fractal_timeframe: 'M15' }],
      fractal_setup_seq: 2,
      fractal_kept_sids: [3],
    },
  ]);
  worker.setBotRunning(DEMO_ID);
  worker.setMetrics(DEMO_ID, { legacy_setup_orders: orders });
}

const dialogOf = (dashboard: Dashboard) => dashboard.page.getByRole('dialog');

test.describe('ENG-29 Orders entfernter Fraktal-Setups', () => {
  test('Fenster fragt; „Orders behalten“ speichert keep und fragt nicht wieder', { tag: '@ENG-29' }, async ({ worker, dashboard }) => {
    seed(worker);
    await dashboard.open(DEMO_ID);
    const dialog = dialogOf(dashboard);
    await expect(dialog.getByText(msg('zone.legacyOrders.title'))).toBeVisible();
    await expect(dialog).toContainText('USOUSD');
    // Die Zone zeigt keine Setup-Bedienung mehr
    await expect(dashboard.zone().getByTestId('fractal-setup-add')).toHaveCount(0);

    await dialog.getByRole('button', { name: msg('zone.legacyOrders.keep') }).click();
    await expect(dialog).toHaveCount(0);
    expect(worker.settingsOf(DEMO_ID).LEGACY_SETUP_ORDERS).toBe('keep');

    await dashboard.page.reload();
    await dashboard.selectAccount(DEMO_ID);
    await expect(dashboard.zone()).toBeVisible();
    await expect(dialogOf(dashboard)).toHaveCount(0);
  });

  test('„Orders löschen“ speichert delete', { tag: '@ENG-29' }, async ({ worker, dashboard }) => {
    seed(worker);
    await dashboard.open(DEMO_ID);
    await dialogOf(dashboard).getByRole('button', { name: msg('zone.legacyOrders.delete') }).click();
    await expect(dialogOf(dashboard)).toHaveCount(0);
    expect(worker.settingsOf(DEMO_ID).LEGACY_SETUP_ORDERS).toBe('delete');
  });

  test('Abbrechen speichert nichts und fragt nach dem Neuladen wieder', { tag: '@ENG-29' }, async ({ worker, dashboard }) => {
    seed(worker);
    await dashboard.open(DEMO_ID);
    await dialogOf(dashboard).getByRole('button', { name: msg('common.cancel') }).click();
    await expect(dialogOf(dashboard)).toHaveCount(0);
    expect(worker.settingsOf(DEMO_ID).LEGACY_SETUP_ORDERS).toBeUndefined();

    await dashboard.page.reload();
    await dashboard.selectAccount(DEMO_ID);
    await expect(dialogOf(dashboard).getByText(msg('zone.legacyOrders.title'))).toBeVisible();
  });

  test('Ohne alte Orders kein Fenster; Speichern entfernt die alten Setup-Felder', { tag: '@ENG-29' }, async ({ worker, dashboard }) => {
    seed(worker, []);
    await dashboard.open(DEMO_ID);
    await expect(dashboard.zone()).toBeVisible();
    await expect(dialogOf(dashboard)).toHaveCount(0);

    await dashboard.zone().getByTestId('fractal-timeframe').selectOption('H1');
    await dashboard.saveAllSettings();
    await expect.poll(() => worker.zonesOf(DEMO_ID)[0].fractal_timeframe).toBe('H1');
    expect(worker.zonesOf(DEMO_ID)[0].fractal_setups).toBeUndefined();
    expect(worker.zonesOf(DEMO_ID)[0].fractal_setup_seq).toBeUndefined();
    expect(worker.zonesOf(DEMO_ID)[0].fractal_kept_sids).toBeUndefined();
    expect(worker.zonesOf(DEMO_ID)[0].entry_mode).toBe('fractal');
  });
});
