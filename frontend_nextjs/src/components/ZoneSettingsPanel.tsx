'use client';

import { useState } from 'react';
import { useSettingsStore, useBotRuntimeStore } from '@/store';
import { Plus, Loader2, Layers3 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';

import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useZoneDirtyTracking } from '@/hooks/useZoneDirtyTracking';
import { useZoneActions } from '@/hooks/useZoneActions';
import { useZoneFieldHandlers } from '@/hooks/useZoneFieldHandlers';
import { ZoneCard } from '@/components/zone';
import type { ZoneSettings } from '@/store/types';

const EMPTY_ZONES: ZoneSettings[] = [];

interface ZoneSettingsPanelProps {
  selectedAccount: string | null;
  isRunning: boolean;
  liveData: ReturnType<typeof useBotRuntimeStore.getState>['liveData'];
  isGlobalDirty?: boolean;
}

export default function ZoneSettingsPanel({
  selectedAccount,
  isRunning,
  liveData,
  isGlobalDirty,
}: ZoneSettingsPanelProps) {
  const settings = useSettingsStore((s) => s.settings);
  const setZones = useSettingsStore((s) => s.setZones);
  const isLoadingSymbols = useSettingsStore((s) => s.isLoadingSymbols);
  const availableSymbols = useSettingsStore((s) => s.availableSymbols);
  const updateLiveData = useBotRuntimeStore((s) => s.updateLiveData);
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Sabit boş dizi: her render'da yeni [] üretmek dirty-tracking efektini döngüye sokuyordu
  const zones = settings?.ZONES ?? EMPTY_ZONES;

  const symbolDetails = useSymbolDetails(selectedAccount);
  const { modified } = useZoneDirtyTracking(zones, isGlobalDirty, selectedAccount);
  const { toggleActive, restartZone, addZone, deleteZone, updateZone } = useZoneActions(selectedAccount, setZones);
  const { handleChange, handleBlur, syncZonePrecision, validateSymbol } = useZoneFieldHandlers(symbolDetails);

  const handleDeleteZone = (zoneId: string) => {
    setDeleteZoneId(zoneId);
  };

  const handleRemoveZoneConfirmed = () => {
    if (!deleteZoneId) return;
    deleteZone(deleteZoneId);
    setDeleteZoneId(null);
  };

  if (!selectedAccount) return null;

  const mt5Connected = liveData.mt5_connected;
  const disableActionButtons = isRunning && !mt5Connected;

  // Show loading state while symbols are being fetched
  if (isLoadingSymbols && availableSymbols.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Semboller yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Layers3 size={16} />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              Dinamik Bölgeler
              <Badge tone="neutral" data-testid="zone-count">{zones.length}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Fiyat aralığı başına grid kuralları</p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={addZone} disabled={disableActionButtons}>
          <Plus size={14} />
          Bölge Ekle
        </Button>
      </div>

      {(error || liveData.last_error) && (
        <Alert
          tone="danger"
          title={liveData.last_error ? 'MT5 Terminal / Bağlantı Hatası' : undefined}
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
          <p className="text-sm font-medium text-foreground">Henüz bölge yok</p>
          <p className="mt-1 text-xs text-muted-foreground">İlk grid bölgesini eklemek için &quot;Bölge Ekle&quot;ye tıklayın.</p>
        </div>
      )}

      {zones.map((zone, index) => {
        const isModified = modified(zone);

        return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            modified={isModified}
            disableButtons={disableActionButtons}
            onUpdate={updateZone}
            onToggleActive={toggleActive}
            onRestart={restartZone}
            onDelete={() => handleDeleteZone(zone.id)}
            zoneIndex={index}
            liveData={liveData}
            isRunning={isRunning}
            symbolDetails={symbolDetails}
            handleChange={handleChange}
            handleBlur={handleBlur}
            syncZonePrecision={syncZonePrecision}
            validateSymbol={validateSymbol}
          />
        );
      })}

      <ConfirmModal
        open={deleteZoneId !== null}
        onClose={() => setDeleteZoneId(null)}
        onConfirm={handleRemoveZoneConfirmed}
        title="Bölge Sil"
        message="Bu bölgeyi silmek istediğinizden emin misiniz?"
        variant="danger"
      />
    </div>
  );
}