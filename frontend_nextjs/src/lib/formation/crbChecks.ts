/**
 * Crab (CRB) mit Variante Deep Crab: Prüfung je Bedingungs-ID und Zeichnungen Z-CRB-01 bis Z-CRB-05.
 * `analyzeCrb` sucht je geladener Zeiteinheit die letzten Punkte X, A, B, C aus den Wendepunkten und misst D;
 * `checkCrbCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (CRB-03, CRB-05, CRB-07, CRB-09) heißt ☑ „liegt vor“, bei Ausschlüssen
 * also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“ (CRB-16 ohne tiefere Zeiteinheit im Kontext).
 * Pflicht-Level und Ausschluss-Level werden ohne Pip-Toleranz geprüft.
 * Die Bedingungen beider Varianten (CRB-06 bis CRB-09, CRB-10, CRB-11) werden immer gemessen; die Crab gilt bei CRB-06 ☑ und
 * CRB-07 ☐, die Deep Crab bei CRB-08 ☑ und CRB-09 ☐, und für eine gültige Formation genügt eine der beiden Varianten.
 */
import type { FormationContext } from './context';
import { outward } from './frz';
import { levelBC } from './cyp';
import { dTargetOfCrab, zonesNearOutsideX } from './crb';
import { CRB_PARAMS, FIB_PARAMS, type ContextTimeframe } from './params';
import type { Env } from './reasons';
import { divergenceOf, rsiExtreme } from './sig';
import {
  alternates,
  analyzeXabcd,
  anchorAt,
  atrDistance,
  checkXabcd,
  closedBeyondB,
  fractalDone,
  ids,
  levelAB,
  lowerReversal,
  retraceXA,
  levelXA,
  unmeasurable,
  zigOf,
  type XabcdAnalysis,
  type XabcdInput,
  type XabcdShape,
} from './xabcd';
import type { Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'CRB-01': ['required', 'secondary'],
  'CRB-02': ['required', 'secondary'],
  'CRB-03': ['exclusion', 'secondary'],
  'CRB-04': ['required', 'secondary'],
  'CRB-05': ['required', 'secondary'],
  'CRB-06': ['required', 'secondary'],
  'CRB-07': ['exclusion', 'secondary'],
  'CRB-08': ['required', 'secondary'],
  'CRB-09': ['exclusion', 'secondary'],
  'CRB-10': ['bonus', 'secondary'],
  'CRB-11': ['bonus', 'secondary'],
  'CRB-12': ['bonus', 'secondary'],
  'CRB-13': ['bonus', 'secondary'],
  'CRB-14': ['bonus', 'secondary'],
  'CRB-15': ['bonus', 'secondary'],
  'CRB-16': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const CRB_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form (X → A, C), eine der beiden Varianten und der Ausschluss von C */
const FORM_IDS = ['CRB-01', 'CRB-02'];
const POINT_EXCLUSIONS = ['CRB-03'];

export type CrbPointsInput = XabcdInput;
export type CrbAnalysis = XabcdAnalysis;

const P = CRB_PARAMS;
const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

/** Die Crab (CRB-06 ☑, CRB-07 ☐) oder die Deep Crab (CRB-08 ☑, CRB-09 ☐) liegt vor */
const variantOk = (stateOf: (id: string) => CheckState): boolean =>
  (stateOf('CRB-06') === 'met' && stateOf('CRB-07') === 'unmet') || (stateOf('CRB-08') === 'met' && stateOf('CRB-09') === 'unmet');

/** Kleinster Abstand (in ATR) zwischen dem Ziel-D und den Rückprojektionen der Strecke B → C; null ohne ATR */
const nearestInversion = (s: XabcdShape, ratios: readonly number[], dTarget: number, atr: number | null): number | null => {
  const dists = ratios.map((r) => atrDistance(levelBC(s, r), dTarget, atr));
  return dists.includes(null) ? null : Math.min(...(dists as number[]));
};

function evaluate(env: Env, tf: ContextTimeframe, s: XabcdShape): Candidate {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const { x, a, b, c, d, es, cs, side, abcd } = s;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  // Gemeinsamer Kern: Impuls X → A, C an 0.382 bis unter 0.886, D an 1.618, Bruch von B
  const impulse = trend.pivots.some((p) => p.idx === a.idx && p.side === cs && p.kind === 'impulse');
  add('CRB-01', flag(fractalDone(bars, x, es) && fractalDone(bars, a, cs) && impulse && alternates(s)));
  const rC = abcd.depth;
  add('CRB-02', flag(rC !== null && outward(cs, c.price) >= outward(cs, levelAB(s, P.cMin))), rC ?? undefined);
  add('CRB-03', rC === null ? U : flag(rC >= P.cExclude), rC ?? undefined);
  const rD = d ? retraceXA(s, d.price) : null;
  add('CRB-04', flag(d !== null && outward(es, d.price) >= outward(es, levelXA(s, 1 + P.dExtension))), rD ?? undefined);
  add('CRB-05', flag(closedBeyondB(bars, s)));

  // Varianten: B der Crab 0.382 bis unter 0.786, B der Deep Crab 0.886 bis unter 1.0
  const rB = retraceXA(s, b.price);
  add('CRB-06', flag(outward(es, b.price) >= outward(es, levelXA(s, P.crabBMin))), rB ?? undefined);
  add('CRB-07', rB === null ? U : flag(rB >= P.crabBExclude), rB ?? undefined);
  add('CRB-08', flag(outward(es, b.price) >= outward(es, levelXA(s, P.deepBMin))), rB ?? undefined);
  add('CRB-09', rB === null ? U : flag(rB >= P.deepBExclude), rB ?? undefined);

  // Filter: PRZ-Level am D, Zone, Signal am D, Zeiteinheit
  const dTarget = dTargetOfCrab(s);
  const atr = view.atr[d ? d.idx : last] ?? null;
  const crabPrz = nearestInversion(s, P.crabInversions, dTarget, atr);
  add('CRB-10', crabPrz === null ? U : flag(crabPrz <= P.nearAtr), crabPrz ?? undefined);
  const deepPrz = nearestInversion(s, P.deepInversions, dTarget, atr);
  add('CRB-11', deepPrz === null ? U : flag(deepPrz <= P.nearAtr), deepPrz ?? undefined);
  add('CRB-12', flag(zonesNearOutsideX(env, tf, s, dTarget, 0).length > 0));
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  add('CRB-13', rsiD === null ? U : tri(rsiExtreme(rsiD, side)), rsiD ?? undefined);
  const div = d ? divergenceOf(trend, es, b.idx, d.idx) : null;
  add('CRB-14', !div || div.a.wave === null || div.b.wave === null ? U : flag(div.tie));
  add('CRB-15', flag(tf === P.preferredTimeframe));
  add('CRB-16', lowerReversal(env, tf, s));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  const reached = stateOf('CRB-04') === 'met';
  const drawings = drawingsOf(env, tf, s, reached);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  // Bruch von B (CRB-05) und D (CRB-04) fehlen nur noch: im Aufbau
  const pending = (id: string) => id === 'CRB-04' || id === 'CRB-05';
  const variantIds = ['CRB-06', 'CRB-07', 'CRB-08', 'CRB-09'];
  let verdict: Verdict = 'valid';
  if (stateOf('CRB-03') === 'met' || !variantOk(stateOf)) verdict = 'invalid';
  else if (checks.some((k) => k.kind === 'required' && k.state === 'unmet' && !pending(k.id) && !variantIds.includes(k.id))) verdict = 'invalid';
  else if (checks.some((k) => pending(k.id) && k.state === 'unmet')) verdict = 'forming';

  const points: Candidate['points'] = {
    X: anchorAt(bars, x.idx, x.price),
    A: anchorAt(bars, a.idx, a.price),
    B: anchorAt(bars, b.idx, b.price),
    C: anchorAt(bars, c.idx, c.price),
  };
  if (d) points.D = anchorAt(bars, d.idx, d.price);
  return { code: 'CRB', side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, tf: ContextTimeframe, s: XabcdShape, reached: boolean): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const { x, a, b, c, d, side } = s;
  const [low, strong, far, deep] = [FIB_PARAMS.retrace[0], FIB_PARAMS.retrace[2], FIB_PARAMS.levels[4], FIB_PARAMS.lastLevel];
  const out: Drawing[] = [
    {
      id: 'Z-CRB-01',
      tool: 'fib',
      anchors: [anchorAt(bars, x.idx, x.price), anchorAt(bars, a.idx, a.price)],
      levels: [low, strong, far, deep, P.deepBExclude, 1 + P.dExtension],
      rules: ids('CRB', [4, 6, 7, 8, 9]),
      side,
    },
    { id: 'Z-CRB-02', tool: 'fib', anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, b.idx, b.price)], levels: [low, far, deep], rules: ids('CRB', [2, 3]), side },
    {
      id: 'Z-CRB-03',
      tool: 'fib',
      anchors: [anchorAt(bars, b.idx, b.price), anchorAt(bars, c.idx, c.price)],
      levels: [...new Set([...P.deepInversions, ...P.crabInversions])],
      rules: ids('CRB', [10, 11]),
      side,
    },
    { id: 'Z-CRB-05', tool: 'zigzag', anchors: zigOf(bars, s, reached), rules: ids('CRB', [1, 2, 3, 4, 5, 6, 7, 8, 9]), side },
  ];
  if (d && reached) {
    const t = P.targets;
    out.push({ id: 'Z-CRB-04', tool: 'fib', anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, d.idx, d.price)], levels: [t.tp1, t.tp2, -t.stop], rules: [], side });
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('CRB', tf, CRB_CHECK_IDS, RULES);

const misses = (cand: Candidate): number => {
  const state = (id: string) => cand.checks.find((k) => k.id === id)!.state;
  const unmetForm = FORM_IDS.filter((id) => state(id) === 'unmet').length;
  const excluded = POINT_EXCLUSIONS.filter((id) => state(id) === 'met').length;
  return unmetForm + excluded + (variantOk(state) ? 0 : 1);
};

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte X, A, B, C und misst D */
export const analyzeCrb = (ctx: FormationContext, t: number): CrbAnalysis[] => analyzeXabcd(ctx, t, evaluate, misses, empty);

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export const checkCrbCandidate = (ctx: FormationContext, t: number, input: CrbPointsInput): Candidate => checkXabcd(ctx, t, input, evaluate, empty);
