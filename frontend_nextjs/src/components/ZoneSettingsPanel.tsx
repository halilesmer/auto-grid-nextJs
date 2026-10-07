'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSettingsStore, useBotRuntimeStore } from '@/store';
import { Plus, Loader2, Layers3 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import { LegacySetupOrdersDialog } from '@/components/LegacySetupOrdersDialog';
import { useT } from '@/i18n';

import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useZoneDirtyTracking } from '@/hooks/useZoneDirtyTracking';
import { useZoneActions } from '@/hooks/useZoneActions';
import { useZoneFieldHandlers } from '@/hooks/useZoneFieldHandlers';
import { groupBySymbol } from '@/lib/symbolSetups';
import { AddSymbolDialog } from '@/components/zone/AddSymbolDialog';
import { SymbolCard, ZoneCard } from '@/components/zone';
import type { ZoneSettings } from '@/store/types';

const EMPTY_ZONES: ZoneSettings[] = [];

interface ZoneSettingsPanelProps {
  selectedAccount: string | null;
  isRunning: boolean;
  liveData: ReturnType<typeof useBotRuntimeStore.getState>['liveData'];
  isGlobalDirty?: boolean;
  /** Steht im Kopf links neben „Sembol Ekle“ (z. B. „Tüm Ayarları Kaydet“). */
  saveAction?: ReactNode;
  /** Tek bir bölge kaydedilince çağrılır (global dirty referansını günceller). */
  onZoneSaved?: (zone: ZoneSettings) => void;
}

