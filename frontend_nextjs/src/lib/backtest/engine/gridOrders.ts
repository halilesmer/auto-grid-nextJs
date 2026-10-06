/**
 * Einziges Order-/Positions-Gateway der Engine (magic-basiert).
 * Quelle: worker_python/src/core/grid_orders.py.
 */
import { normalizePrice, normalizeVolume, getCurrentMarketPrice, type SymbolInfos } from './gridHelpers';
import { BUY_ORDER_TYPES, MT5, type Order, type Position, type TradeRequest } from './mt5';
import { pyRound } from './pyRound';
import type { EngineContext } from './state';
import { safeSendOrder } from './tradeUtils';
import { BASE_MAGIC_NUMBER, zoneNumber } from './zoneMagic';

export const MAX_DEVIATION = 20;

const isRobotMagic = (magic: number) => BASE_MAGIC_NUMBER <= magic && magic < BASE_MAGIC_NUMBER + 1000;

export function getAllRobotOrders(ctx: EngineContext): Order[] | null {
  const orders = ctx.mt5.ordersGet();
  return orders === null ? null : orders.filter((o) => isRobotMagic(o.magic));
}

export function getAllRobotPositions(ctx: EngineContext): Position[] | null {
  const positions = ctx.mt5.positionsGet();
  return positions === null ? null : positions.filter((p) => isRobotMagic(p.magic));
}

export function getAllManualPositions(ctx: EngineContext): Position[] | null {
  const positions = ctx.mt5.positionsGet();
  return positions === null ? null : positions.filter((p) => !isRobotMagic(p.magic));
}

/**
 * Belegte Stufen je Richtung (Orders, Bot- und manuelle Positionen).
 * snap=false: nicht auf das feste Raster runden (an Positionen verankertes Grid, levels.ts).
 */
export function getExistingLevelsByDirection(
  ctx: EngineContext,
  buyGridStep: number,
  sellGridStep: number,
  symbol: string,
  symbolInfos: SymbolInfos,
  snap = true,
): [Set<number>, Set<number>] {
  const buyLevels = new Set<number>();
  const sellLevels = new Set<number>();
  const add = (price: number, isBuy: boolean, itemSymbol: string) => {
    if (itemSymbol !== symbol) return;
    const step = isBuy ? buyGridStep : sellGridStep;
    const snapped = snap ? pyRound(price / step) * step : price;
    (isBuy ? buyLevels : sellLevels).add(normalizePrice(snapped, symbol, symbolInfos));
  };
  const orders = getAllRobotOrders(ctx);
  const robotPositions = getAllRobotPositions(ctx);
  const manualPositions = getAllManualPositions(ctx);
  for (const o of orders ?? []) add(o.price_open, BUY_ORDER_TYPES.includes(o.type), o.symbol);
  for (const p of robotPositions ?? []) add(p.price_open, p.type === MT5.POSITION_TYPE_BUY, p.symbol);
  for (const p of manualPositions ?? []) add(p.price_open, p.type === MT5.POSITION_TYPE_BUY, p.symbol);
  return [buyLevels, sellLevels];
}

/** Erstes Volumen der Order, die die Position eröffnet hat (volume_initial); null wenn unbekannt */
export function getOpeningOrderVolume(ctx: EngineContext, position: Position): number | null {
  const ident = position.identifier || position.ticket;
  const cached = ctx.state.openingVolumes.get(ident);
  if (cached !== undefined) return cached;
  const orders = ctx.mt5.historyOrdersGet(ident);
  if (!orders.length) return null;
  const volume = Number(orders[0].volume_initial || 0);
  if (volume <= 0) return null;
  ctx.state.openingVolumes.set(ident, volume);
  return volume;
}

/** Fehlendes Lot einer teilgefüllten Stufe (0 = voll, unbekannt oder unter volume_min) */
export function remainingLotAtLevel(
  ctx: EngineContext,
  positionsAtLevel: Position[],
  symbol: string,
  symbolInfos: SymbolInfos,
): number {
  if (!positionsAtLevel.length) return 0;
  const initial = positionsAtLevel.map((p) => getOpeningOrderVolume(ctx, p)).filter((v): v is number => !!v);
  if (!initial.length) return 0;
  const remaining = pyRound(Math.max(...initial) - positionsAtLevel.reduce((s, p) => s + Number(p.volume), 0), 8);
  const info = symbolInfos[symbol];
  const volMin = info !== undefined ? Number(info.volume_min || 0.01) : 0.01;
  if (remaining < volMin - 1e-9) return 0;
  return normalizeVolume(remaining, symbol, symbolInfos);
}

// Setup 1: AutoGrid_Z{n}_F{U|D}{Zeit}, Setup k ≥ 2: AutoGrid_Z{n}_F{k}{U|D}{Zeit}
const FRACTAL_COMMENT_RE = /^AutoGrid_Z\d+_F(\d*)([UD])(\d+)$/;

