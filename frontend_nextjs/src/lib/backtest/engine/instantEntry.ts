/**
 * Sofort-Einstieg (`instant_entry`): ohne offene Position einer Seite sofort eine Markt-Position;
 * 30 s Bremse gegen wiederholtes Senden. Danach baut levels.ts das Grid ab dieser Position.
 * Quelle: worker_python/src/core/grid_execution/instant_entry.py (open_instant_positions).
 */
import type { ZoneConfig } from './config';
import { getCurrentMarketPrice, normalizePrice, normalizeVolume, type SymbolInfos } from './helpers';
import { MAX_DEVIATION } from './orders';
import type { EngineState } from './state';
import { safeSendOrder } from './tradeUtils';
import {
  ORDER_FILLING_IOC,
  ORDER_TIME_GTC,
  ORDER_TYPE_BUY,
  ORDER_TYPE_SELL,
  POSITION_TYPE_BUY,
  POSITION_TYPE_SELL,
  TRADE_ACTION_DEAL,
  type Broker,
  type Position,
  type TradeRequest,
} from './types';
import { zoneNumber } from './zoneMagic';

export const RETRY_SECONDS = 30.0;

export function openInstantPositions(
  broker: Broker,
  config: ZoneConfig,
  zoneIdx: number,
  robotPositions: Position[],
  currentAvgPrice: number,
  infos: SymbolInfos,
  state: EngineState,
): number {
  if (!config.instantEntry) return 0;
  // Kurs außerhalb der Zone (Rückfall auf die erste Zone des Symbols): keine Position
  if (!(config.minPrice <= currentAvgPrice && currentAvgPrice <= config.maxPrice)) return 0;

  const zonePositions = robotPositions.filter((p) => p.magic === config.targetMagic);
  let opened = 0;
  for (const side of ['BUY', 'SELL'] as const) {
    if (config.orderType !== side && config.orderType !== 'BOTH') continue;
    if (zonePositions.length + opened >= config.maxPositions) break;
    const isBuy = side === 'BUY';
    const posType = isBuy ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
    const key = `${zoneIdx}|${side}`;
    if (zonePositions.some((p) => p.type === posType)) {
      // Position sichtbar: Bremse aus, nach dem TP darf sofort neu eröffnet werden
      state.instantEntrySent.delete(key);
      continue;
    }
    const last = state.instantEntrySent.get(key);
    if (last !== undefined && state.now() - last < RETRY_SECONDS) continue;

    const price = getCurrentMarketPrice(broker, config.symbol, side);
    if (price === null) continue;
    const lot = isBuy ? config.lotSize : config.sellLotSize;
    const tp = isBuy ? config.takeProfit : config.sellTakeProfit;
    const sl = isBuy ? config.stopLoss : config.sellStopLoss;
    const sign = isBuy ? 1 : -1;
    const request: TradeRequest = {
      action: TRADE_ACTION_DEAL,
      symbol: config.symbol,
      volume: normalizeVolume(lot, config.symbol, infos),
      type: isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,
      price,
      deviation: MAX_DEVIATION,
      magic: config.targetMagic,
      comment: `AutoGrid_Z${zoneNumber(config.targetMagic)}_Start`,
      type_time: ORDER_TIME_GTC,
      type_filling: ORDER_FILLING_IOC,
      tp: tp > 0 ? normalizePrice(price + sign * tp, config.symbol, infos) : 0,
    };
    if (sl > 0) request.sl = normalizePrice(price - sign * sl, config.symbol, infos);

    state.instantEntrySent.set(key, state.now());
    if (safeSendOrder(broker, request, state)) {
      opened += 1;
      state.log('INFO', 'grid.instantEntry', { zone: zoneIdx + 1, side, volume: request.volume, price });
    }
  }
  return opened;
}
