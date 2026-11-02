/**
 * Urteil und nicht messbare Pflicht: „gültig“ gilt nur, wenn keine Pflichtregel nicht messbar ist, die das Urteil blockiert.
 * Prüfer und Checkliste benutzen dasselbe Prädikat (`exemptFor`), damit der Hinweis nur Regeln nennt, die das Urteil wirklich halten.
 */
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from './params';
import type { Check, Verdict } from './types';

/** Ausnahme: diese Regel blockiert das Urteil nicht, auch wenn sie nicht messbar ist */
export type Exempt = (check: Check) => boolean;

/** Regeln, die der Prüfer ohnehin gesondert behandelt (wartender Endpunkt, ersetzte oder entschuldigte Regel); Vorsorge: heute meist nie `unmeasurable` */
const EXEMPT_IDS: Record<string, readonly string[]> = {
  ABCD: ['ABCD-07', 'ABCD-11'],
  GAR: ['GAR-05'],
  BAT: ['BAT-07'],
  BUT: ['BUT-06', 'BUT-07'],
  CRB: ['CRB-04', 'CRB-05'],
  CYP: ['CYP-07'],
  CDT: ['CDT-05'],
};

/** Ausnahmeprädikat der Formation `code` auf der Zeiteinheit `tf`; `checks` sind die Zeilen des Kandidaten */
export function exemptFor(code: string, tf: ContextTimeframe, checks: readonly Check[]): Exempt {
  const ids = EXEMPT_IDS[code] ?? [];
  const stateOf = (id: string) => checks.find((k) => k.id === id)?.state;
  return (k) =>
    k.inactive === true ||
    ids.includes(k.id) ||
    // BAT-01 gilt als entschuldigt, wenn BAT-02 erfüllt ist
    (code === 'BAT' && k.id === 'BAT-01' && stateOf('BAT-02') === 'met') ||
    // D1 ist die oberste Zeiteinheit (CONTEXT_TIMEFRAMES ohne W1): CYP-02 hat dort keine höhere Zeiteinheit.
    // Fällt weg, sobald W1 im Kontext ist (Paket D, Befund 16).
    (code === 'CYP' && k.id === 'CYP-02' && tf === CONTEXT_TIMEFRAMES[0]);
}

/** IDs der nicht messbaren Pflichtregeln, die das Urteil „gültig“ blockieren */
export const blockingUnknowns = (checks: readonly Check[], exempt: Exempt): string[] =>
  checks.filter((k) => k.kind === 'required' && k.state === 'unmeasurable' && !exempt(k)).map((k) => k.id);

/** Macht aus `valid` ein `forming`, wenn eine blockierende Pflicht nicht messbar ist; `invalid` und `forming` bleiben */
export const settle = (verdict: Verdict, checks: readonly Check[], exempt: Exempt): Verdict =>
  verdict === 'valid' && blockingUnknowns(checks, exempt).length > 0 ? 'forming' : verdict;
