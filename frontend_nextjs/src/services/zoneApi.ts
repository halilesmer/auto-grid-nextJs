import { axiosInstance } from './api';
import type { ZoneSettings } from '@/store/types';

export interface RemoteSettings {
  ZONES?: ZoneSettings[];
  [key: string]: unknown;
}

export const zoneApi = {
  async getSettings(accountId: string) {
    const res = await axiosInstance.get(`/settings/${accountId}`);
    return res.data?.settings || {};
  },

  async saveSettings(accountId: string, settings: RemoteSettings) {
    const res = await axiosInstance.post(`/settings/${accountId}`, { settings });
    return res.data;
  },

  async getSymbols(accountId: string) {
    const res = await axiosInstance.get(`/symbols/${accountId}`);
    return res.data?.symbols || res.data || {};
  },

  async toggleZoneActive(
    accountId: string,
    zoneId: string,
    newActive: boolean,
    remoteSettings: RemoteSettings
  ): Promise<RemoteSettings> {
    const remoteZones: ZoneSettings[] = remoteSettings.ZONES || [];
    const existsRemotely = remoteZones.some((z) => z.id === zoneId);

    if (!existsRemotely) {
      throw new Error('ZONE_NOT_SAVED');
    }

    const updatedZones = remoteZones.map((z) =>
      z.id === zoneId ? { ...z, is_active: newActive } : z
    );

    const updatedSettings = { ...remoteSettings, ZONES: updatedZones };
    await axiosInstance.post(`/settings/${accountId}`, { settings: updatedSettings });

    const zoneIdx = remoteZones.findIndex((z) => z.id === zoneId);
    if (zoneIdx >= 0) {
      await axiosInstance.post(`/ui-state/${accountId}`, {
        settings: { states: { [zoneIdx]: newActive ? 'START' : 'PAUSE' } },
      });
    }

    return updatedSettings;
  },

  /**
   * Sadece motorun bölge durumunu değiştirir (is_active'e dokunmaz), ör. otomatik
   * temizlenen (AUTO_CLEAR) bölgeyi yeniden başlatmak için. Motor kayıtlı sıraya göre çalışır.
   */
  async setZoneState(accountId: string, zoneId: string, state: 'START' | 'PAUSE'): Promise<number> {
    const remoteSettings: RemoteSettings = await zoneApi.getSettings(accountId);
    const zoneIdx = (remoteSettings.ZONES || []).findIndex((z) => z.id === zoneId);
    if (zoneIdx < 0) {
      throw new Error('ZONE_NOT_SAVED');
    }
    await axiosInstance.post(`/ui-state/${accountId}`, {
      settings: { states: { [zoneIdx]: state } },
    });
    return zoneIdx;
  },
};