import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const CUSTOM_COLORS_STORAGE_KEY = 'grid-robot-custom-colors-v1';
/** Renk panelinde „+“nın yanında en fazla bu kadar özel renk durur (iki sıra) */
export const CUSTOM_COLORS_MAX = 19;

interface CustomColorsState {
  /** Kullanıcının „+“ ile eklediği renkler (`#rrggbb`), eklenme sırasıyla */
  colors: string[];
  addColor: (color: string) => void;
}

const valid = (c: unknown): c is string => typeof c === 'string' && /^#[\da-f]{6}$/i.test(c);

// Cihaza bağlı (tema gibi): yalnız bu tarayıcının localStorage'ında durur, worker'a gitmez.
export const useCustomColorsStore = create<CustomColorsState>()(
  persist(
    (set) => ({
      colors: [],
      addColor: (color) => set((s) => {
        const c = color.toLowerCase();
        if (!valid(c)) return s;
        // Var olan renk sona taşınır; sınır aşılınca en eskisi düşer
        return { colors: [...s.colors.filter(x => x !== c), c].slice(-CUSTOM_COLORS_MAX) };
      }),
    }),
    {
      name: CUSTOM_COLORS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Panel açılınca okunur (SSR HTML'i ile çakışmasın)
      skipHydration: true,
      merge: (persisted, current) => {
        const p = persisted as { colors?: unknown } | undefined;
        const colors = Array.isArray(p?.colors) ? p.colors.filter(valid).map(c => c.toLowerCase()).slice(-CUSTOM_COLORS_MAX) : [];
        return { ...current, colors };
      },
    },
  ),
);
