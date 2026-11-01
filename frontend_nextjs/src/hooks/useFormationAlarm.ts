'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/animated-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { t } from '@/i18n';
import type { AlarmEvent } from '@/lib/formation/alarm';
import { withoutHistory, type HistoryEntry } from '@/lib/formation/alarmHistory';
import { formationUrl, notificationPermission } from '@/lib/formation/alarmNotify';
import { save, serverSnapshot, snapshot, subscribe, type Stored } from '@/lib/formation/alarmStore';
import { SCAN_FORMATIONS, type ScanFormation } from '@/lib/formation/scan';
import { useFavoritesScanStore } from '@/store/useFavoritesScanStore';

const noSubscription = () => () => {};
const NO_HISTORY: HistoryEntry[] = [];

/**
 * Einstellungen und Stand des Formationsalarms fürs Glocken-Menü. Die Suche und die Meldungen laufen app-weit im
 * FormationScanRunner; dieser Hook ändert nur die gespeicherten Einstellungen und liest den Stand der Suche.
 * `symbol` ist das auf /formasyon gewählte Produkt (Schalter „Alarm für …“), null ohne Konto oder Produkt.
 */
export function useFormationAlarm(accountId: string | null, symbol: string | null) {
  const router = useRouter();
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const permission = useSyncExternalStore(noSubscription, notificationPermission, () => 'unsupported' as const);
  const favorites = useFavorites(accountId);
  const gaps = useFavoritesScanStore((s) => s.gaps);
  const doneAt = useFavoritesScanStore((s) => s.doneAt);
  const lastRunAt = useFavoritesScanStore((s) => s.lastRunAt);

  const scope = accountId && symbol ? `${accountId}|${symbol}` : null;
  const enabled = scope !== null && stored.enabled.includes(scope);
  const favoritesEnabled = accountId !== null && stored.favoritesEnabled.includes(accountId);

  const bells = useMemo(() => (accountId ? stored.enabled.filter((x) => x.startsWith(`${accountId}|`)).map((x) => x.slice(accountId.length + 1)) : []), [accountId, stored.enabled]);
  // Weitere Alarm-Produkte: Glocken-Produkte ohne das gewählte Produkt, dessen Schalter oben steht
  const extras = bells.filter((x) => x !== symbol);
  const status = useMemo(() => {
    const products = [...new Set([...(favoritesEnabled ? favorites.symbols : []), ...bells])];
    return {
      total: products.length,
      ready: products.filter((x) => doneAt[x] !== undefined && !gaps[x]).length,
      incomplete: products.filter((x) => gaps[x]),
      lastRunAt,
    };
  }, [favoritesEnabled, favorites.symbols, bells, doneAt, gaps, lastRunAt]);

  const update = useCallback((change: (current: Stored) => Stored) => save(change(snapshot())), []);
  const history = (accountId && stored.history[accountId]) || NO_HISTORY;
  const clearHistory = useCallback(() => {
    if (accountId) update((current) => withoutHistory(current, accountId));
  }, [accountId, update]);
  const openEntry = useCallback(
    (entry: HistoryEntry) => {
      if (accountId) router.push(formationUrl(accountId, entry));
    },
    [accountId, router],
  );

  const setEnabled = useCallback(
    (on: boolean) => {
      if (scope === null) return;
      update((current) => ({ ...current, enabled: on ? [...current.enabled.filter((x) => x !== scope), scope] : current.enabled.filter((x) => x !== scope) }));
      if (on && symbol) toast.info(t('formation.alarm.enabled', { symbol }), { duration: 6000 });
    },
    [scope, symbol, update],
  );
  const removeExtra = useCallback(
    (extra: string) => {
      if (accountId) update((current) => ({ ...current, enabled: current.enabled.filter((x) => x !== `${accountId}|${extra}`) }));
    },
    [accountId, update],
  );
  const setFavorites = useCallback(
    async (on: boolean) => {
      if (accountId === null) return;
      // Der Schalter speichert sofort; die Abfrage des Browsers kann offen bleiben (Chrome unterdrückt sie still oder niemand antwortet)
      update((current) => ({
        ...current,
        favoritesEnabled: on ? [...current.favoritesEnabled.filter((x) => x !== accountId), accountId] : current.favoritesEnabled.filter((x) => x !== accountId),
      }));
      if (on) toast.info(t('formation.alarm.favorites.enabled'), { duration: 6000 });
      // Beim Einschalten fragt der Browser nach der Erlaubnis; wird sie erteilt, geht die Systemmeldung an
      if (on && notificationPermission() === 'default') {
        await Notification.requestPermission();
        if (notificationPermission() === 'granted') update((current) => ({ ...current, prefs: { ...current.prefs, system: true } }));
      }
    },
    [accountId, update],
  );
  const setEvent = useCallback((event: AlarmEvent, on: boolean) => update((current) => ({ ...current, prefs: { ...current.prefs, events: { ...current.prefs.events, [event]: on } } })), [update]);
  const setForm = useCallback(
    (form: ScanFormation, on: boolean) =>
      update((current) => ({ ...current, prefs: { ...current.prefs, forms: SCAN_FORMATIONS.filter((x) => (x === form ? on : current.prefs.forms.includes(x))) } })),
    [update],
  );
  const setSound = useCallback((on: boolean) => update((current) => ({ ...current, prefs: { ...current.prefs, sound: on } })), [update]);
  const setSystem = useCallback(
    async (on: boolean) => {
      // Der Schalter speichert sofort; eine offene Abfrage des Browsers hält ihn nicht auf
      update((current) => ({ ...current, prefs: { ...current.prefs, system: on } }));
      if (on && notificationPermission() === 'default') await Notification.requestPermission();
    },
    [update],
  );

  return { prefs: stored.prefs, enabled, favoritesEnabled, favoriteCount: favorites.symbols.length, extras, status, permission, history, clearHistory, openEntry, setEnabled, setFavorites, removeExtra, setEvent, setForm, setSound, setSystem };
}
