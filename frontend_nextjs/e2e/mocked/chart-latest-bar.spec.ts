import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

// UI-26: after scrolling left, a round arrow button brings the chart back to the latest candle.
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

test('Son muma dön düğmesi sola kaydırınca çıkar, tıklayınca kaybolur', { tag: '@UI-26' }, async ({ page, worker }) => {
  void worker;
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
  const y = box.y + box.height * 0.3;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.85, y, { steps: 8 });
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-hidden', 'false');

  await button.click();
  await expect(button).toHaveAttribute('aria-hidden', 'true');
});
