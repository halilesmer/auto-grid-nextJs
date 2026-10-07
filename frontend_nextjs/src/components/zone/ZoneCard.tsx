'use client';

import { useEffect, useCallback } from 'react';
import type { ZoneCardProps } from './types';
import {
  getSymbolConfig,
  LOSS_DISTANCE_FIELDS,
  lossToPriceDistance,
  normalizeZoneLots,
  priceDistanceToLoss,
} from '@/utils/zoneHelpers';
import { ZoneHeader } from './ZoneHeader';
import { ZoneBasicFields } from './ZoneBasicFields';
import { ZoneGridFields } from './ZoneGridFields';
import { ZoneSellFields } from './ZoneSellFields';
import { ZoneBreakoutFields } from './ZoneBreakoutFields';
import { ZoneExitFields } from './ZoneExitFields';
import { ZoneFractalFields } from './ZoneFractalFields';
import { SectionLabel } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

function accentClass(orderType: string) {
  if (orderType === 'BUY') return 'before:bg-success';
  if (orderType === 'SELL') return 'before:bg-danger';
  return 'before:bg-primary';
}

export function ZoneCard({
  zone,
  title,
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
}: ZoneCardProps) {
  const t = useT();
  const isBoth = zone.order_type === 'BOTH';
  const showBuyLabel = zone.order_type === 'BUY';
  const showSellLabel = zone.order_type === 'SELL';
  const isFractal = zone.entry_mode === 'fractal';
  const isActive = zone.is_active !== false;
  const isGlobalRunning = liveData.mt5_connected && isRunning;
  const symbolConfig = getSymbolConfig(zone.symbol, symbolDetails);

  const update = useCallback(
    (field: string, value: unknown) => onUpdate(zone.id, field, value),
    [onUpdate, zone.id]
  );

  // Modus umschalten: vorhandene Abstände mit der Lotgröße umrechnen, damit der effektive
  // Abstand gleich bleibt (ohne Tick-Wert des Symbols bleiben die Zahlen stehen)
  const handleStepByLoss = useCallback(
    (on: boolean) => {
      const sellLot = zone.sync_buy_sell ? zone.lot_size : zone.sell_lot_size;
      for (const field of LOSS_DISTANCE_FIELDS) {
        const lot = field.startsWith('sell_') ? sellLot : zone.lot_size;
        const value = zone[field];
        const converted = on
          ? priceDistanceToLoss(value, lot, symbolConfig)
          : lossToPriceDistance(value, lot, symbolConfig);
        if (converted !== null && converted !== value) update(field, converted);
      }
      update('step_by_loss', on);
    },
    [zone, symbolConfig, update]
  );

  const handleSave = useCallback(() => {
    void onSave(zone.id);
  }, [onSave, zone.id]);

  const handleToggleActive = useCallback(() => {
    onToggleActive(zone.id, isActive);
  }, [onToggleActive, zone.id, isActive]);

  // Precision sync when symbol changes - ensures all fields match new symbol's digits
  useEffect(() => {
    syncZonePrecision(zone, symbolConfig, update);
  }, [zone.symbol, symbolConfig, syncZonePrecision, zone, update]);

  // Lot nie 0 / unter dem Minimum des Symbols beim Broker: bei Symbolwechsel, beim Laden der
  // Symboldaten und beim Öffnen einer Zone mit ungültigem Lot auf dessen Raster bringen. Bewusst
  // nur an die Symbol-Regeln gebunden, nicht an den Lot selbst – sonst würde jede Tastatureingabe
  // („2" auf dem Weg zu „20") sofort auf das Minimum angehoben.
  const { volMin, volStep, volMax } = symbolConfig;
  useEffect(() => {
    const fixed = normalizeZoneLots(zone, symbolDetails);
    if (fixed.lot_size !== zone.lot_size) update('lot_size', fixed.lot_size);
    if (fixed.sell_lot_size !== zone.sell_lot_size) update('sell_lot_size', fixed.sell_lot_size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.symbol, volMin, volStep, volMax, update]);

  const accent = accentClass(zone.order_type);

  return (
    <div
      data-testid="zone-card"
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card shadow-md transition-colors dark:shadow-black/40',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        accent,
        !isActive && 'before:opacity-40',
        modified && 'border-warning/30',
      )}
    >
      <div className="border-b border-border px-3 py-3 sm:px-4">
        <ZoneHeader
          zone={zone}
          title={title}
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

      <div className="space-y-4 px-3 py-4 sm:px-4">
        <section className="space-y-3">
          <SectionLabel>{t('zone.section.basic')}</SectionLabel>
          <ZoneBasicFields
            zone={zone}
            update={update}
            symbolConfig={symbolConfig}
            handleChange={handleChange}
            handleBlur={handleBlur}
          />
        </section>

        {isFractal ? (
          <section className="space-y-3">
            <SectionLabel>{t('zone.section.fractal')}</SectionLabel>
            <ZoneFractalFields
              zone={zone}
              update={update}
              symbolConfig={symbolConfig}
              isBoth={isBoth}
              sync={zone.sync_buy_sell}
              handleChange={handleChange}
              handleBlur={handleBlur}
            />
          </section>
        ) : (
          <>
            <section className="space-y-3">
              {showBuyLabel && <SectionLabel className="text-success">{t('zone.section.buyGrid')}</SectionLabel>}
              {showSellLabel && <SectionLabel className="text-danger">{t('zone.section.sellGrid')}</SectionLabel>}
              {isBoth && (
                <SectionLabel className={zone.sync_buy_sell ? undefined : 'text-success'}>
                  {zone.sync_buy_sell ? t('zone.section.grid') : t('zone.section.buyGridShort')}
                </SectionLabel>
              )}

              <ZoneGridFields
                zone={zone}
                update={update}
                symbolConfig={symbolConfig}
                isBoth={isBoth}
                sync={zone.sync_buy_sell}
                handleChange={handleChange}
                handleBlur={handleBlur}
                onStepByLoss={handleStepByLoss}
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
          </>
        )}

        <ZoneExitFields
          zone={zone}
          update={update}
        />
      </div>
    </div>
  );
}
