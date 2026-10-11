/**
 * Datentypen und Konstanten der MT5-API, soweit der Bot sie benutzt, und die Schnittstelle zum
 * (simulierten) Broker. Quelle: worker_python/tests/fakes/fake_mt5.py (Werte wie im MetaTrader5-Paket).
 *
 * Zonen sind lose Wörterbücher wie in configs/settings_*.json (Python liest sie mit zone.get(...));
 * gelesen wird über die Helfer in helpers.ts, nicht über feste Felder.
 */

export type ZoneDict = { readonly [key: string]: unknown };

export const POSITION_TYPE_BUY = 0;
export const POSITION_TYPE_SELL = 1;
export const ORDER_TYPE_BUY = 0;
export const ORDER_TYPE_SELL = 1;
export const ORDER_TYPE_BUY_LIMIT = 2;
export const ORDER_TYPE_SELL_LIMIT = 3;
export const ORDER_TYPE_BUY_STOP = 4;
export const ORDER_TYPE_SELL_STOP = 5;
export const BUY_ORDER_TYPES: readonly number[] = [ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_BUY_STOP];
export const SELL_ORDER_TYPES: readonly number[] = [ORDER_TYPE_SELL_LIMIT, ORDER_TYPE_SELL_STOP];

export const TRADE_ACTION_DEAL = 1;
export const TRADE_ACTION_PENDING = 5;
export const TRADE_ACTION_SLTP = 6;
export const TRADE_ACTION_MODIFY = 7;
export const TRADE_ACTION_REMOVE = 8;

export const ORDER_TIME_GTC = 0;
export const ORDER_STATE_PLACED = 1;
export const ORDER_STATE_CANCELED = 2;
export const ORDER_STATE_PARTIAL = 3;
export const ORDER_STATE_FILLED = 4;
export const ORDER_FILLING_IOC = 1;
export const ORDER_FILLING_RETURN = 2;

export const TRADE_RETCODE_DONE = 10009;
export const TRADE_RETCODE_ALGO_DISABLED = 10027;
export const TRADE_RETCODE_INVALID = 10013;

/** Zeitrahmen als Name (MT5-Konstanten braucht der Nachbau nicht) */
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';
export const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export interface SymbolInfo {
  distance_unit?: 'pips' | 'ticks' | null;
  distance_unit_size?: number | null;
  trade_calc_mode?: number | null;
  name: string;
  point: number;
  digits: number;
  volume_min: number;
  volume_max: number;
  volume_step: number;
  trade_stops_level: number;
  trade_contract_size: number;
  trade_tick_size: number;
  trade_tick_value: number;
}

export interface Tick {
  bid: number;
  ask: number;
  time_msc: number;
  time: number;
}

export interface Order {
  ticket: number;
  symbol: string;
  type: number;
  price_open: number;
  volume_initial: number;
  volume_current: number;
  tp: number;
  sl: number;
  magic: number;
  comment: string;
  state: number;
}

export interface Position {
  ticket: number;
  identifier: number;
  symbol: string;
  type: number;
  price_open: number;
  volume: number;
  tp: number;
  sl: number;
  magic: number;
  /** Im Paritätsmodus immer 0 (FakeMT5 rechnet keinen Gewinn) */
  profit: number;
  comment: string;
  /** Im Paritätsmodus nicht gesetzt (FakeMT5 kennt es nicht): die jüngste Position ist dann die mit dem höchsten Ticket */
  time_msc?: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  spread: number;
}

/** Anfrage an order_check/order_send; fehlende Felder wie in Python (request.get(..., 0.0)) */
export interface TradeRequest {
  action: number;
  symbol?: string;
  volume?: number;
  type?: number;
  price?: number;
  deviation?: number;
  magic?: number;
  comment?: string;
  type_time?: number;
  type_filling?: number;
  tp?: number;
  sl?: number;
  order?: number;
  position?: number;
}

export interface TradeResult {
  retcode: number;
  order: number;
  comment: string;
}

/** Die Teile der MT5-API, die der Bot aufruft */
export interface Broker {
  symbolInfo(symbol: string): SymbolInfo | null;
  symbolInfoTick(symbol: string): Tick | null;
  ordersGet(ticket?: number): Order[] | null;
  positionsGet(ticket?: number): Position[] | null;
  historyOrdersGet(ticket: number): Order[];
  orderCheck(request: TradeRequest): TradeResult | null;
  orderSend(request: TradeRequest): TradeResult | null;
  /** Wie MT5: Position 0 = laufende Kerze, Ergebnis alt → neu */
  copyRatesFromPos(symbol: string, timeframe: Timeframe, startPos: number, count: number): Bar[] | null;
  lastError(): string;
}
