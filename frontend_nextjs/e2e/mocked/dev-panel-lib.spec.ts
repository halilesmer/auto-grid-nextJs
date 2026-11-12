/**
 * Geliştirme-Panel-Zeile ohne Browser: wann sie im Einstellungsmenü erscheint
 * (src/lib/devPanel.ts, eingebunden in HeaderMenu.tsx).
 * SYS-15 Geliştirme-Panel öffnen
 */
import { expect, test } from '@playwright/test';
import { DEV_PANEL_URL, isLocalHostname } from '../../src/lib/devPanel';

test.describe('isLocalHostname', () => {
  test('localhost, 127.0.0.1 und [::1] sind der eigene Mac', { tag: '@SYS-15' }, () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('[::1]')).toBe(true);
  });

  test('Schreibweise und Leerraum spielen keine Rolle', { tag: '@SYS-15' }, () => {
    expect(isLocalHostname(' LocalHost ')).toBe(true);
  });

  test('Vercel, LAN-Name und LAN-Adresse (Telefon) sind nicht der eigene Mac', { tag: '@SYS-15' }, () => {
    expect(isLocalHostname('auto-grid-next-js.vercel.app')).toBe(false);
    expect(isLocalHostname('mein-mac.local')).toBe(false);
    expect(isLocalHostname('192.0.2.10')).toBe(false);
    expect(isLocalHostname('')).toBe(false);
  });

  test('ähnlich klingende Namen zählen nicht', { tag: '@SYS-15' }, () => {
    expect(isLocalHostname('localhost.example.com')).toBe(false);
    expect(isLocalHostname('127.0.0.10')).toBe(false);
  });
});

test('das Panel liegt auf localhost:3030', { tag: '@SYS-15' }, () => {
  expect(DEV_PANEL_URL).toBe('http://localhost:3030');
});
