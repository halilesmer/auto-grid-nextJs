/** NWS-03 · Haber uyarıları (plan 1107-A16 S3, karar A16.9): ayar paneli, iki uyarı, tam ana zamanlayıcı, tekrarsızlık, izin. */
import type { Page } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { NEWS_SOON_ID, installNewsClock, newsFixture } from '../fixtures/news';

type Dash = import('../fixtures/dashboard').Dashboard;
type Perm = 'default' | 'granted' | 'denied';

test.beforeEach(async ({ page, worker }) => {
  await installNewsClock(page);
  worker.newsEvents = newsFixture();
});

/** Tarayıcının bildirim izni ve service worker kaydı (e2e'de SW kapalı) sahte: gösterilen bildirimler window.__shown'a düşer. */
async function fakeNotifications(page: Page, permission: Perm) {
  await page.addInitScript((initial) => {
    const w = window as unknown as { __shown: unknown[]; Notification: unknown };
    w.__shown = [];
    let current = initial;
    w.Notification = class {
      static get permission() { return current; }
      static async requestPermission() { current = current === 'default' ? 'denied' : current; return current; }
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ showNotification: async (title: string, options: unknown) => { w.__shown.push({ title, options }); } }), addEventListener() {}, removeEventListener() {} },
    });
  }, permission);
}

const shownNotifications = (page: Page) => page.evaluate(() => (window as unknown as { __shown: { title: string; options: { tag: string; data: { url: string } } }[] }).__shown);
const alertToasts = (page: Page) => page.getByRole('status').filter({ hasText: msg('news.alert.show') });

async function openPanel(page: Page, dashboard: Dash) {
  await dashboard.open(DEMO_ID);
  await page.getByTestId('news-button').click();
  await expect(page.getByTestId('news-card')).toBeVisible();
  await page.getByTestId('news-notify-settings').click();
  await expect(page.getByTestId('news-alerts-panel')).toBeVisible();
}

const seedAlerts = (worker: { uiPrefs: Record<string, Record<string, unknown>> }, a: [boolean, number], b: [boolean, number]) => {
  worker.uiPrefs[DEMO_ID] = { news_alerts: { alerts: [{ on: a[0], minutes: a[1] }, { on: b[0], minutes: b[1] }] } };
};

