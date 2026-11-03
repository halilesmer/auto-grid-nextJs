'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Änderungen an der Adresse der Chartseite: ersetzen den Verlaufseintrag (kein „Zurück“ durch jeden Klick).
 * router.replace wirkt erst mit dem nächsten Render: mehrere Änderungen im selben Durchlauf bauen auf der zuletzt gesendeten Adresse auf.
 */
export function useUrlUpdate() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = params.toString();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [current]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(pending.current ?? current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      if (query === (pending.current ?? current)) return;
      pending.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [current, pathname, router],
  );
  return { params, update };
}
