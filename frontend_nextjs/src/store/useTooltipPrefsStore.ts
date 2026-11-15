import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_DELAY, DEFAULT_HOLD, parseDelay, parseHold, type TooltipDelayPref, type TooltipHoldPref } from '@/lib/userPrefs';

/**
 * İpucu gecikmesi ve görünme süresi (USR-09): `tooltip.tsx` bunu okur. Ayrı küçük bir depo, çünkü
 * `useUserPrefsStore` toast'a (o da tooltip'e) bağlıdır; böylece import döngüsü olmaz.
 * Asıl kaynak worker'dır (`useUserPrefsStore.load`); localStorage yalnız önbellek.
 */
interface TooltipPrefsState {
  delay: TooltipDelayPref;
  hold: TooltipHoldPref;
}

export const useTooltipPrefsStore = create<TooltipPrefsState>()(
  persist(
    () => ({ delay: DEFAULT_DELAY, hold: DEFAULT_HOLD }),
    {
      name: 'grid-robot-tooltip-prefs',
      storage: createJSONStorage(() => localStorage),
      // SSR ile hydration uyuşmazlığı olmasın diye UserPrefsSync mount olunca rehydrate eder
      skipHydration: true,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { delay?: unknown; hold?: unknown };
        return { ...current, delay: parseDelay(p.delay), hold: parseHold(p.hold) };
      },
    },
  ),
);
