import axios from 'axios';
import { isMixedContent, normalizeBaseUrl, toApiUrl } from './connectionCode';
import type { ConnectionStatus } from '@/store/useConnectionStore';

export type ProbeFailure = 'invalid' | 'insecure' | 'unauthorized' | 'unreachable' | 'notWorker';

export type ProbeResult =
  | { ok: true; baseUrl: string; platform: string }
  | { ok: false; reason: ProbeFailure; baseUrl: string | null; ngrokCode?: string };

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

  try {
    const res = await axios.get(`${toApiUrl(baseUrl)}/system/platform`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      timeout: PROBE_TIMEOUT_MS,
      signal,
    });
    const platform = (res.data as { platform?: unknown } | null)?.platform;
    // Eine fremde Seite, die 200 antwortet (oder eine Warnseite), ist kein Worker
    if (typeof platform !== 'string') return { ok: false, reason: 'notWorker', baseUrl };
    return { ok: true, baseUrl, platform };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      if (err.response.status === 401) return { ok: false, reason: 'unauthorized', baseUrl };
      const ngrokCode = err.response.headers?.['ngrok-error-code'] as string | undefined;
      // Andere HTTP-Antworten (404 vom Tunnel, 5xx, fremde Seite): erreichbar, aber kein laufender Worker
      return { ok: false, reason: ngrokCode ? 'unreachable' : 'notWorker', baseUrl, ngrokCode };
    }
    return { ok: false, reason: 'unreachable', baseUrl };
  }
}

export function statusFromProbe(result: ProbeResult): ConnectionStatus {
  if (result.ok) return 'connected';
  switch (result.reason) {
    case 'unauthorized':
      return 'unauthorized';
    case 'insecure':
      return 'insecure';
    default:
      return 'unreachable';
  }
}
