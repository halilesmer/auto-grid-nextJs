import type { Page } from '@playwright/test';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

// Serbest paket yerleşimi, S4: mod, ürün ve aksiyon paketleri, hesap çapası, Setup/Frei (UI-17, plan 1106-A1 ve karar 1106-A4.1)
const FORMATION = `/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const SETUP = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const STATS = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tab=stats`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(({ page, worker }) => {
  worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
  return seedFixtureTrend(page, fixtureTrend('gar-buy-h4-01'));
});

const pkg = (page: Page, id: string) => page.locator(`[data-dock-pkg="${id}"]`);
const handle = (page: Page, id: string) => page.getByTestId(`dock-handle-${id}`);
const row = (page: Page, zone: 'row1' | 'row2' | 'bottom') => page.getByTestId(`dock-row-${zone}`);
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').dockLayout ?? null, storageKey);
const wrapOrder = (page: Page, zone: 'row1' | 'row2') => row(page, zone).locator('> [data-dock-wrap]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.dockWrap));
async function go(page: Page, url: string) {
  await page.goto(url);
  await expect(row(page, 'row1')).toBeVisible();
  await expect(pkg(page, 'mode')).toBeVisible();
}
const noScroll = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
/** Satır 1 tek satır: bütün paket kutularının dikey merkezi aynı çizgide (iki satıra kırılsa merkezler ayrılırdı) ve satır en çok bir yüksek kontrol kadar yüksek */
const singleLine = async (page: Page) => {
  const centers = await row(page, 'row1').locator('> [data-dock-wrap]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
  expect(centers.length).toBeGreaterThan(2);
  expect(Math.max(...centers) - Math.min(...centers), 'Satır 1 merkezleri').toBeLessThanOrEqual(4);
  expect(await row(page, 'row1').evaluate(e => e.getBoundingClientRect().height)).toBeLessThan(52);
};

test('(a) Mod paketini Satır 1\'de aksiyonların sağına sürükle, yeniden yükle: yer korunur', { tag: '@UI-17' }, async ({ page }) => {
  await go(page, FORMATION);
  expect(await wrapOrder(page, 'row1')).toEqual(['mode', 'symbol', 'account', 'actions']);
  const start = (await handle(page, 'mode').boundingBox())!;
  const r1 = (await row(page, 'row1').boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 4, { steps: 5 });
  await page.mouse.move(r1.x + r1.width - 6, r1.y + r1.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await stored(page))?.row1).toEqual(['symbol', 'account', 'actions', 'mode']);
  expect(await wrapOrder(page, 'row1')).toEqual(['symbol', 'account', 'actions', 'mode']);
  await page.reload();
  await expect(pkg(page, 'mode')).toBeVisible();
  // Yeniden yüklemeden sonra kutular önce eklenme sırasıyla durur; yerleştirme bir kare sonra sıralar (aynı kesin sıra, yalnız bekleyerek)
  await expect.poll(() => wrapOrder(page, 'row1')).toEqual(['symbol', 'account', 'actions', 'mode']);
});

for (const [name, url] of [['Formation', FORMATION], ['Setup', SETUP], ['Frei', FREE]] as const) {
  test(`(b) ${name}: hesap çapasında tutamaç ve menü yok, 720 px'te görünür; Satır 1 tek satır`, { tag: '@UI-17' }, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 800 });
    await go(page, url);
    const anchor = page.getByTestId('dock-account');
    await expect(anchor).toBeVisible();
    await expect(page.getByTestId('dock-handle-account')).toHaveCount(0);
    await expect(row(page, 'row1').getByRole('combobox', { name: msg('account.select.aria') })).toBeVisible();
    expect(await wrapOrder(page, 'row1')).toContain('account');
    await singleLine(page);
    await noScroll(page, 720);
    // Hesap ok menüsüne girmez: ok menüsü bulunan hiçbir paket hesabı barındırmaz
    for (const more of await page.getByTestId('dock-more').all()) {
      if (!(await more.isVisible())) continue;
      await more.click();
      await expect(page.getByTestId('dock-more-menu').getByRole('combobox', { name: msg('account.select.aria') })).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  });
}

