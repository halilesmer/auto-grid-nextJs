'use client';

import { useFormat, useT } from '@/i18n';
import { lossToPriceDistance, type SymbolConfig } from '@/utils/zoneHelpers';

/** „Abstand nach Verlust“: zeigt, welchem Preisabstand der $-Betrag bei der Lotgröße entspricht. */
export function LossPreview({ amount, lot, symbolConfig }: { amount: number; lot: number; symbolConfig: SymbolConfig }) {
  const t = useT();
  const { number } = useFormat();
  const distance = lossToPriceDistance(amount, lot, symbolConfig);
  if (distance === null) return null;
  return (
    <span data-testid="loss-preview" className="text-[11px] text-muted-foreground">
      {t('zone.field.lossPreview', {
        distance: number(distance, { maximumFractionDigits: symbolConfig.precision }),
        lot: number(lot, { maximumFractionDigits: 2 }),
      })}
    </span>
  );
}
