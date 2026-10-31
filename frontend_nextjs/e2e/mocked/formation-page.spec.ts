/**
 * Seite /formasyon: Suche über alle Formationen und Zeiteinheiten, Zeiteinheit- und Formationsleiste mit Treffer-Badges,
 * Kandidaten-Liste, Checkliste und Chart-Overlay. Die Kerzen sind echte H4-Kerzen (e2e/fixtures/formation/gar-buy-h4-01.json),
 * die der Mock-Worker fest ausliefert; die Reihe endet am 2025-11-17 12:00 (Brokerzeit).
 * FRM-18 Leisten und Badges · FRM-19 Liste und Checkliste · FRM-20 Chart-Overlay · FRM-21 Hintergrundsuche · FRM-22 schmale Ansicht · FRM-25 freie Produktwahl · FRM-26 Bild der Formation · FRM-27 Formationsalarm · FRM-28 Favoriten-Fahne · FRM-29 Favoriten-Suche und Seitenleiste
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { msg, type MessageKey } from '../fixtures/i18n';
import { DEMO_ID, LIVE_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

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

test.describe('FRM-20 Ansicht des Formations-Charts', () => {
  const range = (page: Page) => page.getByTestId('formation-chart').getAttribute('data-visible-range');
  const allCandles = () => { const rows = rowsUntil(NOW); return `${rows[0][0]},${rows[rows.length - 1][0]}`; };
  /** Der Chart rundet eine wiederhergestellte Ansicht um höchstens eine Kerze (14400 s) */
  const sameView = async (page: Page, expected: string | null) => {
    const [from, to] = (await range(page) ?? '0,0').split(',').map(Number), [wantFrom, wantTo] = (expected ?? '0,0').split(',').map(Number);
    return Math.max(Math.abs(from - wantFrom), Math.abs(to - wantTo)) <= 14400;
  };
  const zoomIn = async (page: Page) => {
    // Die ersten 150 ms nach dem Aufbau gelten dem Wiederherstellen der Ansicht, nicht dem Nutzer
    await page.waitForTimeout(400);
    const box = (await page.getByTestId('formation-chart').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
  };

  test('Der Chart lädt mit allen Kerzen wie nach „Ansicht zurücksetzen“', { tag: ['@FRM-20', '@ANA-19'] }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    await expect.poll(() => range(page)).toBe(allCandles());
  });

  test('Ein Klick auf eine andere Formation ändert die Ansicht nicht, auch mit Zoom', { tag: ['@FRM-20', '@ANA-19'] }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    await expect.poll(() => range(page)).toBe(allCandles());
    await page.getByTestId('formation-form-BAT').click();
    await expect(page.getByTestId('formation-form-BAT')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => range(page)).toBe(allCandles());
    await zoomIn(page);
    await expect.poll(() => range(page)).not.toBe(allCandles());
    const zoomed = await range(page);
    await page.getByTestId('formation-form-GAR').click();
    await expect(page.getByTestId('formation-form-GAR')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(400);
    await expect.poll(() => sameView(page, zoomed)).toBe(true);
  });

  test('Der Zoom bleibt nach dem Neuladen, „Ansicht zurücksetzen“ zeigt wieder alle Kerzen', { tag: ['@FRM-20', '@ANA-19'] }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    await expect.poll(() => range(page)).toBe(allCandles());
    await zoomIn(page);
    await expect.poll(() => range(page)).not.toBe(allCandles());
    // Der Zoom wird entprellt gespeichert
    await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents ?? {}).some((d) => !!(d as { visibleTime?: unknown }).visibleTime))).toBe(true);
    const zoomed = await range(page);
    await page.reload();
    await expect(page.getByTestId('formation-toolbar')).toBeVisible();
    await expect.poll(() => sameView(page, zoomed)).toBe(true);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: msg('cw.fit'), exact: true }).click();
    await expect.poll(() => range(page)).toBe(allCandles());
    // Das Zurücksetzen wird entprellt gespeichert
    await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}').documents ?? {}).some((d) => !!(d as { visibleTime?: unknown }).visibleTime))).toBe(false);
    await page.reload();
    await expect(page.getByTestId('formation-toolbar')).toBeVisible();
    await expect.poll(() => range(page)).toBe(allCandles());
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

