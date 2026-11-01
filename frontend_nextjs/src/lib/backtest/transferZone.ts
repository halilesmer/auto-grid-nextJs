import { spreadGuardError } from '@/lib/spreadGuardSettings';
import type { ZoneSettings } from '@/store/types';

/** Zone aus dem Backtest für das Dashboard: ohne eigenen Spread-Schutz behält die Zielzone ihren bisherigen, sofern er zur Zone passt. */
export function transferZone(zone: ZoneSettings, previous: ZoneSettings | undefined): ZoneSettings {
  if (zone.spread_guard !== undefined || previous?.spread_guard === undefined) return zone;
  const kept = { ...zone, spread_guard: previous.spread_guard };
  // Z. B. Grid-Modus passt nicht zu einem Fraktal-Einstieg: dann ohne Schutz übernehmen, nicht ungültig speichern.
  return spreadGuardError(kept) ? zone : kept;
}
