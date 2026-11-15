/**
 * USR-14 · Bağlantı durumları ayar penceresinde ve üst menüde (plan 1115-A7, A9.5):
 * bağlı, kontrol, kayıt düştü, ulaşılamıyor, anahtar geçersiz, güvensiz adres, bağlı değil.
 */
import type { Page } from '@playwright/test';
import { connectWithKey, startDisconnected } from '../fixtures/connection';
import { E2E_API_KEY } from '../fixtures/env';
import { openHeaderMenu } from '../fixtures/header';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const recheck = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const chip = (page: Page) => page.getByTestId('connection-chip');
const banner = (page: Page) => page.getByTestId('connection-banner');

async function openSettings(page: Page, section?: string) {
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  if (section) await page.getByTestId(`settings-nav-${section}`).click();
}

async function expectNoOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe('USR-14 Bağlantı durumları', () => {
  test('bağlı: bant yok, fiş düğmesinde nokta yok, satırlar açık', { tag: '@USR-14' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(chip(page)).toHaveAttribute('data-status', 'connected');
    await expect(page.getByTestId('connection-chip-dot')).toHaveCount(0);
    await openSettings(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByTestId('settings-theme-dark')).toBeEnabled();
    await expect(page.getByTestId('settings-nav-dot')).toHaveAttribute('data-status', 'connected');
    await expect(page.getByTestId('settings-nav-lock-appearance')).toHaveCount(0);
  });

  test('kontrol sürerken: fiş düğmesinde gri nokta, bant yok', { tag: '@USR-14' }, async ({ page, worker }) => {
    void worker;
    await page.route('**/api/system/platform', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fallback();
    });
    await page.goto('/');
    await expect(chip(page)).toHaveAttribute('data-status', 'checking');
    await expect(page.getByTestId('connection-chip-dot')).toHaveClass(/bg-muted-foreground/);
    await openSettings(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(chip(page)).toHaveAttribute('data-status', 'connected', { timeout: 10_000 });
    await expect(page.getByTestId('connection-chip-dot')).toHaveCount(0);
  });

  test('ulaşılamıyor: bant, kilitli satırlar, “Şimdi dene”, geri gelince toast ve yeniden yükleme', { tag: '@USR-14' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await expect(page.getByTestId('settings-theme-dark')).toBeEnabled();
    const prefsCalls = worker.callsTo('GET', '/api/me/prefs').length;

    worker.offline = true;
    await recheck(page);
    await expect(chip(page)).toHaveAttribute('data-status', 'unreachable');
    await expect(page.getByTestId('connection-chip-dot')).toHaveClass(/bg-danger/);
    await expect(banner(page)).toHaveAttribute('data-status', 'unreachable');
    await expect(page.getByTestId('connection-banner-title')).toHaveText(msg('sdlg.cb.unreachable.title'));
    await expect(page.getByTestId('connection-banner-meta')).toContainText(/\d{2}[:.]\d{2}/); // son başarılı kontrol saati
    await expect(page.getByTestId('pref-load-theme')).toHaveAttribute('data-state', 'readonly');
    await expect(page.getByTestId('settings-theme-dark')).toBeDisabled();
    await expect(page.getByTestId('settings-nav-lock-notifications')).toBeVisible();
    await expect(page.getByTestId('settings-nav-dot')).toHaveAttribute('data-status', 'unreachable');

    // Hâlâ kapalı: “Şimdi dene” bantı korur
    await page.getByTestId('connection-banner-retry').click();
    await expect(banner(page)).toBeVisible();
    await expect(page.getByTestId('connection-banner-retry')).toBeEnabled();

    // “Bağlantı ayarları”: Bağlantı bölümü sebebi, saatleri ve eylemi gösterir
    await page.getByTestId('connection-banner-settings').click();
    await expect(page.getByTestId('settings-pane')).toHaveAttribute('data-section', 'connection');
    await expect(page.getByTestId('settings-conn-cause')).toContainText(msg('connection.test.unreachable').slice(0, 30));
    await expect(page.getByTestId('settings-conn-meta')).toBeVisible();
    await expect(page.getByTestId('settings-conn-retry')).toBeVisible();

    // Geri geldi
    worker.offline = false;
    await page.getByTestId('settings-conn-retry').click();
    await expect(chip(page)).toHaveAttribute('data-status', 'connected');
    await expect(page.getByText(msg('conn.recovered'))).toBeVisible();
    await expect(page.getByTestId('settings-conn-cause')).toHaveCount(0);
    await expect.poll(() => worker.callsTo('GET', '/api/me/prefs').length).toBeGreaterThan(prefsCalls);
    await page.getByTestId('settings-nav-appearance').click();
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByTestId('settings-theme-dark')).toBeEnabled();
  });

  test('anahtar geçersiz: sarı nokta, “Anahtarı değiştir…”, rol Bilinmiyor', { tag: '@USR-14' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    worker.overrides.set('GET /api/system/platform', { status: 401, body: { detail: 'Invalid or missing API key' } });
    await recheck(page);
    await expect(chip(page)).toHaveAttribute('data-status', 'unauthorized');
    await expect(page.getByTestId('connection-chip-dot')).toHaveClass(/bg-warning/);

    await openSettings(page);
    await expect(banner(page)).toHaveAttribute('data-status', 'unauthorized');
    await expect(page.getByTestId('pref-load-theme')).toHaveAttribute('data-state', 'readonly');
    await page.getByTestId('settings-nav-connection').click();
    await expect(page.getByTestId('settings-conn-cause')).toContainText(msg('connection.test.unauthorized').slice(0, 30));
    await expect(page.getByTestId('settings-conn-role')).toHaveText(msg('sdlg.conn.role.unknown'));
    await expect(page.getByTestId('settings-conn-change')).toHaveText(msg('sdlg.cb.key'));

    await page.getByTestId('settings-nav-appearance').click();
    await page.getByTestId('connection-banner-action').click();
    await expect(page.getByTestId('connection-dialog')).toBeVisible();
    worker.unauthorized.length = 0; // beklenen: 401 override’dan geldi
  });

  test('güvensiz adres: bant “Adresi düzelt…”, kırmızı nokta, satırlar salt okunur', { tag: '@USR-14' }, async ({ page, worker }) => {
    void worker;
    await connectWithKey(page, 'http://worker.insecure.example', E2E_API_KEY);
    await page.addInitScript(() => {
      (window as unknown as { __gridPageProtocol: string }).__gridPageProtocol = 'https:';
    });
    await page.goto('/');
    await expect(chip(page)).toHaveAttribute('data-status', 'insecure');
    await expect(page.getByTestId('connection-chip-dot')).toHaveClass(/bg-danger/);
    await openSettings(page);
    await expect(banner(page)).toHaveAttribute('data-status', 'insecure');
    await expect(page.getByTestId('connection-banner-action')).toHaveText(msg('sdlg.cb.url'));
    await expect(page.getByTestId('settings-theme-dark')).toBeDisabled();
    await page.getByTestId('settings-nav-connection').click();
    await expect(page.getByTestId('settings-conn-cause')).toContainText(msg('connection.test.insecure').slice(0, 30));
  });

  test('bağlı değil: dil ve tema bu cihazda, öteki ayarlar “Bağlanınca açılır”, bant “VPS’e bağlan”', { tag: '@USR-14' }, async ({ page, worker }) => {
    void worker;
    await startDisconnected(page);
    await page.goto('/');
    await expect(chip(page)).toHaveAttribute('data-status', 'unconfigured');
    await expect(page.getByTestId('connection-chip-dot')).toHaveCount(0);
    await openSettings(page);
    await expect(banner(page)).toHaveAttribute('data-status', 'unconfigured');
    await expect(page.getByTestId('connection-banner-title')).toHaveText(msg('sdlg.cb.unconfigured.title'));
    await expect(page.getByTestId('pref-local-theme')).toHaveText(msg('sdlg.local'));
    await expect(page.getByTestId('settings-theme-dark')).toBeEnabled();
    await expect(page.getByTestId('pref-load-tooltip_delay')).toHaveText(msg('sdlg.locked.connect'));
    await expect(page.getByTestId('settings-nav-lock-appearance')).toHaveCount(0);
    await expect(page.getByTestId('settings-nav-lock-chart')).toBeVisible();
    await page.getByTestId('connection-banner-action').click();
    await expect(page.getByTestId('connection-dialog')).toBeVisible();
  });

  test('kayıt düştü: hata toast’ında “Tekrar dene” aynı değeri yeniden kaydeder', { tag: '@USR-14' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    worker.userPrefsFail = true;
    await page.getByTestId('settings-theme-light').click();
    await expect(page.getByText(msg('prefs.toast.failed'), { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: msg('sdlg.load.retry') })).toBeVisible();
    await expect(page.getByTestId('settings-theme-dark')).toHaveAttribute('aria-pressed', 'true'); // eski değere döndü

    worker.userPrefsFail = false;
    await page.getByRole('button', { name: msg('sdlg.load.retry') }).click();
    await expect(page.getByTestId('pref-status-theme')).toHaveAttribute('data-status', 'saved');
    expect(worker.userPrefs.admin.theme).toEqual({ theme: 'light' });
  });

  test('üst menü: hata varken “Bağlantı ayarları” Bağlantı bölümünü sebep ve saatlerle açar', { tag: '@USR-14' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    worker.offline = true;
    await recheck(page);
    await expect(chip(page)).toHaveAttribute('data-status', 'unreachable');
    const panel = await openHeaderMenu(page);
    await expect(panel.getByTestId('header-menu-connection')).toContainText(msg('connection.status.unreachable'));
    await panel.getByTestId('connection-change').click();
    await expect(page.getByTestId('settings-pane')).toHaveAttribute('data-section', 'connection');
    await expect(page.getByTestId('settings-conn-cause')).toBeVisible();
    await expect(page.getByTestId('settings-conn-meta')).toBeVisible();
    worker.offline = false;
  });

  test.describe('375 px', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    for (const scheme of ['dark', 'light'] as const) {
      test(`bant ve Bağlantı bölümü yatay kaydırma yapmaz (${scheme})`, { tag: '@USR-14' }, async ({ page, worker, dashboard }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await dashboard.open(DEMO_ID);
        worker.offline = true;
        await recheck(page);
        await expect(chip(page)).toHaveAttribute('data-status', 'unreachable');
        await openSettings(page, 'appearance');
        await expect(banner(page)).toBeVisible();
        const box = (await banner(page).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        await expectNoOverflow(page);
        await page.getByTestId('connection-banner-settings').click();
        await expect(page.getByTestId('settings-conn-cause')).toBeVisible();
        await expectNoOverflow(page);
        worker.offline = false;
      });
    }
  });
});

