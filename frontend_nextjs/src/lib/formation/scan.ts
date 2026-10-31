/**
 * Suche für die Seite /formasyon: alle sieben Formationen auf allen vier Zeiteinheiten über einem Kontext.
 * Reine Funktion (kein React, kein Netzwerk). Ein Treffer ist ein Kandidat mit Punkten; ohne Punkte ist nichts gefunden.
 */
import { analyzeAbcd } from './abcdChecks';
import { analyzeBat } from './batChecks';
import { analyzeBut } from './butChecks';
import { analyzeCdt } from './cdtChecks';
import { analyzeCrb } from './crbChecks';
import { analyzeCyp } from './cypChecks';
import { analyzeGar } from './garChecks';
import type { FormationContext } from './context';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from './params';
import type { Candidate } from './types';

export const SCAN_FORMATIONS = ['ABCD', 'GAR', 'BAT', 'BUT', 'CRB', 'CYP', 'CDT'] as const;
export type ScanFormation = (typeof SCAN_FORMATIONS)[number];

/** Höhere Zeiteinheit für die Zone (Entwurf): H1→H4, H4→D1, D1→W1, M15→H1 */
export const UPPER_TIMEFRAME: Record<ContextTimeframe, string> = { D1: 'W1', H4: 'D1', H1: 'H4', M15: 'H1' };

/** Name des letzten Punktes einer Formation: fehlt er, ist die Formation im Aufbau */
export const FINAL_POINT: Record<ScanFormation, string> = { ABCD: 'D', GAR: 'D', BAT: 'D', BUT: 'D', CRB: 'D', CYP: 'D', CDT: 'H2' };

export interface ScanHit {
  form: ScanFormation;
  tf: ContextTimeframe;
  candidate: Candidate;
}

const ANALYZERS: Record<ScanFormation, (ctx: FormationContext, t: number) => { tf: ContextTimeframe; candidate: Candidate }[]> = {
  ABCD: analyzeAbcd,
  GAR: analyzeGar,
  BAT: analyzeBat,
  BUT: analyzeBut,
  CRB: analyzeCrb,
  CYP: analyzeCyp,
  CDT: analyzeCdt,
};

/** Alle Formationen × geladene Zeiteinheiten zum Zeitpunkt t (MT5-Sekunden); nur Kandidaten mit Punkten */
export function scanFormations(ctx: FormationContext, t: number): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const form of SCAN_FORMATIONS) {
    for (const { tf, candidate } of ANALYZERS[form](ctx, t)) {
      if (Object.keys(candidate.points).length > 0) hits.push({ form, tf, candidate });
    }
  }
  return hits;
}

/** Zählt für das Badge: gültig oder im Aufbau; ungültige zählen nicht */
export const countsAsHit = (hit: ScanHit): boolean => hit.candidate.verdict !== 'invalid';

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
