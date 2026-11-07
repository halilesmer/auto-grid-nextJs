/**
 * Echte TCP-Gegenstelle einer Anfrage (VPS-04) – nur im Node-Server.
 *
 * Warum es diese Datei gibt: Next 16 gibt dem Route Handler die rohe Verbindung nicht (`NextRequest.ip`
 * gibt es nicht), und `x-forwarded-for` wird nur gesetzt, wenn der Client den Header nicht selbst
 * mitschickt (`??=` in next/dist/server/base-server.js) – der Client kann also jeden Wert eintragen.
 * `Host` und `Origin` setzt der Client ebenfalls selbst. Allein beweist keiner dieser Header, dass die
 * Anfrage von dieser Maschine kommt.
 *
 * Lösung: `instrumentation.ts` ruft beim Serverstart `installPeerHeader()` auf. Jede HTTP-Anfrage
 * bekommt, BEVOR Next sie bearbeitet, den Header `x-grid-peer: <Token>|<socket.remoteAddress>`; ein
 * gleichnamiger Header des Clients wird überschrieben. Das Token ist pro Prozess zufällig und verlässt
 * den Server nie. `verifiedPeer()` gibt `null` zurück, wenn das Token nicht passt. Fehlt die Anpassung
 * (alter Prozess, Vercel, andere Laufzeit), ist ein vom Client gesendeter Header wertlos und der Schutz
 * schlägt geschlossen fehl.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export const PEER_HEADER = 'x-grid-peer';

const TOKEN_KEY = Symbol.for('grid.peerHeader.token');
const PATCHED_KEY = Symbol.for('grid.peerHeader.patched');

type Emit = (this: unknown, event: string | symbol, ...args: unknown[]) => boolean;
type Patchable = { emit: Emit } & { [PATCHED_KEY]?: boolean };

// instrumentation.ts und das Route-Bundle können getrennte Modulinstanzen sein; geteilt wird über globalThis.
function getToken(): string | undefined {
  return (globalThis as Record<symbol, unknown>)[TOKEN_KEY] as string | undefined;
}

function patch(proto: Patchable): void {
  if (Object.prototype.hasOwnProperty.call(proto, PATCHED_KEY)) return;
  Object.defineProperty(proto, PATCHED_KEY, { value: true });
  const originalEmit = proto.emit;
  proto.emit = function (this: unknown, event, ...args) {
    if (event === 'request') {
      const req = args[0] as http.IncomingMessage;
      // Immer schreiben (ein Client-Wert wird überschrieben); ohne Adresse (Verbindung weg) → wird abgewiesen.
      req.headers[PEER_HEADER] = `${getToken()}|${req.socket?.remoteAddress ?? ''}`;
    }
    return originalEmit.call(this, event, ...args);
  };
}

/** Beim Serverstart einmal aufrufen (idempotent). */
export function installPeerHeader(): void {
  const g = globalThis as Record<symbol, unknown>;
  g[TOKEN_KEY] ??= crypto.randomBytes(16).toString('hex');
  patch(http.Server.prototype as unknown as Patchable);
  patch(https.Server.prototype as unknown as Patchable);
}

/**
 * Die vom Server geschriebene Gegenstelle; `null`, wenn das Token fehlt oder nicht passt (gefälscht oder
 * Anpassung nicht installiert).
 */
export function verifiedPeer(headers: { get(name: string): string | null }): string | null {
  const token = getToken();
  const raw = headers.get(PEER_HEADER);
  if (!token || !raw) return null;
  const sep = raw.indexOf('|');
  if (sep !== token.length) return null;
  const given = Buffer.from(raw.slice(0, sep));
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return raw.slice(sep + 1) || null;
}

const LOOPBACK = new net.BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');

/** 127.0.0.0/8, ::1 und IPv4-gemappte Formen (::ffff:127.0.0.1). Ein Wert, der keine IP ist, ergibt false. */
export function isLoopbackAddress(address: string): boolean {
  const a = address.trim();
  const family = net.isIP(a);
  return family !== 0 && LOOPBACK.check(a, family === 4 ? 'ipv4' : 'ipv6');
}
