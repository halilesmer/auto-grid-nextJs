/**
 * Symbol mit Setups (ZON-19): Einstellungen an der Grenze zum Worker umrechnen.
 *
 * Der Worker liefert und speichert `SYMBOLS: [{symbol, setups}]`. Der Store hält weiter die flache
 * Liste `ZONES`. ui-state-Befehle und `zone_states` zählen Zonen nach ihrem Engine-Platz; den führt
 * der Store getrennt als `engineOrder` (ids, Stand der letzten Ladung oder Speicherung), damit ein
 * ungespeichertes Setup die Plätze der anderen nicht verschiebt. Gegenstück im Worker:
 * worker_python/src/utils/symbol_setups.py.
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

/**
 * Zonen nach Symbol gruppiert für die Symbolkarten: gleiche Regel wie settingsToWorker (erstes
 * Auftreten, exakter Vergleich), damit die Karten die Reihenfolge nach dem Speichern zeigen.
 */
export function groupBySymbol(zones: readonly ZoneSettings[]): { symbol: string; zones: ZoneSettings[] }[] {
  const groups = new Map<string, { symbol: string; zones: ZoneSettings[] }>();
  for (const zone of zones) {
    const group = groups.get(zone.symbol) ?? { symbol: zone.symbol, zones: [] };
    group.zones.push(zone);
    groups.set(zone.symbol, group);
  }
  return [...groups.values()];
}

/**
 * Zonen-ids in der Reihenfolge, die der Worker nach dem Speichern dieser Liste führt (Engine-Platz).
 * Der Worker speichert `SYMBOLS` und liest die Setups Symbol für Symbol (settings_zones).
 */
export function engineOrderAfterSave(zones: ZoneSettings[]): string[] {
  return (settingsToWorker({ ZONES: zones }).SYMBOLS ?? []).flatMap((group) => group.setups.map((setup) => setup.id));
}

/**
 * Neues Setup hinter das letzte Setup seines Symbols einfügen; neues Symbol ans Ende.
 * So bleibt die Liste nach Symbol gruppiert, wie der Worker sie nach dem Speichern führt.
 */
export function insertSetup(zones: readonly ZoneSettings[], zone: ZoneSettings): ZoneSettings[] {
  const last = zones.findLastIndex((z) => z.symbol === zone.symbol);
  if (last < 0) return [...zones, zone];
  return [...zones.slice(0, last + 1), zone, ...zones.slice(last + 1)];
}
