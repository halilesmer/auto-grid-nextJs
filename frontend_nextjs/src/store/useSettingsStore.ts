import { create } from 'zustand';
import { GlobalSettings, ZoneSettings, SymbolDetail } from './types';

interface SettingsState {
  settings: GlobalSettings | null;
  availableSymbols: string[];
  symbolDetails: Record<string, SymbolDetail>;
  isLoadingSymbols: boolean;

  setSettings: (settings: GlobalSettings | null) => void;
  setGlobalSettings: (globals: Partial<Pick<GlobalSettings, 'ORDER_TYPE' | 'SYMBOL' | 'LOOP_INTERVAL_SECONDS'>>) => void;
  setZones: (zones: ZoneSettings[] | ((prev: ZoneSettings[]) => ZoneSettings[])) => void;
  mergeAndSaveSettings: (apiUrl: string, selectedAccount: string) => Promise<void>;
  getSymbolDetail: (symbol: string) => SymbolDetail | undefined;
  setAvailableSymbols: (symbols: string[]) => void;
  setSymbolDetails: (details: Record<string, SymbolDetail>) => void;
  setLoadingSymbols: (loading: boolean) => void;
  resetSettings: () => void;
}

const initialState = {
  settings: null,
  availableSymbols: [],
  symbolDetails: {},
  isLoadingSymbols: false,
};

function sanitizeNumbers(val: unknown): unknown {
  if (typeof val === 'number') {
    return Number(Math.round(val * 1e8) / 1e8);
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeNumbers);
  }
  if (val && typeof val === 'object') {
    const cleanObj: Record<string, unknown> = {};
    for (const k of Object.keys(val)) {
      cleanObj[k] = sanitizeNumbers((val as Record<string, unknown>)[k]);
    }
    return cleanObj;
  }
  return val;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initialState,

  setSettings: (settings) => {
    if (!settings) {
      set({ settings: null });
      return;
    }
    set({ settings: sanitizeNumbers(settings) as GlobalSettings });
  },

  setGlobalSettings: (globals) =>
    set((state) => ({
      settings: state.settings
        ? { ...state.settings, ...globals }
        : {
            ORDER_TYPE: globals.ORDER_TYPE ?? 'BUY',
            SYMBOL: globals.SYMBOL ?? '',
            LOOP_INTERVAL_SECONDS: globals.LOOP_INTERVAL_SECONDS ?? 1.0,
            ZONES: [],
          },
    })),

  setZones: (zonesOrUpdater) =>
    set((state) => {
      const currentZones = state.settings?.ZONES || [];
      const newZones =
        typeof zonesOrUpdater === 'function'
          ? zonesOrUpdater(currentZones)
          : zonesOrUpdater;
      return {
        settings: state.settings
          ? { ...state.settings, ZONES: newZones }
          : {
              ORDER_TYPE: 'BUY',
              SYMBOL: '',
              LOOP_INTERVAL_SECONDS: 1.0,
              ZONES: newZones,
            },
      };
    }),

  mergeAndSaveSettings: async (apiUrl: string, selectedAccount: string) => {
    const { settings } = get();
    if (!selectedAccount || !settings) return;

    const res = await fetch(`${apiUrl}/settings/${selectedAccount}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ settings }),
    });
    if (!res.ok) throw new Error('Failed to save settings');
  },

  getSymbolDetail: (symbol) => {
    const details = get().symbolDetails;
    return details[symbol.toUpperCase()];
  },

  setAvailableSymbols: (symbols) => set({ availableSymbols: symbols }),

  setSymbolDetails: (details) => set({ symbolDetails: details }),

  setLoadingSymbols: (loading) => set({ isLoadingSymbols: loading }),

  resetSettings: () => set(initialState),
}));