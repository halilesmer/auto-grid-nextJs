import type { CDPSession, Page } from '@playwright/test';
import { groupZones, makeZone } from '../fixtures/data';
import { msg } from '../fixtures/i18n';
import { fixtureTrend, seedFixtureTrend } from '../fixtures/formation-trend';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

// Serbest paket yerleşimi, S5: telefon (dikey, 30rem altı) ve yatay telefon (UI-17, plan 1106-A1.5; telefon testleri UI-08). Tek grafik (1107-A21, U4-4a):
// mod paketi/anahtarı yok; üç adres (form=, zone=, symbol=) aynı sayfayı açar, testler eski bağlantıların hepsinde çalışır.
const FORMATION = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&form=GAR`;
const SETUP = `/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const MODES = [['Formation', FORMATION], ['Setup', SETUP], ['Frei', FREE]] as const;
const storageKey = 'grid-robot-chart-workspaces-v1';
const BOTH = ['@UI-17', '@UI-08'];
test.setTimeout(90_000);
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
const DEFAULT_LAYOUT = { row1: ['mode', 'symbol', 'account', 'actions'], row2: ['timeframes', 'formations'], bottom: ['view', 'indicators', 'edit', 'window'], free: {}, pos: {} };
const handles = (page: Page) => page.locator('[data-dock-handle]').count();
async function go(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId('chart-topbar')).toBeVisible();
}
const scrollW = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);
/** Paket düzeni: tutamaçlar var; telefon düzeni: tutamaç ve ok menüsü yok */
const expectPackages = async (page: Page, why: string) => { await expect(row(page, 'row1'), why).toBeVisible(); expect(await handles(page), why).toBeGreaterThan(0); };
const expectPhone = async (page: Page, why: string) => {
  await expect(page.getByTestId('chart-topbar'), why).toBeVisible();
  await expect.poll(() => handles(page), { message: why }).toBe(0);
  expect(await page.locator('[data-testid="dock-more"]:visible').count(), why).toBe(0);
};

// --- Telefon (dikey) ↔ geniş geçiş: yerleşim silinmez, depoya varsayılan yazılmaz (plan 1106-A1.5) ---
for (const [w, h] of [[375, 812], [280, 640]] as const) {
  test(`Telefon ↔ geniş ${w} px: kayıtlı yerleşim korunur, telefonda depoya yazılmaz, geri büyütünce geri gelir`, { tag: BOTH }, async ({ page, worker }) => {
    await go(page, FORMATION);
    // Özel yerleşim: Ürün paketi Satır 1'in sağ ucuna, Görünüm paketi grafiğe
    await handle(page, 'view').click();
    await page.getByTestId('dock-move-free').click();
    const start = (await handle(page, 'symbol').boundingBox())!, r1 = (await row(page, 'row1').boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y + 4, { steps: 5 });
    await page.mouse.move(r1.x + r1.width - 6, r1.y + r1.height / 2, { steps: 10 });
    await page.mouse.up();
    // Kayıtlı listede çizilmeyen 'mode' (U4-5'e kadar) başta durur
    await expect.poll(async () => (await stored(page))?.row1).toEqual(['mode', 'account', 'actions', 'symbol']);
    const custom = await stored(page);
    expect(Object.keys(custom.free)).toEqual(['view']);
    const raw = await page.evaluate(key => localStorage.getItem(key), storageKey);
    const writes: string[] = [];
    page.on('request', r => { if (r.method() !== 'GET' && r.method() !== 'OPTIONS') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    const workerBefore = JSON.stringify(worker.state.uiState);

    await page.setViewportSize({ width: w, height: h });
    await expectPhone(page, `${w} px: sabit telefon düzeni`);
    await page.waitForTimeout(600);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey), 'telefonda depo değişmedi').toBe(raw);
    expect(JSON.stringify(worker.state.uiState), 'telefonda worker ui_state değişmedi').toBe(workerBefore);
    expect(writes, 'telefonda worker\'a yazma isteği yok').toEqual([]);
    expect(await scrollW(page)).toBeLessThanOrEqual(w);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expectPackages(page, '1440 px geri');
    await expect.poll(() => wrapOrder(page, 'row1')).toEqual(['account', 'actions', 'symbol']);
    await expect(pkg(page, 'view')).toHaveAttribute('data-zone', 'free');
    expect(await stored(page)).toEqual(custom);
  });
}

