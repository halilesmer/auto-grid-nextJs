'use client';

import { useEffect, useCallback } from 'react';
import type { ZoneCardProps } from './types';
import { getSymbolConfig } from '@/utils/zoneHelpers';
import { ZoneHeader } from './ZoneHeader';
import { ZoneBasicFields } from './ZoneBasicFields';
import { ZoneGridFields } from './ZoneGridFields';
import { ZoneSellFields } from './ZoneSellFields';
import { ZoneBreakoutFields } from './ZoneBreakoutFields';
import { ZoneExitFields } from './ZoneExitFields';

export function ZoneCard({
  zone,
  modified,
  disableButtons,
  onUpdate,
  onToggleActive,
  onDelete,
  liveData,
  isRunning,
  symbolDetails,
  handleChange,
  handleBlur,
  syncZonePrecision,
  validateSymbol,
}: ZoneCardProps) {
  const isBoth = zone.order_type === 'BOTH';
  const showBuyLabel = zone.order_type === 'BUY';
  const showSellLabel = zone.order_type === 'SELL';
  const isActive = zone.is_active !== false;
  const isGlobalRunning = liveData.mt5_connected && isRunning;
  const symbolConfig = getSymbolConfig(zone.symbol, symbolDetails);

  const update = useCallback(
    (field: string, value: unknown) => onUpdate(zone.id, field, value),
    [onUpdate, zone.id]
  );

  const handleToggleActive = useCallback(() => {
    onToggleActive(zone.id, isActive);
  }, [onToggleActive, zone.id, isActive]);

  // Precision sync when symbol changes - ensures all fields match new symbol's digits
  useEffect(() => {
    const volPrecision = symbolConfig.volStep.toString().includes('.')
      ? symbolConfig.volStep.toString().split('.')[1].length
      : 2;
    syncZonePrecision(zone, symbolConfig, volPrecision, update);
  }, [zone.symbol, symbolConfig, syncZonePrecision, zone, update]);

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-xl shadow-xl space-y-4">
      <ZoneHeader
        zone={zone}
        isActive={isActive}
        isGlobalRunning={isGlobalRunning}
        modified={modified}
        disableButtons={disableButtons}
        onToggleActive={handleToggleActive}
        onDelete={onDelete}
      />

      <hr className="border-white/10" />

      <ZoneBasicFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        symbolDetails={symbolDetails}
        handleChange={handleChange}
        handleBlur={handleBlur}
        validateSymbol={validateSymbol}
      />

      {isBoth && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`sync-${zone.id}`}
            checked={zone.sync_buy_sell}
            onChange={(e) => update('sync_buy_sell', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <label htmlFor={`sync-${zone.id}`} className="text-sm text-gray-300">
            BUY ve SELL için aynı ayarları uygula
          </label>
        </div>
      )}

      {showBuyLabel && (
        <p className="text-sm text-green-400 font-semibold">BUY (Alış) Grid Ayarları</p>
      )}
      {showSellLabel && (
        <p className="text-sm text-red-400 font-semibold">SELL (Satış) Grid Ayarları</p>
      )}

      <ZoneGridFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        isBoth={isBoth}
        sync={zone.sync_buy_sell}
        handleChange={handleChange}
        handleBlur={handleBlur}
      />

      {isBoth && !zone.sync_buy_sell && (
        <ZoneSellFields
          zone={zone}
          update={update}
          symbolConfig={symbolConfig}
          handleChange={handleChange}
          handleBlur={handleBlur}
        />
      )}

      <ZoneBreakoutFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        isBoth={isBoth}
        sync={zone.sync_buy_sell}
        handleChange={handleChange}
        handleBlur={handleBlur}
      />

      <ZoneExitFields
        zone={zone}
        update={update}
      />
    </div>
  );
}
