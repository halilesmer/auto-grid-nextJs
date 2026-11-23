/**
 * Verlaufsscan (FRM-39), `candidateVanished`: misst einen verschwundenen Handel zur Zeit des Verschwindens mit denselben Punkten neu (1122-A1.3.2).
 *
 * Neben der Haupt-Zeiteinheit sieht der Scan die anderen Zeiteinheiten nur bei jedem Schritt (H1-Scan, Schritt 4: M15 alle 4 Stunden).
 * Ein Handel kann zwischen zwei Scans enden und erst danach wegfallen; sein letzter gesehener Stand ist dann noch „laufend“.
 * Darum zählt der Stand zur Zeit des Verschwindens. Die Neumessung nutzt nur Kerzen, die bis dahin geschlossen sind (kein Blick nach vorn).
 * Beendet ist der Handel nur, wenn seine Endkerze vor der letzten dieser Kerzen liegt; ein Handel, der in der letzten Kerze endet, muss
 * nach 1122-A1.3 noch gezeigt werden und zählt beim Verschwinden als Verstoß.
 */
import type { FormationContext } from '../../src/lib/formation/context';
import { checkAbcdCandidate } from '../../src/lib/formation/abcdChecks';
import { checkBatCandidate } from '../../src/lib/formation/batChecks';
import { checkButCandidate } from '../../src/lib/formation/butChecks';
import { checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { checkGarCandidate } from '../../src/lib/formation/garChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import { buildEnv } from '../../src/lib/formation/reasons';
import type { Anchor, Candidate } from '../../src/lib/formation/types';

export type VanishForm = 'ABCD' | 'GAR' | 'BAT' | 'BUT' | 'CRB';

export interface VanishedTrade {
  tf: ContextTimeframe;
  form: VanishForm;
  /** Punkte, wie die Suche sie zuletzt zeigte (X nur bei Harmoniken) */
  points: { X?: Anchor; A: Anchor; B: Anchor; C: Anchor };
}

export interface Remeasured {
  /** Stand zur Zeit des Verschwindens; null ohne Handel */
  state: string | null;
  /** Endkerze vor der letzten geschlossenen Kerze */
  finished: boolean;
  /** Öffnungszeit der Endkerze; null ohne Ende */
  endTime: number | null;
}

const HARMONIC_CHECKS = { GAR: checkGarCandidate, BAT: checkBatCandidate, BUT: checkButCandidate, CRB: checkCrbCandidate } as const;

export function remeasureAtVanish(ctx: FormationContext, at: number, k: VanishedTrade): Remeasured {
  const { tf, form, points: p } = k;
  const base = { tf, a: p.A, b: p.B, c: p.C };
  let c: Candidate | null;
  if (form === 'ABCD') c = checkAbcdCandidate(ctx, at, base);
  else c = p.X ? HARMONIC_CHECKS[form](ctx, at, { ...base, x: p.X }) : null;
  const bars = buildEnv(ctx, at, tf)?.views.get(tf)?.bars ?? [];
  const endIdx = c?.trade?.status?.endIdx;
  return {
    state: c?.trade?.status?.kind ?? null,
    finished: endIdx !== undefined && endIdx < bars.length - 1,
    endTime: endIdx !== undefined ? (bars[endIdx]?.time ?? null) : null,
  };
}

/** Urteil beim Verschwinden: beendet (Zähler, kein Verstoß; Entscheidung 1120-A42.1), wenn schon der letzte Scan ein Ende sah oder die Neumessung es zeigt */
export const vanishVerdict = (lastFinished: boolean, r: Remeasured): 'finished' | 'violation' => (lastFinished || r.finished ? 'finished' : 'violation');
