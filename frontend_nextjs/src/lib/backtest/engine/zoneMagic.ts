/**
 * Magic-Nummern der Zonen (ENG-27).
 * Quelle: worker_python/src/utils/zone_magic.py (zone_magic, zone_index_by_magic, zone_number).
 */
import type { ZoneDict } from './types';

export const BASE_MAGIC_NUMBER = 200000;
export const MAGIC_LIMIT = BASE_MAGIC_NUMBER + 1000;

/** Feste Magic der Zone (200001…200999); ohne gültiges Feld aus der Position in der Liste */
export function zoneMagic(zone: ZoneDict, zoneIdx: number): number {
  const raw = zone.magic;
  if (raw !== undefined && raw !== null && typeof raw !== 'boolean') {
    const magic = Math.trunc(Number(raw));
    if (Number.isFinite(magic) && BASE_MAGIC_NUMBER < magic && magic < MAGIC_LIMIT) return magic;
  }
  return BASE_MAGIC_NUMBER + zoneIdx + 1;
}

/** Magic → Index in der Liste; eine Magic, die fehlt, gehört zu einer gelöschten Zone */
export function zoneIndexByMagic(zones: readonly ZoneDict[]): Map<number, number> {
  const index = new Map<number, number>();
  zones.forEach((zone, idx) => {
    const magic = zoneMagic(zone, idx);
    if (!index.has(magic)) index.set(magic, idx);
  });
  return index;
}

/** Nummer im Order-Kommentar AutoGrid_Z{n} */
export function zoneNumber(magic: number): number {
  return magic - BASE_MAGIC_NUMBER;
}

export function isRobotMagic(magic: number): boolean {
  return BASE_MAGIC_NUMBER <= magic && magic < MAGIC_LIMIT;
}
