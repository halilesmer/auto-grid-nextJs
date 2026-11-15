/**
 * USR-13 · Ayar penceresi sağlamlaştırma (plan 1114-A4 S3, 1115-A2.2/A2.4):
 * yükleme kapısı, yeniden deneme, odak tuzağı, Escape sırası, odak dönüşü, sekme erişilebilirliği.
 */
import type { Page } from '@playwright/test';
import { startDisconnected } from '../fixtures/connection';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const dialog = (page: Page) => page.getByTestId('settings-dialog');
async function openSettings(page: Page) {
  await page.getByTestId('settings-open').click();
  await expect(dialog(page)).toBeVisible();
}

test.describe('USR-13 Yükleme kapısı', () => {
  test('Tercihler yüklenmeden alanlar kilitli; yükleme bitince kayıtlı süre varsayılanın üstüne yazılmaz', { tag: '@USR-13' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { tooltip_delay: { mode: 'instant', ms: 3000 } };
    worker.userPrefsGetDelayMs = 4000;
    await dashboard.open(DEMO_ID);
    await openSettings(page);

    // Yükleme sürerken: alan kilitli, satırda „Yükleniyor“
    await expect(page.getByTestId('pref-load-tooltip_delay')).toHaveAttribute('data-state', 'loading');
    await expect(page.getByTestId('settings-delay-custom')).toBeDisabled();
    await expect(page.getByTestId('settings-theme-dark')).toBeDisabled();
    expect(worker.callsTo('PUT', /\/api\/me\/prefs\//)).toHaveLength(0);

    // Yükleme bitince kilit açılır; „Eigene“ kayıtlı 3 sn ile yazılır (varsayılan süre değil)
    await expect(page.getByTestId('pref-load-tooltip_delay')).toHaveCount(0, { timeout: 12_000 });
    await expect(page.getByTestId('settings-delay-custom')).toBeEnabled();
    await page.getByTestId('settings-delay-custom').click();
    await expect.poll(() => worker.userPrefs.admin.tooltip_delay).toEqual({ mode: 'custom', ms: 3000 });
  });

  test('Yükleme düşerse sınırlı sayıda yeniden denenir ve sonunda değerler gelir', { tag: '@USR-13' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { chart_tf: { tf: 'H1' } };
    worker.userPrefsGetFailures = 2;
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await page.getByTestId('settings-nav-chart').click();
    await expect(page.getByTestId('settings-tf-H1')).toHaveAttribute('aria-pressed', 'true', { timeout: 12_000 });
    await expect(page.getByTestId('settings-tf-H1')).toBeEnabled();
    expect(worker.callsTo('GET', '/api/me/prefs')).toHaveLength(3);
  });

  test('Denemeler tükenince satırda hata ve „Tekrar dene“; düğme yeniden yükler', { tag: '@USR-13' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { chart_tf: { tf: 'D1' } };
    worker.userPrefsGetFailures = 99;
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await page.getByTestId('settings-nav-chart').click();
    const row = page.getByTestId('row-chart-tf');
    await expect(row.getByTestId('pref-load-chart_tf')).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
    await expect(row.getByTestId('settings-tf-H1')).toBeDisabled();
    expect(worker.callsTo('GET', '/api/me/prefs')).toHaveLength(4);

    worker.userPrefsGetFailures = 0;
    await row.getByTestId('pref-load-retry-chart_tf').click();
    await expect(row.getByTestId('settings-tf-D1')).toHaveAttribute('aria-pressed', 'true');
    await expect(row.getByTestId('settings-tf-D1')).toBeEnabled();
    await expect(row.getByTestId('pref-load-chart_tf')).toHaveCount(0);
  });

  test('Bağlantı yokken kişisel alanlar kilitli kalır (sebep ipucunda), dil ve tema bu cihazda çalışır', { tag: '@USR-13' }, async ({ page, worker }) => {
    void worker;
    await startDisconnected(page);
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('pref-load-tooltip_delay')).toHaveAttribute('data-state', 'offline');
    await expect(page.getByTestId('settings-delay-custom')).toBeDisabled();
    await expect(page.getByTestId('pref-load-retry-tooltip_delay')).toHaveCount(0);
    await page.getByTestId('pref-load-tooltip_delay').hover();
    await expect(page.getByText(msg('sdlg.locked.connect.hint')).first()).toBeVisible();
    // Dil ve tema (1115-A7.2): kilitli değil, „Bu cihazda“ rozeti
    await expect(page.getByTestId('settings-theme-dark')).toBeEnabled();
    await expect(page.getByTestId('pref-local-theme')).toBeVisible();
  });
});

test.describe('USR-13 Odak ve Escape', () => {
  test('Tab odağı pencerenin dışına çıkarmaz (ileri ve geri)', { tag: '@USR-13' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="settings-dialog"]'));
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
    }
  });

  test('Escape önce düzenlenen alanı geri alır, ikincisi pencereyi kapatır; odak açan düğmeye döner', { tag: '@USR-13' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const opener = page.getByTestId('settings-open');
    await opener.focus();
    await opener.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await page.getByTestId('settings-delay-custom').click();
    const input = page.getByTestId('settings-delay-input');
    await expect(input).toBeEnabled();
    const before = await input.inputValue();
    await input.fill('7');
    // Açık ipucu Escape'in ilkini alır (tooltip.tsx); alan geri alınana kadar pencere açık kalmalı
    for (let i = 0; i < 3 && (await input.inputValue()) !== before; i++) {
      await input.press('Escape');
      await expect(dialog(page)).toBeVisible();
    }
    await expect(input).toHaveValue(before);
    for (let i = 0; i < 3 && (await dialog(page).isVisible()); i++) await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('Onay penceresi açıkken Escape yalnız onu kapatır', { tag: '@USR-13' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { chart_colors: { colors: ['#112233'] } };
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await page.getByTestId('settings-nav-chart').click();
    await expect(page.getByTestId('settings-colors-clear')).toBeEnabled();
    await page.getByTestId('settings-colors-clear').click();
    await expect(page.getByRole('dialog').filter({ hasText: msg('sdlg.colors.confirm.title') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog').filter({ hasText: msg('sdlg.colors.confirm.title') })).toBeHidden();
    await expect(dialog(page)).toBeVisible();
  });

  test('Saniye alanı kayıttan sonra odağı korur', { tag: '@USR-13' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await page.getByTestId('settings-delay-custom').click();
    const input = page.getByTestId('settings-delay-input');
    await input.fill('1,5');
    await input.press('Enter');
    await expect.poll(() => worker.userPrefs.admin.tooltip_delay).toEqual({ mode: 'custom', ms: 1500 });
    await expect(page.getByTestId('pref-status-tooltip_delay')).toHaveAttribute('data-status', 'saved');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('1,5');
  });
});

test.describe('USR-13 Sekmeler', () => {
  test('Bildirimler sekmeleri: rol, aria-controls, panel ve ok/Home/End ile gezinme', { tag: '@USR-13' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await page.getByTestId('settings-nav-notifications').click();
    const tabs = page.getByTestId('settings-tabs');
    await expect(tabs).toHaveAttribute('role', 'tablist');
    const general = page.getByTestId('settings-tab-general');
    const alerts = page.getByTestId('settings-tab-alerts');
    const filter = page.getByTestId('settings-tab-filter');

    for (const tab of [general, alerts, filter]) {
      const controls = await tab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      const panel = page.locator(`[id="${controls}"]`);
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      await expect(panel).toHaveAttribute('aria-labelledby', (await tab.getAttribute('id')) ?? 'x');
    }
    await expect(general).toHaveAttribute('aria-selected', 'true');
    await expect(general).toHaveAttribute('tabindex', '0');
    await expect(alerts).toHaveAttribute('tabindex', '-1');

    await general.focus();
    await page.keyboard.press('ArrowRight');
    await expect(alerts).toBeFocused();
    await expect(alerts).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(filter).toBeFocused();
    await expect(filter).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(general).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(filter).toBeFocused();
    await page.keyboard.press('Home');
    await expect(general).toBeFocused();
    await expect(general).toHaveAttribute('aria-selected', 'true');
  });
});