test.describe('NWS-03 Haber uyarıları', () => {
  test('Varsayılan: iki uyarı kapalı (60 ve 30 dk), özet "Kapalı"; açınca özet ve worker kaydı', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'granted');
    await openPanel(page, dashboard);
    await expect(page.getByTestId('news-notify-summary')).toHaveText(msg('news.alert.off'));
    for (const [i, min] of [[0, '60'], [1, '30']] as const) {
      await expect(page.getByTestId(`news-alert-switch-${i}`)).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId(`news-alert-min-${i}`)).toHaveValue(min);
    }
    await expect(page.getByTestId('news-alerts-permission')).toHaveAttribute('data-state', 'default');
    await page.getByTestId('news-alert-switch-0').click();
    await page.getByTestId('news-alert-switch-1').click();
    await expect(page.getByTestId('news-notify-summary')).toContainText('1 sa · 30 dk');
    await expect(page.getByTestId('news-alerts-permission')).toHaveAttribute('data-state', 'granted');
    await expect.poll(() => worker.uiPrefs[DEMO_ID]?.news_alerts).toEqual({ alerts: [{ on: true, minutes: 60 }, { on: true, minutes: 30 }] });
  });

  test('Dakika alanı: 1–1440 tam sayı; geçersiz değer hata gösterir ve kaydedilmez; 1 dk kabul', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'granted');
    await openPanel(page, dashboard);
    const input = page.getByTestId('news-alert-min-0');
    for (const bad of ['0', '1441', 'abc', '']) {
      await input.fill(bad);
      await expect(page.getByTestId('news-alert-error-0')).toBeVisible();
    }
    expect(worker.uiPrefs[DEMO_ID]?.news_alerts).toBeUndefined();
    await input.fill('1');
    await expect(page.getByTestId('news-alert-error-0')).toHaveCount(0);
    await expect(page.getByTestId('news-alert-eq-0')).toContainText('1 dk');
    await expect.poll(() => (worker.uiPrefs[DEMO_ID]?.news_alerts as { alerts: { minutes: number }[] } | undefined)?.alerts[0].minutes).toBe(1);
    // Yeniden yükleyince worker değeri gelir
    await dashboard.open(DEMO_ID); // neu laden mit Konto
    await page.getByTestId('news-button').click();
    await page.getByTestId('news-notify-settings').click();
    await expect(page.getByTestId('news-alert-min-0')).toHaveValue('1');
  });

  test('Sayfa geç açıldı: uyarı anı geçmiş, haber henüz olmamış → bir kez hemen, haber başına tek bildirim; yeniden yüklemede tekrar yok', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'granted');
    seedAlerts(worker, [true, 60], [true, 30]); // PCE 20 dk sonra: iki uyarı da geçmiş
    await dashboard.open(DEMO_ID);
    const toasts = alertToasts(page);
    await expect(toasts).toHaveCount(1);
    await expect(toasts.first()).toContainText('Çekirdek PCE');
    await expect(toasts.first()).toContainText(/(19|20) dk sonra/);
    // Saatli olmayan haberler (Fed Chair: saat belirsiz, Bank Holiday: gün boyu) ve süzgeç dışı para birimi uyarı vermez
    await page.clock.runFor(2 * 60_000);
    await expect(toasts).toHaveCount(1);
    const shown = await shownNotifications(page);
    expect(shown).toHaveLength(1);
    expect(shown[0].options.tag).toContain(`${NEWS_SOON_ID}@`);
    expect(shown[0].options.data.url).toBe(`/?news=${NEWS_SOON_ID}`);
    await dashboard.open(DEMO_ID); // neu laden mit Konto
    await page.waitForTimeout(1000);
    await expect(alertToasts(page)).toHaveCount(0);
    expect(await shownNotifications(page)).toHaveLength(0);
  });

  test('Tam ana zamanlayıcı: 15 dk ve 1 dk önce uyarıları kendi dakikasında gelir', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'granted');
    seedAlerts(worker, [true, 15], [true, 1]); // PCE +20: 15 dk uyarısı +5'te, 1 dk uyarısı +19'da
    await dashboard.open(DEMO_ID);
    await page.waitForTimeout(600); // ilk yoklama
    await expect(alertToasts(page)).toHaveCount(0);
    await page.clock.runFor(4 * 60_000);
    await expect(alertToasts(page)).toHaveCount(0);
    await page.clock.runFor(61_000);
    await expect(alertToasts(page)).toHaveCount(1);
    await expect(alertToasts(page).first()).toContainText(/(14|15) dk sonra/);
    await page.clock.runFor(14 * 60_000);
    await expect(alertToasts(page)).toHaveCount(2);
    await expect(alertToasts(page).last()).toContainText(/1 dk sonra/);
    expect(await shownNotifications(page)).toHaveLength(2);
  });

  test('İzin reddedildi: panel söyler, uygulama içi kart yine gelir, sistem bildirimi yok', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'denied');
    seedAlerts(worker, [false, 60], [true, 30]);
    await dashboard.open(DEMO_ID);
    await expect(alertToasts(page)).toHaveCount(1);
    expect(await shownNotifications(page)).toHaveLength(0);
    await page.getByTestId('news-button').click();
    await page.getByTestId('news-notify-settings').click();
    await expect(page.getByTestId('news-alerts-permission')).toHaveAttribute('data-state', 'denied');
    await expect(page.getByTestId('news-alerts-permission')).toContainText(msg('news.alert.perm.denied'));
  });

  test('İlk uyarı açılınca izin sorulur (reddedilirse not çıkar); anahtar yine kaydedilir', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'default');
    await openPanel(page, dashboard);
    await page.getByTestId('news-alert-switch-1').click();
    await expect(page.getByTestId('news-alerts-permission')).toHaveAttribute('data-state', 'denied'); // sahte requestPermission reddeder
    await expect.poll(() => worker.uiPrefs[DEMO_ID]?.news_alerts).toMatchObject({ alerts: [{ on: false }, { on: true, minutes: 30 }] });
  });

  test('Bildirim kartındaki "Haberi göster": kart açılır, haber vurgulanır (gün süzgecine uymasa da), adres temizlenir', { tag: '@NWS-03' }, async ({ page, dashboard, worker }) => {
    await fakeNotifications(page, 'granted');
    seedAlerts(worker, [false, 60], [true, 30]);
    await dashboard.open(DEMO_ID);
    await alertToasts(page).first().getByRole('button', { name: msg('news.alert.show') }).click();
    await expect(page.getByTestId('news-card')).toBeVisible();
    await expect(page.locator(`[data-testid="news-row"][data-event-id="${NEWS_SOON_ID}"]`)).toHaveAttribute('data-focused', 'true');
    await expect(page).not.toHaveURL(/news=/);
  });

  test('Haber kartı isteği: hesap açılışında /news/events bir kez istenir', { tag: '@NWS-03' }, async ({ page, dashboard }) => {
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/news/events')) requests.push(r.url()); });
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('news-button-label')).toContainText('USD');
    await page.waitForTimeout(1500);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('currencies=USD');
  });
});
