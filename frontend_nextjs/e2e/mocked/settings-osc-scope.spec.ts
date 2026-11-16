/**
 * USR-17 · Osilatörler: her yerde aynı standart ya da ürün başına (plan 1114-A3).
 * Standart modda RSI/EWO ayarları, panel yüksekliği ve sırası kullanıcıya aittir ve her üründe aynıdır; ürüne özel kayıtlar silinmez, yok sayılır.
 */
import type { Page } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { composeStandard, parseOscScope, parseOscStandard, splitStandard, standardIndicators, standardOf } from '../../src/lib/chart-workspace/oscStandard';
import { emptyChartDocument } from '../../src/store/useChartWorkspaceStore';
import { newIndicator } from '../../src/lib/chart-workspace/indicators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pref = any;
const WS = 'grid-robot-chart-workspaces-v1';
const url = (symbol: string) => `/chart?account=${DEMO_ID}&symbol=${symbol}&tf=H1&range=last7`;
const openChart = async (page: Page, symbol = 'EURUSD') => {
  await page.goto(url(symbol));
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
};
/**
 * Kişisel tercihler (`GET /me/prefs`) uygulandı. Öncesinde uygulama standarttaki değişikliği reddeder ("yüklenmedi" bildirimi) ve kayıtlı mod
 * sonra gelir; lejanttaki tıklama etkisiz kalır (1116-A35). Uygulama sahip anahtarını tercihlerle aynı görevde yazar.
 */
const prefsLoaded = (page: Page) => page.waitForFunction(() => localStorage.getItem('grid-robot-chart-prefs-owner') !== null);
const openSettings = async (page: Page) => {
  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings-nav-chart').click();
};

test.describe('USR-17 Osilatör standardı: Kodlama', () => {
  test('Mod ve standart değerler okunur; geçersiz değer varsayılana döner', { tag: '@USR-17' }, () => {
    expect(parseOscScope(null)).toBe('standard');
    expect(parseOscScope({ mode: 'product' })).toBe('product');
    expect(parseOscScope({ mode: 'x' })).toBe('standard');
    expect(parseOscStandard({})).toBeNull();
    expect(parseOscStandard({ indicators: [{ ...newIndicator('MACD'), id: 'm' }, { ...newIndicator('EWO'), id: 'e' }] })?.indicators?.map((i) => i.kind)).toEqual(['EWO']);
  });

  test('Birleştirme standardı okur, ayırma ürünün kendi kaydına dokunmaz', { tag: '@USR-17' }, () => {
    const own = { ...emptyChartDocument(), indicators: [{ ...newIndicator('RSI'), id: 'own-rsi', period: 5 }, { ...newIndicator('SMA'), id: 'sma' }], paneOrder: ['own-rsi'], paneHeights: { 'own-rsi': 10 } };
    const std = { indicators: [{ ...newIndicator('RSI'), id: 'std-rsi', period: 21 }], paneOrder: ['std-rsi'], paneHeights: { 'std-rsi': 20 } };
    const doc = composeStandard(own, std, []);
    expect(doc.indicators.map((i) => i.id)).toEqual(['sma', 'std-rsi']);
    expect(doc.paneOrder).toEqual(['std-rsi']);
    expect(doc.paneHeights).toEqual({ 'std-rsi': 20 });
    const edited = { ...doc, indicators: doc.indicators.map((i) => (i.id === 'std-rsi' ? { ...i, period: 30 } : i)) };
    const { std: written, product } = splitStandard(edited, own);
    expect(written.indicators?.[0].period).toBe(30);
    expect(standardOf(edited)).toEqual(written);
    expect(product.indicators.map((i) => i.id).sort()).toEqual(['own-rsi', 'sma']);
    expect(product.indicators.find((i) => i.id === 'own-rsi')?.period).toBe(5);
    expect(product.paneOrder).toEqual(['own-rsi']);
    expect(product.paneHeights).toEqual({ 'own-rsi': 10 });
  });

  test('Göstergeler değişmeyince gösterge dizisinin kimliği korunur (ANA-27)', { tag: '@USR-17' }, () => {
    // Görünüm ya da çizim kaydı göstergelere dokunmaz: yeni dizi grafikte bütün göstergeleri yeniden hesaplatırdı
    const own = { ...emptyChartDocument(), indicators: [{ ...newIndicator('RSI'), id: 'own-rsi' }, { ...newIndicator('SMA'), id: 'sma' }] };
    const std = { indicators: [{ ...newIndicator('RSI'), id: 'std-rsi' }] };
    const indicators = standardIndicators(own.indicators, std, []);
    const doc = composeStandard(own, std, [], indicators);
    expect(doc.indicators).toBe(indicators);
    expect(composeStandard({ ...own, visibleTime: { from: 1, to: 2 } }, std, [], indicators).indicators).toBe(indicators);
    expect(splitStandard({ ...doc, drawings: '[]', visibleTime: { from: 1, to: 2 } }, own).product.indicators).toBe(own.indicators);
    // Ürün kaydında RSI başka bir göstergenin arkasında dursa da (eski sıra)
    const mixed = { ...own, indicators: [...own.indicators].reverse() };
    expect(splitStandard({ ...composeStandard(mixed, std, []), visibleTime: { from: 1, to: 2 } }, mixed).product.indicators).toBe(mixed.indicators);
    // Değişen gösterge yeni dizi verir
    const changed = { ...doc, indicators: doc.indicators.map((i) => (i.id === 'sma' ? { ...i, period: 99 } : i)) };
    expect(splitStandard(changed, own).product.indicators).not.toBe(own.indicators);
  });
});

