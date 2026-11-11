/**
 * BKT-25 Seite /backtest: ein gespeichertes Setup mit MT5-M1-Kerzen startet im Live-Zustand des Fensterbeginns.
 * Deals kommen aus dem Archiv der Seite, die Pending Orders holt der Lauf selbst (GET /history/{id}/orders).
 * Die Zahlen des Laufs prüft backtest-start-state-run-lib.spec.ts; hier geht es um Bedingung, Übergabe und Protokoll.
 */
import type { Page } from '@playwright/test';
import type { CsvImportRow } from '../fixtures/data';
import { DEMO_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`;
const DAY = 86400;
const MAGIC = 200001;

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(90_000);
});

/** Eine Position, die vor dem Fenster (letzte 7 Tage) eröffnet wurde und noch offen ist, plus eine wartende Order */
function seed(worker: import('../fixtures/mock-worker').MockWorker) {
  const now = Math.floor(Date.now() / 1000) + worker.state.brokerOffset;
  worker.setZones(DEMO_ID, [makeZone({ magic: MAGIC })]);
  worker.state.deals[DEMO_ID] = [{
    ticket: 700, order: 700, position_id: 70, time: now - 10 * DAY, time_msc: (now - 10 * DAY) * 1000, type: 0, entry: 0, magic: MAGIC,
    symbol: 'USOUSD', volume: 0.01, price: 97, profit: 0, commission: 0, swap: 0, fee: 0, comment: '', reason: 3, open_sl: null, open_tp: 120,
  }];
  worker.state.liveOrders[DEMO_ID] = [{
    ticket: 800, time_setup: now - 10 * DAY, time_setup_msc: (now - 10 * DAY) * 1000, time_done: 0, time_done_msc: 0, type: 2, state: 1, magic: MAGIC,
    symbol: 'USOUSD', volume_initial: 0.01, price_open: 90, sl: null, tp: 92, comment: 'x', active: true,
  }];
}

async function runTest(page: Page) {
  await page.getByTestId('bt-run').click();
  await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 60_000 });
}
const code = (page: Page, c: string) => page.getByTestId('bt-result').locator(`[data-code="${c}"]`);

test('Gespeichertes Setup auf MT5-M1: Protokoll nennt Startposition und Start-Order', { tag: '@BKT-25' }, async ({ page, worker }) => {
  seed(worker);
  await page.goto(URL);
  await runTest(page);
  await expect(code(page, 'run.startPositions').first()).toBeVisible();
  await expect(code(page, 'run.startOrders').first()).toBeVisible();
  expect(worker.callsTo('GET', `/api/history/${DEMO_ID}/orders`).length).toBeGreaterThan(0);
  await expect(code(page, 'run.startOrdersMissing')).toHaveCount(0);
});

test('Orders-Endpunkt fällt aus: WARN, die Position startet trotzdem, der Lauf endet', { tag: '@BKT-25' }, async ({ page, worker }) => {
  seed(worker);
  worker.overrides.set(`GET /api/history/${DEMO_ID}/orders`, { status: 500, body: { detail: 'boom' } });
  await page.goto(URL);
  await runTest(page);
  await expect(code(page, 'run.startOrdersMissing').first()).toBeVisible();
  await expect(code(page, 'run.startPositions').first()).toBeVisible();
  await expect(code(page, 'run.startOrders')).toHaveCount(0);
});

test('Archiv deckt den Fensterbeginn nicht ab: Lauf ohne Startzustand und WARN startStateMissing', { tag: '@BKT-25' }, async ({ page, worker }) => {
  seed(worker);
  const now = Math.floor(Date.now() / 1000) + worker.state.brokerOffset;
  worker.state.dealsMissing = [{ from: now - 30 * DAY, to: now - 20 * DAY, reason: 'busy' }];
  await page.goto(URL);
  await runTest(page);
  await expect(code(page, 'run.startStateMissing').first()).toBeVisible();
  await expect(code(page, 'run.startPositions')).toHaveCount(0);
  expect(worker.callsTo('GET', `/api/history/${DEMO_ID}/orders`)).toHaveLength(0);
});

test('CSV-Quelle: kein Startzustand, keine Startzeile, kein Orders-Abruf', { tag: '@BKT-25' }, async ({ page, worker }) => {
  seed(worker);
  const day = Math.floor(Date.now() / 86_400_000) * DAY;
  const row: CsvImportRow = {
    import_id: 'a'.repeat(32), account_id: DEMO_ID, symbol: 'USOUSD', timeframe: 'M1', filename: 'uso.csv', status: 'committed',
    size_bytes: 100, received_bytes: 100, next_chunk: 1, bars: 4320, first_t: day - 2 * DAY, last_t: day - 3600, gaps: 0,
    offset_sec: 0, created_at: day, committed_at: day, server: 'Broker-Demo', text: '',
  };
  worker.state.csvImports = [row];
  await page.goto(URL);
  await page.getByTestId('bt-data-source').selectOption('a'.repeat(32));
  await runTest(page);
  await expect(code(page, 'run.startPositions')).toHaveCount(0);
  await expect(code(page, 'run.startStateMissing')).toHaveCount(0);
  expect(worker.callsTo('GET', `/api/history/${DEMO_ID}/orders`)).toHaveLength(0);
});
