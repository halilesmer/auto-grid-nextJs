'use client';

import { useEffect } from 'react';
import { axiosInstance } from '@/lib/api';
import { useAccountStore, useBotRuntimeStore } from '@/store';
import type { LiveData } from '@/store/types';

const POLL_MS = 5_000;

/**
 * Offene Positionen und Orders des Bots für den Chart (ANA-06): dieselben Bot-Metriken wie das
 * Dashboard (GET /logs/{id}?log_type=metrics), alle 5 s, in useBotRuntimeStore.liveData. Eine Antwort
 * für ein inzwischen abgewähltes Konto wird verworfen. Ohne laufenden Bot gibt es keine Listen.
 */
export function useLiveTrades(accountId: string | null) {
  useEffect(() => {
    if (!accountId) return;
    let stale = false;
    const poll = async () => {
      try {
        const res = await axiosInstance.get(`/logs/${encodeURIComponent(accountId)}`, {
          params: { log_type: 'metrics', lines: 1 },
        });
        if (stale || useAccountStore.getState().selectedAccount !== accountId) return;
        const metrics = (res.data?.metrics ?? null) as Partial<LiveData> | null;
        const running = res.data?.bot_running === true;
        useBotRuntimeStore.getState().updateLiveData({
          ...(metrics ?? {}),
          ...(typeof res.data?.bot_running === 'boolean' ? { bot_running: running } : {}),
          // Ausdrücklich setzen: eine alte Metrikdatei (Bot gestoppt) liefert keine gültigen Listen
          positions: running ? metrics?.positions : undefined,
          orders: running ? metrics?.orders : undefined,
        });
      } catch {
        // Kein Abbruch des Charts; nächster Versuch in 5 s (das Dashboard meldet Verbindungsfehler)
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [accountId]);
}
