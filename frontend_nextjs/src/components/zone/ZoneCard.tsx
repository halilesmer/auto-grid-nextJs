'use client';

import { useCallback } from 'react';
import type { ZoneCardProps } from './types';
import { ZoneHeader } from './ZoneHeader';
import { SymbolLogsPanel } from './SymbolLogs';
import { ZoneFieldsEditor } from './ZoneFieldsEditor';
import { SetupSummary } from './SetupSummary';
import { ZoneEditActions } from './ZoneEditActions';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  editing,
  isNew,
  onEdit,
  onCancel,
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
  // 640 px altında Vazgeç/Kaydet formun altındaki footer'da (ZON-22); sunucu render'ında geniş ekran varsayılır
  const narrow = !useMediaQuery('(min-width: 640px)', true);

  const handleSave = useCallback(() => {
    void onSave(zone.id);
  }, [onSave, zone.id]);

  const handleEdit = useCallback(() => onEdit(zone.id), [onEdit, zone.id]);
  const handleCancel = useCallback(() => onCancel(zone.id), [onCancel, zone.id]);

  const handleToggleActive = useCallback(() => {
    onToggleActive(zone.id, isActive);
  }, [onToggleActive, zone.id, isActive]);

  const accent = accentClass(zone.order_type);

  return (
    <div
      data-testid="zone-card"
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)] transition-colors',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        accent,
        !isActive && 'before:opacity-40',
        modified && 'border-warning/30',
      )}
    >
      <div className={cn('relative px-2.5 py-2 sm:px-4 sm:py-3', editing && 'border-b border-border')}>
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
          editing={editing}
          isNew={isNew}
          onEdit={handleEdit}
          onCancel={handleCancel}
          actionsInFooter={narrow}
        />
        {/* Sembol logları (LOG-07): Panel bu setup'ın başlığının altında, formun üstünde açılır */}
        <SymbolLogsPanel zoneId={zone.id} />
      </div>

      {editing ? (
        <>
          <ZoneFieldsEditor layout="columns" zone={zone} onUpdate={onUpdate} symbolDetails={symbolDetails}
            spreadStatus={zone.magic === undefined ? undefined : liveData.spread_guards?.[String(zone.magic)]}
            connected={isGlobalRunning}
            handleChange={handleChange} handleBlur={handleBlur} syncZonePrecision={syncZonePrecision} />
          {narrow && (
            <div data-testid="zone-footer" className="flex items-center justify-end gap-2 border-t border-border px-2.5 py-2">
              <ZoneEditActions modified={modified} isNew={isNew} saving={saving} onCancel={handleCancel} onSave={handleSave} />
            </div>
          )}
        </>
      ) : (
        <SetupSummary zone={zone} symbolDetails={symbolDetails} />
      )}
    </div>
  );
}
