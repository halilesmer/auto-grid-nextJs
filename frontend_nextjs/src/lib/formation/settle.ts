/**
 * Urteil und nicht messbare Pflicht: „gültig“ gilt nur, wenn keine Pflichtregel nicht messbar ist, die das Urteil blockiert.
 * Prüfer und Checkliste benutzen dasselbe Prädikat (`exemptFor`), damit der Hinweis nur Regeln nennt, die das Urteil wirklich halten.
 */
import type { Check, Verdict } from './types';

/** Ausnahme: diese Regel blockiert das Urteil nicht, auch wenn sie nicht messbar ist */
export type Exempt = (check: Check) => boolean;

/** Ausnahmeprädikat der Formation `code`; `checks` sind die Zeilen des Kandidaten */
export function exemptFor(code: string, checks: readonly Check[]): Exempt {
  const stateOf = (id: string) => checks.find((k) => k.id === id)?.state;
  return (k) =>
    k.inactive === true ||
    // Wartende Regeln (Endpunkt, Berührung) sind nicht ausgenommen: nicht messbar heißt, der Endpunkt ist nicht gemessen, also im Aufbau
    // BAT-01 gilt als entschuldigt, wenn BAT-02 erfüllt ist
    (code === 'BAT' && k.id === 'BAT-01' && stateOf('BAT-02') === 'met') ||
    // Regelbuch cdt-doppeltop.md E-1: RSI-Extrem (CDT-12) oder Umkehrkerze (CDT-13), eine von beiden genügt
    (code === 'CDT' && k.id === 'CDT-12' && stateOf('CDT-13') === 'met');
}

/** IDs der nicht messbaren Pflichtregeln, die das Urteil „gültig“ blockieren */
export const blockingUnknowns = (checks: readonly Check[], exempt: Exempt): string[] =>
  checks.filter((k) => k.kind === 'required' && k.state === 'unmeasurable' && !exempt(k)).map((k) => k.id);

/** Macht aus `valid` ein `forming`, wenn eine blockierende Pflicht nicht messbar ist; `invalid` und `forming` bleiben */
export const settle = (verdict: Verdict, checks: readonly Check[], exempt: Exempt): Verdict =>
  verdict === 'valid' && blockingUnknowns(checks, exempt).length > 0 ? 'forming' : verdict;
