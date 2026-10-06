/**
 * Lot-Regeln und zentraler Order-Versand. Quelle: worker_python/src/utils/trade_utils.py
 * (snap_volume, normalize_volume, enforce_stops_level, safe_send_order).
 */
import { MT5, type SymbolInfo, type TradeRequest } from './mt5';
import { pyRound } from './pyRound';
import type { EngineContext, LogFn } from './state';

type InfoLike = SymbolInfo | Record<string, unknown> | null | undefined;

function infoValue(info: InfoLike, names: string[], def: number): number {
  for (const name of names) {
    const value = info ? (info as Record<string, unknown>)[name] : undefined;
    if (value) return Number(value);
  }
  return def;
}

/** f"{x:.10f}".rstrip("0") → Anzahl Nachkommastellen */
function decimals(x: number): number {
  const text = x.toFixed(10).replace(/0+$/, '');
  return text.includes('.') ? text.split('.')[1].length : 0;
}

/** snap_volume: Lot auf volume_min/volume_max/volume_step des Symbols */
export function snapVolume(volume: unknown, info: InfoLike): number {
  let v: number;
  if (typeof volume === 'number') v = volume;
  else if (typeof volume === 'boolean') v = volume ? 1 : 0;
  else if (typeof volume === 'string' && volume.trim() !== '') v = Number(volume);
  else v = NaN;
  if (!Number.isFinite(v)) v = 0;
  const volMin = infoValue(info, ['volume_min', 'vol_min'], 0.01);
  const volMax = Math.max(infoValue(info, ['volume_max', 'vol_max'], Infinity), volMin);
  const volStep = infoValue(info, ['volume_step', 'vol_step'], 0);

  v = Math.max(volMin, Math.min(v, volMax));
  if (volStep <= 0) return pyRound(v, Math.max(2, decimals(volMin)));
  let steps = pyRound((v - volMin) / volStep + 1e-9);
  while (steps > 0 && volMin + steps * volStep > volMax + 1e-9) steps -= 1;
  return pyRound(volMin + steps * volStep, Math.max(decimals(volStep), decimals(volMin)));
}

/** normalize_volume(mt5, symbol, volume) */
export function normalizeVolumeMt5(ctx: EngineContext, symbol: string, volume: number): number {
  const info = ctx.mt5.symbolInfo(symbol);
  if (info === null) return Number(volume);
  return snapVolume(volume, info);
}

function formatRequestPrices(req: TradeRequest): string {
  const parts: string[] = [];
  if (req.price !== undefined && req.price > 0) parts.push(`Fiyat: ${req.price}`);
  if (req.tp !== undefined && req.tp > 0) parts.push(`TP: ${req.tp}`);
  if (req.sl !== undefined && req.sl > 0) parts.push(`SL: ${req.sl}`);
  return parts.length ? parts.join(', ') : 'Fiyat Belirtilmedi';
}

