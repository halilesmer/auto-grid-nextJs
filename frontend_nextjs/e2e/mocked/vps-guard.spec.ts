/**
 * VPS-04 · Schutz der Route /api/vps/*: Die TCP-Gegenstelle zählt, nicht die Header des Clients.
 *
 * Teil 1 prüft den Mechanismus ohne Next: dieselbe Installation wie src/instrumentation.ts, ein kleiner
 * HTTP-Server, Anfragen von 127.0.0.1 und von der LAN-Adresse dieser Maschine (Gegenstelle ≠ Loopback).
 * Teil 2 sendet dieselben Anfragen an den echten Produktions-Testserver (next start). Dort ist
 * VPS_SSH_HOST leer: 404 `disabled` heißt „Schutz bestanden, aber kein SSH konfiguriert“, 403 heißt
 * „abgewiesen“. Es läuft nie ein SSH-Befehl und keine echte Aktion.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { expect, test } from '@playwright/test';
import { E2E_PORT } from '../fixtures/env';
import { checkVpsRequest } from '../../src/lib/server/vpsGuard';
import { installPeerHeader, isLoopbackAddress, PEER_HEADER, verifiedPeer } from '../../src/lib/server/peerAddress';

const TOKEN_KEY = Symbol.for('grid.peerHeader.token');

/** Erste Nicht-Loopback-IPv4-Adresse dieser Maschine (Gegenstelle einer Anfrage „aus dem LAN“). */
function lanAddress(): string | undefined {
  return Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
}

interface Reply {
  status: number;
  body: string;
}

function send(host: string, port: number, method: string, path: string, headers: Record<string, string>): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, method, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const code = (r: Reply): string | undefined => (JSON.parse(r.body) as { code?: string }).code;

