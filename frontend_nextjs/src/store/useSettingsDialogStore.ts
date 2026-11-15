import { create } from 'zustand';

export type SettingsSection = 'appearance' | 'notifications' | 'chart' | 'connection' | 'robot' | 'users' | 'system';

interface SettingsDialogState {
  open: boolean;
  /** Telefonda null = bölüm listesi; masaüstünde null = ilk bölüm. */
  section: SettingsSection | null;
  /** Son açık bölüm: üst menüdeki „Ayarlar“ pencereyi burada açar. */
  lastSection: SettingsSection | null;
  show: (section?: SettingsSection | null) => void;
  hide: () => void;
  setSection: (section: SettingsSection | null) => void;
  /** Ayarlardaki „Grafikte aç“ bağlantısı: grafik sayfası Göstergeler penceresini açınca false olur (USR-12). */
  indicatorsRequested: boolean;
  requestIndicators: () => void;
  clearIndicatorsRequest: () => void;
  /** S7: ayarlardaki „Grafik görünümünü aç“ bağlantısı: grafik sayfası görünüm ayar penceresini açınca false olur. */
  appearanceRequested: boolean;
  requestAppearance: () => void;
  clearAppearanceRequest: () => void;
}

// Yalnız UI durumu (pencere açık mı, hangi bölüm); saklanmaz. Üst menüdeki dişli açar.
export const useSettingsDialogStore = create<SettingsDialogState>()((set) => ({
  open: false,
  section: null,
  lastSection: null,
  show: (section = null) => set((s) => ({ open: true, section, lastSection: section ?? s.lastSection })),
  hide: () => set({ open: false }),
  setSection: (section) => set((s) => ({ section, lastSection: section ?? s.lastSection })),
  indicatorsRequested: false,
  requestIndicators: () => set({ indicatorsRequested: true, open: false }),
  clearIndicatorsRequest: () => set({ indicatorsRequested: false }),
  appearanceRequested: false,
  requestAppearance: () => set({ appearanceRequested: true, open: false }),
  clearAppearanceRequest: () => set({ appearanceRequested: false }),
}));
