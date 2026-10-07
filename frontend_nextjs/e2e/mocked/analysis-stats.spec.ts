/**
 * Statistik-Tab der Analyse-Seite: Kennzahlen, Kurven und Aufteilung aus GET /history/{id}/deals.
 * ANA-09 Statistik-Tab
 * ANA-12 MFE/MAE in der Trade-Tabelle
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

/** Fraktal-Zone mit einem Fraktal-Trade, einem Trade eines früheren Zusatz-Setups, einem Grid-Trade und einem manuellen. */
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
  return day;
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
  test('Zone: Kacheln und Aufteilung je Wochentag; ganzes Konto wählbar', { tag: '@ANA-09' }, async ({ page, worker }) => {
    const day = seed(worker);
    await page.goto(URL);

    // Vorauswahl: Zone aus der Adresse (alle Trades der Zone, auch der des früheren Zusatz-Setups) → je Wochentag
    await expect(page.getByTestId('stat-net-value')).toContainText('+8,00');
    await expect(page.getByTestId('stat-trades-value')).toHaveText('3 / 3');
    const rows = page.getByTestId('breakdown-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toHaveAttribute('data-key', String(new Date(day * 1000).getUTCDay()));
    await expect(page.getByTestId('curve-realized')).toHaveAttribute('data-points', '4');
    const zoneLabel = msg('analysis.stats.scope.zone', { n: 1, symbol: 'USOUSD' });
    await expect(page.getByRole('combobox', { name: msg('analysis.stats.scope') })).toContainText(zoneLabel);

    // Ganzes Konto: inkl. manuell, Aufteilung je Zone
    await chooseScope(page, msg('analysis.stats.scope.account'));
    await expect(page.getByTestId('stat-trades-value')).toHaveText('4 / 4');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveAttribute('data-key', 'manual');

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
      await expect(page.getByTestId('breakdown-row')).toHaveCount(1);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  });
});

test.describe('ANA-12 MFE/MAE', () => {
  test('Trade-Tabelle im Statistik-Tab: MFE/MAE erst auf Knopfdruck, Ergebnisse je Trade', { tag: '@ANA-12' }, async ({ page, worker }) => {
    seed(worker);
    await page.goto(URL);

    const rows = page.getByTestId('trades-archive').getByTestId('trade-row');
    await expect(rows).toHaveCount(3);

    // Ohne Knopfdruck keine Kerzen
    await expect(rows.nth(0).getByTestId('trade-mfe')).toHaveText('–');
    expect(worker.ratesDelivered).toEqual([]);

    const compute = page.getByTestId('mfe-compute');
    await expect(compute).toHaveText(msg('analysis.trades.mfe.compute', { n: 3 }));
    await compute.click();
    await expect(compute).toHaveText(msg('analysis.trades.mfe.compute', { n: 0 }));
    await expect(compute).toBeDisabled();
    for (let i = 0; i < 3; i++) await expect(rows.nth(i).getByTestId('trade-mfe')).toContainText(msg('analysis.trades.mfe.unit'));
    // Ein Symbol → eine M1-Abfrage
    expect(worker.ratesDelivered).toHaveLength(1);

    // Ganzes Konto: die drei Ergebnisse bleiben, nur der manuelle Trade ist offen
    await chooseScope(page, msg('analysis.stats.scope.account'));
    await expect(rows).toHaveCount(4);
    await expect(compute).toHaveText(msg('analysis.trades.mfe.compute', { n: 1 }));
    expect(await unhinted(page)).toEqual([]);
  });

  test('Fehlende M1-Kerzen zwischen Ein- und Ausstieg: „nicht berechenbar“, nie 0', { tag: '@ANA-12' }, async ({ page, worker }) => {
    const day = seed(worker);
    // Zwischen Einstieg (11:00) und Ausstieg (12:00) des Trades von Position 22 fehlen Kerzen
    worker.state.ratesMissing = [{ from: day + 11 * H + 600, to: day + 11 * H + 1200, reason: 'unavailable', checked_at: null }];
    await page.goto(URL);

    const rows = page.getByTestId('trades-archive').getByTestId('trade-row');
    await expect(rows).toHaveCount(3);
    await page.getByTestId('mfe-compute').click();
    await expect(rows.nth(1).getByTestId('trade-mfe')).toHaveText(msg('analysis.trades.mfe.na'));
    await expect(rows.nth(0).getByTestId('trade-mfe')).toContainText(msg('analysis.trades.mfe.unit'));
    await expect(rows.nth(2).getByTestId('trade-mfe')).toContainText(msg('analysis.trades.mfe.unit'));
  });
});
