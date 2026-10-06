/**
 * Ein Motor-Durchlauf über alle Symbole. Quelle: worker_python/src/core/grid_orchestrator.py
 * (manage_dynamic_grid, _manage_symbol). Im Backtest ruft der Runner das einmal je Tick auf,
 * nachdem der Broker gefüllt und TP/SL ausgelöst hat (docs/analyse-regeln.md §5).
 */
import { getAllRobotOrders, getAllRobotPositions } from './gridOrders';
import { getCurrentMarketPrice, type SymbolInfos } from './gridHelpers';
import { handleSlidingGrid } from './handler';
import { cleanZombieOrders, handleZoneExit, processPartialFillsAndTpsl } from './orderManager';
import { isEnabled, pyGet, type EngineContext } from './state';
import { checkVanishedOrders } from './vanished';
import { detectZoneEntry, isZoneExited, lastClosedClose, zoneSymbolOf } from './zoneSelector';
import { processZoneCommands, STOPPED_ZONE_STATES } from './zoneState';
import type { Zone } from './zoneMagic';

/** Was bot_runner/loop zwischen den Durchläufen mitführt (tests/helpers.py EngineHarness) */
export interface LoopState {
  /** Symbol → Index der aktiven Zone */
  activeZones: Record<string, number>;
  remotePaused: boolean;
  symbolInfos: SymbolInfos;
  consecutiveErrors: Map<number, number>;
  activeZonesState: Map<number, string>;
}

export function newLoopState(symbolInfos: SymbolInfos): LoopState {
  return { activeZones: {}, remotePaused: false, symbolInfos, consecutiveErrors: new Map(), activeZonesState: new Map() };
}

function zoneSymbols(zones: Zone[]): string[] {
  const symbols: string[] = [];
  for (const zone of zones) {
    const sym = zoneSymbolOf(zone);
    if (sym && !symbols.includes(sym)) symbols.push(sym);
  }
  return symbols;
}

/** manage_dynamic_grid: ein Durchlauf; aktualisiert `loop.activeZones`. Rückgabe: ok */
export function manageDynamicGrid(ctx: EngineContext, zones: Zone[], loop: LoopState): boolean {
  const { symbolInfos, consecutiveErrors, activeZonesState } = loop;
  processZoneCommands(ctx.state, zones, activeZonesState);
  const activeZones: Record<string, number> = { ...loop.activeZones };
  loop.activeZones = activeZones;
  if (loop.remotePaused) return true;

  for (const [sym, idx] of Object.entries(activeZones)) {
    if (!(idx >= 0 && idx < zones.length) || !isEnabled(zones[idx]) || zoneSymbolOf(zones[idx]) !== sym) {
      delete activeZones[sym];
    }
  }

  let robotPositions = getAllRobotPositions(ctx);
  let robotOrders = getAllRobotOrders(ctx);
  if (robotPositions === null || robotOrders === null) return false;

  const symbols = zoneSymbols(zones);
  if (!symbols.length) return false;

  const prices = new Map<string, number>();
  for (const sym of symbols) {
    const buy = getCurrentMarketPrice(ctx, sym, 'BUY');
    const sell = getCurrentMarketPrice(ctx, sym, 'SELL');
    if (buy !== null && sell !== null) prices.set(sym, (buy + sell) / 2.0);
  }
  if (!prices.size) return false;

  cleanZombieOrders(ctx, robotOrders, zones, activeZonesState);
  robotOrders = getAllRobotOrders(ctx);
  robotPositions = getAllRobotPositions(ctx);
  if (robotOrders === null || robotPositions === null) return false;

  checkVanishedOrders(ctx, zones, robotOrders, robotPositions, activeZonesState);
  processPartialFillsAndTpsl(ctx, robotPositions, robotOrders, zones, symbolInfos, activeZonesState, consecutiveErrors);

  let ok = prices.size === symbols.length;
  for (const sym of symbols) {
    const price = prices.get(sym);
    if (price === undefined) continue;
    const [symOk, idx] = manageSymbol(ctx, zones, sym, activeZones[sym] ?? null, price, loop);
    ok = ok && symOk;
    if (idx === null) delete activeZones[sym];
    else activeZones[sym] = idx;
  }
  return ok;
}

function manageSymbol(
  ctx: EngineContext,
  zones: Zone[],
  symbol: string,
  activeIdx: number | null,
  currentAvgPrice: number,
  loop: LoopState,
): [boolean, number | null] {
  const { symbolInfos, consecutiveErrors, activeZonesState } = loop;
  let activeZone: Zone | null = activeIdx !== null ? zones[activeIdx] : null;
  let activeZoneIdx = activeIdx;

  let robotOrders = getAllRobotOrders(ctx);
  let robotPositions = getAllRobotPositions(ctx);
  if (robotOrders === null || robotPositions === null) return [false, activeZoneIdx];

  if (activeZone !== null && activeZoneIdx !== null) {
    const exitCond = pyGet(activeZone, 'exit_condition', 'Anlık Fiyat');
    const closePrice =
      exitCond !== 'Anlık Fiyat'
        ? lastClosedClose(ctx, symbol, pyGet(activeZone, 'exit_timeframe', 'M15'), currentAvgPrice)
        : currentAvgPrice;

    if (isZoneExited(ctx, activeZone, currentAvgPrice, symbol)) {
      const markCleared = handleZoneExit(ctx, activeZone, activeZoneIdx, robotOrders, robotPositions, currentAvgPrice, closePrice, exitCond);
      if (markCleared) {
        // Sofort im Speicher markieren, damit im selben Durchlauf nicht wieder Orders entstehen
        activeZonesState.set(activeZoneIdx, 'AUTO_CLEAR');
        ctx.state.uiStates = { ...(ctx.state.uiStates ?? {}), [String(activeZoneIdx)]: 'AUTO_CLEAR' };
      }
      activeZone = null;
      activeZoneIdx = null;
    }
  }

  [activeZone, activeZoneIdx] = detectZoneEntry(ctx, zones, activeZone, activeZoneIdx, symbol);

  // Kurs in keiner Zone: die erste Zone des Symbols
  const targetIdx = activeZoneIdx ?? zones.findIndex((z) => zoneSymbolOf(z) === symbol);
  const targetZone = zones[targetIdx];

  let zoneActive = isEnabled(targetZone);
  if (STOPPED_ZONE_STATES.includes(activeZonesState.get(targetIdx) ?? '')) zoneActive = false;
  if (!zoneActive) return [true, activeZoneIdx];

  robotOrders = getAllRobotOrders(ctx);
  robotPositions = getAllRobotPositions(ctx);
  if (robotOrders === null || robotPositions === null) return [false, targetIdx];

  handleSlidingGrid(ctx, targetZone, targetIdx, robotPositions, robotOrders, symbolInfos, consecutiveErrors, activeZonesState, currentAvgPrice);
  return [true, targetIdx];
}
