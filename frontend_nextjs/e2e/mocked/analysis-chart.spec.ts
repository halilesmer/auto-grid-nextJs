/**
 * Chart-Tab der Analyse-Seite (Schritt 3 des Plans): Kerzen aus GET /market/{id}/rates, Zeitrahmen,
 * fehlende Daten, Marktpausen, Zonenband/Stufen, Positionen und Orders des laufenden Bots.
 * Abnahme: fehlende Datenbereiche sind sichtbar markiert, es werden keine erfundenen Kerzen gezeichnet.
 * ANA-05 Band/Stufen · ANA-06 Positionen/Orders · ANA-11 Marktpausen/fehlende Daten
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, test, type MockWorker } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}`;
const DAY = 86400;

/** Ein Mittwoch 10:00–14:00 (MT5-Zeit) vor ein bis zwei Wochen: liegt sicher in „letzte 30 Tage“. */
function weekdayHole(worker: MockWorker) {
  const now = Date.now() / 1000 + worker.state.brokerOffset;
  let day = Math.floor(now / DAY) * DAY - 8 * DAY;
  while (new Date(day * 1000).getUTCDay() !== 3) day -= DAY;
  return { from: day + 10 * 3600, to: day + 14 * 3600, reason: 'unavailable', checked_at: Math.floor(Date.now() / 1000) };
}

function ratesCalls(worker: MockWorker) {
  return worker.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/rates'));
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: msg('analysis.settings') }).click();
  return page.getByTestId('analysis-settings');
}

