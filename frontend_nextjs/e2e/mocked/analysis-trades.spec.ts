/**
 * Trades im Chart und Trade-Archiv (Schritt 5 des Plans) aus GET /history/{id}/deals.
 * Abnahme: Teilschließungen, Umkehr-Positionen und „Zone unbekannt“ werden richtig dargestellt.
 * ANA-08 Pfeile/Fraktale/Trade-Archiv
 * ANA-12 MFE/MAE auch im Trade-Archiv des Chart-Tabs
 */
import type { Page } from '@playwright/test';
import type { Deal } from '../../src/lib/analysis/tradePairing';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, test, type MockWorker } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}`;
const DAY = 86400;
const H = 3600;

/** Ein Mittwoch 00:00 (MT5-Zeit) vor ein bis zwei Wochen: Mi–Fr liegen sicher in „letzte 30 Tage“. */
function wednesday(worker: MockWorker) {
  const now = Date.now() / 1000 + worker.state.brokerOffset;
  let day = Math.floor(now / DAY) * DAY - 8 * DAY;
  while (new Date(day * 1000).getUTCDay() !== 3) day -= DAY;
  return day;
}

let ticket = 100;
function deal(p: Partial<Deal> & Pick<Deal, 'position_id' | 'time' | 'type' | 'entry'>): Deal {
  const t = ticket++;
  return {
    ticket: t,
    order: t,
    time_msc: p.time * 1000,
    magic: 200001,
    symbol: 'USOUSD',
    volume: 0.01,
    price: 97,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    comment: '',
    reason: 3,
    ...p,
  };
}

/**
 * Zone 200001 seit 20 Tagen im Register. Teilschließung (Position 11), unbekannte Zone (12, Magic nicht im
 * Register), Umkehr (13, Netting), manueller Trade (14, nicht in der Liste), offener Einstieg (15), Einzahlung,
 * Position 16 vor dem Zeitraum (und vor dem Register) eröffnet und teilweise geschlossen, Rest im Zeitraum.
 */
function seed(worker: MockWorker) {
  const wed = wednesday(worker);
  const thu = wed + DAY;
  const fri = wed + 2 * DAY;
  worker.state.settings[DEMO_ID] = { ZONES: [makeZone({ magic: 200001 })] };
  worker.state.zoneRegistry[DEMO_ID] = [
    { magic: 200001, zone_id: ZONE_ID, symbol: 'USOUSD', label: 'Z1', created_at: Math.floor(Date.now() / 1000) - 20 * DAY, deleted_at: null },
  ];
  worker.state.deals[DEMO_ID] = [
    deal({ position_id: 0, time: wed + 9 * H, type: 2, entry: 0, profit: 1000, magic: 0, symbol: '' }),
    deal({ position_id: 11, time: wed + 10 * H, type: 0, entry: 0, volume: 0.02, price: 97 }),
    deal({ position_id: 11, time: wed + 11 * H, type: 1, entry: 1, price: 97.5, profit: 0.5, reason: 5 }),
    deal({ position_id: 11, time: wed + 12 * H, type: 1, entry: 1, price: 96.8, profit: -0.2 }),
    deal({ position_id: 12, time: wed + 13 * H, type: 1, entry: 0, magic: 200002 }),
    deal({ position_id: 12, time: wed + 14 * H, type: 0, entry: 1, magic: 200002, price: 96.7, profit: 0.3 }),
    deal({ position_id: 13, time: thu + 10 * H, type: 0, entry: 0, price: 96 }),
    deal({ position_id: 13, time: thu + 11 * H, type: 1, entry: 2, volume: 0.03, price: 97, profit: 1 }),
    deal({ position_id: 13, time: thu + 12 * H, type: 0, entry: 1, volume: 0.02, price: 97.2, profit: -0.4 }),
    deal({ position_id: 14, time: thu + 13 * H, type: 0, entry: 0, magic: 0 }),
    deal({ position_id: 14, time: thu + 14 * H, type: 1, entry: 1, magic: 0, profit: 0.1 }),
    deal({ position_id: 15, time: fri + 10 * H, type: 0, entry: 0 }),
    deal({ position_id: 16, time: wed - 40 * DAY, type: 0, entry: 0, volume: 0.02 }),
    deal({ position_id: 16, time: wed - 35 * DAY, type: 1, entry: 1, profit: 0.2 }),
    deal({ position_id: 16, time: thu + 15 * H, type: 1, entry: 1, profit: 0.6 }),
  ];
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: msg('analysis.settings') }).click();
  return page.getByTestId('analysis-settings');
}

test.describe('ANA-08 Trades im Chart und Trade-Archiv', () => {
  test('Teilschließung, Umkehr und „Zone unbekannt“ in Liste und Chart', { tag: '@ANA-08' }, async ({ page, worker }) => {
    seed(worker);
    await page.goto(URL);

    const archive = page.getByTestId('trades-archive');
    const rows = archive.getByTestId('trade-row');
    // 2 Teilschließungen + unbekannte Zone + Umkehr (Schließen) + Schließen der Gegenposition + Rest von 16;
    // manuell nicht, der Teilausstieg von 16 vor dem Zeitraum auch nicht
    await expect(rows).toHaveCount(6);
    await expect(archive.locator('[data-testid="trade-row"][data-partial]')).toHaveCount(3);
    await expect(archive.locator('[data-testid="trade-row"][data-partial]').first()).toContainText(msg('analysis.trades.partial'));
    const reversal = archive.locator('[data-testid="trade-row"][data-reversal]');
    await expect(reversal).toHaveCount(1);
    await expect(reversal).toContainText(msg('analysis.trades.reversal'));
    // Unbekannt: Magic nicht im Register (12) und Einstieg vor dem Register (16, vor dem Zeitraum eröffnet)
    const unknown = archive.locator('[data-testid="trade-row"][data-zone="unknown"]');
    await expect(unknown).toHaveCount(2);
    await expect(unknown.first().getByTestId('trade-zone')).toHaveText(msg('analysis.trades.unknownZone'));
    await expect(unknown.first()).toContainText(msg('analysis.trades.openedBefore'));
    await expect(archive.locator('[data-testid="trade-row"][data-zone="zone"]').first().getByTestId('trade-zone')).toHaveText('Z1');
    await expect(archive.getByTestId('trades-summary')).toHaveText(msg('analysis.trades.summary', { trades: 6, open: 1, other: 1 }));

    // Gleicher Zeitraum wie die Kerzen, nur eigenes Konto
    const call = worker.calls.find((c) => c.method === 'GET' && c.path === `/api/history/${DEMO_ID}/deals`);
    expect(Number(call?.query.get('from'))).toBeGreaterThan(0);

    // Chart: 5 Einstiege (inkl. Gegenposition aus der Umkehr und offenem Einstieg) + 6 Ausstiege im Zeitraum;
    // Einstieg und erster Ausstieg von 16 liegen vor dem Chart
    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toHaveAttribute('data-markers', '11');
    await expect(page.getByTestId('chart-key')).toContainText(msg('analysis.chart.key.unknown'));
    await rows.first().getByRole('button', { name: msg('analysis.trades.focus') }).click();
    await expect(chart).toBeVisible();

    // Abschaltbar; die Liste bleibt
    const panel = await openSettings(page);
    await panel.getByRole('switch', { name: msg('analysis.settings.history') }).click();
    await expect(chart).toHaveAttribute('data-markers', '0');
    await expect(page.getByTestId('chart-key')).not.toContainText(msg('analysis.chart.key.entry'));
    await expect(rows).toHaveCount(6);
  });

  test('Lücke im Archiv wird ohne Schalter gemeldet', { tag: '@ANA-08' }, async ({ page, worker }) => {
    const now = Math.floor(Date.now() / 1000) + worker.state.brokerOffset;
    worker.state.dealsMissing = [{ from: now - 2 * DAY, to: now, reason: 'busy' }];
    await page.goto(URL);
    await expect(page.getByTestId('trades-missing')).toContainText(msg('analysis.data.reason.busy'));
    await expect(page.getByTestId('trades-empty')).toHaveText(msg('analysis.trades.empty'));
  });

  test('Fraktal-Zone: Fraktale aus geschlossenen Kerzen, Hinweis auf den Zeitrahmen der Zone', { tag: '@ANA-08' }, async ({ page, worker }) => {
    worker.state.settings[DEMO_ID] = { ZONES: [makeZone({ magic: 200001, entry_mode: 'fractal', fractal_timeframe: 'H1' })] };
    await page.goto(URL);
    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toHaveAttribute('data-fractals', /^[1-9]\d*$/);
    await expect(page.getByTestId('chart-key')).toContainText(msg('analysis.chart.key.fractal'));

    // Chart in M15, Zone handelt H1: Hinweis mit Knopf
    const note = page.getByTestId('fractal-tf-note');
    await expect(note).toContainText(msg('analysis.chart.fractals.otherTf', { tf: 'H1' }));
    await note.getByRole('button', { name: msg('analysis.chart.fractals.switch', { tf: 'H1' }) }).click();
    await expect(page).toHaveURL(/tf=H1/);
    await expect(note).toBeHidden();

    const panel = await openSettings(page);
    await panel.getByRole('switch', { name: msg('analysis.settings.fractals') }).click();
    await expect(chart).toHaveAttribute('data-fractals', '0');
  });

  test('Grid-Zone zeigt keine Fraktale', { tag: '@ANA-08' }, async ({ page, worker }) => {
    worker.state.settings[DEMO_ID] = { ZONES: [makeZone({ magic: 200001 })] };
    await page.goto(URL);
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-fractals', '0');
    await expect(page.getByTestId('chart-key')).not.toContainText(msg('analysis.chart.key.fractal'));
  });
});

test.describe('ANA-12 MFE/MAE im Chart-Tab', () => {
  test('Dieselbe Tabelle: Knopf berechnet MFE/MAE für alle Zeilen', { tag: '@ANA-12' }, async ({ page, worker }) => {
    seed(worker);
    await page.goto(URL);

    const archive = page.getByTestId('trades-archive');
    await expect(archive.getByTestId('trade-row')).toHaveCount(6);
    const compute = archive.getByTestId('mfe-compute');
    await expect(compute).toHaveText(msg('analysis.trades.mfe.compute', { n: 6 }));
    await compute.click();
    await expect(compute).toHaveText(msg('analysis.trades.mfe.compute', { n: 0 }));
    await expect(archive.getByTestId('trade-mfe').filter({ hasText: msg('analysis.trades.mfe.unit') })).toHaveCount(6);
  });
});