// --- Döndürme: 375×812 → 812×375 → 375×812, yeniden yüklemeden ---
test('Döndürme 375×812 → 812×375 → 375×812: düzen değişir, açık tutamaç menüsü kapanır, yatay kaydırma yok', { tag: BOTH }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await go(page, FORMATION);
  await expectPhone(page, 'dikey');
  expect(await scrollW(page)).toBeLessThanOrEqual(375);
  await page.setViewportSize({ width: 812, height: 375 });
  await expectPackages(page, 'yatay');
  expect(await scrollW(page)).toBeLessThanOrEqual(812);
  await handle(page, 'symbol').click();
  await expect(page.getByTestId('dock-move-row1')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expectPhone(page, 'tekrar dikey');
  await expect(page.getByTestId('dock-move-row1')).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await scrollW(page)).toBeLessThanOrEqual(375);
  await page.setViewportSize({ width: 812, height: 375 });
  await expectPackages(page, 'tekrar yatay');
  expect(await wrapOrder(page, 'row1')).toEqual(['symbol', 'account', 'actions']);
});

// --- Yatay telefon boyutları ---
for (const [w, h] of [[667, 375], [740, 360], [812, 375], [844, 390], [932, 430]] as const) {
  for (const [name, url] of MODES) {
    test(`Yatay ${w} × ${h} ${name}: Satır 1 tek satır, kaydırma yok, başlık en çok 66 px, hesap çapası açık, menüler kesilmez`, { tag: BOTH }, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await go(page, url);
      await expectPackages(page, `${w}`);
      expect(await scrollW(page)).toBeLessThanOrEqual(w);
      const centers = await row(page, 'row1').locator('> [data-dock-wrap]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
      expect(Math.max(...centers) - Math.min(...centers), 'Satır 1 merkezleri').toBeLessThanOrEqual(4);
      const barH = await page.evaluate(() => document.querySelector('[data-testid="chart-topbar"]')!.getBoundingClientRect().height);
      expect(barH, 'başlık').toBeLessThanOrEqual(66);
      const bad = await row(page, 'row1').evaluate(r => {
        const b = r.getBoundingClientRect(), out: string[] = [];
        for (const wrap of r.querySelectorAll<HTMLElement>(':scope > [data-dock-wrap]')) {
          const x = wrap.getBoundingClientRect();
          if (x.left < b.left - 0.5 || x.right > b.right + 0.5) out.push(`${wrap.dataset.dockWrap}: satır dışı sol ${Math.round((x.left - b.left) * 10) / 10} sağ ${Math.round((b.right - x.right) * 10) / 10}`);
          for (const el of wrap.querySelectorAll<HTMLElement>('*')) {
            const c = el.getBoundingClientRect();
            if (c.width === 0 || c.height === 0 || el.closest('[hidden]')) continue;
            if (c.left < x.left - 0.5 || c.right > x.right + 0.5) { out.push(`${wrap.dataset.dockWrap}: ${el.tagName} taşar`); break; }
          }
        }
        return out;
      });
      expect(bad).toEqual([]);
      const covered = await page.getByTestId('dock-account').evaluate(a => {
        const c = a.getBoundingClientRect(), y = c.top + c.height / 2;
        return [c.left + 2, c.right - 2].map(x => { const e = document.elementFromPoint(x, y); return !e || !a.contains(e); });
      });
      expect(covered, 'hesap çapasının [sol, sağ] kenarı örtülü').toEqual([false, false]);
      // Hesap menüsü kesilmeden açılır: listenin alt kenarı üstte durur ve pencerenin içinde kalır
      await page.getByRole('combobox', { name: msg('account.select.aria') }).click();
      const list = page.getByRole('listbox').first();
      await expect(list).toBeVisible();
      const lb = (await list.boundingBox())!;
      expect(lb.y + lb.height, 'hesap listesi pencerenin içinde').toBeLessThanOrEqual(h);
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role=listbox]') !== null, { x: lb.x + lb.width / 2, y: lb.y + lb.height - 4 }), 'hesap listesinin alt kenarı üstte').toBe(true);
      await page.keyboard.press('Escape');
      // 667 px'te Zeitraum, Formasyon eylemleri (data-keep) yüzünden ok menüsüne girer: o zaman menüdeki düğmeden açılır
      let trigger = page.getByTestId('range-trigger').first();
      if (!(await trigger.isVisible())) {
        await pkg(page, 'actions').getByTestId('dock-more').click();
        trigger = page.getByTestId('dock-more-menu').getByTestId('range-trigger');
      }
      await trigger.click();
      // Dış panel (kayan kutu) pencerenin içinde kalır; içerik 490 px yüksekliğinde, panel içinde kayar
      const panel = page.getByTestId('range-panel').locator('xpath=ancestor::*[contains(@class,"z-50")][1]');
      const box = (await panel.boundingBox())!;
      expect(box.height).toBeGreaterThan(100);
      expect(box.y + box.height, `Zeitraum paneli pencerenin içinde (y ${Math.round(box.y)}, yükseklik ${Math.round(box.height)})`).toBeLessThanOrEqual(h);
      const scroll = await panel.evaluate(e => ({ client: e.clientHeight, full: e.scrollHeight, overflowY: getComputedStyle(e).overflowY }));
      expect(scroll.overflowY).toBe('auto');
      expect(scroll.full, 'içerik panelden uzun, içinde kayar').toBeGreaterThan(scroll.client);
      // Panelin en altındaki alana kaydırınca görünür ve pencerenin içinde durur
      const last = page.getByTestId('range-panel').locator('button').last();
      await last.scrollIntoViewIfNeeded();
      const lb2 = (await last.boundingBox())!;
      expect(lb2.y + lb2.height, 'son düğme pencerenin içinde').toBeLessThanOrEqual(h);
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid=range-panel]') !== null, { x: lb2.x + lb2.width / 2, y: lb2.y + lb2.height / 2 }), 'son düğme üstte').toBe(true);
    });
  }
}

