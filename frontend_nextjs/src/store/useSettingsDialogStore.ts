import { create } from 'zustand';

export type SettingsSection = 'appearance' | 'connection' | 'robot' | 'users' | 'system';

interface SettingsDialogState {
  open: boolean;
  /** Telefonda null = bölüm listesi; masaüstünde null = ilk bölüm. */
  section: SettingsSection | null;
  show: (section?: SettingsSection | null) => void;
  hide: () => void;
  setSection: (section: SettingsSection | null) => void;
}

// Yalnız UI durumu (pencere açık mı, hangi bölüm); saklanmaz. Üst menüdeki dişli açar.
export const useSettingsDialogStore = create<SettingsDialogState>()((set) => ({
  open: false,
  section: null,
  show: (section = null) => set({ open: true, section }),
  hide: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));