test('(c) Dar pencerede aksiyonlar ok menüsünde; menüdeki düğme ipucu taşır ve çalışır', { tag: '@UI-17' }, async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 800 });
  await go(page, FORMATION);
  await expect(pkg(page, 'actions')).toBeVisible();
  const more = pkg(page, 'actions').getByTestId('dock-more');
  await expect(more).toBeVisible();
  await singleLine(page);
  await noScroll(page, 520);
  await more.click();
  const menu = page.getByTestId('dock-more-menu');
  await expect(menu).toBeVisible();
  const first = menu.locator('button:visible').first();
  await first.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await first.click();
  // Tıklama ya menüyü kapatır ya da düğmenin kendi paneli açılır
  await expect.poll(async () => (await menu.count()) === 0 || (await first.getAttribute('aria-expanded')) === 'true').toBe(true);
});

test('(d) Setup: zaman dilimleri Formation\'daki yerinde TimeframeSelect olarak; formasyonlar yok; Formation\'a dönünce yerleşim aynı', { tag: '@UI-17' }, async ({ page }) => {
  await go(page, FORMATION);
  await expect(row(page, 'row2').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
  // Zaman dilimlerini alt çubuğa taşı; Setup'ta da orada durur
  await handle(page, 'timeframes').click();
  await page.getByTestId('dock-move-bottom').click();
  await expect.poll(async () => (await stored(page))?.bottom).toContain('timeframes');
  const formationStored = await stored(page);
  await go(page, SETUP);
  await expect(row(page, 'bottom').locator('[data-dock-pkg="timeframes"]').getByTestId('timeframe-select')).toBeVisible();
  await expect(pkg(page, 'formations')).toHaveCount(0);
  expect(await stored(page)).toEqual(formationStored);
  await go(page, FORMATION);
  await expect(row(page, 'bottom').locator('[data-dock-pkg="timeframes"]')).toBeVisible();
  expect(await stored(page)).toEqual(formationStored);
  // Varsayılan Setup: zaman dilimleri Satır 2'de (Formation'daki yer)
  await page.evaluate(key => localStorage.removeItem(key), storageKey);
  await go(page, SETUP);
  await expect(row(page, 'row2').locator('[data-dock-pkg="timeframes"]').getByTestId('timeframe-select')).toBeVisible();
  expect(await wrapOrder(page, 'row1')).toEqual(['mode', 'symbol', 'account', 'actions']);
});

test('(e) Ürün paketi: Frei\'de sembol seçimi, Setup\'ta setup seçimi', { tag: '@UI-17' }, async ({ page }) => {
  await go(page, FREE);
  await expect(pkg(page, 'symbol').getByTestId('chart-symbol')).toBeVisible();
  await expect(pkg(page, 'symbol').getByTestId('zone-select')).toHaveCount(0);
  await go(page, SETUP);
  await expect(pkg(page, 'symbol').getByTestId('zone-select')).toBeVisible();
  await expect(pkg(page, 'symbol').getByTestId('chart-symbol')).toHaveCount(0);
});

for (const [name, url] of [['Setup', SETUP], ['Frei', FREE]] as const) {
  test(`(f) ${name} 720 px: aksiyonlar paketi Zeitraum ve Chart/Statistik taşır, Satır 1 tek satır`, { tag: '@UI-17' }, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 800 });
    await go(page, url);
    const actions = pkg(page, 'actions');
    await expect(actions).toBeVisible();
    await expect(actions.getByTestId('range-trigger')).toBeVisible();
    await expect(row(page, 'row2')).toBeVisible();
    await singleLine(page);
    await noScroll(page, 720);
    // A4.10: Chart/Statistik ya satırda ya paketin ok menüsünde; ok görünür, Statistik'e menüden ulaşılır
    await expect(actions.getByTestId('dock-more')).toBeVisible();
    const stats = actions.getByRole('tab', { name: msg('analysis.tab.stats') });
    if (await stats.isVisible()) await stats.click();
    else {
      await actions.getByTestId('dock-more').click();
      await page.getByTestId('dock-more-menu').getByRole('tab', { name: msg('analysis.tab.stats') }).click();
    }
    await expect(page).toHaveURL(/tab=stats/);
  });
}

test('(g) Statistik görünümünde Chart\'a dönüş düğmesi görünür kalır', { tag: '@UI-17' }, async ({ page }) => {
  await page.goto(STATS);
  const back = page.getByTestId('chart-topbar').getByRole('tab', { name: msg('analysis.tab.chart') });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).not.toHaveURL(/tab=stats/);
});