// --- Ürün kutusu daralma sırasının son adımıdır (plan 1106-A5.3): bütün paketler en küçükken satır hâlâ taşarsa açığı kadar daralır ---
const productBox = (page: Page) => page.locator('[data-dock-pkg="symbol"] [data-keep]').first();
const boxWidth = async (page: Page) => (await productBox(page).boundingBox())!.width;
const visibleItems = (page: Page, id: string) => page.locator(`[data-dock-pkg="${id}"]`).evaluate(p => {
  const content = p.querySelector<HTMLElement>(':scope > div:last-child')!;
  const items = [...content.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute('data-dock-more') && !c.hidden);
  return { items: items.length, keptVisible: items.every(i => i.hasAttribute('data-keep') || i.querySelector('[data-keep]') !== null), arrow: !(content.querySelector<HTMLElement>('[data-dock-more]')?.hidden ?? true) };
});

test('580 × 375 Formation: Satır 1 taşmaz, Ürün kutusu açığı kadar daralır, çapa 812 px ile aynı genişlikte', { tag: BOTH }, async ({ page }) => {
  const loops: string[] = [];
  page.on('console', m => { if (m.text().includes('ResizeObserver loop')) loops.push(m.text()); });
  page.on('pageerror', e => { if (e.message.includes('ResizeObserver loop')) loops.push(e.message); });
  await page.setViewportSize({ width: 812, height: 375 });
  await go(page, FORMATION);
  const anchor812 = (await page.getByTestId('dock-account').boundingBox())!.width;
  expect(await boxWidth(page)).toBe(176);
  // Seitenleiste şeridi U4-4b'de kalktı (40 px): satır 627 px'te hâlâ sığıyor (kutu 176), Ürün kutusu 580 px'te daralır (eskiden 620)
  await page.setViewportSize({ width: 580, height: 375 });
  await expect.poll(async () => (await boxWidth(page)) < 176).toBe(true);
  const measure = () => row(page, 'row1').evaluate(r => ({ scroll: r.scrollWidth, client: r.clientWidth, row: r.getBoundingClientRect().width, sum: [...r.querySelectorAll(':scope > [data-dock-wrap]')].reduce((s, w) => s + w.getBoundingClientRect().width, 0), n: r.querySelectorAll(':scope > [data-dock-wrap]').length }));
  // Yerleşim yaklaşık bir saniyede oturur (kutu önce 158, sonra 174 px): oturmuş durum ölçülür
  await expect.poll(async () => { const x = await measure(); return x.sum + 2 * (x.n - 1) - x.row; }, { message: 'kutular satırı tam doldurur' }).toBeCloseTo(0, 1);
  const m = await measure();
  expect(m.scroll, 'Satır 1 taşmaz').toBe(m.client);
  const w = await boxWidth(page);
  expect(w).toBeLessThan(176);
  expect(w).toBeGreaterThan(144);
  expect((await page.getByTestId('dock-account').boundingBox())!.width, 'çapa değişmez').toBe(anchor812);
  // En küçük hâlde yalnız data-keep işaretli Formasyon eylemleri satırda kalır; Zeitraum, Chart/Statistik ok menüsünde
  expect(await visibleItems(page, 'actions')).toEqual({ items: 4, keptVisible: true, arrow: true });
  expect(await visibleItems(page, 'symbol')).toEqual({ items: 1, keptVisible: true, arrow: false });
  const covered = await page.getByTestId('dock-account').evaluate(a => {
    const c = a.getBoundingClientRect(), y = c.top + c.height / 2;
    return [c.left + 2, c.right - 2].map(x => { const e = document.elementFromPoint(x, y); return !e || !a.contains(e); });
  });
  expect(covered).toEqual([false, false]);
  // 812 px'e geri: Ürün kutusu 176'ya döner (yeniden yüklemeden)
  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(() => boxWidth(page)).toBe(176);
  expect(loops, 'ResizeObserver loop uyarısı').toEqual([]);
});

