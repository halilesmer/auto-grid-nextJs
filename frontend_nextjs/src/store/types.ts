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
  /** Sahip kullanıcının kimliği; boş/yok = yöneticiye ait (worker: accounts.py). */
  owner?: string | null;
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
  /** Für „Abstand nach Verlust“: $ je Tick bei 1 Lot, Tick-Größe, Kontraktgröße (ältere Worker: fehlt) */
  trade_tick_value?: number;
  trade_tick_size?: number;
  trade_contract_size?: number;
  // Kostenwerte für den Backtest (BKT-04, docs/analyse-regeln.md §6). null = MT5 liefert den Wert
  // nicht; fehlt = älterer Worker oder alter Symbol-Cache (max. 1 h).
  /** MT5 SYMBOL_CALC_MODE_* (0 Forex, 2 CFD, 3 CFD-Index, 4 CFD mit Hebel, 5 Forex ohne Hebel) */
  trade_calc_mode?: number | null;
  /** Wert eines Ticks bei 1 Lot in Kontowährung, für Gewinn bzw. Verlust */
  trade_tick_value_profit?: number | null;
  trade_tick_value_loss?: number | null;
  /** MT5 SYMBOL_SWAP_MODE_* (Einheit von swap_long/swap_short) */
  swap_mode?: number | null;
  swap_long?: number | null;
  swap_short?: number | null;
  /** Wochentag des dreifachen Swaps (0 = Sonntag … 6 = Samstag) */
  swap_rollover3days?: number | null;
  /** Aktueller Spread in Punkten */
  spread?: number | null;
  /** Mindestabstand von TP/SL/Pending zum Kurs in Punkten */
  trade_stops_level?: number | null;
}

export interface ZoneSettings {
  id: string;
  /** Feste Magic-Nummer der Zone (ENG-27): vergibt nur der Worker beim Speichern, nur lesen */
  magic?: number;
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
  /** „Abstand nach Verlust ($)“: grid_step/sell_grid_step/pullback_* sind $-Beträge statt Preisabstände */
  step_by_loss?: boolean;
  /** Ohne offene Position je Seite sofort eine Markt-Position eröffnen (Worker: instant_entry.py) */
  instant_entry?: boolean;
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
  /** „grid“ (gleitendes Raster) oder „fractal“ (Orders nur auf Fraktal-Niveaus, Worker: fractal_entry.py) */
  entry_mode?: EntryMode;
  fractal_timeframe?: string;
  fractal_order_mode?: FractalOrderMode;
  fractal_use_sl?: boolean;
  fractal_sl_mode?: FractalSlMode;
  /** Preisabstand jenseits von Fraktal-Kerze / Gegenfraktal (auch Rückfall-SL) */
  fractal_sl_buffer?: number;
  fractal_atr_period?: number;
  fractal_atr_multiplier?: number;
  fractal_sar_step?: number;
  fractal_sar_max?: number;
  /** TP = SL-Abstand × Faktor; 0 = kein TP */
  fractal_rr?: number;
  /** Pending-Orders auf den letzten N Fraktalen je Richtung (1–20); Sell-Wert nur bei BOTH ohne „Buy/Sell gleich“ */
  fractal_order_count?: number;
  sell_fractal_order_count?: number;
  /** true: TP als Geldbetrag (Kontowährung) statt SL × Faktor */
  fractal_tp_by_money?: boolean;
  fractal_tp_money?: number;
  /** Weitere Fraktal-Setups (Setup 1 = die Felder oben); sid vergibt der Worker beim Speichern (ENG-28) */
  fractal_setups?: FractalSetup[];
  /** Höchste je vergebene Setup-Nummer der Zone (vom Worker verwaltet, nur lesend) */
  fractal_setup_seq?: number;
  /** Entfernte Setups, deren Pending Orders in MT5 bleiben sollen (der Bot löscht sie nicht) */
  fractal_kept_sids?: number[];
}

/** Ein zusätzliches Fraktal-Setup: gleiche Feldnamen wie die Zone, gemeinsam bleiben Ordermodus, SL und TP-Art. */
export interface FractalSetup {
  /** 2–99, fehlt bei einem noch nicht gespeicherten Setup */
  sid?: number;
  /** Stabile Client-ID: der Worker findet darüber die Nummer, auch wenn die Oberfläche sie noch nicht kennt */
  id?: string;
  fractal_timeframe: string;
  lot_size: number;
  sell_lot_size: number;
  fractal_order_count: number;
  sell_fractal_order_count: number;
  fractal_rr: number;
  fractal_tp_money: number;
  max_positions: number;
}

export type EntryMode = 'grid' | 'fractal';
export type FractalOrderMode = 'breakout' | 'rebound';
export type FractalSlMode = 'atr' | 'sar' | 'opposite_fractal' | 'buffer';

export interface GlobalSettings {
  ORDER_TYPE: string;
  SYMBOL: string;
  LOOP_INTERVAL_SECONDS: number;
  ZONES: ZoneSettings[];
  /** Höchste je vergebene Zonen-Magic (ENG-27, vom Worker verwaltet) */
  ZONE_MAGIC_MAX?: number;
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
  /** Akışın ait olduğu hesap; seçili hesaptan farklıysa yok sayılır. Eski worker'larda yok */
  account_id?: string;
  /** Sembolün piyasası açık mı (akış); kapalıyken grafik canlı mum üretmez */
  market_open?: boolean;
}

/** Offene Robot-Position aus den Live-Metriken (grid_metrics.py, ANA-06); type 0 = BUY, 1 = SELL */
export interface LivePosition {
  ticket: number;
  symbol: string;
  magic: number;
  type: number;
  volume: number | null;
  price_open: number | null;
  sl: number;
  tp: number;
  profit: number | null;
  /** Eröffnung in MT5-Zeit (Sekunden bzw. Millisekunden) */
  time: number | null;
  time_msc?: number | null;
}

/** Pending-Order des Robots; type wie MT5 ORDER_TYPE_* (2 = BUY LIMIT, 3 = SELL LIMIT, 4 = BUY STOP, 5 = SELL STOP …) */
export interface LiveOrder {
  ticket: number;
  symbol: string;
  magic: number;
  type: number;
  volume: number | null;
  price_open: number | null;
  sl: number;
  tp: number;
  time: number | null;
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
  // Robot pozisyonları ve emirleri (en fazla 500); eski worker'larda veya MT5 bağlı değilken yok
  positions?: LivePosition[];
  orders?: LiveOrder[];
}

export interface UpdateInfo {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
}