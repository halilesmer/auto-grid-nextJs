/**
 * SYS-07 · Verbindung im Browser einrichten · SYS-08 · Verbindungs-Link · SYS-09 · Status im Header.
 *
 * Der Testserver wird mit NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WORKER_API_KEY gebaut: das ist nur der Startwert
 * (gilt, solange im Browser nichts gespeichert ist); „getrennt" siehe fixtures/connection.ts.
 */
import type { Page } from '@playwright/test';
import { startDisconnected, storedConnection as stored } from '../fixtures/connection';
import { E2E_API_KEY, MOCK_API } from '../fixtures/env';
import { expect, test, type AppLocale } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import {
  decodeConnectionCode,
  encodeConnectionCode,
  hostOf,
  isMixedContent,
  normalizeBaseUrl,
  readConnectHash,
  toWsUrl,
} from '../../src/lib/connectionCode';

const MOCK_HOST = hostOf(MOCK_API);
const LOCALES: AppLocale[] = ['tr', 'en', 'de'];

async function expectNoPageOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'Seite scrollt horizontal').toBeLessThanOrEqual(clientWidth);
}

test.describe('SYS-07 Verbindung im Browser', () => {
  test('ohne Verbindung: Anleitung; Testen und Verbinden speichert und lädt neu', { tag: '@SYS-07' }, async ({ page, worker }) => {
    await startDisconnected(page);
    await page.goto('/');
    await expect(page.getByTestId('connection-gate')).toBeVisible();
    await expect(page.getByTestId('connection-chip')).toHaveAttribute('data-status', 'unconfigured');
    // Ohne Verbindung geht keine Anfrage an irgendeinen Worker
    expect(worker.calls).toEqual([]);

    await page.getByTestId('connection-gate-connect').click();
    const dialog = page.getByTestId('connection-dialog');
    await expect(dialog).toBeVisible();
    const connect = dialog.getByTestId('connection-connect');
    await expect(connect).toBeDisabled();

    // „/api" und Schrägstrich am Ende gehören nicht zur Adresse
    await dialog.getByTestId('connection-url').fill(`${MOCK_API}/api/`);
    await dialog.getByTestId('connection-key').fill(E2E_API_KEY);
    await expect(connect).toBeDisabled(); // erst nach erfolgreichem Test
    await dialog.getByTestId('connection-test').click();
    await expect(dialog.getByTestId('connection-test-ok')).toContainText(MOCK_HOST);
    await expect(connect).toBeEnabled();
    expect(worker.callsTo('GET', '/api/system/platform')).toHaveLength(1);
    // Getestet, aber noch nicht gespeichert
    expect(await stored(page)).toEqual({ state: { baseUrl: '', apiKey: '' }, version: 0 });

    await connect.click();
    await expect(page.getByTestId('connection-gate')).toBeHidden();
    await expect(page.getByTestId('connection-chip')).toHaveAttribute('data-status', 'connected');
    expect(await stored(page)).toEqual({ state: { baseUrl: MOCK_API, apiKey: E2E_API_KEY }, version: 0 });
    await expect.poll(() => worker.callsTo('GET', '/api/accounts').length).toBeGreaterThan(0);
  });

  test('Fehlerfälle: falscher Key, kein Worker, nicht erreichbar, ungültige Adresse', { tag: '@SYS-07' }, async ({ page, worker }) => {
    await startDisconnected(page);
    await page.goto('/');
    await page.getByTestId('connection-gate-connect').click();
    const dialog = page.getByTestId('connection-dialog');
    const url = dialog.getByTestId('connection-url');
    const key = dialog.getByTestId('connection-key');
    const runTest = dialog.getByTestId('connection-test');
    const connect = dialog.getByTestId('connection-connect');
    const error = dialog.getByTestId('connection-test-error');

    await url.fill(MOCK_API);
    await key.fill('falscher-key');
    await runTest.click();
    await expect(error).toHaveAttribute('data-reason', 'unauthorized');
    await expect(error).toContainText(msg('connection.test.unauthorized'));
    await expect(dialog.getByTestId('connection-test-detail')).toContainText('HTTP 401');
    await expect(connect).toBeDisabled();
    expect(worker.unauthorized).toEqual(['GET /api/system/platform']);
    worker.unauthorized.length = 0; // erwartet: der Test wollte genau diese 401

    // Leeres Key-Feld: eigene Meldung statt „Key abgelehnt"
    await key.fill('');
    await runTest.click();
    await expect(error).toHaveAttribute('data-reason', 'missingKey');
    await expect(error).toContainText(msg('connection.test.missingKey'));
    worker.unauthorized.length = 0;

    // Eine Adresse, die antwortet, aber kein Worker ist
    worker.overrides.set('GET /api/system/platform', { status: 200, body: { hello: 'world' } });
    await key.fill(E2E_API_KEY);
    await runTest.click();
    await expect(error).toHaveAttribute('data-reason', 'notWorker');
    worker.overrides.delete('GET /api/system/platform');

    worker.offline = true;
    await runTest.click();
    await expect(error).toHaveAttribute('data-reason', 'unreachable');
    await expect(error).toContainText(msg('connection.test.unreachable'));
    worker.offline = false;

    await url.fill('https://');
    await runTest.click();
    await expect(error).toHaveAttribute('data-reason', 'invalid');

    // Erfolg, und jede Änderung danach macht das Ergebnis ungültig
    await url.fill(MOCK_API);
    await runTest.click();
    await expect(dialog.getByTestId('connection-test-ok')).toBeVisible();
    await expect(connect).toBeEnabled();
    await key.fill(`${E2E_API_KEY}x`);
    await expect(dialog.getByTestId('connection-test-ok')).toBeHidden();
    await expect(connect).toBeDisabled();

    // Den Schlüssel sieht man erst nach Klick auf das Auge
    await expect(key).toHaveAttribute('type', 'password');
    await dialog.getByTestId('connection-key-toggle').click();
    await expect(key).toHaveAttribute('type', 'text');
  });

  test('Trennen löscht die Verbindung; der Startwert aus dem Build kommt nicht zurück', { tag: '@SYS-07' }, async ({ page, worker }) => {
    void worker;
    await page.goto('/');
    const chip = page.getByTestId('connection-chip');
    await expect(chip).toHaveAttribute('data-status', 'connected');

    await chip.click();
    await page.getByTestId('connection-disconnect').click();
    await page
      .getByRole('dialog')
      .filter({ hasText: msg('connection.disconnect.title') })
      .getByRole('button', { name: msg('connection.action.disconnect') })
      .click();

    await expect(page.getByTestId('connection-gate')).toBeVisible();
    expect(await stored(page)).toEqual({ state: { baseUrl: '', apiKey: '' }, version: 0 });
    await page.reload();
    await expect(page.getByTestId('connection-gate')).toBeVisible();
  });

  test('die VPS-Seite braucht keine Worker-Verbindung', { tag: '@SYS-07' }, async ({ page, worker }) => {
    void worker;
    await startDisconnected(page);
    await page.goto('/vps');
    await expect(page.getByTestId('vps-disabled')).toBeVisible();
    await expect(page.getByTestId('connection-gate')).toBeHidden();
  });
});

