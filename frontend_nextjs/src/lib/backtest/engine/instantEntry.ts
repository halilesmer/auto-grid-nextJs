/**
 * Sofort-Einstieg (`instant_entry`): ohne offene Position einer Seite sofort eine Marktorder.
 * Quelle: worker_python/src/core/grid_execution/instant_entry.py.
 */
import type { ZoneConfig } from './config';
import { getCurrentMarketPrice, normalizePrice, normalizeVolume, type SymbolInfos } from './gridHelpers';
import { MAX_DEVIATION } from './gridOrders';
import { MT5, type Position, type TradeRequest } from './mt5';
import type { EngineContext } from './state';
import { safeSendOrder } from './tradeUtils';
import { zoneNumber } from './zoneMagic';

/** Nach einer abgelehnten oder noch nicht sichtbaren Order nicht in jedem Durchlauf neu senden */
export const RETRY_SECONDS = 30.0;

export function openInstantPositions(
  ctx: EngineContext,
  config: ZoneConfig,
  zoneIdx: number,
  robotPositions: Position[],
  currentAvgPrice: number,
  symbolInfos: SymbolInfos,
): number {
  if (!config.instantEntry) return 0;
  if (!(config.minPrice <= currentAvgPrice && currentAvgPrice <= config.maxPrice)) return 0;

  const zonePositions = robotPositions.filter((p) => p.magic === config.targetMagic);
  let opened = 0;
  for (const side of ['BUY', 'SELL'] as const) {
    if (config.orderType !== side && config.orderType !== 'BOTH') continue;
    if (zonePositions.length + opened >= config.maxPositions) break;
    const isBuy = side === 'BUY';
    const posType = isBuy ? MT5.POSITION_TYPE_BUY : MT5.POSITION_TYPE_SELL;
    const key = `${zoneIdx}|${side}`;
    if (zonePositions.some((p) => p.type === posType)) {
      // Position sichtbar: Bremse weg, nach TP sofort neu einsteigen
      ctx.state.instantEntrySent.delete(key);
      continue;
    }
    const last = ctx.state.instantEntrySent.get(key);
    if (last !== undefined && ctx.now() - last < RETRY_SECONDS) continue;

    const price = getCurrentMarketPrice(ctx, config.symbol, side);
    if (price === null) continue;
    const lot = isBuy ? config.lotSize : config.sellLotSize;
    const tp = isBuy ? config.takeProfit : config.sellTakeProfit;
    const sl = isBuy ? config.stopLoss : config.sellStopLoss;
    const sign = isBuy ? 1 : -1;
    const request: TradeRequest = {
      action: MT5.TRADE_ACTION_DEAL,
      symbol: config.symbol,
      volume: normalizeVolume(lot, config.symbol, symbolInfos),
      type: isBuy ? MT5.ORDER_TYPE_BUY : MT5.ORDER_TYPE_SELL,
      price,
      deviation: MAX_DEVIATION,
      magic: config.targetMagic,
      comment: `AutoGrid_Z${zoneNumber(config.targetMagic)}_Start`,
      type_time: MT5.ORDER_TIME_GTC,
      type_filling: ctx.state.fillingMode.get(config.symbol) ?? MT5.ORDER_FILLING_IOC,
      tp: tp > 0 ? normalizePrice(price + sign * tp, config.symbol, symbolInfos) : 0,
    };
    if (sl > 0) request.sl = normalizePrice(price - sign * sl, config.symbol, symbolInfos);

    ctx.state.instantEntrySent.set(key, ctx.now());
    if (safeSendOrder(ctx, request)) {
      opened += 1;
      ctx.log(`🚀 Anında Giriş: Bölge ${zoneIdx + 1} | ${side} ${request.volume} lot @ ${price} açıldı.`);
    }
  }
  return opened;
}
