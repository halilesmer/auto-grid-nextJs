'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useTooltipPrefsStore } from '@/store/useTooltipPrefsStore';
import { useUserPrefsStore } from '@/store/useUserPrefsStore';

// Kişisel tercihleri (dil, tema, ipucu süreleri) worker'dan yükler: bağlantı hazır ve kimlik (/auth/me) bilinince.
// Önbellek (localStorage) açılışta hemen uygulanır; worker'ın değeri gelince üzerine yazılır. Muster wie LocaleSync.
export default function UserPrefsSync() {
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const apiKey = useConnectionStore((s) => s.apiKey);
  const meId = useAuthStore((s) => s.me?.id ?? null);

  useLayoutEffect(() => {
    useTooltipPrefsStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!hydrated || !baseUrl || !meId) return;
    void useUserPrefsStore.getState().load();
  }, [hydrated, baseUrl, apiKey, meId]);

  return null;
}
