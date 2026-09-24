/** Testdaten des gemockten Workers. Jeder Test bekommt eine frische Kopie (defaultState()). */
import type { Account, LiveData, SymbolDetail, ZoneSettings } from '../../src/store/types';

export const DEMO_ID = '1001';
export const LIVE_ID = '2002';
export const MT5_PATH = 'C:/Program Files/MetaTrader 5/terminal64.exe';
export const ZONE_ID = 'zone-e2e-1';

/** Konto so, wie es der Worker speichert (mit Passwort); nach außen geht es ohne. */
export type StoredAccount = Account & { password?: string };

export function makeZone(overrides: Partial<ZoneSettings> = {}): ZoneSettings {
  return {
    id: ZONE_ID,
    is_active: true,
    symbol: 'USOUSD',
    order_type: 'BUY',
    min_price: 90,
    max_price: 110,
    grid_step: 0.5,
    lot_size: 0.01,
    take_profit: 0.5,
    stop_loss: 0,
    sell_grid_step: 0.5,
    sell_lot_size: 0.01,
    sell_take_profit: 0.5,
    sell_stop_loss: 0,
    is_breakout: false,
    pullback_distance: 0.5,
    sell_pullback_distance: 0.5,
    sync_buy_sell: true,
    levels_below: 3,
    levels_above: 3,
    max_positions: 5,
    clear_on_exit: false,
    clear_exit_side: 'Farketmez',
    clear_scope: 'Sadece Bekleyen Emirler',
    clear_target_side: 'Farketmez (Hepsi)',
    exit_condition: 'Anlık Fiyat',
    exit_timeframe: 'M15',
    ...overrides,
  };
}

function symbol(name: string, digits: number, description: string, volumeMin = 0.01): SymbolDetail {
  return {
    name,
    digits,
    point: Number((10 ** -digits).toFixed(digits)),
    volume_min: volumeMin,
    volume_max: 100,
    volume_step: volumeMin,
    trade_mode: 4,
    currency_base: name.slice(0, 3),
    currency_profit: 'USD',
    currency_margin: 'USD',
    description,
  };
}

/** Kennzahlen, die GET /logs/{id} unter `metrics` liefert, solange der Bot läuft. */
export const RUNNING_METRICS: Partial<LiveData> = {
  mt5_connected: true,
  market_open: true,
  current_price: 97.25,
  profit: -12.5,
  open_positions: 3,
  pending_orders: 4,
  order_rejected_alarm: false,
  last_error: null,
  algo_trading_error: false,
  startup_error: null,
  zone_states: { '0': 'START' },
  remote_paused: false,
};

export function defaultState() {
  return {
    accounts: [
      {
        id: DEMO_ID,
        account_name: 'E2E Demo',
        env_type: 'DEMO',
        login: Number(DEMO_ID),
        server: 'Broker-Demo',
        mt5_path: MT5_PATH,
        notes: '',
        password: 'pw-' + 'demo',
      },
      {
        id: LIVE_ID,
        account_name: 'E2E Live',
        env_type: 'LIVE',
        login: Number(LIVE_ID),
        server: 'Broker-Live',
        mt5_path: MT5_PATH,
        notes: '',
        password: 'pw-' + 'live',
      },
    ] as StoredAccount[],
    settings: {
      [DEMO_ID]: { LOOP_INTERVAL_SECONDS: 2, ZONES: [makeZone()] },
      [LIVE_ID]: { LOOP_INTERVAL_SECONDS: 1, ZONES: [] },
    } as Record<string, Record<string, unknown>>,
    uiState: {} as Record<string, Record<string, string>>,
    robotLog: {
      [DEMO_ID]: [
        '[2026-09-24 08:00:00] [INFO] [START] Bot gestartet',
        '[2026-09-24 08:00:01] [INFO] Bölge 1 USOUSD: 3 emir yerleştirildi',
      ],
    } as Record<string, string[]>,
    mt5Log: {
      [DEMO_ID]: ['NQ\t0\t08:00:01.123\tTrades\t\'1001\': buy limit 0.01 USOUSD at 96.750'],
    } as Record<string, string[]>,
    metrics: { [DEMO_ID]: { ...RUNNING_METRICS } } as Record<string, Partial<LiveData>>,
    botRunning: {} as Record<string, boolean>,
    symbols: [
      symbol('USOUSD', 3, 'US Crude Oil'),
      symbol('XAUUSD', 2, 'Gold vs US Dollar'),
      symbol('EURUSD', 5, 'Euro vs US Dollar', 0.1),
    ],
    mt5Paths: [MT5_PATH, 'C:/Program Files/MT5_EC_Demo/terminal64.exe'],
    platform: 'win32',
    update: { has_update: false, local_ver: 'v0.7.62', remote_ver: 'v0.7.62' },
  };
}

export type MockState = ReturnType<typeof defaultState>;
