import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizeBaseUrl, type Connection } from '@/lib/connectionCode';

export type ConnectionStatus =
  | 'unconfigured' // keine Adresse gespeichert
  | 'checking' // Probe läuft / noch nicht geprüft
  | 'connected'
  | 'unauthorized' // Worker erreichbar, Key falsch oder fehlt
  | 'unreachable' // Netz, CORS, ngrok-Tunnel aus oder kein Worker
  | 'insecure'; // http-Adresse auf einer https-Seite (Mixed Content)

interface ConnectionState extends Connection {
  /** Erst true, wenn der Speicher gelesen wurde (vorher darf kein Request rausgehen). */
  hydrated: boolean;
  status: ConnectionStatus;
  setConnection: (connection: Connection) => void;
  clearConnection: () => void;
  setStatus: (status: ConnectionStatus) => void;
  markHydrated: () => void;
}

export const CONNECTION_STORAGE_KEY = 'grid-robot-connection';

/** Startwert für lokale Entwicklung und die Mocked-E2E (dort wird das Frontend mit diesen Variablen gebaut). */
function envConnection(): Connection {
  const baseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL ?? '') ?? '';
  return { baseUrl, apiKey: baseUrl ? (process.env.NEXT_PUBLIC_WORKER_API_KEY ?? '') : '' };
}

function statusFor(baseUrl: string): ConnectionStatus {
  return baseUrl ? 'checking' : 'unconfigured';
}

// Geräteabhängig wie Theme/Sprache: wird von resetAllStores() nicht angefasst. Der Key liegt nur
// im localStorage dieses Browsers, nie im Bundle und nie auf dem Vercel-Server.
export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      baseUrl: '',
      apiKey: '',
      hydrated: false,
      status: 'unconfigured',
      setConnection: ({ baseUrl, apiKey }) => set({ baseUrl, apiKey, status: statusFor(baseUrl) }),
      clearConnection: () => set({ baseUrl: '', apiKey: '', status: 'unconfigured' }),
      setStatus: (status) => set({ status }),
      markHydrated: () =>
        set((s) => {
          if (s.hydrated) return s;
          // Kein localStorage verfügbar: nur mit dem Startwert aus der Umgebung weiterarbeiten
          const { baseUrl, apiKey } = envConnection();
          return { baseUrl, apiKey, hydrated: true, status: statusFor(baseUrl) };
        }),
    }),
    {
      name: CONNECTION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ baseUrl: s.baseUrl, apiKey: s.apiKey }),
      // Erst ConnectionSync liest den Speicher (nach der Hydration), sonst passt das SSR-HTML nicht
      skipHydration: true,
      merge: (persisted, current) => {
        const p = persisted as Partial<Record<keyof Connection, unknown>> | undefined;
        // Kein Eintrag: Startwert aus der Umgebung. Ein gespeicherter Eintrag mit leerer Adresse
        // heißt „getrennt" und bleibt so (der Startwert überschreibt ihn nicht wieder).
        const stored = p && typeof p === 'object';
        const { baseUrl, apiKey } = stored
          ? {
              baseUrl: normalizeBaseUrl(typeof p.baseUrl === 'string' ? p.baseUrl : '') ?? '',
              apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
            }
          : envConnection();
        return { ...current, baseUrl, apiKey, hydrated: true, status: statusFor(baseUrl) };
      },
    },
  ),
);

/** Aktuelle Verbindung außerhalb von React (Interceptor, WebSocket, fetch). */
export function getConnection(): Connection {
  const { baseUrl, apiKey } = useConnectionStore.getState();
  return { baseUrl, apiKey };
}
