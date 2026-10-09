import { test, expect, type AppLocale } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

for (const appLocale of ['tr', 'en', 'de'] as AppLocale[]) {
  test.describe(appLocale, () => {
    test.use({ appLocale });
    test('Navigation bleibt beschriftet und überlappt keine Bedienelemente', { tag: '@UI-08' }, async ({ page, dashboard }) => {
      await dashboard.open(null);
      const nav = page.locator('nav').first();
      await expect(nav.getByRole('link', { name: msg('nav.users', undefined, appLocale), exact: true })).toBeVisible();
      for (const width of [375, 640, 810, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const links = nav.locator('a');
        for (const link of await links.all()) {
          await expect(link.locator('span').last()).toBeVisible();
        }
        const problems = await nav.evaluate((element) => {
          const boxes = [...element.querySelectorAll('a, button')]
            .map((control) => control.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0);
          return boxes.flatMap((box, index) => {
            const issues = [];
            if (box.left < 0 || box.right > window.innerWidth) issues.push('outside viewport');
            if (boxes.slice(index + 1).some((other) =>
              box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
            )) issues.push('overlapping controls');
            return issues;
          });
        });
        expect(problems, `${appLocale}, ${width}px`).toEqual([]);
        if (appLocale === 'de' && (width === 375 || width === 1440)) {
          for (const dark of [false, true]) {
            await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark);
            await nav.screenshot({ path: `/tmp/grid-nav-${width}-${dark ? 'dark' : 'light'}.png` });
          }
        }
      }
    });
  });
}
