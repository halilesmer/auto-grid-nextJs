/**
 * Zonen-Zustände (START/PAUSE/AUTO_CLEAR/CLEAR) aus der ui_state-Datei.
 * Quelle: worker_python/src/core/grid_zone_state.py (process_zone_commands). Die Datei ist hier
 * `EngineState.uiStates`; rekey_zone_state entfällt, weil sich die Zonenliste im Lauf nicht ändert.
 */
import { pyGet, pyStr, type EngineState } from './state';
import type { Zone } from './zoneMagic';

/** In diesen Zuständen setzt die Zone keine Orders; clean_zombie_orders löscht die übrigen. */
export const STOPPED_ZONE_STATES: readonly string[] = ['PAUSE', 'AUTO_CLEAR', 'CLEAR'];

function defaultState(zone: Zone): string {
  return pyStr(pyGet(zone, 'is_active', true)).toLowerCase() === 'false' ? 'PAUSE' : 'START';
}

export function processZoneCommands(state: EngineState, zones: Zone[], activeZonesState: Map<number, string>) {
  const ui = state.uiStates;
  if (ui !== null) {
    for (const k of [...activeZonesState.keys()]) {
      if (!(String(k) in ui)) activeZonesState.set(k, k >= 0 && k < zones.length ? defaultState(zones[k]) : 'CLEAR');
    }
    for (const [idx, value] of Object.entries(ui)) activeZonesState.set(Number.parseInt(idx, 10), value);
  } else {
    zones.forEach((zone, idx) => {
      if (!activeZonesState.has(idx)) activeZonesState.set(idx, defaultState(zone));
    });
  }
}
