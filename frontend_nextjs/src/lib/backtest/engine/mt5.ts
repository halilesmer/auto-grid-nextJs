/**
 * Die Teile der MetaTrader5-API, die die Grid-Engine benutzt (Konstanten mit den Werten des echten
 * Pakets, Datentypen, Broker-Schnittstelle). Quelle: worker_python/tests/fakes/fake_mt5.py.
 * Der Nachbau (engine/) spricht nur mit `BrokerApi`; im Backtest ist das broker/simBroker.ts.
 */

export const MT5 = {
  POSITION_TYPE_BUY: 0,
  POSITION_TYPE_SELL: 1,
  ORDER_TYPE_BUY: 0,
  ORDER_TYPE_SELL: 1,
  ORDER_TYPE_BUY_LIMIT: 2,
  ORDER_TYPE_SELL_LIMIT: 3,
  ORDER_TYPE_BUY_STOP: 4,
  ORDER_TYPE_SELL_STOP: 5,
  TRADE_ACTION_DEAL: 1,
  TRADE_ACTION_PENDING: 5,
  TRADE_ACTION_SLTP: 6,
  TRADE_ACTION_MODIFY: 7,
  TRADE_ACTION_REMOVE: 8,
  ORDER_TIME_GTC: 0,
  ORDER_STATE_PLACED: 1,
  ORDER_STATE_CANCELED: 2,
  ORDER_STATE_FILLED: 4,
  ORDER_FILLING_FOK: 0,
  ORDER_FILLING_IOC: 1,
  ORDER_FILLING_RETURN: 2,
  TRADE_RETCODE_DONE: 10009,
  TIMEFRAME_M1: 1,
  TIMEFRAME_M5: 5,
  TIMEFRAME_M15: 15,
  TIMEFRAME_M30: 30,
  TIMEFRAME_H1: 16385,
  TIMEFRAME_H4: 16388,
  TIMEFRAME_D1: 16408,
} as const;

export const BUY_ORDER_TYPES: readonly number[] = [MT5.ORDER_TYPE_BUY_LIMIT, MT5.ORDER_TYPE_BUY_STOP];
export const SELL_ORDER_TYPES: readonly number[] = [MT5.ORDER_TYPE_SELL_LIMIT, MT5.ORDER_TYPE_SELL_STOP];

export interface SymbolInfo {
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
  filling_mode: number;
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
  symbol: string;
  type: number;
  price_open: number;
  volume: number;
  tp: number;
  sl: number;
  magic: number;
  comment: string;
  /** Positions-ID = Ticket der eröffnenden Order */
  identifier: number;
  time_msc?: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume?: number;
  spread?: number;
}

/** order_send-Request (Felder wie im Python-Dict; fehlende Felder bleiben undefined) */
export interface TradeRequest {
  action: number;
  symbol?: string;
  volume?: number;
  type?: number;
  price?: number;
  tp?: number;
  sl?: number;
  order?: number;
  position?: number;
  magic?: number;
  comment?: string;
  deviation?: number;
  type_time?: number;
  type_filling?: number;
}

export interface TradeResult {
  retcode: number;
  order: number;
  comment: string;
}

/** Was die Engine vom Broker braucht (MetaTrader5-Paket bzw. FakeMT5) */
export interface BrokerApi {
  symbolInfo(symbol: string): SymbolInfo | null;
  symbolInfoTick(symbol: string): Tick | null;
  ordersGet(ticket?: number): Order[] | null;
  positionsGet(ticket?: number): Position[] | null;
  historyOrdersGet(ticket: number): Order[];
  copyRatesFromPos(symbol: string, timeframe: number, startPos: number, count: number): Bar[] | null;
  orderCheck(request: TradeRequest): { retcode: number } | null;
  orderSend(request: TradeRequest): TradeResult | null;
  lastError(): [number, string];
}
