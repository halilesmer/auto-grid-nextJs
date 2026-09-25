'use client';

import { useFormat, useT } from '@/i18n';
import { getSymbolGuidance } from '@/utils/symbolGuidance';

/** Hängt an die Hinweise von Grid-Abstand/Take Profit den Richtwert des Zonen-Symbols an (falls bekannt). */
export function useGuidedHints(symbol: string | undefined) {
  const t = useT();
  const { number } = useFormat();
  const guidance = getSymbolGuidance(symbol);
  const range = (r: readonly [number, number]) =>
    `${number(r[0], { maximumFractionDigits: 5 })}–${number(r[1], { maximumFractionDigits: 5 })}`;

  return {
    step: (base: string) =>
      guidance
        ? `${base}\n\n${t('zone.field.gridStep.guide', { symbol: (symbol ?? '').toUpperCase(), range: range(guidance.step) })}`
        : base,
    tp: (base: string) =>
      guidance
        ? `${base}\n\n${t('zone.field.takeProfit.guide', { symbol: (symbol ?? '').toUpperCase(), range: range(guidance.tp) })}`
        : base,
  };
}