for (const [w, h] of [[720, 800], [740, 360], [812, 375], [1024, 800], [1440, 900]] as const) {
  for (const [name, url] of MODES) {
    test(`Ürün kutusu ${w} × ${h} ${name}: tam 176 px, sembol seçici kutuyu doldurur`, { tag: BOTH }, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await go(page, url);
      await expect(productBox(page)).toBeVisible();
      expect(await boxWidth(page)).toBe(176);
      // Her bağlantıda aynı sembol seçicisi var (setup seçimi yok, 1107-A21): seçicinin kabı kutuyu doldurur
      const sel = (await page.getByTestId('formation-symbol').locator('xpath=..').boundingBox())!;
      expect(sel.width).toBeCloseTo(176, 0);
    });
  }
}

// --- 30rem sınırı: kap genişliği 479 px telefon, 480 px paket düzeni ---
for (const [name, url] of MODES) {
  test(`30rem sınırı ${name}: kap 479 px sabit telefon düzeni, 480 px paket düzeni (yatay yükseklik)`, { tag: BOTH }, async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 375 });
    await go(page, url);
    const pad = await page.evaluate(() => innerWidth - document.querySelector('[data-testid="formation-main"]')!.getBoundingClientRect().width);
    const container = () => page.evaluate(() => document.querySelector('[data-testid="formation-main"]')!.getBoundingClientRect().width);
    await page.setViewportSize({ width: Math.round(479 + pad), height: 375 });
    await expect.poll(container).toBe(479);
    await expectPhone(page, '479');
    expect(await scrollW(page)).toBeLessThanOrEqual(479 + pad);
    await page.setViewportSize({ width: Math.round(480 + pad), height: 375 });
    await expect.poll(container).toBe(480);
    await expectPackages(page, '480');
    expect(await scrollW(page)).toBeLessThanOrEqual(480 + pad);
  });
}

