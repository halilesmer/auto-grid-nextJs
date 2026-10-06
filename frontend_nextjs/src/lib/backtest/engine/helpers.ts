/**
 * Preis-/Lot-Normierung, Marktpreis und Zeitrahmen.
 * Quelle: worker_python/src/core/grid_helpers.py (normalize_price, normalize_volume,
 * get_current_market_price, get_mt5_timeframe) und die Python-Lesart von Zonen-Wörterbüchern.
 */
import { pyRound } from './pyRound';
import { snapVolume } from './tradeUtils';
import type { Broker, SymbolInfo, Timeframe, ZoneDict } from './types';
import { TF_SECONDS } from './types';

export type SymbolInfos = Record<string, SymbolInfo | undefined>;

/** zone.get(key, fallback): Standardwert nur, wenn der Schlüssel fehlt */
export function zget(zone: ZoneDict, key: string, fallback: unknown): unknown {
  return key in zone ? zone[key] : fallback;
}

/** Python float(x) */
export function pyFloat(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/** Python int(x): Richtung 0 abschneiden */
export function pyInt(value: unknown): number {
  return Math.trunc(pyFloat(value));
}

/** Python str(x).lower() != "false" (is_active) */
export function isEnabled(zone: ZoneDict): boolean {
  return String(zget(zone, 'is_active', true)).toLowerCase() !== 'false';
}

export function normalizePrice(price: number, symbol: string, infos: SymbolInfos): number {
  const info = infos[symbol];
  if (!info) return pyRound(price, 2);
  if (info.point === 0) return price;
  return pyRound(pyRound(price / info.point) * info.point, info.digits);
}

export function normalizeVolume(volume: number, symbol: string, infos: SymbolInfos): number {
  const info = infos[symbol];
  return info ? snapVolume(volume, info) : volume;
}

/** BUY → Ask, SELL → Bid */
export function getCurrentMarketPrice(broker: Broker, symbol: string, direction: 'BUY' | 'SELL'): number | null {
  if (!symbol) return null;
  const tick = broker.symbolInfoTick(symbol);
  if (!tick) return null;
  return direction === 'BUY' ? tick.ask : tick.bid;
}

/** Unbekannter Name → M15 (wie get_mt5_timeframe) */
export function toTimeframe(name: unknown): Timeframe {
  return typeof name === 'string' && name in TF_SECONDS ? (name as Timeframe) : 'M15';
}
