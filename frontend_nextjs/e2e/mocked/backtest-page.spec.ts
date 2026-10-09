/**
 * Backtest-Seite (/backtest), B5a: ein Lauf im Web Worker gegen den Mock-Worker.
 * BKT-06 Seite, Lauf, Test-Knopf der Zone, Netting-Sperre · BKT-10 Hinweise zum Ergebnis · BKT-12 Fehler, Kontowechsel
 * Die Zahlen des Rechners prüft backtest-runner-lib.spec.ts; hier geht es um Seite, Übergabe und Anzeige.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { de, en, tr } from '../../src/i18n/messages';
import type { CsvImportRow } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, LIVE_ID, ZONE_ID, expect, makeZone, test } from '../fixtures/test';

const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`;

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(90_000);
});

/** Zeitraum über den Kalender wählen (die Adresse bekommt `range=`; Konto und Setup bleiben) */
async function chooseRange(page: Page, preset: string) {
  await page.getByTestId('range-trigger').click();
  await page.getByTestId(`range-preset-${preset}`).click();
  await expect(page).toHaveURL(new RegExp(`range=${preset}`));
}

/** Ein CSV-Import im Mock-Worker (abgeschlossen, USOUSD M1, letzte 3 Tage), mit Abweichungen */
function csvRow(over: Partial<CsvImportRow>): CsvImportRow {
  const day = Math.floor(Date.now() / 86_400_000) * 86400;
  return {
    import_id: '0'.repeat(32), account_id: DEMO_ID, symbol: 'USOUSD', timeframe: 'M1', filename: 'uso.csv', status: 'committed',
    size_bytes: 100, received_bytes: 100, next_chunk: 1, bars: 4320, first_t: day - 3 * 86400, last_t: day - 60, gaps: 0,
    offset_sec: 0, created_at: day, committed_at: day, text: '', ...over,
  };
}

async function runTest(page: Page) {
  await page.getByTestId('bt-run').click();
  await expect(page.getByTestId('bt-result')).toBeVisible({ timeout: 60_000 });
}

