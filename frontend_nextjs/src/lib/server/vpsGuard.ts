/**
 * Schutz der Route /api/vps/* (VPS-04): nur Anfragen von dieser Maschine.
 *
 * Reihenfolge (die erste Prüfung ist die einzige, die nicht der Client bestimmt):
 *   1. Die Gegenstelle der TCP-Verbindung ist Loopback (peerAddress.ts; nicht zu fälschen)
 *   2. Kein Proxy davor: x-forwarded-for / forwarded dürfen nur Loopback zeigen (sonst reicht ein lokaler
 *      Reverse-Proxy, z. B. ein Tunnel, fremden Verkehr als Loopback durchzulassen)
 *   3. Host und x-forwarded-host sind localhost (gegen DNS-Rebinding)
 *   4. POST/Nicht-GET: Origin zeigt auf denselben Host (keine fremde Webseite im Browser)
 * Host, Origin und x-forwarded-* setzt der Client selbst; sie sind nur zusätzliche Prüfungen.
 * Fehlt die Gegenstelle oder lässt sie sich nicht belegen, wird abgelehnt (fail closed).
 */
import { isLoopbackAddress, verifiedPeer } from '@/lib/server/peerAddress';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface VpsGuardDenial {
  status: 403;
  body: { ok: false; error: string; code: 'localOnly' | 'badOrigin' };
}

type HeaderReader = { get(name: string): string | null };

const LOCAL_ONLY: VpsGuardDenial = {
  status: 403,
  body: { ok: false, error: 'VPS-Steuerung nur lokal (localhost) erlaubt', code: 'localOnly' },
};
const BAD_ORIGIN: VpsGuardDenial = {
  status: 403,
  body: { ok: false, error: 'Ungültige Origin', code: 'badOrigin' },
};

export function hostname(hostHeader: string | null): string {
  if (!hostHeader) return '';
  // [::1]:3000 → [::1], localhost:3000 → localhost
  return hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
}

/** Jeder Eintrag von "a, b, c" muss eine Loopback-Adresse sein. */
function allLoopback(list: string): boolean {
  return list.split(',').every((entry) => isLoopbackAddress(entry.trim().replace(/^\[|\]$/g, '')));
}

export function checkVpsRequest(method: string, headers: HeaderReader): VpsGuardDenial | null {
  const peer = verifiedPeer(headers);
  if (!peer || !isLoopbackAddress(peer)) return LOCAL_ONLY;

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor && !allLoopback(forwardedFor)) return LOCAL_ONLY;
  if (headers.get('forwarded')) return LOCAL_ONLY;

  const host = headers.get('host');
  const forwardedHost = headers.get('x-forwarded-host');
  if (!LOCAL_HOSTS.has(hostname(host)) || (forwardedHost && !LOCAL_HOSTS.has(hostname(forwardedHost)))) {
    return LOCAL_ONLY;
  }

  if (method !== 'GET') {
    const origin = headers.get('origin');
    let originHost = '';
    try {
      originHost = origin ? new URL(origin).host : '';
    } catch {
      originHost = '';
    }
    if (!originHost || originHost !== host) return BAD_ORIGIN;
  }
  return null;
}
