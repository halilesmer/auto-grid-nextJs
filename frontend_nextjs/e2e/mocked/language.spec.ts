/** UI-05 / UI-06 · Sprache der Oberfläche: Umschalter, Persistenz, Zahlenformat, Wörterbücher. */
import { DEMO_ID, LOCALE_STORAGE_KEY, expect, test } from '../fixtures/test';
import { fmt, msg } from '../fixtures/i18n';
import { de, en, tr } from '../../src/i18n/messages';

const LOCALES = { tr, en, de };

test.describe('UI Sprache', () => {
  test('Umschalter wechselt die Sprache und bleibt nach dem Reload', { tag: '@UI-05' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'tr');
    await expect(page.getByText(msg('dashboard.empty.title'))).toBeVisible();
    await expect(page.getByTestId('language-tr')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('language-en').click();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.getByText(msg('dashboard.empty.title', undefined, 'en'))).toBeVisible();
    await expect(page.getByRole('link', { name: msg('nav.formation', undefined, 'en') })).toBeVisible();

    await page.getByTestId('language-de').click();
    await expect(html).toHaveAttribute('lang', 'de');
    await expect(page.getByText(msg('dashboard.empty.title', undefined, 'de'))).toBeVisible();

    // Auswahl liegt im localStorage und überlebt den Reload; <html lang> stimmt schon vor React
    const stored = await page.evaluate((key) => localStorage.getItem(key), LOCALE_STORAGE_KEY);
    expect(JSON.parse(stored!).state.locale).toBe('de');
    await page.reload();
    await expect(html).toHaveAttribute('lang', 'de');
    await expect(page.getByText(msg('dashboard.empty.title', undefined, 'de'))).toBeVisible();
    await expect(page.getByTestId('language-de')).toHaveAttribute('aria-checked', 'true');
  });

  test('Sprache gilt auch für Dialoge, Toasts und Unterseiten', { tag: '@UI-05' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    await page.getByTestId('language-en').click();
    await page.getByRole('button', { name: msg('account.action.add', undefined, 'en') }).click();
    await expect(page.getByRole('heading', { name: msg('account.dialog.new', undefined, 'en') })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/vps');
    await expect(page.getByRole('heading', { name: msg('vps.title', undefined, 'en') })).toBeVisible();
    await page.goto('/chart');
    await expect(page.getByRole('heading', { name: msg('chart.page.title', undefined, 'en') })).toBeVisible();
  });

  test.describe('Deutsch als Startsprache', () => {
    test.use({ appLocale: 'de' });

    test('Zahlenformat folgt der Sprache (Preis, Kennzahlen)', { tag: '@UI-06' }, async ({ page, worker, dashboard }) => {
      worker.setBotRunning(DEMO_ID);
      await dashboard.open(DEMO_ID);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.getByTestId('metric-price')).toHaveAttribute('data-value', fmt('de').price(97.25, 3));
      expect(fmt('de').price(97.25, 3)).toBe('97,250');

      await page.getByTestId('language-en').click();
      await expect(page.getByTestId('metric-price')).toHaveAttribute('data-value', '97.250');
      await expect(page.getByTestId('metric-profit')).toHaveAttribute('data-value', '-$12.50');
    });
  });

  test.describe('Mobil (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('Ein Button schaltet TR → EN → DE durch', { tag: '@UI-05' }, async ({ page }) => {
      await page.goto('/');
      const cycle = page.getByTestId('language-cycle');
      await expect(page.getByTestId('language-switcher')).toBeHidden();
      await expect(cycle).toHaveText('tr');
      await cycle.click();
      await expect(cycle).toHaveText('en');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await cycle.click();
      await expect(cycle).toHaveText('de');
      await cycle.click();
      await expect(cycle).toHaveText('tr');
      // Kein horizontales Scrollen, auch mit der längsten Sprache im Header
      await cycle.click();
      await cycle.click();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  });
});

test.describe('UI Wörterbücher', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  test('en und de haben dieselben Schlüssel, Platzhalter und keine leeren Texte wie tr', { tag: '@UI-05' }, () => {
    const keys = Object.keys(tr);
    expect(keys.length).toBeGreaterThan(300);
    for (const [name, dict] of Object.entries(LOCALES) as [string, Record<string, string>][]) {
      expect(Object.keys(dict).sort(), `${name}: Schlüssel`).toEqual([...keys].sort());
      for (const key of keys) {
        const text = dict[key];
        expect(text.trim(), `${name}.${key} leer`).not.toBe('');
        expect(placeholders(text), `${name}.${key}: Platzhalter`).toEqual(placeholders((tr as Record<string, string>)[key]));
      }
    }
  });
});
