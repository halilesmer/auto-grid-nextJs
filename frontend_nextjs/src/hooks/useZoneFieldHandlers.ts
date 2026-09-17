'use client';

import { useCallback } from 'react';
import type { ZoneSettings, SymbolDetail } from '@/store/useBotStore';
import { getSymbolConfig, parseFloatCustom } from '@/utils/zoneHelpers';

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
    update: (field: string, value: unknown) => void
  ) => void;
  validateSymbol: (symbol: string) => boolean;
  syncZonePrecision: (
    zone: ZoneSettings,
    symbolConfig: ReturnType<typeof getSymbolConfig>,
    volPrecision: number,
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
      update: (field: string, value: unknown) => void
    ) => {
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
      volPrecision: number,
      update: (field: string, value: unknown) => void
    ) => {
      const p = symbolConfig.precision;
      const vp = volPrecision;

      const fieldsToFix: Array<[string, number, number]> = [
        ['min_price', zone.min_price, p],
        ['max_price', zone.max_price, p],
        ['grid_step', zone.grid_step, p],
        ['take_profit', zone.take_profit, p],
        ['stop_loss', zone.stop_loss, p],
        ['sell_grid_step', zone.sell_grid_step, p],
        ['sell_take_profit', zone.sell_take_profit, p],
        ['sell_stop_loss', zone.sell_stop_loss, p],
        ['pullback_distance', zone.pullback_distance, p],
        ['sell_pullback_distance', zone.sell_pullback_distance, p],
        ['lot_size', zone.lot_size, vp],
        ['sell_lot_size', zone.sell_lot_size, vp],
      ];

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