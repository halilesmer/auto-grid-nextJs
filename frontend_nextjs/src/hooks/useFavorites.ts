'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { t } from '@/i18n';
import { toast } from '@/components/ui/animated-toast';
import { getApiErrorMessage } from '@/lib/apiError';
import { favoritesApi } from '@/services/favoritesApi';
import { useFavoritesStore } from '@/store/useFavoritesStore';

/** Neuer Versuch nach einem fehlgeschlagenen Laden der Liste */
const RETRY_MS = 10_000;

// PUTs laufen nacheinander: vertauscht ankommende Schreibvorgänge ließen den Worker einen älteren Stand halten
let saveQueue: Promise<unknown> = Promise.resolve();

/**
 * Lädt die Favoriten des Kontos in den Store. Genau ein Aufrufer (FormationScanRunner im Layout): Jeder weitere würde den Store
 * beim Einhängen leeren und neu laden, während Pille und Seitenleiste schon eine Liste zeigen.
 */
export function useFavoritesLoader(accountId: string | null) {
  useEffect(() => {
    if (!accountId) return;
    // Toggles warten auf die frische Antwort: eine ältere Liste (Wiederöffnen, zweites Gerät) würde sonst überschrieben
    useFavoritesStore.getState().setFavorites(null, []);
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (first: boolean) =>
      favoritesApi
        .get(accountId)
        .then((list) => {
          if (!stale) useFavoritesStore.getState().setFavorites(accountId, list);
        })
        .catch(async (err) => {
          console.error('Failed to fetch favorites', err);
          if (stale) return;
          // Meldung nur beim ersten Fehlschlag; der Worker kann gerade neu starten (Update), dann klappt der nächste Versuch
          if (first) toast.error(await getApiErrorMessage(err, t('formation.favorite.failed')));
          if (!stale) timer = setTimeout(() => void load(false), RETRY_MS);
        });
    void load(true);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [accountId]);
}

/**
 * Favoriten-Produkte des Kontos (FRM-28): Umschalten wirkt sofort und wird bei einem Fehler zurückgesetzt.
 * Liegt auf dem Worker, damit jedes Gerät dieselbe Liste sieht. Geladen wird in useFavoritesLoader.
 */
export function useFavorites(accountId: string | null) {
  const symbols = useFavoritesStore((s) => s.symbols);
  const loadedAccount = useFavoritesStore((s) => s.loadedAccount);

  // Die Liste eines anderen Kontos wird nie gezeigt
  const current = useMemo(() => (accountId && loadedAccount === accountId ? symbols : []), [accountId, loadedAccount, symbols]);
  const keys = useMemo(() => new Set(current.map((s) => s.toUpperCase())), [current]);

  const isFavorite = useCallback((symbol: string) => keys.has(symbol.toUpperCase()), [keys]);

  const toggle = useCallback(
    async (symbol: string) => {
      if (!accountId) return;
      const store = useFavoritesStore.getState();
      // Ohne geladene Liste würde ein Schreiben die gespeicherten Favoriten überschreiben
      if (store.loadedAccount !== accountId) {
        toast.error(t('formation.favorite.failed'));
        return;
      }
      const before = store.symbols;
      const exists = before.some((s) => s.toUpperCase() === symbol.toUpperCase());
      const next = exists ? before.filter((s) => s.toUpperCase() !== symbol.toUpperCase()) : [...before, symbol];
      store.setFavorites(accountId, next);
      try {
        const save = saveQueue.then(() => favoritesApi.put(accountId, next));
        saveQueue = save.catch(() => undefined);
        await save;
      } catch (err) {
        console.error('Failed to save favorites', err);
        const now = useFavoritesStore.getState();
        // Nur zurücksetzen, wenn inzwischen weder Konto noch Liste gewechselt haben
        if (now.loadedAccount === accountId && now.symbols === next) now.setFavorites(accountId, before);
        toast.error(await getApiErrorMessage(err, t('formation.favorite.failed')));
      }
    },
    [accountId],
  );

  return { symbols: current, isFavorite, toggle, ready: accountId !== null && loadedAccount === accountId };
}