export function parseFractalComment(comment: string | null | undefined): [number, string, number] | null {
  const m = FRACTAL_COMMENT_RE.exec(String(comment ?? ''));
  if (!m) return null;
  return [m[1] ? Number(m[1]) : 1, m[2], Number(m[3])];
}

export function cancelOrder(ctx: EngineContext, order: Order): boolean {
  const ok = safeSendOrder(ctx, { action: MT5.TRADE_ACTION_REMOVE, order: order.ticket, symbol: order.symbol });
  if (ok) {
    ctx.state.placedOrders.delete(order.ticket);
    if (parseFractalComment(order.comment)) ctx.state.fractalOwnCancels.add(order.ticket);
  }
  return ok;
}

export function modifyPositionTpSl(
  ctx: EngineContext,
  position: Position,
  tpPrice: number,
  slPrice: number | null,
  symbolInfos: SymbolInfos,
): boolean {
  const symbol = position.symbol;
  return safeSendOrder(ctx, {
    action: MT5.TRADE_ACTION_SLTP,
    position: position.ticket,
    symbol,
    tp: tpPrice ? normalizePrice(tpPrice, symbol, symbolInfos) : 0,
    sl: slPrice !== null && slPrice > 0 ? normalizePrice(slPrice, symbol, symbolInfos) : 0,
  });
}

export function sendPendingOrderHelper(
  ctx: EngineContext,
  price: number,
  lot: number,
  tpPrice: number | null,
  slPrice: number | null,
  zoneIdx: number,
  direction: 'BUY' | 'SELL',
  symbol: string,
  symbolInfos: SymbolInfos,
  consecutiveErrors: Map<number, number>,
  activeZonesState: Map<number, string>,
  comment: string | null = null,
  magic: number | null = null,
): boolean {
  const magicNo = magic ?? BASE_MAGIC_NUMBER + zoneIdx + 1;
  if (!symbol) {
    ctx.log(`🚨 Hata: Bölge ${zoneIdx + 1} için geçerli bir sembol atanmamış!`, 'ERROR');
    return false;
  }
  const currentPrice = getCurrentMarketPrice(ctx, symbol, direction);
  if (currentPrice === null) return false;

  let orderType: number;
  if (direction === 'BUY') orderType = price < currentPrice ? MT5.ORDER_TYPE_BUY_LIMIT : MT5.ORDER_TYPE_BUY_STOP;
  else orderType = price > currentPrice ? MT5.ORDER_TYPE_SELL_LIMIT : MT5.ORDER_TYPE_SELL_STOP;

  const request: TradeRequest = {
    action: MT5.TRADE_ACTION_PENDING,
    symbol,
    volume: normalizeVolume(lot, symbol, symbolInfos),
    type: orderType,
    price: normalizePrice(price, symbol, symbolInfos),
    deviation: MAX_DEVIATION,
    magic: magicNo,
    comment: comment || `AutoGrid_Z${zoneNumber(magicNo)}`,
    type_time: MT5.ORDER_TIME_GTC,
    type_filling: MT5.ORDER_FILLING_RETURN,
    tp: tpPrice ? normalizePrice(tpPrice, symbol, symbolInfos) : 0,
  };
  if (slPrice !== null && slPrice > 0) request.sl = normalizePrice(slPrice, symbol, symbolInfos);

  ctx.state.lastOrderTicket = 0;
  if (!safeSendOrder(ctx, request)) {
    const errors = (consecutiveErrors.get(zoneIdx) ?? 0) + 1;
    consecutiveErrors.set(zoneIdx, errors);
    if (errors >= 3) {
      const lastErr = ctx.state.lastErrorMessage || 'Bilinmeyen Hata';
      ctx.log(
        `🚨 DİKKAT: Bölge ${zoneIdx + 1} için üst üste ${errors} işlem reddedildi! (Detay: ${lastErr}). Bölge güvenliğe alınıyor.`,
        'ERROR',
      );
      pauseZoneForSafety(ctx, zoneIdx, activeZonesState);
      consecutiveErrors.set(zoneIdx, 0);
    }
    return false;
  }
  if (consecutiveErrors.has(zoneIdx)) consecutiveErrors.set(zoneIdx, 0);
  if (ctx.state.lastOrderTicket) {
    ctx.state.placedOrders.set(ctx.state.lastOrderTicket, [magicNo, ctx.now(), request.price!]);
  }
  return true;
}

/** Zone auf PAUSE (ui_state + Motorzustand): keine neuen Orders, Positionen bleiben */
export function pauseZoneForSafety(ctx: EngineContext, zoneIdx: number, activeZonesState: Map<number, string>) {
  ctx.state.uiStates = { ...(ctx.state.uiStates ?? {}), [String(zoneIdx)]: 'PAUSE' };
  activeZonesState.set(zoneIdx, 'PAUSE');
}
