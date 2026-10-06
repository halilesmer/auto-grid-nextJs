/**
 * Zombie-Orders, TP/SL-Abgleich offener Positionen, Teilfüllungen, Zonen-Ausstieg.
 * Quelle: worker_python/src/core/grid_order_manager.py.
 */
import { extractZoneConfig, InvalidZoneConfigError, isFractalZone, maxPositionsOf } from './config';
import {
  cancelOrder,
  MAX_DEVIATION,
  modifyPositionTpSl,
  remainingLotAtLevel,
  sendPendingOrderHelper,
} from './gridOrders';
import { normalizePrice, type SymbolInfos } from './gridHelpers';
import { BUY_ORDER_TYPES, MT5, SELL_ORDER_TYPES, type Order, type Position } from './mt5';
import { pyRound } from './pyRound';
import { isEnabled, pyBool, pyFloat, pyGet, type EngineContext } from './state';
import { safeSendOrder } from './tradeUtils';
import { STOPPED_ZONE_STATES } from './zoneState';
import { zoneIndexByMagic, zoneMagic, type Zone } from './zoneMagic';

const zoneSymbol = (zone: Zone) => String(pyGet(zone, 'symbol', '')).toUpperCase().trim();

export function cleanZombieOrders(
  ctx: EngineContext,
  robotOrders: Order[],
  zones: Zone[],
  activeZonesState: Map<number, string>,
) {
  const indexByMagic = zoneIndexByMagic(zones);
  for (const order of robotOrders) {
    const idx = indexByMagic.get(order.magic) ?? -1;
    let active = false;
    let sym = '';
    if (idx >= 0 && idx < zones.length) {
      active = isEnabled(zones[idx]);
      sym = zoneSymbol(zones[idx]);
    }
    if (STOPPED_ZONE_STATES.includes(activeZonesState.get(idx) ?? '')) active = false;
    if (!active || (sym && order.symbol !== sym)) {
      const dir = BUY_ORDER_TYPES.includes(order.type) ? 'BUY' : 'SELL';
      const label = idx >= 0 ? String(idx + 1) : `(silinmiş, magic ${order.magic})`;
      ctx.log(`🧹 Mutlak Temizlik: Bölge ${label} pasif/uyumsuz olduğu için ${dir} emri iptal ediliyor. (Bilet: ${order.ticket}, Sembol: ${order.symbol})`);
      cancelOrder(ctx, order);
    }
  }
}

/** Neuer TP/SL auf der falschen Seite des Kurses (MT5 würde 10016 melden)? */
function tpslOnWrongSide(ctx: EngineContext, direction: string, tp: number, sl: number, symbol: string, symbolInfos: SymbolInfos): boolean {
  const tick = ctx.mt5.symbolInfoTick(symbol);
  if (tick === null) return false;
  const info = symbolInfos[symbol];
  const stops = info !== undefined ? Number(info.trade_stops_level || 0) * Number(info.point || 0) : 0;
  const eps = 1e-9;
  if (direction === 'BUY') {
    const bid = Number(tick.bid);
    return (tp > 0 && tp - bid < stops - eps) || (sl > 0 && bid - sl < stops - eps);
  }
  const ask = Number(tick.ask);
  return (tp > 0 && ask - tp < stops - eps) || (sl > 0 && sl - ask < stops - eps);
}

