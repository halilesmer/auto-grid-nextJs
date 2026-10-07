/**
 * Einziger Weg des Bots zu Orders und Positionen (lesen, setzen, ändern, löschen).
 * Quelle: worker_python/src/core/grid_orders.py.
 */
import { getCurrentMarketPrice, normalizePrice, normalizeVolume, type SymbolInfos } from './helpers';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import { safeSendOrder } from './tradeUtils';
import {
  BUY_ORDER_TYPES,
  ORDER_FILLING_RETURN,
  ORDER_TIME_GTC,
  ORDER_TYPE_BUY_LIMIT,
  ORDER_TYPE_BUY_STOP,
  ORDER_TYPE_SELL_LIMIT,
  ORDER_TYPE_SELL_STOP,
  POSITION_TYPE_BUY,
  TRADE_ACTION_MODIFY,
  TRADE_ACTION_PENDING,
  TRADE_ACTION_REMOVE,
  TRADE_ACTION_SLTP,
  type Broker,
  type Order,
  type Position,
} from './types';
import { BASE_MAGIC_NUMBER, isRobotMagic, zoneNumber } from './zoneMagic';

export const MAX_DEVIATION = 20;

export function getAllRobotOrders(broker: Broker): Order[] | null {
  const orders = broker.ordersGet();
  return orders ? orders.filter((o) => isRobotMagic(o.magic)) : null;
}

export function getAllRobotPositions(broker: Broker): Position[] | null {
  const positions = broker.positionsGet();
  return positions ? positions.filter((p) => isRobotMagic(p.magic)) : null;
}

function getAllManualPositions(broker: Broker): Position[] | null {
  const positions = broker.positionsGet();
  return positions ? positions.filter((p) => !isRobotMagic(p.magic)) : null;
}

/**
 * Belegte Stufen je Richtung (Orders, Bot- und Hand-Positionen).
 * snap=false: nicht aufs feste Raster runden (Raster ab der letzten Position, levels.ts).
 */
export function getExistingLevelsByDirection(
  broker: Broker,
  buyGridStep: number,
  sellGridStep: number,
  symbol: string,
  infos: SymbolInfos,
  snap = true,
): { buy: number[]; sell: number[] } {
  const buy: number[] = [];
  const sell: number[] = [];
  const add = (price: number, isBuy: boolean, itemSymbol: string) => {
    if (itemSymbol !== symbol) return;
    const step = isBuy ? buyGridStep : sellGridStep;
    const snapped = snap ? pyRound(price / step) * step : price;
    (isBuy ? buy : sell).push(normalizePrice(snapped, symbol, infos));
  };
  for (const o of getAllRobotOrders(broker) ?? []) add(o.price_open, BUY_ORDER_TYPES.includes(o.type), o.symbol);
  for (const p of getAllRobotPositions(broker) ?? []) add(p.price_open, p.type === POSITION_TYPE_BUY, p.symbol);
  for (const p of getAllManualPositions(broker) ?? []) add(p.price_open, p.type === POSITION_TYPE_BUY, p.symbol);
  return { buy, sell };
}

/** Volumen der Order, die die Position eröffnet hat (Cache, der Wert ändert sich nicht) */
function getOpeningOrderVolume(broker: Broker, position: Position, state: EngineState): number | null {
  const ident = position.identifier || position.ticket;
  const cached = state.openingVolumes.get(ident);
  if (cached !== undefined) return cached;
  const orders = broker.historyOrdersGet(ident);
  if (orders.length === 0) return null;
  const volume = orders[0].volume_initial || 0;
  if (volume <= 0) return null;
  state.openingVolumes.set(ident, volume);
  return volume;
}

/** Fehlendes Lot einer Stufe nach einer Teilfüllung; 0 = voll, unbekannt oder unter volume_min */
export function remainingLotAtLevel(
  broker: Broker,
  positionsAtLevel: Position[],
  symbol: string,
  infos: SymbolInfos,
  state: EngineState,
): number {
  if (positionsAtLevel.length === 0) return 0;
  const initial = positionsAtLevel
    .map((p) => getOpeningOrderVolume(broker, p, state))
    .filter((v): v is number => Boolean(v));
  if (initial.length === 0) return 0;
  const filled = positionsAtLevel.reduce((sum, p) => sum + p.volume, 0);
  const remaining = pyRound(Math.max(...initial) - filled, 8);
  const volMin = infos[symbol]?.volume_min || 0.01;
  if (remaining < volMin - 1e-9) return 0;
  return normalizeVolume(remaining, symbol, infos);
}

// AutoGrid_Z{n}_F{U|D}{zeit}; entfernte Zusatz-Setups k ≥ 2 (früher ENG-28): AutoGrid_Z{n}_F{k}{U|D}{zeit}
const FRACTAL_COMMENT_RE = /^AutoGrid_Z\d+_F(\d*)([UD])(\d+)$/;

/** Kommentar der Fraktal-Order: AutoGrid_Z{n}_F{U|D}{Kerzenzeit}; n aus der Magic der Zone */
export function fractalComment(magic: number, side: 'U' | 'D', barTime: number): string {
  return `AutoGrid_Z${zoneNumber(magic)}_F${side}${Math.trunc(barTime)}`;
}

/**
 * [Setup-Nummer, Seite, Kerzenzeit] oder null; ohne Nummer = 1. Anders als parseFractalComment in
 * lib/analysis/tradePairing.ts (Chart) erkennt diese Fassung wie der Bot auch nummerierte Zusatz-Setups.
 */
