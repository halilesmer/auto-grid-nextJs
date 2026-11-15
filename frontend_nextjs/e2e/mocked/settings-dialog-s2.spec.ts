/**
 * USR-11 · Ayarlar → Bildirimler (bildirim süresi, haber uyarıları, haber filtresi; hesaptan kullanıcıya tek seferlik göç)
 * USR-12 · Ayarlar → Grafik (varsayılan zaman dilimi, kayıtlı renkler, Göstergeler bağlantısı)
 * Plan 1114-A4 S2.
 */
import type { Page } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { installNewsClock, newsFixture } from '../fixtures/news';

const dialog = (page: Page) => page.getByTestId('settings-dialog');
async function openSettings(page: Page, section: 'notifications' | 'chart') {
  await page.getByTestId('settings-open').click();
  await expect(dialog(page)).toBeVisible();
  await page.getByTestId(`settings-nav-${section}`).click();
  await expect(page.getByTestId('settings-pane')).toHaveAttribute('data-section', section);
}

test.beforeEach(async ({ page, worker }) => {
  await installNewsClock(page);
  worker.newsEvents = newsFixture();
});

test.describe('USR-11 Bildirimler', () => {
  test('Bildirim süresi: dört seçenek, worker’a kullanıcı anahtarıyla yazılır, yenilemede seçili kalır', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page, 'notifications');
    await expect(page.getByTestId('settings-tabs').getByRole('tab')).toHaveCount(3);
    await expect(page.getByTestId('settings-toast-10')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('settings-toast').getByRole('button')).toHaveCount(4);
    await page.getByTestId('settings-toast-20').click();
    await expect(page.getByTestId('pref-status-toast_duration')).toHaveAttribute('data-status', 'saved');
    expect(worker.userPrefs.admin.toast_duration).toEqual({ seconds: 20 });
    await page.getByTestId('settings-toast-0').click();
    await expect.poll(() => worker.userPrefs.admin.toast_duration).toEqual({ seconds: 0 });

    await dashboard.open(DEMO_ID);
    await openSettings(page, 'notifications');
    await expect(page.getByTestId('settings-toast-0')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Bildirim süresi 5 sn: haber uyarısı 5 sn sonra kapanır (varsayılan 10 sn)', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = {
      toast_duration: { seconds: 5 },
      news_alerts: { alerts: [{ on: false, minutes: 60 }, { on: true, minutes: 30 }] },
    };
    await page.addInitScript(() => {
      class N { static permission = 'granted'; static async requestPermission() { return 'granted'; } }
      (window as unknown as { Notification: unknown }).Notification = N;
    });
    await dashboard.open(DEMO_ID);
    const toast = page.getByRole('status').filter({ hasText: msg('news.alert.show') });
    await expect(toast).toHaveCount(1);
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
  });

  test('Haber uyarıları: anahtar ve dakika kullanıcı anahtarına yazılır; geçersiz dakika kaydedilmez', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page, 'notifications');
    await page.getByTestId('settings-tab-alerts').click();
    await expect(page.getByTestId('settings-alert-min-0')).toHaveValue('60');
    await page.getByRole('switch', { name: msg('news.alert.name', { n: 1 }) }).click();
    await expect.poll(() => worker.userPrefs.admin.news_alerts).toEqual({ alerts: [{ on: true, minutes: 60 }, { on: false, minutes: 30 }] });
    const input = page.getByTestId('settings-alert-min-1');
    await input.fill('0');
    await expect(page.getByTestId('settings-alert-error-1')).toBeVisible();
    await input.press('Enter');
    await expect(input).toHaveValue('30');
    expect(worker.userPrefs.admin.news_alerts).toEqual({ alerts: [{ on: true, minutes: 60 }, { on: false, minutes: 30 }] });
    await input.fill('15');
    await input.press('Enter');
    await expect.poll(() => (worker.userPrefs.admin.news_alerts as { alerts: { minutes: number }[] }).alerts[1].minutes).toBe(15);
  });

  test('Haber filtresi: önem ve para birimi seçilir; haber kartı aynı filtreyi gösterir; hesap anahtarına yazılmaz', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page, 'notifications');
    await page.getByTestId('settings-tab-filter').click();
    await page.getByTestId('settings-imp-low').click();
    await page.getByTestId('settings-ccy-EUR').click();
    await expect.poll(() => worker.userPrefs.admin.news_filter).toMatchObject({ impacts: ['high', 'low'], currencies: expect.arrayContaining(['USD', 'EUR']) });
    expect(worker.uiPrefs[DEMO_ID]?.news_filter).toBeUndefined();
    await page.getByTestId('settings-ccy-USD').click();
    await expect(page.getByTestId('settings-ccy-USD')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-low')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-ccy-summary')).toHaveText('EUR');
  });

  test('Göç: kullanıcıda değer yok → seçili hesabın haber filtresi ve uyarısı bir kez alınır, hesap anahtarları kalır', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    worker.uiPrefs[DEMO_ID] = {
      news_filter: { impacts: ['moderate'], days: ['week'], currencies: ['EUR'] },
      news_alerts: { alerts: [{ on: true, minutes: 45 }, { on: false, minutes: 30 }] },
    };
    await dashboard.open(DEMO_ID);
    await expect.poll(() => worker.userPrefs.admin?.news_filter).toEqual({ impacts: ['moderate'], days: ['week'], currencies: ['EUR'] });
    expect(worker.userPrefs.admin.news_alerts).toEqual({ alerts: [{ on: true, minutes: 45 }, { on: false, minutes: 30 }] });
    expect(worker.uiPrefs[DEMO_ID].news_filter).toBeDefined(); // silinmedi
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'true');

    // Sonradan hesap değerleri değişse de kullanıcı değeri korunur (tek seferlik)
    worker.uiPrefs[DEMO_ID].news_filter = { impacts: ['low'], days: ['d0'], currencies: null };
    await dashboard.open(DEMO_ID);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-imp-low')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Göç: kullanıcıda değer varsa hesap değeri okunmaz', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { news_filter: { impacts: ['low'], days: ['d0'], currencies: ['USD'] }, news_alerts: { alerts: [{ on: false, minutes: 60 }, { on: false, minutes: 30 }] } };
    worker.uiPrefs[DEMO_ID] = { news_filter: { impacts: ['moderate'], days: ['week'], currencies: ['EUR'] } };
    await dashboard.open(DEMO_ID);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-low')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'false');
    expect(worker.importCalls).toHaveLength(0);
  });

  test('Haber uyarısı: kullanıcı değerinden gelen uyarı tetiklenir', { tag: '@USR-11' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { news_alerts: { alerts: [{ on: true, minutes: 60 }, { on: false, minutes: 30 }] } };
    await page.addInitScript(() => {
      class N { static permission = 'granted'; static async requestPermission() { return 'granted'; } }
      (window as unknown as { Notification: unknown }).Notification = N;
    });
    await dashboard.open(DEMO_ID);
    await expect(page.getByRole('status').filter({ hasText: msg('news.alert.show') })).toHaveCount(1);
  });
});

