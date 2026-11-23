import type { Page } from '@playwright/test';

/**
 * Turns the clock in the price label (ANA-28) off for the page. The clock redraws the chart once per second. Tests that
 * move the fake clock by minutes (`page.clock.runFor`) would run that timer hundreds of times and redraw the chart each time,
 * and tests that compare chart images would see the digits change. Both kinds of test call this in `beforeEach`.
 */
export const noPriceClock = (page: Page) => page.addInitScript(() => {
  localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify({ version: 3, appearance: { priceClock: false }, documents: {} }));
});
