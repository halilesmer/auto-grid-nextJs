/**
 * Welche Zone ist aktiv, hat der Kurs sie verlassen?
 * Quelle: worker_python/src/core/grid_zone_selector.py (is_zone_exited, zone_symbol_of,
 * get_active_zone, detect_zone_entry).
 */
import { getCurrentMarketPrice, isEnabled, pyFloat, toTimeframe, zget } from './helpers';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import type { Broker, ZoneDict } from './types';

export function zoneSymbolOf(zone: ZoneDict): string {
  return String(zget(zone, 'symbol', '')).toUpperCase().trim();
}

/** Schlusskurs der letzten geschlossenen Kerze des Ausstiegs-Zeitrahmens; ohne Kerze `fallback` */
export function closedCandleClose(broker: Broker, zone: ZoneDict, symbol: string, fallback: number): number {
  const rates = broker.copyRatesFromPos(symbol, toTimeframe(zget(zone, 'exit_timeframe', 'M15')), 1, 1);
  return rates && rates.length > 0 ? rates[0].close : fallback;
}

function inRange(zone: ZoneDict, price: number): boolean {
  const zMin = pyRound(pyFloat(zget(zone, 'min_price', 0)), 5);
  const zMax = pyRound(pyFloat(zget(zone, 'max_price', 0)), 5);
  const p = pyRound(price, 5);
  return zMin <= p && p <= zMax;
}

export function isZoneExited(broker: Broker, zone: ZoneDict, currentAvgPrice: number, symbol: string): boolean {
  if (zget(zone, 'exit_condition', 'Anlık Fiyat') === 'Anlık Fiyat') return !inRange(zone, currentAvgPrice);
  return !inRange(zone, closedCandleClose(broker, zone, symbol, currentAvgPrice));
}

/** Erste aktive Zone (des Symbols), die den Kurs enthält; Index bezogen auf die ganze Liste */
export function getActiveZone(broker: Broker, zones: readonly ZoneDict[], symbol: string | null): [ZoneDict, number] | null {
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (!isEnabled(zone)) continue;
    const sym = zoneSymbolOf(zone);
    if (!sym || (symbol !== null && sym !== symbol)) continue;
    const bid = getCurrentMarketPrice(broker, sym, 'SELL');
    const ask = getCurrentMarketPrice(broker, sym, 'BUY');
    if (bid === null || ask === null) continue;
    const tickPrice = (bid + ask) / 2.0;
    const price = zget(zone, 'exit_condition', 'Anlık Fiyat') === 'Anlık Fiyat' ? tickPrice : closedCandleClose(broker, zone, sym, tickPrice);
    if (inRange(zone, price)) return [zone, i];
  }
  return null;
}

export function detectZoneEntry(
  broker: Broker,
  zones: readonly ZoneDict[],
  activeZone: ZoneDict | null,
  activeIdx: number | null,
  symbol: string | null,
  state: EngineState,
): [ZoneDict | null, number | null] {
  if (activeZone !== null) return [activeZone, activeIdx];
  const found = getActiveZone(broker, zones, symbol);
  if (found) {
    state.log('INFO', 'zone.entered', { zone: found[1] + 1, symbol: zoneSymbolOf(found[0]) });
    return found;
  }
  return [null, null];
}
