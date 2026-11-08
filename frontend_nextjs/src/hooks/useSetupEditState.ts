'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const CLOSE_ALL_EVENT = 'grid-robot-close-setup-forms';
const NONE: ReadonlySet<string> = new Set();

/** Kaydetme çubuğundaki "Kaydet" ve "İptal" bütün setup formlarını kapatır (1108-A6.3). */
export function closeAllSetupForms() {
  window.dispatchEvent(new Event(CLOSE_ALL_EVENT));
}

export interface SetupEditState {
  /** Form açık mı: elle açıldı ya da zorunlu açık (kaydedilmemiş değişiklik / yeni setup, 1108-A6.3) */
  isEditing: (zoneId: string, forced: boolean) => boolean;
  open: (zoneId: string) => void;
  close: (zoneId: string) => void;
  closeAll: () => void;
}

/**
 * Setup başına düzenleme hâli (ZON-22). Burada yalnız "Güncelle" ile elle açılanlar durur;
 * kaydedilmemiş değişikliği olan ya da hiç kaydedilmemiş setup'ın formu `forced` ile açık kalır, bu yüzden
 * "Vazgeç" ve başarılı kayıt değişikliği geri alınca form kendiliğinden kapanır.
 */
export function useSetupEditState(accountKey?: string | null): SetupEditState {
  // Die geöffneten Ids gehören zu einem Konto: beim Kontowechsel gelten sie nicht mehr (kein Wiederauftauchen bei A → B → A)
  const [state, setState] = useState<{ key?: string | null; ids: ReadonlySet<string> }>(() => ({ key: accountKey, ids: new Set() }));
  const opened = state.key === accountKey ? state.ids : NONE;

  const open = useCallback(
    (zoneId: string) => setState((prev) => ({ key: accountKey, ids: new Set(prev.key === accountKey ? prev.ids : NONE).add(zoneId) })),
    [accountKey]
  );
  const close = useCallback(
    (zoneId: string) =>
      setState((prev) => {
        if (prev.key !== accountKey || !prev.ids.has(zoneId)) return prev;
        const next = new Set(prev.ids);
        next.delete(zoneId);
        return { key: accountKey, ids: next };
      }),
    [accountKey]
  );
  const closeAll = useCallback(
    () => setState((prev) => (prev.ids.size === 0 ? prev : { key: accountKey, ids: new Set() })),
    [accountKey]
  );

  useEffect(() => {
    window.addEventListener(CLOSE_ALL_EVENT, closeAll);
    return () => window.removeEventListener(CLOSE_ALL_EVENT, closeAll);
  }, [closeAll]);

  const isEditing = useCallback((zoneId: string, forced: boolean) => forced || opened.has(zoneId), [opened]);

  return useMemo(() => ({ isEditing, open, close, closeAll }), [isEditing, open, close, closeAll]);
}
