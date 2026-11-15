/**
 * USR-16 · Kişisel grafik stil tercihleri kullanıcıya aittir (plan 1115-A9.1, S7): görünüm, şablonlar, dock düzeni, favoriler,
 * gösterge ve çizim varsayılanları, Fibonacci şablonları, katmanlar, trend ve formasyon çizgi stilleri worker'da (user_prefs) durur.
 * Grafik verisi (çizimler, sembole eklenen göstergeler, resimler, görünür aralık) cihazda kalır.
 */
import type { Page } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { encodeAppearance, encodeFib, decodeFib, prefBytes, MAX_PREF_BYTES, pickLegacyAppearance } from '../../src/lib/chart-workspace/chartPrefs';
import { DEFAULT_APPEARANCE, parseAppearance } from '../../src/lib/chart-workspace/settings';
import { presetFibStyle, factoryFibStyle } from '../../src/lib/chart-workspace/fibStyle';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pref = any;
const WS = 'grid-robot-chart-workspaces-v1';
const AN = 'grid-robot-analysis-prefs';
const OWNER = 'grid-robot-chart-prefs-owner';
const BACKUP = 'grid-robot-chart-prefs-backup-v1';
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=last7`;
const ALL_KEYS = ['chart_appearance', 'chart_appearance_templates', 'chart_dock', 'chart_favorites', 'chart_indicator_defaults', 'chart_drawing_defaults', 'chart_drawing_templates', 'chart_fib_templates', 'analysis_layers', 'analysis_trend', 'formation_style'];

const DOCK = { row1: ['symbol', 'account'], row2: ['timeframes', 'formations', 'actions'], bottom: ['view', 'indicators', 'edit', 'window'], free: {}, pos: {} };
const workspaceSeed = (extra: Record<string, unknown> = {}) => ({
  version: 3,
  appearance: { background: '#123456', gridV: false },
  templates: { 'Mein Look': { background: '#222222' } },
  favorites: ['trend-line', 'rectangle'],
  indicatorDefaults: { SMA: { period: 42 } },
  drawingTemplates: { 'fib-retracement': { 'Meine Fib': { width: 3 } }, 'trend-line': { Dick: { width: 3, color: '#ff0000' } } },
  drawingDefaults: { 'trend-line': { width: 2 } },
  dockLayout: DOCK,
  documents: { 'chart-data-doc': { drawings: JSON.stringify([{ id: 'DRAWMARK' }]), indicators: [], images: {}, overlays: {}, alarms: [] } },
  links: {},
  toolbar: {},
  ...extra,
});
const analysisSeed = () => ({ state: { showPauses: false, showTrend: true, trend: { ewoFast: 9 }, formationStyle: { zigzag: { color: '#ff0000', style: 'solid', width: 3, visible: true } } }, version: 1 });

/** Nur beim ersten Laden: nach der Übernahme darf der Eintrag nicht wiederkommen */
const seedLocal = (page: Page, entries: Record<string, unknown>) =>
  page.addInitScript((e) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, entries);
const local = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const openChart = async (page: Page, url = URL) => {
  await page.goto(url);
  await expect(page.getByTestId('chart-workspace')).toBeVisible();
};

test.describe('USR-16 Grafik tercihleri: Kodlama', () => {
  test('Görünüm varsayılandan fark olarak yazılır, Fibonacci stili küçülür ve aynen geri okunur', { tag: '@USR-16' }, () => {
    const a = parseAppearance({ background: '#123456', gridV: false });
    expect(encodeAppearance(a)).toEqual({ background: '#123456', gridV: false });
    expect(parseAppearance(encodeAppearance(a))).toEqual(a);
    expect(encodeAppearance(DEFAULT_APPEARANCE)).toEqual({});
    // Fabrika Fibonacci stili ve hazır set değer başına 8 KB'ın çok altında kalır; şablon başına ~10 şablon sığar
    expect(prefBytes(encodeFib(factoryFibStyle()))).toBeLessThan(80);
    expect(prefBytes(encodeFib(presetFibStyle()))).toBeLessThan(MAX_PREF_BYTES / 8);
    expect(decodeFib(encodeFib(presetFibStyle()))).toEqual(presetFibStyle());
  });

  test('Boyut, worker’ın saydığı gibi hesaplanır (Python ayırıcıları)', { tag: '@USR-16' }, () => {
    expect(prefBytes({ a: [1, 2], b: 'x,y:' })).toBe(JSON.stringify({ a: [1, 2], b: 'x,y:' }).length + 4);
  });

  test('Eski kayıtta görünüm sembol belgelerindeydi: en sık geçen varsayılan dışı görünüm alınır', { tag: '@USR-16' }, () => {
    const doc = (background: string) => ({ appearance: { background } });
    const raw = { appearance: { background: '#000001' }, documents: { a: doc('#111111'), b: doc('#222222'), c: doc('#222222'), d: doc('') } };
    expect(pickLegacyAppearance(raw)?.background).toBe('#222222');
    expect(pickLegacyAppearance({ appearance: { background: '#000001' }, documents: {} })?.background).toBe('#000001');
    expect(pickLegacyAppearance(null)).toBeNull();
  });
});

test.describe('USR-16 Grafik tercihleri: Göç ve başka tarayıcı', () => {
  test('Eski tarayıcı değerleri worker’a yazılır; temiz başka tarayıcıda aynı gelir; grafik verisi cihazda kalır', { tag: '@USR-16' }, async ({ page, worker, browser }, testInfo) => {
    await seedLocal(page, { [WS]: workspaceSeed(), [AN]: analysisSeed() });
    await openChart(page);
    await expect.poll(() => ALL_KEYS.filter((k) => !(k in (worker.userPrefs.admin ?? {})))).toEqual([]);
    const prefs = worker.userPrefs.admin as Record<string, Pref>;
    expect(prefs.chart_appearance).toEqual({ appearance: { background: '#123456', gridV: false } });
    expect(prefs.chart_favorites).toEqual({ favorites: ['trend-line', 'rectangle'] });
    expect(prefs.chart_indicator_defaults.defaults.SMA.period).toBe(42);
    expect(Object.keys(prefs.chart_fib_templates.templates)).toEqual(['Meine Fib']);
    expect(prefs.chart_drawing_templates.templates['trend-line'].Dick.width).toBe(3);
    expect(prefs.chart_drawing_templates.templates['fib-retracement']).toBeUndefined();
    expect(prefs.chart_drawing_defaults.defaults['trend-line'].width).toBe(2);
    expect(prefs.chart_appearance_templates.templates['Mein Look'].background).toBe('#222222');
    expect(prefs.analysis_layers.showPauses).toBe(false);
    expect(prefs.analysis_layers.showTrend).toBe(true);
    expect(prefs.analysis_trend.trend.ewoFast).toBe(9);
    expect(prefs.formation_style.style.zigzag.color).toBe('#ff0000');
    expect(prefs.chart_dock.dock.row1).toEqual(['symbol', 'account']);
    // Grafik verisi worker’a gitmez
    expect(JSON.stringify(prefs)).not.toContain('DRAWMARK');
    expect(Object.keys(prefs).filter((k) => /document|link|toolbar|floating/.test(k))).toEqual([]);
    // Eski yerel kopya kalır (geri dönüş yolu) ve sahip etiketi yazılır
    expect(await page.evaluate((k) => localStorage.getItem(k), OWNER)).toBe('admin');
    expect((await local(page, WS)).documents['chart-data-doc']).toBeTruthy();

    // Başka tarayıcı: temiz localStorage, aynı kullanıcı
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1280, height: 900 } });
    const other = await ctx.newPage();
    await worker.install(other);
    await openChart(other);
    await expect.poll(async () => (await local(other, WS))?.appearance?.background).toBe('#123456');
    const ws = await local(other, WS);
    expect(ws.favorites).toEqual(['trend-line', 'rectangle']);
    expect(Object.keys(ws.templates)).toEqual(['Mein Look']);
    expect(ws.indicatorDefaults.SMA.period).toBe(42);
    expect(ws.drawingTemplates['fib-retracement']['Meine Fib']).toBeTruthy();
    expect(ws.drawingTemplates['trend-line'].Dick.width).toBe(3);
    expect(ws.dockLayout.row1).toEqual(['symbol', 'account']);
    // Grafik verisi bu cihazda yok
    expect(JSON.stringify(ws.documents)).not.toContain('DRAWMARK');
    expect(ws.documents['chart-data-doc']).toBeUndefined();
    const an = (await local(other, AN)).state;
    expect(an.showPauses).toBe(false);
    expect(an.trend.ewoFast).toBe(9);
    expect(an.formationStyle.zigzag.color).toBe('#ff0000');
    // Arayüzde de görünür: Ebenen menüsünde „Duraklamalar“ kapalı, ayar penceresinde zemin rengi
    await other.getByTestId('layers-button').click();
    await expect(other.getByRole('switch', { name: msg('analysis.settings.pauses') })).not.toBeChecked();
    await other.keyboard.press('Escape');
    await other.getByTestId('workspace-settings').click();
    await other.getByTestId('chart-workspace-settings').getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
    await expect(other.getByLabel(msg('cw.background'), { exact: true })).toHaveValue('#123456');
    await ctx.close();
  });

  test('Görünüm kullanıcı başına tektir: bir sembolde değişir, başka sembolde ve başka tarayıcıda aynıdır', { tag: '@USR-16' }, async ({ page, worker, browser }, testInfo) => {
    await openChart(page);
    await page.getByTestId('workspace-settings').click();
    const modal = page.getByTestId('chart-workspace-settings');
    await modal.getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
    await page.getByLabel(msg('cw.background'), { exact: true }).fill('#345678');
    await page.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
    await expect.poll(() => (worker.userPrefs.admin?.chart_appearance as Pref)?.appearance?.background).toBe('#345678');
    // Başka sembol: aynı görünüm (eskiden sembol başına belgede dururdu)
    await openChart(page, `/chart?account=${DEMO_ID}&symbol=XAUUSD&tf=H1&range=last7`);
    await page.getByTestId('workspace-settings').click();
    await page.getByTestId('chart-workspace-settings').getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
    await expect(page.getByLabel(msg('cw.background'), { exact: true })).toHaveValue('#345678');
    await page.getByRole('button', { name: msg('cw.cancel'), exact: true }).click();
    // Katman anahtarı da kullanıcıya yazılır
    await page.getByTestId('layers-button').click();
    await page.getByRole('switch', { name: msg('analysis.settings.pauses') }).click();
    await expect.poll(() => (worker.userPrefs.admin?.analysis_layers as Pref)?.showPauses).toBe(false);
    // Çizim verisi ve yakınlaştırma sembolde kalır: belgede görünüm yok
    const docs = (await local(page, WS)).documents as Record<string, { appearance?: unknown }>;
    expect(Object.values(docs).every((d) => d.appearance === undefined)).toBe(true);

    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1280, height: 900 } });
    const other = await ctx.newPage();
    await worker.install(other);
    await openChart(other, `/chart?account=${DEMO_ID}&symbol=XAUUSD&tf=H1&range=last7`);
    await expect.poll(async () => (await local(other, WS))?.appearance?.background).toBe('#345678');
    await ctx.close();
  });

  test('Worker’daki değer kazanır; çakışan eski yerel değer önce yedeklenir', { tag: '@USR-16' }, async ({ page, worker }) => {
    worker.userPrefs.admin = { chart_appearance: { appearance: { background: '#bbbbbb' } } };
    await seedLocal(page, { [WS]: workspaceSeed({ appearance: { background: '#aaaaaa' } }) });
    await openChart(page);
    await expect.poll(async () => (await local(page, WS))?.appearance?.background).toBe('#bbbbbb');
    const backup = await local(page, BACKUP);
    expect(backup.chart_appearance.appearance.background).toBe('#aaaaaa');
    expect((worker.userPrefs.admin.chart_appearance as Pref).appearance.background).toBe('#bbbbbb');
  });

  test('Önbellek başka kullanıcıya aitse varsayılana dönülür ve hiçbir şey yazılmaz', { tag: '@USR-16' }, async ({ page, worker }) => {
    await seedLocal(page, { [OWNER]: 'u_other', [WS]: workspaceSeed() });
    await openChart(page);
    await expect.poll(async () => (await local(page, WS))?.appearance?.background).toBe('');
    expect(worker.userPrefs.admin?.chart_appearance).toBeUndefined();
    expect(worker.userPrefs.admin?.chart_favorites).toBeUndefined();
    expect(await page.evaluate((k) => localStorage.getItem(k), OWNER)).toBe('admin');
  });

  test('Tercihler yüklenmeden yapılan değişiklik reddedilir ve yazılmaz', { tag: '@USR-16' }, async ({ page, worker }) => {
    worker.userPrefsGetDelayMs = 4000;
    await openChart(page);
    await page.getByTestId('layers-button').click();
    await page.getByRole('switch', { name: msg('analysis.settings.pauses') }).click();
    await expect(page.getByText(msg('prefs.toast.notloaded')).first()).toBeVisible();
    expect(worker.userPrefs.admin?.analysis_layers).toBeUndefined();
  });

  test('Değer 8 KB’ı aşarsa kaydedilmez (worker’a istek gitmez)', { tag: '@USR-16' }, async ({ page, worker }) => {
    const big = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`Şablon ${i} `.padEnd(70, 'x'), { width: 3, color: '#ff0000' }]));
    await seedLocal(page, { [WS]: workspaceSeed({ drawingTemplates: { 'trend-line': big } }) });
    await openChart(page);
    await expect.poll(() => (worker.userPrefs.admin as Record<string, unknown>)?.chart_favorites).toBeTruthy();
    expect(worker.userPrefs.admin?.chart_drawing_templates).toBeUndefined();
  });
});

test.describe('USR-16 Ayarlar: Grafik sayfasındaki tercihler', () => {
  test('Blok: altı madde, iki bağlantı, alt not; bağlantılar grafik pencerelerini açar', { tag: '@USR-16' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-nav-chart').click();
    const row = page.getByTestId('row-chart-prefs');
    await expect(row).toContainText(msg('sdlg.chartprefs'));
    await expect(row).toContainText(msg('sdlg.chartprefs.badge'));
    await expect(page.getByTestId('settings-chartprefs-list').getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('settings-chartprefs-list')).toContainText(msg('sdlg.chartprefs.i5'));
    await expect(page.getByTestId('settings-chartprefs-note')).toHaveText(msg('sdlg.chartprefs.note'));
    // Ekran görüntüsü yalnız pencere: arkadaki hesap seçici görünmesin
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.getByTestId('settings-dialog').screenshot({ path: test.info().outputPath(`settings-chartprefs-1280-${scheme}.png`) });
    }
    await page.getByTestId('settings-appearance-open').click();
    await expect(page).toHaveURL(/\/chart/);
    await expect(page.getByTestId('chart-workspace-settings')).toBeVisible({ timeout: 15_000 });
  });

  test.describe('Telefon (375 px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });
    test('Grafik bölümünde yatay kayma yok', { tag: '@USR-16' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await page.getByTestId('settings-open').click();
      await page.getByTestId('settings-nav-chart').click();
      await expect(page.getByTestId('row-chart-prefs')).toBeVisible();
      const overflow = await page.evaluate(() => { const el = document.querySelector('[data-testid="settings-pane"]') as HTMLElement; return el.scrollWidth - el.clientWidth; });
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.getByTestId('settings-dialog').screenshot({ path: test.info().outputPath(`settings-chartprefs-375-${scheme}.png`) });
      }
    });
  });
});
