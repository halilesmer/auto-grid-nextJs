import axios from 'axios';
import { axiosInstance } from '@/lib/api';
import { LEGACY_ADMIN, useAuthStore, type Me } from '@/store/useAuthStore';
import { useUsersStore, type WorkerUser } from '@/store/useUsersStore';

/** Antwort auf Anlegen/Erneuern: der Schlüssel steht nur hier und wird nie wieder geliefert. */
export interface IssuedKey {
  user: WorkerUser;
  key: string;
}

/**
 * Lädt die eigene Identität in den Auth-Store. Ein 404 **des Workers** = älterer Worker ohne /auth/me
 * (ein gemeinsamer Schlüssel für alles) → wie Admin behandeln. Ein 404 von ngrok (Tunnel offline) oder
 * einer fremden Seite ist kein Worker: dann bleibt `me` leer, sonst sähe ein Benutzer Admin-Oberfläche.
 * Andere Fehler lassen `me` ebenfalls leer (nächster Versuch beim nächsten Status-Check).
 */
export async function loadMe(): Promise<void> {
  try {
    const res = await axiosInstance.get<Me>('/auth/me');
    useAuthStore.getState().setMe(res.data);
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response?.status !== 404) return;
    const fromNgrok = Boolean(err.response.headers?.['ngrok-error-code']);
    // FastAPI antwortet auf unbekannte Pfade mit {"detail": "Not Found"}
    const fromWorker = typeof (err.response.data as { detail?: unknown } | null)?.detail === 'string';
    if (fromWorker && !fromNgrok) useAuthStore.getState().setMe(LEGACY_ADMIN);
  }
}

/** Liste nachladen, ohne dass ein Fehler das Ergebnis der vorherigen Aktion verdeckt. */
async function refreshUsers(): Promise<void> {
  try {
    await usersApi.fetchUsers();
  } catch {
    // Die Aktion selbst ist gelungen; die Liste zieht die Seite beim nächsten Aktualisieren nach
  }
}

export const usersApi = {
  /** Liste in den globalen Store schreiben (Dropdowns und Seite bleiben so gleich). */
  async fetchUsers(): Promise<WorkerUser[]> {
    const res = await axiosInstance.get<{ users: WorkerUser[] }>('/users');
    const users = res.data.users ?? [];
    useUsersStore.getState().setUsers(users);
    return users;
  },

  async createUser(name: string): Promise<IssuedKey> {
    const res = await axiosInstance.post<IssuedKey>('/users', { name });
    // Der Schlüssel steht nur in dieser Antwort: er darf nicht an einem Fehler beim Nachladen scheitern
    await refreshUsers();
    return res.data;
  },

  async rotateKey(userId: string): Promise<IssuedKey> {
    const res = await axiosInstance.post<IssuedKey>(`/users/${userId}/key`);
    await refreshUsers();
    return res.data;
  },

  async deleteUser(userId: string): Promise<void> {
    await axiosInstance.delete(`/users/${userId}`);
    await refreshUsers();
  },
};
