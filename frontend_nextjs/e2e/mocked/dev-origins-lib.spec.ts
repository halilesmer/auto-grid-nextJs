/**
 * Dev-Origins ohne Browser: ALLOWED_DEV_ORIGINS wird zu allowedDevOrigins von `next dev`
 * (src/lib/devOrigins.ts, eingebunden in next.config.ts).
 * SYS-12 Telefon/LAN-Zugriff auf den Dev-Server
 */
import { expect, test } from '@playwright/test';
import type { NextConfig } from 'next';
import { parseDevOrigins } from '../../src/lib/devOrigins';

test.describe('parseDevOrigins', () => {
  test('nicht gesetzt oder leer ergibt keine erlaubte Origin', { tag: '@SYS-12' }, () => {
    expect(parseDevOrigins(undefined)).toEqual([]);
    expect(parseDevOrigins('')).toEqual([]);
    expect(parseDevOrigins(' , ,\t')).toEqual([]);
  });

  test('Komma und Leerraum trennen, die Reihenfolge bleibt, Doppelte entfallen', { tag: '@SYS-12' }, () => {
    expect(parseDevOrigins('my-mac.local, 192.0.2.10')).toEqual(['my-mac.local', '192.0.2.10']);
    expect(parseDevOrigins('my-mac.local 192.0.2.10\n192.0.2.10')).toEqual(['my-mac.local', '192.0.2.10']);
  });

  test('Schema, Port und Pfad fallen weg (Next vergleicht nur den Hostnamen)', { tag: '@SYS-12' }, () => {
    expect(parseDevOrigins('http://my-mac.local:3000/chart?mode=free')).toEqual(['my-mac.local']);
    expect(parseDevOrigins('192.0.2.10:3000')).toEqual(['192.0.2.10']);
  });

  test('Benutzerkennung fällt weg', { tag: '@SYS-12' }, () => {
    expect(parseDevOrigins('http://user@my-mac.local:3000')).toEqual(['my-mac.local']);
  });

  test('IPv6 trägt eckige Klammern, so wie Next den Hostnamen vergleicht', { tag: '@SYS-12' }, () => {
    expect(parseDevOrigins('[fe80::1]:3000')).toEqual(['[fe80::1]']);
    expect(parseDevOrigins('http://[fe80::1]:3000/chart')).toEqual(['[fe80::1]']);
    expect(parseDevOrigins('fe80::1')).toEqual(['[fe80::1]']);
  });

  test('Schreibweise wird vereinheitlicht, Platzhalter bleiben', { tag: '@SYS-12' }, () => {
    expect(parseDevOrigins('My-Mac.LOCAL')).toEqual(['my-mac.local']);
    expect(parseDevOrigins('*.dev.example')).toEqual(['*.dev.example']);
  });
});

test.describe('next.config.ts', () => {
  test('reicht ALLOWED_DEV_ORIGINS an allowedDevOrigins weiter', { tag: '@SYS-12' }, async () => {
    const before = process.env.ALLOWED_DEV_ORIGINS;
    process.env.ALLOWED_DEV_ORIGINS = 'my-mac.local,192.0.2.10';
    try {
      // Playwright lädt TypeScript als CommonJS: die Config steckt in default oder in default.default.
      const mod = (await import('../../next.config')) as { default: NextConfig | { default: NextConfig } };
      const config = 'default' in mod.default ? mod.default.default : mod.default;
      expect(config.allowedDevOrigins).toEqual(['my-mac.local', '192.0.2.10']);
    } finally {
      if (before === undefined) delete process.env.ALLOWED_DEV_ORIGINS;
      else process.env.ALLOWED_DEV_ORIGINS = before;
    }
  });
});
