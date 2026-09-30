import { create } from 'zustand';

export type Role = 'admin' | 'user';

/** Wer bin ich am Worker? Antwort von `GET /api/auth/me` (Rolle folgt aus dem Schlüssel). */
export interface Me {
  id: string;
  name: string;
  role: Role;
}

/** Älterer Worker ohne /auth/me kennt nur den einen gemeinsamen Schlüssel: der sieht alles. */
export const LEGACY_ADMIN: Me = { id: 'admin', name: 'admin', role: 'admin' };

interface AuthState {
  /** null, solange die Identität nicht geladen ist (kein Worker, noch nicht geprüft, Schlüssel abgelehnt). */
  me: Me | null;
  setMe: (me: Me | null) => void;
}

// Nicht persistiert und nicht in resetAllStores: gehört zur Verbindung (Schlüssel), nicht zu einem Konto.
export const useAuthStore = create<AuthState>()((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}));

export const useIsAdmin = () => useAuthStore((s) => s.me?.role === 'admin');
