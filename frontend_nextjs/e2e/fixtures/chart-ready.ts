import type { Page } from '@playwright/test';
import { expect } from './test';

/**
 * Waits until the chart holds still: the candles are loaded and the formation search is finished.
 *
 * Call it before a pointer gesture at fixed pixels (a drawing tool, a click or a double click on a drawing) and
 * again after each `page.reload()`. When the formation search finishes, the chart changes its scale. A point
 * that was set before then moves away from its pixel, and a later click at that pixel misses the drawing
 * (measurement: docs/journal/2026-11-16-chart-drawing-tests-scan-race.md).
 *
 * Only for tests where the search starts by itself (fixture option `formationAsk: 'auto'`, the default).
 */
export async function chartReady(page: Page) {
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  // Two more frames, so that the chart can draw the new scale before the next click (the time between the attribute and the
  // new picture was not measured; with this wait 116 of 116 runs passed).
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/**
 * Hides the formation drawings (toolbar switch "Formasyon çizimleri", FRM-45) for a test about the user's own drawings.
 *
 * Since 1118-A5.1 the chart opens with the latest candles at the default bar spacing, so the formation of the search spreads over
 * the view. The 14 px hit area of its lines (`line-hit`, `pointer-events: stroke`) then can lie under the fixed pixels of the test
 * and takes the pointer events, also while a drawing tool is active (measured with `elementFromPoint`: journal
 * 2026-11-18-chart-view-like-tradingview). The switch is stored in the chart document: it stays after a reload. The formation
 * search still runs and still widens the price axis (`priceRange` does not depend on the switch).
 */
export async function hideFormationDrawings(page: Page) {
  // Only the formation timeframes (D1, H4, H1, M15) have the switch. Decide by the timeframe of the address, not by a count of the
  // switch at this moment: the switch may not be drawn yet, and the formation lines would stay (review of the coordinator, PR 616)
  const tf = new URL(page.url()).searchParams.get('tf');
  if (tf && !['D1', 'H4', 'H1', 'M15'].includes(tf)) return;
  const toggle = page.getByTestId('formation-drawings-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
}
