/**
 * Ein Durchlauf der aktiven Zone: Max-Positionen-Schutz, Sofort-Einstieg, Stufen, Prüfung, Setzen.
 * Quelle: worker_python/src/core/grid_execution/handler.py (handle_sliding_grid).
 */
import { extractZoneConfig } from './config';
import { cancelOrder, getExistingLevelsByDirection } from './gridOrders';
import type { SymbolInfos } from './gridHelpers';
import { openInstantPositions } from './instantEntry';
import { generateLevels, isPositionAnchored } from './levels';
import type { Order, Position } from './mt5';
import { placeMissingOrders } from './placement';
import type { EngineContext } from './state';
import { validateAndCleanup } from './validation';
import type { Zone } from './zoneMagic';

export function handleSlidingGrid(
  ctx: EngineContext,
  activeZone: Zone,
  activeZoneIdx: number,
  robotPositions: Position[],
  robotOrders: Order[],
  symbolInfos: SymbolInfos,
  consecutiveErrors: Map<number, number>,
  activeZonesState: Map<number, string>,
  currentAvgPrice: number,
): boolean {
  try {
    const config = extractZoneConfig(activeZone, activeZoneIdx, ctx.log, symbolInfos);

    if (config.entryMode === 'fractal') {
      // Fraktal-Einstieg (fractal_entry.py) kommt mit B3 (BKT-03)
      ctx.log(`Zone ${activeZoneIdx + 1}: Fraktal-Modus ist im Backtest noch nicht nachgebaut.`, 'ERROR');
      return false;
    }

    const openPositions = robotPositions.filter((p) => p.magic === config.targetMagic).length;
    const atLimit = openPositions >= config.maxPositions;
    if (atLimit) {
      if (ctx.state.limitWarnedZones.get(activeZoneIdx) !== openPositions) {
        ctx.state.limitWarnedZones.set(activeZoneIdx, openPositions);
        ctx.log(
          `⚠️ DİKKAT: Bölge ${activeZoneIdx + 1} Maksimum pozisyon sınırına ulaştı (${openPositions}/${config.maxPositions}). Yeni emir konmuyor.`,
          'WARN',
        );
      }
      let cancelled = 0;
      for (const o of robotOrders) if (o.magic === config.targetMagic && cancelOrder(ctx, o)) cancelled += 1;
      if (cancelled > 0) ctx.log(`🛡️ Güvenlik Koruması: Sınır aşıldığı için ${cancelled} bekleyen emir temizlendi.`);
      return true;
    }
    ctx.state.limitWarnedZones.delete(activeZoneIdx);

    // Neue Position erst im nächsten Durchlauf sichtbar; das Grid richtet sich dann nach ihr
    if (openInstantPositions(ctx, config, activeZoneIdx, robotPositions, currentAvgPrice, symbolInfos)) return true;

    const levels = generateLevels(config, currentAvgPrice, robotPositions, symbolInfos);
    validateAndCleanup(ctx, symbolInfos, robotOrders, robotPositions, config, levels);
    const [existBuy, existSell] = getExistingLevelsByDirection(
      ctx, config.gridStep, config.sellGridStep, config.symbol, symbolInfos, !isPositionAnchored(config),
    );
    placeMissingOrders(ctx, symbolInfos, config, levels, existBuy, existSell, activeZoneIdx, consecutiveErrors, activeZonesState);
    return true;
  } catch (e) {
    ctx.log(`🚨 Unexpected error in zone ${activeZoneIdx + 1}: ${String(e)}`, 'ERROR');
    return false;
  }
}
