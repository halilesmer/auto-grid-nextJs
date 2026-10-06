/**
 * Von außen gelöschte Orders und Bremse gegen eine Orderflut (ENG-25).
 * Quelle: worker_python/src/core/grid_execution/vanished.py (check_vanished_orders).
 * Der simulierte Broker löscht nie von sich aus; die Prüfung läuft trotzdem wie im Bot mit.
 */
import { pauseZoneForSafety } from './orders';
import type { EngineState } from './state';
import { ORDER_STATE_FILLED, ORDER_STATE_PARTIAL, type Broker, type Order, type Position, type ZoneDict } from './types';
import { zoneIndexByMagic } from './zoneMagic';

export const VANISH_WINDOW_SEC = 60.0;
export const VANISH_LIMIT = 10;

/** Rückgabe: Bölge → Zahl der in diesem Durchlauf von außen gelöschten Orders */
export function checkVanishedOrders(
  broker: Broker,
  zones: readonly ZoneDict[],
  robotOrders: Order[],
  robotPositions: Position[],
  state: EngineState,
): Map<number, number> {
  const counts = new Map<number, number>();
  if (state.placedOrders.size === 0) return counts;

  const openTickets = new Set(robotOrders.map((o) => o.ticket));
  const positionIds = new Set(robotPositions.map((p) => p.identifier || p.ticket));
  const tNow = state.now();
  const indexByMagic = zoneIndexByMagic(zones);
  const removed = new Map<number, { ticket: number; price: number; state: number | null }[]>();

  for (const [ticket, placed] of [...state.placedOrders]) {
    if (openTickets.has(ticket)) continue;
    state.placedOrders.delete(ticket);
    const zoneIdx = indexByMagic.get(placed.magic);
    if (zoneIdx === undefined) continue; // Zone inzwischen gelöscht: die Zombie-Bereinigung hat gelöscht
    if (positionIds.has(ticket)) continue; // gefüllt, Position offen
    const hist = broker.historyOrdersGet(ticket)[0];
    const orderState = hist ? hist.state : null;
    if (orderState === ORDER_STATE_PARTIAL || orderState === ORDER_STATE_FILLED) continue;
    const list = removed.get(zoneIdx) ?? [];
    list.push({ ticket, price: placed.price, state: orderState });
    removed.set(zoneIdx, list);
  }

  for (const [zoneIdx, items] of removed) {
    counts.set(zoneIdx, items.length);
    state.log('WARN', 'zone.ordersVanished', { zone: zoneIdx + 1, count: items.length, ticket: items[0].ticket, price: items[0].price });
    const times = (state.vanishedTimes.get(zoneIdx) ?? []).filter((t) => tNow - t <= VANISH_WINDOW_SEC);
    for (let i = 0; i < items.length; i++) times.push(tNow);
    state.vanishedTimes.set(zoneIdx, times);
    if (times.length >= VANISH_LIMIT && state.activeZonesState.get(zoneIdx) !== 'PAUSE') {
      state.lastErrorMessage = `orderFlood zone ${zoneIdx + 1}`;
      state.log('ERROR', 'zone.orderFloodPaused', { zone: zoneIdx + 1, count: times.length });
      pauseZoneForSafety(zoneIdx, state);
      state.vanishedTimes.set(zoneIdx, []);
    }
  }
  return counts;
}
