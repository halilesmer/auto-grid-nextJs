/**
 * Fehlende Grid-Orders setzen: jede gewünschte Stufe ohne Order/Position bekommt eine Pending Order.
 * Quelle: worker_python/src/core/grid_execution/placement.py (OrderPlacer.place_missing_orders).
 */
import type { LevelSets } from '@/lib/analysis/levels';
import type { ZoneConfig } from './config';
import { normalizePrice, type SymbolInfos } from './helpers';
import { sendPendingOrderHelper } from './orders';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import type { Broker } from './types';

export function placeMissingOrders(
  broker: Broker,
  config: ZoneConfig,
  levels: LevelSets,
  existing: { buy: number[]; sell: number[] },
  zoneIdx: number,
  infos: SymbolInfos,
  state: EngineState,
): number {
  const { symbol } = config;
  let placed = 0;
  const sides = [
    {
      direction: 'BUY' as const,
      desired: levels.desiredBuy,
      existing: existing.buy,
      tolerance: pyRound(config.gridStep * 0.45, 5),
      takeProfit: config.takeProfit,
      stopLoss: config.stopLoss,
      lot: config.lotSize,
      sign: 1,
    },
    {
      direction: 'SELL' as const,
      desired: levels.desiredSell,
      existing: existing.sell,
      tolerance: pyRound(config.sellGridStep * 0.45, 5),
      takeProfit: config.sellTakeProfit,
      stopLoss: config.sellStopLoss,
      lot: config.sellLotSize,
      sign: -1,
    },
  ];
  for (const side of sides) {
    for (const level of side.desired) {
      if (side.existing.some((el) => Math.abs(pyRound(level, 5) - pyRound(el, 5)) <= side.tolerance)) continue;
      const tp = normalizePrice(level + side.sign * side.takeProfit, symbol, infos);
      const sl = side.stopLoss > 0 ? normalizePrice(level - side.sign * side.stopLoss, symbol, infos) : null;
      if (sendPendingOrderHelper(broker, level, side.lot, tp, sl, zoneIdx, side.direction, symbol, infos, state, config.targetMagic)) {
        placed += 1;
      }
    }
  }
  if (placed > 0) state.log('INFO', 'grid.ordersPlaced', { count: placed });
  return placed;
}
