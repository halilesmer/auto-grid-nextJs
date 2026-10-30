/**
 * Seite /formasyon: Suche über alle Formationen und Zeiteinheiten, Zeiteinheit- und Formationsleiste mit Treffer-Badges,
 * Kandidaten-Liste, Checkliste und Chart-Overlay. Die Kerzen sind echte H4-Kerzen (e2e/fixtures/formation/gar-buy-h4-01.json),
 * die der Mock-Worker fest ausliefert; die Reihe endet am 2025-11-17 12:00 (Brokerzeit).
 * FRM-18 Leisten und Badges · FRM-19 Liste und Checkliste · FRM-20 Chart-Overlay · FRM-21 Hintergrundsuche · FRM-22 schmale Ansicht
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg, type MessageKey } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const URL = `/formasyon?account=${DEMO_ID}&zone=${ZONE_ID}`;
const NOW = Date.UTC(2025, 10, 17, 12) / 1000;

const fixtureBars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))).bars;
/** Kerzen der Fixture, die zum Zeitpunkt `now` geschlossen sind */
const rowsUntil = (now: number) => fixtureBars.filter((b) => b.time + 14400 <= now).map((b) => [b.time, b.open, b.high, b.low, b.close]);
/** Mit diesem Zeitpunkt steht in der Fixture ein ABCD im Aufbau: C ist da, das Ziel von D noch nicht erreicht */
const FORMING_NOW = 1761192000;

/** H4 aus der Fixture, M15 mit einer Kerze (legt den Suchzeitpunkt fest), die übrigen Zeiteinheiten leer */
function serveFixture(worker: MockWorker, now: number) {
  // Symbol der Zone = Symbol der Fixture, sonst passt die Pip-Größe (GAR-03) nicht zu den Kerzen
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  const rows = rowsUntil(now);
  const last = rows[rows.length - 1];
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[now - 900, last[4], last[4], last[4], last[4]]] };
}

async function openPage(page: Page, worker: MockWorker, url = URL, now = NOW) {
  serveFixture(worker, now);
  await page.goto(url);
  await expect(page.getByTestId('formation-toolbar')).toBeVisible();
  // Die Suche ist fertig, wenn ihre Rechenzeit am Seitenelement steht
  await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
}

