/**
 * Gartley (GAR): Prüfung je Bedingungs-ID und Zeichnungen Z-GAR-01 bis Z-GAR-06.
 * `analyzeGar` sucht je geladener Zeiteinheit die letzten Punkte X, A, B, C aus den Wendepunkten und misst D;
 * `checkGarCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (GAR-05, GAR-15 bis GAR-20) heißt ☑ „liegt vor“, bei Ausschlüssen
 * also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“. Pflicht-Level (GAR-03 bis GAR-05)
 * gelten bis 1 Pip davor als berührt, die Verbots-Level (GAR-15, GAR-16) ohne Toleranz.
 */
import type { FormationContext } from './context';
import { zoneGeometry, outward } from './frz';
import { nearEdge } from './cdt';
import { divergenceOf, rsiExtreme } from './sig';
import { ABCD_PARAMS, FIB_PARAMS, GAR_PARAMS, HARMONIC_PARAMS, type ContextTimeframe } from './params';
import type { Env } from './reasons';
import {
  analyzeXabcd,
  anchorAt,
  atrDistance,
  checkXabcd,
  closedBeyondX,
  enoughSpace,
  fractalDone,
  higherAgainst,
  ids,
  lenAB,
  levelAB,
  alternates,
  reaches,
  retraceXA,
  unmeasurable,
  zigOf,
  zonesNear,
  type XabcdAnalysis,
  type XabcdInput,
  type XabcdShape,
} from './xabcd';
import type { Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'GAR-01': ['required', 'confirmed'],
  'GAR-02': ['required', 'confirmed'],
  'GAR-03': ['required', 'confirmed'],
  'GAR-04': ['required', 'confirmed'],
  'GAR-05': ['required', 'confirmed'],
  'GAR-06': ['bonus', 'confirmed'],
  'GAR-07': ['bonus', 'secondary'],
  'GAR-08': ['required', 'confirmed'],
  'GAR-09': ['required', 'assumption'],
  'GAR-10': ['bonus', 'confirmed'],
  'GAR-11': ['bonus', 'assumption'],
  'GAR-12': ['bonus', 'confirmed'],
  'GAR-13': ['bonus', 'confirmed'],
  'GAR-14': ['bonus', 'confirmed'],
  'GAR-15': ['exclusion', 'confirmed'],
  'GAR-16': ['exclusion', 'confirmed'],
  'GAR-17': ['exclusion', 'confirmed'],
  'GAR-18': ['exclusion', 'confirmed'],
  'GAR-19': ['exclusion', 'assumption'],
  'GAR-20': ['exclusion', 'confirmed'],
  'GAR-21': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const GAR_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form, AB=CD im Inneren und die Ausschlüsse der Punkte */
const FORM_IDS = ['GAR-01', 'GAR-02', 'GAR-03', 'GAR-04', 'GAR-08'];
const POINT_EXCLUSIONS = ['GAR-15', 'GAR-16', 'GAR-17'];

export type GarPointsInput = XabcdInput;
export type GarAnalysis = XabcdAnalysis;

const G = GAR_PARAMS;
const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

function evaluate(env: Env, tf: ContextTimeframe, s: XabcdShape, pip: number): Candidate {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const { x, a, b, c, d, es, cs, side, len, abcd } = s;
  const abLen = lenAB(s);
  const tol = HARMONIC_PARAMS.touchPips * pip;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  // Form
  const fractals = fractalDone(bars, x, es) && fractalDone(bars, a, cs);
  const impulse = trend.pivots.some((p) => p.idx === a.idx && p.side === cs && p.kind === 'impulse');
  add('GAR-01', flag(fractals && impulse));
  add('GAR-02', flag(alternates(s)));
  const rB = retraceXA(s, b.price);
  add('GAR-03', flag(reaches(rB, G.bLevel, len, pip)), rB ?? undefined);
  const rC = abcd.depth;
  add('GAR-04', flag(reaches(rC, G.cLevel, abLen, pip)), rC ?? undefined);
  const dTarget = levelAB(s, -G.dExtension);
  const extension = d && abLen > 0 ? (outward(es, d.price) - outward(es, b.price)) / abLen : undefined;
  add('GAR-05', flag(d !== null && outward(es, d.price) >= outward(es, dTarget) - tol), extension);
  const reached = checks.find((k) => k.id === 'GAR-05')!.state === 'met';
  add('GAR-06', rC === null ? U : flag(rC < G.cClean), rC ?? undefined);
  const rD = d ? retraceXA(s, d.price) : null;
  add('GAR-07', rD === null ? U : flag(Math.abs(rD - G.dAtX.level) <= G.dAtX.tolerance), rD ?? undefined);

  // Ort und Kontext
  add('GAR-08', flag(rC !== null && rC >= ABCD_PARAMS.minCorrection && rC <= ABCD_PARAMS.maxCorrection), rC ?? undefined);
  const atr = view.atr[d ? d.idx : last] ?? null;
  const dist = atrDistance(abcd.level1, dTarget, atr);
  add('GAR-09', dist === null ? U : flag(dist <= HARMONIC_PARAMS.nearAtr), dist ?? undefined);
  add('GAR-10', flag(zonesNear(env, tf, s, d && reached ? d.price : dTarget, 0).length > 0));
  add('GAR-11', tri(enoughSpace(s, last, atr)));
  add('GAR-12', flag(HARMONIC_PARAMS.highTimeframes.includes(tf)));

  // Signal am D
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  add('GAR-13', rsiD === null ? U : tri(rsiExtreme(rsiD, side)), rsiD ?? undefined);
  const div = d ? divergenceOf(trend, es, b.idx, d.idx) : null;
  add('GAR-14', !div || div.a.wave === null || div.b.wave === null ? U : flag(div.tie));

  // Ausschluss
  add('GAR-15', rB === null ? U : flag(rB >= G.bExclude), rB ?? undefined);
  add('GAR-16', rC === null ? U : flag(rC >= G.cExclude), rC ?? undefined);
  const zoneA = zoneGeometry(bars, a.idx, cs, tf);
  add('GAR-17', flag(outward(cs, c.price) >= outward(cs, nearEdge(cs, zoneA))));
  add('GAR-18', flag(closedBeyondX(env, tf, s)));
  add('GAR-19', higherAgainst(env, side));
  add('GAR-20', flag(HARMONIC_PARAMS.excludedTimeframes.includes(tf)));
  const xPos = trend.pivots.findIndex((p) => p.idx === x.idx && p.side === es);
  const oneStep = xPos >= 0 && trend.pivots[xPos + 1]?.idx === a.idx;
  add('GAR-21', flag(fractals && impulse && oneStep));

  const drawings = drawingsOf(env, tf, s, dTarget, reached);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  let verdict: Verdict = 'valid';
  if (['GAR-15', 'GAR-16', 'GAR-17', 'GAR-18', 'GAR-19', 'GAR-20'].some((id) => stateOf(id) === 'met')) verdict = 'invalid';
  else if (checks.some((k) => k.kind === 'required' && k.state === 'unmet' && k.id !== 'GAR-05')) verdict = 'invalid';
  else if (stateOf('GAR-05') === 'unmet') verdict = 'forming';

  const points: Candidate['points'] = {
    X: anchorAt(bars, x.idx, x.price),
    A: anchorAt(bars, a.idx, a.price),
    B: anchorAt(bars, b.idx, b.price),
    C: anchorAt(bars, c.idx, c.price),
  };
  if (d) points.D = anchorAt(bars, d.idx, d.price);
  return { code: 'GAR', side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, tf: ContextTimeframe, s: XabcdShape, dTarget: number, reached: boolean): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const lastTime = bars[bars.length - 1].time;
  const { x, a, b, c, d, side, abcd } = s;
  const [half, golden, far, last] = [FIB_PARAMS.retrace[1], FIB_PARAMS.retrace[2], FIB_PARAMS.farLevel, FIB_PARAMS.lastLevel];
  const out: Drawing[] = [
    { id: 'Z-GAR-01', tool: 'zigzag', anchors: zigOf(bars, s, reached), rules: ids('GAR', [1, 2, 3, 4, 5]), side },
    {
      id: 'Z-GAR-02',
      tool: 'fib',
      anchors: [anchorAt(bars, x.idx, x.price), anchorAt(bars, a.idx, a.price)],
      levels: [half, golden, far, last],
      rules: ids('GAR', [3, 7, 15]),
      side,
    },
    {
      id: 'Z-GAR-03',
      tool: 'fib',
      anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, b.idx, b.price)],
      levels: [G.cLevel, G.cClean, G.cExclude, -G.dExtension],
      rules: ids('GAR', [4, 5, 6, 16]),
      side,
    },
    { id: 'Z-GAR-04', tool: 'hline', anchors: [anchorAt(bars, c.idx, abcd.level1)], levels: [1], rules: ids('GAR', [8, 9]), side },
    {
      id: 'Z-GAR-05',
      tool: 'zone',
      anchors: [
        anchorAt(bars, c.idx, Math.min(abcd.level1, dTarget)),
        { time: lastTime, price: Math.max(abcd.level1, dTarget) },
      ],
      rules: ids('GAR', [8, 9]),
      side,
    },
  ];
  if (d && reached) {
    const t = HARMONIC_PARAMS.targets;
    out.push({
      id: 'Z-GAR-06',
      tool: 'fib',
      anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, d.idx, d.price)],
      levels: [t.tp1, t.tp2, -t.stop],
      rules: [],
      side,
    });
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('GAR', tf, GAR_CHECK_IDS, RULES);

const misses = (cand: Candidate): number =>
  cand.checks.filter((k) => (FORM_IDS.includes(k.id) && k.state === 'unmet') || (POINT_EXCLUSIONS.includes(k.id) && k.state === 'met')).length;

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte X, A, B, C und misst D */
export const analyzeGar = (ctx: FormationContext, t: number): GarAnalysis[] => analyzeXabcd(ctx, t, evaluate, misses, empty);

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export const checkGarCandidate = (ctx: FormationContext, t: number, input: GarPointsInput): Candidate => checkXabcd(ctx, t, input, evaluate, empty);
