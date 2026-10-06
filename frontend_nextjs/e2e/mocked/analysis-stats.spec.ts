/**
 * Statistik-Tab der Analyse-Seite: Kennzahlen, Kurven und Aufteilung je Setup aus GET /history/{id}/deals.
 * ANA-09 Statistik-Tab
 */
import type { Page } from '@playwright/test';
import type { Deal } from '../../src/lib/analysis/tradePairing';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, LIVE_ID, ZONE_ID, expect, makeZone, test, type MockWorker } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tab=stats`;
const DAY = 86400;
const H = 3600;

let ticket = 500;
function deal(p: Partial<Deal> & Pick<Deal, 'position_id' | 'time' | 'type' | 'entry'>): Deal {
  const t = ticket++;
  return {
    ticket: t,
    order: t,
    time_msc: p.time * 1000,
    magic: 200001,
    symbol: 'USOUSD',
    volume: 0.01,
    price: 97,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    comment: '',
    reason: 3,
    ...p,
  };
}

/** Fraktal-Zone (Setup 1 H1, Setup 2 H4) mit je einem Trade, einem Grid-Trade ohne Setup und einem manuellen. */
function seed(worker: MockWorker) {
  const now = Date.now() / 1000 + worker.state.brokerOffset;
  const day = Math.floor(now / DAY) * DAY - 5 * DAY;
  worker.state.settings[DEMO_ID] = {
    ZONES: [
      makeZone({
        magic: 200001,
        entry_mode: 'fractal',
        fractal_timeframe: 'H1',
        fractal_rr: 2,
        fractal_setups: [
          {
            sid: 2,
            id: 's2',
            fractal_timeframe: 'H4',
            lot_size: 0.02,
            sell_lot_size: 0.02,
            fractal_order_count: 1,
            sell_fractal_order_count: 1,
            fractal_rr: 3,
            fractal_tp_money: 0,
            max_positions: 1,
          },
        ],
        fractal_setup_seq: 2,
      }),
    ],
  };
  worker.state.zoneRegistry[DEMO_ID] = [
    { magic: 200001, zone_id: ZONE_ID, symbol: 'USOUSD', label: 'Z1', created_at: Math.floor(Date.now() / 1000) - 20 * DAY, deleted_at: null },
  ];
  worker.state.deals[DEMO_ID] = [
    deal({ position_id: 21, time: day + 9 * H, type: 0, entry: 0, comment: 'AutoGrid_Z1_FD1790000000' }),
    deal({ position_id: 21, time: day + 10 * H, type: 1, entry: 1, profit: 9, reason: 5 }),
    deal({ position_id: 22, time: day + 11 * H, type: 1, entry: 0, comment: 'AutoGrid_Z1_F2U1790000000' }),
    deal({ position_id: 22, time: day + 12 * H, type: 0, entry: 1, profit: -4 }),
    deal({ position_id: 23, time: day + 13 * H, type: 0, entry: 0 }),
    deal({ position_id: 23, time: day + 14 * H, type: 1, entry: 1, profit: 3, reason: 5 }),
    deal({ position_id: 24, time: day + 15 * H, type: 0, entry: 0, magic: 0 }),
    deal({ position_id: 24, time: day + 16 * H, type: 1, entry: 1, magic: 0, profit: -1 }),
  ];
}

async function chooseScope(page: Page, label: string) {
  const box = page.getByRole('combobox', { name: msg('analysis.stats.scope') });
  await box.click();
  const listId = await box.getAttribute('aria-controls');
  await page.locator(`[id="${listId}"]`).getByRole('option', { name: label, exact: true }).click();
}

/** Sichtbare Bedienelemente ohne Hinweis (wie UI-07). */
async function unhinted(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls = 'button, a[href], input, select, textarea, [role="switch"], [role="tab"], [role="radio"], [role="combobox"]';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    const covered = (el: Element) =>
      Boolean(
        el.closest('[data-tooltip-trigger], [data-tooltip-exempt]') ||
          el.closest('label')?.querySelector('[data-tooltip-trigger]') ||
          el.closest('[data-tooltip-scope]')?.querySelector('[data-tooltip-trigger]'),
      );
    return [...document.querySelectorAll(controls)].filter((el) => visible(el) && !covered(el)).map((el) => el.outerHTML.slice(0, 160));
  });
}

test.describe('ANA-09 Statistik-Tab', () => {
  test('Zone: Kacheln und Aufteilung je Setup; Setup und ganzes Konto wählbar', { tag: '@ANA-09' }, async ({ page, worker }) => {
    seed(worker);
    await page.goto(URL);

    // Vorauswahl: Zone aus der Adresse, Fraktal-Zone → je Setup
    await expect(page.getByTestId('stat-net-value')).toContainText('+8,00');
    await expect(page.getByTestId('stat-trades-value')).toHaveText('3 / 3');
    const rows = page.getByTestId('breakdown-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-key', 's:200001:1');
    await expect(rows.nth(1).getByTestId('breakdown-label')).toContainText('Setup 2 · H4');
    await expect(rows.nth(2).getByTestId('breakdown-label')).toHaveText(msg('analysis.stats.setup.none'));
    await expect(page.getByTestId('curve-realized')).toHaveAttribute('data-points', '4');

    // Ein Setup
    const zoneLabel = msg('analysis.stats.scope.zone', { n: 1, symbol: 'USOUSD' });
    await expect(page.getByRole('combobox', { name: msg('analysis.stats.scope') })).toContainText(zoneLabel);
    const setup2 = (await rows.nth(1).getByTestId('breakdown-label').textContent()) ?? '';
    await chooseScope(page, msg('analysis.stats.scope.setup', { n: 1, symbol: 'USOUSD', setup: setup2 }));
    await expect(page.getByTestId('stat-trades-value')).toHaveText('1 / 1');
    await expect(page.getByTestId('stat-net-value')).toContainText('-4,00');

    // Ganzes Konto: inkl. manuell, Aufteilung je Zone
    await chooseScope(page, msg('analysis.stats.scope.account'));
    await expect(page.getByTestId('stat-trades-value')).toHaveText('4 / 4');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveAttribute('data-key', 'manual');
    await page.getByRole('tab', { name: msg('analysis.stats.by.setup') }).click();
    await expect(rows).toHaveCount(4);

    // Kontostand: Archiv lückenlos bis jetzt → Kurve da
    await page.getByRole('tab', { name: msg('analysis.stats.curve.balance') }).click();
    await expect(page.getByTestId('curve-balance')).toBeVisible();
    expect(await unhinted(page)).toEqual([]);

    // Kontowechsel: keine alten Zahlen
    await page.goto(`/chart?account=${LIVE_ID}&tab=stats`);
    await expect(page.getByTestId('stats-empty')).toBeVisible();
    await expect(page.getByTestId('stat-trades-value')).toHaveText('0 / 0');
  });

  test('Lücke im Archiv: Kontostand-Kurve aus mit Grund', { tag: '@ANA-09' }, async ({ page, worker }) => {
    seed(worker);
    const now = Math.floor(Date.now() / 1000) + worker.state.brokerOffset;
    worker.state.dealsMissing = [{ from: now - 2 * DAY, to: now, reason: 'busy' }];
    await page.goto(URL);
    await expect(page.getByTestId('stats-missing')).toContainText(msg('analysis.data.reason.busy'));
    await page.getByRole('tab', { name: msg('analysis.stats.curve.balance') }).click();
    await expect(page.getByTestId('curve-balance-off')).toHaveText(msg('analysis.stats.curve.balance.missing'));
  });

  test.describe('Mobil (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });
    test('ohne seitliches Scrollen', { tag: '@ANA-09' }, async ({ page, worker }) => {
      seed(worker);
      await page.goto(URL);
      await expect(page.getByTestId('breakdown-row')).toHaveCount(3);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  });
});
