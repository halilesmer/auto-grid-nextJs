import { isOscillator, SYSTEM_RSI_ID, type Indicator } from './indicators';

/**
 * System-Oszillatoren des Charts (RSI(7)). Sie stehen im selben Bereichsmodell wie die Oszillatoren des Nutzers:
 * ein Bereich je Eintrag, Reihenfolge, Einklappen und Ausblenden im Chart-Dokument (UI-11, Plan 1105-A6).
 */
/** No system pane is left (the Wave 5/35 pane was removed on 2026-11-11, EWO is an ordinary user indicator); the model stays for the next system pane. */
export const SYSTEM_PANE_IDS: readonly string[] = [];
export type SystemPaneId = string;
export const isSystemPane = (id: string): id is SystemPaneId => SYSTEM_PANE_IDS.includes(id);

export interface SystemPaneState { hidden?: boolean; collapsed?: boolean }
export type SystemPaneStates = Partial<Record<SystemPaneId, SystemPaneState>>;

/**
 * Bereiche des Charts von oben nach unten, ohne den Kerzen-Bereich. `present` ist die Standardreihenfolge: erst die
 * eingeschalteten System-Bereiche, dann die Bereiche der Nutzer-Indikatoren. Die gespeicherte Reihenfolge gilt für
 * die Einträge, die sie nennt; alle anderen (neu hinzugekommen) stehen danach, also ganz unten.
 */
export function orderPanes(stored: readonly string[] | undefined, present: readonly string[]): string[] {
  const known = (stored ?? []).filter((id, index, all) => present.includes(id) && all.indexOf(id) === index);
  return [...known, ...present.filter(id => !known.includes(id))];
}

/** Bereiche in Standardreihenfolge: System-Bereiche der eingeschalteten Ebenen, dann die Bereiche der Oszillatoren */
export function presentPanes(indicators: readonly Indicator[], systemIds: readonly SystemPaneId[]): string[] {
  const own = [...new Set(indicators.filter(isOscillator).map(item => item.paneId))];
  // The system RSI pane stands first, like the former RSI(7) pane
  return [...own.filter(id => id === SYSTEM_RSI_ID), ...systemIds, ...own.filter(id => id !== SYSTEM_RSI_ID)];
}

/** Gespeicherte Werte eines Dokuments prüfen: Reihenfolge als Liste von Namen, Zustände als Wahrheitswerte */
export function parsePaneOrder(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 100) : undefined;
}
export function parseSystemPanes(value: unknown): SystemPaneStates | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: SystemPaneStates = {};
  for (const id of SYSTEM_PANE_IDS) {
    const item = (value as Record<string, unknown>)[id];
    if (!item || typeof item !== 'object') continue;
    const { hidden, collapsed } = item as Record<string, unknown>;
    out[id] = { ...(hidden === true ? { hidden: true } : {}), ...(collapsed === true ? { collapsed: true } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}