export function processPartialFillsAndTpsl(
  ctx: EngineContext,
  robotPositions: Position[],
  robotOrders: Order[],
  zones: Zone[],
  symbolInfos: SymbolInfos,
  activeZonesState: Map<number, string>,
  consecutiveErrors: Map<number, number>,
) {
  const { state } = ctx;
  const liveTickets = new Set(robotPositions.map((p) => p.ticket));
  const liveIds = new Set(robotPositions.map((p) => p.identifier || p.ticket));
  for (const t of [...state.tpslBlockedLogged.keys()]) if (!liveTickets.has(t)) state.tpslBlockedLogged.delete(t);
  for (const i of [...state.openingVolumes.keys()]) if (!liveIds.has(i)) state.openingVolumes.delete(i);

  const processed: [string, number][] = [];
  const indexByMagic = zoneIndexByMagic(zones);
  for (const pos of robotPositions) {
    const idx = indexByMagic.get(pos.magic) ?? -1;
    if (!(idx >= 0 && idx < zones.length)) continue;
    const zone = zones[idx];
    const sym = zoneSymbol(zone);
    if (!sym || pos.symbol !== sym) continue;
    if (isFractalZone(zone)) continue;

    const direction = pos.type === MT5.POSITION_TYPE_BUY ? 'BUY' : 'SELL';
    let cfg;
    try {
      cfg = extractZoneConfig(zone, idx, ctx.log, symbolInfos);
    } catch (e) {
      if (e instanceof InvalidZoneConfigError) continue;
      throw e;
    }
    const [tpVal, slVal] = direction === 'BUY' ? [cfg.takeProfit, cfg.stopLoss] : [cfg.sellTakeProfit, cfg.sellStopLoss];
    const norm = (p: number) => normalizePrice(p, sym, symbolInfos);
    const expectedTp = direction === 'BUY' ? norm(pos.price_open + tpVal) : norm(pos.price_open - tpVal);
    let expectedSl = 0;
    if (slVal > 0) expectedSl = direction === 'BUY' ? norm(pos.price_open - slVal) : norm(pos.price_open + slVal);

    const posTp = pos.tp || 0;
    const posSl = pos.sl || 0;
    if (Math.abs(posTp - expectedTp) > 0.00001 || Math.abs(posSl - expectedSl) > 0.00001) {
      if (tpslOnWrongSide(ctx, direction, expectedTp, expectedSl, sym, symbolInfos)) {
        const key = `${expectedTp}|${expectedSl}`;
        if (state.tpslBlockedLogged.get(pos.ticket) !== key) {
          state.tpslBlockedLogged.set(pos.ticket, key);
          ctx.log(`⏸️ TP/SL Bekliyor: Bölge ${idx + 1} | Bilet ${pos.ticket} için yeni TP ${expectedTp} fiyatın yanlış tarafında.`, 'WARN');
        }
      } else {
        state.tpslBlockedLogged.delete(pos.ticket);
        ctx.log(`🔄 Açık Pozisyon Güncellemesi: Bölge ${idx + 1} | Bilet ${pos.ticket} için yeni TP/SL ayarlanıyor.`);
        modifyPositionTpSl(ctx, pos, expectedTp, expectedSl, symbolInfos);
      }
    }

    const tolerance = pyRound((direction === 'BUY' ? cfg.gridStep : cfg.sellGridStep) * 0.4, 5);
    const near = (a: number, b: number) => Math.abs(pyRound(a, 5) - pyRound(b, 5)) <= tolerance;
    if (processed.some(([d, p]) => d === direction && near(pos.price_open, p))) continue;
    processed.push([direction, pos.price_open]);

    // Max-Positionen-Schutz (handler) löscht die Pending Orders der Zone in jedem Durchlauf
    const zonePositions = robotPositions.filter((p) => p.magic === pos.magic).length;
    if (zonePositions >= maxPositionsOf(zone)) continue;

    const atLevel = robotPositions.filter((p) => p.magic === pos.magic && p.type === pos.type && near(p.price_open, pos.price_open));
    const remaining = remainingLotAtLevel(ctx, atLevel, sym, symbolInfos);
    if (remaining <= 0) continue;

    const hasPending = robotOrders.some((o) => o.magic === pos.magic && near(o.price_open, pos.price_open));
    let zoneActive = isEnabled(zone);
    if (STOPPED_ZONE_STATES.includes(activeZonesState.get(idx) ?? '')) zoneActive = false;
    if (!hasPending && zoneActive) {
      ctx.log(`🔄 Kısmi Dolum: Bölge ${idx + 1} | Kalan ${remaining} lot (${direction}) emir gönderiliyor.`);
      sendPendingOrderHelper(ctx, pos.price_open, remaining, expectedTp, expectedSl > 0 ? expectedSl : null, idx,
        direction, sym, symbolInfos, consecutiveErrors, activeZonesState, null, pos.magic);
    }
  }
}

