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
/** Ergebnis der Suche (1117-C1.2 A): ein Abzeichen in der Formationsreihe statt einer Meldung über den Bedienelementen */
const found = (page: Page) => page.getByTestId('formation-found');
/** Hinweis der Formationsreihe ohne Kandidaten (1117-C1.1 A): data-state searching | none | off */
const formsNote = (page: Page) => page.getByTestId('formation-forms-empty');
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
    // Vor der Antwort wurde nichts gesucht: kein „keine Formation“ (1117-C1.1)
    await expect(formsNote(page)).toHaveCount(0);

    await page.getByTestId('formation-ask-yes').click();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(ask).toHaveCount(0);
    expect(new Set(scanTfs(worker))).toEqual(new Set(['D1', 'H4', 'H1', 'M15']));
    // Das Ergebnis steht als Abzeichen in der Formationsreihe; keine Meldung unten, die Bedienelemente verdeckt (1117-C1.2)
    await expect(found(page)).toBeVisible();
    await expect(found(page)).toContainText('H4');
    await expect(page.getByRole('status').filter({ hasText: 'EURUSD' })).toHaveCount(0);
    // Nach 8 s geht das Abzeichen weg; die stille Neusuche zeigt es nicht noch einmal
    await expect(found(page)).toHaveCount(0, { timeout: 12_000 });
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-runs', /^[1-9]/);
    await expect(found(page)).toHaveCount(0);
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
    // Nicht gesucht heißt nicht „keine Formation“ (1117-C1.1)
    await expect(formsNote(page)).toHaveAttribute('data-state', 'off');
    await expect(formsNote(page)).toHaveText(msg('chart.formation.notSearched'));

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
    await expect(found(page)).toBeVisible();
  });

  test('Während der Suche steht „Formasyonlar aranıyor…“, nie „keine Formation“; danach die Knöpfe', { tag: '@FRM-48' }, async ({ page, worker }) => {
    void worker;
    // Die Suchanfrage M15 wird gehalten: die Suche läuft sichtbar lange
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    await page.route(/\/api\/market\/[^/]+\/rates\?.*timeframe=M15/, async (route) => { await gate; await route.fallback(); });
    // Jeder Text des Hinweises wird mitgeschrieben, auch wenn er nur ein Bild lang steht
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __notes: string[] }).__notes = seen;
      new MutationObserver(() => {
        const el = document.querySelector('[data-testid="formation-forms-empty"]');
        const text = el ? `${el.getAttribute('data-state')}:${el.textContent}` : '';
        if (text && seen.at(-1) !== text) seen.push(text);
      }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    await page.goto(URL);
    await page.getByTestId('formation-ask-yes').click();
    await expect(formsNote(page)).toHaveAttribute('data-state', 'searching');
    await expect(formsNote(page)).toHaveText(msg('chart.formation.searching'));
    release();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(page.locator('[data-testid^="formation-form-"]').first()).toBeVisible();
    const notes = await page.evaluate(() => (window as unknown as { __notes: string[] }).__notes);
    expect(notes.filter((n) => n.includes(msg('chart.formation.noneTf')))).toEqual([]);
  });

  test('Telefon bleibt vorerst wie vorher: Ergebnis als Meldung unten mit „Göster“, kein Abzeichen, alter Hinweis', { tag: '@FRM-48' }, async ({ page, worker }) => {
    void worker;
    // Halil 2026-11-17: „telefonlar icin UI tarafini simdi yapmayalim“ – 1117-C1.1/C1.2 gelten nur ab 30 rem Kopfbreite
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(URL);
    await page.getByTestId('formation-ask-yes').click();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    const done = page.getByRole('status').filter({ hasText: msg('formation.ask.done', { symbol: 'EURUSD' }) });
    await expect(done).toHaveCount(1);
    await expect(done.getByRole('button', { name: msg('formation.ask.show') })).toBeVisible();
    await expect(found(page)).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
  });
  test('Adreste bilinen formasyon (form=): soru yok, grafikten sonra arka planda aranır, bitişte rozet gelir', { tag: '@FRM-48' }, async ({ page, worker }) => {
    await page.goto(`${URL}&form=ABCD`);
    await expect(page.getByTestId('formation-ask')).toHaveCount(0);
    await expect(page.getByTestId('analysis-chart')).toBeVisible();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    expect(new Set(scanTfs(worker))).toEqual(new Set(['D1', 'H4', 'H1', 'M15']));
    await expect(found(page)).toBeVisible();
    await expect(page.getByTestId('formation-form-ABCD')).toBeVisible();
    expect(new globalThis.URL(page.url()).searchParams.get('form')).toBe('ABCD');
  });

  test('form= ohne Wert oder unbekannt: die Frage kommt wie sonst, keine Suche', { tag: '@FRM-48' }, async ({ page, worker }) => {
    await page.goto(`${URL}&form=NOPE`);
    await expect(page.getByTestId('formation-ask')).toBeVisible();
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', '');
    expect([...new Set(scanTfs(worker))]).toEqual(['H4']);
  });

  test('Ohne form= fragt die Seite wie bisher; nach „Hayır“ startet ein später in die Adresse geschriebenes form= keine Suche', { tag: '@FRM-48' }, async ({ page, worker }) => {
    await page.goto(URL);
    await expect(page.getByTestId('formation-ask')).toBeVisible();
    await page.getByTestId('formation-ask-no').click();
    await page.evaluate(() => { history.pushState(null, '', `${location.pathname}${location.search}&form=ABCD`); });
    await expect(page.getByTestId('formation-ask-search')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', '');
    expect([...new Set(scanTfs(worker))]).toEqual(['H4']);
  });

  test('Link-Freigabe gilt nur für das Symbol beim Öffnen: ein anderes Symbol fragt neu', { tag: '@FRM-48' }, async ({ page, worker }) => {
    void worker;
    await page.goto(`${URL}&form=ABCD`);
    await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await page.evaluate(() => { history.pushState(null, '', `/chart${location.search.replace('EURUSD', 'XAUUSD')}`); });
    await expect(page.getByTestId('formation-ask')).toContainText(msg('formation.ask.question', { symbol: 'XAUUSD' }));
  });
});
