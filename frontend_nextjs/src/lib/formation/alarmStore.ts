/**
 * Gespeicherte Einstellungen und gemerkter Stand des Formationsalarms (localStorage, ein Eintrag für alle Konten).
 * Ohne React-Bezug außer `subscribe`/`snapshot`/`serverSnapshot` für `useSyncExternalStore`.
 */
import { SCAN_FORMATIONS } from './scan';
import type { AlarmEvent, AlarmMemory, AlarmSettings } from './alarm';

const STORAGE_KEY = 'grid-robot-formation-alarm';

export interface AlarmPrefs extends AlarmSettings {
  /** Browser-Meldung zusätzlich zur Karte im Fenster */
  system: boolean;
  sound: boolean;
}

export interface Stored {
  prefs: AlarmPrefs;
  /** Schalter je Konto und Symbol: `${konto}|${symbol}` */
  enabled: string[];
  /** Konten, für die alle Favoriten gemeldet werden */
  favoritesEnabled: string[];
  memory: Record<string, AlarmMemory>;
}

export const DEFAULTS: Stored = {
  prefs: { events: { valid: true, target: true }, forms: SCAN_FORMATIONS, system: false, sound: false },
  enabled: [],
  favoritesEnabled: [],
  memory: {},
};

const isSeen = (value: unknown): value is { valid: boolean; target: boolean } =>
  typeof value === 'object' && value !== null && typeof (value as { valid?: unknown }).valid === 'boolean' && typeof (value as { target?: unknown }).target === 'boolean';

/** Gespeicherte Daten stammen aus dem Browser und können fehlen oder veraltet sein: alles wird geprüft, Fehlendes nimmt den Standard */
function parse(raw: string | null): Stored {
  if (!raw) return DEFAULTS;
  const data: Partial<Record<keyof Stored, unknown>> = JSON.parse(raw) ?? {};
  const prefs = (data.prefs ?? {}) as Partial<Record<keyof AlarmPrefs, unknown>>;
  const events = (prefs.events ?? {}) as Partial<Record<AlarmEvent, unknown>>;
  const memory: Stored['memory'] = {};
  for (const [scope, entries] of Object.entries((data.memory ?? {}) as Record<string, Record<string, unknown>>)) {
    memory[scope] = Object.fromEntries(Object.entries(entries).filter(([, seen]) => isSeen(seen))) as AlarmMemory;
  }
  return {
    prefs: {
      events: { valid: events.valid !== false, target: events.target !== false },
      forms: Array.isArray(prefs.forms) ? SCAN_FORMATIONS.filter((form) => (prefs.forms as unknown[]).includes(form)) : SCAN_FORMATIONS,
      system: prefs.system === true,
      sound: prefs.sound === true,
    },
    enabled: Array.isArray(data.enabled) ? data.enabled.filter((x): x is string => typeof x === 'string') : [],
    favoritesEnabled: Array.isArray(data.favoritesEnabled) ? data.favoritesEnabled.filter((x): x is string => typeof x === 'string') : [],
    memory,
  };
}

let cache: Stored | null = null;
const listeners = new Set<() => void>();

export function snapshot(): Stored {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    // Speicher gesperrt oder Inhalt kaputt: der Alarm läuft mit Standardwerten im Arbeitsspeicher weiter
    console.warn('formation alarm: stored settings unreadable', error);
    cache = DEFAULTS;
  }
  return cache;
}

export function save(next: Stored) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('formation alarm: settings not stored', error);
  }
  listeners.forEach((listener) => listener());
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
/** Ein anderer Tab hat gespeichert: der Arbeitsspeicher wird neu gelesen, damit dieser Tab ihn nicht überschreibt */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listeners.forEach((listener) => listener());
  });
}

export const serverSnapshot = () => DEFAULTS;
