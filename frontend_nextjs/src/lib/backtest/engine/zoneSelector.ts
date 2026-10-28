/**
 * Welche Zone ist aktiv, hat der Kurs sie verlassen?
 * Quelle: worker_python/src/core/grid_zone_selector.py (is_zone_exited, zone_symbol_of,
 * zone_contains_price, detect_zone_entry).
 */
import { getCurrentMarketPrice, pyFloat, toTimeframe, zget } from './helpers';
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

/** Liegt der Kurs der Zone (Mittelkurs bzw. Schlusskurs der Ausstiegskerze) in ihrem Bereich? Ohne Tick: false */
export function zoneContainsPrice(broker: Broker, zone: ZoneDict): boolean {
  const sym = zoneSymbolOf(zone);
  const bid = getCurrentMarketPrice(broker, sym, 'SELL');
  const ask = getCurrentMarketPrice(broker, sym, 'BUY');
  if (bid === null || ask === null) return false;
  const tickPrice = (bid + ask) / 2.0;
  const price = zget(zone, 'exit_condition', 'Anlık Fiyat') === 'Anlık Fiyat' ? tickPrice : closedCandleClose(broker, zone, sym, tickPrice);
  return inRange(zone, price);
}

/** Einstieg einer Zone: schon eingetreten → true; sonst tritt sie ein, wenn sie den Kurs enthält (mit Log) */
export function detectZoneEntry(broker: Broker, zone: ZoneDict, idx: number, entered: boolean, state: EngineState): boolean {
  if (entered) return true;
  if (!zoneContainsPrice(broker, zone)) return false;
  state.log('INFO', 'zone.entered', { zone: idx + 1, symbol: zoneSymbolOf(zone) });
  return true;
}
