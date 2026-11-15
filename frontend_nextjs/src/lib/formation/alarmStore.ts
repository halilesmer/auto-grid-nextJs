/**
 * Gespeicherte Einstellungen und gemerkter Stand des Formationsalarms (localStorage, ein Eintrag für alle Konten).
 * Ohne React-Bezug außer `subscribe`/`snapshot`/`serverSnapshot` für `useSyncExternalStore`.
 */
import type { AlarmMemory } from './alarm';
import { parseHistory, type HistoryEntry } from './alarmHistory';
import { ALARM_STORAGE_KEY, DEFAULT_PERSONAL, parsePersonal, personalValue, samePersonal, type AlarmPersonal, type AlarmPrefs } from './alarmPersonal';
import { alarmLabel, useUserPrefsStore } from '@/store/useUserPrefsStore';
import { useAlarmPrefsStore } from '@/store/useAlarmPrefsStore';

const STORAGE_KEY = ALARM_STORAGE_KEY;

export type { AlarmPrefs };

/**
 * Der Alarm-Stand besteht aus zwei Teilen: den persönlichen Feldern des Benutzers (`active`, `prefs`; im Worker, USR-15)
 * und den Feldern je Konto (localStorage). `snapshot()` liefert beide zusammen; `save()` verteilt sie wieder.
 */
export interface Stored {
  /** Hauptschalter des Alarms: aus = keine Suche, keine Meldung; alle Auswahlen bleiben. (Benutzer, Worker) */
  active: boolean;
  /** Ereignisse, Formationen, Systemmeldung, Ton (Benutzer, Worker) */
  prefs: AlarmPrefs;
  /** Die persönlichen Felder sind aus dem Worker gelesen: vorher sucht und meldet der Alarm nicht */
  personalLoaded: boolean;
  /** Schalter je Konto und Symbol: `${konto}|${symbol}` */
  enabled: string[];
  /** Konten, für die alle Favoriten gemeldet werden */
  favoritesEnabled: string[];
  memory: Record<string, AlarmMemory>;
  /** Meldungsverlauf je Konto, neueste zuerst; getrennt von `memory`. Fehlt in älteren Speicherständen. */
  history: Record<string, HistoryEntry[]>;
  /** Zuletzt gewähltes Konto: der Alarm sucht damit weiter, wenn nach dem Neuladen keins gewählt ist. Die Kontowahl der Seiten ändert es nie. */
  account: string | null;
}

/** Die Felder je Konto (im Browser gespeichert) */
type LocalPart = Omit<Stored, 'active' | 'prefs' | 'personalLoaded'>;

const LOCAL_DEFAULTS: LocalPart = { enabled: [], favoritesEnabled: [], memory: {}, history: {}, account: null };

export const DEFAULTS: Stored = { ...DEFAULT_PERSONAL, personalLoaded: false, ...LOCAL_DEFAULTS };

const isSeen = (value: unknown): value is { valid: boolean; target: boolean } =>
  typeof value === 'object' && value !== null && typeof (value as { valid?: unknown }).valid === 'boolean' && typeof (value as { target?: unknown }).target === 'boolean';

/** Gespeicherte Daten stammen aus dem Browser und können fehlen oder veraltet sein: alles wird geprüft, Fehlendes nimmt den Standard */
export function parseLocal(raw: string | null): LocalPart {
  if (!raw) return LOCAL_DEFAULTS;
  const data: Partial<Record<keyof Stored, unknown>> = JSON.parse(raw) ?? {};
  const memory: Stored['memory'] = {};
  for (const [scope, entries] of Object.entries((data.memory ?? {}) as Record<string, Record<string, unknown>>)) {
    memory[scope] = Object.fromEntries(Object.entries(entries).filter(([, seen]) => isSeen(seen))) as AlarmMemory;
  }
  const history: Stored['history'] = {};
  for (const [accountId, entries] of Object.entries((data.history ?? {}) as Record<string, unknown>)) {
    const valid = parseHistory(entries);
    if (valid.length > 0) history[accountId] = valid;
  }
  return {
    enabled: Array.isArray(data.enabled) ? data.enabled.filter((x): x is string => typeof x === 'string') : [],
    favoritesEnabled: Array.isArray(data.favoritesEnabled) ? data.favoritesEnabled.filter((x): x is string => typeof x === 'string') : [],
    memory,
    history,
    account: typeof data.account === 'string' && data.account !== '' ? data.account : null,
  };
}

/** Ganzer alter Eintrag (Konto-Felder plus die früheren persönlichen Felder); die Prüfungen laufen ohne Browser darüber */
export function parseStored(raw: string | null): Stored {
  const legacy = raw ? (JSON.parse(raw) as { active?: unknown; prefs?: unknown } | null) : null;
  const personal = parsePersonal({ active: legacy?.active, ...(typeof legacy?.prefs === 'object' && legacy.prefs ? legacy.prefs : {}) });
  return { ...personal, personalLoaded: false, ...parseLocal(raw) };
}

let local: LocalPart | null = null;
let merged: Stored | null = null;
let mergedFrom: { local: LocalPart; personal: AlarmPersonal; loaded: boolean } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function readLocal(): LocalPart {
  if (local) return local;
  try {
    local = parseLocal(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    // Speicher gesperrt oder Inhalt kaputt: der Alarm läuft mit Standardwerten im Arbeitsspeicher weiter
    console.warn('formation alarm: stored settings unreadable', error);
    local = LOCAL_DEFAULTS;
  }
  return local;
}

/** Konto-Felder und persönliche Felder zusammen; dieselbe Referenz, solange sich keiner der Teile ändert (useSyncExternalStore) */
export function snapshot(): Stored {
  const { personal, loaded } = useAlarmPrefsStore.getState();
  const part = readLocal();
  if (merged && mergedFrom && mergedFrom.local === part && mergedFrom.personal === personal && mergedFrom.loaded === loaded) return merged;
  mergedFrom = { local: part, personal, loaded };
  merged = { ...part, active: personal.active, prefs: personal.prefs, personalLoaded: loaded };
  return merged;
}

/**
 * Speichert beide Teile: die Konto-Felder im Browser, geänderte persönliche Felder im Worker (USR-15).
 * Alte persönliche Felder im Browser-Eintrag bleiben bis zur Übernahme stehen (sie sind deren Quelle).
 */
export function save(next: Stored) {
  const part: LocalPart = { enabled: next.enabled, favoritesEnabled: next.favoritesEnabled, memory: next.memory, history: next.history, account: next.account };
  local = part;
  try {
    let old: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) old = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Kaputter Eintrag: er wird überschrieben und heilt sich so selbst
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...old, ...part }));
  } catch (error) {
    console.warn('formation alarm: settings not stored', error);
  }
  const personal: AlarmPersonal = { active: next.active, prefs: next.prefs };
  if (!samePersonal(personal, useAlarmPrefsStore.getState().personal)) {
    void useUserPrefsStore.getState().change('formation_alarm', personalValue(personal), alarmLabel, { silent: true });
  }
  notify();
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const unsubscribeStore = useAlarmPrefsStore.subscribe(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeStore();
  };
};
/** Ein anderer Tab hat gespeichert: der Arbeitsspeicher wird neu gelesen, damit dieser Tab ihn nicht überschreibt */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    local = null;
    notify();
  });
}

export const serverSnapshot = () => DEFAULTS;
