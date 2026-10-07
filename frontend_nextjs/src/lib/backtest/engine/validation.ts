/**
 * Pending Orders prüfen: Orders außerhalb der erlaubten Stufen oder mit falschem Lot/TP/SL löschen.
 * Quelle: worker_python/src/core/grid_execution/validation.py (OrderValidator.validate_and_cleanup).
 */
import type { LevelSets } from '@/lib/analysis/levels';
import type { ZoneConfig } from './config';
import { normalizePrice, normalizeVolume, type SymbolInfos } from './helpers';
import { cancelOrder, remainingLotAtLevel } from './orders';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import { enforceStopsLevel } from './tradeUtils';
import {
  BUY_ORDER_TYPES,
  POSITION_TYPE_BUY,
  POSITION_TYPE_SELL,
  SELL_ORDER_TYPES,
  TRADE_ACTION_PENDING,
  type Broker,
  type Order,
  type Position,
} from './types';

interface Side {
  tolerance: number;
  acceptable: number[];
  takeProfit: number;
  stopLoss: number;
  lotSize: number;
  positionType: number;
  /** +1 BUY (TP über, SL unter dem Preis), −1 SELL */
  sign: number;
}

function isOrderValid(
  broker: Broker,
  order: Order,
  side: Side,
  positions: Position[],
  config: ZoneConfig,
  infos: SymbolInfos,
  state: EngineState,
): boolean {
  const { symbol } = config;
  const orderPrice = normalizePrice(order.price_open, symbol, infos);
  const tol = pyRound(side.tolerance, 5);
  if (!side.acceptable.some((al) => Math.abs(pyRound(orderPrice, 5) - pyRound(al, 5)) <= tol)) return false;

  // safeSendOrder zieht TP/SL der Pending Order auf den Stops-Abstand; verglichen wird mit dem verschobenen Wert,
  // sonst wird die Order jede Runde gelöscht und neu gesendet
  const sent = enforceStopsLevel(broker, {
    symbol,
    action: TRADE_ACTION_PENDING,
    type: order.type,
    price: orderPrice,
    tp: normalizePrice(orderPrice + side.sign * side.takeProfit, symbol, infos),
    sl: side.stopLoss > 0 ? normalizePrice(orderPrice - side.sign * side.stopLoss, symbol, infos) : 0,
  });
  const expectedTp = sent.tp ?? 0;
  const expectedSl = sent.sl ?? 0;
  const atLevel = positions.filter(
    (p) =>
      p.magic === config.targetMagic &&
      p.type === side.positionType &&
      Math.abs(pyRound(normalizePrice(p.price_open, symbol, infos), 5) - pyRound(orderPrice, 5)) <= tol,
  );
  // Mit Position auf der Stufe ist die Order nur die Ergänzung einer Teilfüllung: erwartet wird der Rest
  const expectedLot = atLevel.length > 0 ? remainingLotAtLevel(broker, atLevel, symbol, infos, state) : side.lotSize;
  const expectedLotNorm = expectedLot > 0 ? normalizeVolume(expectedLot, symbol, infos) : 0;
  return !(
    expectedLotNorm === 0 ||
    Math.abs(order.volume_initial - expectedLotNorm) > 0.00001 ||
    Math.abs((order.tp || 0) - expectedTp) > 0.00001 ||
    Math.abs((order.sl || 0) - expectedSl) > 0.00001
  );
}

export function validateAndCleanup(
  broker: Broker,
  robotOrders: Order[],
  robotPositions: Position[],
  config: ZoneConfig,
  levels: LevelSets,
  infos: SymbolInfos,
  state: EngineState,
): number {
  const buy: Side = {
    tolerance: config.gridStep * 0.4,
    acceptable: levels.acceptableBuy,
    takeProfit: config.takeProfit,
    stopLoss: config.stopLoss,
    lotSize: config.lotSize,
    positionType: POSITION_TYPE_BUY,
    sign: 1,
  };
  const sell: Side = {
    tolerance: config.sellGridStep * 0.4,
    acceptable: levels.acceptableSell,
    takeProfit: config.sellTakeProfit,
    stopLoss: config.sellStopLoss,
    lotSize: config.sellLotSize,
    positionType: POSITION_TYPE_SELL,
    sign: -1,
  };

  let cancelled = 0;
  for (const order of robotOrders) {
    if (order.magic !== config.targetMagic) continue;
    let side: Side | null = null;
    if (BUY_ORDER_TYPES.includes(order.type)) side = buy;
    else if (SELL_ORDER_TYPES.includes(order.type)) side = sell;
    const valid = side !== null && isOrderValid(broker, order, side, robotPositions, config, infos, state);
    if (!valid && cancelOrder(broker, order, state)) cancelled += 1;
  }
  if (cancelled > 0) state.log('INFO', 'grid.ordersOutOfWindow', { count: cancelled });
  return cancelled;
}
