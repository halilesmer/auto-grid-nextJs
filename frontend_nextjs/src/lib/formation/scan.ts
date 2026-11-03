/**
 * Suche für die Modus Formation von /chart: alle elf Formationen auf allen vier Zeiteinheiten über einem Kontext.
 * Reine Funktion (kein React, kein Netzwerk). Ein Treffer ist ein Kandidat mit Punkten; ohne Punkte ist nichts gefunden.
 */
import { analyzeAbcd } from './abcdChecks';
import { analyzeBat } from './batChecks';
import { analyzeBut } from './butChecks';
import { analyzeCdt } from './cdtChecks';
import { analyzeCrb } from './crbChecks';
import { analyzeCyp } from './cypChecks';
import { analyze2618 } from './f2618Checks';
import { analyzeGar } from './garChecks';
import { analyzeLib } from './libChecks';
import { analyzeObo } from './oboChecks';
import { analyzeTdf } from './tdfChecks';
import type { FormationContext } from './context';
import { shareEnv } from './reasons';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from './params';
import type { Candidate, CheckState } from './types';

export const SCAN_FORMATIONS = ['ABCD', 'GAR', 'BAT', 'BUT', 'CRB', 'CYP', 'CDT', 'LIB', 'OBO', 'TDF', '2618'] as const;
export type ScanFormation = (typeof SCAN_FORMATIONS)[number];

/** Höhere Zeiteinheit für die Zone (Entwurf): H1→H4, H4→D1, D1→W1, M15→H1 */
export const UPPER_TIMEFRAME: Record<ContextTimeframe, string> = { D1: 'W1', H4: 'D1', H1: 'H4', M15: 'H1' };

/** Name des letzten Punktes einer Formation: fehlt er, ist die Formation im Aufbau (Libra: K = Berührung der Einstiegskante; Kopf-Schulter und Trendfortsetzung: B = Ausbruch; 2618: K = Berührung von 0.618) */
export const FINAL_POINT: Record<ScanFormation, string> = { ABCD: 'D', GAR: 'D', BAT: 'D', BUT: 'D', CRB: 'D', CYP: 'D', CDT: 'H2', LIB: 'K', OBO: 'B', TDF: 'B', '2618': 'K' };

/**
 * Vorletzter Punkt: ein Treffer im Aufbau zählt erst, wenn er da ist (FRM-18). Hat die Formation Unterformen mit eigenem vorletztem Punkt
 * (Trendfortsetzung), steht jeder in der Liste; ein Kandidat trägt nur die Punkte seiner Unterform, es genügt einer.
 * Libra und Kopf-Schulter setzen ihn auch vor dem fertigen Fraktal; dort zeigt der Zustand einer Bedingung (`unfinished`), dass er noch kein fertiges Fraktal ist.
 */
export const PENULTIMATE_POINT: Record<ScanFormation, { points: readonly string[]; unfinished?: { id: string; state: CheckState } }> = {
  ABCD: { points: ['C'] },
  GAR: { points: ['C'] },
  BAT: { points: ['C'] },
  BUT: { points: ['C'] },
  CRB: { points: ['C'] },
  CYP: { points: ['C'] },
  CDT: { points: ['N'] },
  LIB: { points: ['P3'], unfinished: { id: 'LIB-04', state: 'unmet' } },
  OBO: { points: ['RS'], unfinished: { id: 'OBO-02', state: 'unmeasurable' } },
  // Alle Punkte sind fertige Fraktale; Flagge C2, Dreieck H2, Schale LOW, Rechteck FLOOR
  TDF: { points: ['C2', 'H2', 'LOW', 'FLOOR'] },
  // I (Impulsende) wird auch vor dem fertigen Fraktal gesetzt; dann ist 2618-03 ☐
  '2618': { points: ['I'], unfinished: { id: '2618-03', state: 'unmet' } },
};

export interface ScanHit {
  form: ScanFormation;
  tf: ContextTimeframe;
  candidate: Candidate;
}

type Analysis = { tf: ContextTimeframe; candidate: Candidate };
/** Ergebnis einer Formation im selben Suchlauf; jede wird höchstens einmal gerechnet */
type Results = (form: ScanFormation) => Analysis[];

const candidatesOf = (results: Results, ...forms: ScanFormation[]): Candidate[] => forms.flatMap((f) => results(f).map((a) => a.candidate));

/** Die Rechner je Formation; ausgeführt wird die Suche über `scanFormations`, der Export dient dem Test der Weitergabe von Ergebnissen */
export const ANALYZERS: Record<ScanFormation, (ctx: FormationContext, t: number, results: Results) => Analysis[]> = {
  ABCD: analyzeAbcd,
  GAR: analyzeGar,
  BAT: analyzeBat,
  BUT: analyzeBut,
  CRB: analyzeCrb,
  // Die Libra in der Cypher (CYP-10) bekommt Gartley und Bat aus diesem Suchlauf, statt sie neu zu rechnen
  CYP: (ctx, t, results) => analyzeCyp(ctx, t, candidatesOf(results, 'GAR', 'BAT')),
  CDT: analyzeCdt,
  OBO: analyzeObo,
  TDF: analyzeTdf,
  '2618': analyze2618,
  // Libra misst LIB-10 an Gartley/Bat und LIB-09 an der Cypher und nimmt deren Ergebnisse aus diesem Suchlauf, statt sie neu zu rechnen
  LIB: (ctx, t, results) => analyzeLib(ctx, t, { harmonics: candidatesOf(results, 'GAR', 'BAT'), cyphers: candidatesOf(results, 'CYP') }),
};

