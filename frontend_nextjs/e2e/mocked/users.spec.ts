/** USR · Benutzer & Zugriff (Oberfläche): Benutzerseite des Admins, Konto-Besitzer, Ansicht eines Benutzers. */
import { connectWithKey } from '../fixtures/connection';
import { E2E_USER_KEY, MOCK_API } from '../fixtures/env';
import { DEMO_ID, LIVE_ID, MT5_PATH, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { decodeConnectionCode } from '../../src/lib/connectionCode';

const NAV = (page: import('@playwright/test').Page, name: string) => page.getByRole('link', { name, exact: true });

test.describe('USR Benutzerverwaltung (Admin)', () => {
  test('Benutzer anlegen: Schlüssel und Verbindungs-Link werden einmal angezeigt', { tag: '@USR-07' }, async ({ page, worker }) => {
    await page.goto('/users');
    await expect(page.getByTestId('users-empty')).toHaveText(msg('users.empty'));

    await page.getByTestId('add-user').click();
    await page.getByTestId('create-user-name').fill('Anna');
    await page.getByTestId('create-user-submit').click();

    const reveal = page.getByTestId('key-reveal');
    await expect(reveal).toBeVisible();
    const key = await page.getByTestId('issued-key').inputValue();
    expect(key).toBe(worker.state.users[0].key);
    // Der Link enthält Adresse und persönlichen Schlüssel für „VPS verbinden“
    const link = await page.getByTestId('issued-link').inputValue();
    expect(link).toContain('#connect=');
    expect(decodeConnectionCode(link)).toEqual({ baseUrl: MOCK_API, apiKey: key });
    // Der Test läuft auf localhost: der Link wäre beim Benutzer unbrauchbar, das Fenster weist darauf hin
    await expect(reveal).toContainText(msg('users.link.local'));

    await page.getByTestId('key-reveal-done').click();
    await expect(reveal).toBeHidden();
    await expect(page.getByTestId('user-row')).toHaveCount(1);
    await expect(page.getByTestId('user-name')).toHaveText('Anna');
    await expect(page.getByTestId('user-accounts')).toHaveText('0');
    // Der Schlüssel steht nicht mehr in der Seite
    await expect(page.locator('body')).not.toContainText(key);
  });

  test('Doppelter Name wird mit der Meldung des Workers abgelehnt', { tag: '@USR-07' }, async ({ page, worker }) => {
    worker.addUser('Anna');
    await page.goto('/users');
    await page.getByTestId('add-user').click();
    await page.getByTestId('create-user-name').fill('anna');
    await page.getByTestId('create-user-submit').click();
    await expect(page.getByText(/already exists/)).toBeVisible();
    await expect(page.getByTestId('key-reveal')).toBeHidden();
    expect(worker.state.users).toHaveLength(1);
  });

  test('Schlüssel erneuern und Benutzer löschen (mit Bestätigung)', { tag: '@USR-07' }, async ({ page, worker }) => {
    const anna = worker.addUser('Anna');
    worker.setOwner(DEMO_ID, anna.id);
    await page.goto('/users');
    await expect(page.getByTestId('user-accounts')).toHaveText('1');

    const before = anna.key;
    await page.getByTestId('user-rotate').click();
    await page.getByRole('dialog').getByRole('button', { name: msg('users.rotate.confirm'), exact: true }).click();
    await expect(page.getByTestId('key-reveal')).toBeVisible();
    expect(await page.getByTestId('issued-key').inputValue()).toBe(`${before}-renewed`);
    await page.getByTestId('key-reveal-done').click();

    await page.getByTestId('user-delete').click();
    await expect(page.getByText(msg('users.delete.info'))).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: msg('confirm.delete'), exact: true }).click();
    await expect(page.getByTestId('users-empty')).toBeVisible();
    // Das Konto bleibt erhalten, gehört jetzt niemandem (= dem Admin)
    expect(worker.state.accounts.find((a) => a.id === DEMO_ID)?.owner).toBeNull();
  });

  test('Nav: Benutzer-Link für Admin, Seite selbst nur mit Admin-Schlüssel', { tag: '@USR-07' }, async ({ page, worker }) => {
    void worker;
    await page.goto('/');
    await expect(NAV(page, msg('nav.users'))).toBeVisible();
    await NAV(page, msg('nav.users')).click();
    await expect(page).toHaveURL('/users');
    await expect(page.getByRole('heading', { name: msg('users.title') })).toBeVisible();
  });
});

