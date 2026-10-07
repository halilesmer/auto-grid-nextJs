/**
 * ZON-20 Symbolkarten: je Symbol eine Karte (Kopf mit Symbol, Zahl der Setups, Preis, Markt, „Setup Ekle“),
 * darin jedes Setup als eigene Karte. zone_states und ui-state-Befehle zählen nach dem Engine-Platz der
 * zuletzt geladenen oder gespeicherten Reihenfolge, nicht nach dem Platz in der Karte.
 */
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, test, type MockWorker } from '../fixtures/test';

/** USOUSD mit zwei Setups (A, C), XAUUSD mit einem (B); gespeichert im heutigen Format (SYMBOLS). */
function seedTwoSymbols(worker: MockWorker) {
  worker.setZones(DEMO_ID, [
    makeZone({ id: 'zone-a' }),
    makeZone({ id: 'zone-c', min_price: 80, max_price: 100 }),
    makeZone({ id: 'zone-b', symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
  ]);
}

/** Alte Datei (ZONES, noch nicht gespeichert) mit gemischten Symbolen: Engine-Reihenfolge A, B, C. */
function seedLegacyFile(worker: MockWorker) {
  worker.state.settings[DEMO_ID] = {
    LOOP_INTERVAL_SECONDS: 2,
    ZONE_MAGIC_MAX: 200003,
    ZONES: [
      makeZone({ id: 'zone-a', symbol: 'USOUSD', magic: 200001 }),
      makeZone({ id: 'zone-b', symbol: 'XAUUSD', min_price: 1800, max_price: 2000, magic: 200002 }),
      makeZone({ id: 'zone-c', symbol: 'USOUSD', min_price: 80, max_price: 100, magic: 200003 }),
    ],
  };
}

const AUTO_CLEAR = () => msg('zone.stop.autoClear.label');

test.describe('ZON-20 Symbolkarten', () => {
  test('Setups nach Symbol gruppiert: Kopf mit Symbol und Setup-Zahl, Setup-Karten „Setup n“', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    seedTwoSymbols(worker);
    await dashboard.open(DEMO_ID);

    await expect(page.getByTestId('symbol-card')).toHaveCount(2);
    await expect(page.getByTestId('symbol-count')).toHaveText('2');

    const uso = dashboard.symbolCard(0);
    await expect(uso.getByPlaceholder(msg('zone.symbol.placeholder'))).toHaveValue('USOUSD');
    await expect(uso.getByTestId('setup-count')).toHaveText(msg('zone.symbol.setupCount', { count: 2 }));
    await expect(uso.getByTestId('zone-card')).toHaveCount(2);
    await expect(uso.getByTestId('zone-card').nth(0)).toContainText(msg('zone.setup.title', { n: 1 }));
    await expect(uso.getByTestId('zone-card').nth(1)).toContainText(msg('zone.setup.title', { n: 2 }));
    await expect(uso.getByTestId('zone-card').nth(1)).toContainText('80 – 100');

    const xau = dashboard.symbolCard(1);
    await expect(xau.getByPlaceholder(msg('zone.symbol.placeholder'))).toHaveValue('XAUUSD');
    await expect(xau.getByTestId('setup-count')).toHaveText(msg('zone.symbol.setupCount', { count: 1 }));
    await expect(xau.getByTestId('zone-card')).toHaveCount(1);
    await expect(xau.getByTestId('zone-card')).toContainText(msg('zone.setup.title', { n: 1 }));
  });

  test('„Sembol Ekle“ fragt das Symbol ab, das erste Setup startet mit dem Minimum-Lot', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('zone.panel.add') }).click();
    const dialog = page.getByTestId('add-symbol-dialog');
    const input = dialog.getByPlaceholder(msg('zone.symbol.placeholder'));
    const confirm = dialog.getByRole('button', { name: msg('zone.addSymbol.confirm'), exact: true });
    await expect(confirm).toBeDisabled();

    await input.fill('FOOBAR');
    await expect(dialog.getByText(msg('zone.field.symbolInvalid'))).toBeVisible();
    await expect(confirm).toBeDisabled();

    await input.fill('eur');
    await page.getByRole('option', { name: /EURUSD/ }).click();
    await expect(input).toHaveValue('EURUSD');
    await confirm.click();
    await expect(dialog).toBeHidden();

    // Neue Symbolkarte mit einem Setup; EURUSD: volume_min 0.1
    await expect(page.getByTestId('symbol-card')).toHaveCount(2);
    await expect(dashboard.symbolCard(1).getByTestId('zone-card')).toHaveCount(1);
    await expect(dashboard.symbolInput(1)).toHaveValue('EURUSD');
    await expect(dashboard.zoneField(msg('zone.field.lot'), 1)).toHaveValue('0.1');
    await expect(dashboard.zone(1).getByRole('button', { name: msg('zone.header.off') })).toBeVisible();

    await dashboard.saveAllSettings();
    expect(worker.settingsOf(DEMO_ID).SYMBOLS).toEqual([
      { symbol: 'USOUSD', setups: [expect.objectContaining({ id: ZONE_ID })] },
      { symbol: 'EURUSD', setups: [expect.objectContaining({ lot_size: 0.1, sell_lot_size: 0.1, is_active: false })] },
    ]);
  });

  test('„Sembol Ekle“ mit einem Symbol, das schon eine Karte hat: das Setup kommt in diese Karte', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    seedTwoSymbols(worker);
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('zone.panel.add') }).click();
    const dialog = page.getByTestId('add-symbol-dialog');
    await dialog.getByPlaceholder(msg('zone.symbol.placeholder')).fill('xau');
    await page.getByRole('option', { name: /XAUUSD/ }).click();
    await expect(dialog).toContainText(msg('zone.addSymbol.exists', { symbol: 'XAUUSD' }));
    await dialog.getByRole('button', { name: msg('zone.addSymbol.confirm'), exact: true }).click();

    await expect(page.getByTestId('symbol-card')).toHaveCount(2);
    await expect(dashboard.symbolCard(1).getByTestId('zone-card')).toHaveCount(2);
    await expect(dashboard.symbolCard(1).getByTestId('setup-count')).toHaveText(msg('zone.symbol.setupCount', { count: 2 }));
  });

  test('„Setup Ekle“ fragt nicht nach dem Symbol; das ungespeicherte Setup verschiebt keinen Motorzustand', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    worker.setZones(DEMO_ID, [
      makeZone({ id: 'zone-a' }),
      makeZone({ id: 'zone-b', symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
    ]);
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'START', '1': 'AUTO_CLEAR' } });
    await dashboard.open(DEMO_ID);
    await expect(dashboard.zone(1).getByText(AUTO_CLEAR())).toBeVisible();

    await dashboard.symbolCard(0).getByRole('button', { name: msg('zone.symbol.addSetup') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Das neue Setup steht unter USOUSD (zweite Setup-Karte), XAUUSD rückt auf die dritte
    await expect(dashboard.symbolCard(0).getByTestId('zone-card')).toHaveCount(2);
    await expect(dashboard.zone(1)).toContainText(msg('zone.setup.title', { n: 2 }));
    await expect(dashboard.zone(1).getByText(msg('zone.header.unsaved'), { exact: true })).toBeVisible();
    // Engine-Platz 1 bleibt Zone B, bis gespeichert ist
    await expect(dashboard.zone(2).getByText(AUTO_CLEAR())).toBeVisible();
    await expect(dashboard.zone(1).getByText(AUTO_CLEAR())).toBeHidden();

    // Nach dem Speichern führt der Worker USOUSD (A, neu) vor XAUUSD: Zone B hat Engine-Platz 2
    await dashboard.saveAllSettings();
    expect(worker.zonesOf(DEMO_ID).map((z) => z.symbol)).toEqual(['USOUSD', 'USOUSD', 'XAUUSD']);
    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'START', '1': 'START', '2': 'AUTO_CLEAR' } });
    await dashboard.refreshLogs();
    await expect(dashboard.zone(2).getByText(AUTO_CLEAR())).toBeVisible();
    await expect(dashboard.zone(0).getByText(AUTO_CLEAR())).toBeHidden();
  });

  test('Neues Setup einzeln speichern: danach bleibt nichts ungespeichert', { tag: '@ZON-20' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, [
      makeZone({ id: 'zone-a' }),
      makeZone({ id: 'zone-b', symbol: 'XAUUSD', min_price: 1800, max_price: 2000 }),
    ]);
    await dashboard.open(DEMO_ID);
    await dashboard.symbolCard(0).getByRole('button', { name: msg('zone.symbol.addSetup') }).click();
    await expect(dashboard.saveAll).toContainText(msg('saveBar.saveAll'));

    await dashboard.zone(1).getByTestId('zone-save').click();
    await expect(dashboard.zone(1).getByText(msg('zone.header.unsaved'), { exact: true })).toBeHidden();
    // Der Worker führt das Setup wie der Browser hinter dem letzten USOUSD-Setup
    expect(worker.zonesOf(DEMO_ID).map((z) => z.symbol)).toEqual(['USOUSD', 'USOUSD', 'XAUUSD']);
    await expect(dashboard.saveAll).toHaveText(msg('common.saved'));
  });

  test('Löschen: normale Rückfrage, beim letzten Setup verschwindet das Symbol mit', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    seedTwoSymbols(worker);
    await dashboard.open(DEMO_ID);
    const modal = page.getByRole('dialog');
    const deleteSetup = async (index: number) => {
      await dashboard.zone(index).getByRole('button', { name: msg('zone.header.menu') }).click();
      await page.getByRole('button', { name: msg('zone.header.delete') }).click();
    };

    // Setup 2 von USOUSD: normale Rückfrage, das Symbol bleibt
    await deleteSetup(1);
    await expect(modal).toContainText(msg('zone.delete.title'));
    await expect(modal).toContainText(msg('zone.delete.message'));
    await modal.getByRole('button', { name: msg('account.action.delete') }).click();
    await expect(dashboard.symbolCard(0).getByTestId('zone-card')).toHaveCount(1);
    await expect(page.getByTestId('symbol-card')).toHaveCount(2);

    // Einziges Setup von XAUUSD: eigene Rückfrage, die Symbolkarte verschwindet
    await deleteSetup(1);
    await expect(modal).toContainText(msg('zone.delete.last.title'));
    await expect(modal).toContainText(msg('zone.delete.last.message', { symbol: 'XAUUSD' }));
    await modal.getByRole('button', { name: msg('account.action.delete') }).click();
    await expect(page.getByTestId('symbol-card')).toHaveCount(1);
    await expect(page.getByTestId('symbol-count')).toHaveText('1');

    // Auch das letzte Symbol lässt sich löschen: leere Liste statt einer leeren Zone
    await deleteSetup(0);
    await modal.getByRole('button', { name: msg('account.action.delete') }).click();
    await expect(page.getByText(msg('zone.panel.empty.title'))).toBeVisible();
    await expect(page.getByTestId('zone-card')).toHaveCount(0);

    await dashboard.saveAllSettings();
    expect(worker.settingsOf(DEMO_ID).SYMBOLS).toEqual([]);
  });

  test('Symbol im Kopf gilt für alle Setups; Tippen übernimmt erst bei Auswahl', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    seedTwoSymbols(worker);
    await dashboard.open(DEMO_ID);
    const input = dashboard.symbolInput(0);

    // Der Zwischenstand „XAUUSD“ beim Tippen verschmilzt die Karte nicht mit der XAUUSD-Karte
    await input.clear();
    await input.pressSequentially('XAUUSDM');
    await expect(input).toHaveValue('XAUUSDM');
    await expect(page.getByTestId('symbol-card')).toHaveCount(2);

    await input.fill('eur');
    await page.getByRole('option', { name: /EURUSD/ }).click();
    await expect(dashboard.symbolInput(0)).toHaveValue('EURUSD');
    await expect(dashboard.symbolCard(0).getByTestId('zone-card')).toHaveCount(2);
    // EURUSD: volume_min 0.1, beide Setups werden angehoben
    await expect(dashboard.zoneField(msg('zone.field.lot'), 0)).toHaveValue('0.1');
    await expect(dashboard.zoneField(msg('zone.field.lot'), 1)).toHaveValue('0.1');

    await dashboard.saveAllSettings();
    expect(worker.settingsOf(DEMO_ID).SYMBOLS).toEqual([
      { symbol: 'EURUSD', setups: [expect.objectContaining({ id: 'zone-a' }), expect.objectContaining({ id: 'zone-c' })] },
      { symbol: 'XAUUSD', setups: [expect.objectContaining({ id: 'zone-b' })] },
    ]);
  });

  test('Verwerfen setzt das Symbolfeld zurück; Fokus und Verlassen ohne Eingabe ändern nichts', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    worker.setZones(DEMO_ID, [makeZone({ id: 'zone-a' }), makeZone({ id: 'zone-x', symbol: 'XAUUSDm', min_price: 1800, max_price: 2000 })]);
    await dashboard.open(DEMO_ID);
    const input = dashboard.symbolInput(0);
    await input.fill('eur');
    await page.getByRole('option', { name: /EURUSD/ }).click();
    await expect(dashboard.symbolInput(0)).toHaveValue('EURUSD');

    await page.getByTestId('unsaved-discard').click();
    await expect(dashboard.symbolInput(0)).toHaveValue('USOUSD');
    // Der verworfene Entwurf kommt beim nächsten Verlassen des Feldes nicht zurück
    await dashboard.symbolInput(0).focus();
    await dashboard.symbolInput(0).blur();
    // Gespeichertes „XAUUSDm“: Fokus und Verlassen schreiben nicht „XAUUSDM“
    await dashboard.symbolInput(1).focus();
    await dashboard.symbolInput(1).blur();
    await expect(dashboard.symbolInput(0)).toHaveValue('USOUSD');
    await expect(page.getByTestId('unsaved-bar')).toBeHidden();
    await expect(dashboard.zone(1).getByText(msg('zone.header.unsaved'), { exact: true })).toBeHidden();
  });

  test('Alte Datei, Bot läuft: Start/Pause schickt den Befehl vor dem Speichern an den heutigen Platz', { tag: '@ZON-20' }, async ({ worker, dashboard }) => {
    seedLegacyFile(worker);
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'START', '1': 'START', '2': 'START' } });
    await dashboard.open(DEMO_ID);

    // Setup C (USOUSD, Setup 2) hat heute Engine-Platz 2. Das Speichern gruppiert die Datei (A, C, B);
    // die ui_state-Datei zieht der laufende Bot beim nächsten Einlesen mit um (ENG-27), also Platz 2.
    await dashboard.zone(1).getByRole('button', { name: msg('zone.header.started') }).click();
    await expect(dashboard.zone(1).getByRole('button', { name: msg('zone.header.start'), exact: true })).toBeVisible();
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '2': 'PAUSE' });
    await expect.poll(() => worker.zonesOf(DEMO_ID).map((z) => z.id)).toEqual(['zone-a', 'zone-c', 'zone-b']);
    const order = worker.calls
      .filter((c) => c.method === 'POST' && (c.path.startsWith('/api/ui-state/') || c.path.startsWith('/api/settings/')))
      .map((c) => c.path.split('/')[2]);
    expect(order).toEqual(['ui-state', 'settings']);

    // Die Karten zählen jetzt nach der neuen Reihenfolge: Platz 2 ist Zone B (XAUUSD)
    worker.setMetrics(DEMO_ID, { zone_states: { '0': 'START', '1': 'PAUSE', '2': 'AUTO_CLEAR' } });
    await dashboard.refreshLogs();
    await expect(dashboard.zone(2).getByText(AUTO_CLEAR())).toBeVisible();
    await expect(dashboard.zone(0).getByText(AUTO_CLEAR())).toBeHidden();
  });

  test('Alte Datei, Bot gestoppt: der Befehl steht nach dem Speichern am neuen Platz', { tag: '@ZON-20' }, async ({ worker, dashboard }) => {
    seedLegacyFile(worker);
    await dashboard.open(DEMO_ID);

    // Bot gestoppt: der Worker zieht die ui_state-Datei beim Speichern auf (A, C, B) um, C → Platz 1
    await dashboard.zone(1).getByRole('button', { name: msg('zone.header.ready') }).click();
    await expect(dashboard.zone(1).getByRole('button', { name: msg('zone.header.off') })).toBeVisible();
    await expect.poll(() => worker.zonesOf(DEMO_ID).map((z) => z.is_active)).toEqual([true, false, true]);
    await expect.poll(() => worker.state.uiState[DEMO_ID]).toEqual({ '1': 'PAUSE' });
    expect(worker.zonesOf(DEMO_ID)).toEqual([
      expect.objectContaining({ id: 'zone-a', is_active: true }),
      expect.objectContaining({ id: 'zone-c', is_active: false }),
      expect.objectContaining({ id: 'zone-b', is_active: true }),
    ]);
  });
});
