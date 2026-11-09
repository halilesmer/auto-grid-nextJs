/**
 * Chart-Tab der Analyse-Seite (Schritt 3 des Plans): Kerzen aus GET /market/{id}/rates, Zeitrahmen,
 * fehlende Daten, Marktpausen, Zonenband/Stufen, Positionen und Orders des laufenden Bots.
 * Abnahme: fehlende Datenbereiche sind sichtbar markiert, es werden keine erfundenen Kerzen gezeichnet.
 * ANA-03 Setup-Schalter im Menü „Ebenen“ (früher die Legende) · ANA-05 Band/Stufen · ANA-06 Positionen/Orders · ANA-11 Marktpausen/fehlende Daten
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, test, type MockWorker } from '../fixtures/test';
import { cardRoot } from '../fixtures/card';

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=M15`;
const DAY = 86400;

function ratesCalls(worker: MockWorker) {
  return worker.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/rates'));
}

/** Die Karte startet zu, solange eine Formation gezeichnet wird (UI-22): nach dem Scan aufklappen, dann steht „Übersicht“ da */
async function openCard(page: Page) {
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  const card = cardRoot(page);
  const expand = card.getByRole('button', { name: msg('chart.card.expand'), exact: true });
  if (await expand.count()) await expand.click();
  await card.getByTestId('chart-card-tab-overview').click();
  await expect(card.getByTestId('chart-card-overview')).toBeVisible();
}

async function openSettings(page: Page) {
  await page.getByTestId('layers-button').click();
  return page.getByTestId('layers-menu');
}

test.describe('ANA-11 Kerzen, fehlende Daten und Marktpausen', () => {
  for (const period of [
    { from: '2026-09-07', to: '2026-10-06', pauses: 4, name: 'vier eingeschlossene Wochenenden' },
    { from: '2026-09-05', to: '2026-10-04', pauses: 3, name: 'Wochenenden an beiden Zeitraumgrenzen' },
  ]) {
    test(`Fehlender Bereich ist markiert und genannt, gezeichnet werden nur gelieferte Kerzen: ${period.name}`, { tag: '@ANA-11' }, async ({ page, worker }) => {
      // Feste 30 Tage und ein Mittwoch darin: unabhängig von Uhrzeit und Wochentag des Testlaufs.
      worker.state.ratesMissing = [{
        from: Date.UTC(2026, 8, 16, 10) / 1000,
        to: Date.UTC(2026, 8, 16, 14) / 1000,
        reason: 'unavailable',
        checked_at: Date.UTC(2026, 9, 7) / 1000,
      }];
      await page.goto(`${URL}&from=${period.from}&to=${period.to}`);

      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toBeVisible();
      // Zone USOUSD, Zeitrahmen M15 aus der Adresse, Konto aus der Adresse. Die Formationssuche (UI-22) holt daneben D1, H4, H1 und M15 mit eigenem
      // Zeitraum; die Anfrage des Charts ist die mit dem Zeitraum der Adresse.
      const fromSec = String(Date.parse(`${period.from}T00:00:00Z`) / 1000);
      const chartCalls = ratesCalls(worker).filter((c) => c.query.get('from') === fromSec);
      expect(chartCalls).toHaveLength(1);
      const call = chartCalls[0];
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
      const delivered = worker.ratesDelivered[worker.ratesQueries.findIndex((q) => new URLSearchParams(q).get('from') === fromSec)];
      expect(delivered).toBeGreaterThan(0);
      await expect(chart).toHaveAttribute('data-bars', String(delivered));
      // Nur eingeschlossene Wochenenden: Randwochenenden haben nicht auf beiden Seiten echte Kerzen.
      await expect(chart).toHaveAttribute('data-pauses', String(period.pauses));
      // Pausen-Linien und Schraffur abschaltbar (Menü „Ebenen“), der Hinweis über dem Chart nicht
      await expect(chart).toHaveAttribute('data-gaps-shown', 'true');
      await expect(chart).toHaveAttribute('data-pauses-shown', 'true');
      await page.getByRole('button', { name: msg('cw.layers'), exact: true }).click();
      await page.locator('#layer-pauses').click();
      await expect(chart).toHaveAttribute('data-pauses-shown', 'false');
      await page.locator('#layer-gaps').click();
      await expect(chart).toHaveAttribute('data-gaps-shown', 'false');
      await page.keyboard.press('Escape');
      await expect(chart).toHaveAttribute('data-gap-areas', '1');
      await expect(quality).toBeVisible();
    });
  }

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
    // Die Legende gibt es nicht mehr (UI-22): Band und Stufen zeigt der Zustand der Schalter im Menü „Ebenen“
    await expect(page.getByTestId('chart-key')).toHaveCount(0);
    const panel = await openSettings(page);
    const zoneLines = panel.getByRole('switch', { name: msg('analysis.settings.zoneLines') });
    const levels = panel.getByRole('switch', { name: msg('analysis.settings.levels') });
    await expect(zoneLines).toHaveAttribute('aria-checked', 'true');
    await expect(levels).toHaveAttribute('aria-checked', 'true');
    await zoneLines.click();
    await levels.click();
    await expect(zoneLines).toHaveAttribute('aria-checked', 'false');
    await expect(levels).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');

    worker.setZones(DEMO_ID, [makeZone({ entry_mode: 'fractal' })]);
    await page.reload();
    await (await openSettings(page)).getByRole('switch', { name: msg('analysis.settings.levels') }).click();
    await page.keyboard.press('Escape');
    await openCard(page);
    await expect(page.getByTestId('levels-note')).toHaveText(msg('analysis.chart.levels.fractal'));
  });
});

