'use client';

import { useCallback } from 'react';
import { useFormat, useT } from '@/i18n';
import type { ZoneSettings } from '@/store/types';

/**
 * Beschriftung eines Fraktal-Setups aus den aktuellen Einstellungen, z. B. „Setup 2 · M5 · 0,02 Lot · TP 2R“;
 * nicht mehr vorhanden → „Setup k (gelöscht)“. Für Statistik-Tab und Trade-Archiv.
 */
export function useSetupLabel() {
  const t = useT();
  const fmt = useFormat();
  return useCallback(
    (zone: ZoneSettings | undefined, sid: number) => {
      if (zone?.entry_mode === 'fractal') {
        const s =
          sid === 1
            ? { tf: zone.fractal_timeframe, lot: zone.lot_size, rr: zone.fractal_rr }
            : (() => {
                const x = zone.fractal_setups?.find((f) => f.sid === sid);
                return x ? { tf: x.fractal_timeframe, lot: x.lot_size, rr: x.fractal_rr } : null;
              })();
        if (s)
          return t('analysis.stats.setup.detail', {
            sid,
            tf: s.tf ?? '—',
            lot: fmt.number(s.lot ?? 0, { maximumFractionDigits: 3 }),
            rr: fmt.number(s.rr ?? 0, { maximumFractionDigits: 2 }),
          });
      }
      return t('analysis.stats.setup.deleted', { sid });
    },
    [t, fmt],
  );
}
