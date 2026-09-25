import { create } from 'zustand';
import { t } from '@/i18n';
import { LiveData, Metrics } from './types';
import { useLogsStore } from './useLogsStore';

const initialLiveData: LiveData = {
  mt5_connected: false,
  market_open: false,
  current_price: 0,
  profit: 0,
  open_positions: 0,
  pending_orders: 0,
  order_rejected_alarm: false,
  last_error: null,
  algo_trading_error: false,
  startup_error: null,
};

const initialMetrics: Metrics = {
  price: 0,
  profit: 0,
  open_positions: 0,
};

interface BotRuntimeState {
  isRunning: boolean;
  isConnecting: boolean;
  liveData: LiveData;
  metrics: Metrics;
  wsError: string | null;
  wsRetries: number;

  setIsRunning: (running: boolean) => void;
  setIsConnecting: (connecting: boolean) => void;
  updateLiveData: (data: Partial<LiveData>) => void;
  updateMetrics: (data: Partial<Metrics>) => void;
  setWsError: (error: string | null) => void;
  incrementWsRetries: () => void;
  resetWsRetries: () => void;
  resetRuntime: () => void;
}

// Sadece durum DEĞİŞİMLERİNİ Activity akışına yazar (her poll'da tekrar etmez)
function logLiveDataTransitions(prev: LiveData, curr: LiveData) {
  const push = useLogsStore.getState().pushActivity;

  if (!prev.mt5_connected && curr.mt5_connected) {
    push('success', t('bot.activity.connected'));
  } else if (prev.mt5_connected && !curr.mt5_connected) {
    push('warn', t('bot.activity.disconnected'));
  }
  if (curr.bot_running && !curr.mt5_connected && !(prev.bot_running && !prev.mt5_connected)) {
    push('warn', t('bot.activity.processNoMt5'));
  }
  if (curr.startup_error && curr.startup_error !== prev.startup_error) {
    push('error', t('bot.activity.mt5Failed', { message: curr.startup_error }));
  }
  if (curr.algo_trading_error && !prev.algo_trading_error) {
    push('warn', t('bot.activity.algoOff'));
  }
  if (curr.order_rejected_alarm && !prev.order_rejected_alarm) {
    push('error', t('bot.activity.orderRejected', { detail: curr.last_error ? `: ${curr.last_error}` : '.' }));
  } else if (curr.last_error && curr.last_error !== prev.last_error) {
    push('error', t('bot.activity.botError', { message: curr.last_error }));
  }
}

export const useBotRuntimeStore = create<BotRuntimeState>((set, get) => ({
  isRunning: false,
  isConnecting: false,
  liveData: { ...initialLiveData },
  metrics: { ...initialMetrics },
  wsError: null,
  wsRetries: 0,

  setIsRunning: (running) => set({ isRunning: running }),

  setIsConnecting: (connecting) => set({ isConnecting: connecting }),

  updateLiveData: (data) => {
    const state = get();
    const next = { ...data };

    if (next.last_error && typeof next.last_error === 'object') {
      const errObj = next.last_error as unknown as {
        message?: string;
        suggestion?: string;
        detail?: string;
      };
      next.last_error =
        errObj.message ||
        errObj.suggestion ||
        errObj.detail ||
        JSON.stringify(errObj);
    }

    let isConnecting = state.isConnecting;
    let resetWs = false;
    if (state.isConnecting && next.startup_error) {
      // Bot süreci bağlanamadan kapandı: beklemeyi bitir, hatayı göster
      isConnecting = false;
    } else if (state.isConnecting && next.mt5_connected === false) {
      delete next.mt5_connected;
    } else if (state.isConnecting && next.mt5_connected === true) {
      isConnecting = false;
      resetWs = true;
    }

    const liveData = { ...state.liveData, ...next };
    set({
      isConnecting,
      liveData,
      ...(resetWs ? { wsError: null, wsRetries: 0 } : {}),
    });
    logLiveDataTransitions(state.liveData, liveData);
  },

  updateMetrics: (data) =>
    set((state) => ({
      metrics: { ...state.metrics, ...data },
    })),

  setWsError: (error) => set({ wsError: error }),

  incrementWsRetries: () =>
    set((state) => ({ wsRetries: state.wsRetries + 1 })),

  resetWsRetries: () => set({ wsRetries: 0 }),

  resetRuntime: () =>
    set({
      isRunning: false,
      isConnecting: false,
      liveData: { ...initialLiveData },
      metrics: { ...initialMetrics },
      wsError: null,
      wsRetries: 0,
    }),
}));