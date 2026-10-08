/**
 * BKT-05 CSV-Import (B9): Dialog auf der Seite /backtest gegen den Mock-Worker.
 * Zeiten: erste CSV-Spalte = Epoche in Sekunden (MON = 28.09.2026 00:00).
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const MON = 1790553600;
const URL = `/backtest?account=${DEMO_ID}&zone=${ZONE_ID}`;
const csv = (times: number[]) => 'time,open,high,low,close\n' + times.map((t) => `${t},1,2,0.5,1.5`).join('\n') + '\n';
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
