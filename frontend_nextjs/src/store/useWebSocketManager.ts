'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useBotRuntimeStore } from './useBotRuntimeStore';
import { useLogsStore } from './useLogsStore';
import { Metrics, LiveData } from './types';
import { API_BASE, WORKER_API_KEY } from '@/lib/api';
import { t } from '@/i18n';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

type WSMessage =
  | { type: 'METRICS'; payload: Partial<Metrics> }
  | { type: 'LIVE_DATA'; payload: Partial<LiveData> }
  | { type: 'LOG'; payload: { logType: 'robot' | 'mt5'; line: string } };

function buildWsUrl(): string {
  const url = API_BASE.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws/stream';
  // Tarayıcılar WebSocket'e başlık ekleyemez → anahtar sorgu parametresiyle gider
  return WORKER_API_KEY ? `${url}?api_key=${encodeURIComponent(WORKER_API_KEY)}` : url;
}

export function useWebSocketManager(selectedAccount: string | null): {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});
  const [isConnected, setIsConnected] = useState(false);

  // Stable refs to store actions (avoid selector reference changes)
  const updateMetricsRef = useRef(useBotRuntimeStore.getState().updateMetrics);
  const setWsErrorRef = useRef(useBotRuntimeStore.getState().setWsError);
  const incrementWsRetriesRef = useRef(useBotRuntimeStore.getState().incrementWsRetries);
  const resetWsRetriesRef = useRef(useBotRuntimeStore.getState().resetWsRetries);

  const appendRobotLogRef = useRef(useLogsStore.getState().appendRobotLog);
  const appendMt5LogRef = useRef(useLogsStore.getState().appendMt5Log);

  // Keep refs updated without triggering re-renders
  useEffect(() => {
    updateMetricsRef.current = useBotRuntimeStore.getState().updateMetrics;
    setWsErrorRef.current = useBotRuntimeStore.getState().setWsError;
    incrementWsRetriesRef.current = useBotRuntimeStore.getState().incrementWsRetries;
    resetWsRetriesRef.current = useBotRuntimeStore.getState().resetWsRetries;
    appendRobotLogRef.current = useLogsStore.getState().appendRobotLog;
    appendMt5LogRef.current = useLogsStore.getState().appendMt5Log;
  });

  // Stable handleMessage using refs - never changes
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'METRICS':
          updateMetricsRef.current(data.payload);
          break;
        case 'LIVE_DATA':
          // Sunucu bunu yalnızca API sürecinde MT5 verisi yokken ({mt5_connected:false})
          // gönderir; bot sürecinin durumu değildir. liveData'ya yazmak çalışan botu
          // "Durduruldu" gösteriyordu. Bot durumu log polling'den (useDashboard) gelir.
          break;
        case 'LOG':
          if (data.payload.logType === 'robot') {
            appendRobotLogRef.current(data.payload.line);
          } else {
            appendMt5LogRef.current(data.payload.line);
          }
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) {
      setWsErrorRef.current(t('ws.failed'));
      return;
    }

    const delay = Math.min(BASE_DELAY_MS * 2 ** retryCountRef.current, MAX_DELAY_MS);
    retryCountRef.current += 1;
    incrementWsRetriesRef.current();

    reconnectTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connectRef.current();
      }
    }, delay);
  }, []);

  const connect = useCallback(() => {
    const state = wsRef.current?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
    if (!selectedAccount) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      resetWsRetriesRef.current();
      setWsErrorRef.current(null);
      setIsConnected(true);
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      setIsConnected(false);
      if (isMountedRef.current) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnection
    };
  }, [selectedAccount, handleMessage, scheduleReconnect]);

  // Keep connectRef updated for use in scheduleReconnect (avoids circular dependency)
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      // Eski soketin onclose'u yeniden bağlanma zamanlamasın (çift soket oluşuyordu)
      const ws = wsRef.current;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      wsRef.current = null;
    }
    retryCountRef.current = 0;
    resetWsRetriesRef.current();
    setIsConnected(false);
  }, []);

  // Only depend on selectedAccount - connect/disconnect are stable
  useEffect(() => {
    isMountedRef.current = true;

    if (selectedAccount) {
      connect();
    } else {
      // Wrap in setTimeout to avoid synchronous setState in effect
      setTimeout(() => disconnect(), 0);
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  return {
    isConnected,
    connect,
    disconnect,
  };
}