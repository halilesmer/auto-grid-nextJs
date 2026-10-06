/**
 * Lot-Regeln und zentraler Order-Versand.
 * Quelle: worker_python/src/utils/trade_utils.py (snap_volume, normalize_volume, enforce_stops_level,
 * safe_send_order). Das Warten auf den Broker (time.sleep) entfällt in der Simulation.
 */
import { pyFormatFixed, pyRound } from './pyRound';
import type { EngineState } from './state';
import {
  BUY_ORDER_TYPES,
  POSITION_TYPE_BUY,
  POSITION_TYPE_SELL,
  SELL_ORDER_TYPES,
  TRADE_ACTION_DEAL,
  TRADE_ACTION_PENDING,
  TRADE_ACTION_SLTP,
  TRADE_RETCODE_ALGO_DISABLED,
  TRADE_RETCODE_DONE,
  type Broker,
  type SymbolInfo,
  type TradeRequest,
} from './types';

/** _info_value: 0 oder fehlend zählt als nicht gesetzt */
function infoValue(value: number | undefined, fallback: number): number {
  return value ? value : fallback;
}

/** _decimals: Nachkommastellen von f"{x:.10f}" ohne Endnullen */
function decimals(x: number): number {
  const text = pyFormatFixed(x, 10).replace(/0+$/, '');
  const dot = text.indexOf('.');
  return dot >= 0 ? text.length - dot - 1 : 0;
}

export function snapVolume(raw: number, info: SymbolInfo): number {
  let volume = Number.isFinite(raw) ? raw : 0;
  const volMin = infoValue(info.volume_min, 0.01);
  const volMax = Math.max(infoValue(info.volume_max, Infinity), volMin);
  const volStep = infoValue(info.volume_step, 0);

  volume = Math.max(volMin, Math.min(volume, volMax));
  if (volStep <= 0) return pyRound(volume, Math.max(2, decimals(volMin)));
  let steps = pyRound((volume - volMin) / volStep + 1e-9);
  while (steps > 0 && volMin + steps * volStep > volMax + 1e-9) steps -= 1;
  return pyRound(volMin + steps * volStep, Math.max(decimals(volStep), decimals(volMin)));
}

/** trade_utils.normalize_volume(mt5, symbol, volume) */
function brokerNormalizeVolume(broker: Broker, symbol: string, volume: number): number {
  const info = broker.symbolInfo(symbol);
  return info ? snapVolume(volume, info) : volume;
}

/** Zieht TP/SL auf den Mindestabstand des Brokers (trade_stops_level), damit MT5 nicht 10016 meldet */
export function enforceStopsLevel(broker: Broker, request: TradeRequest): TradeRequest {
  const symbol = request.symbol;
  if (!symbol) return request;
  const info = broker.symbolInfo(symbol);
  if (!info) return request;
  const digits = info.digits;
  const minDist = (info.trade_stops_level || 0) * info.point;
  if (minDist <= 0) return request;

  const tp = request.tp ?? 0;
  const sl = request.sl ?? 0;
  if (request.action === TRADE_ACTION_SLTP) {
    const pos = request.position ? broker.positionsGet(request.position)?.[0] : undefined;
    const tick = pos ? broker.symbolInfoTick(symbol) : null;
    if (pos && tick) {
      if (pos.type === POSITION_TYPE_BUY) {
        if (tp > 0 && tp < tick.bid + minDist) request.tp = pyRound(tick.bid + minDist, digits);
        if (sl > 0 && sl > tick.bid - minDist) request.sl = pyRound(tick.bid - minDist, digits);
      } else if (pos.type === POSITION_TYPE_SELL) {
        if (tp > 0 && tp > tick.ask - minDist) request.tp = pyRound(tick.ask - minDist, digits);
        if (sl > 0 && sl < tick.ask + minDist) request.sl = pyRound(tick.ask + minDist, digits);
      }
    }
  } else if (request.action === TRADE_ACTION_PENDING) {
    const price = request.price ?? 0;
    const type = request.type ?? -1;
    if (BUY_ORDER_TYPES.includes(type)) {
      if (tp > 0 && tp < price + minDist) request.tp = pyRound(price + minDist, digits);
      if (sl > 0 && sl > price - minDist) request.sl = pyRound(price - minDist, digits);
    } else if (SELL_ORDER_TYPES.includes(type)) {
      if (tp > 0 && tp > price - minDist) request.tp = pyRound(price - minDist, digits);
      if (sl > 0 && sl < price + minDist) request.sl = pyRound(price + minDist, digits);
    }
  }
  return request;
}

/** Zentraler Versand: Lot normieren, Stops prüfen, order_check, order_send, stille Ablehnung erkennen */
export function safeSendOrder(broker: Broker, request: TradeRequest, state: EngineState): boolean {
  if (request.volume !== undefined && request.symbol !== undefined) {
    request.volume = brokerNormalizeVolume(broker, request.symbol, request.volume);
  }
  const req = enforceStopsLevel(broker, request);

  if (req.action === TRADE_ACTION_PENDING || req.action === TRADE_ACTION_DEAL) {
    const check = broker.orderCheck(req);
    if (!check || check.retcode !== 0) {
      const retcode = check ? check.retcode : -1;
      if (retcode === TRADE_RETCODE_ALGO_DISABLED) {
        state.algoTradingDisabled = true;
        state.lastErrorMessage = 'algoTradingDisabled';
      }
      state.log('ERROR', 'order.checkFailed', { retcode, price: req.price, tp: req.tp, sl: req.sl });
      return false;
    }
  }

  const result = broker.orderSend(req);
  if (!result) {
    state.lastErrorMessage = `noResponse: ${broker.lastError()}`;
    state.log('ERROR', 'order.noResponse', { error: broker.lastError() });
    return false;
  }
  if (result.retcode !== TRADE_RETCODE_DONE) {
    if (result.retcode === TRADE_RETCODE_ALGO_DISABLED) {
      state.algoTradingDisabled = true;
      state.lastErrorMessage = 'algoTradingDisabled';
    } else {
      state.lastErrorMessage = `${result.retcode} - ${result.comment}`;
    }
    state.log('ERROR', 'order.rejected', { retcode: result.retcode, comment: result.comment, price: req.price });
    return false;
  }

  // Stille Ablehnung: der Broker meldet OK, die Order steht aber nicht im Buch
  if (req.action === TRADE_ACTION_PENDING && result.order) {
    const onBook = broker.ordersGet(result.order);
    if (!onBook || onBook.length === 0) {
      state.lastErrorMessage = 'silentReject';
      state.log('ERROR', 'order.silentReject', { ticket: result.order });
      return false;
    }
    state.lastOrderTicket = result.order;
  }

  state.algoTradingDisabled = false;
  state.lastErrorMessage = '';
  return true;
}
