/** Testdaten des gemockten Workers. Jeder Test bekommt eine frische Kopie (defaultState()). */
import type { Account, LiveData, SymbolDetail, ZoneSettings } from '../../src/store/types';
import type { Deal, ZoneRegistryEntry } from '../../src/lib/analysis/tradePairing';

export const DEMO_ID = '1001';
export const LIVE_ID = '2002';
export const MT5_PATH = 'C:/Program Files/MetaTrader 5/terminal64.exe';
export const ZONE_ID = 'zone-e2e-1';

/** Konto so, wie es der Worker speichert (mit Passwort); nach außen geht es ohne. */
export type StoredAccount = Account & { password?: string };

/** Benutzer wie in configs/users.json; im Mock steht der Schlüssel im Klartext (der Worker speichert nur den Hash). */
export interface MockUser {
  id: string;
  name: string;
  key: string;
  created_at: string;
}

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

/** Wie symbol_setups.group_zones (ZON-19): Setups unter ihrem Symbol, Symbole in der Reihenfolge des ersten Auftretens. */
export function groupZones<Z extends { symbol?: unknown }>(zones: Z[]): { symbol: string; setups: Omit<Z, 'symbol'>[] }[] {
  const groups = new Map<string, { symbol: string; setups: Omit<Z, 'symbol'>[] }>();
  for (const { symbol, ...setup } of zones) {
    const key = String(symbol ?? '');
    const group = groups.get(key) ?? { symbol: key, setups: [] };
    group.setups.push(setup);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function symbol(name: string, digits: number, description: string, volumeMin = 0.01, contract = 1000): SymbolDetail {
  const point = Number((10 ** -digits).toFixed(digits));
  return {
    name,
    digits,
    point,
    // wie MT5: $ je Tick bei 1 Lot (Kontowährung USD) → „Abstand nach Verlust“-Vorschau
    trade_tick_size: point,
    trade_tick_value: Number((point * contract).toFixed(8)),
    trade_contract_size: contract,
    volume_min: volumeMin,
    volume_max: 100,
    volume_step: volumeMin,
    trade_mode: 4,
    currency_base: name.slice(0, 3),
    currency_profit: 'USD',
    currency_margin: 'USD',
    description,
    // Kostenfelder wie mt5_helpers.SYMBOL_COST_FIELDS (BKT-04)
    trade_calc_mode: 2,
    trade_tick_value_profit: Number((point * contract).toFixed(8)),
    trade_tick_value_loss: Number((point * contract).toFixed(8)),
    swap_mode: 1,
    swap_long: -5.2,
    swap_short: 1.3,
    swap_rollover3days: 3,
    spread: 20,
    trade_stops_level: 0,
  };
}

/** Kennzahlen, die GET /logs/{id} unter `metrics` liefert, solange der Bot läuft. */
export const RUNNING_METRICS: Partial<LiveData> = {
  mt5_connected: true,
  market_open: true,
  current_price: 97.25,
  symbol_prices: { USOUSD: 97.25 },
  profit: -12.5,
  open_positions: 3,
  pending_orders: 4,
  order_rejected_alarm: false,
  last_error: null,
  algo_trading_error: false,
  startup_error: null,
  zone_states: { '0': 'START' },
  zone_market_open: { '0': true },
  zone_market_hours: { '0': '02:00-00:00' },
  remote_paused: false,
};

/** Eintrag der Mock-CSV-Importe (Form wie csv_import._public, plus `account_id`/`text`). */
export interface CsvImportRow {
  import_id: string;
  account_id: string;
  symbol: string;
  timeframe: string;
  filename: string;
  status: 'staging' | 'committed';
  size_bytes: number;
  received_bytes: number;
  next_chunk: number;
  bars: number | null;
  first_t: number | null;
  last_t: number | null;
  gaps: number | null;
  offset_sec: number;
  created_at: number;
  committed_at: number | null;
  text: string;
}

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
      [DEMO_ID]: { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone()]) },
      [LIVE_ID]: { LOOP_INTERVAL_SECONDS: 1, SYMBOLS: [] },
    } as Record<string, Record<string, unknown>>,
    uiState: {} as Record<string, Record<string, string>>,
    robotLog: {
      [DEMO_ID]: [
        '[2026-09-24 08:00:00] [INFO] [START] Bot gestartet',
        '[2026-09-24 08:00:01] [INFO] [Z:zone-e2e-1] Bölge 1 USOUSD: 3 emir yerleştirildi',
        '[2026-09-24 08:00:02] [WARN] [Z:zone-fremd] Bölge 2 XAUUSD: fremde Zone',
      ],
    } as Record<string, string[]>,
    mt5Log: {
      [DEMO_ID]: ['NQ\t0\t08:00:01.123\tTrades\t\'1001\': buy limit 0.01 USOUSD at 96.750'],
    } as Record<string, string[]>,
    metrics: { [DEMO_ID]: { ...RUNNING_METRICS } } as Record<string, Partial<LiveData>>,
    botRunning: {} as Record<string, boolean>,
    /** Fehlertext von GET /symbols (MT5 nicht erreichbar); null = Symbole werden geliefert */
    symbolsError: null as string | null,
    symbols: [
      symbol('USOUSD', 3, 'US Crude Oil'),
      symbol('XAUUSD', 2, 'Gold vs US Dollar', 0.01, 100),
      symbol('EURUSD', 5, 'Euro vs US Dollar', 0.1, 100000),
    ],
    mt5Paths: [MT5_PATH, 'C:/Program Files/MT5_EC_Demo/terminal64.exe'],
    platform: 'win32',
    update: { has_update: false, local_ver: 'v0.7.62', remote_ver: 'v0.7.62' },
    /** Brokeruhr je Konto (GET /market/{id}/clock): Abstand zu UTC in Sekunden; reliable=false = Markt zu. */
    brokerOffset: 3 * 3600,
    brokerClockReliable: true,
    /** Fehlende Kerzen-Bereiche (GET /market/{id}/rates → missing), MT5-Zeit; dort liefert der Mock keine Kerzen. */
    ratesMissing: [] as { from: number; to: number; reason: string; checked_at: number | null }[],
    /** Antwort von /rates erzwingt einen Fehler (z. B. 503 Datenbank nicht bereit); null = normal */
    ratesError: null as { status: number; detail: string } | null,
    /** CSV-Importe je Konto (GET/POST /market/{id}/imports, B9); `text` = bisher hochgeladene Teile */
    csvImports: [] as CsvImportRow[],
    /** Deal-Archiv je Konto (GET /history/{id}/deals), MT5-Zeit; Einstiege vor `from` kommen wie im Worker mit. */
    deals: {} as Record<string, Deal[]>,
    /** Zonen-Register je Konto (created_at = echte Unix-Sekunden) */
    zoneRegistry: {} as Record<string, ZoneRegistryEntry[]>,
    /** Margin-Modus des Kontos im Deal-Archiv (account.margin_mode): 0 Netting, 1 Exchange, 2 Hedging; null = unbekannt */
    marginMode: 2 as number | null,
    /** Fehlende Teile des Deal-Archivs (busy/error) */
    dealsMissing: [] as { from: number; to: number; reason: string }[],
    /** Benutzer mit persönlichem Schlüssel; leer = Einzelbetrieb wie bisher (nur der Admin-Schlüssel). */
    users: [] as MockUser[],
  };
}

export type MockState = ReturnType<typeof defaultState>;
