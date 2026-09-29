/** ZON · Zonen-Konfiguration: jedes Feld wird angezeigt, gespeichert und nach dem Neuladen wieder gelesen. */
import { DEMO_ID, RUNNING_METRICS, ZONE_ID, expect, makeZone, test, type Dashboard } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

/** Speichern, Seite neu laden, Konto wieder wählen (prüft den Rundweg über den Worker). */
async function saveAndReload(dashboard: Dashboard) {
  await dashboard.saveAllSettings();
  await dashboard.page.reload();
  await dashboard.selectAccount(DEMO_ID);
}

test.describe('ZON Zonen', () => {
  test('Zone hinzufügen', { tag: '@ZON-01' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('zone.panel.add') }).click();
    await expect(page.getByTestId('zone-count')).toHaveText('2');
    // Neue Zone übernimmt das Symbol der letzten Zone und startet ausgeschaltet
    await expect(dashboard.zone(1).getByPlaceholder(/Sembol Ara/)).toHaveValue('USOUSD');
    await expect(dashboard.zone(1).getByRole('button', { name: msg('zone.header.off') })).toBeVisible();

    await saveAndReload(dashboard);
    await expect(dashboard.page.getByTestId('zone-card')).toHaveCount(2);
    expect(worker.zonesOf(DEMO_ID)).toHaveLength(2);
    expect(worker.zonesOf(DEMO_ID)[1]).toMatchObject({ symbol: 'USOUSD', is_active: false });
  });

  test('Zone löschen', { tag: '@ZON-02' }, async ({ page, worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [
      makeZone(),
      makeZone({ id: 'zone-e2e-2', symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
    ];
    await dashboard.open(DEMO_ID);
    await dashboard.zone(0).getByRole('button', { name: msg('zone.header.menu') }).click();
    await page.getByRole('button', { name: msg('zone.header.delete') }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(msg('zone.delete.message'));
    await modal.getByRole('button', { name: msg('account.action.delete') }).click();

    await expect(page.getByTestId('zone-card')).toHaveCount(1);
    await saveAndReload(dashboard);
    await expect(page.getByTestId('zone-card')).toHaveCount(1);
    await expect(dashboard.zone().getByPlaceholder(/Sembol Ara/)).toHaveValue('XAUUSD');
    expect(worker.zonesOf(DEMO_ID).map((z) => z.id)).toEqual(['zone-e2e-2']);
  });

  test('Basisfelder: Symbol, Emir Tipi, Min/Max Fiyat', { tag: '@ZON-03' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    const symbol = zone.getByPlaceholder(/Sembol Ara/);
    await symbol.fill('XAUUSD');
    await symbol.press('Escape');
    await dashboard.zoneField(msg('zone.field.orderType')).selectOption('SELL');
    await dashboard.zoneField(msg('zone.field.minPrice')).fill('1800');
    await dashboard.zoneField(msg('zone.field.maxPrice')).fill('2000.5');
    await expect(zone.getByText('SELL', { exact: true }).first()).toBeVisible();
    await expect(zone).toContainText('1800 – 2000.5');

    await saveAndReload(dashboard);
    await expect(symbol).toHaveValue('XAUUSD');
    await expect(dashboard.zoneField(msg('zone.field.orderType'))).toHaveValue('SELL');
    await expect(dashboard.zoneField(msg('zone.field.minPrice'))).toHaveValue('1800');
    await expect(dashboard.zoneField(msg('zone.field.maxPrice'))).toHaveValue('2000.5');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      symbol: 'XAUUSD', order_type: 'SELL', min_price: 1800, max_price: 2000.5,
    });
  });

  test('Grid-Felder: Grid Adımı, Lot, Kar Al, Zarar Durdur', { tag: '@ZON-04' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const values = { [msg('zone.field.gridStep')]: '0.25', Lot: '0.02', [msg('zone.field.takeProfit')]: '0.75', [msg('zone.field.stopLoss')]: '1.5' };
    for (const [label, value] of Object.entries(values)) {
      await dashboard.zoneField(label).fill(value);
    }
    await saveAndReload(dashboard);
    for (const [label, value] of Object.entries(values)) {
      await expect(dashboard.zoneField(label)).toHaveValue(value);
    }
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      grid_step: 0.25, lot_size: 0.02, take_profit: 0.75, stop_loss: 1.5,
    });
  });

  test('Zahlenfelder nehmen nur so viele Nachkommastellen an wie das Symbol', { tag: '@ZON-04' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    const grid = dashboard.zoneField(msg('zone.field.gridStep'));
    await grid.clear();
    await grid.pressSequentially('0.123456');
    await expect(grid).toHaveValue('0.123');

    const lot = dashboard.zoneField('Lot');
    await lot.clear();
    await lot.pressSequentially('0.12345');
    await expect(lot).toHaveValue('0.12');
  });

  test('SELL-Felder nur bei BOTH ohne Sync', { tag: '@ZON-05' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    const sync = dashboard.zoneSwitch(msg('zone.sync'));
    await expect(sync).toBeHidden();

    await dashboard.zoneField(msg('zone.field.orderType')).selectOption('BOTH');
    await expect(sync).toHaveAttribute('aria-checked', 'true');
    await expect(zone.getByText(msg('zone.field.sellGrid'))).toBeHidden();
    await expect(dashboard.zoneField(msg('zone.field.gridStep'))).toBeVisible();

    await sync.click();
    await expect(sync).toHaveAttribute('aria-checked', 'false');
    await expect(dashboard.zoneField(msg('zone.field.buyGrid'))).toBeVisible();
    const sell = { [msg('zone.field.sellGrid')]: '0.3', [msg('chart.zone.sellLot')]: '0.03', [msg('zone.field.sellTakeProfit')]: '0.6', [msg('zone.field.sellStopLoss')]: '2' };
    for (const [label, value] of Object.entries(sell)) {
      await dashboard.zoneField(label).fill(value);
    }

    await saveAndReload(dashboard);
    for (const [label, value] of Object.entries(sell)) {
      await expect(dashboard.zoneField(label)).toHaveValue(value);
    }
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      order_type: 'BOTH', sync_buy_sell: false,
      sell_grid_step: 0.3, sell_lot_size: 0.03, sell_take_profit: 0.6, sell_stop_loss: 2,
    });
  });

  test('Breakout-Felder', { tag: '@ZON-06' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    const pullback = zone.getByText(msg('zone.breakout.minPullback')).locator('xpath=..').locator('input');
    await expect(pullback).toBeDisabled();

    await dashboard.zoneSwitch(msg('zone.breakout.trendOnly')).click();
    await expect(pullback).toBeEnabled();
    // BUY + Breakout: nur Level oberhalb zählen, „Alt Seviyeler“ ist gesperrt
    await expect(dashboard.zoneField(msg('zone.breakout.levelsBelow'))).toBeDisabled();
    await pullback.fill('0.8');
    await dashboard.zoneField(msg('zone.breakout.levelsAbove')).fill('4');
    await dashboard.zoneField(msg('chart.zone.maxPositions')).fill('8');

    await saveAndReload(dashboard);
    await expect(pullback).toHaveValue('0.8');
    await expect(dashboard.zoneField(msg('zone.breakout.levelsAbove'))).toHaveValue('4');
    await expect(dashboard.zoneField(msg('chart.zone.maxPositions'))).toHaveValue('8');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      is_breakout: true, pullback_distance: 0.8, levels_above: 4, max_positions: 8,
    });
  });

  test('Exit-Felder erscheinen mit dem Schalter', { tag: '@ZON-07' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await expect(zone.getByText(msg('zone.exit.side'))).toBeHidden();

    await dashboard.zoneSwitch(msg('zone.exit.clearOnExit')).click();
    for (const label of [msg('zone.exit.side'), msg('zone.exit.target'), msg('zone.exit.scope'), msg('zone.exit.trigger')]) {
      await expect(dashboard.zoneField(label)).toBeVisible();
    }
    await expect(zone.getByText(msg('zone.exit.timeframe'))).toBeHidden();

    await dashboard.zoneField(msg('zone.exit.side')).selectOption('BUY (Yukarı)');
    await dashboard.zoneField(msg('zone.exit.target')).selectOption('Sadece SELL İşlemleri');
    await dashboard.zoneField(msg('zone.exit.scope')).selectOption('Tüm İşlemler');
    await dashboard.zoneField(msg('zone.exit.trigger')).selectOption('Mum Kapanışı');
    await dashboard.zoneField(msg('zone.exit.timeframe')).selectOption('H1');

    await saveAndReload(dashboard);
    await expect(dashboard.zoneField(msg('zone.exit.timeframe'))).toHaveValue('H1');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      clear_on_exit: true,
      clear_exit_side: 'BUY (Yukarı)',
      clear_target_side: 'Sadece SELL İşlemleri',
      clear_scope: 'Tüm İşlemler',
      exit_condition: 'Mum Kapanışı',
      exit_timeframe: 'H1',
    });
  });

  test('Start/Pause pro Zone bei laufendem Bot', { tag: '@ZON-08' }, async ({ worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await zone.getByRole('button', { name: msg('zone.header.started') }).click();
    await expect(zone.getByRole('button', { name: msg('zone.header.start'), exact: true })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '0': 'PAUSE' });
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ id: ZONE_ID, is_active: false });

    await zone.getByRole('button', { name: msg('zone.header.start'), exact: true }).click();
    await expect(zone.getByRole('button', { name: msg('zone.header.started') })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '0': 'START' });
  });

  test('Start/Pause: Bot aus, ungespeicherte Zone, ungültiges Symbol', { tag: '@ZON-08' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(dashboard.zone().getByRole('button', { name: msg('zone.header.ready') })).toBeVisible();

    await page.getByRole('button', { name: msg('zone.panel.add') }).click();
    const toggleNew = () => dashboard.zone(1).getByRole('button', { name: msg('zone.header.off') }).click();
    expect(await dashboard.withDialog(toggleNew)).toContain('henüz kaydedilmemiş');
    // Zustand wird zurückgesetzt, nichts an den Motor geschickt
    await expect(dashboard.zone(1).getByRole('button', { name: msg('zone.header.off') })).toBeVisible();
    expect(worker.callsTo('POST', `/api/ui-state/${DEMO_ID}`)).toHaveLength(0);

    await dashboard.zone(1).getByPlaceholder(/Sembol Ara/).fill('FOOBAR');
    expect(await dashboard.withDialog(toggleNew)).toContain('Hatalı Sembol');
  });

  test('Vom Motor gestoppte Zone neu starten', { tag: '@ZON-08' }, async ({ worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'AUTO_CLEAR' } });
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await expect(zone.getByText(msg('zone.stop.autoClear.label'))).toBeVisible();

    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'START' } });
    await zone.getByRole('button', { name: msg('zone.header.restart') }).click();
    await expect(zone.getByText(msg('zone.stop.autoClear.label'))).toBeHidden();
    await expect(zone.getByRole('button', { name: msg('zone.header.started') })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '0': 'START' });
    // is_active bleibt unverändert, nur der Motorzustand wird gesetzt
    expect(worker.callsTo('POST', `/api/settings/${DEMO_ID}`)).toHaveLength(0);
  });

  test('Telefon-Stopp sperrt den Zonen-Button', { tag: '@ZON-08' }, async ({ worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { ...RUNNING_METRICS, remote_paused: true });
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await expect(zone.getByText(msg('zone.stop.remote.label'))).toBeVisible();
    await expect(zone.getByRole('button', { name: msg('bot.status.stopped') })).toBeDisabled();
  });

  test('„Kaydedilmedi“-Badge', { tag: '@ZON-09' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const badge = dashboard.zone().getByText(msg('zone.header.unsaved'), { exact: true });
    await expect(badge).toBeHidden();

    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    await expect(badge).toBeVisible();
    await dashboard.saveAllSettings();
    await expect(badge).toBeHidden();

    await page.getByRole('button', { name: msg('zone.panel.add') }).click();
    await expect(dashboard.zone(1).getByText(msg('zone.header.unsaved'), { exact: true })).toBeVisible();
  });
  test('Einzelne Zone speichern', { tag: '@ZON-11' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    await page.getByRole('button', { name: msg('zone.panel.add') }).click();
    const first = dashboard.zone(0);
    const second = dashboard.zone(1);
    const badge = (zone: typeof first) => zone.getByText(msg('zone.header.unsaved'), { exact: true });
    await expect(first.getByTestId('zone-save')).toBeEnabled();

    // Nur die neue Zone speichern: Zone 1 und der globale Zustand bleiben ungespeichert
    await second.getByTestId('zone-save').click();
    await expect(badge(second)).toBeHidden();
    await expect(second.getByTestId('zone-save')).toBeDisabled();
    expect(worker.zonesOf(DEMO_ID)).toHaveLength(2);
    expect(worker.zonesOf(DEMO_ID)[0]).not.toMatchObject({ lot_size: 0.05 });
    await expect(badge(first)).toBeVisible();
    await expect(dashboard.saveAll).toHaveText(msg('saveBar.saveAll'));

    await first.getByTestId('zone-save').click();
    await expect(badge(first)).toBeHidden();
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ lot_size: 0.05 });
  });

  test('Zahlenfelder lassen sich leeren und neu tippen', { tag: '@ZON-10' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    const min = dashboard.zoneField(msg('zone.field.minPrice'));
    await min.click();
    await min.press('ControlOrMeta+a');
    await min.press('Backspace');
    await expect(min).toHaveValue('');

    await min.pressSequentially('0.05');
    await expect(min).toHaveValue('0.05');

    await min.press('ControlOrMeta+a');
    await min.press('Backspace');
    await min.blur();
    await expect(min).toHaveValue('0');
  });

  test('Symbol-Richtwerte in den Hinweisen', { tag: '@ZON-12' }, async ({ page, worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [
      makeZone({ symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
      makeZone({ id: 'zone-e2e-2', symbol: 'FOOBAR', min_price: 1, max_price: 2 }),
    ];
    await dashboard.open(DEMO_ID);
    const tooltip = page.getByRole('tooltip');
    const hintOf = (zone: number, label: string) =>
      dashboard
        .zone(zone)
        .locator('label')
        .filter({ has: page.getByText(label, { exact: true }) })
        .getByTestId('field-hint');

    await hintOf(0, msg('zone.field.gridStep')).hover();
    await expect(tooltip).toContainText(msg('zone.field.gridStep.hint'));
    await expect(tooltip).toContainText(msg('zone.field.gridStep.guide', { symbol: 'XAUUSD', range: '1–5' }));
    await page.mouse.move(0, 0);
    await hintOf(0, msg('zone.field.takeProfit')).hover();
    await expect(tooltip).toContainText(msg('zone.field.takeProfit.guide', { symbol: 'XAUUSD', range: '1–5' }));
    await page.mouse.move(0, 0);

    await hintOf(1, msg('zone.field.gridStep')).hover();
    await expect(tooltip).toHaveText(msg('zone.field.gridStep.hint'));
  });
  test('Abstand nach Verlust ($): Grid und Pullback als Betrag', { tag: '@ZON-13' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    const byLoss = dashboard.zoneSwitch(msg('zone.stepByLoss'));
    await expect(byLoss).toHaveAttribute('aria-checked', 'false');
    await expect(zone.getByTestId('loss-preview')).toHaveCount(0);

    // USOUSD: Kontrakt 1000, 0,01 Lot → 0,5 Preis = 5 $ (Umschalten rechnet vorhandene Werte um)
    await byLoss.click();
    await expect(byLoss).toHaveAttribute('aria-checked', 'true');
    const grid = dashboard.zoneField(msg('zone.field.gridStepLoss'));
    await expect(grid).toHaveValue('5');
    const pullback = zone.getByText(msg('zone.breakout.minPullbackLoss')).locator('xpath=..').locator('input');
    await expect(pullback).toHaveValue('5');
    // TP 0,5 → 5 $ (Gewinn), SL 0 bleibt 0
    const tp = dashboard.zoneField(msg('zone.field.takeProfitLoss'));
    await expect(tp).toHaveValue('5');
    await expect(dashboard.zoneField(msg('zone.field.stopLossLoss'))).toHaveValue('0');

    await grid.fill('10');
    await expect(zone.getByTestId('loss-preview').first()).toContainText('≈ 1 ');
    await tp.fill('2');
    await dashboard.zoneSwitch(msg('zone.breakout.trendOnly')).click();
    await pullback.fill('3');

    await saveAndReload(dashboard);
    await expect(dashboard.zoneSwitch(msg('zone.stepByLoss'))).toHaveAttribute('aria-checked', 'true');
    await expect(grid).toHaveValue('10');
    await expect(pullback).toHaveValue('3');
    await expect(tp).toHaveValue('2');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ step_by_loss: true, grid_step: 10, pullback_distance: 3, take_profit: 2 });

    // Zurück auf Preisabstand: 10 $ → 1,0; 3 $ → 0,3
    await dashboard.zoneSwitch(msg('zone.stepByLoss')).click();
    await expect(dashboard.zoneField(msg('zone.field.gridStep'))).toHaveValue('1');
    await expect(zone.getByText(msg('zone.breakout.minPullback')).locator('xpath=..').locator('input')).toHaveValue('0.3');
    await expect(dashboard.zoneField(msg('zone.field.takeProfit'))).toHaveValue('0.2');
  });

  test('Abstand nach Verlust ($): EURUSD 0,00100 bei 0,1 Lot = 10 $', { tag: '@ZON-13' }, async ({ worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [
      makeZone({ symbol: 'EURUSD', min_price: 1.05, max_price: 1.2, grid_step: 0.001, lot_size: 0.1, pullback_distance: 0.0005 }),
    ];
    await dashboard.open(DEMO_ID);
    await dashboard.zoneSwitch(msg('zone.stepByLoss')).click();
    // Mehr Nachkommastellen (0.001) als ein $-Betrag (2) darf die Umrechnung nicht auf 0.00 kürzen
    await expect(dashboard.zoneField(msg('zone.field.gridStepLoss'))).toHaveValue('10');
    const pullback = dashboard.zone().getByText(msg('zone.breakout.minPullbackLoss')).locator('xpath=..').locator('input');
    await expect(pullback).toHaveValue('5');
    await expect(dashboard.zone().getByTestId('loss-preview').first()).toBeVisible();
  });

  test('Sofort erste Position: eigener Schalter je Zone', { tag: '@ZON-14' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const instant = dashboard.zoneSwitch(msg('zone.instantEntry'));
    await expect(instant).toHaveAttribute('aria-checked', 'false');
    await instant.click();
    await expect(instant).toHaveAttribute('aria-checked', 'true');
    // Unabhängig von „Abstand nach Verlust“
    await expect(dashboard.zoneSwitch(msg('zone.stepByLoss'))).toHaveAttribute('aria-checked', 'false');

    await saveAndReload(dashboard);
    await expect(dashboard.zoneSwitch(msg('zone.instantEntry'))).toHaveAttribute('aria-checked', 'true');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ instant_entry: true });
    expect(worker.zonesOf(DEMO_ID)[0].step_by_loss).toBeFalsy();
  });

  test('Einstiegsmodus Fraktal: eigene Felder statt Grid', { tag: '@ZON-15' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    const mode = zone.getByTestId('entry-mode');
    await expect(mode).toHaveValue('grid');
    await expect(zone.getByTestId('fractal-fields')).toHaveCount(0);

    await mode.selectOption('fractal');
    await expect(zone.getByTestId('fractal-fields')).toBeVisible();
    // Grid-Felder und -Schalter sind im Fraktal-Modus ausgeblendet
    await expect(dashboard.zoneField(msg('zone.field.gridStep'))).toHaveCount(0);
    await expect(zone.getByText(msg('zone.stepByLoss'))).toHaveCount(0);
    await expect(zone.getByText(msg('zone.breakout.title'))).toHaveCount(0);
    // Standard: H4, Ausbruch, ATR 14 × 1,5, Chance/Risiko 2
    await expect(zone.getByTestId('fractal-timeframe')).toHaveValue('H4');
    await expect(zone.getByTestId('fractal-order-mode')).toHaveValue('breakout');
    await expect(zone.getByTestId('fractal-sl-mode')).toHaveValue('atr');
    await expect(dashboard.zoneField(msg('zone.fractal.atrPeriod'))).toHaveValue('14');
    await expect(dashboard.zoneField(msg('zone.fractal.sarStep'))).toHaveCount(0);

    await zone.getByTestId('fractal-timeframe').selectOption('M15');
    await zone.getByTestId('fractal-order-mode').selectOption('rebound');
    await zone.getByTestId('fractal-sl-mode').selectOption('sar');
    await expect(dashboard.zoneField(msg('zone.fractal.atrPeriod'))).toHaveCount(0);
    await dashboard.zoneField(msg('zone.fractal.sarStep')).fill('0.03');
    await dashboard.zoneField(msg('zone.fractal.slBuffer')).fill('0.2');
    await dashboard.zoneField(msg('zone.fractal.rr')).fill('3');

    await saveAndReload(dashboard);
    await expect(dashboard.zone().getByTestId('entry-mode')).toHaveValue('fractal');
    await expect(dashboard.zone().getByTestId('fractal-sl-mode')).toHaveValue('sar');
    await expect(dashboard.zoneField(msg('zone.fractal.rr'))).toHaveValue('3');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      entry_mode: 'fractal',
      fractal_timeframe: 'M15',
      fractal_order_mode: 'rebound',
      fractal_sl_mode: 'sar',
      fractal_sar_step: 0.03,
      fractal_sl_buffer: 0.2,
      fractal_rr: 3,
    });

    // Zurück auf Grid: Grid-Felder wieder da
    await dashboard.zone().getByTestId('entry-mode').selectOption('grid');
    await expect(dashboard.zoneField(msg('zone.field.gridStep'))).toBeVisible();
  });
});
