/**
 * USR-09/USR-10 · Kapsamlı ayar penceresi (plan 1114-A4 S1): kişisel tercihler worker'da, anında kayıt,
 * hatada geri dönüş, ipucu gecikmesi ve görünme süresi, telefonda menüden bölüme geçiş.
 */
import { connectWithKey } from '../fixtures/connection';
import { E2E_USER_KEY, MOCK_API } from '../fixtures/env';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

type Page = import('@playwright/test').Page;

const dialog = (page: Page) => page.getByTestId('settings-dialog');
async function openSettings(page: Page) {
  await page.getByTestId('settings-open').click();
  await expect(dialog(page)).toBeVisible();
}

test.describe('USR-09 Kişisel tercihler worker’da', () => {
  test('Tema anında kaydedilir: worker’da admin kimliğiyle durur, durum ve toast görünür, yenilemede kalır', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    worker.userPrefsDelayMs = 1500;
    await dashboard.open(DEMO_ID);
    await openSettings(page);

    await page.getByTestId('settings-theme-light').click();
    await expect(page.getByTestId('pref-status-theme')).toHaveAttribute('data-status', 'saving');
    await expect(page.getByTestId('settings-foot')).toHaveAttribute('data-state', 'saving');
    await expect(page.getByTestId('pref-status-theme')).toHaveAttribute('data-status', 'saved');
    await expect(page.getByTestId('settings-foot')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByText(msg('prefs.toast.value', { name: msg('common.theme'), value: msg('common.theme.light') }))).toBeVisible();
    expect(worker.userPrefs.admin.theme).toEqual({ theme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // yenileme: önbellek + worker aynı değeri verir
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(worker.callsTo('GET', '/api/me/prefs').length).toBeGreaterThan(0);
  });

  test('Başka cihaz: worker’daki değer yerel önbelleği ezer', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { locale: { locale: 'en' }, theme: { theme: 'light' }, tooltip_delay: { mode: 'instant', ms: 450 } };
    void dashboard;
    await page.goto('/'); // Dashboard.open wartet auf tr-Beschriftungen; hier wechselt die Sprache nach dem Laden
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('Kayıt başarısızsa değer eski hâline döner, satırda ✕ ve uzun hata toast’u çıkar', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    worker.userPrefsFail = true;
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    await page.getByTestId('settings-lang-en').click();
    await expect(page.getByTestId('pref-status-locale')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('settings-foot')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('settings-lang-tr')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByText(msg('prefs.toast.failed.text', { name: msg('common.language') }))).toBeVisible();
    expect(worker.userPrefs.admin ?? {}).toEqual({});
  });

  test('Dil seçimi (ayar penceresi) worker’a yazılır', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-lang-de').click();
    await expect.poll(() => worker.userPrefs.admin?.locale).toEqual({ locale: 'de' });
  });

  test('Kullanıcının tercihi kendi kimliğiyle saklanır; Kullanıcılar ve Sistem bölümleri görünmez', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    const anna = worker.addUser('Anna');
    worker.setOwner(DEMO_ID, anna.id);
    await connectWithKey(page, MOCK_API, E2E_USER_KEY);
    await dashboard.open(null);
    await openSettings(page);
    await expect(page.getByTestId('settings-nav-users')).toHaveCount(0);
    await expect(page.getByTestId('settings-nav-system')).toHaveCount(0);
    await page.getByTestId('settings-theme-light').click();
    await expect.poll(() => worker.userPrefs[anna.id]?.theme).toEqual({ theme: 'light' });
    expect(worker.userPrefs.admin).toBeUndefined();
  });
});

