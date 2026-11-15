import { useCallback, useSyncExternalStore } from 'react';
import { t } from '@/i18n';
import { useMetricsPrefsStore } from '@/store/useMetricsPrefsStore';
import { useUserPrefsStore } from '@/store/useUserPrefsStore';

const get = () => useMetricsPrefsStore.getState().pinned;

/** Kennzahlen unter der Steuerleiste anheften (V2); die Wahl gehört dem Benutzer und liegt im Worker (`metrics_pinned`, USR-15). */
export function usePinnedMetrics() {
  const pinned = useSyncExternalStore(useMetricsPrefsStore.subscribe, get, () => true);
  const setPinned = useCallback((next: boolean) => {
    void useUserPrefsStore.getState().change('metrics_pinned', { pinned: next }, () => ({ name: t(next ? 'metrics.pin' : 'metrics.unpin'), value: '' }), { silent: true });
  }, []);
  return [pinned, setPinned] as const;
}
