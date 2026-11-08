'use client';

import { useMemo } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { buildSetupSummary } from '@/lib/setupSummary';
import { cn } from '@/lib/utils';
import { getSymbolConfig } from '@/utils/zoneHelpers';
import type { SymbolDetail, ZoneSettings } from '@/store/types';

/**
 * Kayıtlı setup'ın özet hâli (ZON-22): ayarlar çip olarak, sıra üç kutuyla aynı
 * (Giriş → Kırılım/Pullback + Spread → Çıkış). Kapalı seçenekler soluk ve kesik çizgili.
 */
export function SetupSummary({ zone, symbolDetails }: { zone: ZoneSettings; symbolDetails: Record<string, SymbolDetail> }) {
  const t = useT();
  const fmt = useFormat();
  const items = useMemo(() => {
    const config = getSymbolConfig(zone.symbol, symbolDetails);
    return buildSetupSummary(zone, {
      t,
      number: (value) => fmt.number(value, { maximumFractionDigits: 8 }),
      distance: { unit: config.distanceUnit ?? null, size: config.distanceUnitSize ?? null },
    });
  }, [zone, symbolDetails, t, fmt]);

  return (
    <ul
      data-testid="setup-summary"
      aria-label={t('zone.summary.aria')}
      className="m-0 flex list-none flex-wrap gap-[5px] px-3 pb-3 pt-0.5 sm:px-4"
    >
      {items.map((item) => (
        <li key={item.id} className="min-w-0 max-w-full">
          <Tooltip content={t(`zone.summary.${item.id}.hint` as MessageKey)} className="max-w-full" touchToggle>
            <span
              tabIndex={0}
              data-testid={`summary-${item.id}`}
              data-off={item.off || undefined}
              className={cn(
                'inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-md border px-[7px] py-0.5 text-[11.5px] leading-tight',
                item.off ? 'border-dashed border-border bg-transparent' : 'border-border bg-muted/60',
              )}
            >
              <span className="shrink-0 text-muted-foreground">{item.label}</span>
              <span className={cn('min-w-0 break-words font-mono font-medium tabular-nums', item.off ? 'text-muted-foreground' : 'text-foreground')}>
                {item.value}
              </span>
            </span>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
