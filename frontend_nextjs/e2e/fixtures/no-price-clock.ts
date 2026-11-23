import type { Page } from '@playwright/test';

/**
 * Turns the clock in the price label (ANA-28) off for the page. The clock redraws the chart once per second. Tests that
 * move the fake clock by minutes (`page.clock.runFor`) would run that timer hundreds of times and redraw the chart each time,
 * and tests that compare chart images would see the digits change. Both kinds of test call this in `beforeEach`.
 * The init script runs again on every `goto` and `reload`, so it merges into a saved chart record and never replaces it: a reload keeps what the page saved.
 */
export const noPriceClock = (page: Page) => page.addInitScript(() => {
  const key = 'grid-robot-chart-workspaces-v1';
  const raw = JSON.parse(localStorage.getItem(key) || 'null');
  localStorage.setItem(key, JSON.stringify(raw ? { ...raw, appearance: { ...raw.appearance, priceClock: false } } : { version: 3, appearance: { priceClock: false }, documents: {} }));
});
