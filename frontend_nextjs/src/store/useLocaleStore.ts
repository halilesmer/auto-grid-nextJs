import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from '@/i18n/config';

interface LocaleState {
  // Kullanıcının seçimi (localStorage'a yazılır)
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// Dil kullanıcıya ait bir tercih (USR-09): asıl kaynak worker'dır, burası yerel önbellek ve anlık değerdir.
// `setLocale` yalnız yerel yazar; kullanıcı seçimi `changeLocale` ile (useUserPrefsStore) worker'a da gider.
// resetAllStores() ile sıfırlanmaz.
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: LOCALE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ locale: s.locale }),
      // SSR ile hydration uyuşmazlığı olmasın diye LocaleSync mount olunca rehydrate eder
      skipHydration: true,
      merge: (persisted, current) => {
        const locale = (persisted as { locale?: unknown } | undefined)?.locale;
        return isLocale(locale) ? { ...current, locale } : current;
      },
    },
  ),
);