test.describe('USR-17 Osilatör standardı: Ayarlar ve grafik', () => {
  test('Varsayılan standarttır; seçim worker’a yazılır ve geri alınır', { tag: '@USR-17' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    const standard = page.getByTestId('settings-osc-scope-standard'), product = page.getByTestId('settings-osc-scope-product');
    await expect(page.getByTestId('row-chart-osc')).toContainText(msg('sdlg.osc'));
    await expect(standard).toHaveAttribute('aria-checked', 'true');
    await expect(product).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('settings-osc-standard-info').getByRole('listitem')).toHaveCount(6);
    await product.click();
    await expect(product).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('settings-osc-product-info')).toContainText(msg('sdlg.osc.productinfo'));
    await expect.poll(() => (worker.userPrefs.admin?.chart_osc_scope as Pref)?.mode).toBe('product');
    await standard.click();
    await expect.poll(() => (worker.userPrefs.admin?.chart_osc_scope as Pref)?.mode).toBe('standard');
  });

  test('Standart modda bir üründe yapılan RSI değişikliği başka üründe de görünür; ürün kaydı değişmez', { tag: '@USR-17' }, async ({ page, worker }) => {
    await openChart(page);
    const chart = page.getByTestId('analysis-chart');
    await expect(chart).toHaveAttribute('data-rsi-visible', 'true');
    await prefsLoaded(page);
    await page.locator('[data-indicator-row="RSI"]').first().getByRole('button', { name: msg('cw.legend.visibility', { indicator: 'RSI' }) }).click({ force: true });
    await expect(chart).toHaveAttribute('data-rsi-visible', 'false');
    await expect.poll(() => (worker.userPrefs.admin?.chart_osc_standard as Pref)?.indicators?.find((i: Pref) => i.id === 'system-rsi')?.visible).toBe(false);
    await openChart(page, 'XAUUSD');
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-rsi-visible', 'false');
    // Ürünün kendi belgesi RSI’yı hâlâ görünür tutar (silinmedi, yok sayıldı)
    const docs = (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), WS)).documents as Record<string, { indicators: { id: string; visible: boolean }[] }>;
    const own = Object.values(docs).flatMap((d) => d.indicators.filter((i) => i.id === 'system-rsi'));
    expect(own.every((i) => i.visible !== false)).toBe(true);
  });

  test('Ürün başına modda değişiklik yalnız o ürünü etkiler', { tag: '@USR-17' }, async ({ page, worker }) => {
    worker.userPrefs.admin = { chart_osc_scope: { mode: 'product' } };
    await openChart(page);
    await prefsLoaded(page);
    await page.locator('[data-indicator-row="RSI"]').first().getByRole('button', { name: msg('cw.legend.visibility', { indicator: 'RSI' }) }).click({ force: true });
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-rsi-visible', 'false');
    await openChart(page, 'XAUUSD');
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-rsi-visible', 'true');
    expect(worker.userPrefs.admin?.chart_osc_standard).toBeUndefined();
  });

  test.describe('Telefon (375 px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });
    test('Osilatör satırında yatay kayma yok', { tag: '@USR-17' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await openSettings(page);
      await expect(page.getByTestId('row-chart-osc')).toBeVisible();
      const overflow = await page.evaluate(() => { const el = document.querySelector('[data-testid="settings-pane"]') as HTMLElement; return el.scrollWidth - el.clientWidth; });
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.getByTestId('settings-osc-scope-product').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });
});
