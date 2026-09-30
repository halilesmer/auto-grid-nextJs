'use client';

import { useCallback } from 'react';
import type { ZoneSettings, SymbolDetail } from '@/store/types';
import { getSymbolConfig, normalizeLot, parseFloatCustom } from '@/utils/zoneHelpers';

export interface UseZoneFieldHandlersReturn {
  handleChange: (
    field: string,
    value: string | number | boolean,
    zone: ZoneSettings,
    symbolConfig: ReturnType<typeof getSymbolConfig>,
    update: (field: string, value: unknown) => void
  ) => void;
  handleBlur: (
    field: string,
    value: number | undefined,
    step: number,
    precision: number,
    update: (field: string, value: unknown) => void,
    /** Für Lot-Felder: Symbol-Regeln (volume_min/step/max) statt der einfachen Rundung */
    symbolConfig?: ReturnType<typeof getSymbolConfig>
  ) => void;
  validateSymbol: (symbol: string) => boolean;
  syncZonePrecision: (
    zone: ZoneSettings,
    symbolConfig: ReturnType<typeof getSymbolConfig>,
    update: (field: string, value: unknown) => void
  ) => void;
}

export function useZoneFieldHandlers(
  symbolDetails: Record<string, SymbolDetail>
): UseZoneFieldHandlersReturn {
  const validateSymbol = useCallback(
    (symbol: string): boolean => {
      if (Object.keys(symbolDetails).length === 0) return true;
      if (!symbol) return true;
      return Object.keys(symbolDetails).some(
        (k) => k.toUpperCase() === symbol.toUpperCase().trim()
      );
    },
    [symbolDetails]
  );

  const handleChange = useCallback(
    (
      field: string,
      value: string | number | boolean,
      zone: ZoneSettings,
      symbolConfig: ReturnType<typeof getSymbolConfig>,
      update: (field: string, value: unknown) => void
    ) => {
      let parsedValue: unknown = value;

      if (typeof value === 'string' && field !== 'symbol' && field !== 'order_type') {
        const isVolume = field.toLowerCase().includes('lot');
        const precision = isVolume
          ? symbolConfig.volStep.toString().split('.')[1]?.length || 2
          : symbolConfig.precision;
        parsedValue = parseFloatCustom(value, precision);
        // Lot nie 0: leer / „0" / „0." bleibt nur Entwurf im Eingabefeld, der State behält den
        // letzten gültigen Lot; liegt ein getippter Wert unter dem Minimum des Symbols, hebt
        // handleBlur ihn beim Verlassen an
        if (isVolume && !((parsedValue as number) > 0)) return;
      }

      update(field, parsedValue);
    },
    []
  );

  const handleBlur = useCallback(
    (
      field: string,
      value: number | undefined,
      step: number,
      precision: number,
      update: (field: string, value: unknown) => void,
      symbolConfig?: ReturnType<typeof getSymbolConfig>
    ) => {
      if (symbolConfig && field.toLowerCase().includes('lot')) {
        const lot = normalizeLot(value ?? NaN, symbolConfig);
        if (lot !== value) update(field, lot);
        return;
      }
      if (value === undefined || value === null || isNaN(value) || !step) return;

      const rounded = Number((Math.round(value / step) * step).toFixed(precision));
      if (rounded !== value) update(field, rounded);
    },
    []
  );

  const syncZonePrecision = useCallback(
    (
      zone: ZoneSettings,
      symbolConfig: ReturnType<typeof getSymbolConfig>,
      update: (field: string, value: unknown) => void
    ) => {
      const p = symbolConfig.precision;
      // Abstände/TP/SL als $-Betrag („Abstand nach Verlust“): immer 2 Nachkommastellen
      const dp = zone.step_by_loss ? 2 : p;

      const fieldsToFix: Array<[string, number, number]> = [
        ['min_price', zone.min_price, p],
        ['max_price', zone.max_price, p],
        ['grid_step', zone.grid_step, dp],
        ['take_profit', zone.take_profit, dp],
        ['stop_loss', zone.stop_loss, dp],
        ['sell_grid_step', zone.sell_grid_step, dp],
        ['sell_take_profit', zone.sell_take_profit, dp],
        ['sell_stop_loss', zone.sell_stop_loss, dp],
        ['pullback_distance', zone.pullback_distance, dp],
        ['sell_pullback_distance', zone.sell_pullback_distance, dp],
        ['fractal_sl_buffer', zone.fractal_sl_buffer ?? 0, p],
      ];
      // Lot-Felder gehören nicht hierher: toFixed(Schritt-Stellen) machte aus 0.01 bei Schritt 0.1
      // eine 0. Sie laufen über normalizeLot (ZoneCard-Effekt bei Symbolwechsel, handleBlur).

      fieldsToFix.forEach(([field, val, prec]) => {
        if (typeof val === 'number' && !isNaN(val)) {
          const rounded = Number(val.toFixed(prec));
          if (rounded !== val) {
            update(field, rounded);
          }
        }
      });
    },
    []
  );

  return { handleChange, handleBlur, validateSymbol, syncZonePrecision };
}