/**
 * Feste Magic-Nummer je Zone (ENG-27). Quelle: worker_python/src/utils/zone_magic.py
 * (zone_magic, zone_index_by_magic, zone_number). Die Vergabe (assign_zone_magics) bleibt im Worker.
 */
import { pyGet } from './state';

export const BASE_MAGIC_NUMBER = 200000;
export const MAGIC_LIMIT = BASE_MAGIC_NUMBER + 1000;

export type Zone = Record<string, unknown>;

export function zoneMagic(zone: Zone, zoneIdx: number): number {
  const raw = zone && typeof zone === 'object' ? pyGet(zone, 'magic', null) : null;
  if (raw !== null && raw !== undefined && typeof raw !== 'boolean') {
    let magic: number | null = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) magic = Math.trunc(raw);
    else if (typeof raw === 'string' && /^\s*[+-]?\d+\s*$/.test(raw)) magic = Number.parseInt(raw, 10);
    if (magic !== null && BASE_MAGIC_NUMBER < magic && magic < MAGIC_LIMIT) return magic;
  }
  return BASE_MAGIC_NUMBER + zoneIdx + 1;
}

/** magic → Index in der Liste (der erste gewinnt) */
export function zoneIndexByMagic(zones: Zone[]): Map<number, number> {
  const index = new Map<number, number>();
  (zones ?? []).forEach((zone, idx) => {
    const magic = zoneMagic(zone, idx);
    if (!index.has(magic)) index.set(magic, idx);
  });
  return index;
}

/** Zonennummer im Order-Kommentar (AutoGrid_Z{n}) */
export function zoneNumber(magic: number): number {
  return Math.trunc(magic) - BASE_MAGIC_NUMBER;
}
