'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { axiosInstance, API } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import type { GlobalSettings } from '@/store/types';

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
  mergeAndSaveSettings: (apiUrl: string) => Promise<void>;
  setUpdateInfo: (info: { hasUpdate: boolean; localVer: string; remoteVer: string }) => void;
}

interface UseDashboardReturn {
  saveAllLoading: boolean;
  saveAllError: string;
  savedSettingsStr: string | null;
  shutdownOpen: boolean;
  shuttingDown: boolean;
  showSysInfo: boolean;
  updateOpen: boolean;
  updateResult: UpdateResult | null;
  isDirty: boolean;
  isLive: boolean;
  currentSettingsStr: string;
  handleSaveAll: () => Promise<void>;
  handleShutdown: () => Promise<void>;
  handleCheckUpdates: () => Promise<void>;
  handleApplyUpdate: () => Promise<void>;
  setSaveAllError: (error: string) => void;
  setShowSysInfo: (show: boolean) => void;
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
  const [showSysInfo, setShowSysInfo] = useState(false);
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
      .get(`${API}/system/update/check?branch=main`)
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
        await axiosInstance.post(`${API}/stop?account_id=${selectedAccount}`);
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
      const res = await axiosInstance.get(`${API}/system/update/check?branch=main`);
      // Worker snake_case döner (local_ver/remote_ver); modal localVer/remoteVer okur
      setUpdateResult({
        hasUpdate: Boolean(res.data.has_update),
        localVer: res.data.local_ver ?? '',
        remoteVer: res.data.remote_ver ?? '',
        loading: false,
      });
    } catch {
      setUpdateResult(null);
    }
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    if (!updateResult) return;
    setUpdateResult({ ...updateResult, loading: true });
    try {
      await axiosInstance.post(`${API}/system/update?branch=main`);
      window.location.reload();
    } catch (err: unknown) {
      alert(await getApiErrorMessage(err, 'Update failed'));
      setUpdateResult(null);
    }
  }, [updateResult]);

  const handleSaveAll = useCallback(async () => {
    if (!selectedAccount || !settings) return;
    setSaveAllLoading(true);
    setSaveAllError('');
    try {
      await mergeAndSaveSettings(API);
      setSavedSettingsStr(JSON.stringify(settings));
    } catch (err: unknown) {
      setSaveAllError(await getApiErrorMessage(err, 'Tüm ayarları kaydetme başarısız'));
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
      showSysInfo,
      updateOpen,
      updateResult,
      isDirty,
      isLive,
      currentSettingsStr,
      handleSaveAll,
      handleShutdown,
      handleCheckUpdates,
      handleApplyUpdate,
      setSaveAllError,
      setShowSysInfo,
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
      showSysInfo,
      updateOpen,
      updateResult,
      isDirty,
      isLive,
      currentSettingsStr,
      handleSaveAll,
      handleShutdown,
      handleCheckUpdates,
      handleApplyUpdate,
      sanitizeForCompare,
    ]
  );
}