// --- Dokunmatik: CDP Input.dispatchTouchEvent (fare olayları değil) ---
test.describe('dokunmatik', () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });
  type Pt = { x: number; y: number };
  const touch = async (cdp: CDPSession, points: Pt[]) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const center = async (page: Page, id: string) => { const b = (await handle(page, id).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const line = (a: Pt, b: Pt, n: number): Pt[] => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));

  test('(a) tutamağa dokun: menü açılır, sürükleme başlamaz', { tag: BOTH }, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await go(page, FORMATION);
    const c = await center(page, 'symbol');
    await touch(cdp, [c]);
    await expect(page.getByTestId('dock-move-row2')).toBeVisible();
    await expect(page.locator('.dock-ghost')).toHaveCount(0);
    expect(await wrapOrder(page, 'row1')).toEqual(['symbol', 'account', 'actions']);
    expect(await stored(page)).toEqual(DEFAULT_LAYOUT);
  });

  test('(b) 10 px altında kayma: sürükleme başlamaz, düzen aynı', { tag: BOTH }, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await go(page, FORMATION);
    const c = await center(page, 'symbol');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + 6, y: c.y + 5 }] });
    await expect(page.locator('.dock-ghost')).toHaveCount(0);
    await expect(page.locator('[data-dock-wrap].dock-src')).toHaveCount(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.dock-ghost')).toHaveCount(0);
    expect(await wrapOrder(page, 'row1')).toEqual(['symbol', 'account', 'actions']);
    expect(await stored(page)).toEqual(DEFAULT_LAYOUT);
  });

  test('(c) tutamaçla sürükle: paket yeni yerine geçer, yeniden yüklemeden sonra korunur', { tag: BOTH }, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await go(page, FORMATION);
    const from = await center(page, 'view'), r1 = (await row(page, 'row1').boundingBox())!;
    await touch(cdp, line(from, { x: r1.x + r1.width - 6, y: r1.y + r1.height / 2 }, 14));
    await expect.poll(async () => (await stored(page))?.row1).toEqual(['mode', 'symbol', 'account', 'actions', 'view']);
    await page.reload();
    await expect(page.getByTestId('chart-topbar')).toBeVisible();
    await expect.poll(() => wrapOrder(page, 'row1')).toEqual(['symbol', 'account', 'actions', 'view']);
  });

  test('(d) sürüklerken sayfa kaymaz, grafik kaydırma ya da yakınlaştırma almaz', { tag: BOTH }, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await go(page, FORMATION);
    // Grafik yüzeyi dokunma ve işaretçi olaylarını sayar; sürükleme sırasında hiçbiri gelmemeli
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] };
      w.__seen = [];
      const host = document.querySelector('[data-testid="formation-main"]')!;
      for (const t of ['touchstart', 'touchmove', 'pointerdown', 'pointermove', 'wheel']) host.addEventListener(t, e => { if (!(e.target as HTMLElement).closest('[data-dock-handle], .dock-ghost')) w.__seen.push(`${t}:${(e.target as HTMLElement).tagName}`); }, true);
    });
    const touchAction = await handle(page, 'view').evaluate(e => getComputedStyle(e).touchAction);
    expect(touchAction).toBe('none');
    const from = await center(page, 'view'), c = (await page.locator('canvas').first().boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (const p of line(from, { x: c.x + c.width / 2, y: c.y + c.height / 2 }, 12).slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await expect(page.locator('.dock-ghost')).toHaveCount(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate(() => ({ seen: (window as unknown as { __seen: string[] }).__seen, x: scrollX, y: scrollY, scale: visualViewport?.scale }));
    expect(after.seen).toEqual([]);
    expect([after.x, after.y, after.scale]).toEqual([0, 0, 1]);
  });

  // A5.4.1: dokunma dikdörtgeni başka paketin etkileşimli öğesine binmez; kendi paketinin ilk öğesine binişi ölçülen değerde durur
  for (const [w, h] of [[667, 375], [740, 360], [812, 375]] as const) {
    for (const [name, url] of MODES) {
      test(`(f) ${w} × ${h} ${name}: tutamak dokunma dikdörtgeni başka paketin etkileşimli öğesine binmez`, { tag: BOTH }, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await go(page, url);
        const r = await page.evaluate(() => {
          const sel = 'button, [role=tab], input, [role=combobox], a[href]';
          const all = [...document.querySelectorAll<HTMLElement>(sel)].filter(e => e.getClientRects().length > 0 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden');
          const other: string[] = [], own: Record<string, number> = {}, sizes = new Set<string>();
          let clear = Infinity;
          for (const hd of document.querySelectorAll<HTMLElement>('[data-dock-handle]')) {
            const id = hd.dataset.dockHandle!, b = hd.getBoundingClientRect(), cs = getComputedStyle(hd, '::before');
            const x0 = b.left + parseFloat(cs.left), x1 = x0 + parseFloat(cs.width), y0 = b.top + parseFloat(cs.top), y1 = y0 + parseFloat(cs.height);
            sizes.add(`${parseFloat(cs.width)}×${parseFloat(cs.height)}`);
            const pkgEl = hd.closest('[data-dock-pkg]');
            for (const e of all) {
              if (e === hd) continue;
              const c = e.getBoundingClientRect();
              const vertical = Math.min(y1, c.bottom) - Math.max(y0, c.top) > 0.01;
              if (vertical && c.right <= x0 + 0.01 && !pkgEl?.contains(e)) clear = Math.min(clear, x0 - c.right);
              const hit = Math.min(x1, c.right) - Math.max(x0, c.left) > 0.01 && vertical;
              if (!hit) continue;
              if (pkgEl?.contains(e)) own[id] = Math.max(own[id] ?? 0, Math.round((x1 - c.left) * 100) / 100);
              else other.push(`${id} ↔ ${e.getAttribute('data-testid') ?? e.getAttribute('aria-label') ?? e.tagName}`);
            }
          }
          return { other, own, sizes: [...sizes], clear };
        });
        expect(r.sizes, 'dokunma dikdörtgeni boyutu').toEqual(['24×24']);
        expect(r.other, 'başka paketin etkileşimli öğeleriyle kesişenler').toEqual([]);
        expect(r.own, 'kendi paketinin etkileşimli öğesine biniş').toEqual({});
        console.log(`UI17-S5-CLEAR ${name} ${w}x${h} en yakın sol komşuya boşluk ${r.clear} px`);
      });
    }
  }

  test('(e) tutamak dokunma alanı kaba işaretçide en az 24 × 24 px, görünür boyut aynı', { tag: BOTH }, async ({ page }) => {
    await go(page, FORMATION);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'kaba işaretçi').toBe(true);
    for (const id of ['symbol', 'actions', 'view', 'edit']) {
      const h = handle(page, id);
      const visible = (await h.boundingBox())!;
      expect(visible.height, `${id} görünür yükseklik`).toBe(24);
      expect(visible.width, `${id} görünür genişlik`).toBe(16);
      // Dokunma alanı 24 × 24: görünür tutamacın 8 px solundan 16 px sağına (görünür genişlik 16) ve tam yükseklik; dört köşe tutamaca çarpar
      const hit = await h.evaluate(e => {
        const b = e.getBoundingClientRect();
        return [[b.left - 7.5, b.top + 0.5], [b.right - 0.5, b.top + 0.5], [b.left - 7.5, b.bottom - 0.5], [b.right - 0.5, b.bottom - 0.5]].map(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && e.contains(t); });
      });
      expect(hit, `${id} dokunma alanı köşeleri`).toEqual([true, true, true, true]);
    }
  });
});

