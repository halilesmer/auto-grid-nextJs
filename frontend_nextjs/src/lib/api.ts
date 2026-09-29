import axios from 'axios';
import { t } from '@/i18n';
import { getConnection } from '@/store/useConnectionStore';
import { toApiUrl } from './connectionCode';

/**
 * Worker-Adresse und API-Key kommen zur Laufzeit aus dem Verbindungs-Store (im Browser eingegeben,
 * localStorage), nicht mehr aus dem Build. So funktioniert dasselbe Frontend lokal und auf Vercel,
 * ohne dass der Key im öffentlichen Bundle landet.
 */
export class NotConnectedError extends Error {
  constructor() {
    super(t('connection.error.notConnected'));
    this.name = 'NotConnectedError';
  }
}

/** Worker-Header (auch für rohe `fetch`-Aufrufe): ngrok-Warnseite überspringen + API-Key, falls gesetzt. */
export function getWorkerHeaders(): Record<string, string> {
  const { apiKey } = getConnection();
  return {
    'ngrok-skip-browser-warning': 'true',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };
}

/** Absolute Worker-URL für rohe `fetch`-Aufrufe (`apiUrl('/settings/123')`). Wirft, solange nichts verbunden ist. */
export function apiUrl(path = ''): string {
  const { baseUrl } = getConnection();
  if (!baseUrl) throw new NotConnectedError();
  return `${toApiUrl(baseUrl)}${path}`;
}

/** Einzige axios-Instanz für den Worker: relative Pfade (`/accounts`), Adresse und Key kommen pro Request. */
export const axiosInstance = axios.create();

axiosInstance.interceptors.request.use((config) => {
  const { baseUrl } = getConnection();
  // Kein Request ohne Verbindung: sonst ginge er an die Seite selbst oder einen falschen Host
  if (!baseUrl) throw new NotConnectedError();
  config.baseURL = toApiUrl(baseUrl);
  for (const [name, value] of Object.entries(getWorkerHeaders())) config.headers.set(name, value);
  return config;
});
