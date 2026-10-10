import { DEMO_ID, expect, makeZone, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test.use({ appLocale: 'de' });

test('Pip-Grenze: Vorschau bei Desktop und 375 px in beiden Themes lesbar', { tag: ['@ZON-21', '@UI-08'] }, async ({ page, worker, dashboard }) => {
  worker.setZones(DEMO_ID, [makeZone({ symbol: 'EURUSD', entry_mode: 'fractal', fractal_next_loss: 10, fractal_next_loss_mode: 'pips', fractal_next_loss_unit_version: 1 })]);
  await dashboard.open(DEMO_ID);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const dark of [false, true]) {
      await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark);
      const fields = dashboard.zone().getByTestId('fractal-fields');
      await expect(fields.getByTestId('fractal-distance-preview')).toContainText('0,001');
      const input = dashboard.zoneField(msg('zone.fractal.nextLossPips', undefined, 'de'));
      await expect(input).toHaveValue('10');
      const box = await input.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
      await fields.screenshot({ path: `/private/tmp/grid-distance-${width}-${dark ? 'dark' : 'light'}.png` });
    }
  }
});
