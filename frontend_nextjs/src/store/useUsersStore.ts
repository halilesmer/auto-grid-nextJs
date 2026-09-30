import { create } from 'zustand';

/** Benutzer wie `GET /api/users` sie liefert (nie mit Schlüssel oder Hash). */
export interface WorkerUser {
  id: string;
  name: string;
  created_at: string | null;
  account_count: number;
}

interface UsersState {
  users: WorkerUser[];
  loaded: boolean;
  setUsers: (users: WorkerUser[]) => void;
}

// Einzige Quelle für die Benutzerliste: /users-Seite und Besitzer-Auswahl im Konto-Formular lesen hier.
export const useUsersStore = create<UsersState>()((set) => ({
  users: [],
  loaded: false,
  setUsers: (users) => set({ users, loaded: true }),
}));
