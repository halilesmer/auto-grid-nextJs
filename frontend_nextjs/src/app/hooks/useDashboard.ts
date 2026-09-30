'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { GlobalSettings, ZoneSettings } from '@/store/types';

// Worker güncellemeden sonra ~1,5 sn içinde kapanır, .bat 3 sn sonra yeniden başlatır
const WORKER_RESTART_WAIT_MS = 8_000;

interface UpdateResult {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
  loading: boolean;
}

interface UseDashboardConfig {
  selectedAccount: string | null;
  activeAccount: { env_type: string } | null;
  settings: GlobalSettings | null;
  mergeAndSaveSettings: () => Promise<GlobalSettings | null>;
  setUpdateInfo: (info: { hasUpdate: boolean; localVer: string; remoteVer: string }) => void;
}

interface UseDashboardReturn {
  saveAllLoading: boolean;
  saveAllError: string;
  savedSettingsStr: string | null;
  shutdownOpen: boolean;
  shuttingDown: boolean;
  updateOpen: boolean;
  updateResult: UpdateResult | null;
  isDirty: boolean;
  isLive: boolean;
  currentSettingsStr: string;
  handleSaveAll: () => Promise<void>;
  handleDiscard: () => void;
  markZoneSaved: (zone: ZoneSettings) => void;
  handleShutdown: () => Promise<void>;
  handleCheckUpdates: () => Promise<void>;
  handleApplyUpdate: () => Promise<void>;
  setSaveAllError: (error: string) => void;
  setShutdownOpen: (open: boolean) => void;
  setUpdateOpen: (open: boolean) => void;
  setUpdateResult: (result: UpdateResult | null) => void;
  sanitizeForCompare: (jsonStr: string | null) => string | null;
}

