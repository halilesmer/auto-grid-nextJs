import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';

// Serbest paket yerleşimi, S3: Formation modunda Satır 2, zaman dilimleri ve formasyonlar paket (UI-17, plan 1106-A1, journal 2026-11-06-free-package-layout)
const URL = `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(({ page }) => seedFixtureTrend(page, fixtureTrend('gar-buy-h4-01')));

const pkg = (page: Page, id: string) => page.locator(`[data-dock-pkg="${id}"]`);
const handle = (page: Page, id: string) => page.getByTestId(`dock-handle-${id}`);
const row = (page: Page, zone: 'row1' | 'row2' | 'bottom') => page.getByTestId(`dock-row-${zone}`);
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').dockLayout ?? null, storageKey);
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('formation-toolbar')).toBeVisible();
  await expect(pkg(page, 'formations')).toBeVisible();
}
async function dragTo(page: Page, id: string, testId: string) {
  const start = (await handle(page, id).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 10, { steps: 5 });
  const b = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('Varsayılan: zaman dilimleri ve formasyonlar Satır 2\'de, Satır 1 = mod, ürün, hesap, aksiyonlar', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await expect(row(page, 'row2').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
  await expect(row(page, 'row2').locator('[data-dock-pkg="formations"]')).toBeVisible();
  // Satır 1'in görünen sırası tam bu dört öğe (hesap paket değil, sabit çapa)
  expect(await row(page, 'row1').locator('> [data-dock-wrap]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.dockWrap))).toEqual(['mode', 'symbol', 'account', 'actions']);
  await expect(pkg(page, 'timeframes')).toHaveAttribute('aria-label', msg('cw.tbGroup.timeframes'));
});

test('Formasyonları Satır 1\'e sürükle, yeniden yükle: yer korunur', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await dragTo(page, 'formations', 'dock-row-row1');
  await expect(row(page, 'row1').locator('[data-dock-pkg="formations"]')).toBeVisible();
  await expect.poll(async () => (await stored(page))?.row1).toContain('formations');
  await page.reload();
  await expect(row(page, 'row1').locator('[data-dock-pkg="formations"]')).toBeVisible();
  await expect(row(page, 'row2').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
});

test('Dar pencerede sığmayan formasyonlar ok menüsünde; seçili olan satırda kalır, menüden seçim değişir', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 520, height: 800 });
  await open(page);
  const more = pkg(page, 'formations').getByTestId('dock-more');
  await expect(more).toBeVisible();
  // Seçili formasyon (GAR) satırda görünür
  const selected = pkg(page, 'formations').locator('[aria-pressed="true"]').first();
  await expect(selected).toBeVisible();
  await more.click();
  const menu = page.getByTestId('dock-more-menu');
  await expect(menu).toBeVisible();
  const first = menu.locator('button:visible').first();
  await first.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  const id = await first.getAttribute('data-testid');
  await first.click();
  await expect(page.getByTestId(id!).first()).toHaveAttribute('aria-pressed', 'true');
});

test('Zaman dilimleri paketini alt çubuğa taşı: oradan seçim grafiği değiştirir', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'timeframes').click();
  await page.getByTestId('dock-move-bottom').click();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
  const h1 = row(page, 'bottom').getByTestId('formation-tf-H1');
  await h1.click();
  await expect(h1).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/tf=H1/);
});

test('Bir araç grubunu Satır 2\'ye taşı (menü ve ↑/↓), yeniden yükle: yer korunur', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'edit').click();
  await page.getByTestId('dock-move-row2').click();
  await expect(row(page, 'row2').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await expect.poll(async () => (await stored(page))?.row2).toContain('edit');
  await page.reload();
  await expect(row(page, 'row2').locator('[data-dock-pkg="edit"]')).toBeVisible();
  // ↑ Satır 1'e, ↓ Satır 2'ye, ↓ alt çubuğa
  await handle(page, 'edit').focus();
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'row1').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'row2').locator('[data-dock-pkg="edit"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'bottom').locator('[data-dock-pkg="edit"]')).toBeVisible();
});

test('Frei modunda da Satır 2 var: oradaki paket Frei\'de de Satır 2\'de görünür, kayıt kalır', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'edit').click();
  await page.getByTestId('dock-move-row2').click();
  await expect.poll(async () => (await stored(page))?.row2).toContain('edit');
  await page.goto(`/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
  await expect(row(page, 'row2').locator('[data-dock-pkg="edit"]')).toBeVisible();
  expect((await stored(page)).row2).toContain('edit');
});
