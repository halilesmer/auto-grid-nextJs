import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';

// Serbest paket yerleşimi, S3: Satır 2, zaman dilimleri ve formasyonlar paket (UI-17, plan 1106-A1, journal 2026-11-06-free-package-layout). Tek grafik (1107-A21, U4-4a): mod paketi yok
const URL = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });
// Der Mock rechnet seine Kerzen aus der Uhrzeit (Sinuskurve); ohne feste Uhr hängt die Zahl der Formations-Kandidaten von der Tageszeit ab (UI-17 fiel ab 21:00 UTC)
test.use({ fakeNow: '2026-11-12T16:21:00Z' });
test.beforeEach(({ page }) => seedFixtureTrend(page, fixtureTrend('gar-buy-h4-01')));

const pkg = (page: Page, id: string) => page.locator(`[data-dock-pkg="${id}"]`);
const handle = (page: Page, id: string) => page.getByTestId(`dock-handle-${id}`);
const row = (page: Page, zone: 'row1' | 'row2' | 'bottom') => page.getByTestId(`dock-row-${zone}`);
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').dockLayout ?? null, storageKey);
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('chart-topbar')).toBeVisible();
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

test('Varsayılan: zaman dilimleri ve formasyonlar Satır 2\'de, Satır 1 = ürün, hesap, aksiyonlar (mod yok)', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await expect(row(page, 'row2').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
  await expect(row(page, 'row2').locator('[data-dock-pkg="formations"]')).toBeVisible();
  // Satır 1'in görünen sırası tam bu üç öğe (hesap paket değil, sabit çapa)
  expect(await row(page, 'row1').locator('> [data-dock-wrap]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.dockWrap))).toEqual(['symbol', 'account', 'actions']);
  await expect(pkg(page, 'mode')).toHaveCount(0);
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
  // 520 px'te Satır 2 taşar: 9 zaman dilimi 367 px tutar, formasyonlar paketinin oku şerit altında kalır; 560 px
  await page.setViewportSize({ width: 560, height: 800 });
  await open(page);
  // Die Formations-Knöpfe (nur Formen mit Treffer) und damit der Pfeil kommen erst mit dem Ende der Suche. Die kalte Suche über die Mock-Kerzen
  // (D1, H4, H1, M15) dauert im Node-Lauf rund 10 s; unter Last (3 Worker) lag sie über den 7 s der Erwartung (1123-A15, gemessen: nach dem Ende
  // der Suche ist der Pfeil bei 480–600 px da)
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/, { timeout: 30_000 });
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

test('Satır 2 içeriği, satırın dolgusunu (içerik kutusunu) aşmaz; sığmayan düğme ok menüsüne geçer', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  // Sığdırma satırın dolgu dahil genişliğiyle karşılaştırırsa, son paket sağ dolguya (px-2 = 8 px) taşar; ölçü içerik kutusudur
  await page.setViewportSize({ width: 640, height: 800 });
  await open(page);
  const overflow = () => page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('[data-testid="dock-row-row2"]')!, cs = getComputedStyle(r);
    const content = r.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const kids = [...r.children].filter(c => (c as HTMLElement).matches('.dock-wrap:not(.dock-src)'));
    return Math.max(...kids.map(k => k.getBoundingClientRect().right)) - content;
  });
  for (let w = 640; w >= 560; w -= 4) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    await expect.poll(overflow, { message: `genişlik ${w}`, timeout: 3000 }).toBeLessThanOrEqual(0.5);
  }
});

test('Satır 2\'de sağa dayalı paket satırın içerik kutusunda biter (dolguya taşmaz)', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await page.evaluate(key => { const j = JSON.parse(localStorage.getItem(key) || '{}'); j.dockLayout = { ...(j.dockLayout ?? {}), pos: { formations: 1 } }; localStorage.setItem(key, JSON.stringify(j)); }, storageKey);
  await page.reload();
  await expect(pkg(page, 'formations')).toBeVisible();
  const gap = () => page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('[data-testid="dock-row-row2"]')!, cs = getComputedStyle(r);
    const content = r.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return document.querySelector('[data-dock-pkg="formations"]')!.closest('.dock-wrap')!.getBoundingClientRect().right - content;
  });
  // Paket, formasyon araması bitince genişler (yalnız tutamaç → düğmeler, ~29 → ~392 px); boşluk yeniden hesaplanır ve margin-left
  // 0,22 s'lik geçişle oturur. Geçiş sırasında sağ kenar bir an içerik kutusunun ~400 px dışındadır. Sabit 800 ms bekleme bu ana denk
  // gelince test düştü (journal 2026-11-16-dock-row2-gap-after-axis-defer): aramanın bitişini bekle (düğmelerle aynı çizimde gelir,
  // hangi formasyonun aday olduğundan bağımsız), sonra oturmasını yokla. Alt sınır: son hâlde paket sağa dayalıdır, solda kalmaz
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/, { timeout: 20_000 });
  await expect.poll(gap, { timeout: 5_000 }).toBeLessThanOrEqual(0.5);
  expect(await gap()).toBeGreaterThanOrEqual(-1);
});

test('Zaman dilimleri paketini alt çubuğa taşı: oradan seçim grafiği değiştirir', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'timeframes').click();
  await page.getByTestId('dock-move-bottom').click();
  await expect(row(page, 'bottom').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
  const h1 = row(page, 'bottom').getByTestId('timeframe-H1');
  await h1.click();
  await expect(h1).toHaveAttribute('aria-checked', 'true');
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

test('Satır 2 her bağlantıda var: oradaki paket symbol= bağlantısında da Satır 2\'de görünür, kayıt kalır', { tag: '@UI-17' }, async ({ page, worker }) => {
  void worker;
  await open(page);
  await handle(page, 'edit').click();
  await page.getByTestId('dock-move-row2').click();
  await expect.poll(async () => (await stored(page))?.row2).toContain('edit');
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`);
  await expect(row(page, 'row2').locator('[data-dock-pkg="edit"]')).toBeVisible();
  expect((await stored(page)).row2).toContain('edit');
});
