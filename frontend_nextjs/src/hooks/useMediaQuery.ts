'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** CSS medya sorgusunu izler. Sunucu render'ında ve ilk karede `fallback` döner (hydration hatası olmasın). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