test.describe('SYS-08 Verbindungs-Link', () => {
  test('Link öffnet den Dialog mit Ziel und Test; nichts wird still gespeichert; Fragment verschwindet', { tag: '@SYS-08' }, async ({ page, worker }) => {
    await startDisconnected(page);
    const code = encodeConnectionCode({ baseUrl: MOCK_API, apiKey: E2E_API_KEY });
    await page.goto(`/#connect=${code}`);

    const dialog = page.getByTestId('connection-dialog');
    await expect(dialog.getByTestId('connection-from-link')).toContainText(MOCK_HOST);
    await expect(dialog.getByTestId('connection-test-ok')).toBeVisible();
    expect(page.url()).not.toContain('connect');
    expect(await stored(page)).toEqual({ state: { baseUrl: '', apiKey: '' }, version: 0 });
    // Die automatische Probe trug den Schlüssel aus dem Link
    expect(worker.callsTo('GET', '/api/system/platform')).toHaveLength(1);

    await dialog.getByTestId('connection-connect').click();
    await expect(page.getByTestId('connection-chip')).toHaveAttribute('data-status', 'connected');
    expect(await stored(page)).toEqual({ state: { baseUrl: MOCK_API, apiKey: E2E_API_KEY }, version: 0 });
  });

  test('Link in die Adressleiste einer schon offenen Seite', { tag: '@SYS-08' }, async ({ page, worker }) => {
    void worker;
    await startDisconnected(page);
    await page.goto('/');
    await expect(page.getByTestId('connection-gate')).toBeVisible();

    // Nur das Fragment ändert sich: die Seite lädt nicht neu
    await page.goto(`/#connect=${encodeConnectionCode({ baseUrl: MOCK_API, apiKey: E2E_API_KEY })}`);
    await expect(page.getByTestId('connection-from-link')).toContainText(MOCK_HOST);
    await expect(page.getByTestId('connection-test-ok')).toBeVisible();
    expect(page.url()).not.toContain('connect');
  });

  test('ungültiger Link: Meldung, nichts wird verbunden', { tag: '@SYS-08' }, async ({ page, worker }) => {
    void worker;
    await startDisconnected(page);
    await page.goto('/#connect=kaputt$code');

    const dialog = page.getByTestId('connection-dialog');
    await expect(dialog).toContainText(msg('connection.link.invalid'));
    await expect(dialog.getByTestId('connection-from-link')).toBeHidden();
    await expect(dialog.getByTestId('connection-connect')).toBeDisabled();
    expect(page.url()).not.toContain('connect');
  });

  test('Link ins Feld einfügen füllt Adresse und Key und testet', { tag: '@SYS-08' }, async ({ page, worker }) => {
    void worker;
    await startDisconnected(page);
    await page.goto('/');
    await page.getByTestId('connection-gate-connect').click();
    const dialog = page.getByTestId('connection-dialog');

    const code = encodeConnectionCode({ baseUrl: MOCK_API, apiKey: E2E_API_KEY });
    await dialog.getByTestId('connection-link').fill(`https://auto-grid.example/#connect=${code}`);
    await expect(dialog.getByTestId('connection-url')).toHaveValue(MOCK_API);
    await expect(dialog.getByTestId('connection-key')).toHaveValue(E2E_API_KEY);
    await expect(dialog.getByTestId('connection-test-ok')).toBeVisible();
    await expect(dialog.getByTestId('connection-connect')).toBeEnabled();
  });

  test('Adressen und Verbindungscode (reine Funktionen)', { tag: '@SYS-08' }, () => {
    expect(normalizeBaseUrl(' Abc.ngrok-free.dev/api/ ')).toBe('https://abc.ngrok-free.dev');
    expect(normalizeBaseUrl('https://abc.ngrok-free.dev/api')).toBe('https://abc.ngrok-free.dev');
    expect(normalizeBaseUrl('https://host.example/prefix/api/')).toBe('https://host.example/prefix');
    expect(normalizeBaseUrl('localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeBaseUrl('127.0.0.1:8000/api')).toBe('http://127.0.0.1:8000');
    expect(normalizeBaseUrl('http://worker.example')).toBe('http://worker.example');
    for (const bad of ['', '   ', 'ftp://x.example', 'https://', 'javascript:alert(1)']) {
      expect(normalizeBaseUrl(bad), bad).toBeNull();
    }

    expect(toWsUrl('https://a.example', 'k y')).toBe('wss://a.example/ws/stream?api_key=k%20y');
    expect(toWsUrl('http://localhost:8000', '')).toBe('ws://localhost:8000/ws/stream');
    expect(toWsUrl('https://a.example', 'k', '1002')).toBe('wss://a.example/ws/stream?api_key=k&account_id=1002');
    expect(toWsUrl('http://localhost:8000', '', '1002')).toBe('ws://localhost:8000/ws/stream?account_id=1002');
    expect(toWsUrl('http://localhost:8000', 'k', null)).toBe('ws://localhost:8000/ws/stream?api_key=k');

    expect(isMixedContent('http://a.example', 'https:')).toBe(true);
    expect(isMixedContent('http://localhost:8000', 'https:')).toBe(false);
    expect(isMixedContent('https://a.example', 'https:')).toBe(false);
    expect(isMixedContent('http://a.example', 'http:')).toBe(false);

    // Hin und zurück, auch mit Nicht-ASCII-Zeichen im Key
    const connection = { baseUrl: 'https://abc.ngrok-free.dev', apiKey: 'schlüssel-ключ-42' };
    const code = encodeConnectionCode(connection);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConnectionCode(code)).toEqual(connection);
    expect(decodeConnectionCode(`#connect=${code}`)).toEqual(connection);
    expect(decodeConnectionCode(`connect=${code}`)).toEqual(connection);
    expect(decodeConnectionCode(` https://auto-grid.example/#connect=${code}\n`)).toEqual(connection);
    expect(readConnectHash(`#connect=${code}`)).toBe(code);
    expect(readConnectHash('#anderes')).toBeNull();

    // Feste Form: PowerShell (connect-link.ps1) erzeugt exakt dieses JSON
    const b64 = (json: string) => Buffer.from(json).toString('base64url');
    expect(decodeConnectionCode(b64('{"v":1,"u":"https://w.example","k":"abc"}'))).toEqual({
      baseUrl: 'https://w.example',
      apiKey: 'abc',
    });
    for (const bad of [
      '',
      'abc',
      'kein code!',
      b64('nicht json'),
      b64('{"v":2,"u":"https://w.example","k":"abc"}'),
      b64('{"v":1,"u":"https://w.example"}'),
      b64('{"v":1,"u":"ftp://w.example","k":"abc"}'),
      b64(`{"v":1,"u":"https://w.example","k":"${'x'.repeat(513)}"}`),
    ]) {
      expect(decodeConnectionCode(bad), bad).toBeNull();
    }
  });
});

test.describe('SYS-09 Verbindungsstatus im Header', () => {
  test('Chip zeigt Host und Status und folgt dem Worker', { tag: '@SYS-09' }, async ({ page, worker }) => {
    await page.goto('/');
    const chip = page.getByTestId('connection-chip');
    await expect(chip).toHaveAttribute('data-status', 'connected');
    await expect(chip).toContainText(MOCK_HOST);

    // Der Status wird beim Fokus des Fensters (und alle 30 s) neu geprüft
    const recheck = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));

    worker.overrides.set('GET /api/system/platform', { status: 401, body: { detail: 'Invalid or missing API key' } });
    await recheck();
    await expect(chip).toHaveAttribute('data-status', 'unauthorized');
    worker.overrides.delete('GET /api/system/platform');

    worker.offline = true;
    await recheck();
    await expect(chip).toHaveAttribute('data-status', 'unreachable');
    worker.offline = false;

    await recheck();
    await expect(chip).toHaveAttribute('data-status', 'connected');
  });

  for (const lang of LOCALES) {
    test.describe(`Handy 375 px (${lang})`, () => {
      test.use({ viewport: { width: 375, height: 812 }, appLocale: lang });

      test('verbunden: Status steht in der Zeile unter der Kopfzeile', { tag: '@SYS-09' }, async ({ page, worker }) => {
        void worker;
        await page.goto('/');
        const bar = page.getByTestId('connection-chip-bar');
        await expect(bar).toHaveAttribute('data-status', 'connected');
        await expect(bar).toContainText(MOCK_HOST);
        await expect(page.getByTestId('connection-chip')).toBeHidden();
        await expectNoPageOverflow(page);
      });

      test('getrennt: Anleitung und Dialog passen ins Fenster', { tag: '@SYS-09' }, async ({ page, worker }) => {
        void worker;
        await startDisconnected(page);
        await page.goto('/');
        await expect(page.getByTestId('connection-chip-bar')).toContainText(msg('connection.chip.connect', undefined, lang));
        await expect(page.getByTestId('connection-gate')).toBeVisible();
        await expectNoPageOverflow(page);

        await page.getByTestId('connection-gate-connect').click();
        const dialog = page.getByTestId('connection-dialog');
        await expect(dialog).toBeVisible();
        await expectNoPageOverflow(page);
        const box = await page.getByRole('dialog').boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      });
    });
  }
});
