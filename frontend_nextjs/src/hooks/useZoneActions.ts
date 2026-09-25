'use client';

import { useCallback, useState } from 'react';
import { useBotRuntimeStore, useSettingsStore } from '@/store';
import { zoneApi } from '@/services/zoneApi';
import { getApiErrorMessage } from '@/lib/apiError';
import { toast } from '@/components/ui/animated-toast';
import { defaultZone } from '@/utils/zoneHelpers';
import type { ZoneSettings } from '@/store/types';
import { t } from '@/i18n';

export interface UseZoneActionsReturn {
  toggleActive: (zoneId: string, currentActive: boolean) => Promise<void>;
  restartZone: (zoneId: string) => Promise<void>;
  saveZone: (zoneId: string) => Promise<void>;
  savingZoneId: string | null;
  addZone: () => void;
  deleteZone: (zoneId: string) => void;
  updateZone: (zoneId: string, field: string, value: unknown) => void;
}

export function useZoneActions(
  selectedAccount: string | null,
  setZones: (zones: ZoneSettings[] | ((prev: ZoneSettings[]) => ZoneSettings[])) => void,
  onZoneSaved?: (zone: ZoneSettings) => void
): UseZoneActionsReturn {
  const settings = useSettingsStore((s) => s.settings);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);
  const [savingZoneId, setSavingZoneId] = useState<string | null>(null);

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

  const getSymbolError = useCallback(
    (zoneSymbol: string): string | null => {
      if (!zoneSymbol.trim()) return t('zone.alert.noSymbol');
      if (Object.keys(symbolDetails).length > 0 && !symbolDetails[zoneSymbol.toUpperCase().trim()]) {
        return t('zone.alert.unsupportedSymbol');
      }
      return null;
    },
    [symbolDetails]
  );

  // Sadece bu bölgeyi kaydeder; diğer bölgelerin kaydedilmemiş değişiklikleri "Tüm Ayarları Kaydet" için kalır
  const saveZone = useCallback(
    async (zoneId: string) => {
      if (!selectedAccount) return;
      const zone = useSettingsStore.getState().settings?.ZONES?.find((z) => z.id === zoneId);
      if (!zone) return;

      const symbolError = getSymbolError(zone.symbol || '');
      if (symbolError) {
        alert(symbolError);
        return;
      }

      setSavingZoneId(zoneId);
      try {
        const remoteSettings = await zoneApi.getSettings(selectedAccount);
        await zoneApi.saveZone(selectedAccount, zone, remoteSettings);
        onZoneSaved?.(zone);
        toast.success(t('zone.saved.text', { symbol: zone.symbol }), { title: t('common.saved') });
      } catch (err: unknown) {
        const message = await getApiErrorMessage(err, t('zone.saveFailed'));
        toast.error(message, { title: 'Hata' });
      } finally {
        setSavingZoneId(null);
      }
    },
    [selectedAccount, getSymbolError, onZoneSaved]
  );

  const toggleActive = useCallback(
    async (zoneId: string, currentActive: boolean) => {
      const newActive = !currentActive;

      const symbolError = getSymbolError(settings?.ZONES?.find((z) => z.id === zoneId)?.symbol || '');
      if (symbolError) {
        alert(symbolError);
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
          alert(t('zone.alert.notSaved'));
        } else {
          console.error('Bölge güncellenemedi', err);
          alert(t('zone.alert.toggleFailed'));
        }
        setZones((prevZones) =>
          prevZones.map((z) => (z.id === zoneId ? { ...z, is_active: currentActive } : z))
        );
      }
    },
    [setZones, selectedAccount, settings, getSymbolError]
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
          alert(t('zone.alert.notSaved'));
        } else {
          console.error('Bölge yeniden başlatılamadı', err);
          alert(t('zone.alert.restartFailed'));
        }
      }
    },
    [selectedAccount]
  );

  return { toggleActive, restartZone, saveZone, savingZoneId, addZone, deleteZone, updateZone };
}