test.describe('Gegenstelle statt Client-Header', () => {
  test('Loopback-Adressen in allen Schreibweisen', { tag: '@VPS-04' }, () => {
    for (const ok of ['127.0.0.1', '127.8.9.10', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect(isLoopbackAddress(ok), ok).toBe(true);
    }
    for (const bad of ['192.168.1.20', '10.0.0.5', '::ffff:192.168.1.20', 'fe80::1', '::', '::2', '', 'localhost', '127.0.0.1.evil.test', '[::1]']) {
      expect(isLoopbackAddress(bad), bad).toBe(false);
    }
  });

  test('ohne installierte Anpassung ist ein Client-Header wertlos', { tag: '@VPS-04' }, () => {
    const g = globalThis as Record<symbol, unknown>;
    const saved = g[TOKEN_KEY];
    delete g[TOKEN_KEY];
    try {
      const forged = new Headers({ host: 'localhost:3000', [PEER_HEADER]: '127.0.0.1' });
      expect(verifiedPeer(forged)).toBeNull();
      expect(checkVpsRequest('GET', forged)?.body.code).toBe('localOnly');
    } finally {
      if (saved !== undefined) g[TOKEN_KEY] = saved;
    }
  });

  test.describe('kleiner Server mit installierter Anpassung', () => {
    let server: http.Server;
    let port = 0;

    test.beforeAll(async () => {
      installPeerHeader();
      server = http.createServer((req, res) => {
        const headers = { get: (name: string) => (req.headers[name] as string | undefined) ?? null };
        const denial = checkVpsRequest(req.method ?? 'GET', headers);
        res.writeHead(denial?.status ?? 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(denial?.body ?? { ok: true }));
      });
      await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
      port = (server.address() as AddressInfo).port;
    });

    test.afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    test('Loopback darf; Proxy-Header und fehlende Origin werden weiter abgewiesen', { tag: '@VPS-04' }, async () => {
      const own = { host: `localhost:${port}`, origin: `http://localhost:${port}` };
      expect((await send('127.0.0.1', port, 'GET', '/', { host: own.host })).status).toBe(200);
      expect((await send('127.0.0.1', port, 'POST', '/', { host: own.host, origin: own.origin })).status).toBe(200);
      // ein gefälschter Server-Header aus Loopback wird überschrieben und schadet nicht
      expect((await send('127.0.0.1', port, 'GET', '/', { host: own.host, [PEER_HEADER]: '10.1.2.3' })).status).toBe(200);
      // Loopback, aber ein Proxy hat einen fremden Client angehängt
      const proxied = await send('127.0.0.1', port, 'GET', '/', { host: own.host, 'x-forwarded-for': '203.0.113.9' });
      expect([proxied.status, code(proxied)]).toEqual([403, 'localOnly']);
      const forwarded = await send('127.0.0.1', port, 'GET', '/', { host: own.host, forwarded: 'for=203.0.113.9' });
      expect([forwarded.status, code(forwarded)]).toEqual([403, 'localOnly']);
      const foreignHost = await send('127.0.0.1', port, 'GET', '/', { host: 'evil.example' });
      expect([foreignHost.status, code(foreignHost)]).toEqual([403, 'localOnly']);
      const noOrigin = await send('127.0.0.1', port, 'POST', '/', { host: own.host });
      expect([noOrigin.status, code(noOrigin)]).toEqual([403, 'badOrigin']);
    });

    test('LAN-Adresse (Gegenstelle ist nicht Loopback): jede Fälschung scheitert', { tag: '@VPS-04' }, async () => {
      const lan = lanAddress();
      test.skip(!lan, 'Keine Nicht-Loopback-IPv4-Adresse auf dieser Maschine');
      const own = { host: `localhost:${port}`, origin: `http://localhost:${port}` };
      const forgeries: Array<[string, string, Record<string, string>]> = [
        ['GET', 'ehrlich', {}],
        ['POST', 'Host + Origin', { host: own.host, origin: own.origin }],
        ['GET', 'x-forwarded-for', { host: own.host, 'x-forwarded-for': '127.0.0.1' }],
        ['GET', 'x-forwarded-host', { host: own.host, 'x-forwarded-host': own.host }],
        ['GET', 'Server-Header ohne Token', { host: own.host, [PEER_HEADER]: '127.0.0.1' }],
        ['GET', 'Server-Header mit geratenem Token', { host: own.host, [PEER_HEADER]: `${'0'.repeat(32)}|127.0.0.1` }],
        ['POST', 'alles zusammen', { host: own.host, origin: own.origin, 'x-forwarded-for': '::1', [PEER_HEADER]: '::1' }],
      ];
      for (const [method, label, headers] of forgeries) {
        const reply = await send(lan as string, port, method, '/', headers);
        expect([label, reply.status, code(reply)]).toEqual([label, 403, 'localOnly']);
      }
    });
  });
});

test.describe('Echter Testserver (next start) von der LAN-Adresse', () => {
  const lan = lanAddress();
  const path = '/api/vps/nonexistent'; // nie eine echte Aktion
  const own = { host: `localhost:${E2E_PORT}`, origin: `http://localhost:${E2E_PORT}` };

  test('gefälschte Header aus dem LAN: 403 localOnly', { tag: '@VPS-04' }, async () => {
    test.skip(!lan, 'Keine Nicht-Loopback-IPv4-Adresse auf dieser Maschine');
    const attempts: Array<[string, Record<string, string>]> = [
      ['GET', {}],
      ['POST', { host: own.host, origin: own.origin }],
      ['GET', { host: own.host, 'x-forwarded-for': '127.0.0.1' }],
      ['POST', { host: own.host, origin: own.origin, 'x-forwarded-for': '::1', 'x-forwarded-host': own.host, [PEER_HEADER]: '127.0.0.1' }],
    ];
    for (const [method, headers] of attempts) {
      const reply = await send(lan as string, E2E_PORT, method, path, headers);
      expect([method, reply.status, code(reply)]).toEqual([method, 403, 'localOnly']);
    }
  });

  test('von localhost bleibt die Route erreichbar', { tag: '@VPS-04' }, async () => {
    // 404 disabled: Schutz bestanden, VPS_SSH_HOST ist im Testserver leer
    for (const host of ['127.0.0.1', '::1']) {
      const get = await send(host, E2E_PORT, 'GET', path, { host: own.host });
      expect([host, get.status, code(get)]).toEqual([host, 404, 'disabled']);
    }
    const post = await send('127.0.0.1', E2E_PORT, 'POST', path, { host: own.host, origin: own.origin });
    expect([post.status, code(post)]).toEqual([404, 'disabled']);
    // ein gefälschter Server-Header aus Loopback wird überschrieben und schadet nicht
    const forged = await send('127.0.0.1', E2E_PORT, 'GET', path, { host: own.host, [PEER_HEADER]: '10.1.2.3' });
    expect([forged.status, code(forged)]).toEqual([404, 'disabled']);
  });
});
