'use client';

import { useCallback } from 'react';
import type { ZoneCardProps } from './types';
import { ZoneHeader } from './ZoneHeader';
import { ZoneFieldsEditor } from './ZoneFieldsEditor';
import { cn } from '@/lib/utils';

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
  const isActive = zone.is_active !== false;
  const isGlobalRunning = liveData.mt5_connected && isRunning;

  const handleSave = useCallback(() => {
    void onSave(zone.id);
  }, [onSave, zone.id]);

  const handleToggleActive = useCallback(() => {
    onToggleActive(zone.id, isActive);
  }, [onToggleActive, zone.id, isActive]);

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

      <ZoneFieldsEditor zone={zone} onUpdate={onUpdate} symbolDetails={symbolDetails}
        handleChange={handleChange} handleBlur={handleBlur} syncZonePrecision={syncZonePrecision} />
    </div>
  );
}