test('Varsayılan Satır 1 sırası: tam olarak mod, ürün, hesap, aksiyonlar', { tag: '@UI-17' }, async ({ page }) => {
  for (const url of [FORMATION, SETUP, FREE]) {
    await go(page, url);
    expect(await wrapOrder(page, 'row1')).toEqual(['mode', 'symbol', 'account', 'actions']);
  }
});

for (const width of [1176, 1304, 1520, 1820]) {
  test(`Başlık–grafik çakışması ${width} px: Formation, Setup, Frei`, { tag: '@UI-17' }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const url of [FORMATION, SETUP, FREE]) {
      await go(page, url);
      const gap = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="formation-toolbar"], [data-testid="chart-topbar"]')!.getBoundingClientRect().bottom;
        const main = document.querySelector<HTMLElement>('[data-testid="formation-main"]')!;
        const top = parseFloat(getComputedStyle(main).getPropertyValue('--chart-top')) + main.getBoundingClientRect().top;
        return { bar, top };
      });
      // Grafik üst payı başlığın altında: çakışma 0
      expect(Math.abs(gap.top - gap.bar), url).toBeLessThanOrEqual(1);
    }
  });
}

// Plan 1106-A4.3: Satır 1 kırılmaz ve hiçbir paketin içi kırılmaz. 720 px'teki yükseklikler 1440 px'tekilere tam eşit (aralık değil).
for (const [name, url] of [['Formation', FORMATION], ['Setup', SETUP], ['Frei', FREE]] as const) {
  test(`(h) ${name}: Satır 1 ve her paket kutusu 720 px'te 1440 px'tekiyle aynı yükseklikte`, { tag: '@UI-17' }, async ({ page }) => {
    const heights = () => row(page, 'row1').evaluate(r => ({ row: r.getBoundingClientRect().height, wraps: Object.fromEntries([...r.querySelectorAll(':scope > [data-dock-wrap]')].map(w => [(w as HTMLElement).dataset.dockWrap!, w.getBoundingClientRect().height])) }));
    await go(page, url);
    const wide = await heights();
    await page.setViewportSize({ width: 720, height: 800 });
    await expect(pkg(page, 'mode')).toBeVisible();
    await expect.poll(async () => (await heights()).row).toBe(wide.row);
    const narrow = await heights();
    console.log(`UI17-HEIGHTS ${name} 1440=${wide.row} 720=${narrow.row} wraps1440=${JSON.stringify(wide.wraps)} wraps720=${JSON.stringify(narrow.wraps)}`);
    // A4.4: kutu yalnız kısalabilir (plan 1106-A4.4) (uzun düğmeler menüye girince); iç kırılma kutuyu uzatırdı
    for (const id of Object.keys(wide.wraps)) expect(narrow.wraps[id], `paket kutusu ${id}`).toBeLessThanOrEqual(wide.wraps[id]);
  });
}

// Plan 1106-A4.10: hiçbir paket kutusu Satır 1'in dışına taşmaz (belge kaydırması ve merkez hizası bunu yakalamaz)
for (const [w, h] of [[720, 800], [812, 375], [1024, 800], [1176, 800]] as const) {
  test(`Satır 1 ${w} × ${h}: her paket kutusu satırın içinde (Formation, Setup, Frei)`, { tag: '@UI-17' }, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const url of [FORMATION, SETUP, FREE]) {
      await go(page, url);
      const out = await row(page, 'row1').evaluate(r => {
        const b = r.getBoundingClientRect();
        return [...r.querySelectorAll(':scope > [data-dock-wrap]')].map(e => { const x = e.getBoundingClientRect(); return { id: (e as HTMLElement).dataset.dockWrap, left: x.left - b.left, right: b.right - x.right }; })
          .filter(x => x.left < -0.5 || x.right < -0.5);
      });
      expect(out, `${url} ${w}`).toEqual([]);
    }
  });
}

test('Setup 1176 px: Mod paketi tam görünür (üç düğme)', { tag: '@UI-17' }, async ({ page }) => {
  await page.setViewportSize({ width: 1176, height: 800 });
  await go(page, SETUP);
  for (const m of ['formation', 'setup', 'free']) await expect(page.getByTestId(`chart-mode-${m}`)).toBeVisible();
});
