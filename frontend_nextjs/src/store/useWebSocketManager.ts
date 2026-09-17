'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useBotRuntimeStore } from './useBotRuntimeStore';
import { useLogsStore } from './useLogsStore';
import { Metrics, LiveData } from './types';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

type WSMessage =
  | { type: 'METRICS'; payload: Partial<Metrics> }
  | { type: 'LIVE_DATA'; payload: Partial<LiveData> }
  | { type: 'LOG'; payload: { logType: 'robot' | 'mt5'; line: string } };

function buildWsUrl(): string {
  const rawAPI = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return rawAPI.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws/stream';
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

  const { updateMetrics, updateLiveData, setWsError, incrementWsRetries, resetWsRetries } =
    useBotRuntimeStore();
  const { appendRobotLog, appendMt5Log } = useLogsStore();

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'METRICS':
          updateMetrics(data.payload);
          break;
        case 'LIVE_DATA':
          updateLiveData(data.payload);
          break;
        case 'LOG':
          if (data.payload.logType === 'robot') {
            appendRobotLog(data.payload.line);
          } else {
            appendMt5Log(data.payload.line);
          }
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }, [updateMetrics, updateLiveData, appendRobotLog, appendMt5Log]);

  const scheduleReconnect = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) {
      setWsError('WebSocket connection failed after multiple attempts. Please connect manually.');
      return;
    }

    const delay = Math.min(BASE_DELAY_MS * 2 ** retryCountRef.current, MAX_DELAY_MS);
    retryCountRef.current += 1;
    incrementWsRetries();

    reconnectTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connectRef.current();
      }
    }, delay);
  }, [incrementWsRetries, setWsError]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!selectedAccount) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      resetWsRetries();
      setWsError(null);
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
  }, [selectedAccount, handleMessage, scheduleReconnect, resetWsRetries, setWsError]);

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
      wsRef.current.close();
      wsRef.current = null;
    }
    retryCountRef.current = 0;
    resetWsRetries();
    setIsConnected(false);
  }, [resetWsRetries]);

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
  }, [selectedAccount, connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
  };
}