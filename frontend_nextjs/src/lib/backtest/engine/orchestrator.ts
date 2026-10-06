/**
 * Ein Durchlauf des Bots über alle Zonen (ein Aufruf = ein Tick des Live-Loops).
 * Quelle: worker_python/src/core/grid_orchestrator.py (manage_dynamic_grid, _manage_symbol).
 *
 * Je Symbol ist höchstens EINE Zone aktiv (activeZones: Symbol → Index). Zonen mit verschiedenen
 * Symbolen laufen gleichzeitig; unter den Zonen eines Symbols gilt die erste, die den Kurs enthält.
 */
import { handleSlidingGrid } from './handler';
import { getCurrentMarketPrice, isEnabled, zget, type SymbolInfos } from './helpers';
import { cleanZombieOrders, handleZoneExit, processPartialFillsAndTpsl } from './orderManager';
import { getAllRobotOrders, getAllRobotPositions } from './orders';
import type { EngineState } from './state';
import type { Broker, ZoneDict } from './types';
import { checkVanishedOrders } from './vanished';
import { closedCandleClose, detectZoneEntry, isZoneExited, zoneSymbolOf } from './zoneSelector';
import { processZoneCommands, STOPPED_ZONE_STATES } from './zoneState';

export type ActiveZones = Record<string, number>;

/** Symbole der Zonen in der Reihenfolge des ersten Auftretens (leere übersprungen) */
function zoneSymbols(zones: readonly ZoneDict[]): string[] {
  const symbols: string[] = [];
  for (const zone of zones) {
    const sym = zoneSymbolOf(zone);
    if (sym && !symbols.includes(sym)) symbols.push(sym);
  }
  return symbols;
}

export function manageDynamicGrid(
  broker: Broker,
  zones: readonly ZoneDict[],
  activeZonesIn: ActiveZones,
  infos: SymbolInfos,
  state: EngineState,
  remotePaused = false,
): [boolean, ActiveZones] {
  processZoneCommands(zones, state);
  const activeZones: ActiveZones = { ...activeZonesIn };
  if (remotePaused) return [true, activeZones];

  // Gelöschte / deaktivierte Zonen und Zonen mit geändertem Symbol vergessen
  for (const [sym, idx] of Object.entries(activeZones)) {
    if (!(idx >= 0 && idx < zones.length) || !isEnabled(zones[idx]) || zoneSymbolOf(zones[idx]) !== sym) {
      delete activeZones[sym];
    }
  }

  let robotPositions = getAllRobotPositions(broker);
  let robotOrders = getAllRobotOrders(broker);
  if (robotPositions === null || robotOrders === null) return [false, activeZones];

  const symbols = zoneSymbols(zones);
  if (symbols.length === 0) return [false, activeZones];

  const prices = new Map<string, number>();
  for (const sym of symbols) {
    const buy = getCurrentMarketPrice(broker, sym, 'BUY');
    const sell = getCurrentMarketPrice(broker, sym, 'SELL');
    if (buy !== null && sell !== null) prices.set(sym, (buy + sell) / 2.0);
  }
  if (prices.size === 0) return [false, activeZones];

  cleanZombieOrders(broker, robotOrders, zones, state);
  robotOrders = getAllRobotOrders(broker);
  robotPositions = getAllRobotPositions(broker);
  if (robotOrders === null || robotPositions === null) return [false, activeZones];

  checkVanishedOrders(broker, zones, robotOrders, robotPositions, state);
  processPartialFillsAndTpsl(broker, robotPositions, robotOrders, zones, infos, state);

  let ok = prices.size === symbols.length;
  for (const sym of symbols) {
    const price = prices.get(sym);
    if (price === undefined) continue;
    const [symOk, idx] = manageSymbol(broker, zones, sym, activeZones[sym] ?? null, price, infos, state);
    ok = ok && symOk;
    if (idx === null) delete activeZones[sym];
    else activeZones[sym] = idx;
  }
  return [ok, activeZones];
}

/** Ein Symbol: Ausstieg prüfen, Einstieg erkennen, gleitendes Grid. Rückgabe: (ok, aktive Zone) */
function manageSymbol(
  broker: Broker,
  zones: readonly ZoneDict[],
  symbol: string,
  activeIdxIn: number | null,
  currentAvgPrice: number,
  infos: SymbolInfos,
  state: EngineState,
): [boolean, number | null] {
  let activeIdx = activeIdxIn;
  let activeZone: ZoneDict | null = activeIdx !== null ? zones[activeIdx] : null;

  let robotOrders = getAllRobotOrders(broker);
  let robotPositions = getAllRobotPositions(broker);
  if (robotOrders === null || robotPositions === null) return [false, activeIdx];

  if (activeZone !== null && activeIdx !== null) {
    const exitCond = zget(activeZone, 'exit_condition', 'Anlık Fiyat');
    const closePrice = exitCond !== 'Anlık Fiyat' ? closedCandleClose(broker, activeZone, symbol, currentAvgPrice) : currentAvgPrice;
    if (isZoneExited(broker, activeZone, currentAvgPrice, symbol)) {
      const markCleared = handleZoneExit(broker, activeZone, activeIdx, robotOrders, robotPositions, currentAvgPrice, closePrice, exitCond, state);
      // „Gestoppt“ nur mit clear_on_exit; sonst bleiben die Pending Orders der Zone stehen
      if (markCleared) {
        // Sofort auch im Speicher: im selben Durchlauf keine neuen Orders an der Grenze
        state.activeZonesState.set(activeIdx, 'AUTO_CLEAR');
        state.writeUiState(activeIdx, 'AUTO_CLEAR');
      }
      activeZone = null;
      activeIdx = null;
    }
  }

  [activeZone, activeIdx] = detectZoneEntry(broker, zones, activeZone, activeIdx, symbol, state);

  // Kurs in keiner Zone: erste Zone des Symbols
  const targetIdx = activeIdx !== null ? activeIdx : zones.findIndex((z) => zoneSymbolOf(z) === symbol);
  const targetZone = zones[targetIdx];

  // Nicht nur PAUSE: auch AUTO_CLEAR/CLEAR setzen keine Orders (sonst löscht die Zombie-Bereinigung sie jeden Durchlauf)
  let zoneActive = isEnabled(targetZone);
  if (STOPPED_ZONE_STATES.includes(state.activeZonesState.get(targetIdx) ?? '')) zoneActive = false;
  if (!zoneActive) return [true, activeIdx];

  robotOrders = getAllRobotOrders(broker);
  robotPositions = getAllRobotPositions(broker);
  if (robotOrders === null || robotPositions === null) return [false, targetIdx];

  handleSlidingGrid(broker, targetZone, targetIdx, robotPositions, robotOrders, infos, state, currentAvgPrice);
  return [true, targetIdx];
}
