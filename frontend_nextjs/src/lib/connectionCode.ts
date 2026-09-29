// Worker-Verbindung (Adresse + API-Key): Normalisierung und Verbindungs-Code.
// Reine Funktionen ohne Browser-/Store-Zugriff, damit sie einzeln testbar sind.
//
// Der Verbindungs-Code ist base64url(UTF-8-JSON {"v":1,"u":"<Adresse>","k":"<Key>"}), im Link als
// `#connect=<code>`. worker_python/ops/windows/connect-link.ps1 erzeugt ihn identisch.

export interface Connection {
  baseUrl: string;
  apiKey: string;
}

export const CONNECT_HASH_PREFIX = '#connect=';
export const CONNECTION_CODE_VERSION = 1;

const MAX_KEY_LENGTH = 512;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith('.localhost');
}

/**
 * Macht aus Benutzereingaben eine saubere Basisadresse ohne `/api` und ohne Slash am Ende
 * (`abc.ngrok-free.dev/api/` → `https://abc.ngrok-free.dev`). Ohne Schema wird `https://`
 * ergänzt, für localhost `http://`. Gibt `null` zurück, wenn keine gültige http(s)-Adresse übrig bleibt.
 */
export function normalizeBaseUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let withScheme = raw;
  if (!SCHEME_RE.test(raw)) {
    const host = raw.split(/[/?#]/)[0].replace(/:\d+$/, '');
    withScheme = `${isLocalHost(host) ? 'http' : 'https'}://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${url.origin}${path}`;
}

export function toApiUrl(baseUrl: string): string {
  return `${baseUrl}/api`;
}

/** WebSocket-Adresse. Browser können bei WebSockets keine Header setzen, der Key geht als Query-Parameter mit. */
export function toWsUrl(baseUrl: string, apiKey: string): string {
  const url = `${baseUrl.replace(/^http/, 'ws')}/ws/stream`;
  return apiKey ? `${url}?api_key=${encodeURIComponent(apiKey)}` : url;
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** `http://` von einer https-Seite wird vom Browser als Mixed Content blockiert (localhost ausgenommen). */
export function isMixedContent(baseUrl: string, pageProtocol: string): boolean {
  try {
    const url = new URL(baseUrl);
    return pageProtocol === 'https:' && url.protocol === 'http:' && !isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeConnectionCode({ baseUrl, apiKey }: Connection): string {
  const json = JSON.stringify({ v: CONNECTION_CODE_VERSION, u: baseUrl, k: apiKey });
  return bytesToBase64Url(new TextEncoder().encode(json));
}

/**
 * Liest einen Verbindungs-Code. Akzeptiert den ganzen Link, nur das Fragment (`#connect=…`,
 * `connect=…`) oder den rohen Code. Gibt `null` bei allem zurück, was kein gültiger Code ist.
 */
export function decodeConnectionCode(input: string): Connection | null {
  let code = input.trim();
  const at = code.indexOf('connect=');
  if (at !== -1) code = code.slice(at + 'connect='.length);
  code = code.replace(/^#/, '').trim();
  if (!code || !/^[A-Za-z0-9_-]+={0,2}$/.test(code)) return null;

  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(code)));
    if (!data || typeof data !== 'object') return null;
    const { v, u, k } = data as { v?: unknown; u?: unknown; k?: unknown };
    if (v !== CONNECTION_CODE_VERSION || typeof u !== 'string' || typeof k !== 'string') return null;
    if (k.length > MAX_KEY_LENGTH) return null;
    const baseUrl = normalizeBaseUrl(u);
    return baseUrl ? { baseUrl, apiKey: k } : null;
  } catch {
    return null;
  }
}

/** Liefert den Code aus `location.hash` (`#connect=…`), sonst `null`. */
export function readConnectHash(hash: string): string | null {
  return hash.startsWith(CONNECT_HASH_PREFIX) ? hash.slice(CONNECT_HASH_PREFIX.length) : null;
}
