/**
 * Preis-/Lot-Normierung und Kursabfrage. Quelle: worker_python/src/core/grid_helpers.py
 * (normalize_price, normalize_volume, get_current_market_price, get_mt5_timeframe).
 */
import { MT5, type SymbolInfo } from './mt5';
import { pyRound } from './pyRound';
import type { EngineContext } from './state';
import { snapVolume } from './tradeUtils';

export type SymbolInfos = Record<string, SymbolInfo | undefined>;

export function normalizePrice(price: number, symbol: string, symbolInfos: SymbolInfos): number {
  const info = symbolInfos[symbol];
  if (info === undefined) return pyRound(price, 2);
  const point = info.point;
  if (point === 0) return price;
  return pyRound(pyRound(price / point) * point, info.digits);
}

export function normalizeVolume(volume: number, symbol: string, symbolInfos: SymbolInfos): number {
  const info = symbolInfos[symbol];
  if (info === undefined) return volume;
  return snapVolume(volume, info);
}

/** BUY → Ask, SELL → Bid; null ohne Kurs */
export function getCurrentMarketPrice(ctx: EngineContext, symbol: string, direction: 'BUY' | 'SELL' = 'BUY'): number | null {
  if (!symbol) return null;
  const tick = ctx.mt5.symbolInfoTick(symbol);
  if (tick === null) return null;
  return direction === 'BUY' ? tick.ask : tick.bid;
}

const TIMEFRAMES: Record<string, number> = {
  M1: MT5.TIMEFRAME_M1,
  M5: MT5.TIMEFRAME_M5,
  M15: MT5.TIMEFRAME_M15,
  M30: MT5.TIMEFRAME_M30,
  H1: MT5.TIMEFRAME_H1,
  H4: MT5.TIMEFRAME_H4,
  D1: MT5.TIMEFRAME_D1,
};

export function getMt5Timeframe(tf: unknown): number {
  return TIMEFRAMES[String(tf)] ?? MT5.TIMEFRAME_M15;
}

/** zone_log_id: Zonen-id oder "idx<n>" */
export function zoneLogId(zone: Record<string, unknown> | null | undefined, idx: number): string {
  const id = zone?.id;
  return id ? String(id) : `idx${idx}`;
}
