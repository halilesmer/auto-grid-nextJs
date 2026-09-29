'use client';

import { useEffect, useLayoutEffect } from 'react';
import { probeWorker, statusFromProbe } from '@/lib/connection';
import { readConnectHash } from '@/lib/connectionCode';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useConnectionStore } from '@/store/useConnectionStore';

const POLL_MS = 30_000;

// Lädt die gespeicherte Verbindung, wertet einen Verbindungs-Link (`#connect=…`) aus und hält den
// Status (Header-Chip) aktuell. Muster wie LocaleSync: rehydrate nach der Hydration.
export default function ConnectionSync() {
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const apiKey = useConnectionStore((s) => s.apiKey);

  useLayoutEffect(() => {
    useConnectionStore.persist.rehydrate();
    // Ohne nutzbaren localStorage (privates Fenster, blockiert) ist rehydrate() ein No-op
    useConnectionStore.getState().markHydrated();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const openLink = () => {
      const code = readConnectHash(window.location.hash);
      if (code === null) return;
      // Fragment sofort entfernen: der Key soll nicht in Adressleiste und Verlauf stehen bleiben.
      // Gespeichert wird nie still, der Dialog fragt vorher (ein fremder Link darf den Browser nicht umhängen).
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      useConnectionDialogStore.getState().show(code);
    };
    openLink();
    // Link in die Adressleiste einer schon offenen Seite: nur das Fragment ändert sich, kein Neuladen
    window.addEventListener('hashchange', openLink);
    return () => window.removeEventListener('hashchange', openLink);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !baseUrl) return;
    let cancelled = false;

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const result = await probeWorker(baseUrl, apiKey);
      if (!cancelled) useConnectionStore.getState().setStatus(statusFromProbe(result));
    };

    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [hydrated, baseUrl, apiKey]);

  return null;
}
