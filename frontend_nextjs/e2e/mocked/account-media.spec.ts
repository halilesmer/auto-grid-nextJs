/** ACC-12 · ACC-13 Hesap medyası: yükle, listele, sil, 3 sınırı, tür hatası; lazy önizleme (dosya yalnız tıklayınca iner). */
import type { Page } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const NOTE = '<b>Kasım planı</b>\nSatır 2';
const FILE_GET = new RegExp(`^/api/accounts/${DEMO_ID}/media/[0-9a-f]{12}$`);

async function openEdit(page: Page, dashboard: { open: (id: string | null) => Promise<void>; openAccountMenu: () => Promise<void> }) {
  await dashboard.open(DEMO_ID);
  await dashboard.openAccountMenu();
  await page.getByRole('button', { name: msg('account.action.editTitle') }).click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog.getByTestId('media-section')).toBeVisible();
  return dialog;
}

test.describe('ACC Hesap medyası', () => {
  test('Yükle, listele, sil, 3 sınırı ve tür hatası', { tag: '@ACC-12' }, async ({ page, worker, dashboard }) => {
    worker.seedMedia(DEMO_ID, 'strateji.pdf', PDF);
    const dialog = await openEdit(page, dashboard);
    const section = dialog.getByTestId('media-section');

    await expect(section.getByTestId('media-card')).toHaveCount(1);
    await expect(section.getByTestId('media-count')).toHaveText('1 / 3');
    expect(worker.callsTo('GET', `/api/accounts/${DEMO_ID}/media`)).toHaveLength(1);

    // İstemci ön kontrolü: desteklenmeyen uzantı sunucuya gitmez
    await section.getByTestId('media-input').setInputFiles({ name: 'kurulum.heic', mimeType: 'image/heic', buffer: Buffer.from('heic') });
    await expect(section.getByTestId('media-error')).toContainText(msg('media.error.type'));
    expect(worker.callsTo('POST', `/api/accounts/${DEMO_ID}/media`)).toHaveLength(0);

    // Sunucu içerikten karar verir: PNG adlı HTML 415 alır (hata kapatılabilir)
    await section.getByTestId('media-input').setInputFiles({ name: 'sahte.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>1</script>') });
    await expect(section.getByTestId('media-error')).toContainText(msg('media.error.type'));
    await expect(section.getByTestId('media-card')).toHaveCount(1);
    await section.getByRole('button', { name: msg('ui.dismiss') }).click();
    await expect(section.getByTestId('media-error')).toBeHidden();

    // Yükleme: ham gövde, ?name=, dosya türü Content-Type olarak
    await section.getByTestId('media-input').setInputFiles({ name: 'eurusd-h4.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(section.getByTestId('media-card')).toHaveCount(2);
    const [upload] = worker.callsTo('POST', `/api/accounts/${DEMO_ID}/media`).slice(-1);
    expect(upload.query.get('name')).toBe('eurusd-h4.png');
    expect(worker.media[DEMO_ID].map((m) => m.name)).toEqual(['strateji.pdf', 'eurusd-h4.png']);

    await section.getByTestId('media-input').setInputFiles({ name: 'plan.md', mimeType: 'text/markdown', buffer: Buffer.from(NOTE) });
    await expect(section.getByTestId('media-card')).toHaveCount(3);
    await expect(section.getByTestId('media-count')).toHaveText('3 / 3');
    // Sınır doldu: ekleme alanı yok, neden satırı var
    await expect(section.getByTestId('media-add')).toHaveCount(0);
    await expect(section).toContainText(msg('media.full'));

    // Silme ConfirmModal ile; Escape yalnız soruyu kapatır, hesap formu açık kalır
    await section.getByRole('button', { name: msg('media.delete.aria', { name: 'plan.md' }) }).click();
    const question = page.getByRole('dialog').filter({ hasText: msg('media.delete.title') }).last();
    await expect(question).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question).toBeHidden();
    await expect(dialog.getByRole('heading', { name: msg('account.dialog.edit') })).toBeVisible();
    expect(worker.callsTo('DELETE', /\/media\//)).toHaveLength(0);

    await section.getByRole('button', { name: msg('media.delete.aria', { name: 'plan.md' }) }).click();
    await page.getByRole('dialog').filter({ hasText: msg('media.delete.title') }).last().getByRole('button', { name: msg('confirm.delete') }).click();
    await expect(section.getByTestId('media-card')).toHaveCount(2);
    await expect(section.getByTestId('media-add')).toHaveCount(1);
    expect(worker.callsTo('DELETE', /\/media\/[0-9a-f]{12}$/)).toHaveLength(1);
  });

  test('Yeni hesapta medya yok, bilgi satırı var', { tag: '@ACC-12' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await dashboard.openAccountMenu();
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog.getByTestId('media-section')).toContainText(msg('media.pending'));
    await expect(dialog.getByTestId('media-add')).toHaveCount(0);
    expect(worker.callsTo('GET', /\/media/)).toHaveLength(0);
  });

  test('Liste alınamazsa Tekrar dene', { tag: '@ACC-12' }, async ({ page, worker, dashboard }) => {
    worker.overrides.set(`GET /api/accounts/${DEMO_ID}/media`, { status: 500, body: { detail: 'boom' } });
    const dialog = await openEdit(page, dashboard);
    await expect(dialog.getByTestId('media-section').getByRole('alert')).toContainText('boom');
    worker.overrides.clear();
    await dialog.getByRole('button', { name: msg('media.retry') }).click();
    await expect(dialog.getByTestId('media-add')).toBeVisible();
  });

  test('Dosya yalnız tıklayınca iner, ikinci açılış önbellekten gelir', { tag: '@ACC-13' }, async ({ page, worker, dashboard }) => {
    worker.seedMedia(DEMO_ID, 'eurusd-h4.png', PNG_1X1);
    worker.seedMedia(DEMO_ID, 'plan.md', Buffer.from(NOTE));
    worker.mediaDownloadDelayMs = 400;
    const dialog = await openEdit(page, dashboard);
    const section = dialog.getByTestId('media-section');
    await expect(section.getByTestId('media-card')).toHaveCount(2);

    // Açılışta yalnız liste: dosya GET'i sıfır
    expect(worker.callsTo('GET', FILE_GET)).toHaveLength(0);

    await section.getByTestId('media-card').first().getByTestId('media-preview').click();
    await expect(page.getByRole('status').filter({ hasText: msg('media.preview.loading') })).toBeVisible();
    await expect(page.getByTestId('media-preview-image')).toBeVisible();
    expect(worker.callsTo('GET', FILE_GET)).toHaveLength(1);
    await expect(page.getByTestId('media-preview-name')).toHaveText('eurusd-h4.png');

    // Escape yalnız önizlemeyi kapatır
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('media-preview-dialog')).toBeHidden();
    await expect(dialog.getByRole('heading', { name: msg('account.dialog.edit') })).toBeVisible();

    // İkinci açılış yeni istek atmaz
    await section.getByTestId('media-card').first().getByTestId('media-preview').click();
    await expect(page.getByTestId('media-preview-image')).toBeVisible();
    expect(worker.callsTo('GET', FILE_GET)).toHaveLength(1);
    await page.getByTestId('media-preview-close').click();
    await expect(page.getByTestId('media-preview-dialog')).toBeHidden();

    // Not düz metin: HTML etiketleri işlenmez
    await section.getByTestId('media-card').nth(1).getByTestId('media-preview').click();
    const note = page.getByTestId('media-preview-note');
    await expect(note).toHaveText(NOTE);
    await expect(note.locator('b')).toHaveCount(0);
    expect(worker.callsTo('GET', FILE_GET)).toHaveLength(2);
  });

  test('İndirme sürerken kapatmak isteği iptal eder', { tag: '@ACC-13' }, async ({ page, worker, dashboard }) => {
    worker.seedMedia(DEMO_ID, 'strateji.pdf', PDF);
    worker.mediaDownloadDelayMs = 1500;
    const aborted: string[] = [];
    page.on('requestfailed', (r) => FILE_GET.test(new URL(r.url()).pathname) && aborted.push(r.failure()?.errorText ?? ''));
    const dialog = await openEdit(page, dashboard);
    await dialog.getByTestId('media-preview').click();
    const preview = page.getByTestId('media-preview-dialog');
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('button', { name: msg('media.preview.download') })).toBeDisabled();
    await page.getByTestId('media-preview-close').click();
    await expect(preview).toBeHidden();
    // Kapatmak süren isteği gerçekten iptal etti (tarayıcı isteği düşürdü)
    await expect.poll(() => aborted.length).toBeGreaterThan(0);
    await dialog.getByTestId('media-preview').click();
    await expect(page.getByTestId('media-preview-pdf')).toBeVisible();
  });
});
