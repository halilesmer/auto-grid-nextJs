import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeState {
  // Kullanıcının seçimi (localStorage'a yazılır)
  theme: ThemePreference;
  // Gerçekte uygulanan tema; 'system' burada çözülmüş olur
  resolvedTheme: ResolvedTheme;

  setTheme: (theme: ThemePreference) => void;
  // 'system' seçiliyken OS teması değişince çağrılır
  refreshResolvedTheme: () => void;
}

// Tema cihaza özel bir tercih; resetAllStores() ile sıfırlanmaz, backend'e gönderilmez.
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      resolvedTheme: resolveTheme(DEFAULT_THEME),

      setTheme: (theme) => set({ theme, resolvedTheme: resolveTheme(theme) }),
      refreshResolvedTheme: () => set({ resolvedTheme: resolveTheme(get().theme) }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme }),
      // SSR ile hydration uyuşmazlığı olmasın diye ThemeSync mount olunca rehydrate eder
      skipHydration: true,
      merge: (persisted, current) => {
        const theme = (persisted as { theme?: unknown } | undefined)?.theme;
        return isThemePreference(theme) ? { ...current, theme } : current;
      },
      onRehydrateStorage: () => (state) => state?.refreshResolvedTheme(),
    },
  ),
);
