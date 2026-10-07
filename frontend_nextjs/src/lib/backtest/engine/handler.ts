/**
 * Ein Durchlauf des gleitenden Grids für die aktive Zone eines Symbols.
 * Quelle: worker_python/src/core/grid_execution/handler.py (handle_sliding_grid).
 */
import { levelSets } from '@/lib/analysis/levels';
import { extractZoneConfig, InvalidZoneConfigError } from './config';
import { manageFractalOrders } from './fractalEntry';
import { normalizePrice, zoneLogId, type SymbolInfos } from './helpers';
import { openInstantPositions } from './instantEntry';
import { cancelOrder, getExistingLevelsByDirection } from './orders';
import { placeMissingOrders } from './placement';
import type { EngineState } from './state';
import type { Broker, Order, Position, ZoneDict } from './types';
import { validateAndCleanup } from './validation';

export function handleSlidingGrid(
  broker: Broker,
  zone: ZoneDict,
  zoneIdx: number,
  robotPositions: Position[],
  robotOrders: Order[],
  infos: SymbolInfos,
  state: EngineState,
  currentAvgPrice: number,
): boolean {
  try {
    const config = extractZoneConfig(zone, zoneIdx, infos, state);
    if (config.entryMode === 'fractal') {
      // Kein Grid: Sofort-Einstieg, Stufen und Grid-Prüfung entfallen. Die Positionsgrenze prüft
      // fractalEntry selbst: es löscht die Pending Orders der Zone, Erledigt-Liste und SAR-Nachzug laufen weiter.
      return manageFractalOrders(broker, config, zoneIdx, zoneLogId(zone, zoneIdx), robotPositions, robotOrders, infos, state);
    }

    const open = robotPositions.filter((p) => p.magic === config.targetMagic).length;
    const atLimit = open >= config.maxPositions;
    if (atLimit) {
      // Nur beim Erreichen der Grenze / bei geänderter Zahl warnen, nicht jeden Durchlauf
      if (state.limitWarnedZones.get(zoneIdx) !== open) {
        state.limitWarnedZones.set(zoneIdx, open);
        state.log('WARN', 'grid.maxPositions', { zone: zoneIdx + 1, open, max: config.maxPositions });
      }
      let cancelled = 0;
      for (const o of robotOrders) {
        if (o.magic === config.targetMagic && cancelOrder(broker, o, state)) cancelled += 1;
      }
      if (cancelled > 0) state.log('INFO', 'grid.maxPositionsCleared', { count: cancelled });
      return true;
    }
    state.limitWarnedZones.delete(zoneIdx);

    // Neue Position wird erst im nächsten Durchlauf sichtbar; das Grid richtet sich dann nach ihr
    if (openInstantPositions(broker, config, zoneIdx, robotPositions, currentAvgPrice, infos, state)) return true;

    const anchored = config.stepByLoss || config.instantEntry;
    const levels = levelSets(
      {
        orderType: config.orderType,
        minPrice: config.minPrice,
        maxPrice: config.maxPrice,
        gridStep: config.gridStep,
        sellGridStep: config.sellGridStep,
        levelsBelow: config.levelsBelow,
        levelsAbove: config.levelsAbove,
        isBreakout: config.isBreakout,
        pullbackDistance: config.pullbackDistance,
        sellPullbackDistance: config.sellPullbackDistance,
        anchored,
        magic: config.targetMagic,
      },
      currentAvgPrice,
      robotPositions,
      (p) => normalizePrice(p, config.symbol, infos),
    );

    validateAndCleanup(broker, robotOrders, robotPositions, config, levels, infos, state);
    const existing = getExistingLevelsByDirection(
      broker,
      config.gridStep,
      config.sellGridStep,
      config.symbol,
      infos,
      !anchored,
    );
    placeMissingOrders(broker, config, levels, existing, zoneIdx, infos, state);
    return true;
  } catch (e) {
    if (e instanceof InvalidZoneConfigError) state.log('ERROR', e.code, e.params);
    else state.log('ERROR', 'engine.zoneError', { zone: zoneIdx + 1, error: e instanceof Error ? e.name : 'unknown' });
    return false;
  }
}
