import { axiosInstance } from '@/lib/api';
import { settingsFromWorker, settingsToWorker } from '@/lib/symbolSetups';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { GlobalSettings, ZoneSettings } from '@/store/types';

export const zoneApi = {
  async getSettings(accountId: string): Promise<GlobalSettings> {
    const res = await axiosInstance.get(`/settings/${accountId}`);
    return settingsFromWorker(res.data?.settings || {});
  },

  async saveSettings(accountId: string, settings: Partial<GlobalSettings>) {
    const res = await axiosInstance.post(`/settings/${accountId}`, { settings: settingsToWorker(settings) });
    // Der Worker gruppiert nach Symbol: die Engine-Plätze können sich mit dem Speichern ändern
    if (settings.ZONES) useSettingsStore.getState().applySavedOrder(accountId, settings.ZONES);
    return res.data;
  },

  /**
   * Tek bir bölgeyi kaydeder: kayıtlı bölge listesinde aynı id'li bölge değiştirilir,
   * yoksa (yeni bölge) sona eklenir. Diğer bölgelere ve ayarlara dokunulmaz.
   */
  async saveZone(accountId: string, zone: ZoneSettings, remoteSettings: GlobalSettings) {
    const remoteZones: ZoneSettings[] = remoteSettings.ZONES || [];
    const existsRemotely = remoteZones.some((z) => z.id === zone.id);
    const ZONES = existsRemotely
      ? remoteZones.map((z) => (z.id === zone.id ? zone : z))
      : [...remoteZones, zone];
    await zoneApi.saveSettings(accountId, { ZONES });
  },

  /** Semboller + (liste boşsa) worker'ın MT5 hata metni */
  async getSymbols(accountId: string) {
    const res = await axiosInstance.get(`/symbols/${accountId}`);
    return {
      symbols: res.data?.symbols || res.data || {},
      error: typeof res.data?.error === 'string' ? (res.data.error as string) : null,
    };
  },

  async toggleZoneActive(
    accountId: string,
    zoneId: string,
    newActive: boolean,
    remoteSettings: GlobalSettings
  ): Promise<GlobalSettings> {
    const remoteZones: ZoneSettings[] = remoteSettings.ZONES || [];
    const existsRemotely = remoteZones.some((z) => z.id === zoneId);

    if (!existsRemotely) {
      throw new Error('ZONE_NOT_SAVED');
    }

    // Befehl vor dem Speichern, an den heutigen Platz (GET-Reihenfolge = Reihenfolge der ui_state-Datei).
    // Gruppiert das Speichern eine alte Datei mit gemischten Symbolen um, zieht der Worker (Bot gestoppt)
    // oder der Bot beim nächsten Einlesen (ENG-27) die Datei mit um. Ein Befehl an den neuen Platz nach
    // dem Speichern läse der laufende Bot beim Umziehen als alten Platz und schöbe ihn auf eine andere Zone.
    const zoneIdx = remoteZones.findIndex((z) => z.id === zoneId);
    const postState = (state: 'START' | 'PAUSE') =>
      axiosInstance.post(`/ui-state/${accountId}`, { settings: { states: { [zoneIdx]: state } } });
    await postState(newActive ? 'START' : 'PAUSE');

    const updatedZones = remoteZones.map((z) =>
      z.id === zoneId ? { ...z, is_active: newActive } : z
    );
    const updatedSettings = { ...remoteSettings, ZONES: updatedZones };
    try {
      await zoneApi.saveSettings(accountId, updatedSettings);
    } catch (err) {
      // is_active blieb, wie es war: den Motorzustand wieder dazu passend setzen
      await postState(newActive ? 'PAUSE' : 'START').catch((revertErr: unknown) =>
        console.error('Motorzustand nach gescheitertem Speichern nicht zurückgesetzt', revertErr)
      );
      throw err;
    }

    return updatedSettings;
  },

  /**
   * Sadece motorun bölge durumunu değiştirir (is_active'e dokunmaz), ör. otomatik
   * temizlenen (AUTO_CLEAR) bölgeyi yeniden başlatmak için. Motor kayıtlı sıraya göre çalışır.
   */
  async setZoneState(accountId: string, zoneId: string, state: 'START' | 'PAUSE'): Promise<number> {
    const remoteSettings = await zoneApi.getSettings(accountId);
    const zoneIdx = (remoteSettings.ZONES || []).findIndex((z) => z.id === zoneId);
    if (zoneIdx < 0) {
      throw new Error('ZONE_NOT_SAVED');
    }
    await axiosInstance.post(`/ui-state/${accountId}`, {
      settings: { states: { [zoneIdx]: state } },
    });
    return zoneIdx;
  },

  /** Yalnızca bu setup'ların robot log satırları ("[Z:<id>]" etiketli), dosya sırasıyla. */
  async getSymbolLogs(accountId: string, zoneIds: string[], lines = 100): Promise<string[]> {
    // Worker zone_id'yi tekrarlanan parametre olarak okur (?zone_id=a&zone_id=b); axios dizi
    // parametresini "zone_id[]=" yazacağı için URLSearchParams olduğu gibi gönderilir
    const params = new URLSearchParams({ log_type: 'robot', lines: String(lines) });
    for (const zoneId of zoneIds) params.append('zone_id', zoneId);
    const res = await axiosInstance.get(`/logs/${accountId}`, { params });
    return res.data?.robot_log || [];
  },
};
