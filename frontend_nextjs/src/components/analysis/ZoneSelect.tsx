'use client';

import { useCallback } from 'react';
import { Combobox } from '@/components/ui/combobox';
import { InfoHint } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import type { ZoneSettings } from '@/store/types';

interface ZoneItem {
  zone: ZoneSettings;
  n: number;
}

/** Zonenwahl der Analyse-Seite: nur Zonen des gewählten Kontos (`zones` = null: werden geladen). */
export function ZoneSelect({
  zones,
  value,
  onChange,
}: {
  zones: ZoneSettings[] | null;
  value: string | null;
  onChange: (zoneId: string) => void;
}) {
  const t = useT();
  const items: ZoneItem[] = (zones ?? []).map((zone, i) => ({ zone, n: i + 1 }));
  const label = useCallback(
    (item: ZoneItem) => t('analysis.zone.option', { n: item.n, symbol: item.zone.symbol || '—' }),
    [t],
  );
  return (
    <div data-tooltip-scope className="flex min-w-0 flex-1 items-center gap-1.5 sm:w-56 sm:flex-none" data-testid="zone-select">
      <div className="min-w-0 flex-1">
        <Combobox
          items={items}
          value={value}
          onChange={onChange}
          getKey={(item) => item.zone.id}
          getLabel={label}
          filter={(item, q) => label(item).toLowerCase().includes(q)}
          placeholder={
            zones === null
              ? t('analysis.zone.loading')
              : zones.length === 0
                ? t('analysis.zone.empty')
                : t('analysis.zone.placeholder')
          }
          searchPlaceholder={t('analysis.zone.search')}
          emptyMessage={t('analysis.zone.empty')}
          disabled={zones === null || zones.length === 0}
          aria-label={t('analysis.zone')}
        />
      </div>
      <InfoHint hint={t('analysis.zone.hint')} />
    </div>
  );
}
