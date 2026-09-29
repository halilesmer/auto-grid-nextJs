export interface Account {
  id: string;
  account_name: string;
  env_type: string;
  login: number;
  /** Worker şifreyi asla döndürmez; yalnızca kayıtlı olup olmadığını bildirir. */
  has_password?: boolean;
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

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error';

export interface ActivityEntry {
  ts: number;
  level: ActivityLevel;
  message: string;
}

export interface WorkerStatus {
  reachable: boolean | null; // null = henüz yoklanmadı
  lastUpdate: number | null;
  error: string | null;
}

export interface LogsState {
  robot_log: string[];
  mt5_log: string[];
}

export interface Metrics {
  price: number;
  profit: number;
  open_positions: number;
  rsi?: number;
  macd?: number;
  /** Akışın gösterdiği sembol (hesabın ilk bölgesi); eski worker'larda yok */
  symbol?: string;
}

export interface LiveData {
  mt5_connected: boolean;
  market_open: boolean;
  current_price: number;
  /** Sembol başına anlık fiyat (bölge kartları); eski worker'larda yok */
  symbol_prices?: Record<string, number>;
  profit: number;
  open_positions: number;
  pending_orders: number;
  order_rejected_alarm: boolean;
  last_error: string | null;
  algo_trading_error: boolean;
  // bot_runner MT5'e bağlanamazsa met_<id>.json içine yazar
  startup_error?: string | null;
  // Worker: bot süreci (bot_runner) çalışıyor mu – MT5 bağlantısından bağımsız
  bot_running?: boolean;
  // Motorun bölge durumları, bölge sırasına göre: {"0": "START" | "PAUSE" | "AUTO_CLEAR" | "CLEAR"}
  zone_states?: Record<string, string>;
  // Bölge başına piyasa durumu (sembolün işlem saatine göre): {"0": true, ...}
  zone_market_open?: Record<string, boolean>;
  // Bölge başına olağan işlem saati (mum verisinden tahmin, broker saati): {"0": "02:00-00:00"}
  zone_market_hours?: Record<string, string>;
  // Motor telefondan ($1 sinyali / GRID:STOP) durduruldu
  remote_paused?: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
}