/**
 * Backtest-Seite (/backtest), B5a: ein Lauf im Web Worker gegen den Mock-Worker.
 * BKT-06 Seite, Lauf, Test-Knopf der Zone, Netting-Sperre · BKT-10 Hinweise zum Ergebnis · BKT-12 Fehler, Kontowechsel
 * Die Zahlen des Rechners prüft backtest-runner-lib.spec.ts; hier geht es um Seite, Übergabe und Anzeige.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { de, en, tr } from '../../src/i18n/messages';
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
    await expect(page.getByTestId('bt-result')).toHaveCount(0);
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