test.describe('ANA-11 Kerzen, fehlende Daten und Marktpausen', () => {
  test('Fehlender Bereich ist markiert und genannt, gezeichnet werden nur gelieferte Kerzen', { tag: '@ANA-11' }, async ({ page, worker }) => {
    worker.state.ratesMissing = [weekdayHole(worker)];
    await page.goto(URL);

    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toBeVisible();
    // Zone USOUSD, Standard-Zeitrahmen M15, Konto aus der Adresse
    const call = ratesCalls(worker)[0];
    expect(call.query.get('symbol')).toBe('USOUSD');
    expect(call.query.get('timeframe')).toBe('M15');
    expect(call.path).toBe(`/api/market/${DEMO_ID}/rates`);

    // Pflicht-Hinweis mit Grund, ohne Schalter
    const quality = page.getByTestId('data-quality');
    await expect(quality).toContainText(msg('analysis.data.missing.title', { n: 1 }));
    await expect(page.getByTestId('missing-ranges')).toContainText(msg('analysis.data.reason.unavailable'));
    await expect(chart).toHaveAttribute('data-gap-areas', '1');
    // Keine erfundenen Kerzen: der Chart hat genau die Kerzen, die der Worker geliefert hat. Ein Abruf:
    // der Zeitraum steht erst mit der Brokeruhr fest, vorher wird nichts geladen
    expect(worker.ratesDelivered).toHaveLength(1);
    expect(worker.ratesDelivered[0]).toBeGreaterThan(0);
    await expect(chart).toHaveAttribute('data-bars', String(worker.ratesDelivered[0]));
    // 30 Tage enthalten Wochenenden: Marktpausen zwischen echten Kerzen
    expect(Number(await chart.getAttribute('data-pauses'))).toBeGreaterThanOrEqual(4);
    await expect(page.getByTestId('chart-key')).toContainText(msg('analysis.chart.key.noData'));

    // Pausen-Linien abschaltbar, die Markierung fehlender Daten nicht
    const panel = await openSettings(page);
    await panel.getByRole('switch', { name: msg('analysis.settings.pauses') }).click();
    await expect(page.getByTestId('chart-key')).not.toContainText(msg('analysis.chart.key.pause'));
    await expect(page.getByTestId('chart-key')).toContainText(msg('analysis.chart.key.noData'));
    await expect(quality).toBeVisible();
  });

  test('Zeitrahmen steht in der Adresse und lädt passende Kerzen', { tag: '@ANA-11' }, async ({ page, worker }) => {
    await page.goto(URL);
    await expect(page.getByTestId('analysis-chart')).toBeVisible();
    await page.getByTestId('timeframe-H1').click();
    await expect(page).toHaveURL(/tf=H1/);
    await expect.poll(() => ratesCalls(worker).at(-1)?.query.get('timeframe')).toBe('H1');

    await page.reload();
    await expect(page.getByTestId('timeframe-H1')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  });

  test('Fehler beim Laden: Meldung statt leerem Chart', { tag: '@ANA-11' }, async ({ page, worker }) => {
    worker.state.ratesError = { status: 503, detail: 'Piyasa veritabanı hazır değil' };
    await page.goto(URL);
    await expect(page.getByRole('alert').filter({ hasText: msg('analysis.chart.loadFailed') })).toContainText('Piyasa veritabanı hazır değil');
  });
});

test.describe('ANA-05 Zonenband und Stufen', () => {
  test('Band und Stufen sind abschaltbar; Fraktal-Zone hat keine Stufen', { tag: '@ANA-05' }, async ({ page, worker }) => {
    await page.goto(URL);
    const key = page.getByTestId('chart-key');
    await expect(key).toContainText(msg('analysis.chart.key.band'));
    await expect(key).toContainText(msg('analysis.chart.key.levels'));

    const panel = await openSettings(page);
    await panel.getByRole('switch', { name: msg('analysis.settings.zoneLines') }).click();
    await panel.getByRole('switch', { name: msg('analysis.settings.levels') }).click();
    await expect(key).not.toContainText(msg('analysis.chart.key.band'));
    await expect(key).not.toContainText(msg('analysis.chart.key.levels'));
    await page.keyboard.press('Escape');

    worker.setZones(DEMO_ID, [makeZone({ entry_mode: 'fractal' })]);
    await page.reload();
    await (await openSettings(page)).getByRole('switch', { name: msg('analysis.settings.levels') }).click();
    await expect(page.getByTestId('levels-note')).toHaveText(msg('analysis.chart.levels.fractal'));
  });
});

test.describe('ANA-05 Laufende Kerze', () => {
  test('Live-Preis schreibt die laufende Kerze fort, ein fremder Preis nicht', { tag: '@ANA-05' }, async ({ page, worker }) => {
    await page.goto(`${URL}&tf=D1`);
    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toHaveAttribute('data-last-bar', /:/);
    await expect.poll(() => worker.openSockets).toBeGreaterThan(0);
    const today = String(Math.floor((Date.now() / 1000 + worker.state.brokerOffset) / DAY) * DAY);

    worker.pushMetrics({ account_id: DEMO_ID, symbol: 'USOUSD', price: 97.531, market_open: true });
    await expect(chart).toHaveAttribute('data-last-bar', `${today}:97.531`);
    // Preis eines anderen Symbols (EURUSD im USOUSD-Stream): keine Kerze daraus
    worker.pushMetrics({ account_id: DEMO_ID, symbol: 'USOUSD', price: 1.1242, market_open: true });
    await page.waitForTimeout(500);
    await expect(chart).toHaveAttribute('data-last-bar', `${today}:97.531`);
    // Markt zu: keine Fortschreibung
    worker.pushMetrics({ account_id: DEMO_ID, symbol: 'USOUSD', price: 97.6, market_open: false });
    await page.waitForTimeout(500);
    await expect(chart).toHaveAttribute('data-last-bar', `${today}:97.531`);
  });
});

test.describe('ANA-06 Positionen und Orders', () => {
  test('Nur Positionen und Orders dieser Zone, nur bei laufendem Bot', { tag: '@ANA-06' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
    worker.setBotRunning(DEMO_ID);
    const row = { symbol: 'USOUSD', sl: 0, tp: 0, time: 1, volume: 0.01 };
    worker.setMetrics(DEMO_ID, {
      positions: [
        { ...row, ticket: 1, magic: 200001, type: 0, price_open: 96.5, tp: 97, profit: 1.2 },
        { ...row, ticket: 2, magic: 200002, type: 1, price_open: 98, profit: -1 }, // andere Zone
      ],
      orders: [
        { ...row, ticket: 3, magic: 200001, type: 2, price_open: 96 },
        { ...row, ticket: 4, magic: 200001, type: 2, price_open: 95.5 },
        { ...row, ticket: 5, magic: 200001, type: 2, price_open: 95, symbol: 'XAUUSD' }, // anderes Symbol
      ],
    });
    await page.goto(URL);
    const note = page.getByTestId('trades-note');
    await expect(note).toHaveText(msg('analysis.chart.trades.count', { positions: 1, orders: 2 }));
    await expect(page.getByTestId('market-hours')).toContainText('02:00-00:00');

    // Bot gestoppt: alte Metrikdatei liefert keine Live-Positionen mehr
    worker.setBotRunning(DEMO_ID, false);
    await expect(note).toHaveText(msg('analysis.chart.trades.botStopped'), { timeout: 10_000 });
  });
});
