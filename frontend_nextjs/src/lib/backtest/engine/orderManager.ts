/**
 * Zombie-Bereinigung, TP/SL-Abgleich offener Positionen, Ergänzung von Teilfüllungen, Zonen-Ausstieg.
 * Quelle: worker_python/src/core/grid_order_manager.py (clean_zombie_orders, _tpsl_on_wrong_side,
 * process_partial_fills_and_tpsl, handle_zone_exit).
 */
import { extractZoneConfig, InvalidZoneConfigError, isFractalZone, maxPositionsOf } from './config';
import { isEnabled, normalizePrice, pyFloat, zget, type SymbolInfos } from './helpers';
import {
  cancelOrder,
  MAX_DEVIATION,
  modifyPositionTpSl,
  remainingLotAtLevel,
  sendPendingOrderHelper,
} from './orders';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import { safeSendOrder } from './tradeUtils';
import {
  BUY_ORDER_TYPES,
  ORDER_FILLING_IOC,
  ORDER_TIME_GTC,
  ORDER_TYPE_BUY,
  ORDER_TYPE_SELL,
  POSITION_TYPE_BUY,
  SELL_ORDER_TYPES,
  TRADE_ACTION_DEAL,
  type Broker,
  type Order,
  type Position,
  type ZoneDict,
} from './types';
import { zoneIndexByMagic, zoneMagic } from './zoneMagic';

const STOPPED = ['PAUSE', 'AUTO_CLEAR', 'CLEAR'];

function zoneSymbol(zone: ZoneDict): string {
  return String(zget(zone, 'symbol', '')).toUpperCase().trim();
}

/** Orders inaktiver/gestoppter/gelöschter Zonen oder mit falschem Symbol löschen (Zone über die Magic) */
export function cleanZombieOrders(broker: Broker, robotOrders: Order[], zones: readonly ZoneDict[], state: EngineState): void {
  const indexByMagic = zoneIndexByMagic(zones);
  for (const order of robotOrders) {
    const idx = indexByMagic.get(order.magic) ?? -1;
    let active = false;
    let sym = '';
    if (idx >= 0 && idx < zones.length) {
      active = isEnabled(zones[idx]);
      sym = zoneSymbol(zones[idx]);
    }
    if (STOPPED.includes(state.activeZonesState.get(idx) ?? '')) active = false;
    if (!active || (sym && order.symbol !== sym)) {
      state.log('INFO', 'zone.zombieOrderCancelled', { zone: idx >= 0 ? idx + 1 : null, magic: order.magic, ticket: order.ticket });
      cancelOrder(broker, order, state);
    }
  }
}

/** Liegt der neue TP/SL schon auf der falschen Seite des Kurses? (MT5 würde 10016 melden) */
function tpslOnWrongSide(broker: Broker, direction: 'BUY' | 'SELL', tp: number, sl: number, symbol: string, infos: SymbolInfos): boolean {
  const tick = broker.symbolInfoTick(symbol);
  if (!tick) return false;
  const info = infos[symbol];
  const stops = info ? (info.trade_stops_level || 0) * (info.point || 0) : 0;
  const eps = 1e-9;
  if (direction === 'BUY') {
    return (tp > 0 && tp - tick.bid < stops - eps) || (sl > 0 && tick.bid - sl < stops - eps);
  }
  return (tp > 0 && tick.ask - tp < stops - eps) || (sl > 0 && sl - tick.ask < stops - eps);
}