test.describe('USR-12 Grafik', () => {
  test('Varsayılan zaman dilimi: dört seçenek, H4 seçili, worker’a yazılır', { tag: '@USR-12' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page, 'chart');
    await expect(page.getByTestId('settings-tf').getByRole('button')).toHaveCount(4);
    await expect(page.getByTestId('settings-tf-H4')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('settings-tf-H1').click();
    await expect.poll(() => worker.userPrefs.admin.chart_tf).toEqual({ tf: 'H1' });
    await expect(page.getByTestId('settings-sum-chart')).toHaveCount(1);
  });

  test('Grafik bağlantısında tf yoksa kullanıcının zaman dilimi kullanılır; açıkça yazılan tf korunur', { tag: '@USR-12' }, async ({ page, worker }) => {
    worker.userPrefs.admin = { chart_tf: { tf: 'D1' } };
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD`);
    await expect(page.getByTestId('timeframe-D1')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.url()).not.toContain('tf=');
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1`);
    await expect.poll(() => page.url()).toContain('tf=H1');
    await expect(page.getByTestId('timeframe-H1')).toHaveAttribute('aria-checked', 'true');
  });

  test('Kayıtlı renkler: yerelden bir kez taşınır, listelenir, “Hepsini sil…” onayla temizler', { tag: '@USR-12' }, async ({ page, worker, dashboard }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('seeded-colors')) {
        localStorage.setItem('seeded-colors', '1');
        localStorage.setItem('grid-robot-custom-colors-v1', JSON.stringify({ state: { colors: ['#112233', '#445566'] }, version: 0 }));
      }
    });
    await dashboard.open(DEMO_ID);
    await expect.poll(() => worker.userPrefs.admin?.chart_colors).toEqual({ colors: ['#112233', '#445566'] });
    expect(await page.evaluate(() => localStorage.getItem('grid-robot-custom-colors-v1'))).toBeNull();
    await openSettings(page, 'chart');
    await expect(page.getByTestId('settings-color')).toHaveCount(2);
    await page.getByTestId('settings-colors-clear').click();
    await page.getByRole('button', { name: msg('sdlg.colors.clear.confirm'), exact: true }).click();
    await expect.poll(() => worker.userPrefs.admin.chart_colors).toEqual({ colors: [] });
    await expect(page.getByTestId('settings-colors-empty')).toBeVisible();
    await expect(page.getByTestId('settings-colors-clear')).toBeDisabled();
  });

  test('Kullanıcıda renk varsa yerel kopya taşınmaz', { tag: '@USR-12' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { chart_colors: { colors: ['#abcdef'] } };
    await page.addInitScript(() => localStorage.setItem('grid-robot-custom-colors-v1', JSON.stringify({ state: { colors: ['#112233'] }, version: 0 })));
    await dashboard.open(DEMO_ID);
    await openSettings(page, 'chart');
    await expect(page.getByTestId('settings-color')).toHaveCount(1);
    await expect(page.getByTestId('settings-color')).toHaveAttribute('data-color', '#abcdef');
    expect(worker.userPrefs.admin.chart_colors).toEqual({ colors: ['#abcdef'] });
  });

  test('“Grafikte aç”: grafik sayfası ve Göstergeler penceresi açılır', { tag: '@USR-12' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page, 'chart');
    await page.getByTestId('settings-indicators-open').click();
    await expect(page).toHaveURL(/\/chart/);
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 });
  });

  test.describe('Telefon (375 px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });
    test('Bildirimler ve Grafik: listede özet, bölümde yatay kayma yok', { tag: '@USR-12' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await page.getByTestId('settings-open').click();
      await expect(page.getByTestId('settings-sum-notifications')).toBeVisible();
      await expect(page.getByTestId('settings-sum-chart')).toContainText('H4');
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      for (const section of ['notifications', 'chart'] as const) {
        await page.getByTestId(`settings-nav-${section}`).click();
        for (const tab of section === 'notifications' ? ['general', 'alerts', 'filter'] : [null]) {
          if (tab) await page.getByTestId(`settings-tab-${tab}`).click();
          const scroll = await page.getByTestId('settings-pane').evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(scroll).toBeLessThanOrEqual(0);
          expect(await overflow()).toBeLessThanOrEqual(0);
        }
        await page.getByTestId('settings-back').click();
      }
    });
  });
});
