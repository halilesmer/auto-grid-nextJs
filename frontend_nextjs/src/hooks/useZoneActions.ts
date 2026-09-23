'use client';

import { useCallback } from 'react';
import { useBotRuntimeStore, useSettingsStore } from '@/store';
import { zoneApi } from '@/services/zoneApi';
import { defaultZone } from '@/utils/zoneHelpers';
import type { ZoneSettings } from '@/store/types';

export interface UseZoneActionsReturn {
  toggleActive: (zoneId: string, currentActive: boolean) => Promise<void>;
  restartZone: (zoneId: string) => Promise<void>;
  addZone: () => void;
  deleteZone: (zoneId: string) => void;
  updateZone: (zoneId: string, field: string, value: unknown) => void;
}

export function useZoneActions(
  selectedAccount: string | null,
  setZones: (zones: ZoneSettings[] | ((prev: ZoneSettings[]) => ZoneSettings[])) => void
): UseZoneActionsReturn {
  const settings = useSettingsStore((s) => s.settings);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);

  const updateZone = useCallback(
    (zoneId: string, field: string, value: unknown) => {
      setZones((prevZones) =>
        prevZones.map((z) => (z.id === zoneId ? { ...z, [field]: value } : z))
      );
    },
    [setZones]
  );

  const addZone = useCallback(() => {
    const currentZones = settings?.ZONES || [];
    const lastSymbol = currentZones.length > 0 ? currentZones[currentZones.length - 1].symbol : '';

    setZones((prevZones) => [...prevZones, { ...defaultZone(), symbol: lastSymbol }]);
  }, [setZones, settings]);

  const deleteZone = useCallback(
    (zoneId: string) => {
      setZones((prevZones) => {
        const filtered = prevZones.filter((z) => z.id !== zoneId);
        return filtered.length > 0 ? filtered : [defaultZone()];
      });
    },
    [setZones]
  );

  const toggleActive = useCallback(
    async (zoneId: string, currentActive: boolean) => {
      const newActive = !currentActive;

      const zoneSymbol = settings?.ZONES?.find((z) => z.id === zoneId)?.symbol || '';

      if (!zoneSymbol.trim()) {
        alert('Hatalı Sembol! Lütfen bölge için geçerli bir sembol girin.');
        return;
      }

      if (
        Object.keys(symbolDetails).length > 0 &&
        !symbolDetails[zoneSymbol.toUpperCase().trim()]
      ) {
        alert(
          'Hatalı Sembol! Girdiğiniz sembol broker tarafından desteklenmiyor. Lütfen geçerli bir sembol girin.'
        );
        return;
      }

      setZones((prevZones) =>
        prevZones.map((z) => (z.id === zoneId ? { ...z, is_active: newActive } : z))
      );

      if (!selectedAccount) return;

      try {
        const remoteSettings = await zoneApi.getSettings(selectedAccount);
        await zoneApi.toggleZoneActive(selectedAccount, zoneId, newActive, remoteSettings);
      } catch (err: unknown) {
        const error = err as { message?: string };
        if (error.message === 'ZONE_NOT_SAVED') {
          alert('Bu bölge henüz kaydedilmemiş! Lütfen önce \'Tüm Ayarları Kaydet\' butonuna basın.');
        } else {
          console.error('Bölge güncellenemedi', err);
          alert('Bölge durumu kaydedilemedi!');
        }
        setZones((prevZones) =>
          prevZones.map((z) => (z.id === zoneId ? { ...z, is_active: currentActive } : z))
        );
      }
    },
    [setZones, selectedAccount, settings, symbolDetails]
  );

  // Otomatik temizlenen (AUTO_CLEAR) veya motorun duraklattığı bölgeyi yeniden başlatır
  const restartZone = useCallback(
    async (zoneId: string) => {
      if (!selectedAccount) return;
      try {
        const zoneIdx = await zoneApi.setZoneState(selectedAccount, zoneId, 'START');
        // Uyarı hemen kalksın; bir sonraki log polling'i motorun gerçek durumunu getirir
        const { liveData, updateLiveData } = useBotRuntimeStore.getState();
        updateLiveData({ zone_states: { ...(liveData.zone_states ?? {}), [String(zoneIdx)]: 'START' } });
      } catch (err: unknown) {
        const error = err as { message?: string };
        if (error.message === 'ZONE_NOT_SAVED') {
          alert('Bu bölge henüz kaydedilmemiş! Lütfen önce \'Tüm Ayarları Kaydet\' butonuna basın.');
        } else {
          console.error('Bölge yeniden başlatılamadı', err);
          alert('Bölge yeniden başlatılamadı!');
        }
      }
    },
    [selectedAccount]
  );

  return { toggleActive, restartZone, addZone, deleteZone, updateZone };
}