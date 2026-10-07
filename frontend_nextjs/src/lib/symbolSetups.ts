/**
 * Symbol mit Setups (ZON-19): Einstellungen an der Grenze zum Worker umrechnen.
 *
 * Der Worker liefert und speichert `SYMBOLS: [{symbol, setups}]`. Der Store hält weiter die flache
 * Liste `ZONES` in Engine-Reihenfolge: ui-state-Befehle und `zone_states` zählen Zonen nach ihrem
 * Platz in dieser Liste. Gegenstück im Worker: worker_python/src/utils/symbol_setups.py.
 */
import type { GlobalSettings, ZoneSettings } from '@/store/types';

type Setup = Omit<ZoneSettings, 'symbol'>;

/** Symbol mit seinen Setups, wie der Worker es speichert. */
export interface SymbolSetups {
  symbol: string;
  setups: Setup[];
}

/** GET-Antwort des Workers: jedes Setup trägt seinen Platz in der Engine-Reihenfolge (`index`, nur lesend). */
export type WorkerSettings = Omit<GlobalSettings, 'ZONES'> & {
  SYMBOLS?: { symbol: string; setups: (Setup & { index: number })[] }[];
};

/** Nutzlast für POST /settings: Zonen nach Symbol gruppiert, nie `ZONES`. */
export type WorkerSettingsPayload = Omit<Partial<GlobalSettings>, 'ZONES'> & { SYMBOLS?: SymbolSetups[] };

/** GET → Store: Setups als flache `ZONES`, sortiert nach Engine-Platz, ohne `index`. */
export function settingsFromWorker({ SYMBOLS, ...rest }: WorkerSettings): GlobalSettings {
  const zones = (SYMBOLS ?? [])
    .flatMap(({ symbol, setups }) => setups.map(({ index, ...setup }) => ({ index, zone: { ...setup, symbol } })))
    .sort((a, b) => a.index - b.index)
    .map(({ zone }) => zone);
  return { ...rest, ZONES: zones };
}

/** Store → POST: `ZONES` nach Symbol gruppiert, in der Reihenfolge des ersten Auftretens (wie group_zones). */
export function settingsToWorker({ ZONES, ...rest }: Partial<GlobalSettings>): WorkerSettingsPayload {
  if (!ZONES) return rest;
  const groups = new Map<string, SymbolSetups>();
  for (const { symbol, ...setup } of ZONES) {
    const group = groups.get(symbol) ?? { symbol, setups: [] };
    group.setups.push(setup);
    groups.set(symbol, group);
  }
  return { ...rest, SYMBOLS: [...groups.values()] };
}