test.describe('USR-10 Ayar penceresi', () => {
  test('Menü grupları: yedi bölüm (Bildirimler ve Grafik dahil), admin bölümleri var; Bağlantıyı değiştir bağlantı penceresini açar', { tag: '@USR-10' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    for (const id of ['appearance', 'notifications', 'chart', 'connection', 'robot', 'users', 'system']) {
      await expect(page.getByTestId(`settings-nav-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('settings-nav').getByRole('button')).toHaveCount(7);
    await page.getByTestId('settings-nav-connection').click();
    await expect(page.getByTestId('settings-conn-status')).toHaveAttribute('data-status', 'connected');
    await page.getByTestId('settings-conn-change').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('connection-dialog')).toBeVisible();
  });

  test('İpucu gecikmesi: Hemen seçiliyken alan 0 gösterir ve kapalıdır; Özel son değeri getirir; geçersiz değer kaydedilmez', { tag: '@USR-10' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    const input = page.getByTestId('settings-delay-input');
    await expect(input).toHaveValue('0,3');
    await page.getByTestId('settings-delay-instant').click();
    await expect(input).toBeDisabled();
    await expect(input).toHaveValue('0');
    await expect.poll(() => worker.userPrefs.admin?.tooltip_delay).toEqual({ mode: 'instant', ms: 300 });

    await page.getByTestId('settings-delay-custom').click();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('0,3');

    await input.fill('99');
    await input.press('Enter');
    await expect(page.getByTestId('settings-delay-input-help')).toHaveText(msg('sdlg.delay.error', { min: 0.1, max: 10 }));
    await expect(input).toHaveValue('0,3');

    await input.fill('1.5'); // nokta da kabul edilir
    await input.press('Enter');
    await expect.poll(() => worker.userPrefs.admin?.tooltip_delay).toEqual({ mode: 'custom', ms: 1500 });
    await expect(input).toHaveValue('1,5');
  });

  test('İpucu gecikmesi ve görünme süresi gerçek ipucuna uygulanır', { tag: '@USR-10' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    const tryBtn = page.getByTestId('settings-try');
    const tip = page.getByRole('tooltip');

    // varsayılan: 300 ms bekler
    await tryBtn.hover();
    await expect(tip).toHaveText(msg('sdlg.try.text'));
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);

    // Hemen: bekleme yok; yine de fare çekilince kapanır
    await page.getByTestId('settings-delay-instant').click();
    await tryBtn.hover();
    await expect(tip).toBeVisible({ timeout: 150 });
    await page.mouse.move(5, 5);

    // Özel görünme süresi 1 sn: fare üstünde kalsa da kapanır
    await page.getByTestId('settings-hold-custom').click();
    const hold = page.getByTestId('settings-hold-input');
    await hold.fill('1');
    await hold.press('Enter');
    await expect.poll(() => worker.userPrefs.admin?.tooltip_hold).toEqual({ mode: 'custom', ms: 1000 });
    // Alan kayıttan sonra odağı korur (USR-13); odak ipucu açık kalmasın diye alandan çıkılır
    await hold.blur();
    await tryBtn.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveCount(0, { timeout: 3000 });
  });

  test.describe('Telefon (375 px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('Önce bölüm listesi ve özetler; dokununca bölüm, geri düğmesi listeye döner; yatay kayma yok', { tag: '@USR-10' }, async ({ page, dashboard }) => {
      await dashboard.open(DEMO_ID);
      await openSettings(page);
      await expect(page.getByTestId('settings-nav')).toBeVisible();
      await expect(page.getByTestId('settings-pane')).toBeHidden();
      await expect(page.getByTestId('settings-sum-appearance')).toContainText('Türkçe');
      await expect(page.getByTestId('settings-sum-appearance')).toContainText('300 ms');
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);

      await page.getByTestId('settings-nav-appearance').click();
      await expect(page.getByTestId('settings-pane')).toBeVisible();
      await expect(page.getByTestId('settings-nav')).toBeHidden();
      await expect(page.getByTestId('settings-title')).toHaveText(msg('sdlg.sec.appearance'));
      const box = await page.getByTestId('settings-body').boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      const scroll = await page.getByTestId('settings-body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(scroll).toBeLessThanOrEqual(0);
      expect(await overflow()).toBeLessThanOrEqual(0);

      await page.getByTestId('settings-back').click();
      await expect(page.getByTestId('settings-nav')).toBeVisible();
      await expect(page.getByTestId('settings-pane')).toBeHidden();
    });
  });
});

test.describe('USR-10 Saniye alanı (1115-A10 F12)', () => {
  test('değişmeden alandan çıkmak kayıt yapmaz; yuvarlanan değer yeniden yazılmaz', { tag: '@USR-10' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { tooltip_hold: { mode: 'custom', ms: 1234 } };
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    const input = page.getByTestId('settings-hold-input');
    await expect(input).toHaveValue(/1[.,]23$/);
    await input.focus();
    await input.blur();
    await page.waitForTimeout(500);
    expect(worker.callsTo('PUT', '/api/me/prefs/tooltip_hold')).toHaveLength(0);
    expect(worker.userPrefs.admin.tooltip_hold).toEqual({ mode: 'custom', ms: 1234 });

    // Değişen metin kaydedilir
    await input.fill('2');
    await input.press('Enter');
    await expect.poll(() => worker.userPrefs.admin.tooltip_hold).toEqual({ mode: 'custom', ms: 2000 });
  });
});

test.describe('USR-09 Tünel kapalı, sekmeler arası eşitleme (1115-A10 F10, F11)', () => {
  test('F10: tünel kapalıyken (ngrok 404) yazma sessizce kaybolmaz: değer geri alınır, “Kaydedilemedi” ve “Tekrar dene” çıkar', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { theme: { theme: 'dark' } };
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    worker.overrides.set('PUT /api/me/prefs/theme', { status: 404, body: { detail: 'tunnel' }, headers: { 'ngrok-error-code': 'ERR_NGROK_3200' } });
    await page.getByTestId('settings-theme-light').click();
    await expect(page.getByTestId('pref-status-theme')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByText(msg('prefs.toast.failed')).first()).toBeVisible();
    await expect(page.getByRole('button', { name: msg('sdlg.load.retry') }).first()).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('F10: worker’ın kendi 404’ü (eski worker) hata sayılmaz: değer bu oturumda kalır', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { theme: { theme: 'dark' } };
    await dashboard.open(DEMO_ID);
    await openSettings(page);
    worker.overrides.set('PUT /api/me/prefs/theme', { status: 404, body: { detail: 'Not Found' } });
    await page.getByTestId('settings-theme-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByTestId('pref-status-theme')).toHaveCount(0);
  });

  test('F11: bir sekmede kaydedilen değer öbür sekmede görünür (BroadcastChannel)', { tag: '@USR-09' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { theme: { theme: 'dark' } };
    await dashboard.open(DEMO_ID);
    const other = await page.context().newPage();
    await worker.install(other);
    await other.goto(page.url());
    await expect(other.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveClass(/dark/);

    await openSettings(other);
    await other.getByTestId('settings-theme-light').click();
    await expect.poll(() => worker.userPrefs.admin.theme).toEqual({ theme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await other.close();
  });
});
