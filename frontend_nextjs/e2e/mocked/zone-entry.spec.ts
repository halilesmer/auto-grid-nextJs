/** ZON-13/14 · Einstiegsregel der Zone: Signal-Felder speichern/laden, Infotext und gesperrte Felder. */
import { DEMO_ID, expect, makeZone, test, type Dashboard } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

async function saveAndReload(dashboard: Dashboard) {
  await dashboard.saveAllSettings();
  await dashboard.page.reload();
  await dashboard.selectAccount(DEMO_ID);
}

test.describe('ZON Einstiegsregel', () => {
  test('Signal-Felder werden gespeichert und wieder gelesen', { tag: '@ZON-13' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    // Alte Zone ohne Einstiegsfelder: Standard „Grid“, keine Indikator-Schalter
    await expect(dashboard.zoneField(msg('zone.entry.mode'))).toHaveValue('GRID');
    await expect(dashboard.zoneSwitch(msg('zone.entry.ema'))).toBeHidden();
    await expect(dashboard.zoneField(msg('zone.entry.timeframe'))).toBeDisabled();

    await dashboard.zoneField(msg('zone.entry.mode')).selectOption('SIGNAL_MARKET');
    await dashboard.zoneField(msg('zone.field.orderType')).selectOption('AUTO');
    await dashboard.zoneField(msg('zone.entry.timeframe')).selectOption('M1');
    await dashboard.zoneField(msg('zone.entry.emaPeriod')).fill('20');
    await dashboard.zoneField(msg('zone.entry.rsiBuyBelow')).fill('35');
    await dashboard.zoneSwitch(msg('zone.entry.bb')).click();
    await dashboard.zoneField(msg('zone.entry.bbDeviation')).fill('2.5');
    await dashboard.zoneField(msg('zone.entry.maxBuy')).fill('2');
    await dashboard.zoneField(msg('zone.entry.maxSell')).fill('1');
    await dashboard.zoneField(msg('zone.entry.maxSpread')).fill('0.3');
    await dashboard.zoneField(msg('zone.entry.tpMode')).selectOption('MONEY');
    await dashboard.zoneField(msg('zone.entry.tpMoney')).fill('5');

    await saveAndReload(dashboard);
    await expect(dashboard.zoneField(msg('zone.entry.mode'))).toHaveValue('SIGNAL_MARKET');
    await expect(dashboard.zoneField(msg('zone.field.orderType'))).toHaveValue('AUTO');
    await expect(dashboard.zoneField(msg('zone.entry.bbDeviation'))).toHaveValue('2.5');
    await expect(zone.getByTestId('zone-entry')).toBeVisible();
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      entry_mode: 'SIGNAL_MARKET', order_type: 'AUTO', signal_timeframe: 'M1',
      use_ema: true, ema_period: 20, use_rsi: true, rsi_buy_below: 35, rsi_sell_above: 60,
      use_bollinger: true, bb_deviation: 2.5, max_buy_positions: 2, max_sell_positions: 1,
      max_spread: 0.3, tp_mode: 'MONEY', take_profit_money: 5,
    });
  });

  test('AUTO nur mit Signal; zurück auf Grid setzt BOTH', { tag: '@ZON-13' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    const orderType = dashboard.zoneField(msg('zone.field.orderType'));
    await expect(orderType.locator('option[value="AUTO"]')).toHaveAttribute('disabled', '');

    await dashboard.zoneField(msg('zone.entry.mode')).selectOption('GRID_FILTER');
    await orderType.selectOption('AUTO');
    await dashboard.zoneField(msg('zone.entry.mode')).selectOption('GRID');
    await expect(orderType).toHaveValue('BOTH');
  });

  test('Infotext beschreibt die Regel, gesperrte Felder im Market-/Geld-Modus', { tag: '@ZON-14' }, async ({ worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [
      makeZone({ entry_mode: 'SIGNAL_MARKET', order_type: 'BUY', take_profit: 1, max_buy_positions: 2, max_spread: 0.5 }),
    ];
    await dashboard.open(DEMO_ID);
    const summary = dashboard.zone().getByTestId('zone-entry-summary');
    await expect(summary).toContainText(msg('zone.entry.summary.market'));
    await expect(summary).toContainText(
      msg('zone.entry.summary.buy', {
        rules: [msg('zone.entry.rule.emaAbove', { period: 50 }), msg('zone.entry.rule.rsiBelow', { period: 14, value: 40 })].join(
          msg('zone.entry.summary.and'),
        ),
      }),
    );
    await expect(summary).toContainText(msg('zone.entry.summary.limit', { buy: '2', sell: '5' }));
    await expect(summary).not.toContainText('SELL:');

    // Market-Modus: kein Grid → Grid-Abstand und Stufen gesperrt
    await expect(dashboard.zoneField(msg('zone.field.gridStep'))).toBeDisabled();
    await expect(dashboard.zoneField(msg('zone.breakout.levelsAbove'))).toBeDisabled();

    // Geld-TP: Preis-TP gesperrt, Infotext nennt den Betrag
    await dashboard.zoneField(msg('zone.entry.tpMode')).selectOption('MONEY');
    await expect(dashboard.zoneField(msg('zone.field.takeProfit'))).toBeDisabled();
    await dashboard.zoneField(msg('zone.entry.tpMoney')).fill('3');
    await expect(summary).toContainText(msg('zone.entry.summary.tpMoney', { value: '3' }));
  });
});
