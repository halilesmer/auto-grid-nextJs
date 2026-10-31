/**
 * Formationsalarm: vergleicht den Suchlauf mit dem gemerkten Stand und liefert Meldungen.
 * Reine Funktion (kein React, kein Speicher). Gemeldet wird nur der Übergang „wird gültig“ und „Zielpunkt erreicht“,
 * nie ein Zustand, der weiter besteht. Ein Treffer ist durch Symbol, Formation, Zeiteinheit, Richtung und die
 * Zeiten seiner Punkte ohne den Zielpunkt bestimmt; der Zielpunkt gehört nicht zum Schlüssel, weil er erst später erscheint.
 */
import { FINAL_POINT, type ScanFormation, type ScanHit } from './scan';
import type { Side } from './types';

export type AlarmEvent = 'valid' | 'target';

export interface AlarmSettings {
  events: Record<AlarmEvent, boolean>;
  forms: readonly ScanFormation[];
}

/** Was zu einem Treffer schon bekannt oder gemeldet ist: gültig gewesen, Zielpunkt gesehen */
export interface Seen {
  valid: boolean;
  target: boolean;
}

export type AlarmMemory = Record<string, Seen>;

export interface AlarmNotice {
  key: string;
  symbol: string;
  form: ScanFormation;
  tf: ScanHit['tf'];
  side: Side;
  events: AlarmEvent[];
}

/** Höchstzahl gemerkter Treffer je Symbol; ältere fallen heraus */
export const MEMORY_LIMIT = 200;

export function hitKey(symbol: string, hit: ScanHit): string {
  const last = FINAL_POINT[hit.form];
  const anchors = Object.entries(hit.candidate.points)
    .filter(([name]) => name !== last)
    .map(([, anchor]) => anchor.time);
  return [symbol, hit.form, hit.tf, hit.candidate.side, anchors.join('-')].join('|');
}

/**
 * `baseline` true (Produkt ohne gemerkten Stand, z. B. gerade eingeschaltet) merkt den Stand still.
 * Abgewählte Ereignisse und Formationen werden ebenfalls gemerkt, damit späteres Einschalten nichts nachmeldet.
 * Ungültige Treffer lösen nichts aus; ein Treffer, der verschwindet, bleibt im Speicher (ein Flackern meldet nicht erneut).
 */
export function evaluateAlarm(
  symbol: string,
  hits: readonly ScanHit[],
  memory: AlarmMemory,
  settings: AlarmSettings,
  baseline: boolean,
): { notices: AlarmNotice[]; memory: AlarmMemory } {
  const notices: AlarmNotice[] = [];
  const touched: AlarmMemory = {};
  for (const hit of hits) {
    if (hit.candidate.verdict === 'invalid') continue;
    const key = hitKey(symbol, hit);
    const before = touched[key] ?? memory[key] ?? { valid: false, target: false };
    const now: Seen = {
      valid: before.valid || hit.candidate.verdict === 'valid',
      target: before.target || FINAL_POINT[hit.form] in hit.candidate.points,
    };
    touched[key] = now;
    if (baseline || !settings.forms.includes(hit.form)) continue;
    const events: AlarmEvent[] = [];
    if (now.valid && !before.valid && settings.events.valid) events.push('valid');
    if (now.target && !before.target && settings.events.target) events.push('target');
    if (events.length > 0) notices.push({ key, symbol, form: hit.form, tf: hit.tf, side: hit.candidate.side, events });
  }
  // Berührte Schlüssel wandern ans Ende, so bleiben beim Kürzen die jüngsten
  const merged: AlarmMemory = { ...memory };
  for (const key of Object.keys(touched)) delete merged[key];
  Object.assign(merged, touched);
  const keys = Object.keys(merged);
  const kept = keys.length > MEMORY_LIMIT ? keys.slice(keys.length - MEMORY_LIMIT) : keys;
  return { notices, memory: Object.fromEntries(kept.map((key) => [key, merged[key]])) };
}
