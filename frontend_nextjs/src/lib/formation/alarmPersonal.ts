/**
 * Persönliche Felder des Formationsalarms (USR-15): gehören dem Benutzer und liegen im Worker (`user_prefs`, Schlüssel
 * `formation_alarm`). Konto-Felder (Schalter je Symbol, Favoriten, gemerkter Stand, Verlauf) bleiben im localStorage.
 * Ohne Store-Import, damit `useUserPrefsStore` und `alarmStore` ohne Kreis darauf zugreifen.
 */
import { SCAN_FORMATIONS } from './scan';
import type { AlarmEvent, AlarmSettings } from './alarm';

export const ALARM_STORAGE_KEY = 'grid-robot-formation-alarm';

export interface AlarmPrefs extends AlarmSettings {
  /** Browser-Meldung zusätzlich zur Karte im Fenster */
  system: boolean;
  sound: boolean;
}

export interface AlarmPersonal {
  /** Hauptschalter: aus = keine Suche, keine Meldung; alle Auswahlen bleiben */
  active: boolean;
  prefs: AlarmPrefs;
}

export const DEFAULT_PERSONAL: AlarmPersonal = {
  active: true,
  prefs: { events: { valid: true, target: true }, forms: SCAN_FORMATIONS, system: false, sound: false },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Wert aus dem Worker oder aus dem alten Speicher: alles wird geprüft, Fehlendes nimmt den Standard */
export function parsePersonal(v: unknown): AlarmPersonal {
  if (!isRecord(v)) return DEFAULT_PERSONAL;
  const events: Partial<Record<AlarmEvent, unknown>> = isRecord(v.events) ? v.events : {};
  return {
    active: v.active !== false,
    prefs: {
      events: { valid: events.valid !== false, target: events.target !== false },
      forms: Array.isArray(v.forms) ? SCAN_FORMATIONS.filter((form) => (v.forms as unknown[]).includes(form)) : SCAN_FORMATIONS,
      system: v.system === true,
      sound: v.sound === true,
    },
  };
}

/** Der Wert für `PUT /me/prefs/formation_alarm` */
export const personalValue = (p: AlarmPersonal): Record<string, unknown> => ({
  active: p.active,
  events: { ...p.prefs.events },
  forms: [...p.prefs.forms],
  system: p.prefs.system,
  sound: p.prefs.sound,
});

export const samePersonal = (a: AlarmPersonal, b: AlarmPersonal) => JSON.stringify(personalValue(a)) === JSON.stringify(personalValue(b));

/** Persönliche Felder aus dem alten Browser-Eintrag (Quelle der einmaligen Übernahme); null = nichts zu übernehmen */
export function readLegacyPersonal(): AlarmPersonal | null {
  try {
    const raw = localStorage.getItem(ALARM_STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || (!('active' in data) && !('prefs' in data))) return null;
    return parsePersonal({ active: data.active, ...(isRecord(data.prefs) ? data.prefs : {}) });
  } catch {
    return null;
  }
}

/** Nach der Übernahme: die persönlichen Felder verschwinden aus dem Browser-Eintrag, die Konto-Felder bleiben */
export function stripLegacyPersonal(): void {
  try {
    const raw = localStorage.getItem(ALARM_STORAGE_KEY);
    if (!raw) return;
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return;
    delete data.active;
    delete data.prefs;
    localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* gesperrter Speicher: die Übernahme wird beim nächsten Öffnen wiederholt, sie ist harmlos */
  }
}
