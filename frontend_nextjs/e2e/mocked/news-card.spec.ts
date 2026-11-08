/** NWS-02 · Haber kartı (plan 1107-A16 S2): Düğme, kart, filtreler, ok renkleri, kayıt, gizli sayfalar, 375 px. */
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { NEWS_SOON_ID, installNewsClock, newsFixture } from '../fixtures/news';

test.beforeEach(async ({ page, worker }) => {
  await installNewsClock(page);
  worker.newsEvents = newsFixture();
});

type Dash = import('../fixtures/dashboard').Dashboard;

// Dashboard: dort liegen die Zonen-Symbole des Kontos (Standard-Währung USD aus USOUSD) im Store
async function openCard(page: import('@playwright/test').Page, dashboard: Dash) {
  await dashboard.open(DEMO_ID);
  const button = page.getByTestId('news-button');
  await expect(button).toBeVisible();
  await expect(page.getByTestId('news-button-label')).toContainText('USD');
  await button.click();
  await expect(page.getByTestId('news-card')).toBeVisible();
  await expect(page.getByTestId('news-row').first()).toBeVisible();
}

test.describe('NWS-02 Haber kartı', () => {
  test('Düğme sıradaki haberi sayar, kart varsayılan filtreyle 5 satır gösterir', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const button = page.getByTestId('news-button');
    await expect(button).toHaveAttribute('data-soon', 'true');
    await expect(page.getByTestId('news-button-label')).toHaveText(/USD 2\d dk|USD 1\d dk/);
    await expect(page.getByTestId('news-dot')).toBeVisible();
    await button.click();
    const rows = page.getByTestId('news-row');
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('news-day-group').first().locator('div').first()).toHaveText(msg('news.day.d0'));
    await expect(page.locator(`[data-testid="news-row"][data-event-id="${NEWS_SOON_ID}"]`)).toHaveAttribute('data-soon', 'true');
    await expect(rows.filter({ hasText: 'Çekirdek PCE' })).toHaveCount(1); // başlık sayfa dilinde (lang=tr)
    await expect(page.getByTestId('news-saved')).toHaveCount(0);
    await expect(page.getByTestId('news-notify')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('news-card')).toHaveCount(0);
  });

  test('Satır: saat belirsiz, gün boyu, birim ve düzeltme', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await openCard(page, dashboard);
    await expect(page.getByTestId('news-row').filter({ hasText: 'Fed Chair Speech' }).getByTestId('news-time')).toHaveText(msg('news.time.tentative'));
    await expect(page.getByTestId('news-row').filter({ hasText: 'Bank Holiday' }).getByTestId('news-time')).toHaveText(msg('news.time.allday'));
    const sales = page.getByTestId('news-row').filter({ hasText: 'Retail Sales' });
    await expect(sales).toContainText('0,4%');
    await expect(sales).toContainText(msg('news.rev', { v: '0,25%' }));
  });

  test('Ok renkleri: yayından önce soluk beklenti yönü, sonra MT5 etkisi', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await openCard(page, dashboard);
    const row = (title: string) => page.getByTestId('news-row').filter({ hasText: title });
    const pre = row('Çekirdek PCE').getByTestId('news-arrow');
    await expect(pre).toHaveAttribute('data-dir', 'up');
    await expect(pre).toHaveAttribute('data-released', 'false');
    await expect(pre).toHaveClass(/text-success/);
    await expect(pre).toHaveClass(/opacity-60/);
    const jobs = row('Unemployment Rate').getByTestId('news-arrow');
    await expect(jobs).toHaveAttribute('data-dir', 'down');
    await expect(jobs).toHaveClass(/text-danger/);
    const post = row('Retail Sales').getByTestId('news-arrow');
    await expect(post).toHaveAttribute('data-dir', 'up');
    await expect(post).toHaveAttribute('data-released', 'true');
    await expect(post).not.toHaveClass(/opacity-60/);
    await expect(row('Retail Sales').getByTestId('news-actual')).toHaveClass(/text-success/);
    await expect(row('Fed Chair Speech').getByTestId('news-arrow')).toHaveCount(0); // impact none, yayınlanmamış, beklenti yok
    // İpucu: rakam cümlesi + sektöre göre "genelde" yorumu
    await pre.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('0,3%');
    await expect(tip).toContainText(msg('news.sector.prices.good'));
    // Tatil sektörü: yorum yok
    await expect(row('Bank Holiday').getByTestId('news-arrow')).toHaveCount(0);
  });

  test('Para birimi: katlı satır, Düzenle, Temizle, Sembollerden doldur; EUR eklenince negatif ok', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await openCard(page, dashboard);
    const summary = page.getByTestId('news-ccy-summary');
    await expect(summary).toHaveText('USD'); // zone sembolü USOUSD → USD
    await page.getByTestId('news-ccy-edit').click();
    await expect(page.getByTestId('news-ccy-list')).toBeVisible();
    await page.getByTestId('news-ccy-clear').click();
    await expect(summary).toHaveText('–');
    await expect(page.getByText(msg('news.state.empty.title'))).toBeVisible();
    await page.getByTestId('news-ccy-EUR').click();
    await expect(summary).toHaveText('EUR');
    await expect(page.getByTestId('news-row').filter({ hasText: 'ECB Rate Decision' }).getByTestId('news-arrow')).toHaveAttribute('data-dir', 'down');
    await expect(page.getByTestId('news-row').filter({ hasText: 'ECB Rate Decision' }).getByTestId('news-arrow')).toHaveClass(/text-danger/);
    await page.getByTestId('news-ccy-fill').click();
    await expect(summary).toHaveText('USD');
    await page.getByTestId('news-ccy-edit').click();
    await expect(page.getByTestId('news-ccy-list')).toHaveCount(0);
  });

  test('Önem çoklu seçim; Gün: aralık seçilince tek günler kapanır', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await openCard(page, dashboard);
    await page.getByTestId('news-ccy-edit').click();
    await page.getByTestId('news-ccy-EUR').click();
    const rows = page.getByTestId('news-row');
    await expect(rows).toHaveCount(6); // + ECB (EUR, yüksek); ZEW orta
    await page.getByTestId('news-imp-moderate').click();
    await expect(page.getByTestId('news-imp-high')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(7);
    await page.getByTestId('news-day-d-1').click();
    await expect(rows.filter({ hasText: 'ISM Services' })).toHaveCount(1);
    await expect(page.getByTestId('news-day-group').first().locator('div').first()).toHaveText(msg('news.day.d-1'));
    await page.getByTestId('news-day-week').click();
    for (const d of ['d-1', 'd0', 'd1']) {
      await expect(page.getByTestId(`news-day-${d}`)).toBeDisabled();
      await expect(page.getByTestId(`news-day-${d}`)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(rows.filter({ hasText: 'Nonfarm Payrolls' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'FOMC Minutes' })).toHaveCount(0);
    await page.getByTestId('news-day-month').click();
    await expect(page.getByTestId('news-day-week')).toHaveAttribute('aria-pressed', 'false');
    await expect(rows.filter({ hasText: 'FOMC Minutes' })).toHaveCount(1);
    await page.getByTestId('news-day-month').click();
    await expect(page.getByTestId('news-day-d0')).toBeEnabled();
  });

  test('Filtre hesap başına worker\'a kaydedilir: "✓ Kaydedildi" rozeti, sayfaya dönünce aynı filtre', { tag: '@NWS-02' }, async ({ page, worker, dashboard }) => {
    await openCard(page, dashboard);
    await page.getByTestId('news-imp-low').click();
    await page.getByTestId('news-day-d-1').click();
    await expect(page.getByTestId('news-saved')).toHaveAttribute('data-kind', 'worker');
    await expect.poll(() => worker.uiPrefs[DEMO_ID]?.news_filter).toMatchObject({ impacts: ['high', 'low'], days: ['d-1', 'd0', 'd1'] });
    await expect(page.getByTestId('news-saved')).toHaveCount(0, { timeout: 5000 });
    await page.goto('/vps');
    await expect(page.getByTestId('news-button')).toHaveCount(0);
    await dashboard.open(DEMO_ID);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-low')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-day-d-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Tarayıcı yedeği silinse de filtre worker\'dan geri gelir; eski yanıt yeni seçimi ezmez', { tag: '@NWS-02' }, async ({ page, worker, dashboard }) => {
    worker.uiPrefs[DEMO_ID] = { news_filter: { impacts: ['moderate'], days: ['week'], currencies: ['EUR'] } };
    await dashboard.open(DEMO_ID);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-imp-high')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('news-day-week')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-ccy-summary')).toHaveText('EUR');
    // Yedek kopya da güncellendi
    expect(await page.evaluate((k) => localStorage.getItem(k), `grid-robot-news-filter:${DEMO_ID}`)).toContain('"moderate"');
    // Kopyayı sil, yenile: filtre yine worker'dan gelir
    await page.evaluate((k) => localStorage.removeItem(k), `grid-robot-news-filter:${DEMO_ID}`);
    await dashboard.open(DEMO_ID);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-imp-moderate')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('news-day-week')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Worker hatasında filtre tarayıcıda kalır ve rozet bunu söyler', { tag: '@NWS-02' }, async ({ page, worker, dashboard }) => {
    worker.uiPrefsFail = true;
    await openCard(page, dashboard);
    await page.getByTestId('news-imp-low').click();
    await expect(page.getByTestId('news-saved')).toHaveAttribute('data-kind', 'local');
    await expect(page.getByTestId('news-saved')).toHaveText(msg('news.savedLocal'));
    expect(worker.uiPrefs[DEMO_ID]).toBeUndefined();
    expect(await page.evaluate((k) => localStorage.getItem(k), `grid-robot-news-filter:${DEMO_ID}`)).toContain('"low"');
    await page.getByTestId('news-saved').hover();
    await expect(page.getByRole('tooltip')).toContainText(msg('news.savedLocal.hint'));
  });

  test('/vps ve /users sayfalarında düğme yok', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('news-button')).toBeVisible();
    for (const path of ['/vps', '/users']) {
      await page.goto(path);
      await expect(page.getByTestId('app-nav')).toBeVisible();
      await expect(page.getByTestId('news-button')).toHaveCount(0);
    }
  });

  test('Veri durumu: kaynak yok ve eski veri uyarısı', { tag: '@NWS-02' }, async ({ page, worker, dashboard }) => {
    worker.newsStale = true;
    await openCard(page, dashboard);
    await expect(page.getByText(msg('news.state.stale.title'))).toBeVisible();
    await expect(page.getByTestId('news-button')).toHaveAttribute('data-dim', 'true');
    await expect(page.getByTestId('news-dot')).toHaveCount(0);
    worker.newsStale = false;
    worker.newsAvailable = false;
    worker.newsEvents = [];
    await page.getByTestId('news-ccy-edit').click(); // süzgeç değişince yeniden sorgu
    await page.getByTestId('news-imp-low').click();
    await expect(page.getByText(msg('news.state.nosource.title'))).toBeVisible();
    worker.newsAvailable = true;
    await page.getByTestId('news-retry').click();
    await expect(page.getByText(msg('news.state.empty.title'))).toBeVisible();
  });

  test('375 px: yalnız simge, kart ekrana sığar, taşma yok', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await dashboard.open(DEMO_ID);
    const button = page.getByTestId('news-button');
    await expect(button).toBeVisible();
    await expect(page.getByTestId('news-button-label')).toBeHidden();
    await expect(page.getByTestId('news-dot')).toBeVisible();
    await button.click();
    const box = await page.getByTestId('news-card').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.getByTestId('news-ccy-edit').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

test.describe('NWS-02 Deutsch', () => {
  test.use({ appLocale: 'de' });
  test('Kartenbeschriftung und Titel in der Seitensprache', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-card')).toContainText(msg('news.title', undefined, 'de'));
    await expect(page.getByTestId('news-imp-high')).toHaveText(msg('news.imp.high', undefined, 'de'));
  });

});

test.describe('NWS-02 Hesap seçili değil', () => {
  test('Hesap seçili değil: kart yüklemede takılmaz, tüm para birimleriyle haberleri gösterir', { tag: '@NWS-02' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    await page.getByTestId('news-button').click();
    await expect(page.getByTestId('news-card')).toBeVisible();
    await expect(page.getByTestId('news-row').first()).toBeVisible();
    await expect(page.getByTestId('news-ccy-summary')).toContainText('EUR'); // hepsi: USD EUR GBP …
  });
});
