/** ZON · Zonen-Konfiguration: jedes Feld wird angezeigt, gespeichert und nach dem Neuladen wieder gelesen. */
import { DEMO_ID, RUNNING_METRICS, ZONE_ID, expect, makeZone, test, type Dashboard } from '../fixtures/test';

/** Speichern, Seite neu laden, Konto wieder wählen (prüft den Rundweg über den Worker). */
async function saveAndReload(dashboard: Dashboard) {
  await dashboard.saveAllSettings();
  await dashboard.page.reload();
  await dashboard.selectAccount(DEMO_ID);
}

test.describe('ZON Zonen', () => {
  test('Zone hinzufügen', { tag: '@ZON-01' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: 'Bölge Ekle' }).click();
    await expect(page.getByTestId('zone-count')).toHaveText('2');
    // Neue Zone übernimmt das Symbol der letzten Zone und startet ausgeschaltet
    await expect(dashboard.zone(1).getByPlaceholder(/Sembol Ara/)).toHaveValue('USOUSD');
    await expect(dashboard.zone(1).getByRole('button', { name: 'Kapalı (Motoru Başlat)' })).toBeVisible();

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
    await dashboard.zone(0).getByRole('button', { name: 'Bölge menüsü' }).click();
    await page.getByRole('button', { name: 'Bölgeyi Sil' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Bu bölgeyi silmek istediğinizden emin misiniz?');
    await modal.getByRole('button', { name: 'Delete' }).click();

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
    await dashboard.zoneField('Emir Tipi').selectOption('SELL');
    await dashboard.zoneField('Min Fiyat ($)').fill('1800');
    await dashboard.zoneField('Max Fiyat ($)').fill('2000.5');
    await expect(zone.getByText('SELL', { exact: true }).first()).toBeVisible();
    await expect(zone).toContainText('1800 – 2000.5');

    await saveAndReload(dashboard);
    await expect(symbol).toHaveValue('XAUUSD');
    await expect(dashboard.zoneField('Emir Tipi')).toHaveValue('SELL');
    await expect(dashboard.zoneField('Min Fiyat ($)')).toHaveValue('1800');
    await expect(dashboard.zoneField('Max Fiyat ($)')).toHaveValue('2000.5');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      symbol: 'XAUUSD', order_type: 'SELL', min_price: 1800, max_price: 2000.5,
    });
  });

  test('Grid-Felder: Grid Adımı, Lot, Kar Al, Zarar Durdur', { tag: '@ZON-04' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const values = { 'Grid Adımı ($)': '0.25', Lot: '0.02', 'Kar Al ($)': '0.75', 'Zarar Durdur ($)': '1.5' };
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

  test('SELL-Felder nur bei BOTH ohne Sync', { tag: '@ZON-05' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    const sync = dashboard.zoneSwitch('BUY ve SELL için aynı ayarları uygula');
    await expect(sync).toBeHidden();

    await dashboard.zoneField('Emir Tipi').selectOption('BOTH');
    await expect(sync).toHaveAttribute('aria-checked', 'true');
    await expect(zone.getByText('SELL Grid ($)')).toBeHidden();
    await expect(dashboard.zoneField('Grid Adımı ($)')).toBeVisible();

    await sync.click();
    await expect(sync).toHaveAttribute('aria-checked', 'false');
    await expect(dashboard.zoneField('BUY Grid ($)')).toBeVisible();
    const sell = { 'SELL Grid ($)': '0.3', 'SELL Lot': '0.03', 'SELL KA ($)': '0.6', 'SELL ZD ($)': '2' };
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
    const pullback = zone.getByText('Min Pullback ($)').locator('xpath=..').locator('input');
    await expect(pullback).toBeDisabled();

    await dashboard.zoneSwitch('Sadece trend yönünde').click();
    await expect(pullback).toBeEnabled();
    // BUY + Breakout: nur Level oberhalb zählen, „Alt Seviyeler“ ist gesperrt
    await expect(dashboard.zoneField('Alt Seviyeler')).toBeDisabled();
    await pullback.fill('0.8');
    await dashboard.zoneField('Üst Seviyeler').fill('4');
    await dashboard.zoneField('Maks Pozisyon').fill('8');

    await saveAndReload(dashboard);
    await expect(pullback).toHaveValue('0.8');
    await expect(dashboard.zoneField('Üst Seviyeler')).toHaveValue('4');
    await expect(dashboard.zoneField('Maks Pozisyon')).toHaveValue('8');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({
      is_breakout: true, pullback_distance: 0.8, levels_above: 4, max_positions: 8,
    });
  });

  test('Exit-Felder erscheinen mit dem Schalter', { tag: '@ZON-07' }, async ({ worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await expect(zone.getByText('Çıkış Yönü')).toBeHidden();

    await dashboard.zoneSwitch('Fiyat bölgeden çıkınca temizle').click();
    for (const label of ['Çıkış Yönü', 'Hedef Taraf', 'Temizleme Kapsamı', 'Çıkış Tetikleyici']) {
      await expect(dashboard.zoneField(label)).toBeVisible();
    }
    await expect(zone.getByText('Zaman Dilimi')).toBeHidden();

    await dashboard.zoneField('Çıkış Yönü').selectOption('BUY (Yukarı)');
    await dashboard.zoneField('Hedef Taraf').selectOption('Sadece SELL İşlemleri');
    await dashboard.zoneField('Temizleme Kapsamı').selectOption('Tüm İşlemler');
    await dashboard.zoneField('Çıkış Tetikleyici').selectOption('Mum Kapanışı');
    await dashboard.zoneField('Zaman Dilimi').selectOption('H1');

    await saveAndReload(dashboard);
    await expect(dashboard.zoneField('Zaman Dilimi')).toHaveValue('H1');
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
    await zone.getByRole('button', { name: 'Başladı' }).click();
    await expect(zone.getByRole('button', { name: 'Başla', exact: true })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '0': 'PAUSE' });
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ id: ZONE_ID, is_active: false });

    await zone.getByRole('button', { name: 'Başla', exact: true }).click();
    await expect(zone.getByRole('button', { name: 'Başladı' })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '0': 'START' });
  });

  test('Start/Pause: Bot aus, ungespeicherte Zone, ungültiges Symbol', { tag: '@ZON-08' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(dashboard.zone().getByRole('button', { name: 'Hazır (Motor Bekleniyor)' })).toBeVisible();

    await page.getByRole('button', { name: 'Bölge Ekle' }).click();
    const toggleNew = () => dashboard.zone(1).getByRole('button', { name: 'Kapalı (Motoru Başlat)' }).click();
    expect(await dashboard.withDialog(toggleNew)).toContain('henüz kaydedilmemiş');
    // Zustand wird zurückgesetzt, nichts an den Motor geschickt
    await expect(dashboard.zone(1).getByRole('button', { name: 'Kapalı (Motoru Başlat)' })).toBeVisible();
    expect(worker.callsTo('POST', `/api/ui-state/${DEMO_ID}`)).toHaveLength(0);

    await dashboard.zone(1).getByPlaceholder(/Sembol Ara/).fill('FOOBAR');
    expect(await dashboard.withDialog(toggleNew)).toContain('Hatalı Sembol');
  });

  test('Vom Motor gestoppte Zone neu starten', { tag: '@ZON-08' }, async ({ worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'AUTO_CLEAR' } });
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await expect(zone.getByText('Otomatik temizlendi')).toBeVisible();

    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'START' } });
    await zone.getByRole('button', { name: 'Yeniden Başlat' }).click();
    await expect(zone.getByText('Otomatik temizlendi')).toBeHidden();
    await expect(zone.getByRole('button', { name: 'Başladı' })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '0': 'START' });
    // is_active bleibt unverändert, nur der Motorzustand wird gesetzt
    expect(worker.callsTo('POST', `/api/settings/${DEMO_ID}`)).toHaveLength(0);
  });

  test('Telefon-Stopp sperrt den Zonen-Button', { tag: '@ZON-08' }, async ({ worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { ...RUNNING_METRICS, remote_paused: true });
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await expect(zone.getByText('Uzaktan durduruldu')).toBeVisible();
    await expect(zone.getByRole('button', { name: 'Durduruldu' })).toBeDisabled();
  });

  test('„Kaydedilmedi“-Badge', { tag: '@ZON-09' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const badge = dashboard.zone().getByText('Kaydedilmedi', { exact: true });
    await expect(badge).toBeHidden();

    await dashboard.zoneField('Lot').fill('0.05');
    await expect(badge).toBeVisible();
    await dashboard.saveAllSettings();
    await expect(badge).toBeHidden();

    await page.getByRole('button', { name: 'Bölge Ekle' }).click();
    await expect(dashboard.zone(1).getByText('Kaydedilmedi', { exact: true })).toBeVisible();
  });
  test('Zahlenfelder lassen sich leeren und neu tippen', { tag: '@ZON-10' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    const min = dashboard.zoneField('Min Fiyat ($)');
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
});
