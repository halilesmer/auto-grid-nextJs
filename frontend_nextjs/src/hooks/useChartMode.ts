'use client';

import { useCallback } from 'react';
import { useAccountStore, useSettingsStore } from '@/store';
import { resolveChartMode, timeframeAllowed, type ChartMode } from '@/lib/chart/mode';
import { useUrlUpdate } from './useUrlUpdate';

/**
 * Modus der Chartseite aus der Adresse (`resolveChartMode`) und der Wechsel dazu. Beim Wechsel bleibt das Konto; das Produkt bleibt in Formation und Frei (Setup und Formation ohne symbol= geben Frei das Produkt ihrer Zone);
 * ein im neuen Modus unerlaubtes `tf` fällt auf den Standard des Modus, `form` gilt nur in Formation, `zone` nicht in Frei.
 */
export function useChartMode() {
  const { params, update } = useUrlUpdate();
  const mode = resolveChartMode(params);
  const tf = params.get('tf');
  const setMode = useCallback(
    (next: ChartMode) => {
      if (next === mode && params.get('mode') === next) return;
      // Frei braucht ein Produkt in der Adresse; Setup und Formation (ohne symbol=) gewinnen es aus ihrer Zone
      let symbol: string | undefined;
      if (next === 'free' && !params.get('symbol')?.trim()) {
        const account = params.get('account') ?? useAccountStore.getState().selectedAccount;
        const { settings, loadedAccount } = useSettingsStore.getState();
        const zones = account && loadedAccount === account ? (settings?.ZONES ?? []) : [];
        const zone = zones.find((z) => z.id === params.get('zone')) ?? zones[0];
        symbol = zone?.symbol?.trim() || undefined;
      }
      update({
        ...(symbol ? { symbol } : {}),
        // In Setup gilt das Produkt der Zone; ein altes symbol= aus Formation oder Frei würde beim Rückweg die Zone überstimmen
        ...(next === 'setup' ? { symbol: null } : {}),
        mode: next,
        tf: timeframeAllowed(next, tf) ? tf : null,
        ...(next === 'formation' ? {} : { form: null }),
        ...(next === 'free' ? { zone: null } : {}),
        ...(next === 'formation' ? { tab: null } : {}),
      });
    },
    [mode, params, tf, update],
  );
  return { mode, setMode };
}
