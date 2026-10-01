import axios from 'axios';
import { isMixedContent, normalizeBaseUrl, toApiUrl } from './connectionCode';
import type { ConnectionStatus } from '@/store/useConnectionStore';

export type ProbeFailure =
  | 'invalid'
  | 'insecure'
  | 'missingKey'
  | 'unauthorized'
  | 'timeout'
  | 'unreachable'
  | 'notWorker';

export type ProbeResult =
  | { ok: true; baseUrl: string; platform: string }
  | {
      ok: false;
      reason: ProbeFailure;
      baseUrl: string | null;
      ngrokCode?: string;
      /** Technische Angabe für den Nutzer/Admin, z. B. „HTTP 404“ oder „ERR_NETWORK“ */
      detail?: string;
      /** Die tatsächlich abgefragte URL */
      probedUrl?: string;
    };

const PROBE_TIMEOUT_MS = 8000;

/**
 * Prüft Adresse + Key mit einem eigenen Request (nicht über die gespeicherte Verbindung), damit der
 * Dialog testen kann, bevor etwas gespeichert wird. `GET /api/system/platform` ist der billigste
 * Worker-Endpunkt hinter dem Key: 200 = alles gut, 401 = Key falsch, Netzfehler = Adresse/Tunnel/CORS.
 */
export async function probeWorker(
  rawBaseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  if (!baseUrl) return { ok: false, reason: 'invalid', baseUrl: null };
  if (typeof window !== 'undefined' && isMixedContent(baseUrl, window.location.protocol)) {
    return { ok: false, reason: 'insecure', baseUrl };
  }

  const probedUrl = `${toApiUrl(baseUrl)}/system/platform`;
  try {
    const res = await axios.get(probedUrl, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      timeout: PROBE_TIMEOUT_MS,
      signal,
    });
    const platform = (res.data as { platform?: unknown } | null)?.platform;
    // Eine fremde Seite, die 200 antwortet (oder eine Warnseite), ist kein Worker
    if (typeof platform !== 'string') {
      return { ok: false, reason: 'notWorker', baseUrl, probedUrl, detail: `HTTP ${res.status}, ${describeBody(res.data)}` };
    }
    return { ok: true, baseUrl, platform };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const detail = `HTTP ${status}${err.response.statusText ? ` ${err.response.statusText}` : ''}`;
      if (status === 401) {
        // Ohne Key ist die Ursache eindeutig: das Feld ist leer
        return { ok: false, reason: apiKey ? 'unauthorized' : 'missingKey', baseUrl, probedUrl, detail };
      }
      const ngrokCode = err.response.headers?.['ngrok-error-code'] as string | undefined;
      // Andere HTTP-Antworten (404 vom Tunnel, 5xx, fremde Seite): erreichbar, aber kein laufender Worker
      return { ok: false, reason: ngrokCode ? 'unreachable' : 'notWorker', baseUrl, ngrokCode, probedUrl, detail };
    }
    if (axios.isAxiosError(err) && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
      return { ok: false, reason: 'timeout', baseUrl, probedUrl, detail: `Timeout ${PROBE_TIMEOUT_MS / 1000} s` };
    }
    // Keine Antwort: DNS, Tunnel aus, CORS, Proxy/VPN/Firewall/Werbeblocker – der Browser verrät nicht, was davon
    const code = axios.isAxiosError(err) ? err.code : undefined;
    return { ok: false, reason: 'unreachable', baseUrl, probedUrl, detail: code ?? (err instanceof Error ? err.message : undefined) };
  }
}

function describeBody(data: unknown): string {
  if (typeof data === 'string') {
    return /<html/i.test(data) ? 'HTML' : data.slice(0, 60);
  }
  return typeof data;
}

export function statusFromProbe(result: ProbeResult): ConnectionStatus {
  if (result.ok) return 'connected';
  switch (result.reason) {
    case 'unauthorized':
    case 'missingKey':
      return 'unauthorized';
    case 'insecure':
      return 'insecure';
    default:
      return 'unreachable';
  }
}
