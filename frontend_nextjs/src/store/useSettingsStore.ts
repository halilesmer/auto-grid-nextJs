import { distanceUnitOf, migrateFractalDistance } from '@/lib/symbolDistance';
import { create } from 'zustand';
import { t } from '@/i18n';
import { apiUrl, getWorkerHeaders } from '@/lib/api';
import { engineOrderAfterSave, settingsToWorker } from '@/lib/symbolSetups';
import { normalizeZoneLots } from '@/utils/zoneHelpers';
import { GlobalSettings, ZoneSettings, SymbolDetail } from './types';

interface SettingsState {
  settings: GlobalSettings | null;
  /** Konto, für das `settings` geladen wurde (useAccountSettings); null = keins/unklar. */
  loadedAccount: string | null;
  /**
   * Zonen-ids von `loadedAccount` in Engine-Reihenfolge (Stand der letzten Ladung oder Speicherung).
   * `zone_states`, `zone_market_*` und ui-state-Befehle zählen nach diesem Platz, nicht nach `ZONES`.
   */
  engineOrder: string[];
  availableSymbols: string[];
  symbolDetails: Record<string, SymbolDetail>;
  isLoadingSymbols: boolean;
  /** Worker sembolleri MT5'ten alamadıysa hata metni (liste boş) */
  symbolsError: string | null;

  setSettings: (settings: GlobalSettings | null) => void;
  /** Vom Worker geladene Einstellungen eines Kontos (setzt auch loadedAccount). */
  setLoadedSettings: (accountId: string, settings: GlobalSettings) => void;
  /** Nach erfolgreichem Speichern: Engine-Reihenfolge aus den gesendeten Zonen (nur für `loadedAccount`). */
  applySavedOrder: (accountId: string, zones: ZoneSettings[]) => void;
  setGlobalSettings: (globals: Partial<Pick<GlobalSettings, 'ORDER_TYPE' | 'SYMBOL' | 'LOOP_INTERVAL_SECONDS'>>) => void;
  setZones: (zones: ZoneSettings[] | ((prev: ZoneSettings[]) => ZoneSettings[])) => void;
  /** Speichert alle Einstellungen; liefert den tatsächlich gesendeten Stand (Lots ggf. auf das Symbol-Minimum angehoben). */
  mergeAndSaveSettings: (selectedAccount: string) => Promise<GlobalSettings | null>;
  getSymbolDetail: (symbol: string) => SymbolDetail | undefined;
  setAvailableSymbols: (symbols: string[]) => void;
  setSymbolDetails: (details: Record<string, SymbolDetail>) => void;
  setLoadingSymbols: (loading: boolean) => void;
  setSymbolsError: (error: string | null) => void;
  resetSettings: () => void;
}

const initialState = {
  settings: null,
  loadedAccount: null,
  engineOrder: [],
  availableSymbols: [],
  symbolDetails: {},
  isLoadingSymbols: false,
  symbolsError: null,
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
      set({ settings: null, loadedAccount: null, engineOrder: [] });
      return;
    }
    set({ settings: sanitizeNumbers(settings) as GlobalSettings });
  },

  setLoadedSettings: (accountId, settings) => {
    get().setSettings(settings);
    // GET liefert die Zonen sortiert nach Engine-Platz (settingsFromWorker)
    set({ loadedAccount: accountId, engineOrder: (settings.ZONES ?? []).map((z) => z.id) });
  },

  applySavedOrder: (accountId, zones) => {
    if (get().loadedAccount !== accountId) return;
    set({ engineOrder: engineOrderAfterSave(zones) });
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

  mergeAndSaveSettings: async (selectedAccount: string) => {
    const { settings: current, symbolDetails } = get();
    if (!selectedAccount || !current) return null;

    // Nie einen Lot ≤ 0 oder unter dem Symbol-Minimum speichern (auch UI-Stand angleichen)
    const zones = current.ZONES?.map((z) => migrateFractalDistance(normalizeZoneLots(z, symbolDetails), distanceUnitOf(symbolDetails[z.symbol.toUpperCase()]).size));
    const fixed = !!zones && zones.some((z, i) => z !== current.ZONES[i]);
    const settings = fixed ? { ...current, ZONES: zones } : current;
    if (fixed) set({ settings });

    const res = await fetch(apiUrl(`/settings/${selectedAccount}`), {
      method: 'POST',
      headers: {
        ...getWorkerHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: settingsToWorker(settings) }),
    });
    if (!res.ok) throw new Error(t('settings.saveFailed'));
    if (settings.ZONES) get().applySavedOrder(selectedAccount, settings.ZONES);
    return settings;
  },

  getSymbolDetail: (symbol) => {
    const details = get().symbolDetails;
    return details[symbol.toUpperCase()];
  },

  setAvailableSymbols: (symbols) => set({ availableSymbols: symbols }),

  setSymbolDetails: (details) => set({ symbolDetails: details }),

  setLoadingSymbols: (loading) => set({ isLoadingSymbols: loading }),

  setSymbolsError: (error) => set({ symbolsError: error }),

  resetSettings: () => set(initialState),
}));