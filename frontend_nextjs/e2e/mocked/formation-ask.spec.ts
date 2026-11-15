/**
 * Frage „Formasyonlar aransın mı?“ (Plan 1114-A1): der Chart kommt zuerst, die Suche läuft erst nach „Evet“ im Hintergrund.
 * FRM-48 Formationssuche auf Nachfrage
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test, type MockWorker } from '../fixtures/test';

test.use({ formationAsk: 'manual' });
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H4`;
const ratesOf = (worker: MockWorker) => worker.calls.filter((c) => c.path === `/api/market/${DEMO_ID}/rates`);
const scanTfs = (worker: MockWorker) => ratesOf(worker).map((c) => c.query.get('timeframe'));
const doneToast = (page: Page) => page.getByRole('status').filter({ hasText: msg('formation.ask.show') });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('FRM-48 Formationssuche auf Nachfrage', () => {
  test('Der Chart kommt vor der Frage, vor „Evet“ geht keine Suchanfrage los; „Evet“ sucht im Hintergrund und meldet einmal', { tag: '@FRM-48' }, async ({ page, worker }) => {
    await page.goto(URL);
    const ask = page.getByTestId('formation-ask');
    await expect(ask).toBeVisible();
    await expect(ask).toContainText(msg('formation.ask.question', { symbol: 'EURUSD' }));
    await expect(page.getByTestId('analysis-chart')).toBeVisible();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', '');
    // Nur die Kerzen des Charts (H4) wurden geholt, keine Suchanfrage für D1/H1/M15
    expect([...new Set(scanTfs(worker))]).toEqual(['H4']);
    expect(await noOverflow(page)).toBe(true);

    await page.getByTestId('formation-ask-yes').click();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(ask).toHaveCount(0);
    const toasts = doneToast(page);
    await expect(toasts).toHaveCount(1);
    await expect(toasts.first()).toContainText(msg('formation.ask.done', { symbol: 'EURUSD' }));
    expect(new Set(scanTfs(worker))).toEqual(new Set(['D1', 'H4', 'H1', 'M15']));
    // Die Meldung kommt nicht noch einmal (stille Neusuche)
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-runs', /^[1-9]/);
    await expect(toasts).toHaveCount(1);

    // „Göster“ öffnet die Formationskarte
    await toasts.first().getByRole('button', { name: msg('formation.ask.show') }).click();
    await expect(page.getByTestId('conditions-off-tf')).toHaveCount(0);
    await expect(page.getByTestId('conditions-panel')).toBeVisible();
  });

  test('„Hayır“: keine Suche, im Kopf bleibt „Formasyon ara“, ein Klick sucht ohne neue Frage; ein anderes Symbol fragt neu', { tag: '@FRM-48' }, async ({ page, worker }) => {
    await page.goto(URL);
    await page.getByTestId('formation-ask-no').click();
    await expect(page.getByTestId('formation-ask')).toHaveCount(0);
    const search = page.getByTestId('formation-ask-search');
    await expect(search).toBeVisible();
    await expect(search).toContainText(msg('formation.ask.search'));
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', '');
    expect([...new Set(scanTfs(worker))]).toEqual(['H4']);

    await search.click();
    await expect(page.getByTestId('formation-ask')).toHaveCount(0);
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(search).toHaveCount(0);

    // Neues Symbol: die Antwort gilt nicht weiter
    await page.goto(`/chart?account=${DEMO_ID}&symbol=XAUUSD&tf=H4`);
    await expect(page.getByTestId('formation-ask')).toContainText(msg('formation.ask.question', { symbol: 'XAUUSD' }));
  });

  test('Favorit: keine Frage, die Suche startet nach den Kerzen von selbst und meldet', { tag: '@FRM-48' }, async ({ page, worker }) => {
    worker.state.favorites[DEMO_ID] = ['EURUSD'];
    await page.goto(URL);
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(page.getByTestId('formation-ask')).toHaveCount(0);
    await expect(doneToast(page)).toHaveCount(1);
  });
});
