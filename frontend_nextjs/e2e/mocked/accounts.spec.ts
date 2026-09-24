/** ACC · Konten: Liste, Anlegen, Duplikat, Bearbeiten, Löschen, Auswahl, LIVE/TEST-Kennzeichnung. */
import { DEMO_ID, LIVE_ID, MT5_PATH, expect, test } from '../fixtures/test';

test.describe('ACC Konten', () => {
  test('Kontoliste zeigt alle Konten', { tag: '@ACC-01' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    const options = dashboard.accountSelect.locator('option');
    await expect(options).toHaveText(['-- Select an account --', 'E2E Demo (1001)', 'E2E Live (2002)']);
    await expect(page.getByText('No account selected')).toBeVisible();
  });

  test('Kontoauswahl lädt Zonen und allgemeine Einstellungen', { tag: '@ACC-06' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    await expect(page.getByText('No account selected')).toBeVisible();

    await dashboard.selectAccount(DEMO_ID);
    await expect(page.getByText('No account selected')).toBeHidden();
    await expect(page.getByTestId('zone-count')).toHaveText('1');
    await expect(dashboard.zone().getByPlaceholder(/Sembol Ara/)).toHaveValue('USOUSD');
    await expect(page.getByLabel('Kontrol Sıklığı')).toHaveValue('2');

    // Wechsel auf ein Konto ohne Zonen: alte Zonen verschwinden, Intervall des neuen Kontos
    await dashboard.accountSelect.selectOption(LIVE_ID);
    await expect(page.getByText('Henüz bölge yok')).toBeVisible();
    await expect(page.getByLabel('Kontrol Sıklığı')).toHaveValue('1');
  });

  test('LIVE/TEST-Kennzeichnung', { tag: '@ACC-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('env-badge')).toHaveText('TEST');
    const envBadge = (env: string) => page.locator('main span').filter({ hasText: new RegExp(`^${env}$`) });
    await expect(envBadge('DEMO')).toBeVisible();

    await dashboard.selectAccount(LIVE_ID);
    await expect(page.getByTestId('env-badge')).toHaveText('LIVE');
    await expect(envBadge('LIVE').last()).toBeVisible();
  });

  test('Neues Konto: Pflichtfelder und Anlegen', { tag: '@ACC-02' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await page.getByRole('button', { name: 'Add new account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New MT5 Account' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Save' }).click();
    for (const message of [
      'Account name is required',
      'Login (ID) is required',
      'Password is required',
      'Server is required',
      'MT5 Path is required',
    ]) {
      await expect(dialog.getByText(message)).toBeVisible();
    }
    expect(worker.callsTo('POST', '/api/accounts')).toHaveLength(0);

    await dialog.getByPlaceholder('e.g. Live Account 1').fill('Neues Demo');
    await dialog.getByPlaceholder('e.g. 12345678').fill('3003');
    await dialog.getByPlaceholder('MT5 Password').fill('pw-' + 'neu');
    await dialog.getByPlaceholder('e.g. Eightcap-Demo').fill('Broker-Demo');
    await dialog.getByLabel('Select MT5 Path').selectOption(MT5_PATH);
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog).toBeHidden();
    await expect(dashboard.accountSelect).toHaveValue('3003');
    await expect(dashboard.accountSelect.locator('option', { hasText: 'Neues Demo (3003)' })).toHaveCount(1);
    const [call] = worker.callsTo('POST', '/api/accounts');
    expect(call.body).toMatchObject({ id: '3003', login: 3003, env_type: 'DEMO', mt5_path: MT5_PATH });
  });

  test('Doppelter Login: Rückfrage, kein zweites Konto', { tag: '@ACC-03' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await page.getByRole('button', { name: 'Add new account' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('e.g. Live Account 1').fill('Doppelt');
    await dialog.getByPlaceholder('e.g. 12345678').fill(DEMO_ID);
    await dialog.getByPlaceholder('MT5 Password').fill('pw-' + 'neu');
    await dialog.getByPlaceholder('e.g. Eightcap-Demo').fill('Broker-Demo');
    await dialog.getByLabel('Select MT5 Path').selectOption(MT5_PATH);

    // „Bestehendes bearbeiten?“ bestätigen → Formular wechselt auf das vorhandene Konto
    const question = await dashboard.withDialog(
      () => dialog.getByRole('button', { name: 'Save' }).click(),
      'accept',
    );
    expect(question).toContain('already exists');

    await expect(dialog.getByRole('heading', { name: 'Edit Account' })).toBeVisible();
    await expect(dialog.getByPlaceholder('e.g. Live Account 1')).toHaveValue('E2E Demo');
    await expect(dashboard.accountSelect).toHaveValue(DEMO_ID);
    expect(worker.callsTo('POST', '/api/accounts')).toHaveLength(0);
    expect(worker.state.accounts).toHaveLength(2);
  });

  test('Konto bearbeiten: Passwort bleibt, Änderung bleibt erhalten', { tag: '@ACC-04' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: 'Edit account' }).click();
    const dialog = page.getByRole('dialog');
    const password = dialog.getByPlaceholder('Leave empty to keep current password');
    await expect(password).toHaveValue('');

    await dialog.getByPlaceholder('e.g. Live Account 1').fill('E2E Demo umbenannt');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const [call] = worker.callsTo('PUT', `/api/accounts/${DEMO_ID}`);
    expect(call.body).toMatchObject({ account_name: 'E2E Demo umbenannt', password: '' });
    expect(worker.state.accounts[0].password).toBe('pw-' + 'demo');

    await page.reload();
    await expect(dashboard.accountSelect.locator('option', { hasText: 'E2E Demo umbenannt (1001)' })).toHaveCount(1);
  });

  test('Bearbeiten und Löschen gesperrt, solange der Bot läuft', { tag: ['@ACC-04', '@ACC-05'] }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await expect(dashboard.botStatus).toHaveText('Running');
    await expect(page.getByRole('button', { name: 'Stop the bot before editing' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop the bot before deleting' })).toBeDisabled();
  });

  test('Konto löschen', { tag: '@ACC-05' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: 'Delete account' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Are you sure you want to delete E2E Demo?');
    await modal.getByRole('button', { name: 'Delete' }).click();

    await expect(dashboard.accountSelect.locator('option', { hasText: 'E2E Demo (1001)' })).toHaveCount(0);
    await expect(dashboard.accountSelect).toHaveValue(LIVE_ID);
    expect(worker.callsTo('DELETE', `/api/accounts/${DEMO_ID}`)).toHaveLength(1);
  });
});