export function useDashboard({
  selectedAccount,
  activeAccount,
  settings,
  mergeAndSaveSettings,
  setUpdateInfo,
}: UseDashboardConfig): UseDashboardReturn {
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveAllError, setSaveAllError] = useState('');
  const [savedSettingsStr, setSavedSettingsStr] = useState<string | null>(null);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  const prevAccountRef = useRef(selectedAccount);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (selectedAccount !== prevAccountRef.current) {
      prevAccountRef.current = selectedAccount;
      setSavedSettingsStr(null);
      initializedRef.current = false;
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (settings && !initializedRef.current) {
      setSavedSettingsStr(JSON.stringify(settings));
      initializedRef.current = true;
    }
  }, [settings]);

  const sanitizeForCompare = useCallback((jsonStr: string | null): string | null => {
    if (!jsonStr) return null;
    try {
      const obj = JSON.parse(jsonStr);
      // Kontrol sıklığının kendi "Kaydet" butonu var (SettingsForm); store'a ancak kaydedildikten
      // sonra yazılır. Burada karşılaştırılırsa kayıttan sonra "kaydedilmemiş değişiklik" görünüyordu.
      delete obj.LOOP_INTERVAL_SECONDS;
      if (Array.isArray(obj.ZONES)) {
        obj.ZONES.forEach((z: Record<string, unknown>) => {
          delete z.is_active;
        });
      }
      return JSON.stringify(obj);
    } catch {
      return jsonStr;
    }
  }, []);

  const currentSettingsStr = settings ? JSON.stringify(settings) : '';

  const isDirty = useMemo((): boolean => {
    if (!settings || !savedSettingsStr) return false;
    return sanitizeForCompare(currentSettingsStr) !== sanitizeForCompare(savedSettingsStr);
  }, [settings, savedSettingsStr, currentSettingsStr, sanitizeForCompare]);

  const isLive = useMemo((): boolean => {
    return activeAccount?.env_type === 'LIVE';
  }, [activeAccount]);

  useEffect(() => {
    axiosInstance
      .get(`/system/update/check?branch=main`)
      .then((res) => {
        const { has_update, local_ver, remote_ver } = res.data;
        if (has_update) {
          setUpdateInfo({
            hasUpdate: true,
            localVer: local_ver,
            remoteVer: remote_ver,
          });
        }
      })
      .catch(() => {});
  }, [setUpdateInfo]);

  const handleShutdown = useCallback(async () => {
    setShuttingDown(true);
    try {
      if (selectedAccount) {
        await axiosInstance.post(`/stop?account_id=${selectedAccount}`);
      }
    } catch {
      // best-effort stop
    }
    window.close();
  }, [selectedAccount]);

  const handleCheckUpdates = useCallback(async () => {
    setUpdateResult({
      hasUpdate: false,
      localVer: '...',
      remoteVer: '...',
      loading: true,
    });
    try {
      const res = await axiosInstance.get(`/system/update/check?branch=main`);
      // Worker snake_case döner (local_ver/remote_ver); modal localVer/remoteVer okur
      setUpdateResult({
        hasUpdate: Boolean(res.data.has_update),
        localVer: res.data.local_ver ?? '',
        remoteVer: res.data.remote_ver ?? '',
        loading: false,
      });
    } catch (err: unknown) {
      setUpdateResult(null);
      // Worker nicht erreichbar: Neustart/Update geht dann nur noch per SSH über die VPS-Seite
      const reason = await getApiErrorMessage(err, t('update.checkFailed'));
      toast.error(t('update.checkFailed.hint', { reason }), {
        title: t('update.title'),
      });
    }
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    if (!updateResult) return;
    setUpdateResult({ ...updateResult, loading: true });
    try {
      const res = await axiosInstance.post(`/system/update?branch=main`);
      // Worker yeni kodla yeniden başlıyor (run_uvicorn_watchdog.bat): tekrar ayağa kalkmasını bekle
      if (res.data?.restarting) {
        await new Promise((resolve) => setTimeout(resolve, WORKER_RESTART_WAIT_MS));
      }
      window.location.reload();
    } catch (err: unknown) {
      alert(await getApiErrorMessage(err, t('update.applyFailed')));
      setUpdateResult(null);
    }
  }, [updateResult]);

  // Tek bölge kaydedilince "kaydedilmiş" referansı sadece o bölge için güncellenir;
  // böylece global isDirty diğer bölgelerin/ayarların kaydedilmemiş değişikliklerini korur.
  const markZoneSaved = useCallback((zone: ZoneSettings) => {
    setSavedSettingsStr((prev) => {
      if (!prev) return prev;
      try {
        const obj = JSON.parse(prev);
        const zones: ZoneSettings[] = Array.isArray(obj.ZONES) ? obj.ZONES : [];
        obj.ZONES = zones.some((z) => z.id === zone.id)
          ? zones.map((z) => (z.id === zone.id ? zone : z))
          : [...zones, zone];
        return JSON.stringify(obj);
      } catch {
        return prev;
      }
    });
  }, []);

  // Verwirft ungespeicherte Änderungen; vom Vergleich ausgenommene Felder (Kontrollintervall,
  // is_active) haben eigene Speichern-Wege und bleiben unverändert.
  const handleDiscard = useCallback(() => {
    if (!savedSettingsStr || !settings) return;
    try {
      const saved = JSON.parse(savedSettingsStr) as GlobalSettings;
      const currentZones = new Map((settings.ZONES ?? []).map((z) => [z.id, z]));
      const restored: GlobalSettings = {
        ...saved,
        LOOP_INTERVAL_SECONDS: settings.LOOP_INTERVAL_SECONDS,
        ZONES: (saved.ZONES ?? []).map((z) => {
          const cur = currentZones.get(z.id);
          return cur ? { ...z, is_active: cur.is_active } : z;
        }),
      };
      useSettingsStore.getState().setSettings(restored);
    } catch {
      // ungültiger Referenzstand: nichts verwerfen
    }
  }, [savedSettingsStr, settings]);

  const handleSaveAll = useCallback(async () => {
    if (!selectedAccount || !settings) return;
    setSaveAllLoading(true);
    setSaveAllError('');
    try {
      // Der gesendete Stand (nicht der Store nach dem POST): Eingaben während des Speicherns
      // bleiben „ungespeichert"; das Speichern kann Lots auf das Symbol-Minimum angehoben haben
      const saved = await mergeAndSaveSettings();
      setSavedSettingsStr(JSON.stringify(saved ?? settings));
      toast.success(t('dashboard.saveAll.success'), { title: t('common.saved') });
    } catch (err: unknown) {
      const message = await getApiErrorMessage(err, t('dashboard.saveAll.failed'));
      setSaveAllError(message);
      toast.error(message, { title: t('common.error') });
    } finally {
      setSaveAllLoading(false);
    }
  }, [selectedAccount, settings, mergeAndSaveSettings]);

  return useMemo(
    () => ({
      saveAllLoading,
      saveAllError,
      savedSettingsStr,
      shutdownOpen,
      shuttingDown,
      updateOpen,
      updateResult,
      isDirty,
      isLive,
      currentSettingsStr,
      handleSaveAll,
      handleDiscard,
      markZoneSaved,
      handleShutdown,
      handleCheckUpdates,
      handleApplyUpdate,
      setSaveAllError,
      setShutdownOpen,
      setUpdateOpen,
      setUpdateResult,
      sanitizeForCompare,
    }),
    [
      saveAllLoading,
      saveAllError,
      savedSettingsStr,
      shutdownOpen,
      shuttingDown,
      updateOpen,
      updateResult,
      isDirty,
      isLive,
      currentSettingsStr,
      handleSaveAll,
      handleDiscard,
      markZoneSaved,
      handleShutdown,
      handleCheckUpdates,
      handleApplyUpdate,
      sanitizeForCompare,
    ]
  );
}