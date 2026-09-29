import { create } from 'zustand';

interface ConnectionDialogState {
  open: boolean;
  /** Text aus einem Verbindungs-Link (`#connect=…`); leer = normal geöffnet. Der Dialog wertet ihn aus. */
  link: string;
  /** Zählt jedes Öffnen, damit das Formular mit frischem Zustand startet. */
  nonce: number;
  show: (link?: string) => void;
  hide: () => void;
}

// Nur UI-Zustand (Dialog offen?), wird nicht gespeichert. Chip, Leerzustand und Link-Auswertung öffnen ihn.
export const useConnectionDialogStore = create<ConnectionDialogState>()((set) => ({
  open: false,
  link: '',
  nonce: 0,
  show: (link = '') => set((s) => ({ open: true, link, nonce: s.nonce + 1 })),
  hide: () => set({ open: false }),
}));