// --- 1106-A5.16: telefon kipi grafikten bağımsız ve ilk boyamadan önce ölçülür; mumlar yüklenirken de paket düzeni görünmez ---
const RATES = '**/api/market/*/rates*';
const accountCovered = (page: Page) => page.getByRole('combobox', { name: msg('account.select.aria') }).evaluate(a => {
  const c = a.getBoundingClientRect(), y = c.top + c.height / 2;
  return { inside: c.left >= 0 && c.right <= innerWidth, covered: [c.left + 2, c.right - 2].map(x => { const e = document.elementFromPoint(x, y); return !e || !a.contains(e); }) };
});
const expectPhoneStrict = async (page: Page, why: string) => {
  expect(await handles(page), `${why}: tutamaç`).toBe(0);
  expect(await page.locator('[data-testid="dock-more"]:visible').count(), `${why}: ok menüsü`).toBe(0);
  expect(await scrollW(page), `${why}: yatay kaydırma`).toBeLessThanOrEqual(375);
  expect(await accountCovered(page), `${why}: hesap/DEMO çapası pencerede ve örtülmemiş`).toEqual({ inside: true, covered: [false, false] });
};
for (const [name, url] of MODES) {
  for (const mode of ['bekletilir', 'hata'] as const) {
    test(`1106-A5.16 ${name} 375×812: mumlar ${mode}ken telefon düzeni (tutamaç yok), sonra da aynı`, { tag: BOTH }, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      let release: () => void = () => {};
      const gate = new Promise<void>(r => { release = r; });
      await page.route(RATES, async route => {
        if (mode === 'hata') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'MT5 error' }) });
        await gate; return route.fallback();
      });
      await page.addInitScript(() => {
        // İlk boyamadan önce de tutamaç görünmemeli: her karede say
        const w = window as unknown as { __maxHandles: number };
        w.__maxHandles = 0;
        const tick = () => { w.__maxHandles = Math.max(w.__maxHandles, document.querySelectorAll('[data-dock-handle]').length); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await page.goto(url);
      await expect(page.getByTestId('chart-topbar')).toBeVisible();
      await page.waitForTimeout(500);
      await expectPhoneStrict(page, 'grafik yokken');
      if (mode === 'bekletilir') {
        release();
        await expect(page.locator('canvas').first()).toBeVisible();
        await page.waitForTimeout(300);
        await expectPhoneStrict(page, 'grafik gelince');
      }
      expect(await page.evaluate(() => (window as unknown as { __maxHandles: number }).__maxHandles), 'hiçbir karede tutamaç çizilmedi').toBe(0);
    });
  }
}
test('1106-A5.16 Zaman dilimi geçişleri D1 → H1 → H4 375×812: geçişte kip bir an bile geniş olmaz', { tag: BOTH }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await go(page, FORMATION);
  await expectPhoneStrict(page, 'H4');
  await page.evaluate(() => {
    const w = window as unknown as { __max: number };
    w.__max = 0;
    const tick = () => { w.__max = Math.max(w.__max, document.querySelectorAll('[data-dock-handle]').length); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  // Mod anahtarı kalktı (1107-A21); sayfa içi geçiş artık zaman dilimi düğmeleriyle (adres değişir, sayfa yeniden yüklenmez)
  for (const tf of ['D1', 'H1', 'H4']) {
    await page.getByTestId(`timeframe-${tf}`).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tf')).toBe(tf === 'H4' ? null : tf);
    await page.waitForTimeout(400);
    await expectPhoneStrict(page, tf);
  }
  expect(await page.evaluate(() => (window as unknown as { __max: number }).__max), 'geçişte hiçbir karede tutamaç çizilmedi').toBe(0);
});
