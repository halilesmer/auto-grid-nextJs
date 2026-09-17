'use client';

import { useCallback } from 'react';
import { useBotStore } from '@/store/useBotStore';
import { zoneApi } from '@/services/zoneApi';
import { defaultZone } from '@/utils/zoneHelpers';
import type { ZoneSettings } from '@/store/useBotStore';

export interface UseZoneActionsReturn {
  toggleActive: (zoneId: string, currentActive: boolean) => Promise<void>;
  addZone: () => void;
  deleteZone: (zoneId: string) => void;
  updateZone: (zoneId: string, field: string, value: unknown) => void;
}

export function useZoneActions(
  selectedAccount: string | null,
  setZones: (zones: ZoneSettings[] | ((prev: ZoneSettings[]) => ZoneSettings[])) => void
): UseZoneActionsReturn {
  const updateZone = useCallback(
    (zoneId: string, field: string, value: unknown) => {
      setZones((prevZones) =>
        prevZones.map((z) => (z.id === zoneId ? { ...z, [field]: value } : z))
      );
    },
    [setZones]
  );

  const addZone = useCallback(() => {
    const state = useBotStore.getState();
    const currentZones = state.settings?.ZONES || [];
    const lastSymbol = currentZones.length > 0 ? currentZones[currentZones.length - 1].symbol : '';

    setZones((prevZones) => [...prevZones, { ...defaultZone(), symbol: lastSymbol }]);
  }, [setZones]);

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

      const storeState = useBotStore.getState();
      const zoneSymbol = storeState.settings?.ZONES?.find((z) => z.id === zoneId)?.symbol || '';

      if (!zoneSymbol.trim()) {
        alert('Hatalı Sembol! Lütfen bölge için geçerli bir sembol girin.');
        return;
      }

      if (
        Object.keys(storeState.symbolDetails).length > 0 &&
        !storeState.symbolDetails[zoneSymbol.toUpperCase().trim()]
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
    [setZones, selectedAccount]
  );

  return { toggleActive, addZone, deleteZone, updateZone };
}