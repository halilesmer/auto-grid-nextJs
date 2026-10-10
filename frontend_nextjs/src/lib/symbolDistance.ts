import type { ZoneSettings } from '@/store/types';

export interface DistanceSymbol {
  distance_unit?: 'pips' | 'ticks' | null;
  distance_unit_size?: number | null;
  trade_calc_mode?: number | null;
  point?: number;
  digits?: number;
  trade_tick_size?: number;
}

/** Wie worker src/utils/symbol_distance.py: Instrumentklasse, niemals Symbolnamen. */
export function distanceUnitOf(info: DistanceSymbol | undefined): { unit: 'pips' | 'ticks' | null; size: number | null } {
  // Neue API-Antworten kennzeichnen fehlende Rohdaten ausdrücklich mit null.
  if (info?.distance_unit !== undefined || info?.distance_unit_size !== undefined) {
    const unit = info.distance_unit === 'pips' || info.distance_unit === 'ticks' ? info.distance_unit : null;
    const size = info.distance_unit_size;
    return { unit, size: unit && size != null && Number.isFinite(size) && size > 0 ? size : null };
  }
  const mode = info?.trade_calc_mode;
  if (mode == null || !Number.isInteger(mode) || mode < 0) return { unit: null, size: null };
  const forex = mode === 0 || mode === 5;
  const unit = forex ? 'pips' : 'ticks';
  const value = forex ? info?.point : info?.trade_tick_size;
  if (value == null || !Number.isFinite(value) || value <= 0) return { unit, size: null };
  if (forex && (info?.digits == null || !Number.isInteger(info.digits) || info.digits < 0)) return { unit, size: null };
  return { unit, size: value * (forex && (info?.digits === 3 || info?.digits === 5) ? 10 : 1) };
}

/** Nur lokale Darstellung bzw. ausdrückliche Speicherung; alte Preisabstände bleiben gleich. */
export function migrateFractalDistance(zone: ZoneSettings, size: number | null): ZoneSettings {
  if (zone.fractal_next_loss_mode !== 'pips' || (zone.fractal_next_loss_unit_version != null && zone.fractal_next_loss_unit_version !== 0) || size === null) return zone;
  return { ...zone, fractal_next_loss: (zone.fractal_next_loss ?? 0) / size, fractal_next_loss_unit_version: 1 };
}
