'use client';

import { useCallback, useState } from 'react';
import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import { useAccountStore } from '@/store/useAccountStore';

// Worker güncellemeden sonra ~1,5 sn içinde kapanır, .bat 3 sn sonra yeniden başlatır
const WORKER_RESTART_WAIT_MS = 8_000;

interface UpdateResult {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
  loading: boolean;
}

/**
 * Systemmenü im Kopf-Menü (HeaderMenu): Update prüfen/anwenden und Herunterfahren. Liegt in der
 * Kopfzeile, damit es auf jeder Seite funktioniert; Herunterfahren stoppt den Bot des gewählten Kontos.
 */
export function useSystemActions() {
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

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

  return {
    shutdownOpen,
    shuttingDown,
    updateOpen,
    updateResult,
    handleShutdown,
    handleCheckUpdates,
    handleApplyUpdate,
    setShutdownOpen,
    setUpdateOpen,
    setUpdateResult,
  };
}
