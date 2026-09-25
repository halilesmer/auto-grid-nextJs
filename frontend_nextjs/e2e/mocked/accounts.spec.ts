/** ACC · Konten: Liste, Anlegen, Duplikat, Bearbeiten, Löschen, Auswahl, LIVE/TEST-Kennzeichnung. */
import { DEMO_ID, LIVE_ID, MT5_PATH, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

test.describe('ACC Konten', () => {
  test('Kontoliste zeigt alle Konten', { tag: '@ACC-01' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    await expect(dashboard.accountSelect).toHaveText(msg('account.select.placeholder'));
    const options = await dashboard.accountOptions();
    await expect(options).toHaveText([/^E2E Demo \(1001\)DEMO$/, /^E2E Live \(2002\)LIVE$/]);
    await dashboard.closeAccountList();
    await expect(page.getByText(msg('dashboard.empty.title'))).toBeVisible();
  });

  test('Kontoauswahl lädt Zonen und allgemeine Einstellungen', { tag: '@ACC-06' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    await expect(page.getByText(msg('dashboard.empty.title'))).toBeVisible();

    await dashboard.selectAccount(DEMO_ID);
    await expect(page.getByText(msg('dashboard.empty.title'))).toBeHidden();
    await expect(page.getByTestId('zone-count')).toHaveText('1');
    await expect(dashboard.zone().getByPlaceholder(/Sembol Ara/)).toHaveValue('USOUSD');
    await expect(page.getByLabel(msg('settings.interval'))).toHaveValue('2');

    // Wechsel auf ein Konto ohne Zonen: alte Zonen verschwinden, Intervall des neuen Kontos
    await dashboard.selectAccount(LIVE_ID);
    await expect(page.getByText(msg('zone.panel.empty.title'))).toBeVisible();
    await expect(page.getByLabel(msg('settings.interval'))).toHaveValue('1');
  });

  test('LIVE/TEST-Kennzeichnung', { tag: '@ACC-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('env-badge')).toHaveText(msg('dashboard.env.test'));
    const envBadge = (env: string) => page.locator('main span').filter({ hasText: new RegExp(`^${env}$`) });
    await expect(envBadge('DEMO')).toBeVisible();

    await dashboard.selectAccount(LIVE_ID);
    await expect(page.getByTestId('env-badge')).toHaveText(msg('dashboard.env.live'));
    await expect(envBadge(msg('dashboard.env.live')).last()).toBeVisible();
  });

  test('Neues Konto: Pflichtfelder und Anlegen', { tag: '@ACC-02' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: msg('account.dialog.new') })).toBeVisible();

    await dialog.getByRole('button', { name: msg('common.save') }).click();
    for (const message of [
      msg('account.validation.name'),
      msg('account.validation.login'),
      msg('account.validation.password'),
      msg('account.validation.server'),
      msg('account.validation.path'),
    ]) {
      await expect(dialog.getByText(message)).toBeVisible();
    }
    expect(worker.callsTo('POST', '/api/accounts')).toHaveLength(0);

    await dialog.getByPlaceholder(msg('account.form.name.placeholder')).fill('Neues Demo');
    await dialog.getByPlaceholder(msg('account.form.login.placeholder')).fill('3003');
    await dialog.getByPlaceholder(msg('account.form.password.placeholder')).fill('pw-' + 'neu');
    await dialog.getByPlaceholder(msg('account.form.server.placeholder')).fill('Broker-Demo');
    await dialog.getByLabel(msg('account.path.select.aria')).selectOption(MT5_PATH);
    await dialog.getByRole('button', { name: msg('common.save') }).click();

    await expect(dialog).toBeHidden();
    await expect(dashboard.accountSelect).toHaveText('Neues Demo (3003)');
    await expect((await dashboard.accountOptions()).filter({ hasText: 'Neues Demo (3003)' })).toHaveCount(1);
    const [call] = worker.callsTo('POST', '/api/accounts');
    expect(call.body).toMatchObject({ id: '3003', login: 3003, env_type: 'DEMO', mt5_path: MT5_PATH });
  });

  test('Doppelter Login: Rückfrage, kein zweites Konto', { tag: '@ACC-03' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(msg('account.form.name.placeholder')).fill('Doppelt');
    await dialog.getByPlaceholder(msg('account.form.login.placeholder')).fill(DEMO_ID);
    await dialog.getByPlaceholder(msg('account.form.password.placeholder')).fill('pw-' + 'neu');
    await dialog.getByPlaceholder(msg('account.form.server.placeholder')).fill('Broker-Demo');
    await dialog.getByLabel(msg('account.path.select.aria')).selectOption(MT5_PATH);

    // „Bestehendes bearbeiten?“ (ConfirmModal über dem Formular) bestätigen → Formular wechselt auf das vorhandene Konto
    await dialog.getByRole('button', { name: msg('common.save') }).click();
    // Die Rückfrage liegt im Formular-<dialog> (Top Layer) → innerster passender Dialog
    const question = page.getByRole('dialog').filter({ hasText: msg('account.duplicate.title') }).last();

    // Escape schließt nur die Rückfrage, das Formular bleibt offen
    await expect(question).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question).toBeHidden();
    await expect(dialog.getByRole('heading', { name: msg('account.dialog.new') })).toBeVisible();
    await dialog.getByRole('button', { name: msg('common.save') }).click();

    await expect(question).toContainText(msg('account.duplicate.message', { name: 'E2E Demo', login: DEMO_ID }));
    await question.getByRole('button', { name: msg('account.action.edit'), exact: true }).click();
    await expect(question).toBeHidden();

    await expect(dialog.getByRole('heading', { name: msg('account.dialog.edit') })).toBeVisible();
    await expect(dialog.getByPlaceholder(msg('account.form.name.placeholder'))).toHaveValue('E2E Demo');
    await expect(dashboard.accountSelect).toHaveText(`E2E Demo (${DEMO_ID})`);
    expect(worker.callsTo('POST', '/api/accounts')).toHaveLength(0);
    expect(worker.state.accounts).toHaveLength(2);
  });

  test('Konto bearbeiten: Passwort bleibt, Änderung bleibt erhalten', { tag: '@ACC-04' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('account.action.editTitle') }).click();
    const dialog = page.getByRole('dialog');
    const password = dialog.getByPlaceholder(msg('account.form.password.keep'));
    await expect(password).toHaveValue('');

    await dialog.getByPlaceholder(msg('account.form.name.placeholder')).fill('E2E Demo umbenannt');
    await dialog.getByRole('button', { name: msg('common.save') }).click();
    await expect(dialog).toBeHidden();

    const [call] = worker.callsTo('PUT', `/api/accounts/${DEMO_ID}`);
    expect(call.body).toMatchObject({ account_name: 'E2E Demo umbenannt', password: '' });
    expect(worker.state.accounts[0].password).toBe('pw-' + 'demo');

    await page.reload();
    await expect((await dashboard.accountOptions()).filter({ hasText: 'E2E Demo umbenannt (1001)' })).toHaveCount(1);
  });

  test('Bearbeiten und Löschen gesperrt, solange der Bot läuft', { tag: ['@ACC-04', '@ACC-05'] }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.running'));
    await expect(page.getByRole('button', { name: msg('account.action.editBlocked') })).toBeDisabled();
    await expect(page.getByRole('button', { name: msg('account.action.deleteBlocked') })).toBeDisabled();
  });

  test('Konto löschen', { tag: '@ACC-05' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('account.action.deleteTitle') }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(msg('account.delete.message', { name: 'E2E Demo' }));
    await modal.getByRole('button', { name: msg('account.action.delete') }).click();

    await expect(dashboard.accountSelect).toHaveText(`E2E Live (${LIVE_ID})`);
    await expect((await dashboard.accountOptions()).filter({ hasText: 'E2E Demo (1001)' })).toHaveCount(0);
    expect(worker.callsTo('DELETE', `/api/accounts/${DEMO_ID}`)).toHaveLength(1);
  });
});