export function processPartialFillsAndTpsl(
  broker: Broker,
  robotPositions: Position[],
  robotOrders: Order[],
  zones: readonly ZoneDict[],
  infos: SymbolInfos,
  state: EngineState,
): void {
  const liveTickets = new Set(robotPositions.map((p) => p.ticket));
  const liveIds = new Set(robotPositions.map((p) => p.identifier || p.ticket));
  for (const ticket of [...state.tpslBlockedLogged.keys()]) if (!liveTickets.has(ticket)) state.tpslBlockedLogged.delete(ticket);
  for (const ident of [...state.openingVolumes.keys()]) if (!liveIds.has(ident)) state.openingVolumes.delete(ident);

  const processed: { direction: string; price: number }[] = [];
  const indexByMagic = zoneIndexByMagic(zones);
  for (const pos of robotPositions) {
    // Position einer gelöschten Zone bekommt nicht TP/SL einer anderen Zone
    const idx = indexByMagic.get(pos.magic) ?? -1;
    if (!(idx >= 0 && idx < zones.length)) continue;
    const zone = zones[idx];
    const sym = zoneSymbol(zone);
    if (!sym || pos.symbol !== sym) continue;
    // Fraktal: SL/TP stehen mit der Order fest; kein Abgleich, keine Ergänzung
    if (isFractalZone(zone)) continue;

    const direction = pos.type === POSITION_TYPE_BUY ? 'BUY' : 'SELL';
    let cfg;
    try {
      cfg = extractZoneConfig(zone, idx, infos, state);
    } catch (e) {
      if (e instanceof InvalidZoneConfigError) continue;
      throw e;
    }
    const tpVal = direction === 'BUY' ? cfg.takeProfit : cfg.sellTakeProfit;
    const slVal = direction === 'BUY' ? cfg.stopLoss : cfg.sellStopLoss;
    const sign = direction === 'BUY' ? 1 : -1;
    const expectedTp = normalizePrice(pos.price_open + sign * tpVal, sym, infos);
    const expectedSl = slVal > 0 ? normalizePrice(pos.price_open - sign * slVal, sym, infos) : 0;

    if (Math.abs((pos.tp || 0) - expectedTp) > 0.00001 || Math.abs((pos.sl || 0) - expectedSl) > 0.00001) {
      if (tpslOnWrongSide(broker, direction, expectedTp, expectedSl, sym, infos)) {
        // Warten statt jeden Durchlauf abgelehnt zu werden; gesetzt wird, wenn der Kurs passt
        const key = `${expectedTp}|${expectedSl}`;
        if (state.tpslBlockedLogged.get(pos.ticket) !== key) {
          state.tpslBlockedLogged.set(pos.ticket, key);
          state.log('WARN', 'position.tpslWaiting', { zone: idx + 1, ticket: pos.ticket, tp: expectedTp, sl: expectedSl });
        }
      } else {
        state.tpslBlockedLogged.delete(pos.ticket);
        state.log('INFO', 'position.tpslUpdate', { zone: idx + 1, ticket: pos.ticket });
        modifyPositionTpSl(broker, pos, expectedTp, expectedSl, infos, state);
      }
    }

    const tol = pyRound((direction === 'BUY' ? cfg.gridStep : cfg.sellGridStep) * 0.4, 5);
    const near = (a: number, b: number) => Math.abs(pyRound(a, 5) - pyRound(b, 5)) <= tol;
    if (processed.some((p) => p.direction === direction && near(pos.price_open, p.price))) continue;
    processed.push({ direction, price: pos.price_open });

    // Die Höchstzahl-Sperre (handler) löscht die Pending Orders der Zone in jedem Durchlauf
    const zonePositions = robotPositions.filter((p) => p.magic === pos.magic).length;
    if (zonePositions >= maxPositionsOf(zone)) continue;

    const atLevel = robotPositions.filter((p) => p.magic === pos.magic && p.type === pos.type && near(p.price_open, pos.price_open));
    const remaining = remainingLotAtLevel(broker, atLevel, sym, infos, state);
    if (remaining <= 0) continue;

    const hasPending = robotOrders.some((o) => o.magic === pos.magic && near(o.price_open, pos.price_open));
    let zoneActive = isEnabled(zone);
    if (STOPPED.includes(state.activeZonesState.get(idx) ?? '')) zoneActive = false;
    if (!hasPending && zoneActive) {
      state.log('INFO', 'grid.partialFillTopUp', { zone: idx + 1, remaining, direction });
      sendPendingOrderHelper(broker, pos.price_open, remaining, expectedTp, expectedSl > 0 ? expectedSl : null, idx, direction, sym, infos, state, pos.magic);
    }
  }
}

