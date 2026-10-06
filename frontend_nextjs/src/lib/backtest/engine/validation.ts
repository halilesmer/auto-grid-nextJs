/**
 * Pending Orders prüfen und unpassende löschen (außerhalb des Fensters, falsches Lot/TP/SL).
 * Quelle: worker_python/src/core/grid_execution/validation.py (OrderValidator).
 */
import type { ZoneConfig } from './config';
import { cancelOrder, remainingLotAtLevel } from './gridOrders';
import { normalizePrice, normalizeVolume, type SymbolInfos } from './gridHelpers';
import type { LevelSets } from './levels';
import { BUY_ORDER_TYPES, MT5, SELL_ORDER_TYPES, type Order, type Position } from './mt5';
import { pyRound } from './pyRound';
import type { EngineContext } from './state';

export function validateAndCleanup(
  ctx: EngineContext,
  symbolInfos: SymbolInfos,
  robotOrders: Order[],
  robotPositions: Position[],
  config: ZoneConfig,
  levels: LevelSets,
): number {
  const norm = (p: number) => normalizePrice(p, config.symbol, symbolInfos);
  let cancelled = 0;

  for (const order of robotOrders) {
    if (order.magic !== config.targetMagic) continue;
    const orderPrice = norm(order.price_open);
    let isValid = false;

    const isBuy = BUY_ORDER_TYPES.includes(order.type);
    if (isBuy || SELL_ORDER_TYPES.includes(order.type)) {
      const tolerance = (isBuy ? config.gridStep : config.sellGridStep) * 0.4;
      const acceptable = isBuy ? levels.acceptableBuy : levels.acceptableSell;
      isValid = acceptable.some((al) => Math.abs(pyRound(orderPrice, 5) - pyRound(al, 5)) <= pyRound(tolerance, 5));
      if (isValid) {
        const sign = isBuy ? 1 : -1;
        const tp = isBuy ? config.takeProfit : config.sellTakeProfit;
        const sl = isBuy ? config.stopLoss : config.sellStopLoss;
        const expectedTp = norm(orderPrice + sign * tp);
        const expectedSl = sl > 0 ? norm(orderPrice - sign * sl) : 0;
        const posType = isBuy ? MT5.POSITION_TYPE_BUY : MT5.POSITION_TYPE_SELL;
        const positionsAtLevel = robotPositions.filter(
          (p) =>
            p.magic === config.targetMagic &&
            p.type === posType &&
            Math.abs(pyRound(norm(p.price_open), 5) - pyRound(orderPrice, 5)) <= pyRound(tolerance, 5),
        );
        // Mit Position auf der Stufe ist die Order nur die Ergänzung einer Teilfüllung
        const expectedLot = positionsAtLevel.length
          ? remainingLotAtLevel(ctx, positionsAtLevel, config.symbol, symbolInfos)
          : Number(isBuy ? config.lotSize : config.sellLotSize);
        const expectedLotNorm = expectedLot > 0 ? normalizeVolume(expectedLot, config.symbol, symbolInfos) : 0;
        if (
          expectedLotNorm === 0 ||
          Math.abs(Number(order.volume_initial) - expectedLotNorm) > 0.00001 ||
          Math.abs(Number(order.tp || 0) - expectedTp) > 0.00001 ||
          Math.abs(Number(order.sl || 0) - expectedSl) > 0.00001
        ) {
          isValid = false;
        }
      }
    }

    if (!isValid && cancelOrder(ctx, order)) cancelled += 1;
  }

  if (cancelled > 0) ctx.log(`🧹 Pencere Kaydı: Fiyattan uzaklaşan ${cancelled} adet emir silindi.`);
  return cancelled;
}