/** Alle Formationen × geladene Zeiteinheiten zum Zeitpunkt t (MT5-Sekunden); nur Kandidaten mit Punkten */
export function scanFormations(ctx: FormationContext, t: number): ScanHit[] {
  const hits: ScanHit[] = [];
  const found = new Map<ScanFormation, Analysis[]>();
  const results: Results = (form) => {
    const known = found.get(form);
    if (known) return known;
    const computed = ANALYZERS[form](ctx, t, results);
    found.set(form, computed);
    return computed;
  };
  // Alle Formationen rechnen auf derselben Umgebung je Zeiteinheit (Befund 49)
  shareEnv(ctx, () => {
    for (const form of SCAN_FORMATIONS) {
      for (const { tf, candidate } of results(form)) {
        if (Object.keys(candidate.points).length > 0) hits.push({ form, tf, candidate });
      }
    }
  });
  return hits;
}

/** Zählt für das Badge: gültig, oder im Aufbau mit fertigem vorletztem Punkt; ungültige zählen nicht */
export function countsAsHit({ form, candidate }: ScanHit): boolean {
  if (candidate.verdict === 'valid') return true;
  if (candidate.verdict === 'invalid') return false;
  const { points, unfinished } = PENULTIMATE_POINT[form];
  if (!points.some((point) => point in candidate.points)) return false;
  if (unfinished === undefined) return true;
  return !candidate.checks.some((c) => c.id === unfinished.id && c.state === unfinished.state);
}

export const hitsCount = (hits: readonly ScanHit[], by: { form?: ScanFormation; tf?: ContextTimeframe }): number =>
  hits.filter((h) => countsAsHit(h) && (by.form === undefined || h.form === by.form) && (by.tf === undefined || h.tf === by.tf)).length;

/**
 * Klick auf eine Formation: hat die aktuelle Zeiteinheit einen Treffer, bleibt sie; sonst die erste
 * Zeiteinheit (hoch → tief) mit Treffer; ohne Treffer bleibt alles.
 */
export function timeframeForForm(hits: readonly ScanHit[], form: ScanFormation, current: ContextTimeframe): ContextTimeframe {
  const own = hits.filter((h) => h.form === form && countsAsHit(h));
  if (own.some((h) => h.tf === current)) return current;
  return CONTEXT_TIMEFRAMES.find((tf) => own.some((h) => h.tf === tf)) ?? current;
}

/** Zeitpunkt der Suche: Anfang der laufenden M15-Kerze (alles davor ist geschlossen) */
export const scanTime = (lastM15Time: number, live: boolean): number => (live ? lastM15Time : lastM15Time + 900);

/** Gebildet = gültig (FRM-29); „im Aufbau“ und ungültig zählen für Favoriten nicht (countsAsHit gilt für die Einzelansicht) */
export const isFormed = (hit: ScanHit): boolean => hit.candidate.verdict === 'valid';

/** Was die Favoriten-Suche je Produkt behält: Formation und Zeitraum eines gebildeten Treffers, je Paar einmal */
export interface FormedHit {
  form: ScanFormation;
  tf: ContextTimeframe;
}

export function formedHits(hits: readonly ScanHit[]): FormedHit[] {
  const seen = new Set<string>();
  const out: FormedHit[] = [];
  for (const h of hits) {
    const key = `${h.form}|${h.tf}`;
    if (!isFormed(h) || seen.has(key)) continue;
    seen.add(key);
    out.push({ form: h.form, tf: h.tf });
  }
  return out;
}

/** Ergebnisse der Favoriten-Suche je Produkt (Schlüssel = Produktname) */
export type FormedBySymbol = Readonly<Record<string, readonly FormedHit[]>>;

/** Formationen mit mindestens einem gebildeten Treffer im Zeitraum, mit ihren Produkten (ein Produkt je Formation einmal) */
export function formedSummary(results: FormedBySymbol, tf: ContextTimeframe): { form: ScanFormation; symbols: string[] }[] {
  return SCAN_FORMATIONS.map((form) => ({
    form,
    symbols: Object.keys(results).filter((symbol) => results[symbol].some((h) => h.form === form && h.tf === tf)),
  })).filter((x) => x.symbols.length > 0);
}

/** Zahl der Produkte mit mindestens einer gebildeten Formation im Zeitraum */
export const timeframeCount = (results: FormedBySymbol, tf: ContextTimeframe): number =>
  Object.keys(results).filter((symbol) => results[symbol].some((h) => h.tf === tf)).length;

/** Favoriten der Tabelle: im Zeitraum mit der Formation gebildet; ohne Formation alle Favoriten */
export const favoriteSymbols = (favorites: readonly string[], results: FormedBySymbol, tf: ContextTimeframe, form: ScanFormation | null): string[] =>
  form === null ? [...favorites] : favorites.filter((s) => results[s]?.some((h) => h.form === form && h.tf === tf));