/** Ziel „Kapatılacak Yön“: gilt die Order/Position für das gewählte Ziel? */
function matchesTarget(target: unknown, isBuy: boolean): boolean {
  return (
    target === 'Farketmez (Hepsi)' ||
    (target === 'Sadece BUY İşlemleri' && isBuy) ||
    (target === 'Sadece SELL İşlemleri' && !isBuy)
  );
}

/**
 * Aufräumen beim Verlassen der Zone. Rückgabe true: Zone wird mit `clear_on_exit` gestoppt
 * (AUTO_CLEAR); false: `clear_on_exit` aus, die Orders der Zone bleiben.
 */
export function handleZoneExit(
  broker: Broker,
  zone: ZoneDict,
  zoneIdx: number,
  robotOrders: Order[],
  robotPositions: Position[],
  currentAvgPrice: number,
  closePrice: number,
  exitCond: unknown,
  state: EngineState,
): boolean {
  if (!zget(zone, 'clear_on_exit', true)) return false;

  const zMax = pyFloat(zget(zone, 'max_price', 0));
  const ref = exitCond === 'Anlık Fiyat' ? currentAvgPrice : closePrice;
  const actualExitDir = ref > zMax ? 'BUY (Yukarı)' : 'SELL (Aşağı)';
  const triggerSide = zget(zone, 'clear_exit_side', 'Farketmez');
  if (triggerSide !== 'Farketmez' && triggerSide !== actualExitDir) {
    state.log('INFO', 'zone.exitSideSkipped', { exit: actualExitDir, side: triggerSide });
    return true;
  }

  const scope = String(zget(zone, 'clear_scope', 'Sadece Bekleyen Emirler'));
  const target = zget(zone, 'clear_target_side', 'Farketmez (Hepsi)');
  const magic = zoneMagic(zone, zoneIdx);
  state.log('INFO', 'zone.exited', { exit: actualExitDir, scope, target });

  let cancelled = 0;
  for (const order of robotOrders) {
    if (order.magic !== magic) continue;
    const isBuy = BUY_ORDER_TYPES.includes(order.type);
    const isSell = SELL_ORDER_TYPES.includes(order.type);
    if (target === 'Farketmez (Hepsi)' || (isBuy && matchesTarget(target, true)) || (isSell && matchesTarget(target, false))) {
      cancelOrder(broker, order, state);
      cancelled += 1;
    }
  }
  state.log('INFO', 'zone.exitOrdersCancelled', { count: cancelled });

  // Die UI speichert „Tüm İşlemler“; „Pozisyon“/„Tümü“/„Hepsi“ sind alte Werte
  if (['Tüm', 'Pozisyon', 'Hepsi'].some((key) => scope.includes(key))) {
    let closed = 0;
    for (const pos of robotPositions) {
      if (pos.magic !== magic || !matchesTarget(target, pos.type === POSITION_TYPE_BUY)) continue;
      const tick = broker.symbolInfoTick(pos.symbol);
      if (!tick) continue;
      safeSendOrder(
        broker,
        {
          action: TRADE_ACTION_DEAL,
          position: pos.ticket,
          symbol: pos.symbol,
          volume: pos.volume,
          type: pos.type === POSITION_TYPE_BUY ? ORDER_TYPE_SELL : ORDER_TYPE_BUY,
          price: pos.type === POSITION_TYPE_BUY ? tick.bid : tick.ask,
          deviation: MAX_DEVIATION,
          magic: pos.magic,
          comment: 'Zone_Exit_Close',
          type_time: ORDER_TIME_GTC,
          type_filling: ORDER_FILLING_IOC,
        },
        state,
      );
      closed += 1;
    }
    state.log('INFO', 'zone.exitPositionsClosed', { count: closed });
  }
  return true;
}
