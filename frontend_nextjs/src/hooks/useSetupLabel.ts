'use client';

import { useCallback, useMemo } from 'react';
import { useT } from '@/i18n';
import type { ZoneRegistryEntry } from '@/lib/analysis/tradePairing';
import { setupNumbers } from '@/lib/symbolSetups';
import type { ZoneSettings } from '@/store/types';

/**
 * Name eines Setups (Magic) auf der Analyse-Seite: „Symbol · Setup n“ wie auf den Symbolkarten. Ein Setup,
 * das nicht mehr in den Einstellungen steht (gelöscht), heißt nach Symbol und Name aus dem Zonen-Register.
 */
export function useSetupLabel(zones: ZoneSettings[] | null, registry: ZoneRegistryEntry[] | undefined) {
  const t = useT();
  const bySetup = useMemo(() => {
    const numbers = setupNumbers(zones ?? []);
    const m = new Map<number, { symbol: string; n: number }>();
    for (const zone of zones ?? []) {
      if (zone.magic !== undefined) m.set(zone.magic, { symbol: zone.symbol, n: numbers.get(zone.id) ?? 0 });
    }
    return m;
  }, [zones]);
  return useCallback(
    (magic: number) => {
      const setup = bySetup.get(magic);
      if (setup) return t('analysis.zone.option', { n: setup.n, symbol: setup.symbol || '—' });
      const reg = registry?.find((r) => r.magic === magic);
      return t('analysis.stats.zone.registry', { label: reg?.label ?? `#${magic}`, symbol: reg?.symbol || '—' });
    },
    [bySetup, registry, t],
  );
}
