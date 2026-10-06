/**
 * Aktive Zone je Symbol: Eintritt und Austritt. Quelle: worker_python/src/core/grid_zone_selector.py.
 */
import { getCurrentMarketPrice, getMt5Timeframe, zoneLogId } from './gridHelpers';
import type { Bar } from './mt5';
import { pyRound } from './pyRound';
import { isEnabled, pyFloat, pyGet, type EngineContext } from './state';
import type { Zone } from './zoneMagic';

export function zoneSymbolOf(zone: Zone): string {
  return String(pyGet(zone, 'symbol', '')).toUpperCase().trim();
}

/** Schlusskurs der letzten abgeschlossenen Kerze (Position 1) oder `fallback` */
export function lastClosedClose(ctx: EngineContext, symbol: string, tf: unknown, fallback: number): number {
  const rates: Bar[] | null = ctx.mt5.copyRatesFromPos(symbol, getMt5Timeframe(tf), 1, 1);
  return rates !== null && rates.length > 0 ? rates[0].close : fallback;
}

const inRange = (price: number, zMin: number, zMax: number) =>
  pyRound(zMin, 5) <= pyRound(price, 5) && pyRound(price, 5) <= pyRound(zMax, 5);

export function isZoneExited(ctx: EngineContext, zone: Zone, currentAvgPrice: number, symbol: string): boolean {
  const cond = pyGet(zone, 'exit_condition', 'Anlık Fiyat');
  const zMin = pyFloat(pyGet(zone, 'min_price', 0));
  const zMax = pyFloat(pyGet(zone, 'max_price', 0));
  if (cond === 'Anlık Fiyat') return !inRange(currentAvgPrice, zMin, zMax);
  const close = lastClosedClose(ctx, symbol, pyGet(zone, 'exit_timeframe', 'M15'), currentAvgPrice);
  return !inRange(close, zMin, zMax);
}

/** Erste aktive Zone, die den Kurs enthält (Indizes über die ganze Liste) */
export function getActiveZone(ctx: EngineContext, zones: Zone[], symbol: string | null): [Zone | null, number | null] {
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (!isEnabled(zone)) continue;
    const zSym = zoneSymbolOf(zone);
    if (!zSym || (symbol !== null && zSym !== symbol)) continue;
    const bid = getCurrentMarketPrice(ctx, zSym, 'SELL');
    const ask = getCurrentMarketPrice(ctx, zSym, 'BUY');
    if (bid === null || ask === null) continue;
    const tickPrice = (bid + ask) / 2.0;
    const zMin = pyFloat(pyGet(zone, 'min_price', 0));
    const zMax = pyFloat(pyGet(zone, 'max_price', 0));
    const cond = pyGet(zone, 'exit_condition', 'Anlık Fiyat');
    const price =
      cond === 'Anlık Fiyat' ? tickPrice : lastClosedClose(ctx, zSym, pyGet(zone, 'exit_timeframe', 'M15'), tickPrice);
    if (inRange(price, zMin, zMax)) return [zone, i];
  }
  return [null, null];
}

export function detectZoneEntry(
  ctx: EngineContext,
  zones: Zone[],
  activeZone: Zone | null,
  activeZoneIdx: number | null,
  symbol: string | null,
): [Zone | null, number | null] {
  if (activeZone !== null) return [activeZone, activeZoneIdx];
  const [zone, idx] = getActiveZone(ctx, zones, symbol);
  if (zone !== null && idx !== null) {
    ctx.log(
      `📍 Yeni Bölgeye Girildi: Bölge ${idx + 1} ${zoneSymbolOf(zone)} (${String(zone.min_price)}-${String(zone.max_price)}) [${zoneLogId(zone, idx)}]`,
    );
    return [zone, idx];
  }
  return [null, null];
}
