import { create } from 'zustand';
import { LiveData, Metrics } from './types';

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

    if (state.isConnecting && next.startup_error) {
      // Bot süreci bağlanamadan kapandı: beklemeyi bitir, hatayı göster
      set({
        isConnecting: false,
        liveData: { ...state.liveData, ...next },
      });
      return;
    } else if (state.isConnecting && next.mt5_connected === false) {
      delete next.mt5_connected;
    } else if (state.isConnecting && next.mt5_connected === true) {
      set({
        isConnecting: false,
        wsError: null,
        wsRetries: 0,
        liveData: { ...state.liveData, ...next },
      });
      return;
    }

    set({
      liveData: { ...state.liveData, ...next },
    });
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