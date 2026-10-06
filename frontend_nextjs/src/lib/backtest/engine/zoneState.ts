/**
 * Zustand je Zone (START/PAUSE/AUTO_CLEAR/CLEAR) aus der „Datei“ ui_state übernehmen.
 * Quelle: worker_python/src/core/grid_zone_state.py (process_zone_commands, STOPPED_ZONE_STATES).
 * rekey_zone_state fehlt: der Backtest lädt während eines Laufs keine Einstellungen nach.
 */
import { isEnabled } from './helpers';
import type { EngineState } from './state';
import type { ZoneDict } from './types';

/** In diesen Zuständen setzt eine Zone keine Orders; ihre Orders löscht cleanZombieOrders */
export const STOPPED_ZONE_STATES: readonly string[] = ['PAUSE', 'AUTO_CLEAR', 'CLEAR'];

function defaultState(zone: ZoneDict): string {
  return isEnabled(zone) ? 'START' : 'PAUSE';
}

export function processZoneCommands(zones: readonly ZoneDict[], state: EngineState): void {
  const ui = state.uiStates;
  const table = state.activeZonesState;
  if (ui !== null) {
    for (const k of [...table.keys()]) {
      if (!(String(k) in ui)) {
        // Zone ohne Eintrag in der Datei: ihr eigenes is_active gilt; gelöschte Zonen bleiben CLEAR
        table.set(k, k >= 0 && k < zones.length ? defaultState(zones[k]) : 'CLEAR');
      }
    }
    for (const [key, value] of Object.entries(ui)) table.set(Number(key), value);
    return;
  }
  zones.forEach((zone, idx) => {
    if (!table.has(idx)) table.set(idx, defaultState(zone));
  });
}