test.describe('ANA-05 Laufende Kerze', () => {
  test('Live-Preis schreibt die laufende Kerze fort, ein fremder Preis nicht', { tag: '@ANA-05' }, async ({ page, worker }) => {
    await page.goto(URL.replace('tf=M15', 'tf=D1'));
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
    await openCard(page);
    const note = page.getByTestId('trades-note');
    await expect(note).toHaveText(msg('analysis.chart.trades.count', { positions: 1, orders: 2 }));
    await expect(page.getByTestId('market-hours')).toContainText('02:00-00:00');

    // Bot gestoppt: alte Metrikdatei liefert keine Live-Positionen mehr
    worker.setBotRunning(DEMO_ID, false);
    await expect(note).toHaveText(msg('analysis.chart.trades.botStopped'), { timeout: 10_000 });
  });
});

test.describe('ANA-03 Setup-Schalter im Menü „Ebenen“', () => {
  test('Der Schalter „Orders“ im Menü „Ebenen“ blendet nur Pending-Orders aus und bleibt nach Neuladen', { tag: '@ANA-03' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
    worker.setBotRunning(DEMO_ID);
    const row = { symbol: 'USOUSD', sl: 0, tp: 0, time: 1, volume: 0.01 };
    worker.setMetrics(DEMO_ID, {
      positions: [{ ...row, ticket: 1, magic: 200001, type: 0, price_open: 96.5, tp: 97, profit: 1.2 }],
      orders: [
        { ...row, ticket: 3, magic: 200001, type: 2, price_open: 96 },
        { ...row, ticket: 4, magic: 200001, type: 2, price_open: 95.5 },
      ],
    });
    await page.goto(URL);
    await openCard(page);
    const chart = page.getByTestId('analysis-chart');
    await expect(page.getByTestId('trades-note')).toHaveText(msg('analysis.chart.trades.count', { positions: 1, orders: 2 }));

    // Band und Stufen aus: übrig sind Position, ihr TP und zwei Orders
    const panel = await openSettings(page);
    await panel.getByRole('switch', { name: msg('analysis.settings.zoneLines') }).click();
    await panel.getByRole('switch', { name: msg('analysis.settings.levels') }).click();
    await expect(chart).toHaveAttribute('data-lines', '4');

    const orders = panel.getByRole('switch', { name: msg('analysis.settings.orders') });
    await expect(orders).toHaveAttribute('aria-checked', 'true');
    await orders.click();
    await expect(orders).toHaveAttribute('aria-checked', 'false');
    await expect(chart).toHaveAttribute('data-lines', '2');
    await expect(panel.getByRole('switch', { name: msg('analysis.settings.trades') })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-lines', '2');
    const again = await openSettings(page);
    await expect(again.getByRole('switch', { name: msg('analysis.settings.orders') })).toHaveAttribute('aria-checked', 'false');
  });
});
