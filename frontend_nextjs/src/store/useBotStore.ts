import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  account_name: string;
  env_type: string;
  login: number;
  password: string;
  server: string;
  mt5_path: string;
  notes: string;
}

export interface SymbolDetail {
  name: string;
  digits: number;
  point: number;
  volume_min: number;
  volume_max: number;
  volume_step: number;
  trade_mode: number;
  currency_base: string;
  currency_profit: string;
  currency_margin: string;
  description?: string;
}

export interface ZoneSettings {
  id: string;
  is_active?: boolean;
  symbol: string;
  order_type: string;
  min_price: number;
  max_price: number;
  grid_step: number;
  lot_size: number;
  take_profit: number;
  stop_loss: number;
  sell_grid_step: number;
  sell_lot_size: number;
  sell_take_profit: number;
  sell_stop_loss: number;
  is_breakout: boolean;
  pullback_distance: number;
  sell_pullback_distance: number;
  sync_buy_sell: boolean;
  levels_below: number;
  levels_above: number;
  max_positions: number;
  clear_on_exit: boolean;
  clear_exit_side: string;
  clear_scope: string;
  clear_target_side: string;
  exit_condition: string;
  exit_timeframe: string;
}

export interface GlobalSettings {
  ORDER_TYPE: string;
  SYMBOL: string;
  LOOP_INTERVAL_SECONDS: number;
  ZONES: ZoneSettings[];
}

export interface LogsState {
  robot_log: string[];
  mt5_log: string[];
  metrics: Record<string, unknown> | null;
}

export interface Metrics {
  price: number;
  profit: number;
  open_positions: number;
  rsi?: number;
  macd?: number;
}

export interface LiveData {
  mt5_connected: boolean;
  market_open: boolean;
  current_price: number;
  profit: number;
  open_positions: number;
  pending_orders: number;
  order_rejected_alarm: boolean;
  last_error: string | null;
  algo_trading_error: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
}

