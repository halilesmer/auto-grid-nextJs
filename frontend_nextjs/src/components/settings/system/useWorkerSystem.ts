'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { axiosInstance } from '@/lib/api';
import { stripAnsi, type AutoUpdateStatus } from '@/lib/vps';

// Worker üzerinden okunan sistem durumu: her yerde çalışır (SSH gerekmez). Yalnız yerel durum,
// çünkü bu veriyi başka bileşen kullanmaz. Eski VpsOnlinePanel mantığının yeridir (VPS-09).

export interface WorkerStatus {
  version: string;
  uptime_sec: number | null;
  supervised: boolean;
  bots_running: number;
  bots_total: number;
  /** PR 260 öncesi worker'larda yok */
  auto_update?: AutoUpdateStatus;
}

const POLL_MS = 15_000;
// Tünel takılırsa istek sonsuza dek açık kalmasın (yoklama döngüsü bu isteği bekler)
const REQUEST_TIMEOUT_MS = 10_000;
const FAST_POLL_MS = 3_000;
const FAST_POLL_DURATION_MS = 60_000;

export function useWorkerSystem() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [readAt, setReadAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [restarting, setRestarting] = useState(false);
  const fastUntil = useRef(0);
  // Worker yeniden başlatma komutundan sonra bir kez kapandıysa (ya da süre dolduysa) geri döndü sayılır
  const restartedAt = useRef(0);
  const sawDown = useRef(false);

  // Yalnız en yeni istek sayılır: geç gelen eski cevap daha yeni bir durumu ya da hatayı ezmesin
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++requestId.current;
    try {
      const [st, log] = await Promise.allSettled([
        axiosInstance.get<WorkerStatus>('/system/worker/status', { timeout: REQUEST_TIMEOUT_MS }),
        axiosInstance.get<{ lines: string[] }>('/system/worker/log', { params: { lines: 300 }, timeout: REQUEST_TIMEOUT_MS }),
      ]);
      if (mine !== requestId.current) return;
      // Durum şart; log okunamazsa yalnız log kutusu boş kalır, worker „ulaşılamıyor“ olmaz
      if (st.status === 'rejected') throw st.reason;
      setStatus(st.value.data);
      setReadAt(Date.now());
      if (log.status === 'fulfilled') setLines((log.value.data.lines ?? []).map(stripAnsi));
      setError(null);
      if (restartedAt.current && (sawDown.current || Date.now() - restartedAt.current > FAST_POLL_DURATION_MS)) {
        restartedAt.current = 0;
        sawDown.current = false;
        setRestarting(false);
      }
    } catch (err) {
      if (mine !== requestId.current) return;
      if (restartedAt.current) sawDown.current = true;
      setError(await getApiErrorMessage(err, t('vps.online.loadFailed')));
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let first = true;
    const loop = async () => {
      // İlk okuma her zaman; sonra yalnız sekme görünürken
      if (first || document.visibilityState === 'visible') await refresh();
      first = false;
      if (cancelled) return;
      timer = setTimeout(loop, Date.now() < fastUntil.current ? FAST_POLL_MS : POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const restart = useCallback(async () => {
    setRestarting(true);
    try {
      await axiosInstance.post('/system/restart');
      toast.success(t('vps.online.restarting'), { title: t('vps.action.restart') });
      restartedAt.current = Date.now();
      sawDown.current = false;
      fastUntil.current = Date.now() + FAST_POLL_DURATION_MS;
      // Bekleyen 15 sn'lik zamanlayıcıyı beklemeden hızlı yoklamayı başlat
      window.setTimeout(() => void refresh(), FAST_POLL_MS);
    } catch (err) {
      setRestarting(false);
      toast.error(await getApiErrorMessage(err, t('vps.action.failed')), { title: t('vps.action.restart') });
    }
  }, [refresh]);

  return { status, readAt, error, lines, restarting, refresh, restart };
}
