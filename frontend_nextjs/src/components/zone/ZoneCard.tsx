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
import { SectionLabel } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function ZoneCard({
  zone,
  modified,
  disableButtons,
  onUpdate,
  onToggleActive,
  onRestart,
  onDelete,
  onSave,
  saving,
  zoneIndex,
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

  const handleSave = useCallback(() => {
    void onSave(zone.id);
  }, [onSave, zone.id]);

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

  const accent =
    zone.order_type === 'BUY' ? 'before:bg-success' : zone.order_type === 'SELL' ? 'before:bg-danger' : 'before:bg-primary';

  return (
    <div
      data-testid="zone-card"
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-background/50 transition-colors',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        accent,
        !isActive && 'before:opacity-40',
        modified && 'border-warning/30',
      )}
    >
      <div className="border-b border-border px-5 py-4">
        <ZoneHeader
          zone={zone}
          isActive={isActive}
          isGlobalRunning={isGlobalRunning}
          modified={modified}
          disableButtons={disableButtons}
          engineState={liveData.zone_states?.[String(zoneIndex)]}
          remotePaused={liveData.remote_paused}
          onToggleActive={handleToggleActive}
          onRestart={onRestart}
          onDelete={onDelete}
          onSave={handleSave}
          saving={saving}
        />
      </div>

      <div className="space-y-5 px-5 py-5">
        <section className="space-y-3">
          <SectionLabel>Temel</SectionLabel>
          <ZoneBasicFields
            zone={zone}
            update={update}
            symbolConfig={symbolConfig}
            symbolDetails={symbolDetails}
            handleChange={handleChange}
            handleBlur={handleBlur}
            validateSymbol={validateSymbol}
          />
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {showBuyLabel && <SectionLabel className="text-success">BUY (Alış) Grid Ayarları</SectionLabel>}
            {showSellLabel && <SectionLabel className="text-danger">SELL (Satış) Grid Ayarları</SectionLabel>}
            {isBoth && (
              <SectionLabel className={zone.sync_buy_sell ? undefined : 'text-success'}>
                {zone.sync_buy_sell ? 'Grid Ayarları' : 'BUY Grid Ayarları'}
              </SectionLabel>
            )}
            {isBoth && (
              <Switch
                id={`sync-${zone.id}`}
                checked={zone.sync_buy_sell}
                onChange={(checked) => update('sync_buy_sell', checked)}
                label={<span className="text-xs text-muted-foreground">BUY ve SELL için aynı ayarları uygula</span>}
              />
            )}
          </div>

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
        </section>

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
    </div>
  );
}
