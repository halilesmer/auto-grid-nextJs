import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

for (const locale of ['tr', 'en', 'de'] as const) {
  test.describe(`Modellgrenzen ${locale}`, () => {
    test.use({ appLocale: locale });
    test('Vor dem Lauf sind alle Modellgrenzen sichtbar', { tag: ['@BKT-04', '@BKT-10'] }, async ({ page, worker }) => {
      void worker;
      await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`);
      const notice = page.getByTestId('bt-model-limits');
      await expect(notice).toBeVisible();
      for (const key of ['events', 'clock', 'swap', 'drawdown'] as const) {
        await expect(notice).toContainText(msg(`backtest.model.${key}`, undefined, locale));
      }
      await expect(page.getByTestId('bt-result')).toHaveCount(0);
    });
  });
}

for (const width of [1280, 375]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`Modellhinweis ${width}px ${theme}`, () => {
      test.use({ appLocale: 'de' });
      test('Hinweis bleibt lesbar und läuft nicht über', { tag: ['@BKT-04', '@BKT-10'] }, async ({ page, worker }, testInfo) => {
        void worker;
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((theme) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme }, version: 0 })), theme);
        await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`);
        const notice = page.getByTestId('bt-model-limits');
        await expect(notice).toBeVisible();
        await expect(notice.locator('li')).toHaveCount(4);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`model-${theme}-${width}.png`) });
      });
    });
  }
}
