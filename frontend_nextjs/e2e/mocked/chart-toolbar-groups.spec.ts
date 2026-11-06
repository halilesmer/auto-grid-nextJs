import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

// Taşınabilir araç grupları (UI-16, 1105-A5.8, journal 2026-11-05-toolbar-groups). UI-17 (1106-A1, S2) ile paketler yuvalara taşındı:
// bu dosya UI-16'nın davranışını (tutamaç, menü, sürükle-bırak, serbest alan, 375 px) yeni modelde doğrular; yuva ve ok menüsü testleri chart-dock.spec.ts'te.
const URL = `/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });

const group = (page: Page, id: string) => page.locator(`[data-dock-pkg="${id}"]`);
const handle = (page: Page, id: string) => page.getByTestId(`dock-handle-${id}`);
const row = (page: Page, zone: 'row1' | 'bottom') => page.getByTestId(`dock-row-${zone}`);
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').dockLayout ?? null, storageKey);
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect(group(page, 'edit')).toBeVisible();
}
/** Tutamaçtan sürükleyip hedef kutunun ortasına bırakır (sürüklerken boş satır bırakma yeri olarak açılır) */
async function dragTo(page: Page, id: string, target: () => Promise<{ x: number; y: number }>) {
  const start = (await handle(page, id).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y - 40, { steps: 5 });
  const to = await target();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}
const center = async (page: Page, testId: string) => { const b = (await page.getByTestId(testId).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

test('Varsayılan yerleşim: bütün gruplar alt çubukta, tutamaçlı ve adlı', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await expect(page.getByTestId('workspace-toolbar')).toHaveAttribute('data-strip', 'bottom');
  for (const id of ['indicators', 'edit', 'window']) {
    await expect(row(page, 'bottom').locator(`[data-dock-pkg="${id}"]`)).toBeVisible();
    await expect(group(page, id)).toHaveAttribute('role', 'group');
  }
  await expect(group(page, 'edit')).toHaveAttribute('aria-label', msg('cw.tbGroup.edit'));
  await expect(handle(page, 'edit')).toHaveAccessibleName(msg('cw.tbHandle'));
  // Satır 1 boştur: gizli
  await expect(row(page, 'row1')).toBeHidden();
});

test('Grubu Satır 1\'e sürükle: yenilemeden sonra yerinde', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await dragTo(page, 'edit', () => center(page, 'dock-row-row1'));
  await expect(row(page, 'row1').locator('[data-dock-pkg="edit"]')).toBeVisible();
  expect((await stored(page)).row1).toContain('edit');
  // Sürüklemenin ardından menü açılmaz
  await expect(page.getByTestId('dock-move-row1')).toHaveCount(0);
  // Taşınan grubun tutamacı bir sonraki tıklamada menüyü açar (sürüklemenin bastırması takılı kalmaz)
  await handle(page, 'edit').click();
  await expect(page.getByTestId('dock-move-bottom')).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(row(page, 'row1').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="indicators"]')).toBeVisible();
});

test('Tutamaç menüsüyle yalnız klavye: grafiğe bırak, ok tuşuyla kaydır, alta taşı', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'indicators').focus();
  await page.keyboard.press('Enter');
  // Bulunduğu yer (alt çubuk) pasif, sıfırlama da pasif (zaten varsayılan)
  await expect(page.getByTestId('dock-move-bottom')).toBeDisabled();
  await expect(page.getByTestId('dock-reset')).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('dock-move-row1')).toBeFocused();
  // Alt çubuk pasif, atlanır: sıradaki Grafiğe bırak
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('dock-move-free')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(group(page, 'indicators')).toHaveAttribute('data-zone', 'free');
  await expect(handle(page, 'indicators')).toBeFocused();
  const before = (await stored(page)).free.indicators;
  const left = await group(page, 'indicators').evaluate(el => el.getBoundingClientRect().left);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => group(page, 'indicators').evaluate(el => el.getBoundingClientRect().left)).toBeGreaterThan(left);
  expect((await stored(page)).free.indicators.x).toBeGreaterThan(before.x);
  await expect(handle(page, 'indicators')).toBeFocused();
  // Yeniden menü: Grafiğe bırak pasif, Alt çubuğa taşı seçilir
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dock-move-free')).toBeDisabled();
  await page.getByTestId('dock-move-bottom').click();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="indicators"]')).toBeVisible();
  await expect(handle(page, 'indicators')).toBeFocused();
  expect((await stored(page)).bottom).toContain('indicators');
  // Alttaki grupta Katmanlar menüsü yukarı açılır ve ekranda kalır
  await page.getByTestId('layers-button').click();
  const panel = (await page.getByTestId('layers-menu').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(900);
});

test('"Yerleşimi sıfırla" ayarlar diyaloğunda ve tutamaç menüsünde varsayılana döner (eski toolbarLayout da temizlenir)', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await page.addInitScript(([key]) => {
    const raw = JSON.parse(localStorage.getItem(key) || '{"version":1}');
    localStorage.setItem(key, JSON.stringify({ ...raw, version: 1, toolbarLayout: { edit: { zone: 'top' } } }));
  }, [storageKey] as const);
  await open(page);
  // Eski kayıt (top) Satır 1'e geçer
  await expect(row(page, 'row1').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await handle(page, 'edit').click();
  await page.getByTestId('dock-move-bottom').click();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await page.getByTestId('workspace-settings').click();
  const reset = page.getByTestId('settings-toolbar-reset');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(reset).toBeDisabled();
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), storageKey);
  expect(after.toolbarLayout).toEqual({});
  expect(after.dockLayout.row1).not.toContain('edit');
  await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="edit"]')).toBeVisible();
  // Menüdeki sıfırlama
  await handle(page, 'window').click();
  await page.getByTestId('dock-move-free').click();
  await expect(group(page, 'window')).toHaveAttribute('data-zone', 'free');
  await handle(page, 'window').click();
  await page.getByTestId('dock-reset').click();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="window"]')).toBeVisible();
  expect((await stored(page)).free).toEqual({});
});

test('Sığmayan serbest grup alt çubuğa düşer, kayıt kalır; pencere büyüyünce yerine döner', { tag: '@UI-16' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'indicators').click();
  await page.getByTestId('dock-move-free').click();
  await expect(group(page, 'indicators')).toHaveAttribute('data-zone', 'free');
  await page.setViewportSize({ width: 280, height: 640 });
  await expect(row(page, 'bottom').locator('[data-dock-pkg="indicators"]')).toBeVisible();
  expect((await stored(page)).free.indicators).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(group(page, 'indicators')).toHaveAttribute('data-zone', 'free');
});

test.describe('375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Taşınmış gruplarla yatay kaydırma yok, gruplar görünür alanda (UI-08)', { tag: ['@UI-16', '@UI-08'] }, async ({ page, worker }) => {
    void worker;
    // Satır 1 ve serbest alan kaydı: telefonda sabit düzen kalır (kayıt silinmez), gruplar alt çubukta
    await page.addInitScript(([key, layout]) => {
      const raw = JSON.parse(localStorage.getItem(key) || '{"version":1}');
      localStorage.setItem(key, JSON.stringify({ ...raw, version: 1, dockLayout: layout }));
    }, [storageKey, { row1: ['edit', 'account'], row2: [], bottom: ['view', 'indicators'], free: { window: { x: 0.9, y: 0.9 } }, pos: {} }] as const);
    await open(page);
    await expect(page.getByTestId('workspace-toolbar')).toHaveAttribute('data-strip', 'bottom');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ['indicators', 'edit', 'window']) {
      const box = (await group(page, id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    expect((await stored(page)).row1).toContain('edit');
  });
});
