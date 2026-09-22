'use client';

import { useState } from 'react';
import { useSettingsStore, useBotRuntimeStore } from '@/store';
import { Plus, AlertTriangle, Loader2 } from 'lucide-react';
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
  const { toggleActive, addZone, deleteZone, updateZone } = useZoneActions(selectedAccount, setZones);
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <span className="ml-3 text-gray-400">Semboller yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(error || liveData.last_error) && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start space-x-2 shadow-lg">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="flex flex-col">
            {liveData.last_error && (
              <span className="font-bold text-red-300 mb-0.5">
                MT5 Terminal / Bağlantı Hatası
              </span>
            )}
            <span>{error || liveData.last_error}</span>
          </div>
          <button
            onClick={() => {
              setError('');
              if (liveData.last_error)
                updateLiveData({ last_error: null });
            }}
            className="ml-auto text-red-400 hover:text-red-300 px-2 font-bold"
          >
            X
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">Dinamik Bölgeler</h3>
        <button
          onClick={addZone}
          disabled={disableActionButtons}
          className="flex items-center space-x-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-all active:scale-95"
        >
          <Plus size={16} />
          <span>Bölge Ekle</span>
        </button>
      </div>

      {zones.map((zone) => {
        const isModified = modified(zone);

        return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            modified={isModified}
            disableButtons={disableActionButtons}
            onUpdate={updateZone}
            onToggleActive={toggleActive}
            onDelete={() => handleDeleteZone(zone.id)}
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