test.describe('USR Konto-Besitzer im Formular (Admin)', () => {
  test('Admin legt ein Konto für einen Benutzer an, der Besitzer steht in der Liste', { tag: '@USR-03' }, async ({ page, worker, dashboard }) => {
    const anna = worker.addUser('Anna');
    await dashboard.open(null);
    await dashboard.openAccountMenu();
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(msg('account.form.name.placeholder')).fill('Annas Demo');
    await dialog.getByPlaceholder(msg('account.form.login.placeholder')).fill('3003');
    await dialog.getByPlaceholder(msg('account.form.password.placeholder')).fill('pw-' + 'anna');
    await dialog.getByPlaceholder(msg('account.form.server.placeholder')).fill('Broker-Demo');
    await dialog.getByLabel(msg('account.path.select.aria')).selectOption(MT5_PATH);
    await dialog.getByTestId('account-owner').selectOption(anna.id);
    await dialog.getByRole('button', { name: msg('common.save') }).click();
    await expect(dialog).toBeHidden();

    const [call] = worker.callsTo('POST', '/api/accounts');
    expect(call.body).toMatchObject({ id: '3003', owner: anna.id });
    const options = await dashboard.accountOptions();
    await expect(options.filter({ hasText: '(3003)' }).getByTestId('account-owner-name')).toHaveText('Anna');
    // Konten ohne Besitzer gehören dem Administrator
    await expect(options.filter({ hasText: `(${DEMO_ID})` }).getByTestId('account-owner-name')).toHaveText(msg('auth.role.admin'));
  });

  test('Ohne Benutzer gibt es keine Besitzer-Auswahl', { tag: '@USR-03' }, async ({ page, dashboard }) => {
    await dashboard.open(null);
    await dashboard.openAccountMenu();
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    await expect(page.getByRole('dialog').getByTestId('account-owner')).toHaveCount(0);
  });
});

test.describe('USR Ansicht eines Benutzers', () => {
  test.beforeEach(async ({ page, worker }) => {
    const anna = worker.addUser('Anna');
    worker.setOwner(DEMO_ID, anna.id); // Konto 2002 gehört niemandem (Admin)
    await connectWithKey(page, MOCK_API, E2E_USER_KEY);
  });

  test('Kontoliste und Verbindungsdialog zeigen nur eigene Konten und die Rolle', { tag: '@USR-08' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    const options = await dashboard.accountOptions();
    await expect(options).toHaveText([/^E2E Demo \(1001\)DEMO$/]);
    await expect(options.filter({ hasText: LIVE_ID })).toHaveCount(0);
    await dashboard.closeAccountList();

    await page.getByTestId('connection-chip').click();
    await expect(page.getByTestId('connection-identity')).toHaveText(
      msg('auth.identity', { name: 'Anna', role: msg('auth.role.user') }),
    );
    expect(worker.callsTo('GET', '/api/auth/me').length).toBeGreaterThan(0);
  });

  test('Admin-Navigation, Update-Menü und Adminseiten sind nicht zugänglich', { tag: '@USR-08' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await expect(NAV(page, msg('nav.dashboard'))).toBeVisible();
    await expect(NAV(page, msg('nav.users'))).toHaveCount(0);
    await expect(NAV(page, msg('nav.vps'))).toHaveCount(0);

    await page.getByRole('button', { name: msg('dashboard.sysinfo.title') }).click();
    // Die Einträge des Menüs sind normale Buttons (dropdown-menu.tsx)
    await expect(page.getByRole('button', { name: msg('dashboard.shutdown') })).toBeVisible();
    await expect(page.getByRole('button', { name: msg('dashboard.sysinfo.checkUpdates') })).toHaveCount(0);
    // Die Update-Prüfung wird gar nicht erst angefragt (der Worker würde 403 antworten)
    expect(worker.callsTo('GET', '/api/system/update/check')).toHaveLength(0);

    await page.goto('/users');
    await expect(page.getByTestId('admin-only')).toBeVisible();
    await expect(page.getByTestId('user-row')).toHaveCount(0);
    expect(worker.callsTo('GET', '/api/users')).toHaveLength(0);
    await page.goto('/vps');
    await expect(page.getByTestId('admin-only')).toBeVisible();
  });

  test('Konto anlegen: Besitzer setzt der Worker, das Formular zeigt keine Besitzer-Auswahl', { tag: '@USR-03' }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    await dashboard.openAccountMenu();
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('account-owner')).toHaveCount(0);
    await dialog.getByPlaceholder(msg('account.form.name.placeholder')).fill('Annas Zweites');
    await dialog.getByPlaceholder(msg('account.form.login.placeholder')).fill('4004');
    await dialog.getByPlaceholder(msg('account.form.password.placeholder')).fill('pw-' + 'anna2');
    await dialog.getByPlaceholder(msg('account.form.server.placeholder')).fill('Broker-Demo');
    await dialog.getByLabel(msg('account.path.select.aria')).selectOption(MT5_PATH);
    await dialog.getByRole('button', { name: msg('common.save') }).click();
    await expect(dialog).toBeHidden();

    const [call] = worker.callsTo('POST', '/api/accounts');
    expect(call.body).not.toHaveProperty('owner'); // Benutzer schicken keinen Besitzer mit
    expect(worker.state.accounts.find((a) => a.id === '4004')?.owner).toBe('u_anna');
  });

  test('Chart-Seite ohne gewähltes Konto öffnet keinen Stream (Worker würde ablehnen)', { tag: '@USR-08' }, async ({ page, worker }) => {
    await page.goto('/formasyon');
    await expect(page.getByRole('heading', { name: msg('formation.title') })).toBeVisible();
    // Kurz warten: die Rolle ist geladen, ein Admin würde jetzt verbinden
    await expect.poll(() => worker.callsTo('GET', '/api/auth/me').length).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(worker.wsUrls).toEqual([]);
  });
});