export default function ZoneSettingsPanel({
  selectedAccount,
  isRunning,
  liveData,
  isGlobalDirty,
  saveAction,
  onZoneSaved,
}: ZoneSettingsPanelProps) {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const setZones = useSettingsStore((s) => s.setZones);
  const isLoadingSymbols = useSettingsStore((s) => s.isLoadingSymbols);
  const availableSymbols = useSettingsStore((s) => s.availableSymbols);
  const engineOrder = useSettingsStore((s) => s.engineOrder);
  const updateLiveData = useBotRuntimeStore((s) => s.updateLiveData);
  // Bleibt nach dem Schließen stehen, damit Titel und Text beim Ausblenden nicht umspringen
  const [deleteTarget, setDeleteTarget] = useState<{ zoneId: string; symbol: string; isLastSetup: boolean } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addSymbolOpen, setAddSymbolOpen] = useState(false);
  const [error, setError] = useState('');

  // Sabit boş dizi: her render'da yeni [] üretmek dirty-tracking efektini döngüye sokuyordu
  const zones = settings?.ZONES ?? EMPTY_ZONES;
  const groups = useMemo(() => groupBySymbol(zones), [zones]);

  const symbolDetails = useSymbolDetails(selectedAccount);
  const { modified, setOriginalZones } = useZoneDirtyTracking(zones, isGlobalDirty, selectedAccount);

  const handleZoneSaved = useCallback(
    (zone: ZoneSettings) => {
      const saved = { ...zone };
      setOriginalZones((prev) =>
        prev.some((z) => z.id === saved.id) ? prev.map((z) => (z.id === saved.id ? saved : z)) : [...prev, saved]
      );
      onZoneSaved?.(zone);
    },
    [setOriginalZones, onZoneSaved]
  );

  const { toggleActive, restartZone, saveZone, savingZoneId, addSetup, deleteZone, renameSymbol, updateZone } = useZoneActions(
    selectedAccount,
    setZones,
    handleZoneSaved
  );
  const { handleChange, handleBlur, syncZonePrecision, validateSymbol } = useZoneFieldHandlers(symbolDetails);

  // Letztes Setup seines Symbols: Löschen nimmt auch das Symbol aus der Liste
  const askDelete = (zone: ZoneSettings) => {
    const isLastSetup = zones.filter((z) => z.symbol === zone.symbol).length === 1;
    setDeleteTarget({ zoneId: zone.id, symbol: zone.symbol, isLastSetup });
    setDeleteOpen(true);
  };

  const handleRemoveZoneConfirmed = () => {
    if (!deleteTarget) return;
    deleteZone(deleteTarget.zoneId);
    setDeleteOpen(false);
  };

  if (!selectedAccount) return null;

  const mt5Connected = liveData.mt5_connected;
  const disableActionButtons = isRunning && !mt5Connected;
  const isGlobalRunning = mt5Connected && isRunning;

  // Show loading state while symbols are being fetched
  if (isLoadingSymbols && availableSymbols.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">{t('zone.panel.loadingSymbols')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dar ekranda (375 px) butonlar başlığın altına iner; ml-auto onları sağda tutar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Layers3 size={16} />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              {t('zone.panel.title')}
              <Badge tone="neutral" data-testid="symbol-count" hint={t('zone.panel.count.hint')}>{groups.length}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('zone.panel.subtitle')}</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {saveAction}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddSymbolOpen(true)}
            disabled={disableActionButtons}
            hint={disableActionButtons ? t('zone.panel.add.off.hint') : t('zone.panel.add.hint')}
          >
            <Plus size={14} />
            {t('zone.panel.add')}
          </Button>
        </div>
      </div>

      {(error || liveData.last_error) && (
        <Alert
          tone="danger"
          title={liveData.last_error ? t('zone.panel.terminalError') : undefined}
          onDismiss={() => {
            setError('');
            if (liveData.last_error)
              updateLiveData({ last_error: null });
          }}
        >
          {error || liveData.last_error}
        </Alert>
      )}

      {zones.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
          <Layers3 size={22} className="mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('zone.panel.empty.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('zone.panel.empty.text')}</p>
        </div>
      )}

      {groups.map((group) => (
        <SymbolCard
          key={group.zones[0].id}
          symbol={group.symbol}
          setupCount={group.zones.length}
          marketIndexes={group.zones
            .filter((zone) => zone.is_active !== false)
            .map((zone) => engineOrder.indexOf(zone.id))
            .filter((index) => index >= 0)}
          liveData={liveData}
          isGlobalRunning={isGlobalRunning}
          symbolDetails={symbolDetails}
          validateSymbol={validateSymbol}
          disableAddSetup={disableActionButtons}
          onAddSetup={() => addSetup(group.symbol)}
          onRenameSymbol={(symbol) => renameSymbol(group.symbol, symbol)}
        >
          {group.zones.map((zone, setupIndex) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              title={t('zone.setup.title', { n: setupIndex + 1 })}
              modified={modified(zone)}
              disableButtons={disableActionButtons}
              onUpdate={updateZone}
              onToggleActive={toggleActive}
              onRestart={restartZone}
              onDelete={() => askDelete(zone)}
              onSave={saveZone}
              saving={savingZoneId === zone.id}
              zoneIndex={engineOrder.indexOf(zone.id)}
              liveData={liveData}
              isRunning={isRunning}
              symbolDetails={symbolDetails}
              handleChange={handleChange}
              handleBlur={handleBlur}
              syncZonePrecision={syncZonePrecision}
            />
          ))}
        </SymbolCard>
      ))}

      <AddSymbolDialog
        open={addSymbolOpen}
        onClose={() => setAddSymbolOpen(false)}
        existingSymbols={groups.map((group) => group.symbol)}
        symbolDetails={symbolDetails}
        validateSymbol={validateSymbol}
        onAdd={addSetup}
      />

      <LegacySetupOrdersDialog accountId={selectedAccount} />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleRemoveZoneConfirmed}
        title={deleteTarget?.isLastSetup ? t('zone.delete.last.title') : t('zone.delete.title')}
        message={
          deleteTarget?.isLastSetup
            ? t('zone.delete.last.message', { symbol: deleteTarget.symbol || '—' })
            : t('zone.delete.message')
        }
        confirmHint={deleteTarget?.isLastSetup ? t('zone.delete.last.confirm.hint') : t('zone.delete.confirm.hint')}
        variant="danger"
      />
    </div>
  );
}