/** enforce_stops_level: TP/SL mindestens stops_level vom Preis entfernt */
export function enforceStopsLevel(ctx: EngineContext, req: TradeRequest): TradeRequest {
  const symbol = req.symbol;
  if (!symbol) return req;
  const info = ctx.mt5.symbolInfo(symbol);
  if (!info) return req;
  const minDist = (info.trade_stops_level ?? 0) * (info.point ?? 0.00001);
  const digits = info.digits ?? 5;
  if (minDist <= 0) return req;

  if (req.action === MT5.TRADE_ACTION_SLTP) {
    const positions = req.position ? ctx.mt5.positionsGet(req.position) : null;
    const tick = positions && positions.length ? ctx.mt5.symbolInfoTick(symbol) : null;
    if (positions && positions.length && tick) {
      const pos = positions[0];
      if (pos.type === MT5.POSITION_TYPE_BUY) {
        const ref = tick.bid;
        if ((req.tp ?? 0) > 0 && req.tp! < ref + minDist) req.tp = pyRound(ref + minDist, digits);
        if ((req.sl ?? 0) > 0 && req.sl! > ref - minDist) req.sl = pyRound(ref - minDist, digits);
      } else if (pos.type === MT5.POSITION_TYPE_SELL) {
        const ref = tick.ask;
        if ((req.tp ?? 0) > 0 && req.tp! > ref - minDist) req.tp = pyRound(ref - minDist, digits);
        if ((req.sl ?? 0) > 0 && req.sl! < ref + minDist) req.sl = pyRound(ref + minDist, digits);
      }
    }
  } else if (req.action === MT5.TRADE_ACTION_PENDING) {
    const price = req.price ?? 0;
    if (req.type === MT5.ORDER_TYPE_BUY_LIMIT || req.type === MT5.ORDER_TYPE_BUY_STOP) {
      if ((req.tp ?? 0) > 0 && req.tp! < price + minDist) req.tp = pyRound(price + minDist, digits);
      if ((req.sl ?? 0) > 0 && req.sl! > price - minDist) req.sl = pyRound(price - minDist, digits);
    } else if (req.type === MT5.ORDER_TYPE_SELL_LIMIT || req.type === MT5.ORDER_TYPE_SELL_STOP) {
      if ((req.tp ?? 0) > 0 && req.tp! > price - minDist) req.tp = pyRound(price - minDist, digits);
      if ((req.sl ?? 0) > 0 && req.sl! < price + minDist) req.sl = pyRound(price + minDist, digits);
    }
  }
  return req;
}

/** safe_send_order: Lot säubern, stops_level, order_check, order_send, stille Ablehnung erkennen */
export function safeSendOrder(ctx: EngineContext, request: TradeRequest, log: LogFn = ctx.log): boolean {
  const { mt5, state } = ctx;
  try {
    if (request.volume !== undefined && request.symbol !== undefined) {
      request.volume = normalizeVolumeMt5(ctx, request.symbol, request.volume);
    }
    request = enforceStopsLevel(ctx, request);

    if (request.action === MT5.TRADE_ACTION_PENDING || request.action === MT5.TRADE_ACTION_DEAL) {
      const check = mt5.orderCheck(request);
      if (check === null || check.retcode !== 0) {
        const retcode = check ? check.retcode : -1;
        if (retcode === 10027) {
          state.algoTradingDisabled = true;
          state.lastErrorMessage = 'Algo Trading kapalı!';
        }
        log(`❌ MT5 Check Hatası! Kodu: ${retcode} | ${formatRequestPrices(request)}`, 'ERROR');
        return false;
      }
    }

    const result = mt5.orderSend(request);
    if (result === null) {
      const lastErr = mt5.lastError();
      state.lastErrorMessage = `MT5 Terminal Yanıt Vermedi: ${lastErr}`;
      log(`❌ MT5 Request başarısız (None): ${lastErr}`, 'ERROR');
      return false;
    }
    if (result.retcode !== MT5.TRADE_RETCODE_DONE) {
      if (result.retcode === 10027) {
        state.algoTradingDisabled = true;
        state.lastErrorMessage = 'Algo Trading kapalı!';
      } else {
        state.lastErrorMessage = `Reddedildi: ${result.retcode} - ${result.comment}`;
      }
      log(
        `🔴 MT5 EMİR REDDİ (${result.retcode}): ${result.comment} | Seviye Fiyatı: ${formatRequestPrices(request)}`,
        'ERROR',
      );
      return false;
    }

    if (request.action === MT5.TRADE_ACTION_PENDING && result.order) {
      const board = mt5.ordersGet(result.order);
      if (!board || board.length === 0) {
        state.lastErrorMessage = 'SESSIZ RET: Emir gonderildi ama Broker tahtadan sildi!';
        log(`🚨 ALARM: Broker emri (Bilet: ${result.order}) sessizce iptal etti!`, 'ERROR');
        return false;
      }
      state.lastOrderTicket = result.order;
    }

    state.algoTradingDisabled = false;
    state.lastErrorMessage = '';
    return true;
  } catch (e) {
    state.lastErrorMessage = `Kritik Hata: ${String(e)}`;
    log(`💥 MT5 Request Exception: ${String(e)}`, 'ERROR');
    return false;
  }
}