export function parseFractalComment(comment: string): [number, 'U' | 'D', number] | null {
  const m = FRACTAL_COMMENT_RE.exec(comment ?? '');
  if (!m) return null;
  return [m[1] ? Number(m[1]) : 1, m[2] as 'U' | 'D', Number(m[3])];
}

export function isFractalComment(comment: string): boolean {
  return parseFractalComment(comment) !== null;
}

export function cancelOrder(broker: Broker, order: Order, state: EngineState): boolean {
  const ok = safeSendOrder(broker, { action: TRADE_ACTION_REMOVE, order: order.ticket, symbol: order.symbol }, state);
  if (ok) {
    // Der Bot hat gelöscht: vanished.ts zählt die Order nicht als „von außen gelöscht“
    state.placedOrders.delete(order.ticket);
    if (isFractalComment(order.comment)) state.fractalOwnCancels.add(order.ticket);
  }
  return ok;
}

export function modifyPositionTpSl(
  broker: Broker,
  position: Position,
  tpPrice: number,
  slPrice: number | null,
  infos: SymbolInfos,
  state: EngineState,
): boolean {
  const symbol = position.symbol;
  return safeSendOrder(
    broker,
    {
      action: TRADE_ACTION_SLTP,
      position: position.ticket,
      symbol,
      tp: tpPrice ? normalizePrice(tpPrice, symbol, infos) : 0,
      sl: slPrice !== null && slPrice > 0 ? normalizePrice(slPrice, symbol, infos) : 0,
    },
    state,
  );
}

/** Nur SL/TP einer Pending Order ändern (Preis, Volumen, Ticket bleiben) */
export function modifyPendingOrder(
  broker: Broker,
  order: Order,
  slPrice: number,
  tpPrice: number,
  infos: SymbolInfos,
  state: EngineState,
): boolean {
  const symbol = order.symbol;
  return safeSendOrder(
    broker,
    {
      action: TRADE_ACTION_MODIFY,
      order: order.ticket,
      symbol,
      price: order.price_open,
      sl: slPrice ? normalizePrice(slPrice, symbol, infos) : 0,
      tp: tpPrice ? normalizePrice(tpPrice, symbol, infos) : 0,
      type_time: ORDER_TIME_GTC,
    },
    state,
  );
}

/** Zone auf PAUSE: keine neuen Orders, die Zombie-Bereinigung löscht die Pending Orders */
export function pauseZoneForSafety(zoneIdx: number, state: EngineState): void {
  state.writeUiState(zoneIdx, 'PAUSE');
  state.activeZonesState.set(zoneIdx, 'PAUSE');
}

/** Pending Order setzen; Limit oder Stop je nach Lage zum Marktpreis. 3 Ablehnungen in Folge → PAUSE */
export function sendPendingOrderHelper(
  broker: Broker,
  price: number,
  lot: number,
  tpPrice: number | null,
  slPrice: number | null,
  zoneIdx: number,
  direction: 'BUY' | 'SELL',
  symbol: string,
  infos: SymbolInfos,
  state: EngineState,
  magicArg?: number,
  comment?: string,
): boolean {
  const magic = magicArg ?? BASE_MAGIC_NUMBER + zoneIdx + 1;
  if (!symbol) {
    state.log('ERROR', 'order.noSymbol', { zone: zoneIdx + 1 });
    return false;
  }
  const current = getCurrentMarketPrice(broker, symbol, direction);
  if (current === null) return false;

  let type: number;
  if (direction === 'BUY') type = price < current ? ORDER_TYPE_BUY_LIMIT : ORDER_TYPE_BUY_STOP;
  else type = price > current ? ORDER_TYPE_SELL_LIMIT : ORDER_TYPE_SELL_STOP;

  const request = {
    action: TRADE_ACTION_PENDING,
    symbol,
    volume: normalizeVolume(lot, symbol, infos),
    type,
    price: normalizePrice(price, symbol, infos),
    deviation: MAX_DEVIATION,
    magic,
    comment: comment || `AutoGrid_Z${zoneNumber(magic)}`,
    type_time: ORDER_TIME_GTC,
    type_filling: ORDER_FILLING_RETURN,
    tp: tpPrice ? normalizePrice(tpPrice, symbol, infos) : 0,
    ...(slPrice !== null && slPrice > 0 ? { sl: normalizePrice(slPrice, symbol, infos) } : {}),
  };

  state.lastOrderTicket = 0;
  if (!safeSendOrder(broker, request, state)) {
    const errors = (state.consecutiveErrors.get(zoneIdx) ?? 0) + 1;
    state.consecutiveErrors.set(zoneIdx, errors);
    if (errors >= 3) {
      state.log('ERROR', 'zone.pausedAfterRejects', { zone: zoneIdx + 1, count: errors, detail: state.lastErrorMessage });
      pauseZoneForSafety(zoneIdx, state);
      state.consecutiveErrors.set(zoneIdx, 0);
    }
    return false;
  }
  if (state.consecutiveErrors.has(zoneIdx)) state.consecutiveErrors.set(zoneIdx, 0);
  if (state.lastOrderTicket) {
    state.placedOrders.set(state.lastOrderTicket, { magic, placedAt: state.now(), price: request.price });
  }
  return true;
}
