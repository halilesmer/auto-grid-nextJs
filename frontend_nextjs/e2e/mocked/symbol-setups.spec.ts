/**
 * ZON-19 Symbol mit Setups: Der Worker liefert nur SYMBOLS; jedes Setup trägt seinen Platz in der
 * Engine-Reihenfolge (index). zone_states und ui-state-Befehle zählen nach diesem Platz; die Oberfläche
 * zeigt die Setups nach Symbol gruppiert (ZON-20) und speichert nur SYMBOLS.
 */
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, makeZone, test, type MockWorker } from '../fixtures/test';

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

test.describe('ZON-19 Symbol mit Setups', () => {
  test('Alte Datei mit gemischten Symbolen: Motorzustand an der richtigen Karte', { tag: '@ZON-19' }, async ({ worker, dashboard }) => {
    seedLegacyFile(worker);
    worker.setBotRunning(DEMO_ID);
    worker.setMetrics(DEMO_ID, { zone_states: { '1': 'AUTO_CLEAR' } });
    await dashboard.open(DEMO_ID);

    // Anzeige nach Symbol gruppiert (ZON-20): USOUSD mit A und C, dann XAUUSD mit B
    await expect(dashboard.symbolInput(0)).toHaveValue('USOUSD');
    await expect(dashboard.symbolInput(1)).toHaveValue('USOUSD');
    await expect(dashboard.zoneField(msg('zone.field.minPrice'), 1)).toHaveValue('80');
    await expect(dashboard.symbolInput(2)).toHaveValue('XAUUSD');
    // Engine-Platz 1 ist Zone B (XAUUSD), nicht das zweite Setup unter USOUSD
    await expect(dashboard.zone(2).getByText(msg('zone.stop.autoClear.label'))).toBeVisible();
    await expect(dashboard.zone(0).getByText(msg('zone.stop.autoClear.label'))).toBeHidden();
    await expect(dashboard.zone(1).getByText(msg('zone.stop.autoClear.label'))).toBeHidden();
  });

  test('Speichern schickt nur SYMBOLS; die Datei wird nach Symbol gruppiert, Magics bleiben', { tag: '@ZON-19' }, async ({ worker, dashboard }) => {
    seedLegacyFile(worker);
    await dashboard.open(DEMO_ID);
    // Zone B (XAUUSD) ist die dritte Setup-Karte: erst USOUSD (A, C), dann XAUUSD
    await dashboard.zoneField(msg('zone.field.maxPrice'), 2).fill('2100');
    await dashboard.saveAllSettings();

    const [call] = worker.callsTo('POST', `/api/settings/${DEMO_ID}`);
    const sent = call.body?.settings as Record<string, unknown>;
    expect(sent).not.toHaveProperty('ZONES');
    expect(sent.SYMBOLS).toEqual([
      { symbol: 'USOUSD', setups: [expect.objectContaining({ id: 'zone-a' }), expect.objectContaining({ id: 'zone-c' })] },
      { symbol: 'XAUUSD', setups: [expect.objectContaining({ id: 'zone-b', max_price: 2100 })] },
    ]);
    // index kommt nur im GET und geht nicht zurück
    const setups = (sent.SYMBOLS as { setups: object[] }[]).flatMap((g) => g.setups);
    expect(setups.filter((s) => 'index' in s)).toEqual([]);
    const stored = worker.settingsOf(DEMO_ID);
    expect(stored).not.toHaveProperty('ZONES');
    expect(worker.zonesOf(DEMO_ID).map((z) => [z.id, z.symbol, z.magic])).toEqual([
      ['zone-a', 'USOUSD', 200001],
      ['zone-c', 'USOUSD', 200003],
      ['zone-b', 'XAUUSD', 200002],
    ]);
  });
});
