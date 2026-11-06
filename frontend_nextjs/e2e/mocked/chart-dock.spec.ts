import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

// Serbest paket yerleşimi, S2: yuvalar, ok menüsü, yumuşak bırakma, klavye (UI-17, plan 1106-A1, journal 2026-11-06-free-package-layout)
const URL = `/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });

const group = (page: Page, id: string) => page.locator(`[data-dock-pkg="${id}"]`);
const handle = (page: Page, id: string) => page.getByTestId(`dock-handle-${id}`);
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').dockLayout ?? null, storageKey);
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
  await expect(group(page, 'edit')).toBeVisible();
}
// Kutu (.dock-wrap) paketin soldaki ayırıcı çizgisini de içerir; konumlar kutudan ölçülür
const box = async (page: Page, id: string) => (await page.locator(`[data-dock-wrap="${id}"]`).boundingBox())!;

test('Dar pencerede ok görünür; menüdeki düğme çalışır ve ipucu taşır', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 520, height: 800 });
  await open(page);
  // Görünüm paketinde tek düğme var (gizlenmez, ok yok); Göstergeler paketinde ok çıkar
  const more = group(page, 'indicators').getByTestId('dock-more');
  await expect(more).toBeVisible();
  // Satır tek sıra: paketler alt çubuktan taşmaz
  const bar = (await page.getByTestId('dock-row-bottom').boundingBox())!;
  for (const id of ['view', 'indicators', 'edit', 'window']) {
    const g = await group(page, id).count() ? await box(page, id) : null;
    if (g) expect(g.x + g.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
  }
  // Ok her paketin sağında durur; açınca gizlenen düğmeler görünür
  await more.click();
  const menu = page.getByTestId('dock-more-menu');
  await expect(menu).toBeVisible();
  const items = menu.locator('button:visible');
  expect(await items.count()).toBeGreaterThan(0);
  // Satırda görünen düğme menüde yok: menü yalnız sığmayanları gösterir
  await expect(menu.locator('[data-testid="dock-more"]')).toHaveCount(0);
  // Menüdeki her düğme ipucunu (hint) taşır: üzerine gelince açılır
  await items.first().hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  // Menüdeki düğme satırdakiyle aynı işi yapar: Göstergeler paketinin son düğmesi „Katmanlar“ ilk taşan düğmedir ve menüden de
  // katman menüsünü açar. (1106-A3'ten beri Düzen paketi 520 px'e sığar: „Çizim nesneleri“ Göstergeler penceresinde.)
  await page.keyboard.press('Escape');
  await more.click();
  await page.getByTestId('dock-more-menu').getByRole('button', { name: msg('cw.layers'), exact: true }).click();
  await expect(page.locator('#layer-rsi')).toBeVisible();
});

test('Yer olmayan yere bırakılan paket eski yerinde kalır', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const before = await stored(page);
  const start = (await handle(page, 'edit').boundingBox())!;
  const homeBefore = await box(page, 'edit');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  // Uygulama gezinme çubuğunun üstü: ne satır ne grafik yüzeyi
  await page.mouse.move(700, 12, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await box(page, 'edit')).x, { timeout: 5000 }).toBeCloseTo(homeBefore.x, 0);
  expect(await stored(page)).toEqual(before);
  await expect(page.getByTestId('dock-row-bottom').locator('[data-dock-pkg="edit"]')).toBeVisible();
});

test('Esc sürüklemeyi iptal eder: paket eski yerine döner', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const homeBefore = await box(page, 'edit'), start = (await handle(page, 'edit').boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 200, start.y - 150, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => (await box(page, 'edit')).x, { timeout: 5000 }).toBeCloseTo(homeBefore.x, 0);
  await expect(page.getByTestId('dock-row-bottom').locator('[data-dock-pkg="edit"]')).toBeVisible();
});

test('Alt çubuğun ortasına bırak: boşlukta kalır, yenilemeden sonra yeri korunur', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  const rowBox = (await page.getByTestId('dock-row-bottom').boundingBox())!;
  const start = (await handle(page, 'edit').boundingBox())!, w = (await box(page, 'edit')).width;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y - 10, { steps: 5 });
  // Paketin sol kenarı satırın %60'ında olsun
  const wantLeft = rowBox.x + rowBox.width * 0.6;
  await page.mouse.move(wantLeft + (start.x + start.width / 2 - (await box(page, 'edit')).x), start.y + start.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await stored(page)).pos.edit).toBeGreaterThan(0.5);
  const pos = (await stored(page)).pos.edit as number;
  await expect.poll(async () => (await box(page, 'edit')).x).toBeCloseTo(rowBox.x + pos * rowBox.width, -1);
  await page.reload();
  await expect(group(page, 'edit')).toBeVisible();
  const after = (await page.getByTestId('dock-row-bottom').boundingBox())!;
  await expect.poll(async () => (await box(page, 'edit')).x).toBeCloseTo(after.x + pos * after.width, -1);
  expect(w).toBeGreaterThan(0);
});

test('Klavyeyle sıra değişir: ← sola alır, ↓ ↑ satır değiştirir', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  expect((await stored(page)).bottom).toEqual(['view', 'indicators', 'edit', 'window']);
  await handle(page, 'edit').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await stored(page)).bottom).toEqual(['view', 'edit', 'indicators', 'window']);
  await expect(handle(page, 'edit')).toBeFocused();
  // Sekme sırası görünen sırayla aynı: DOM'da düzen paketi göstergelerden önce
  const order = await page.getByTestId('dock-row-bottom').locator('[data-dock-pkg]').evaluateAll(els => els.map(e => e.getAttribute('data-dock-pkg')));
  expect(order).toEqual(['view', 'edit', 'indicators', 'window']);
  // Setup/Frei'de de Satır 2 vardır (S4): ↑ önce Satır 2'ye, sonra Satır 1'e çıkar
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await stored(page)).row2).toContain('edit');
  await expect(page.getByTestId('dock-row-row2').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await stored(page)).row1).toContain('edit');
  await expect(page.getByTestId('dock-row-row1').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await expect(handle(page, 'edit')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('dock-row-bottom').locator('[data-dock-pkg="edit"]')).toBeVisible();
});

test('Tutamaç menüsü: Boşluğu kapat, Sola al, Sağa al ve Yerleşimi sıfırla', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'view').click();
  await expect(page.getByTestId('dock-left')).toBeDisabled();
  await expect(page.getByTestId('dock-pack')).toBeDisabled();
  await page.getByTestId('dock-right').click();
  await expect.poll(async () => (await stored(page)).bottom[0]).toBe('indicators');
  await handle(page, 'view').click();
  await expect(page.getByTestId('dock-reset')).toBeEnabled();
  await page.getByTestId('dock-reset').click();
  await expect.poll(async () => (await stored(page)).bottom).toEqual(['view', 'indicators', 'edit', 'window']);
  await expect(page.getByText(msg('cw.tbHandle'), { exact: true })).toHaveCount(0);
});

// R2-05: serbest paket alt çubuğun üstüne binmez (alt sınır = çubuğun üstü)
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
for (const width of [1100, 375]) {
  test(`Serbest paket alt çubuğa binmez (${width} px)`, { tag: '@UI-17' }, async ({ page, worker }) => {
    void worker;
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(([key]) => {
      const raw = JSON.parse(localStorage.getItem(key) || '{"version":1}');
      localStorage.setItem(key, JSON.stringify({ ...raw, version: 1, dockLayout: { row1: ['account'], row2: [], bottom: ['view', 'indicators', 'edit'], free: { window: { x: 0.05, y: 1 } }, pos: {} } }));
    }, [storageKey] as const);
    await open(page);
    const card = (await page.getByTestId('workspace-toolbar').boundingBox())!;
    const win = await box(page, 'window');
    // Serbest paket (geniş pencerede) çubuğun üstünde ya da çubuğun içinde (telefonda düzen sabit); iki paket kutusu hiçbir yerde örtüşmez
    for (const id of ['view', 'indicators', 'edit']) expect(overlap(win, await box(page, id)), `${id} ↔ window`).toBe(0);
    if (width > 480) expect(win.y + win.height).toBeLessThanOrEqual(card.y + 0.5);
  });
}

test('Klavyeyle ↓ ile serbest paket en alta indirilince alt çubuğa binmez', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1100, height: 800 });
  await open(page);
  await handle(page, 'window').click();
  await page.getByTestId('dock-move-free').click();
  await expect(group(page, 'window')).toHaveAttribute('data-zone', 'free');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowDown');
  const card = (await page.getByTestId('workspace-toolbar').boundingBox())!, win = await box(page, 'window');
  expect(win.y + win.height).toBeLessThanOrEqual(card.y + 0.5);
  for (const id of ['view', 'indicators', 'edit']) expect(overlap(win, await box(page, id)), `${id} ↔ window`).toBe(0);
});