/**
 * Aufräumen beim Verlassen der Zone. true → Zone auf AUTO_CLEAR setzen (clear_on_exit),
 * false → clear_on_exit aus, Orders der Zone bleiben.
 */
export function handleZoneExit(
  ctx: EngineContext,
  activeZone: Zone,
  activeZoneIdx: number,
  robotOrders: Order[],
  robotPositions: Position[],
  currentAvgPrice: number,
  closePrice: number,
  exitCond: unknown,
): boolean {
  if (!pyBool(pyGet(activeZone, 'clear_on_exit', true))) return false;

  const zMin = pyFloat(pyGet(activeZone, 'min_price', 0));
  const zMax = pyFloat(pyGet(activeZone, 'max_price', 0));
  const ref = exitCond === 'Anlık Fiyat' ? currentAvgPrice : closePrice;
  const exitDir = ref > zMax ? 'BUY (Yukarı)' : 'SELL (Aşağı)';
  const trigger = pyGet(activeZone, 'clear_exit_side', 'Farketmez');
  if (trigger !== 'Farketmez' && trigger !== exitDir) {
    ctx.log(`ℹ️ Fiyat bölgeden çıktı (${exitDir}) ancak temizlik '${String(trigger)}' ayarlandığı için işlemler pas geçildi. Bölge pasif duruma alınıyor.`);
    return true;
  }

  const scope = String(pyGet(activeZone, 'clear_scope', 'Sadece Bekleyen Emirler'));
  const target = pyGet(activeZone, 'clear_target_side', 'Farketmez (Hepsi)');
  const targetMagic = zoneMagic(activeZone, activeZoneIdx);
  ctx.log(`🧹 Bölge (${zMin}-${zMax}) DIŞINA ÇIKILDI! (${exitDir}). Kapsam: ${scope} | Kapatılacak Yön: ${String(target)}`);

  let cancelled = 0;
  for (const order of robotOrders) {
    if (order.magic !== targetMagic) continue;
    if (
      target === 'Farketmez (Hepsi)' ||
      (target === 'Sadece BUY İşlemleri' && BUY_ORDER_TYPES.includes(order.type)) ||
      (target === 'Sadece SELL İşlemleri' && SELL_ORDER_TYPES.includes(order.type))
    ) {
      cancelOrder(ctx, order);
      cancelled += 1;
    }
  }
  ctx.log(`🧹 Toplam ${cancelled} adet bekleyen ${String(target)} emri temizlendi.`);

  // „Tüm İşlemler“ (UI); „Pozisyon“/„Tümü“/„Hepsi“ sind alte Werte
  if (['Tüm', 'Pozisyon', 'Hepsi'].some((k) => scope.includes(k))) {
    let closed = 0;
    for (const pos of robotPositions) {
      if (pos.magic !== targetMagic) continue;
      if (
        target === 'Farketmez (Hepsi)' ||
        (target === 'Sadece BUY İşlemleri' && pos.type === MT5.POSITION_TYPE_BUY) ||
        (target === 'Sadece SELL İşlemleri' && pos.type === MT5.POSITION_TYPE_SELL)
      ) {
        const tick = ctx.mt5.symbolInfoTick(pos.symbol);
        if (tick) {
          const isBuy = pos.type === MT5.POSITION_TYPE_BUY;
          safeSendOrder(ctx, {
            action: MT5.TRADE_ACTION_DEAL,
            position: pos.ticket,
            symbol: pos.symbol,
            volume: pos.volume,
            type: isBuy ? MT5.ORDER_TYPE_SELL : MT5.ORDER_TYPE_BUY,
            price: isBuy ? tick.bid : tick.ask,
            deviation: MAX_DEVIATION,
            magic: pos.magic,
            comment: 'Zone_Exit_Close',
            type_time: MT5.ORDER_TIME_GTC,
            type_filling: ctx.state.fillingMode.get(pos.symbol) ?? MT5.ORDER_FILLING_IOC,
          });
          closed += 1;
        }
      }
    }
    ctx.log(`💥 Toplam ${closed} adet ${String(target)} açık pozisyonu kapatıldı.`);
  }
  return true;
}
