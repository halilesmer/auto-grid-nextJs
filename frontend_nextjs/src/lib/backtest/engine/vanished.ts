/**
 * Extern gelöschte Orders und Order-Flut-Bremse (ENG-25).
 * Quelle: worker_python/src/core/grid_execution/vanished.py. Der simulierte Broker löscht keine
 * Orders von selbst; die Prüfung bleibt für gleiche Abläufe trotzdem im Nachbau.
 */
import { pauseZoneForSafety } from './gridOrders';
import { zoneLogId } from './gridHelpers';
import type { Order, Position } from './mt5';
import type { EngineContext } from './state';
import { zoneIndexByMagic, type Zone } from './zoneMagic';

export const VANISH_WINDOW_SEC = 60.0;
export const VANISH_LIMIT = 10;
const FILLED_STATES = [3, 4]; // ORDER_STATE_PARTIAL, ORDER_STATE_FILLED

export function checkVanishedOrders(
  ctx: EngineContext,
  zones: Zone[],
  robotOrders: Order[],
  robotPositions: Position[],
  activeZonesState: Map<number, string>,
): Map<number, number> {
  const { state } = ctx;
  if (!state.placedOrders.size) return new Map();
  const openTickets = new Set(robotOrders.map((o) => o.ticket));
  const positionIds = new Set(robotPositions.map((p) => p.identifier || p.ticket));
  const tNow = ctx.now();
  const indexByMagic = zoneIndexByMagic(zones);
  const removed = new Map<number, number[]>();

  for (const [ticket, [magic]] of [...state.placedOrders.entries()]) {
    if (openTickets.has(ticket)) continue;
    state.placedOrders.delete(ticket);
    const zoneIdx = indexByMagic.get(magic);
    if (zoneIdx === undefined) continue;
    if (positionIds.has(ticket)) continue;
    const hist = ctx.mt5.historyOrdersGet(ticket)[0];
    if (hist && FILLED_STATES.includes(hist.state)) continue;
    removed.set(zoneIdx, [...(removed.get(zoneIdx) ?? []), ticket]);
  }

  const counts = new Map<number, number>();
  for (const [zoneIdx, tickets] of removed) {
    counts.set(zoneIdx, tickets.length);
    const zone = zones[zoneIdx];
    ctx.log(
      `⚠️ Bölge ${zoneIdx + 1} [${zoneLogId(zone, zoneIdx)}]: ${tickets.length} bekleyen emir MT5'te kayboldu — bot silmedi, dolmadı.`,
      'WARN',
    );
    const times = (state.vanishedTimes.get(zoneIdx) ?? []).filter((t) => tNow - t <= VANISH_WINDOW_SEC);
    for (let i = 0; i < tickets.length; i++) times.push(tNow);
    state.vanishedTimes.set(zoneIdx, times);
    if (times.length >= VANISH_LIMIT && activeZonesState.get(zoneIdx) !== 'PAUSE') {
      const msg = `Emir seli durduruldu: Bölge ${zoneIdx + 1}'de ${VANISH_WINDOW_SEC} sn içinde ${times.length} emir dışarıdan silindi`;
      state.lastErrorMessage = msg;
      ctx.log(`🚨 ${msg}. Bölge güvenliğe alınıyor (PAUSE).`, 'ERROR');
      pauseZoneForSafety(ctx, zoneIdx, activeZonesState);
      state.vanishedTimes.set(zoneIdx, []);
    }
  }
  return counts;
}
