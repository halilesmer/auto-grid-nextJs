/** SET · Allgemeine Einstellungen · SYM · Symbole (Autocomplete, Schrittweiten aus den Symboldetails). */
import { DEMO_ID, expect, makeZone, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test.describe('SET Einstellungen', () => {
  test('Einstellungen laden', { tag: '@SET-01' }, async ({ page, worker, dashboard }) => {
    worker.state.settings[DEMO_ID] = {
      LOOP_INTERVAL_SECONDS: 4.5,
      ZONES: [makeZone({ min_price: 80, max_price: 95.5, order_type: 'SELL' })],
    };
    await dashboard.open(DEMO_ID);
    await expect(page.getByLabel(msg('settings.interval'))).toHaveValue('4.5');
    await expect(dashboard.zoneField(msg('zone.field.minPrice'))).toHaveValue('80');
    await expect(dashboard.zoneField(msg('zone.field.maxPrice'))).toHaveValue('95.5');
    await expect(dashboard.zone()).toContainText('80 – 95.5');
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
  });

  test('Kontroll-Intervall: Grenzen 1–60 s und Speichern', { tag: '@SET-02' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const interval = page.getByLabel(msg('settings.interval'));
    const save = page.getByTestId('general-settings').getByRole('button', { name: msg('common.save') });
    await expect(interval).toHaveValue('2');
    await expect(save).toBeDisabled();

    await page.getByRole('button', { name: msg('settings.increase') }).click();
    await expect(interval).toHaveValue('2.1');
    await interval.fill('100');
    await expect(interval).toHaveValue('60');
    await expect(page.getByRole('button', { name: msg('settings.increase') })).toBeDisabled();
    await interval.fill('0');
    await expect(interval).toHaveValue('1');
    await expect(page.getByRole('button', { name: msg('settings.decrease') })).toBeDisabled();

    await interval.fill('7.5');
    await save.click();
    await expect(save).toBeDisabled();
    // Eigener Speichern-Button: danach gilt nichts als ungespeichert
    await expect(page.getByTestId('unsaved-bar')).toBeHidden();
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
    expect(worker.callsTo('POST', `/api/settings/${DEMO_ID}`).at(-1)?.body).toEqual({
      settings: { LOOP_INTERVAL_SECONDS: 7.5 },
    });
    // Zusammenführen: Zonen bleiben erhalten
    expect(worker.settingsOf(DEMO_ID)).toMatchObject({ LOOP_INTERVAL_SECONDS: 7.5 });
    expect(worker.zonesOf(DEMO_ID)).toHaveLength(1);

    await page.reload();
    await dashboard.selectAccount(DEMO_ID);
    await expect(interval).toHaveValue('7.5');
  });

  test('„Alle speichern“ + Dirty-Tracking', { tag: '@SET-03' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const bar = page.getByTestId('unsaved-bar');
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
    await expect(dashboard.saveAll).toBeDisabled();
    await expect(bar).toBeHidden();

    await dashboard.zoneField(msg('zone.field.maxPrice')).fill('120');
    await expect(dashboard.saveAll).toHaveText(msg('saveBar.saveAll'));
    await expect(bar).toContainText(msg('saveBar.unsaved'));

    // Die schwebende Leiste speichert ebenfalls
    await bar.getByRole('button', { name: msg('common.save') }).click();
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
    await expect(bar).toBeHidden();
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ max_price: 120, min_price: 90 });
  });

  test('Speicherfehler wird angezeigt, Änderung bleibt ungespeichert', { tag: '@SET-03' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    worker.overrides.set(`POST /api/settings/${DEMO_ID}`, { status: 500, body: { detail: 'Disk voll' } });
    await dashboard.zoneField(msg('zone.field.maxPrice')).fill('120');
    await page.getByRole('button', { name: msg('saveBar.saveAll') }).click();
    await expect(page.getByText(/Tüm ayarları kaydetme başarısız|Failed to save settings/)).toBeVisible();
    await expect(dashboard.saveAll).toHaveText(msg('saveBar.saveAll'));
  });
});

test.describe('SYM Symbole', () => {
  test('Autocomplete zeigt nur passende Symbole', { tag: '@SYM-02' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const input = dashboard.zone().getByPlaceholder(/Sembol Ara/);
    await input.fill('xa');
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('XAUUSD');
    await expect(options.first()).toContainText('Gold vs US Dollar');

    // Suche auch in der Beschreibung
    await input.fill('euro');
    await expect(options).toHaveText([/EURUSD/]);
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input).toHaveValue('EURUSD');
    await expect(page.getByRole('listbox')).toBeHidden();

    await input.fill('zzz');
    await expect(page.getByText(msg('zone.symbol.empty'))).toBeVisible();
  });

  test('Schrittweiten aus den Symboldetails, unbekanntes Symbol', { tag: '@SYM-03' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    // USOUSD: 3 Digits → point 0.001, Lot-Schritt 0.01
    await expect(dashboard.zoneField(msg('zone.field.minPrice'))).toHaveAttribute('step', '0.001');
    await expect(dashboard.zoneField(msg('chart.zone.lot'))).toHaveAttribute('step', '0.01');

    const input = dashboard.zone().getByPlaceholder(/Sembol Ara/);
    await input.fill('EURUSD');
    await input.press('Escape');
    // EURUSD: 5 Digits, volume_min/step 0.1 → Lot wird auf 0.1-Raster gebracht
    await expect(dashboard.zoneField(msg('zone.field.minPrice'))).toHaveAttribute('step', '0.00001');
    await expect(dashboard.zoneField(msg('chart.zone.lot'))).toHaveAttribute('step', '0.1');
    await expect(dashboard.zoneField(msg('chart.zone.lot'))).toHaveAttribute('min', '0.1');

    await input.fill('FOOBAR');
    await expect(dashboard.zone().getByText(msg('zone.field.symbolInvalid'))).toBeVisible();
  });
});
