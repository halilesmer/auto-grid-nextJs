'use client';

import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { settingsFromWorker } from '@/lib/symbolSetups';
import { useSettingsStore } from '@/store';

/**
 * Lädt die Einstellungen (Zonen) eines Kontos in useSettingsStore.
 *
 * - `always`: bei jedem Kontowechsel bzw. Einhängen neu laden (Dashboard, wie bisher).
 * - `ifMissing`: nur laden, wenn noch nicht die Einstellungen dieses Kontos im Store liegen
 *   (Analyse-Seite: ungespeicherte Zonen-Änderungen bleiben erhalten).
 *
 * Eine verspätete Antwort für ein anderes Konto wird verworfen. Rückgabe: Fehlertext, wenn das Laden
 * für dieses Konto gescheitert ist (sonst null).
 */
export function useAccountSettings(accountId: string | null, mode: 'always' | 'ifMissing' = 'always'): string | null {
  const [failure, setFailure] = useState<{ accountId: string; message: string } | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const store = useSettingsStore.getState();
    if (mode === 'ifMissing' && store.loadedAccount === accountId && store.settings) return;
    if (store.loadedAccount !== accountId) store.setSettings(null);
    let stale = false;
    axiosInstance
      .get(`/settings/${accountId}`)
      .then((res) => {
        if (stale) return;
        useSettingsStore.getState().setLoadedSettings(accountId, settingsFromWorker(res.data.settings || res.data));
        setFailure(null);
      })
      .catch(async (err) => {
        console.error('Failed to fetch settings', err);
        const message = await getApiErrorMessage(err, t('analysis.zone.failed'));
        if (!stale) setFailure({ accountId, message });
      });
    return () => {
      stale = true;
    };
  }, [accountId, mode]);

  return failure && failure.accountId === accountId ? failure.message : null;
}
