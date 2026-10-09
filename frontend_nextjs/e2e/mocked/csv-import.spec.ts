/**
 * BKT-05 CSV-Import (B9): Dialog auf der Seite /backtest gegen den Mock-Worker.
 * Zeiten: erste CSV-Spalte = Epoche in Sekunden (MON = 28.09.2026 00:00).
 */
import type { Page } from '@playwright/test';
import { fmt, msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const MON = 1790553600;
const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}`;
const csv = (times: number[]) => 'time,open,high,low,close\n' + times.map((t) => `${t},1,2,0.5,1.5`).join('\n') + '\n';
const rowOffsetCsv = (rows: readonly (readonly [number, number])[]) => 'time,open,high,low,close,broker_offset_sec\n' +
  rows.map(([time, offset]) => `${time},1,2,0.5,1.5,${offset}`).join('\n') + '\n';
const file = (text: string) => ({ name: 'xau.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });

async function openDialog(page: Page) {
  await page.goto(URL);
  await page.getByTestId('csv-open').click();
  await expect(page.getByTestId('csv-import-dialog')).toBeVisible();
}

async function importFile(page: Page, text: string) {
  await page.getByTestId('csv-file').setInputFiles(file(text));
  await page.getByTestId('csv-symbol').fill('XAUUSD');
  await page.getByTestId('csv-submit').click();
}

test.describe('BKT CSV-Import', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`Zeilenmodus im Dialog bei 375px im ${theme}-Thema`, { tag: '@BKT-05' }, async ({ page, worker }, testInfo) => {
      void worker;
      await page.goto(URL);
      await expect(page.getByTestId('csv-open')).toBeVisible();
      await page.getByRole('radiogroup', { name: msg('common.theme') })
        .getByRole('radio', { name: msg(`common.theme.${theme}`) }).click();
      await page.getByTestId('csv-open').click();
      await expect(page.getByTestId('csv-import-dialog')).toBeVisible();
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByTestId('csv-offset-mode').selectOption('row');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`csv-row-${theme}-375.png`) });
    });
  }

  for (const action of ['cancel', 'navigate'] as const) {
    test(`Abbruch während der Importanlage (${action}) räumt die verspätete ID auf`, { tag: '@BKT-05' }, async ({ page, worker }) => {
      await openDialog(page);
      const importId = 'e'.repeat(32);
      let release!: () => void;
      const responseGate = new Promise<void>((resolve) => { release = resolve; });
      let created!: () => void;
      const createdGate = new Promise<void>((resolve) => { created = resolve; });
      await page.route(`**/api/market/${DEMO_ID}/imports`, async (route) => {
        if (route.request().method() !== 'POST') { await route.fallback(); return; }
        const body = route.request().postDataJSON();
        worker.state.csvImports.push({ import_id: importId, account_id: DEMO_ID, symbol: body.symbol,
          timeframe: body.timeframe, filename: body.filename, status: 'staging', size_bytes: body.size,
          received_bytes: 0, next_chunk: 0, bars: null, first_t: null, last_t: null, gaps: null,
          offset_sec: 0, created_at: MON, committed_at: null, text: '' });
        created();
        await responseGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ import_id: importId, chunk_bytes: 4194304 }) });
      });
      await importFile(page, csv([MON, MON + 60]));
      await createdGate;
      if (action === 'cancel') await page.getByRole('button', { name: msg('csv.cancel'), exact: true }).click();
      // SPA-Wechsel kann auch von außerhalb des Modals kommen; das Modal überdeckt den Nav-Link.
      else {
        await page.getByRole('link', { name: msg('nav.dashboard'), exact: true }).evaluate((link: HTMLAnchorElement) => link.click());
        await expect(page).toHaveURL('/');
      }
      release();
      await expect.poll(() => worker.state.csvImports).toEqual([]);
      expect(worker.callsTo('PUT', /\/imports\/[0-9a-f]+\/chunk$/)).toHaveLength(0);
      expect(worker.callsTo('POST', /\/imports\/[0-9a-f]+\/commit$/)).toHaveLength(0);
    });
  }

  test('Import wird in Teilen hochgeladen, geprüft und erscheint in der Liste', { tag: '@BKT-05' }, async ({ page, worker }) => {
    await openDialog(page);
    await expect(page.getByTestId('csv-submit')).toBeDisabled(); // ohne Datei

    await importFile(page, csv([MON, MON + 60, MON + 120]));

    await expect(page.getByTestId('csv-import-dialog')).toBeHidden();
    const item = page.getByTestId('csv-item');
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute('data-status', 'committed');
    await expect(item).toContainText('XAUUSD · M1');
    await expect(item).toContainText(msg('csv.item.range', { from: '', to: '', bars: '3' }).split(' · ')[1]);
    expect(worker.callsTo('POST', `/api/market/${DEMO_ID}/imports`)[0].body).toMatchObject({
      symbol: 'XAUUSD', timeframe: 'M1', time_offset_sec: 0,
    });
    expect(worker.callsTo('PUT', new RegExp(`/imports/[0-9a-f]+/chunk$`)).length).toBe(1);
    expect(worker.state.csvImports.map((i) => i.status)).toEqual(['committed']);
  });

  for (const [season, rows, expected] of [
    ['Frühjahrswechsel', [[1743296340, 7200], [1743296400, 10800]], [1743303540, 1743307200]],
    ['Herbstwechsel', [[1761343140, 10800], [1761516000, 7200]], [1761353940, 1761523200]],
  ] as const) {
    test(`${season}: UTC-Zeilenoffsets werden in Brokerzeit umgerechnet und bleiben sichtbar`, { tag: '@BKT-05' }, async ({ page, worker }) => {
      await openDialog(page);
      await page.getByTestId('csv-offset-mode').selectOption('row');
      await expect(page.getByTestId('csv-offset')).toBeDisabled();
      await expect(page.getByTestId('csv-timezone-notice')).toBeVisible();
      await importFile(page, rowOffsetCsv(rows));

      await expect(page.getByTestId('csv-import-dialog')).toBeHidden();
      expect(worker.callsTo('POST', `/api/market/${DEMO_ID}/imports`)[0].body).toMatchObject({
        time_offset_sec: 0, time_offset_mode: 'row',
      });
      expect(worker.state.csvImports[0]).toMatchObject({ offset_mode: 'row', first_t: expected[0], last_t: expected[1] });
      await expect(page.getByTestId('csv-item')).toContainText(msg('csv.item.range', {
        from: fmt().mt5DateTime(expected[0]),
        to: fmt().mt5DateTime(expected[1]),
        bars: fmt().number(rows.length),
      }));
      await expect(page.getByTestId('csv-row-offset')).toContainText(msg('csv.item.rowOffset'));
      await page.reload();
      await expect(page.getByTestId('csv-row-offset')).toContainText(msg('csv.item.rowOffset'));
    });
  }

  test('Worker ohne Modusbestätigung wird vor dem ersten Teil bereinigt', { tag: '@BKT-05' }, async ({ page, worker }) => {
    await openDialog(page);
    await page.getByTestId('csv-offset-mode').selectOption('row');
    const importId = 'f'.repeat(32);
    await page.route(`**/api/market/${DEMO_ID}/imports`, async (route) => {
      if (route.request().method() !== 'POST') { await route.fallback(); return; }
      const body = route.request().postDataJSON();
      worker.state.csvImports.push({ import_id: importId, account_id: DEMO_ID, symbol: body.symbol,
        timeframe: body.timeframe, filename: body.filename, status: 'staging', size_bytes: body.size,
        received_bytes: 0, next_chunk: 0, bars: null, first_t: null, last_t: null, gaps: null,
        offset_sec: 0, offset_mode: 'row', created_at: MON, committed_at: null, text: '' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ import_id: importId, chunk_bytes: 4194304 }) });
    });
    await importFile(page, rowOffsetCsv([[1743296340, 7200], [1743296400, 10800]]));

    await expect(page.getByText(msg('csv.offset.unsupported'), { exact: true })).toBeVisible();
    await expect.poll(() => worker.state.csvImports).toEqual([]);
    expect(worker.callsTo('PUT', /\/imports\/[0-9a-f]+\/chunk$/)).toHaveLength(0);
    expect(worker.callsTo('POST', /\/imports\/[0-9a-f]+\/commit$/)).toHaveLength(0);
    expect(worker.callsTo('DELETE', new RegExp(`/imports/${importId}$`))).toHaveLength(1);
  });

  test('Fehlerhafte Datei: Zeilenfehler sichtbar, nichts wird wählbar', { tag: '@BKT-05' }, async ({ page, worker }) => {
    await openDialog(page);
    await importFile(page, 'time,open,high,low,close\nBAD\n');

    const errors = page.getByTestId('csv-errors');
    await expect(errors).toContainText(msg('csv.errors.line', { line: 2, message: 'high/low do not contain open and close' }));
    await expect(page.getByTestId('csv-import-dialog')).toBeVisible();
    expect(worker.state.csvImports).toEqual([]);
    await page.getByRole('button', { name: msg('csv.cancel') }).click();
    await expect(page.getByTestId('csv-item')).toHaveCount(0);
    await expect(page.getByText(msg('csv.empty'))).toBeVisible();
  });

  test('Überlappung geht nur mit „Ersetzen“', { tag: '@BKT-05' }, async ({ page, worker }) => {
    await openDialog(page);
    await importFile(page, csv([MON, MON + 60, MON + 120]));
    await expect(page.getByTestId('csv-item')).toHaveCount(1);
    const first = worker.state.csvImports[0].import_id;

    await page.getByTestId('csv-open').click();
    await importFile(page, csv([MON + 60, MON + 120, MON + 180]));
    await expect(page.getByRole('alert').filter({ hasText: msg('csv.overlap.title') })).toBeVisible();
    expect(worker.state.csvImports.map((i) => [i.import_id === first, i.status])).toEqual([[true, 'committed'], [false, 'staging']]);

    // Abbrechen löscht den wartenden Import, der alte bleibt
    await page.getByRole('button', { name: msg('csv.cancel') }).click();
    await expect(page.getByTestId('csv-item')).toHaveCount(1);
    expect(worker.state.csvImports.map((i) => i.import_id)).toEqual([first]);

    await page.getByTestId('csv-open').click();
    await importFile(page, csv([MON + 60, MON + 120, MON + 180]));
    await page.getByTestId('csv-replace').click();
    await expect(page.getByTestId('csv-import-dialog')).toBeHidden();
    await expect(page.getByTestId('csv-item')).toHaveCount(1);
    expect(worker.state.csvImports.map((i) => [i.import_id === first, i.status])).toEqual([[false, 'committed']]);
  });

  test('Unfertiger Import ist markiert und nur löschbar', { tag: '@BKT-05' }, async ({ page, worker }) => {
    worker.state.csvImports.push({
      import_id: 'a'.repeat(32), account_id: DEMO_ID, symbol: 'EURUSD', timeframe: 'M5', filename: 'alt.csv',
      status: 'staging', size_bytes: 100, received_bytes: 10, next_chunk: 1, bars: null, first_t: null, last_t: null,
      gaps: null, offset_sec: 0, created_at: MON, committed_at: null, text: '',
    });
    await page.goto(URL);
    const item = page.getByTestId('csv-item');
    await expect(item).toHaveAttribute('data-status', 'staging');
    await expect(item).toContainText(msg('csv.item.unfinished'));
    await item.getByTestId('csv-delete').click();
    await expect(item).toHaveCount(0);
    expect(worker.state.csvImports).toEqual([]);
  });

  test('Jedes Bedienelement im Panel und Dialog hat einen Hinweis', { tag: '@BKT-05' }, async ({ page, worker }) => {
    void worker;
    await openDialog(page);
    const unhinted = await page.evaluate(() => {
      const controls = 'button, a[href], input, select, textarea, [role="switch"], [role="tab"]';
      return [...document.querySelectorAll(controls)]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .filter(
          (el) =>
            !(
              el.closest('[data-tooltip-trigger], [data-tooltip-exempt]') ||
              el.closest('label')?.querySelector('[data-tooltip-trigger]') ||
              el.closest('[data-tooltip-scope]')?.querySelector('[data-tooltip-trigger]')
            ),
        )
        .map((el) => el.outerHTML.slice(0, 120));
    });
    expect(unhinted).toEqual([]);
  });
});
