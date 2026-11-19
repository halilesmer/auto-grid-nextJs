/**
 * Seite /chart (Modus Formation), Handelsblock einer Gartley: Stand offen, TP1, TP1 und TP2, Stop – TP2-Zeile, Statuszeile, Stop am Einstieg
 * und Ergebnis-Kasten wie bei AB=CD. Kerzen sind synthetisch (zig), das Auge sieht je Stand und Thema den ganzen Block.
 * FRM-39 Handelsblock
 */
import type { Page } from '@playwright/test';
import { groupZones, makeZone } from '../fixtures/data';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { seedFixtureTrend } from '../fixtures/formation-trend';
import { H4, zig, type Row } from '../fixtures/formation-rows';

test.beforeEach(({ page }) => seedFixtureTrend(page));

const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const T0 = 1_760_000_000 - (1_760_000_000 % H4);
const GAR = zig([100, 130, 111.46, 122.92, 106.41], [18, 4, 4, 4], 3);

// Kauf-Preise: Einstieg 106,417, TP1 ≈ 115,42, TP2 ≈ 120,99, Stop ≈ 97,41
const STATES: Record<string, Row[]> = {
  open: [[107.5, 108.5, 106.7, 107.5]],
  tp1: [[107.5, 116, 106.7, 115.6]],
  tp12: [
    [107.5, 116, 106.7, 115.6],
    [115.6, 121.6, 115.2, 121.4],
  ],
  stopped: [[107.5, 108, 95, 96.5]],
};

async function show(page: Page, worker: MockWorker, extra: Row[]) {
  const rows = [...GAR, ...extra].map((r, i) => [T0 + i * H4, r[0], r[1], r[2], r[3]]);
  const now = T0 + rows.length * H4;
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[now - 900, 100, 100, 100, 100]] };
  await page.goto(URL);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  await page.getByTestId('chart-card-tab-conditions').click();
  await expect(page.getByTestId('candidate-item').first()).toBeVisible();
}

for (const theme of ['dark', 'light']) {
  for (const [name, extra] of Object.entries(STATES)) {
    test(`Gartley (${theme}): Handelsblock im Stand ${name}`, { tag: '@FRM-39' }, async ({ page, worker }) => {
      await page.addInitScript((value) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
      await show(page, worker, extra);
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      const block = page.getByTestId('trade-block');
      await expect(block).toBeVisible();
      await expect(block.getByTestId('trade-status')).toHaveAttribute('data-status', name === 'stopped' ? 'stopped' : name);
      if (name === 'open') {
        // „Seviye 1“ gehört zu AB=CD: bei Harmoniken steht der Einstieg am D-Level
        await expect(block.getByTestId('trade-status')).toContainText(msg('formation.trade.status.open.sub.harmonic'));
        await expect(block.getByTestId('trade-status')).not.toContainText(/seviye 1|level 1/i);
      }
      await expect(block.getByTestId('trade-outcomes')).toBeVisible();
      await block.scrollIntoViewIfNeeded();
      await block.screenshot({ path: test.info().outputPath(`gartley-${name}-${theme}.png`) });
    });
  }
}
