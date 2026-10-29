/**
 * Butterfly (BUT): Prüfung je Bedingungs-ID und Zeichnungen Z-BUT-01 bis Z-BUT-06.
 * `analyzeBut` sucht je geladener Zeiteinheit die letzten Punkte X, A, B, C aus den Wendepunkten und misst D;
 * `checkButCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (BUT-03, BUT-05, BUT-06, BUT-07) heißt ☑ „liegt vor“, bei Ausschlüssen
 * also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“ (BUT-15 und BUT-16 ohne höhere bzw. tiefere
 * Zeiteinheit im Kontext). Pflicht-Level und Ausschluss-Level werden ohne Pip-Toleranz geprüft.
 * Der Formkern ist Pflicht/Ausschluss, die Filter (BUT-08 bis BUT-16) sind Verstärkung.
 */
import type { FormationContext } from './context';
import { outward } from './frz';
import { abExtensionPrice, dTargetOfButterfly } from './but';
import { levelBC } from './cyp';
import { BUT_PARAMS, FIB_PARAMS, HARMONIC_PARAMS, type ContextTimeframe } from './params';
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
  higherWith,
  ids,
  levelAB,
  lowerReversal,
  retraceXA,
  levelXA,
  unmeasurable,
  zigOf,
  zonesNear,
  type XabcdAnalysis,
  type XabcdInput,
  type XabcdShape,
} from './xabcd';
import type { Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'BUT-01': ['required', 'secondary'],
  'BUT-02': ['required', 'secondary'],
  'BUT-03': ['exclusion', 'secondary'],
  'BUT-04': ['required', 'secondary'],
  'BUT-05': ['exclusion', 'secondary'],
  'BUT-06': ['required', 'secondary'],
  'BUT-07': ['required', 'secondary'],
  'BUT-08': ['bonus', 'secondary'],
  'BUT-09': ['bonus', 'secondary'],
  'BUT-10': ['bonus', 'secondary'],
  'BUT-11': ['bonus', 'secondary'],
  'BUT-12': ['bonus', 'secondary'],
  'BUT-13': ['bonus', 'secondary'],
  'BUT-14': ['bonus', 'secondary'],
  'BUT-15': ['bonus', 'secondary'],
  'BUT-16': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const BUT_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form (X → A, B, C) und die Ausschlüsse der Punkte */
const FORM_IDS = ['BUT-01', 'BUT-02', 'BUT-04'];
const POINT_EXCLUSIONS = ['BUT-03', 'BUT-05'];

export type ButPointsInput = XabcdInput;
export type ButAnalysis = XabcdAnalysis;

const P = BUT_PARAMS;
const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

function evaluate(env: Env, tf: ContextTimeframe, s: XabcdShape): Candidate {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const { x, a, b, c, d, es, cs, side, abcd } = s;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  // Formkern: Impuls X → A, B an 0.786 bis unter 0.886, C an 0.382 bis unter 0.886, Bruch von B, D an 1.272
  const impulse = trend.pivots.some((p) => p.idx === a.idx && p.side === cs && p.kind === 'impulse');
  add('BUT-01', flag(fractalDone(bars, x, es) && fractalDone(bars, a, cs) && impulse && alternates(s)));
  const rB = retraceXA(s, b.price);
  add('BUT-02', flag(outward(es, b.price) >= outward(es, levelXA(s, P.bLevel))), rB ?? undefined);
  add('BUT-03', rB === null ? U : flag(rB >= P.bExclude), rB ?? undefined);
  const rC = abcd.depth;
  add('BUT-04', flag(rC !== null && outward(cs, c.price) >= outward(cs, levelAB(s, P.cMin))), rC ?? undefined);
  add('BUT-05', rC === null ? U : flag(rC >= P.cExclude), rC ?? undefined);
  add('BUT-06', flag(closedBeyondB(bars, s)));
  const rD = d ? retraceXA(s, d.price) : null;
  add('BUT-07', flag(d !== null && outward(es, d.price) >= outward(es, levelXA(s, 1 + P.dExtension))), rD ?? undefined);

  // Filter: C tief, PRZ-Level am D, Zone, Signal am D, höhere und tiefere Zeiteinheit
  add('BUT-08', rC === null ? U : flag(outward(cs, c.price) >= outward(cs, levelAB(s, P.cStrong))), rC ?? undefined);
  const dTarget = dTargetOfButterfly(s);
  const atr = view.atr[d ? d.idx : last] ?? null;
  const prz = atrDistance(levelBC(s, P.bcInversion), dTarget, atr);
  add('BUT-09', prz === null ? U : flag(prz <= P.nearAtr), prz ?? undefined);
  const ext = atrDistance(abExtensionPrice(s), dTarget, atr);
  add('BUT-10', ext === null ? U : flag(ext <= P.nearAtr), ext ?? undefined);
  const inner = atrDistance(abcd.level1, dTarget, atr);
  add('BUT-11', inner === null ? U : flag(inner <= HARMONIC_PARAMS.nearAtr), inner ?? undefined);
  add('BUT-12', flag(zonesNear(env, tf, s, dTarget, 0).length > 0));
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  add('BUT-13', rsiD === null ? U : tri(rsiExtreme(rsiD, side)), rsiD ?? undefined);
  const div = d ? divergenceOf(trend, es, b.idx, d.idx) : null;
  add('BUT-14', !div || div.a.wave === null || div.b.wave === null ? U : flag(div.tie));
  add('BUT-15', higherWith(env, tf, side));
  add('BUT-16', lowerReversal(env, tf, s));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  const reached = stateOf('BUT-07') === 'met';
  const drawings = drawingsOf(env, tf, s, reached);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  // Bruch von B (BUT-06) und D (BUT-07) fehlen nur noch: im Aufbau
  const pending = (k: Check) => k.id === 'BUT-06' || k.id === 'BUT-07';
  let verdict: Verdict = 'valid';
  if (POINT_EXCLUSIONS.some((id) => stateOf(id) === 'met')) verdict = 'invalid';
  else if (checks.some((k) => k.kind === 'required' && k.state === 'unmet' && !pending(k))) verdict = 'invalid';
  else if (checks.some((k) => pending(k) && k.state === 'unmet')) verdict = 'forming';

  const points: Candidate['points'] = {
    X: anchorAt(bars, x.idx, x.price),
    A: anchorAt(bars, a.idx, a.price),
    B: anchorAt(bars, b.idx, b.price),
    C: anchorAt(bars, c.idx, c.price),
  };
  if (d) points.D = anchorAt(bars, d.idx, d.price);
  return { code: 'BUT', side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, tf: ContextTimeframe, s: XabcdShape, reached: boolean): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const { x, a, b, c, d, side } = s;
  const [low, strong, far, last] = [FIB_PARAMS.retrace[0], FIB_PARAMS.retrace[2], FIB_PARAMS.levels[4], FIB_PARAMS.lastLevel];
  const out: Drawing[] = [
    { id: 'Z-BUT-01', tool: 'fib', anchors: [anchorAt(bars, x.idx, x.price), anchorAt(bars, a.idx, a.price)], levels: [P.bLevel, P.bExclude, 1 + P.dExtension], rules: ids('BUT', [2, 3, 7]), side },
    { id: 'Z-BUT-02', tool: 'fib', anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, b.idx, b.price)], levels: [low, strong, far, last, -P.abExtension], rules: ids('BUT', [4, 5, 8, 10]), side },
    { id: 'Z-BUT-03', tool: 'fib', anchors: [anchorAt(bars, b.idx, b.price), anchorAt(bars, c.idx, c.price)], levels: [P.bcInversion], rules: ids('BUT', [9]), side },
    { id: 'Z-BUT-04', tool: 'fibExt', anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, b.idx, b.price), anchorAt(bars, c.idx, c.price)], levels: [1], rules: ids('BUT', [11]), side },
    { id: 'Z-BUT-06', tool: 'zigzag', anchors: zigOf(bars, s, reached), rules: ids('BUT', [1, 2, 3, 4, 5, 6, 7]), side },
  ];
  if (d && reached) {
    const t = P.targets;
    out.push({ id: 'Z-BUT-05', tool: 'fib', anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, d.idx, d.price)], levels: [t.tp1, t.tp2, -t.stop], rules: [], side });
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('BUT', tf, BUT_CHECK_IDS, RULES);

const misses = (cand: Candidate): number =>
  cand.checks.filter((k) => (FORM_IDS.includes(k.id) && k.state === 'unmet') || (POINT_EXCLUSIONS.includes(k.id) && k.state === 'met')).length;

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte X, A, B, C und misst D */
export const analyzeBut = (ctx: FormationContext, t: number): ButAnalysis[] => analyzeXabcd(ctx, t, evaluate, misses, empty);

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export const checkButCandidate = (ctx: FormationContext, t: number, input: ButPointsInput): Candidate => checkXabcd(ctx, t, input, evaluate, empty);