export function defaultZone(): ZoneSettings {

  return {
    id: crypto.randomUUID(),
    is_active: false, // Yeni bölgeler varsayılan olarak "Beklet / PAUSE" modunda başlar
    symbol: 'USOUSD',
    order_type: 'BUY',
    min_price: 70.0,
    max_price: 80.0,
    grid_step: 0.05,
    lot_size: 0.01,
    take_profit: 0.05,
    stop_loss: 0.0,
    sell_grid_step: 0.05,
    sell_lot_size: 0.01,
    sell_take_profit: 0.05,
    sell_stop_loss: 0.0,
    is_breakout: false,
    pullback_distance: 0.5,
    sell_pullback_distance: 0.5,
    sync_buy_sell: true,
    levels_below: 5,
    levels_above: 5,
    max_positions: 10,
    clear_on_exit: true,
    clear_exit_side: 'SELL (Aşağı)',
    clear_scope: 'Sadece Bekleyen Emirler',
    clear_target_side: 'Sadece BUY İşlemleri',
    exit_condition: 'Anlık Fiyat',
    exit_timeframe: 'M15',
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface BotState {
  accounts: Account[];
  selectedAccount: string | null;
  activeAccount: Account | null;
  settings: GlobalSettings | null;
  logs: LogsState;
  metrics: Metrics;
  isRunning: boolean;
  isConnecting: boolean;
  liveData: LiveData;
  isWindows: boolean;
  simulatedPrice: number;
  updateInfo: UpdateInfo | null;
  availableSymbols: string[];
  symbolDetails: Record<string, SymbolDetail>;

  setAccounts: (accounts: Account[]) => void;
  setSelectedAccount: (accountId: string) => void;
  setActiveAccount: (account: Account | null) => void;
  setSettings: (settings: GlobalSettings | null) => void;
  setGlobalSettings: (globals: Partial<Pick<GlobalSettings, 'ORDER_TYPE' | 'SYMBOL' | 'LOOP_INTERVAL_SECONDS'>>) => void;
  setZones: (zones: ZoneSettings[] | ((prev: ZoneSettings[]) => ZoneSettings[])) => void;
  mergeAndSaveSettings: (apiUrl: string) => Promise<void>;
  setLogs: (logs: Partial<LogsState>) => void;
  appendRobotLog: (line: string) => void;
  appendMt5Log: (line: string) => void;
  clearLogs: () => void;
  updateMetrics: (data: Partial<Metrics>) => void;
  setIsRunning: (running: boolean) => void;
  setIsConnecting: (connecting: boolean) => void;
  updateLiveData: (data: Partial<LiveData>) => void;
  setIsWindows: (v: boolean) => void;
  setSimulatedPrice: (price: number) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setAvailableSymbols: (symbols: string[]) => void;
  setSymbolDetails: (details: Record<string, SymbolDetail>) => void;
  getSymbolDetail: (symbol: string) => SymbolDetail | undefined;
  reset: () => void;
}

const initialLogs: LogsState = {
  robot_log: [],
  mt5_log: [],
  metrics: null,
};

const initialMetrics: Metrics = {
  price: 0,
  profit: 0,
  open_positions: 0,
};

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
};

export const useBotStore = create<BotState>((set, get) => ({
  accounts: [],
  selectedAccount: null,
  activeAccount: null,
  settings: null,
  logs: { ...initialLogs },
  metrics: { ...initialMetrics },
  isRunning: false,
  isConnecting: false,
  liveData: { ...initialLiveData },
  isWindows: true,
  simulatedPrice: 75.0,
  updateInfo: null,
  availableSymbols: [],
  symbolDetails: {},

  setAccounts: (accounts) => set({ accounts }),

  setSelectedAccount: (accountId) => {
    set((state) => ({
      selectedAccount: accountId,
      activeAccount:
        state.accounts.find((a) => String(a.id) === String(accountId)) || null,
    }));
  },

  setActiveAccount: (account) => set({ activeAccount: account }),

  setSettings: (settings) => {
    if (!settings) {
      set({ settings: null });
      return;
    }

    // Diski/API'den gelen floating-point sapmalarını (0.04999) Zustand seviyesinde otomatik temizle
    const sanitizeNumbers = (val: unknown): any => {
      if (typeof val === "number") {
        return Number(val.toFixed(5));
      }
      if (Array.isArray(val)) {
        return val.map(sanitizeNumbers);
      }
      if (val && typeof val === "object") {
        const cleanObj: Record<string, any> = {};
        for (const k of Object.keys(val)) {
          cleanObj[k] = sanitizeNumbers((val as any)[k]);
        }
        return cleanObj;
      }
      return val;
    };

    set({ settings: sanitizeNumbers(settings) });
  },

  setGlobalSettings: (globals) =>
    set((state) => ({
      settings: state.settings
        ? { ...state.settings, ...globals }
        : {
            ORDER_TYPE: globals.ORDER_TYPE ?? "BUY",
            SYMBOL: globals.SYMBOL ?? "USOUSD",
            LOOP_INTERVAL_SECONDS: globals.LOOP_INTERVAL_SECONDS ?? 1.0,
            ZONES: [],
          },
    })),

  setZones: (zonesOrUpdater) =>
    set((state) => {
      const currentZones = state.settings?.ZONES || [];
      const newZones =
        typeof zonesOrUpdater === "function"
          ? zonesOrUpdater(currentZones)
          : zonesOrUpdater;
      return {
        settings: state.settings
          ? { ...state.settings, ZONES: newZones }
          : {
              ORDER_TYPE: "BUY",
              SYMBOL: "USOUSD",
              LOOP_INTERVAL_SECONDS: 1.0,
              ZONES: newZones,
            },
      };
    }),

  mergeAndSaveSettings: async (apiUrl: string) => {
    const { selectedAccount, settings } = get();
    if (!selectedAccount || !settings) return;

    const res = await fetch(`${apiUrl}/settings/${selectedAccount}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ settings }),
    });
    if (!res.ok) throw new Error("Failed to save settings");
  },

  setLogs: (logs) =>
    set((state) => ({
      logs: { ...state.logs, ...logs },
    })),

  appendRobotLog: (line) =>
    set((state) => ({
      logs: {
        ...state.logs,
        robot_log: [...state.logs.robot_log, line],
      },
    })),

  appendMt5Log: (line) =>
    set((state) => ({
      logs: {
        ...state.logs,
        mt5_log: [...state.logs.mt5_log, line],
      },
    })),

  clearLogs: () => set({ logs: { ...initialLogs } }),

  updateMetrics: (data) =>
    set((state) => ({
      metrics: { ...state.metrics, ...data },
    })),

  setIsRunning: (running) => set({ isRunning: running }),

  setIsConnecting: (connecting) => set({ isConnecting: connecting }),

  updateLiveData: (data) =>
    set((state) => {
      const next = { ...data };

      // CONNECTION LOCK: Bağlanma sürecindeyken arka plan log polling'in
      // getirdiği bayat mt5_connected=false değerini yok say. Gerçek bağlantı
      // sinyali (mt5_connected=true) geldiğinde kilidi aç ve isConnecting=false yap.
      if (state.isConnecting && next.mt5_connected === false) {
        delete next.mt5_connected;
      } else if (state.isConnecting && next.mt5_connected === true) {
        return {
          isConnecting: false,
          liveData: { ...state.liveData, ...next },
        };
      }

      return {
        liveData: { ...state.liveData, ...next },
      };
    }),

  setIsWindows: (v) => set({ isWindows: v }),

  setSimulatedPrice: (price) => set({ simulatedPrice: price }),

  setUpdateInfo: (info) => set({ updateInfo: info }),

  setAvailableSymbols: (symbols) => set({ availableSymbols: symbols }),

  setSymbolDetails: (details) => set({ symbolDetails: details }),

  getSymbolDetail: (symbol) => {
    const details = get().symbolDetails;
    return details[symbol.toUpperCase()];
  },

  reset: () =>
    set({
      accounts: [],
      selectedAccount: null,
      activeAccount: null,
      settings: null,
      logs: { ...initialLogs },
      metrics: { ...initialMetrics },
      isRunning: false,
      isConnecting: false,
      liveData: { ...initialLiveData },
      isWindows: true,
      simulatedPrice: 75.0,
      updateInfo: null,
      availableSymbols: [],
      symbolDetails: {},
    }),
}));