test('Chart-Werkzeuge bleiben nach Formationswechsel ohne veraltete Chart-Zugriffe bedienbar', { tag: ['@ANA-17', '@FRM-20'] }, async ({ page, worker }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openPage(page, worker, `${URL}&form=GAR`);
  for (const form of ['BAT', 'ABCD', 'GAR']) {
    await page.getByTestId(`formation-form-${form}`).click();
    // ABCD is the default and is therefore omitted from the URL.
    await expect(page.getByTestId(`formation-form-${form}`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('workspace-settings').click();
    await expect(page.getByTestId('chart-workspace-settings')).toBeVisible();
    await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test.describe('FRM-18 Zeiteinheit- und Formationsleiste', () => {
  test('Badges zählen gültige und im Aufbau stehende Treffer, ungültige zählen nicht', { tag: '@FRM-18' }, async ({ page, worker }) => {
    await openPage(page, worker);
    // Die Fixture liefert auf H4 eine gültige Gartley und eine Bat im Aufbau
    await expect(page.getByTestId('formation-form-GAR').getByTestId('hit-badge')).toHaveText('1');
    await expect(page.getByTestId('formation-form-BAT').getByTestId('hit-badge')).toHaveText('1');
    await expect(page.getByTestId('formation-tf-H4').getByTestId('hit-badge')).toBeVisible();
    await expect(page.getByTestId('formation-tf-M15').getByTestId('hit-badge')).toHaveCount(0);
  });

  test('Klick auf eine Formation springt zur Zeiteinheit ihres Treffers', { tag: '@FRM-18' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&tf=M15`);
    await page.getByTestId('formation-form-GAR').click();
    await expect(page).toHaveURL(/form=GAR/);
    await expect(page.getByTestId('formation-tf-H4')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Ohne Treffer steht der Leerzustand statt einer Checkliste', { tag: '@FRM-18' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&tf=M15`);
    await expect(page.getByTestId('formation-empty')).toContainText(msg('formation.empty.chart', { form: 'ABCD', tf: 'M15' }));
    await expect(page.getByTestId('formation-checklist')).toHaveCount(0);
    await expect(page.getByTestId('candidate-empty')).toBeVisible();
  });
});

test.describe('FRM-19 Kandidaten-Liste und Checkliste', () => {
  test('Liste zeigt Urteil, Checkliste Pflicht/Verstärkung/Ausschluss mit Zählern und Zuständen', { tag: '@FRM-19' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const item = page.getByTestId('candidate-item');
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId('verdict-pill')).toHaveAttribute('data-verdict', 'valid');

    const list = page.getByTestId('formation-checklist');
    await expect(list.getByTestId('group-required')).toBeVisible();
    await expect(list.getByTestId('group-bonus')).toBeVisible();
    await expect(list.getByTestId('group-exclusion')).toBeVisible();
    await expect(list.getByTestId('score-required')).toContainText(/\d+\/\d+/);
    // Zustand nie nur als Farbe: jede Zeile trägt ein Symbol mit Beschriftung
    const rows = list.getByTestId('check-row');
    expect(await rows.count()).toBeGreaterThan(10);
    // Ausschluss: ✓ heißt „nicht ausgelöst“; der Hinweis steht am Gruppenkopf und in der Legende
    await expect(list.getByTestId('exclusion-note')).toHaveText(msg('formation.group.exclusion.note'));
    await expect(list).toContainText(msg('formation.legend.clear'));
    for (const state of ['met', 'unmet', 'clear']) {
      await expect(rows.and(page.locator(`[data-state="${state}"]`)).first().getByRole('img')).toHaveAttribute('aria-label', msg(`formation.state.${state}` as MessageKey));
    }
    // Marke „Annahme“ steht an Zeilen mit Status assumption
    await expect(list.getByTestId('check-row').getByText(msg('formation.mark.assumption'), { exact: true }).first()).toBeVisible();
  });

  test('Bat im Aufbau trägt das Urteil der Bibliothek, D ist bereits erreicht', { tag: '@FRM-19' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=BAT`);
    await expect(page.getByTestId('candidate-item').getByTestId('verdict-pill')).toHaveAttribute('data-verdict', 'forming');
    await expect(page.getByTestId('formation-chart')).toHaveAttribute('data-final-point', 'done');
  });

  test('Nicht messbare Bedingung: gestricheltes Symbol mit Beschriftung', { tag: '@FRM-19' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=ABCD`);
    const row = page.locator('[data-testid="check-row"][data-rule-id="ABCD-16"]');
    await expect(row).toHaveAttribute('data-state', 'unmeasurable');
    await expect(row.getByRole('img')).toHaveAttribute('aria-label', msg('formation.state.unmeasurable'));
  });
});

test.describe('FRM-20 Chart-Overlay und Hover', () => {
  test('ABCD im Aufbau: gestrichelter Weg, offener Kreis mit „?“, mögliche Zone, keine Umkehrkerzen-Marke', { tag: '@FRM-20' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=ABCD`, FORMING_NOW);
    await expect(page.getByTestId('candidate-item').getByTestId('verdict-pill')).toHaveAttribute('data-verdict', 'forming');
    const overlay = page.getByTestId('formation-overlay');
    await expect(overlay.locator('line[stroke-dasharray="6 5"]')).toHaveCount(1);
    await expect(overlay.locator('circle[fill="none"]')).toHaveCount(1);
    await expect(overlay.locator('text', { hasText: 'D?' })).toHaveCount(1);
    await expect(overlay.locator('text', { hasText: msg('formation.draw.zonePossible', { tf: 'H4', up: 'D1' }) })).toHaveCount(1);
    await expect(overlay.locator('[data-drawing] rect[rx="3"]')).toHaveCount(0);
  });

  test('Zeichnungen liegen über dem Chart, Hover auf eine Zeile hebt ihre Zeichnungen hervor', { tag: '@FRM-20' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const overlay = page.getByTestId('formation-overlay');
    await expect(overlay.locator('[data-drawing]').first()).toBeAttached();
    expect(await overlay.locator('[data-drawing]').count()).toBeGreaterThan(2);

    const row = page.locator('[data-testid="check-row"][data-rule-id="GAR-03"]');
    await row.hover();
    await expect(overlay.locator('[data-active="true"]').first()).toBeAttached();
    await expect(overlay.locator('[data-active="false"]').first()).toBeAttached();
    await page.mouse.move(0, 0);
    await expect(overlay.locator('[data-active="true"]')).toHaveCount(0);
  });

  test('Das Overlay endet vor der Preisachse', { tag: '@FRM-20' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const box = await page.getByTestId('formation-chart').boundingBox();
    const svg = await page.getByTestId('formation-overlay').boundingBox();
    expect(svg!.width).toBeGreaterThan(100);
    expect(svg!.width).toBeLessThan(box!.width - 20);
  });
});

test.describe('FRM-21 Hintergrundsuche', () => {
  test('Die Suche lädt alle vier Zeiteinheiten des Setup-Symbols', { tag: '@FRM-21' }, async ({ page, worker }) => {
    await openPage(page, worker);
    const calls = worker.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/rates'));
    for (const tf of ['D1', 'H4', 'H1', 'M15']) {
      expect(calls.some((c) => c.query.get('timeframe') === tf && c.query.get('symbol') === 'EURUSD')).toBe(true);
    }
  });
});

test.describe('FRM-22 schmale Ansicht', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Bei 375 px liegen die Bedingungen im Chart und lassen sich einklappen', { tag: '@FRM-22' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const chart = await page.getByTestId('formation-chart').boundingBox();
    const details = page.getByTestId('formation-details');
    const panel = await details.boundingBox();
    expect(chart!.x).toBe(0);
    expect(chart!.y).toBe(0);
    expect(chart!.height).toBe(812);
    expect(panel!.x).toBeGreaterThan(chart!.x);
    expect(panel!.y + panel!.height).toBeLessThan(chart!.height * 0.83);
    const toggle = page.getByTestId('formation-details-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('formation-checklist')).toBeHidden();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('formation-checklist')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('formation-mobile-dark.png') });
  });
});

test.describe('FRM-23 seitenfüllender Arbeitsbereich', () => {
  test.use({ viewport: { width: 1440, height: 900 }, appLocale: 'de' });
  for (const theme of ['dark', 'light']) {
    test(`Chart und Bedienelemente bleiben innerhalb der Seite (${theme})`, { tag: '@FRM-23' }, async ({ page, worker }) => {
      await page.addInitScript((value) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
      await openPage(page, worker, `${URL}&form=GAR`);
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      const chart = await page.getByTestId('formation-chart').boundingBox();
      expect(chart).toEqual({ x: 0, y: 56, width: 1440, height: 844 });
      expect(await page.getByTestId('app-nav').boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 56 });
      for (const id of ['formation-selectors', 'formation-toolbar', 'formation-details', 'formation-legend']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(56);
        expect(box!.x + box!.width).toBeLessThanOrEqual(chart!.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      }
      const toolbar = await page.getByTestId('formation-toolbar').boundingBox();
      const pointA = await page.getByTestId('formation-overlay').getByText('A', { exact: true }).boundingBox();
      expect(pointA!.y).toBeGreaterThan(toolbar!.y + toolbar!.height);
      // Die Checkliste scrollt unabhängig, das Chart-Canvas bleibt dabei an derselben Stelle.
      await page.getByTestId('group-exclusion').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('group-exclusion')).toBeInViewport();
      expect(await page.getByTestId('formation-chart').boundingBox()).toEqual(chart);
      await page.locator('#formation-details-content').evaluate((el) => { el.scrollTop = 0; });
      await page.screenshot({ path: test.info().outputPath(`formation-desktop-${theme}.png`) });
      const line = page.getByTestId('formation-overlay').locator('line').first();
      const xBefore = await line.getAttribute('x1');
      // Links vor dem ersten Formationspunkt liegt freie Chart-Fläche ohne interaktive SVG-Linien.
      await page.mouse.move(200, 450);
      await page.mouse.wheel(0, -250);
      await expect.poll(() => line.getAttribute('x1')).not.toBe(xBefore);
      if (theme === 'light') {
        await page.setViewportSize({ width: 375, height: 812 });
        await expect(page.getByTestId('formation-details')).toBeInViewport();
        await page.screenshot({ path: test.info().outputPath('formation-mobile-light.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      // Desktoplinks sind direkt in der Kopfzeile erreichbar.
      await expect(page.getByTestId('nav-menu')).toBeHidden();
      await page.getByTestId('app-nav').getByRole('link', { name: msg('nav.analysis', {}, 'de'), exact: true }).click();
      await expect(page).toHaveURL(/\/chart/);
      await expect(page.getByTestId('formation-page')).toHaveCount(0);
    });
  }
});


test.describe('FRM-24 bewegliche Bedingungen', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('Kopfgriff verschiebt die Karte; Grenzen, Tastatur, Aufklappen und Resize halten sie erreichbar', { tag: '@FRM-24' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const panel = page.getByTestId('formation-details');
    const handle = page.getByTestId('formation-details-drag');
    const before = await panel.boundingBox();
    const dragTo = async (x: number, y: number) => {
      const grip = await handle.boundingBox();
      await page.mouse.move(grip!.x + 20, grip!.y + grip!.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, y, { steps: 12 });
      await page.mouse.up();
    };
    await expect(handle).toBeVisible();
    await dragTo(before!.x - 350, before!.y + 70);
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(before!.x - 200);
    await expect(panel.getByTestId('formation-checklist')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('formation-details-dragged.png') });
    await dragTo(-1000, -1000);
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThanOrEqual(7);
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThanOrEqual(127);
    const left = (await panel.boundingBox())!.x;
    await handle.focus();
    await handle.press('ArrowRight');
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeCloseTo(left + 10, 0);
    const top = (await panel.boundingBox())!.y;
    await handle.press('Shift+ArrowDown');
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(top + 50, 0);
    await page.getByTestId('group-exclusion').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('group-exclusion')).toBeInViewport();
    await dragTo(2400, 1600);
    await page.getByTestId('formation-details-toggle').click();
    await dragTo(2400, 1600);
    await page.getByTestId('formation-details-toggle').click();
    await expect.poll(async () => { const box = (await panel.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(837);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(async () => { const box = (await panel.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(312);
    await expect.poll(async () => { const box = (await panel.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(749);
    await expect(handle).toBeInViewport();
  });

  test('Touch zieht nur am Kopfgriff, der Inhalt bleibt separat scrollbar', { tag: '@FRM-24' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, `${URL}&form=GAR`);
    const panel = page.getByTestId('formation-details');
    const grip = await page.getByTestId('formation-details-drag').boundingBox();
    expect(grip).not.toBeNull();
    const before = (await panel.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const x = grip!.x + 35;
    const y = grip!.y + grip!.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 30 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 110 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeLessThan(before.y - 70);
    const position = (await panel.boundingBox())!.y;
    await page.getByTestId('group-exclusion').scrollIntoViewIfNeeded();
    expect((await panel.boundingBox())!.y).toBeCloseTo(position, 0);
  });
});
