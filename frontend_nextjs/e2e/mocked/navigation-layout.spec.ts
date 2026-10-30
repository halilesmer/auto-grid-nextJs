import { test, expect, type AppLocale } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { openPageMenu } from '../fixtures/header';

for (const appLocale of ['tr', 'en', 'de'] as AppLocale[]) {
  test.describe(appLocale, () => {
    test.use({ appLocale });
    test('Navigation bleibt beschriftet und überlappt keine Bedienelemente', { tag: '@UI-08' }, async ({ page, dashboard }) => {
      await dashboard.open(null);
      const nav = page.locator('nav').first();
      for (const width of [375, 640, 810, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        // Unter lg stehen die Seitenlinks im ☰-Menü (UI-01), ab lg in der Kopfzeile
        const narrow = width < 1024;
        const linkArea = narrow ? await openPageMenu(page) : nav;
        await expect(linkArea.getByRole('link', { name: msg('nav.users', undefined, appLocale), exact: true })).toBeVisible();
        for (const link of await linkArea.locator('a').all()) {
          await expect(link.locator('span').last()).toBeVisible();
        }
        // Bei offenem ☰-Panel zählen dessen Links mit (das Panel liegt im nav-DOM)
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
        if (narrow) {
          await page.keyboard.press('Escape');
          await expect(linkArea).toBeHidden();
        }
        if (appLocale === 'de' && (width === 375 || width === 1440)) {
          for (const dark of [false, true]) {
            await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark);
            await nav.screenshot({ path: `/tmp/grid-nav-${width}-${dark ? 'dark' : 'light'}.png` });
          }
        }
      }
    });
    test('Formationsnavigation wechselt bei 1024 px und bleibt ohne Überlappung', { tag: '@UI-08' }, async ({ page, dashboard }) => {
      await dashboard.open(null);
      await page.goto('/formasyon');
      const nav = page.locator('nav').first();
      for (const width of [375, 810, 1023, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        // Unter lg stehen die Seitenlinks im ☰-Menü (UI-01), ab lg in der Kopfzeile
        const narrow = width < 1024;
        await expect(page.getByTestId('nav-menu')).toBeVisible({ visible: narrow });
        const workspace = (await page.getByTestId('formation-page').boundingBox())!;
        expect(workspace.y).toBe(narrow ? 0 : 56);
        expect(workspace.height).toBe(narrow ? 900 : 844);
        const linkArea = narrow ? await openPageMenu(page) : nav;
        await expect(linkArea.getByRole('link', { name: msg('nav.users', undefined, appLocale), exact: true })).toBeVisible();
        for (const link of await linkArea.locator('a').all()) {
          await expect(link.locator('span').last()).toBeVisible();
        }
        // Bei offenem ☰-Panel zählen dessen Links mit (das Panel liegt im nav-DOM)
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
        if (narrow) {
          await page.keyboard.press('Escape');
          await expect(linkArea).toBeHidden();
        }
        if (appLocale === 'de' && (width === 375 || width === 1440)) {
          for (const dark of [false, true]) {
            await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark);
            await nav.screenshot({ path: `/tmp/grid-formation-nav-${width}-${dark ? 'dark' : 'light'}.png` });
          }
        }
      }
    });
  });
}