test.describe('BKT Backtest-Seite', () => {
  test('Test-Knopf der Zone öffnet die Seite, ein Lauf zeigt Ergebnis, Hinweise und Protokoll', { tag: '@BKT-06' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zone().getByRole('link', { name: msg('zone.header.test') }).click();
    await expect(page).toHaveURL(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}`);
    await expect(page.getByTestId('bt-source')).toHaveAttribute('data-unsaved', 'false');
    await chooseRange(page, 'last7'); // kurzer Zeitraum, damit der Lauf kurz bleibt

    await runTest(page);

    await expect(page.getByTestId('bt-result-column')).toHaveCount(1);
    await expect(page.getByTestId('bt-sum-realized-value')).not.toBeEmpty();
    await expect(page.getByTestId('stats-kpis')).toBeVisible();
    await expect(page.getByTestId('bt-curves')).toBeVisible();
    await expect(page.getByTestId('bt-log-lines').locator('[data-code="zone.entered"]').first()).toBeVisible();
    expect(worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`).length).toBeGreaterThan(0);
    // Der Backtest speichert nie ein Setup
    expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
    expect(worker.callsTo('PUT', /\/api\/settings/)).toHaveLength(0);
  });

  test('ungespeicherte Änderung der Zone läuft mit, ohne gespeichert zu werden', { tag: '@BKT-06' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zoneField(msg('zone.field.gridStep')).fill('0.05');
    await expect(dashboard.zone().getByTestId('zone-save')).toBeEnabled();
    await dashboard.zone().getByRole('link', { name: msg('zone.header.test') }).click();
    await expect(page.getByTestId('bt-source')).toHaveAttribute('data-unsaved', 'true');
    await expect(page.getByTestId('bt-source')).toContainText(msg('backtest.source.unsaved'));
    await chooseRange(page, 'last7');

    await runTest(page);

    // Grid-Abstand 0,05 liegt unter der mittleren Kerzenspanne des Mocks (≈ 0,1): nur mit dem ungespeicherten Wert
    await expect(page.locator('[data-testid="bt-notes"] [data-code="unsure"]')).toBeVisible();
    expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
    expect(worker.zonesOf(DEMO_ID)[0].grid_step).toBe(0.5);
  });

  test('ohne Übergabe (Neuladen) gilt die gespeicherte Zone', { tag: '@BKT-06' }, async ({ page, worker }) => {
    void worker;
    await page.goto(URL);
    await expect(page.getByTestId('bt-source')).toHaveAttribute('data-unsaved', 'false');
    await expect(page.getByTestId('bt-source')).toContainText(msg('backtest.source.saved'));
    await expect(page.getByTestId('zone-select')).toContainText(msg('analysis.zone.option', { symbol: 'USOUSD', n: 1 }));
  });

  test('neues, noch nicht gespeichertes Setup: Test-Knopf zeigt es mit seiner Nummer', { tag: '@BKT-06' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.symbolCard().getByRole('button', { name: msg('zone.symbol.addSetup') }).click();
    await expect(page.getByTestId('zone-card')).toHaveCount(2);
    await dashboard.zone(1).getByRole('link', { name: msg('zone.header.test') }).click();

    await expect(page.getByTestId('bt-source')).toHaveAttribute('data-unsaved', 'true');
    await expect(page.getByTestId('zone-select')).toContainText(msg('analysis.zone.option', { symbol: 'USOUSD', n: 2 }));
    expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
  });

  test('über das Menü ohne Test-Knopf gilt die gespeicherte Zone, nicht die ungespeicherte Änderung', { tag: '@BKT-06' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zoneField(msg('zone.field.gridStep')).fill('0.05');
    await expect(dashboard.zone().getByTestId('zone-save')).toBeEnabled();
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.backtest') }).click();
    await expect(page.getByTestId('bt-source')).toHaveAttribute('data-unsaved', 'false');
    await chooseRange(page, 'last7');

    await runTest(page);

    // Gespeicherter Grid-Abstand 0,5 liegt über der mittleren Kerzenspanne des Mocks (≈ 0,1): kein Hinweis „unsicher“
    await expect(page.getByTestId('bt-notes').locator('[data-code="unsure"]')).toHaveCount(0);
    expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
  });

  test('Zeitraum „Alles“: Start gesperrt, weil der Zeitraum keinen Anfang hat', { tag: '@BKT-06' }, async ({ page, worker }) => {
    await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=all`);

    await expect(page.getByTestId('bt-range-all')).toContainText(msg('backtest.range.all.title'));
    await expect(page.getByTestId('bt-run')).toBeDisabled();
    expect(worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`)).toHaveLength(0);
  });

  test('„Beide“ zeigt zwei Ergebnisse mit gegensätzlichem Kerzenweg', { tag: '@BKT-06' }, async ({ page, worker }) => {
    void worker;
    await page.goto(URL);
    await page.getByTestId('bt-path').selectOption('both');

    await runTest(page);

    const columns = page.getByTestId('bt-result-column');
    await expect(columns).toHaveCount(2);
    await expect(columns.nth(0)).toHaveAttribute('data-path', 'lowFirst');
    await expect(columns.nth(1)).toHaveAttribute('data-path', 'highFirst');
    await expect(page.getByText(msg('backtest.result.pair'))).toBeVisible();
  });

  test('Hinweise zum Ergebnis stehen immer da und lassen sich nicht ausblenden', { tag: '@BKT-10' }, async ({ page, worker }) => {
    void worker;
    await page.goto(URL);
    await page.getByTestId('bt-timeframe').selectOption('M5');

    await runTest(page);

    const notes = page.getByTestId('bt-notes');
    for (const code of ['run.marginNotChecked', 'run.rejectsNotSimulated', 'run.stopsLevelNotSimulated', 'run.costsEstimated']) {
      await expect(notes.locator(`[data-code="${code}"]`)).toBeVisible();
    }
    await expect(notes.locator('[data-code="coarse"]')).toContainText('M5');
    // Kein Schließen-Knopf im Hinweisblock
    await expect(page.getByRole('alert').filter({ hasText: msg('backtest.notes.title') }).getByRole('button')).toHaveCount(0);
    // Auch nach dem Filter „nur Warnungen“ im Protokoll bleibt der Block
    await page.getByRole('switch', { name: msg('backtest.log.onlyWarn') }).click();
    await expect(notes).toBeVisible();
  });

  test('Datenlücken stehen im Hinweisblock', { tag: '@BKT-10' }, async ({ page, worker }) => {
    const now = Date.now() / 1000 + worker.state.brokerOffset;
    const from = Math.floor((now - 3 * 86400) / 3600) * 3600;
    worker.state.ratesMissing = [{ from, to: from + 7200, reason: 'unavailable', checked_at: null }];
    await page.goto(URL);

    await runTest(page);

    await expect(page.getByTestId('bt-notes').locator('[data-code="run.dataMissing"]').first()).toBeVisible();
  });

  test('Netting-Konto: Start gesperrt, Grund steht da', { tag: '@BKT-06' }, async ({ page, worker }) => {
    worker.state.marginMode = 0;
    await page.goto(URL);

    await expect(page.getByTestId('bt-netting')).toContainText(msg('backtest.netting.title'));
    await expect(page.getByTestId('bt-run')).toBeDisabled();
    expect(worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`)).toHaveLength(0);
  });

  test('Margin-Modus unbekannt: Warnung, Start bleibt möglich', { tag: '@BKT-06' }, async ({ page, worker }) => {
    worker.state.marginMode = null;
    await page.goto(URL);

    await expect(page.getByTestId('bt-margin-unknown')).toBeVisible();
    await expect(page.getByTestId('bt-run')).toBeEnabled();
  });

  test('Fehler des Workers erscheinen als Text, nicht als Absturz', { tag: '@BKT-12' }, async ({ page, worker }) => {
    worker.state.ratesError = { status: 503, detail: 'Piyasa veritabanı hazır değil' };
    await page.goto(URL);

    await page.getByTestId('bt-run').click();

    const error = page.getByTestId('bt-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error.locator('[data-code="run.http"]')).toContainText('503');
    await expect(page.getByTestId('bt-result')).toHaveCount(0);
    await expect(page.getByTestId('bt-run')).toBeEnabled();
  });

  test('Kontowechsel leert das Ergebnis des alten Kontos', { tag: '@BKT-12' }, async ({ page, worker }) => {
    worker.setZones(LIVE_ID, [makeZone()]);
    await page.goto(URL);
    await runTest(page);

    const select = page.getByRole('combobox', { name: msg('account.select.aria') });
    await select.click();
    const listId = await select.getAttribute('aria-controls');
    await page.locator(`[id="${listId}"]`).getByRole('option').filter({ hasText: `(${LIVE_ID})` }).click();

    await expect(page).toHaveURL(new RegExp(`account=${LIVE_ID}`));
    await expect(page.getByTestId('bt-result')).toHaveCount(0);
  });

  test('Ergebnis gehört zum Setup: ein anderes Setup zeigt es nicht', { tag: '@BKT-12' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone(), makeZone({ id: 'zone-e2e-2' })]);
    await page.goto(URL);
    await runTest(page);

    await page.getByTestId('zone-select').getByRole('combobox').click();
    await page.getByRole('option', { name: msg('analysis.zone.option', { symbol: 'USOUSD', n: 2 }) }).click();

    await expect(page).toHaveURL(/zone=zone-e2e-2/);
    await page.getByRole('button', { name: msg('backtest.setups.add'), exact: true }).click();
    await expect(page.getByTestId('bt-setup')).toHaveCount(2);
    await expect(page.getByTestId('bt-result')).toHaveCount(0);
  });

  test('Fehler gehört zum Setup: ein anderes Setup zeigt ihn nicht', { tag: '@BKT-12' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone(), makeZone({ id: 'zone-e2e-2' })]);
    worker.state.ratesError = { status: 503, detail: 'Piyasa veritabanı hazır değil' };
    await page.goto(URL);
    await page.getByTestId('bt-run').click();
    await expect(page.getByTestId('bt-error')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('zone-select').getByRole('combobox').click();
    await page.getByRole('option', { name: msg('analysis.zone.option', { symbol: 'USOUSD', n: 2 }) }).click();

    await expect(page).toHaveURL(/zone=zone-e2e-2/);
    await page.getByRole('button', { name: msg('backtest.setups.add'), exact: true }).click();
    await expect(page.getByTestId('bt-setup')).toHaveCount(2);
    await expect(page.getByTestId('bt-error')).toHaveCount(0);
  });

  test('Abbrechen beendet den Lauf ohne Ergebnis', { tag: '@BKT-06' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last90`);
    await page.getByTestId('bt-run').click();
    await expect(page.getByTestId('bt-progress')).toBeVisible();

    await page.getByTestId('bt-cancel').click();

    await expect(page.getByTestId('bt-run')).toBeVisible();
    await expect(page.getByTestId('bt-result')).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('bt-result')).toHaveCount(0);
  });

  test('Datenquelle CSV: nur passende, abgeschlossene Importe; der Lauf liest nur den Import, Lücken heißen csv_gap', { tag: ['@BKT-06', '@BKT-05'] }, async ({ page, worker }) => {
    const now = Date.now() / 1000 + worker.state.brokerOffset;
    const first = Math.floor((now - 2 * 86400) / 60) * 60;
    const last = Math.floor((now - 3600) / 60) * 60;
    worker.state.csvImports = [
      csvRow({ import_id: 'a'.repeat(32), first_t: first, last_t: last }),
      csvRow({ import_id: 'b'.repeat(32), status: 'staging', first_t: null, last_t: null, bars: null }),
      csvRow({ import_id: 'c'.repeat(32), symbol: 'XAUUSD' }),
      csvRow({ import_id: 'd'.repeat(32), timeframe: 'H4' }),
    ];
    await page.goto(URL);

    const source = page.getByTestId('bt-data-source');
    await expect(source.locator('option')).toHaveCount(2);
    await expect(source.locator('option').nth(0)).toHaveText(msg('backtest.data.mt5'));
    await page.getByTestId('bt-timeframe').selectOption('M5');
    await source.selectOption('a'.repeat(32));
    await expect(page.getByTestId('bt-timeframe')).toBeDisabled();
    await expect(page.getByTestId('bt-timeframe')).toHaveValue('M1');

    await runTest(page);

    const calls = worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.map((c) => [c.query.get('source'), c.query.get('timeframe')])).toEqual(calls.map(() => [`csv:${'a'.repeat(32)}`, 'M1']));
    // Vor dem Import liegen 5 Tage ohne Kerzen: sie stehen als Lücke mit Text da, nichts wird aufgefüllt
    await expect(page.getByTestId('bt-notes').locator('[data-code="run.dataMissing"]').first()).toContainText(msg('analysis.data.reason.csv_gap'));
    expect(worker.callsTo('POST', /\/api\/settings/)).toHaveLength(0);
  });

  test('gelöschter CSV-Import: die Auswahl fällt auf den MT5-Server zurück', { tag: ['@BKT-06', '@BKT-05'] }, async ({ page, worker }) => {
    worker.state.csvImports = [csvRow({ import_id: 'a'.repeat(32) })];
    await page.goto(URL);
    await page.getByTestId('bt-data-source').selectOption('a'.repeat(32));
    await expect(page.getByTestId('bt-timeframe')).toBeDisabled();

    await page.getByTestId('csv-item').getByTestId('csv-delete').click();

    await expect(page.getByTestId('csv-item')).toHaveCount(0);
    await expect(page.getByTestId('bt-data-source')).toHaveValue('');
    await expect(page.getByTestId('bt-timeframe')).toBeEnabled();
    await runTest(page);
    const calls = worker.callsTo('GET', `/api/market/${DEMO_ID}/rates`);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.query.get('source') === null)).toBe(true);
  });

  test('Backtest-Seite ohne Konto: Hinweis, kein Absturz', { tag: '@BKT-06' }, async ({ page, worker }) => {
    void worker;
    await page.goto('/backtest');
    await expect(page.getByRole('heading', { name: msg('backtest.title') })).toBeVisible();
  });
});

test.describe('BKT Texte des Laufprotokolls', () => {
  /** Alle Codes, die der Rechner (lib/backtest) meldet, haben einen Text in tr, en und de */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    });
  }

  test('jeder Code im Rechner hat Log- oder Fehlertext in drei Sprachen', { tag: '@BKT-12' }, () => {
    const codes = new Set<string>();
    for (const file of sourceFiles(join(__dirname, '../../src/lib/backtest'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/'((?:run|engine|config|zone|grid|position|order|fractal)\.[A-Za-z]+)'/g)) codes.add(match[1]);
    }
    expect(codes.size).toBeGreaterThan(60);
    // Codes, die nur als Abbruchgrund vorkommen (error), und Codes nur im Protokoll (log): jeder hat mindestens einen Text
    const missing = [...codes].filter((code) => !(`backtest.log.${code}` in tr) && !(`backtest.error.${code}` in tr));
    expect(missing).toEqual([]);
    for (const key of Object.keys(tr).filter((k) => k.startsWith('backtest.'))) {
      expect(key in en && key in de, key).toBe(true);
    }
  });
});