test.describe('FRM-25 freie Produktwahl', () => {
  const symbolInput = (page: Page) => page.getByTestId('formation-symbol').getByRole('combobox');
  const ratesFor = (worker: MockWorker, symbol: string) =>
    worker.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/rates') && c.query.get('symbol') === symbol).map((c) => c.query.get('timeframe'));

  async function pick(page: Page, search: string, option: string) {
    await symbolInput(page).fill(search);
    await page.getByRole('option', { name: new RegExp(option) }).click();
  }

  test('Jedes gewählte Produkt wird auf allen vier Zeiteinheiten neu gesucht', { tag: '@FRM-25' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await expect(symbolInput(page)).toHaveValue('EURUSD');
    await expect(page.getByTestId('zone-select')).toHaveCount(0);

    await pick(page, 'gold', 'XAUUSD');
    await expect(page).toHaveURL(/symbol=XAUUSD/);
    await expect(page).not.toHaveURL(/zone=/);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    expect(ratesFor(worker, 'XAUUSD').sort()).toEqual(expect.arrayContaining(['D1', 'H1', 'H4', 'M15']));

    await pick(page, 'crude', 'USOUSD');
    await expect(page).toHaveURL(/symbol=USOUSD/);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    expect(ratesFor(worker, 'USOUSD').sort()).toEqual(expect.arrayContaining(['D1', 'H1', 'H4', 'M15']));
  });

  test('Beim Tippen liegt kein Hinweis über der Produktliste', { tag: '@FRM-25' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await symbolInput(page).click();
    await symbolInput(page).fill('gold');
    await expect(page.getByRole('option', { name: /XAUUSD/ })).toBeVisible();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('Ein Konto ohne Setup kann ein Produkt wählen', { tag: '@FRM-25' }, async ({ page, worker }) => {
    serveFixture(worker, NOW);
    await page.goto(`/formasyon?account=${LIVE_ID}`);
    await expect(page.getByText(msg('formation.noSymbol.text'))).toBeVisible();
    await pick(page, 'euro', 'EURUSD');
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(page.getByText(msg('formation.noSymbol.text'))).toHaveCount(0);
  });

  test('Ein Kontowechsel löscht das gewählte Produkt', { tag: '@FRM-25' }, async ({ page, worker }) => {
    await openPage(page, worker, `/formasyon?account=${DEMO_ID}&symbol=XAUUSD`);
    await expect(symbolInput(page)).toHaveValue('XAUUSD');
    await page.getByRole('combobox', { name: msg('account.select.aria') }).click();
    await page.getByRole('option', { name: /LIVE/ }).click();
    await expect(page).toHaveURL(new RegExp(`account=${LIVE_ID}`));
    await expect(page).not.toHaveURL(/symbol=/);
    await expect(symbolInput(page)).toHaveValue('');
  });

  test('Text ohne Auswahl ändert das Produkt nicht', { tag: '@FRM-25' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await symbolInput(page).fill('gold');
    await symbolInput(page).blur();
    await expect(symbolInput(page)).toHaveValue('EURUSD');
    await expect(page).not.toHaveURL(/symbol=/);
  });

  test('Fokus und Verlassen starten bei Brokernamen in Kleinschreibung keine neue Suche', { tag: '@FRM-25' }, async ({ page, worker }) => {
    worker.state.symbols = worker.state.symbols.map((s) => (s.name === 'EURUSD' ? { ...s, name: 'EURUSDm' } : s));
    serveFixture(worker, NOW);
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSDm' })]) };
    await page.goto(`/formasyon?account=${DEMO_ID}`);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(symbolInput(page)).toHaveValue('EURUSDM');
    // Der Listeneintrag zeigt: Die Symbole sind geladen, das Verlassen des Feldes vergleicht wirklich
    await symbolInput(page).click();
    await expect(page.getByRole('option', { name: /EURUSDm/ })).toBeVisible();
    await symbolInput(page).blur();
    // Eine ungewollte Übernahme käme erst mit dem nächsten Render, deshalb kurz warten statt sofort zu prüfen
    await page.waitForTimeout(300);
    await expect(page).not.toHaveURL(/symbol=/);
  });

  test('Die Liste zeigt, wenn MT5 keine Produkte liefert', { tag: '@FRM-25' }, async ({ page, worker }) => {
    worker.state.symbolsError = 'MT5 nicht erreichbar';
    await openPage(page, worker);
    await expect(page.getByTestId('formation-symbols-error')).toContainText('MT5 nicht erreichbar');
  });
});

test.describe('FRM-22 schmale Ansicht', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Bei 375 px liegen die Bedingungen im Chart und lassen sich einklappen', { tag: '@FRM-22' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const chart = await page.getByTestId('formation-chart').boundingBox();
    const details = page.getByTestId('formation-details');
    const panel = await details.boundingBox();
    expect(chart!.x).toBe(52);
    const rail = await page.getByTestId('drawing-toolbar').boundingBox();
    expect(rail!.x).toBe(0);
    expect(rail!.width).toBe(52);
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
  test('Kopfleiste: durchgehend 38 px, Formationen direkt darunter, Werkzeuge rechts in der Leiste', { tag: '@FRM-23' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const bar = (await page.getByTestId('formation-topbar').boundingBox())!;
    expect(bar).toEqual({ x: 52, y: 56, width: 1348, height: 38 });
    const forms = (await page.getByTestId('formation-forms').boundingBox())!;
    expect(forms).toEqual({ x: 52, y: 94, width: 1348, height: 30 });
    const tools = (await page.getByTestId('workspace-toolbar').boundingBox())!;
    expect(tools.y).toBeGreaterThanOrEqual(56);
    expect(tools.y + tools.height).toBeLessThanOrEqual(94);
    expect(tools.x + tools.width).toBeLessThanOrEqual(1400);
    await expect(page.getByTestId('workspace-toolbar').getByRole('button', { name: msg('cw.indicators', {}, 'de') })).toBeVisible();
    const sizes = await page.getByTestId('formation-toolbar').evaluate((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const found = new Set<number>();
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        if (parent && walker.currentNode.textContent?.trim()) found.add(parseFloat(getComputedStyle(parent).fontSize));
      }
      return [...found];
    });
    expect(sizes.filter((size) => size > 12)).toEqual([]);
  });

  for (const theme of ['dark', 'light']) {
    test(`Chart und Bedienelemente bleiben innerhalb der Seite (${theme})`, { tag: '@FRM-23' }, async ({ page, worker }) => {
      await page.addInitScript((value) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
      await openPage(page, worker, `${URL}&form=GAR`);
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      const chart = await page.getByTestId('formation-chart').boundingBox();
      expect(chart).toEqual({ x: 52, y: 56, width: 1348, height: 844 });
      const rail = await page.getByTestId('drawing-toolbar').boundingBox();
      expect(rail).toEqual({ x: 0, y: 56, width: 52, height: 844 });
      expect(await page.getByTestId('app-nav').boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 56 });
      for (const id of ['formation-selectors', 'formation-toolbar', 'formation-details', 'formation-legend']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(chart!.x);
        expect(box!.y).toBeGreaterThanOrEqual(56);
        expect(box!.x + box!.width).toBeLessThanOrEqual(chart!.x + chart!.width);
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
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThanOrEqual(59);
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(56, 0);
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

  test('Kopfgriff-Karte: kein Text ist größer als 12 px', { tag: '@FRM-24' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    await expect(page.getByTestId('formation-checklist')).toBeVisible();
    const sizes = await page.getByTestId('formation-details').evaluate((card) => {
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      const found = new Set<number>();
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        if (parent && walker.currentNode.textContent?.trim()) found.add(parseFloat(getComputedStyle(parent).fontSize));
      }
      return [...found];
    });
    expect(sizes.filter((size) => size > 12)).toEqual([]);
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

test.describe('FRM-26 Formation als Bild festhalten', () => {
  test('PNG enthält Chart samt Formationszeichnungen, ohne Konto im Dateinamen', { tag: '@FRM-26' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    const saveImage = async () => {
      await page.getByTestId('formation-shot').click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('formation-shot-download').click()]);
      return { name: download.suggestedFilename(), base64: readFileSync((await download.path())!).toString('base64') };
    };
    // Pixel in den Farben der Zeichnungen (Ziel, Zone, Verhältnisse) unterhalb des Kopfes und oberhalb der Fußzeile.
    // takeScreenshot() allein enthält sie nicht: sie stammen aus dem SVG-Overlay.
    const drawingPixels = (b64: string) => page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const probe = document.createElement('canvas').getContext('2d')!;
      const tokens = ['--warning', '--info', '--secondary'].map((token) => {
        probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        probe.fillRect(0, 0, 1, 1);
        return Array.from(probe.getImageData(0, 0, 1, 1).data);
      });
      // Kopf (112 px) und Fußzeile (72 px) enthalten keine Zeichnungen: 56 und 36 CSS-Pixel bei doppelter Auflösung (shotImage.ts)
      const pixels = ctx.getImageData(0, 112, img.width, img.height - 112 - 72).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (tokens.some((c) => Math.abs(pixels[i] - c[0]) < 14 && Math.abs(pixels[i + 1] - c[1]) < 14 && Math.abs(pixels[i + 2] - c[2]) < 14)) count++;
      }
      return { width: img.width, height: img.height, count };
    }, b64);

    const withDrawings = await saveImage();
    expect(withDrawings.name).toMatch(/^formation-GAR-EURUSD-H4-\d{4}-\d{2}-\d{2}_\d{4}\.png$/);
    const full = await drawingPixels(withDrawings.base64);
    expect(full.width).toBe(2400);
    expect(full.height).toBeGreaterThan(1200);

    // Gleiche Seite ohne Overlay: der Unterschied sind die Zeichnungen
    await page.getByTestId('formation-overlay').evaluate((el) => { el.style.display = 'none'; });
    const bare = await drawingPixels((await saveImage()).base64);
    expect(full.count - bare.count).toBeGreaterThan(40);
  });

  test('Ohne Kandidat ist der Knopf deaktiviert', { tag: '@FRM-26' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&tf=M15`);
    await expect(page.getByTestId('formation-shot')).toBeDisabled();
  });

  test('Kopieren legt ein PNG in die Zwischenablage und meldet es', { tag: '@FRM-26' }, async ({ page, worker }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPage(page, worker, `${URL}&form=GAR`);
    await page.getByTestId('formation-shot').click();
    await page.getByTestId('formation-shot-copy').click();
    await expect(page.getByText(msg('formation.shot.copied'))).toBeVisible();
    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types));
    expect(types).toContain('image/png');
  });

  test('Bei 375 px bleibt der Knopf sichtbar, die Seite scrollt nicht quer', { tag: '@FRM-26' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, `${URL}&form=GAR`);
    const box = await page.getByTestId('formation-shot').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe('FRM-27 Formationsalarm', () => {
  const openAlarm = async (page: Page) => {
    await page.getByTestId('formation-alarm').click();
    await expect(page.getByTestId('formation-alarm-panel')).toBeVisible();
  };
  /** `only`: Formationen, die gemeldet werden; die übrigen werden abgewählt */
  const enable = async (page: Page, only: string[] = []) => {
    await openAlarm(page);
    await page.getByRole('switch', { name: msg('formation.alarm.enable', { symbol: 'EURUSD' }) }).click();
    for (const form of only.length > 0 ? ['ABCD', 'GAR', 'BAT', 'BUT', 'CRB', 'CYP', 'CDT'].filter((x) => !only.includes(x)) : []) {
      await page.getByTestId(`formation-alarm-form-${form}`).click();
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('formation-alarm')).toHaveAttribute('data-enabled', 'true');
  };
  const gartley = () => msg('formation.alarm.notice.both', { form: msg('formation.form.GAR'), side: msg('formation.side.buy'), symbol: 'EURUSD', tf: 'H4', point: 'D' });
  /** Neue Kerzen liefern und das 60-s-Nachladen der Seite auslösen */
  const advance = async (page: Page, worker: MockWorker, now: number) => {
    serveFixture(worker, now);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  };

  test('Das Menü sagt, dass der Alarm nur bei offener Seite läuft', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await openPage(page, worker, `${URL}&form=GAR`);
    await expect(page.getByTestId('formation-alarm')).toHaveAttribute('data-enabled', 'false');
    await openAlarm(page);
    await expect(page.getByTestId('formation-alarm-banner')).toHaveText(msg('formation.alarm.pageOnly'));
  });

  test('Eine Formation, die nach dem Einschalten gültig wird, wird einmal gemeldet, nicht nach dem Neuladen', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await page.clock.install();
    await openPage(page, worker, `${URL}&form=GAR`, FORMING_NOW);
    await enable(page, ['GAR']);
    // Einschalten merkt den Stand still: noch keine Meldung zu einer Formation
    await expect(page.getByText(gartley())).toHaveCount(0);

    await advance(page, worker, NOW);
    await expect(page.getByText(gartley())).toBeVisible();

    // Nächster Lauf mit demselben Stand: die Meldung steht nicht doppelt da
    await advance(page, worker, NOW);
    await expect(page.getByText(gartley())).toHaveCount(1);

    // Nach dem Neuladen gilt der Stand als bekannt
    serveFixture(worker, NOW);
    await page.reload();
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await expect(page.getByTestId('formation-alarm')).toHaveAttribute('data-enabled', 'true');
    await expect(page.getByText(gartley())).toHaveCount(0);
  });

  test('„Anzeigen“ in der Meldung wählt Formation, Zeiteinheit und Kandidat im Chart', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await page.clock.install();
    await openPage(page, worker, `${URL}&form=GAR`, FORMING_NOW);
    await enable(page, ['GAR']);
    // Auf eine andere Formation und Zeiteinheit wechseln, damit der Sprung sichtbar wird
    await page.getByTestId('formation-form-BAT').click();
    await page.getByTestId('formation-tf-H1').click();
    await advance(page, worker, NOW);
    await expect(page.getByText(gartley())).toBeVisible();

    await page.getByRole('button', { name: msg('formation.alarm.show'), exact: true }).click();
    await expect(page.getByTestId('formation-form-GAR')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('formation-tf-H4')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('candidate-item').first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('Die Sammelmeldung hat keinen Anzeigen-Knopf', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await page.clock.install();
    await openPage(page, worker, `${URL}&form=GAR`, FORMING_NOW);
    await enable(page);
    await advance(page, worker, NOW);
    await expect(page.getByText(msg('formation.alarm.notice.many', { symbol: 'EURUSD', count: 5 }))).toBeVisible();
    await expect(page.getByRole('button', { name: msg('formation.alarm.show'), exact: true })).toHaveCount(0);
  });

  test('Mehr als drei neue Treffer in einem Lauf kommen als eine Sammelmeldung', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await page.clock.install();
    await openPage(page, worker, `${URL}&form=GAR`, FORMING_NOW);
    await enable(page);
    await advance(page, worker, NOW);
    // Die Fixture liefert beim Übergang von FORMING_NOW zu NOW fünf neue gültige oder bis zum Zielpunkt gelaufene Treffer
    await expect(page.getByText(msg('formation.alarm.notice.many', { symbol: 'EURUSD', count: 5 }))).toBeVisible();
    await expect(page.getByText(gartley())).toHaveCount(0);
  });

  test('Ohne Alarm meldet die Seite nichts', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await page.clock.install();
    await openPage(page, worker, `${URL}&form=GAR`, FORMING_NOW);
    await advance(page, worker, NOW);
    await expect(page.getByText(gartley())).toHaveCount(0);
  });

  test('Bei 375 px bleibt die Glocke sichtbar, die Seite scrollt nicht quer', { tag: '@FRM-27' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, worker, `${URL}&form=GAR`);
    await openAlarm(page);
    for (const id of ['formation-alarm', 'formation-alarm-panel']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe('FRM-28 Favoriten-Fahne', () => {
  const symbolInput = (page: Page) => page.getByTestId('formation-symbol').getByRole('combobox');
  const addName = (symbol: string) => msg('formation.favorite.add', { symbol });
  const removeName = (symbol: string) => msg('formation.favorite.remove', { symbol });
  const putCalls = (worker: MockWorker) => worker.calls.filter((c) => c.method === 'PUT' && c.path === `/api/favorites/${DEMO_ID}`);

  test('Die Fahne in der Pille setzt und entfernt den Favoriten und bleibt nach dem Neuladen', { tag: '@FRM-28' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await page.getByRole('button', { name: addName('EURUSD') }).click();
    await expect(page.getByRole('button', { name: removeName('EURUSD') })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => worker.state.favorites[DEMO_ID]).toEqual(['EURUSD']);

    await page.reload();
    await expect(page.getByRole('button', { name: removeName('EURUSD') })).toBeVisible();

    await page.getByRole('button', { name: removeName('EURUSD') }).click();
    await expect(page.getByRole('button', { name: addName('EURUSD') })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => worker.state.favorites[DEMO_ID]).toEqual([]);
  });

  test('Die Fahne in der Produktsuche wählt das Produkt nicht und lässt die Liste offen', { tag: '@FRM-28' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await symbolInput(page).fill('gold');
    await page.getByRole('button', { name: addName('XAUUSD') }).click();
    await expect(page.getByRole('option', { name: /XAUUSD/ })).toBeVisible();
    await expect(page).not.toHaveURL(/symbol=/);
    await expect(symbolInput(page)).toHaveValue('gold');
    await expect.poll(() => worker.state.favorites[DEMO_ID]).toEqual(['XAUUSD']);
    await expect(page.getByRole('button', { name: removeName('XAUUSD') })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Tab erreicht die Fahne, Enter wählt das Produkt', { tag: '@FRM-28' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await symbolInput(page).fill('gold');
    await symbolInput(page).press('Tab');
    const flag = page.getByRole('button', { name: addName('XAUUSD') });
    await expect(flag).toBeFocused();
    await flag.press('Enter');
    await expect.poll(() => worker.state.favorites[DEMO_ID]).toEqual(['XAUUSD']);
    await expect(page).not.toHaveURL(/symbol=/);

    await symbolInput(page).focus();
    await symbolInput(page).press('ArrowDown');
    await symbolInput(page).press('Enter');
    await expect(page).toHaveURL(/symbol=XAUUSD/);
  });

  test('Ein Speicherfehler setzt die Fahne zurück und zeigt eine Meldung', { tag: '@FRM-28' }, async ({ page, worker }) => {
    await openPage(page, worker);
    worker.overrides.set(`PUT /api/favorites/${DEMO_ID}`, { status: 500, body: { detail: 'disk full' } });
    await page.getByRole('button', { name: addName('EURUSD') }).click();
    await expect(page.getByText('disk full')).toBeVisible();
    await expect(page.getByRole('button', { name: addName('EURUSD') })).toHaveAttribute('aria-pressed', 'false');
    expect(putCalls(worker)).toHaveLength(1);
  });

  test('Bei 375 px bleibt die Fahne sichtbar und die Seite scrollt nicht quer', { tag: '@FRM-28' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openPage(page, worker);
    await expect(page.getByRole('button', { name: addName('EURUSD') })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('FRM-29 Favoriten-Seitenleiste und Suche', () => {
  /** Die Mock-Kerzen gelten für jedes Produkt: jeder Favorit (hier 4-stellige Paare wie die Fixture) hat auf H4 eine gültige Gartley und eine Bat im Aufbau */
  async function openWithFavorites(page: Page, worker: MockWorker, favorites: string[], open = true) {
    worker.state.favorites[DEMO_ID] = favorites;
    await openPage(page, worker);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-favorites-scan-ms', /^\d+$/);
    if (open) await page.getByTestId('favorites-toggle').click();
  }
  const ratesCalls = (worker: MockWorker) => worker.callsTo('GET', /\/market\/.*\/rates$/).length;
  const rowSymbols = (page: Page) => page.getByTestId('favorites-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-symbol')));

  test('Nur gebildete Formationen stehen in der Formations-Zeile, die Zahl ist die Zahl der Produkte', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    // Gartley ist gültig, Bat nur im Aufbau, ABCD fehlt
    await expect(page.getByTestId('fav-form-GAR').getByTestId('hit-badge')).toHaveText('2');
    await expect(page.getByTestId('fav-form-BAT')).toHaveCount(0);
    await expect(page.getByTestId('fav-form-ABCD')).toHaveCount(0);
    await expect(page.getByTestId('fav-tf-H4').getByTestId('hit-badge')).toHaveText('2');
    await expect(page.getByTestId('fav-tf-D1').getByTestId('hit-badge')).toHaveCount(0);
  });

  test('Klick auf einen Zeitraum filtert ohne neue Anfragen', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    const before = ratesCalls(worker);
    await page.getByTestId('fav-tf-D1').click();
    await expect(page.getByTestId('favorites-forms-empty')).toHaveText(msg('formation.fav.noForms'));
    await expect(page).toHaveURL(/tf=D1/);
    await page.getByTestId('fav-tf-H4').click();
    await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
    expect(ratesCalls(worker)).toBe(before);
  });

  test('Die Zeilen stehen sichtbar nie doppelt: offen in der Seitenleiste, geschlossen über dem Chart', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await openWithFavorites(page, worker, ['EURUSD'], false);
    await expect(page.getByTestId('fav-form-GAR')).toHaveCount(1);
    await expect(page.getByTestId('favorites-panel')).toHaveCount(0);
    await expect(page.getByTestId('formation-form-GAR')).toHaveCount(0);
    await page.getByTestId('favorites-toggle').click();
    await expect(page.getByTestId('favorites-panel').getByTestId('fav-form-GAR')).toBeVisible();
    await expect(page.getByTestId('fav-form-GAR')).toHaveCount(1);
    await expect(page.getByTestId('formation-toolbar').getByTestId('fav-tf-H4')).toHaveCount(0);
    // Kamera und Glocke bleiben in der Kopfleiste
    await expect(page.getByTestId('formation-topbar').getByTestId('formation-shot')).toBeVisible();
  });

  test('Klick auf eine Formation filtert die Tabelle, ein zweiter Klick hebt den Filter auf', { tag: '@FRM-29' }, async ({ page, worker }) => {
    worker.state.ratesErrorSymbols = ['GBPUSD'];
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    expect(await rowSymbols(page)).toEqual(['EURUSD', 'GBPUSD']);
    await page.getByTestId('fav-form-GAR').click();
    await expect(page.getByTestId('fav-form-GAR')).toHaveAttribute('aria-pressed', 'true');
    expect(await rowSymbols(page)).toEqual(['EURUSD']);
    await page.getByTestId('fav-form-GAR').click();
    await expect(page.getByTestId('fav-form-GAR')).toHaveAttribute('aria-pressed', 'false');
    expect(await rowSymbols(page)).toEqual(['EURUSD', 'GBPUSD']);
  });

  test('Klick auf die Zeile öffnet Produkt, Formation und Zeitraum im Chart', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    await page.getByTestId('fav-tf-H1').click();
    await page.getByTestId('fav-tf-H4').click();
    await page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"] button').nth(1).click();
    await expect(page).toHaveURL(/symbol=GBPUSD/);
    await expect(page).toHaveURL(/form=GAR/);
    await expect(page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"]')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('formation-chart')).toBeVisible();
  });

  test('Ein Fehler bei einem Produkt stoppt die anderen nicht und die Zeile gilt als unvollständig', { tag: '@FRM-29' }, async ({ page, worker }) => {
    worker.state.ratesErrorSymbols = ['GBPUSD'];
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    await expect(page.getByTestId('fav-form-GAR').getByTestId('hit-badge')).toHaveText('1');
    await expect(page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"]').getByTestId('favorites-row-gap')).toHaveAttribute('data-gap', 'error');
    await expect(page.locator('[data-testid="favorites-row"][data-symbol="EURUSD"]').getByTestId('favorites-row-gap')).toHaveCount(0);
    await expect(page.getByTestId('favorites-gaps')).toHaveText(msg('formation.fav.gaps', { count: 1 }));
  });

  test('Ein Fehler wird im nächsten Prüfschritt erneut versucht, nicht erst mit der nächsten Kerze', { tag: '@FRM-29' }, async ({ page, worker }) => {
    test.setTimeout(90_000);
    worker.state.ratesErrorSymbols = ['GBPUSD'];
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    await expect(page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"]').getByTestId('favorites-row-gap')).toBeVisible();
    worker.state.ratesErrorSymbols = [];
    await expect(page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"]').getByTestId('favorites-row-gap')).toHaveCount(0, { timeout: 45_000 });
  });

  test('Preise und Änderung kommen vom Worker, fehlt ein Preis steht ein Strich', { tag: '@FRM-29' }, async ({ page, worker }) => {
    worker.state.quotes = { EURUSD: { last: 1.1, prev_close: 1.0, digits: 5 }, GBPUSD: null };
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    const eur = page.locator('[data-testid="favorites-row"][data-symbol="EURUSD"]');
    await expect(eur).toContainText(/1[.,]10000/);
    await expect(eur).toContainText(/\+10[.,]00%/);
    await expect(page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"]')).toContainText('—');
  });

  test('Ohne Favoriten bleibt die Leiste wie bisher und die Seitenleiste verweist auf die Fahne', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await openPage(page, worker);
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    await page.getByTestId('favorites-toggle').click();
    await expect(page.getByTestId('favorites-empty')).toHaveText(msg('formation.fav.empty'));
    await expect(page.getByTestId('formation-form-GAR')).toBeVisible();
    expect(worker.callsTo('GET', /\/quotes$/)).toHaveLength(0);
  });

  test('Die Preise werden nur bei offener Seitenleiste abgefragt', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await openWithFavorites(page, worker, ['EURUSD'], false);
    expect(worker.callsTo('GET', /\/quotes$/)).toHaveLength(0);
    await page.getByTestId('favorites-toggle').click();
    await expect.poll(() => worker.callsTo('GET', /\/quotes$/).length).toBe(1);
  });

  test('Bei 375 px liegt die Seitenleiste über dem Chart, nichts scrollt quer', { tag: '@FRM-29' }, async ({ page, worker }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openWithFavorites(page, worker, ['EURUSD', 'GBPUSD']);
    await expect(page.getByTestId('favorites-panel')).toBeVisible();
    await expect(page.getByTestId('fav-form-GAR')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.locator('[data-testid="favorites-row"][data-symbol="GBPUSD"] button').nth(1).click();
    await expect(page.getByTestId('favorites-panel')).toHaveCount(0);
  });
});
