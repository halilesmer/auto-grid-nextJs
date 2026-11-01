/**
 * Meldungsverlauf des Formationsalarms: jeder gemeldete Treffer ein Eintrag, je Konto, neueste zuerst.
 * Reine Funktionen ohne React und ohne Speicher. Der Verlauf ist vom gemerkten Stand (`memory`) getrennt:
 * Löschen leert nur die Liste, sonst käme eine schon gemeldete Formation noch einmal.
 */
import { SCAN_FORMATIONS, type ScanFormation } from './scan';
import type { AlarmEvent, AlarmNotice } from './alarm';
import type { Stored } from './alarmStore';
import type { Side } from './types';

/** Höchstzahl Einträge je Konto; ältere fallen heraus */
export const HISTORY_LIMIT = 100;

/** Wie die Meldung auf den Schirm kam: einzeln, als Sammelmeldung eines Durchlaufs oder „Seit dem letzten Öffnen“ */
export type HistoryBatch = 'single' | 'many' | 'since';

export interface HistoryEntry {
  id: string;
  /** Zeitpunkt der Meldung, Millisekunden seit 1970 */
  at: number;
  /** Trefferschlüssel (alarm.ts `hitKey`) */
  key: string;
  symbol: string;
  form: ScanFormation;
  tf: AlarmNotice['tf'];
  side: Side;
  events: AlarmEvent[];
  batch: HistoryBatch;
}

const BATCHES: readonly HistoryBatch[] = ['single', 'many', 'since'];
const EVENTS: readonly AlarmEvent[] = ['valid', 'target'];

/** Ein Eintrag je Treffer; Einträge eines Durchlaufs teilen `at` und `batch` (daraus entsteht der Gruppenkopf) */
export function historyEntries(notices: readonly AlarmNotice[], at: number, batch: HistoryBatch): HistoryEntry[] {
  return notices.map((notice, i) => ({ id: `${at}-${i}-${notice.key}`, at, key: notice.key, symbol: notice.symbol, form: notice.form, tf: notice.tf, side: notice.side, events: notice.events, batch }));
}

/** Neue Einträge kommen nach vorn (in ihrer Reihenfolge), über der Grenze fallen die ältesten hinten heraus */
export function appendHistory(history: readonly HistoryEntry[], entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries, ...history].slice(0, HISTORY_LIMIT);
}

/** Leert den Verlauf eines Kontos; Einstellungen und gemerkter Stand bleiben dieselben Objekte */
export function withoutHistory(stored: Stored, accountId: string): Stored {
  const history = { ...stored.history };
  delete history[accountId];
  return { ...stored, history };
}

/** Gespeicherte Einträge kommen aus dem Browser: nur vollständig gültige bleiben */
export function parseHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry).slice(0, HISTORY_LIMIT);
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const x = value as Partial<Record<keyof HistoryEntry, unknown>>;
  return (
    typeof x.id === 'string' &&
    typeof x.at === 'number' &&
    typeof x.key === 'string' &&
    typeof x.symbol === 'string' &&
    typeof x.tf === 'string' &&
    SCAN_FORMATIONS.includes(x.form as ScanFormation) &&
    (x.side === 'buy' || x.side === 'sell') &&
    BATCHES.includes(x.batch as HistoryBatch) &&
    Array.isArray(x.events) &&
    x.events.length > 0 &&
    x.events.every((event) => EVENTS.includes(event as AlarmEvent))
  );
}
