/**
 * ZON-22 Setup-Zusammenfassung und Bearbeiten (Plan 1108-A5, K3): ein gespeichertes Setup steht als Zeile aus Chips da,
 * „Güncelle“ öffnet das Formular. Regeln 1108-A6.1 („Kaydet“ nur mit Änderung, „Vazgeç“ macht rückgängig und schließt),
 * A6.3 (Seite öffnet in Zusammenfassung, neues oder geändertes Setup bleibt offen), A7.2 („Vazgeç“ löscht ein nie
 * gespeichertes Setup). UI-08: bei 375 px steht die Fußleiste unter dem Formular, kein horizontaler Überlauf.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, makeZone, openSetup, test } from '../fixtures/test';

const twoSetups = () => [makeZone({ id: 'zone-a' }), makeZone({ id: 'zone-b', min_price: 120, max_price: 140 })];

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(sizes.scroll, 'Kein horizontaler Überlauf').toBeLessThanOrEqual(sizes.client);
}

test.describe('ZON-22 Zusammenfassung und Bearbeiten', () => {
  test('Nach dem Laden stehen alle Setups als Zusammenfassung da', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, [makeZone({ id: 'zone-a', instant_entry: true, step_by_loss: true, grid_step: 2 }), makeZone({ id: 'zone-b' })]);
    await dashboard.open(DEMO_ID);
    for (const index of [0, 1]) {
      const card = dashboard.zone(index);
      await expect(card.getByTestId('setup-summary')).toBeVisible();
      await expect(card.getByTestId('zone-edit')).toHaveText(msg('zone.header.edit'));
      await expect(card.getByTestId('zone-entry-column')).toHaveCount(0);
      await expect(card.getByTestId('zone-save')).toHaveCount(0);
    }
    // Chip-Reihenfolge folgt den Kästen; Werte kommen aus dem Setup, „Zarara göre“ schaltet auf $
    const first = dashboard.zone(0).getByTestId('setup-summary');
    await expect(first.getByTestId('summary-entry')).toContainText(msg('zone.summary.value.grid'));
    await expect(first.getByTestId('summary-instant')).toContainText(msg('zone.summary.value.on'));
    await expect(first.getByTestId('summary-gridStep')).toContainText('2 $');
    await expect(dashboard.zone(1).getByTestId('summary-gridStep')).toContainText('0,5');
    await expect(dashboard.zone(1).getByTestId('summary-instant')).toHaveAttribute('data-off', 'true');
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
  });

  test('„Setup Ekle“ öffnet das neue Setup im Bearbeiten-Zustand', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    await dashboard.symbolCard().getByRole('button', { name: msg('zone.symbol.addSetup') }).click();
    const added = dashboard.zone(2);
    await expect(added.getByTestId('zone-entry-column')).toBeVisible();
    await expect(added.getByTestId('zone-cancel')).toBeVisible();
    await expect(added.getByTestId('zone-edit')).toHaveCount(0);
    // Die gespeicherten Setups bleiben in der Zusammenfassung
    await expect(dashboard.zone(0).getByTestId('setup-summary')).toBeVisible();
    await expect(dashboard.zone(1).getByTestId('setup-summary')).toBeVisible();
  });

  test('„Kaydet“ ist ohne Änderung gesperrt, „Güncelle“ öffnet nur das Formular', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone(0));
    await expect(dashboard.zone(0).getByTestId('zone-save')).toBeDisabled();
    await expect(dashboard.zone(0).getByTestId('zone-edit')).toHaveCount(0);
    await expect(dashboard.zone(1).getByTestId('setup-summary')).toBeVisible();
    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    await expect(dashboard.zone(0).getByTestId('zone-save')).toBeEnabled();
    await expect(dashboard.saveAll).toContainText(msg('saveBar.saveAll'));
  });

  test('„Vazgeç“ macht die Änderung rückgängig und schließt das Formular', { tag: '@ZON-22' }, async ({ dashboard, worker }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    const card = dashboard.zone(0);
    await openSetup(card);
    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    await expect(dashboard.saveAll).toContainText(msg('saveBar.saveAll'));
    await card.getByTestId('zone-cancel').click();
    await expect(card.getByTestId('setup-summary')).toBeVisible();
    await expect(card.getByTestId('zone-entry-column')).toHaveCount(0);
    await expect(card.getByTestId('summary-lot')).toContainText('0,01');
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
    await expect(card.getByText(msg('zone.header.unsaved'), { exact: true })).toBeHidden();
    await openSetup(card);
    await expect(dashboard.zoneField(msg('zone.field.lot'))).toHaveValue('0.01');
  });

  test('„Vazgeç“ löscht ein nie gespeichertes Setup', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    await dashboard.symbolCard().getByRole('button', { name: msg('zone.symbol.addSetup') }).click();
    await expect(dashboard.symbolCard().getByTestId('zone-card')).toHaveCount(3);
    await dashboard.zone(2).getByTestId('zone-cancel').click();
    await expect(dashboard.symbolCard().getByTestId('zone-card')).toHaveCount(2);
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
    expect(worker.zonesOf(DEMO_ID)).toHaveLength(2);
  });

  test('Erfolgreiches Speichern schließt das Formular', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    const card = dashboard.zone(0);
    await openSetup(card);
    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    await card.getByTestId('zone-save').click();
    await expect(card.getByTestId('setup-summary')).toBeVisible();
    await expect(card.getByTestId('zone-entry-column')).toHaveCount(0);
    await expect(card.getByTestId('summary-lot')).toContainText('0,05');
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ lot_size: 0.05 });
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
  });

  test('Ein geändertes Setup bleibt offen, ein Neu-Rendern schließt es nicht', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone(0));
    await dashboard.zoneField(msg('zone.field.lot')).fill('0.05');
    // Ein anderes Setup öffnen und wieder schließen ändert nichts am geänderten
    await openSetup(dashboard.zone(1));
    await dashboard.zone(1).getByTestId('zone-cancel').click();
    await expect(dashboard.zone(1).getByTestId('setup-summary')).toBeVisible();
    await dashboard.refreshLogs();
    await expect(dashboard.zone(0).getByTestId('zone-entry-column')).toBeVisible();
    await expect(dashboard.zone(0).getByTestId('zone-edit')).toHaveCount(0);
    await expect(dashboard.zone(0).getByTestId('zone-save')).toBeEnabled();
  });

  test('Die Speichern-Leiste („Kaydet“) schließt alle Formulare', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone(0));
    await openSetup(dashboard.zone(1));
    await dashboard.zoneField(msg('zone.field.lot'), 0).fill('0.05');
    await dashboard.saveAllSettings();
    for (const index of [0, 1]) {
      await expect(dashboard.zone(index).getByTestId('setup-summary')).toBeVisible();
      await expect(dashboard.zone(index).getByTestId('zone-entry-column')).toHaveCount(0);
    }
    expect(worker.zonesOf(DEMO_ID)[0]).toMatchObject({ lot_size: 0.05 });
  });

  test('Die Speichern-Leiste („İptal“) schließt alle Formulare und stellt den Stand wieder her', { tag: '@ZON-22' }, async ({ page, worker, dashboard }) => {
    worker.setZones(DEMO_ID, twoSetups());
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone(0));
    await openSetup(dashboard.zone(1));
    await dashboard.zoneField(msg('zone.field.lot'), 0).fill('0.05');
    await page.getByTestId('unsaved-discard').click();
    for (const index of [0, 1]) {
      await expect(dashboard.zone(index).getByTestId('setup-summary')).toBeVisible();
      await expect(dashboard.zone(index).getByTestId('zone-entry-column')).toHaveCount(0);
    }
    await expect(dashboard.zone(0).getByTestId('summary-lot')).toContainText('0,01');
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
  });

  test('Fraktal und BOTH ohne Sync: Chips zeigen beide Seiten', { tag: '@ZON-22' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, [
      makeZone({ id: 'zone-a', order_type: 'BOTH', sync_buy_sell: false, lot_size: 0.01, sell_lot_size: 0.02 }),
      makeZone({ id: 'zone-b', entry_mode: 'fractal', fractal_timeframe: 'H1', fractal_order_count: 3 }),
    ]);
    await dashboard.open(DEMO_ID);
    await expect(dashboard.zone(0).getByTestId('summary-lot')).toContainText('BUY 0,01 / SELL 0,02');
    const fractal = dashboard.zone(1).getByTestId('setup-summary');
    await expect(fractal.getByTestId('summary-entry')).toContainText(msg('zone.summary.value.fractal'));
    await expect(fractal.getByTestId('summary-timeframe')).toContainText('H1');
    await expect(fractal.getByTestId('summary-orderCount')).toContainText('3');
    await expect(fractal.getByTestId('summary-gridStep')).toHaveCount(0);
  });

  test('Jeder Chip und „Güncelle“ erklären sich (UI-07)', { tag: ['@ZON-22', '@UI-07'] }, async ({ page, worker, dashboard }) => {
    worker.setZones(DEMO_ID, [makeZone({ id: 'zone-a' })]);
    await dashboard.open(DEMO_ID);
    await dashboard.zone().getByTestId('summary-gridStep').hover();
    await expect(page.getByRole('tooltip')).toHaveText(msg('zone.summary.gridStep.hint'));
    await dashboard.zone().getByTestId('zone-edit').hover();
    await expect(page.getByRole('tooltip')).toHaveText(msg('zone.header.edit.hint'));
  });

  test.describe('375 px', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('Ausstieg-Chip: kurze Fassung, höchstens 2 Zeilen, volle Namen im aria-label', { tag: ['@ZON-22', '@UI-08'] }, async ({ worker, dashboard }) => {
      worker.setZones(DEMO_ID, [
        makeZone({
          clear_on_exit: true,
          clear_exit_side: 'SELL (Aşağı)',
          clear_target_side: 'Sadece BUY İşlemleri',
          clear_scope: 'Sadece Bekleyen Emirler',
          exit_condition: 'Mum Kapanışı',
          exit_timeframe: 'H1',
        }),
      ]);
      await dashboard.open(DEMO_ID);
      const chip = dashboard.zone(0).getByTestId('summary-exit');
      await expect(chip).toContainText(msg('zone.summary.exit.side.down'));
      await expect(chip).not.toContainText(msg('zone.exit.scope.pending'));
      await expect(chip).toHaveAttribute('aria-label', new RegExp(msg('zone.exit.scope.pending')));
      const lines = await chip.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
      expect(lines, 'höchstens 2 Zeilen').toBeLessThanOrEqual(2);
      // kein Umbruch mitten im Wort: der Wert bricht nur an Leerzeichen
      const breaksInWord = await chip.evaluate((el) => getComputedStyle(el.lastElementChild as Element).overflowWrap);
      expect(breaksInWord, 'kein Umbruch im Wort').toBe('normal');
    });

    test('Zusammenfassung läuft nicht über, Fußleiste steht unter dem Formular', { tag: ['@ZON-22', '@UI-08'] }, async ({ page, worker, dashboard }) => {
      worker.setZones(DEMO_ID, [
        makeZone({
          id: 'zone-a',
          order_type: 'BOTH',
          sync_buy_sell: false,
          is_breakout: true,
          clear_on_exit: true,
          clear_exit_side: 'SELL (Aşağı)',
          clear_target_side: 'Sadece BUY İşlemleri',
          exit_condition: 'Mum Kapanışı',
          spread_guard: { enabled: true, mode: 'fixed', max_spread: 0.3, bootstrap: 'wait' },
        }),
        makeZone({ id: 'zone-b', entry_mode: 'fractal', fractal_next_loss: 5 }),
      ]);
      await dashboard.open(DEMO_ID);
      await expect(dashboard.zone(0).getByTestId('setup-summary')).toBeVisible();
      await noOverflow(page);

      const card = dashboard.zone(0);
      await openSetup(card);
      await dashboard.zoneField(msg('zone.field.buyLot'), 0).fill('0.05');
      // Telefon: Vazgeç/Kaydet nur einmal, in der Fußleiste unter den Feldern, nicht im Kopf
      await expect(card.getByTestId('zone-save')).toHaveCount(1);
      await expect(card.getByTestId('zone-footer').getByTestId('zone-cancel')).toBeVisible();
      await expect(card.getByTestId('zone-footer').getByTestId('zone-save')).toBeEnabled();
      const footer = await card.getByTestId('zone-footer').boundingBox();
      const exit = await card.getByTestId('zone-exit-column').boundingBox();
      expect(footer!.y, 'Fußleiste unter dem Formular').toBeGreaterThanOrEqual(exit!.y + exit!.height - 1);
      await noOverflow(page);

      await card.getByTestId('zone-footer').getByTestId('zone-save').click();
      await expect(card.getByTestId('setup-summary')).toBeVisible();
      await noOverflow(page);
    });
  });
});
