/**
 * Ein Durchlauf des Bots über alle Zonen (ein Aufruf = ein Tick des Live-Loops).
 * Quelle: worker_python/src/core/grid_orchestrator.py (manage_dynamic_grid, _manage_zone).
 *
 * Jede aktive Zone (Setup) läuft für sich mit eigener Magic und eigenem Zustand, auch mehrere Zonen
 * eines Symbols gleichzeitig (ENG-01). activeZones: Index → Symbol der Zonen, deren Grid im letzten
 * Durchlauf lief; für sie prüft der nächste Durchlauf den Ausstieg. Der Backtest-Runner übergibt
 * genau eine Zone.
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
import { refreshSpreadGuard } from './spreadGuard';

export type ActiveZones = Record<number, string>;

/** Symbole der Zonen in der Reihenfolge des ersten Auftretens (leere übersprungen) */
function zoneSymbols(zones: readonly ZoneDict[]): string[] {
  const symbols: string[] = [];
  for (const zone of zones) {
    const sym = zoneSymbolOf(zone);
    if (sym && !symbols.includes(sym)) symbols.push(sym);
  }
  return symbols;
}

/** Ergebnis des Tur-Kopfs (BKT-31): `done` gesetzt = Durchlauf endet hier (Rückgabe des Gesamtaufrufs) */
export interface TurnHead {
  done: [boolean, ActiveZones] | null;
  prices: Map<string, number>;
  active: ActiveZones;
  symbols: string[];
}

/**
 * Kopf eines Durchlaufs: Zonenkommandos, Spread-Wächter, Lesung 1, Kurslesung, Zombie-Löschen, Lesung 2,
 * Verschwundene, TP/SL (grid_orchestrator.py :60-111). Die Zonenschleife folgt in `turnZones`.
 */
export function turnHead(
  broker: Broker,
  zones: readonly ZoneDict[],
  activeZonesIn: ActiveZones,
  infos: SymbolInfos,
  state: EngineState,
  remotePaused = false,
): TurnHead {
  processZoneCommands(zones, state);
  const activeZones: ActiveZones = { ...activeZonesIn };
  const prices = new Map<string, number>();
  const stop = (ok: boolean, symbols: string[] = []): TurnHead => ({ done: [ok, activeZones], prices, active: activeZones, symbols });
  refreshSpreadGuard(broker, zones, infos, state);
  if (remotePaused) return stop(true);

  // Gelöschte / deaktivierte Zonen und Zonen mit geändertem Symbol vergessen
  for (const [key, sym] of Object.entries(activeZones)) {
    const idx = Number(key);
    if (!(idx >= 0 && idx < zones.length) || !isEnabled(zones[idx]) || zoneSymbolOf(zones[idx]) !== sym) {
      delete activeZones[idx];
    }
  }

  let robotPositions = getAllRobotPositions(broker);
  let robotOrders = getAllRobotOrders(broker);
  if (robotPositions === null || robotOrders === null) return stop(false);

  const symbols = zoneSymbols(zones);
  if (symbols.length === 0) return stop(false);

  for (const sym of symbols) {
    const buy = getCurrentMarketPrice(broker, sym, 'BUY');
    const sell = getCurrentMarketPrice(broker, sym, 'SELL');
    if (buy !== null && sell !== null) prices.set(sym, (buy + sell) / 2.0);
  }
  if (prices.size === 0) return stop(false);

  cleanZombieOrders(broker, robotOrders, zones, state);
  robotOrders = getAllRobotOrders(broker);
  robotPositions = getAllRobotPositions(broker);
  if (robotOrders === null || robotPositions === null) return stop(false);

  checkVanishedOrders(broker, zones, robotOrders, robotPositions, state);
  processPartialFillsAndTpsl(broker, robotPositions, robotOrders, zones, infos, state);
  return { done: null, prices, active: activeZones, symbols };
}

/** Zonenschleife eines Durchlaufs mit den Kursen des Kopfs (grid_orchestrator.py :117-136) */
export function turnZones(
  broker: Broker,
  zones: readonly ZoneDict[],
  head: TurnHead,
  infos: SymbolInfos,
  state: EngineState,
): [boolean, ActiveZones] {
  const activeZones = head.active;
  let ok = head.prices.size === head.symbols.length;
  zones.forEach((zone, idx) => {
    const sym = zoneSymbolOf(zone);
    const price = head.prices.get(sym);
    if (price === undefined || !isEnabled(zone)) return;
    const [zoneOk, keep] = manageZone(broker, zone, idx, idx in activeZones, price, infos, state);
    ok = ok && zoneOk;
    if (keep) activeZones[idx] = sym;
    else delete activeZones[idx];
  });
  return [ok, activeZones];
}

export function manageDynamicGrid(
  broker: Broker,
  zones: readonly ZoneDict[],
  activeZonesIn: ActiveZones,
  infos: SymbolInfos,
  state: EngineState,
  remotePaused = false,
): [boolean, ActiveZones] {
  const head = turnHead(broker, zones, activeZonesIn, infos, state, remotePaused);
  if (head.done) return head.done;
  return turnZones(broker, zones, head, infos, state);
}

/**
 * Eine Zone: Ausstieg prüfen, Einstieg erkennen, gleitendes Grid. Auch außerhalb ihres Bereichs
 * führt die Zone ihr Grid. Rückgabe: (ok, bleibt die Zone in activeZones)
 */
function manageZone(
  broker: Broker,
  zone: ZoneDict,
  idx: number,
  enteredIn: boolean,
  currentAvgPrice: number,
  infos: SymbolInfos,
  state: EngineState,
): [boolean, boolean] {
  const symbol = zoneSymbolOf(zone);
  let entered = enteredIn;

  let robotOrders = getAllRobotOrders(broker);
  let robotPositions = getAllRobotPositions(broker);
  if (robotOrders === null || robotPositions === null) return [false, entered];

  if (entered) {
    const exitCond = zget(zone, 'exit_condition', 'Anlık Fiyat');
    const closePrice = exitCond !== 'Anlık Fiyat' ? closedCandleClose(broker, zone, symbol, currentAvgPrice) : currentAvgPrice;
    if (isZoneExited(broker, zone, currentAvgPrice, symbol)) {
      const markCleared = handleZoneExit(broker, zone, idx, robotOrders, robotPositions, currentAvgPrice, closePrice, exitCond, state);
      // „Gestoppt“ nur mit clear_on_exit; sonst bleiben die Pending Orders der Zone stehen
      if (markCleared) {
        // Sofort auch im Speicher: im selben Durchlauf keine neuen Orders an der Grenze
        state.activeZonesState.set(idx, 'AUTO_CLEAR');
        state.writeUiState(idx, 'AUTO_CLEAR');
      }
      entered = false;
    }
  }

  entered = detectZoneEntry(broker, zone, idx, entered, state);

  // Nicht nur PAUSE: auch AUTO_CLEAR/CLEAR setzen keine Orders (sonst löscht die Zombie-Bereinigung sie jeden Durchlauf)
  let zoneActive = isEnabled(zone);
  if (STOPPED_ZONE_STATES.includes(state.activeZonesState.get(idx) ?? '')) zoneActive = false;
  if (!zoneActive) return [true, entered];

  robotOrders = getAllRobotOrders(broker);
  robotPositions = getAllRobotPositions(broker);
  if (robotOrders === null || robotPositions === null) return [false, true];

  handleSlidingGrid(broker, zone, idx, robotPositions, robotOrders, infos, state, currentAvgPrice);
  return [true, true];
}
