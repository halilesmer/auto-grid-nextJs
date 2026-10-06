/**
 * Fehlende Grid-Orders setzen. Quelle: worker_python/src/core/grid_execution/placement.py (OrderPlacer).
 */
import type { ZoneConfig } from './config';
import { sendPendingOrderHelper } from './gridOrders';
import { normalizePrice, type SymbolInfos } from './gridHelpers';
import type { LevelSets } from './levels';
import { pyRound } from './pyRound';
import type { EngineContext } from './state';

export function placeMissingOrders(
  ctx: EngineContext,
  symbolInfos: SymbolInfos,
  config: ZoneConfig,
  levels: LevelSets,
  existingBuy: Set<number>,
  existingSell: Set<number>,
  zoneIdx: number,
  consecutiveErrors: Map<number, number>,
  activeZonesState: Map<number, string>,
): number {
  const norm = (p: number) => normalizePrice(p, config.symbol, symbolInfos);
  let placed = 0;

  const sides = [
    { dir: 'BUY' as const, wanted: levels.desiredBuy, existing: existingBuy, step: config.gridStep, sign: 1,
      tp: config.takeProfit, sl: config.stopLoss, lot: config.lotSize },
    { dir: 'SELL' as const, wanted: levels.desiredSell, existing: existingSell, step: config.sellGridStep, sign: -1,
      tp: config.sellTakeProfit, sl: config.sellStopLoss, lot: config.sellLotSize },
  ];
  for (const s of sides) {
    const tolerance = pyRound(s.step * 0.45, 5);
    for (const level of s.wanted) {
      const taken = [...s.existing].some((el) => Math.abs(pyRound(level, 5) - pyRound(el, 5)) <= tolerance);
      if (taken) continue;
      const tpPrice = norm(level + s.sign * s.tp);
      const slPrice = s.sl > 0 ? norm(level - s.sign * s.sl) : null;
      if (
        sendPendingOrderHelper(ctx, level, s.lot, tpPrice, slPrice, zoneIdx, s.dir, config.symbol, symbolInfos,
          consecutiveErrors, activeZonesState, null, config.targetMagic)
      ) {
        placed += 1;
      }
    }
  }

  if (placed > 0) ctx.log(`🌱 Ağ Tazelendi: TP olan/eksik ${placed} adet emir yerleştirildi.`);
  return placed;
}
