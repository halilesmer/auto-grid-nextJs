import { create } from 'zustand';

export type SettingsSection = 'appearance' | 'notifications' | 'chart' | 'connection' | 'robot' | 'users' | 'system';

/** „Grafikte aç“ isteği bu süreden eskiyse yok sayılır: gezinme olmazsa bayrak kalır ve grafik sonradan açılınca pencere kendiliğinden açılırdı (F13). */
export const OPEN_REQUEST_MAX_AGE_MS = 15_000;

/** İstek hâlâ geçerli mi (zamanında tüketildi mi)? */
export const isOpenRequestFresh = (requestedAt: number, now: number = Date.now()) => now - requestedAt <= OPEN_REQUEST_MAX_AGE_MS;

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
  /** İsteğin zamanı (Date.now); isteği tüketen taraf yaşını denetler */
  indicatorsRequestedAt: number;
  requestIndicators: () => void;
  clearIndicatorsRequest: () => void;
  /** S7: ayarlardaki „Grafik görünümünü aç“ bağlantısı: grafik sayfası görünüm ayar penceresini açınca false olur. */
  appearanceRequested: boolean;
  appearanceRequestedAt: number;
  requestAppearance: () => void;
  clearAppearanceRequest: () => void;
}

// Yalnız UI durumu (pencere açık mı, hangi bölüm); saklanmaz. Üst menüdeki dişli açar.
export const useSettingsDialogStore = create<SettingsDialogState>()((set) => ({
  open: false,
  section: null,
  lastSection: null,
  // Pencere yeniden açılırken bekleyen „Grafikte aç“ istekleri düşer (F13)
  show: (section = null) => set((s) => ({ open: true, section, lastSection: section ?? s.lastSection, indicatorsRequested: false, appearanceRequested: false })),
  hide: () => set({ open: false }),
  setSection: (section) => set((s) => ({ section, lastSection: section ?? s.lastSection })),
  indicatorsRequested: false,
  indicatorsRequestedAt: 0,
  requestIndicators: () => set({ indicatorsRequested: true, indicatorsRequestedAt: Date.now(), open: false }),
  clearIndicatorsRequest: () => set({ indicatorsRequested: false }),
  appearanceRequested: false,
  appearanceRequestedAt: 0,
  requestAppearance: () => set({ appearanceRequested: true, appearanceRequestedAt: Date.now(), open: false }),
  clearAppearanceRequest: () => set({ appearanceRequested: false }),
}));
