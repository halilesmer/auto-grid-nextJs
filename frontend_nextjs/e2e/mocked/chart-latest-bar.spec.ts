import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

// UI-26: after scrolling left, a round arrow button brings the chart back to the latest candle.
// The mock candles and the formation lines on them follow the clock. From 21:00 UTC on 2026-11-17 a formation line sat where the drag
// started; its hit area took the press, so the chart did not scroll (main run 44175274756). A fixed clock gives the same chart on every run.
test.use({ fakeNow: '2026-11-17T15:20:00Z' });
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

/** A y where the topmost element at three x values is a chart canvas (no overlay such as a formation line hit area takes the press). */
const freeY = (page: Page, x: number, fromY: number, toY: number) => page.evaluate(([px, a, b]) => {
  for (let y = a; y < b; y += 4) {
    if ([-10, 0, 10].every(dx => document.elementFromPoint(px + dx, y) instanceof HTMLCanvasElement)) return y;
  }
  return null;
}, [x, fromY, toY]);

/** Opens the chart and drags it to older candles until the button shows. */
async function scrollAway(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`);
  const button = page.getByTestId('chart-latest-bar');
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toBeVisible();
  // Langsamer Runner: erst ziehen, wenn die Kerzen da sind, sonst setzt das spätere Laden die Ansicht zurück.
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  await expect(button).toHaveAttribute('aria-hidden', 'true');
  await expect(button).toHaveAttribute('aria-label', msg('analysis.chart.latest'));

  // Drag the chart to the right = scroll to older candles (left)
  const box = (await chart.boundingBox())!;
  const x = box.x + box.width * 0.3;
  const y = await freeY(page, x, box.y + box.height * 0.2, box.y + box.height * 0.6);
  expect(y, 'no free point on the candles for the drag').not.toBeNull();
  await page.mouse.move(x, y!);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y!, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.85, y!, { steps: 8 });
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-hidden', 'false');
  return button;
}

test('Son muma dön düğmesi sola kaydırınca çıkar, tıklayınca kaybolur', { tag: '@UI-26' }, async ({ page, worker }) => {
  void worker;
  const button = await scrollAway(page);
  await button.click();
  await expect(button).toHaveAttribute('aria-hidden', 'true');
});

test('Son muma dön: ana iş parçacığı animasyon sırasında meşgulse de grafik son muma ulaşır', { tag: '@UI-26' }, async ({ page, worker }) => {
  void worker;
  const button = await scrollAway(page);
  // A busy main thread (a loaded CI runner) skips the frames of the 400 ms scroll animation. The library does not write the end
  // position in the frame after the animation time, so the view stopped at the last frame and the button stayed (1116-A35).
  await button.evaluate((el) => el.addEventListener('click', () => setTimeout(() => {
    const start = performance.now();
    while (performance.now() - start < 500) { /* busy */ }
  }, 50)));
  await button.click();
  await expect(button).toHaveAttribute('aria-hidden', 'true');
});
