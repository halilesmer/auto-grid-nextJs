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
}
