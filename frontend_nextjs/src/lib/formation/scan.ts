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
