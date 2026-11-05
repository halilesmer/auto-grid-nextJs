import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

// Taşınabilir araç grupları (UI-16, 1105-A5.8, journal 2026-11-05-toolbar-groups)
const URL = `/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });

const group = (page: Page, id: string) => page.locator(`[data-toolbar-group="${id}"]`);
const handle = (page: Page, id: string) => page.getByTestId(`toolbar-handle-${id}`);
const strip = (page: Page, zone: 'top' | 'bottom') => page.locator(`[data-strip="${zone}"]`);
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').toolbarLayout ?? {}, storageKey);
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect(group(page, 'edit')).toBeVisible();
}

test('Oto yerleşim: geniş pencerede bütün gruplar üst şeritte, tutamaçlı ve adlı', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await expect(page.getByTestId('workspace-toolbar')).toHaveAttribute('data-strip', 'top');
  for (const id of ['indicators', 'edit', 'window']) {
    await expect(strip(page, 'top').locator(`[data-toolbar-group="${id}"]`)).toBeVisible();
    await expect(group(page, id)).toHaveAttribute('role', 'group');
  }
  await expect(group(page, 'edit')).toHaveAttribute('aria-label', msg('cw.tbGroup.edit'));
  await expect(handle(page, 'edit')).toHaveAccessibleName(msg('cw.tbHandle', { group: msg('cw.tbGroup.edit') }));
  await expect(strip(page, 'bottom')).toHaveCount(0);
});

test('Grubu alt şeride sürükle: yenilemeden sonra yerinde', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const start = (await handle(page, 'edit').boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x - 40, start.y + 60, { steps: 5 });
  // Sürüklerken boş alt şerit bırakma alanı olarak görünür
  const target = (await strip(page, 'bottom').boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(strip(page, 'bottom').locator('[data-toolbar-group="edit"]')).toBeVisible();
  expect(await stored(page)).toEqual({ edit: { zone: 'bottom' } });
  // Sürüklemenin ardından menü açılmaz
  await expect(page.getByTestId('toolbar-move-top')).toHaveCount(0);
  // Taşınan grubun tutamacı bir sonraki tıklamada menüyü açar (sürüklemenin bastırması takılı kalmaz)
  await handle(page, 'edit').click();
  await expect(page.getByTestId('toolbar-move-top')).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(strip(page, 'bottom').locator('[data-toolbar-group="edit"]')).toBeVisible();
  await expect(strip(page, 'top').locator('[data-toolbar-group="indicators"]')).toBeVisible();
});

test('Tutamaç menüsüyle yalnız klavye: grafiğe bırak, ok tuşuyla kaydır, alta taşı', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'indicators').focus();
  await page.keyboard.press('Enter');
  // Bulunduğu yer (üst) pasif, sıfırlama da pasif (zaten oto)
  await expect(page.getByTestId('toolbar-move-top')).toBeDisabled();
  await expect(page.getByTestId('toolbar-reset')).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('toolbar-move-bottom')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('toolbar-move-free')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(group(page, 'indicators')).toHaveAttribute('data-zone', 'free');
  await expect(handle(page, 'indicators')).toBeFocused();
  const before = (await stored(page)).indicators;
  const left = await group(page, 'indicators').evaluate(el => el.getBoundingClientRect().left);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => group(page, 'indicators').evaluate(el => el.getBoundingClientRect().left)).toBeGreaterThan(left);
  expect((await stored(page)).indicators.x).toBeGreaterThan(before.x);
  await expect(handle(page, 'indicators')).toBeFocused();
  // Yeniden menü: Grafiğe bırak pasif, Alta taşı seçilir
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toolbar-move-free')).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('toolbar-move-bottom')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(strip(page, 'bottom').locator('[data-toolbar-group="indicators"]')).toBeVisible();
  await expect(handle(page, 'indicators')).toBeFocused();
  expect(await stored(page)).toEqual({ indicators: { zone: 'bottom' } });
  // Alttaki grupta Katmanlar menüsü yukarı açılır ve ekranda kalır
  await page.getByTestId('layers-button').click();
  const panel = (await page.getByTestId('layers-menu').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(900);
});

test('"Araç çubuğunu sıfırla" ayarlar diyaloğunda ve tutamaç menüsünde otoya döner', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'edit').click();
  await page.getByTestId('toolbar-move-bottom').click();
  await expect(strip(page, 'bottom').locator('[data-toolbar-group="edit"]')).toBeVisible();
  await page.getByTestId('workspace-settings').click();
  const reset = page.getByTestId('settings-toolbar-reset');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(reset).toBeDisabled();
  expect(await stored(page)).toEqual({});
  await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  await expect(strip(page, 'top').locator('[data-toolbar-group="edit"]')).toBeVisible();
  await expect(strip(page, 'bottom')).toHaveCount(0);
  // Menüdeki sıfırlama
  await handle(page, 'window').click();
  await page.getByTestId('toolbar-move-free').click();
  await expect(group(page, 'window')).toHaveAttribute('data-zone', 'free');
  await handle(page, 'window').click();
  await page.getByTestId('toolbar-reset').click();
  await expect(strip(page, 'top').locator('[data-toolbar-group="window"]')).toBeVisible();
  expect(await stored(page)).toEqual({});
});

test('Sığmayan serbest grup alt şeride düşer, kayıt kalır; pencere büyüyünce yerine döner', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'indicators').click();
  await page.getByTestId('toolbar-move-free').click();
  await expect(group(page, 'indicators')).toHaveAttribute('data-zone', 'free');
  await page.setViewportSize({ width: 280, height: 640 });
  await expect(strip(page, 'bottom').locator('[data-toolbar-group="indicators"]')).toBeVisible();
  expect((await stored(page)).indicators.zone).toBe('free');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(group(page, 'indicators')).toHaveAttribute('data-zone', 'free');
});

test.describe('375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Taşınmış gruplarla yatay kaydırma yok, gruplar görünür alanda (UI-08)', { tag: ['@UI-16', '@UI-08'] }, async ({ page, worker }) => {
    void worker;
    // Üst şerit (dar kapta grafiğin üstünde), serbest grup ve oto alt şerit birlikte
    await page.addInitScript(([key, layout]) => {
      const raw = JSON.parse(localStorage.getItem(key) || '{"version":1}');
      localStorage.setItem(key, JSON.stringify({ ...raw, version: 1, toolbarLayout: layout }));
    }, [storageKey, { edit: { zone: 'top' }, window: { zone: 'free', x: 0.9, y: 0.9 } }] as const);
    await open(page);
    await expect(page.getByTestId('workspace-toolbar')).toHaveAttribute('data-strip', 'bottom');
    await expect(strip(page, 'top').locator('[data-toolbar-group="edit"]')).toBeVisible();
    await expect(group(page, 'window')).toHaveAttribute('data-zone', 'free');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ['indicators', 'edit', 'window']) {
      const box = (await group(page, id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
  });
});
