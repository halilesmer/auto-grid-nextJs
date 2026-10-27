/**
 * Bat (BAT): Prüfung je Bedingungs-ID und Zeichnungen Z-BAT-01 bis Z-BAT-06.
 * `analyzeBat` sucht je geladener Zeiteinheit die letzten Punkte X, A, B, C aus den Wendepunkten und misst D;
 * `checkBatCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (BAT-07, BAT-14 bis BAT-17) heißt ☑ „liegt vor“, bei Ausschlüssen
 * also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“. Pflicht-Level (BAT-05 bis BAT-07)
 * gelten bis 1 Pip davor als berührt, das Verbots-Level (BAT-14) ohne Toleranz. Die Art von BAT-02 hängt von BAT-01 ab:
 * Ersatz (Pflicht), wenn X → A noch kein Impuls nach dem Trend ist, sonst Verstärkung.
 */
import type { FormationContext } from './context';
import { zoneGeometry, outward } from './frz';
import { nearEdge } from './cdt';
import { rsiExtreme } from './sig';
import { ABCD_PARAMS, BAT_PARAMS, HARMONIC_PARAMS, type ContextTimeframe } from './params';
import type { Env } from './reasons';
import {
  analyzeXabcd,
  anchorAt,
  atrDistance,
  checkXabcd,
  closedBeyondX,
  enoughSpace,
  fractalDone,
  ids,
  lenAB,
  levelXA,
  oneMove,
  alternates,
  reaches,
  retraceXA,
  unmeasurable,
  wideShareOfMove,
  zigOf,
  zonesNear,
  type XabcdAnalysis,
  type XabcdInput,
  type XabcdShape,
} from './xabcd';
import type { Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'BAT-01': ['required', 'confirmed'],
  'BAT-02': ['required', 'assumption'],
  'BAT-03': ['required', 'confirmed'],
  'BAT-04': ['required', 'confirmed'],
  'BAT-05': ['required', 'confirmed'],
  'BAT-06': ['required', 'confirmed'],
  'BAT-07': ['required', 'confirmed'],
  'BAT-08': ['required', 'confirmed'],
  'BAT-09': ['required', 'assumption'],
  'BAT-10': ['bonus', 'assumption'],
  'BAT-11': ['bonus', 'confirmed'],
  'BAT-12': ['bonus', 'confirmed'],
  'BAT-13': ['bonus', 'secondary'],
  'BAT-14': ['exclusion', 'confirmed'],
  'BAT-15': ['exclusion', 'confirmed'],
  'BAT-16': ['exclusion', 'confirmed'],
  'BAT-17': ['exclusion', 'confirmed'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const BAT_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form, AB=CD im Inneren und die Ausschlüsse der Punkte */
const FORM_IDS = ['BAT-01', 'BAT-03', 'BAT-04', 'BAT-05', 'BAT-06', 'BAT-08'];
const POINT_EXCLUSIONS = ['BAT-14', 'BAT-15'];

export type BatPointsInput = XabcdInput;
export type BatAnalysis = XabcdAnalysis;

const B = BAT_PARAMS;
const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number, kind?: RuleKind): Check => {
  const [defaultKind, status] = RULES[id];
  return { id, kind: kind ?? defaultKind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

function evaluate(env: Env, tf: ContextTimeframe, s: XabcdShape, pip: number): Candidate {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const { x, a, b, c, d, es, cs, side, len, abcd } = s;
  const abLen = lenAB(s);
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number, kind?: RuleKind) => checks.push(mk(id, state, value, kind));

  // Form
  const impulse = trend.pivots.some((p) => p.idx === a.idx && p.side === cs && p.kind === 'impulse');
  const impulseState = flag(fractalDone(bars, x, es) && fractalDone(bars, a, cs) && impulse);
  add('BAT-01', impulseState);
  add('BAT-02', tri(wideShareOfMove(view.wide, s)), undefined, impulseState === 'met' ? 'bonus' : 'required');
  add('BAT-03', flag(oneMove(bars, s)));
  add('BAT-04', flag(alternates(s)));
  const rB = retraceXA(s, b.price);
  add('BAT-05', flag(reaches(rB, B.bLevel, len, pip)), rB ?? undefined);
  const rC = abcd.depth;
  add('BAT-06', flag(reaches(rC, B.cMin, abLen, pip)), rC ?? undefined);
  const dLevel = levelXA(s, B.dLevel);
  const rD = d ? retraceXA(s, d.price) : null;
  add('BAT-07', flag(d !== null && outward(es, d.price) > outward(es, b.price) && reaches(rD, B.dLevel, len, pip)), rD ?? undefined);

  // Ort und Kontext
  add('BAT-08', flag(reaches(rC, ABCD_PARAMS.minCorrection, abLen, pip) && rC !== null && rC <= ABCD_PARAMS.maxCorrection), rC ?? undefined);
  const atr = view.atr[d ? d.idx : last] ?? null;
  const dist = atrDistance(abcd.level1, dLevel, atr);
  add('BAT-09', dist === null ? U : flag(dist <= HARMONIC_PARAMS.nearAtr), dist ?? undefined);
  add('BAT-10', tri(enoughSpace(s, last, atr)));
  const near = atr === null ? null : HARMONIC_PARAMS.zoneAtr * atr;
  add('BAT-11', near === null ? U : flag(zonesNear(env, tf, s, dLevel, near).length > 0));
  add('BAT-12', flag(HARMONIC_PARAMS.highTimeframes.includes(tf)));

  // Signal am Einstieg (die Divergenz am D ist egal und hat keine Zeile)
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  add('BAT-13', rsiD === null ? U : tri(rsiExtreme(rsiD, side)), rsiD ?? undefined);

  // Ausschluss
  add('BAT-14', rB === null ? U : flag(rB >= B.bExclude), rB ?? undefined);
  const zoneA = zoneGeometry(bars, a.idx, cs, tf);
  add('BAT-15', flag(outward(cs, c.price) >= outward(cs, nearEdge(cs, zoneA))));
  add('BAT-16', flag(HARMONIC_PARAMS.excludedTimeframes.includes(tf)));
  add('BAT-17', flag(closedBeyondX(env, tf, s)));

  const reached = checks.find((k) => k.id === 'BAT-07')!.state === 'met';
  const drawings = drawingsOf(env, tf, s, dLevel, reached);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  // BAT-01 ist durch BAT-02 ersetzbar; D (BAT-07) fehlt nur noch
  const excused = (k: Check) => k.id === 'BAT-07' || (k.id === 'BAT-01' && stateOf('BAT-02') === 'met');
  let verdict: Verdict = 'valid';
  if (['BAT-14', 'BAT-15', 'BAT-16', 'BAT-17'].some((id) => stateOf(id) === 'met')) verdict = 'invalid';
  else if (checks.some((k) => k.kind === 'required' && k.state === 'unmet' && !excused(k))) verdict = 'invalid';
  else if (stateOf('BAT-07') === 'unmet') verdict = 'forming';

  const points: Candidate['points'] = {
    X: anchorAt(bars, x.idx, x.price),
    A: anchorAt(bars, a.idx, a.price),
    B: anchorAt(bars, b.idx, b.price),
    C: anchorAt(bars, c.idx, c.price),
  };
  if (d) points.D = anchorAt(bars, d.idx, d.price);
  return { code: 'BAT', side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, tf: ContextTimeframe, s: XabcdShape, dLevel: number, reached: boolean): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const lastTime = bars[bars.length - 1].time;
  const { x, a, b, c, d, side, abcd } = s;
  const out: Drawing[] = [
    { id: 'Z-BAT-01', tool: 'zigzag', anchors: zigOf(bars, s, reached), rules: ids('BAT', [1, 3, 4, 5, 6, 7]), side },
    {
      id: 'Z-BAT-02',
      tool: 'fib',
      anchors: [anchorAt(bars, x.idx, x.price), anchorAt(bars, a.idx, a.price)],
      levels: [B.bLevel, B.bExclude, B.dLevel],
      rules: ids('BAT', [5, 7, 14]),
      side,
    },
    {
      id: 'Z-BAT-03',
      tool: 'fib',
      anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, b.idx, b.price)],
      levels: [B.cMin],
      rules: ids('BAT', [6]),
      side,
    },
    { id: 'Z-BAT-04', tool: 'hline', anchors: [anchorAt(bars, c.idx, abcd.level1)], levels: [1], rules: ids('BAT', [8, 9]), side },
    {
      id: 'Z-BAT-05',
      tool: 'zone',
      anchors: [anchorAt(bars, c.idx, Math.min(abcd.level1, dLevel)), { time: lastTime, price: Math.max(abcd.level1, dLevel) }],
      rules: ids('BAT', [8, 9]),
      side,
    },
  ];
  if (d && reached) {
    const t = HARMONIC_PARAMS.targets;
    out.push({
      id: 'Z-BAT-06',
      tool: 'fib',
      anchors: [anchorAt(bars, a.idx, a.price), anchorAt(bars, d.idx, d.price)],
      levels: [t.tp1, t.tp2, -t.stop],
      rules: [],
      side,
    });
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('BAT', tf, BAT_CHECK_IDS, RULES);

/** BAT-01 ☐ zählt nicht, wenn BAT-02 es ersetzt */
const misses = (cand: Candidate): number => {
  const replaced = cand.checks.find((k) => k.id === 'BAT-02')?.state === 'met';
  return cand.checks.filter(
    (k) => (FORM_IDS.includes(k.id) && k.state === 'unmet' && !(replaced && k.id === 'BAT-01')) || (POINT_EXCLUSIONS.includes(k.id) && k.state === 'met'),
  ).length;
};

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte X, A, B, C und misst D */
export const analyzeBat = (ctx: FormationContext, t: number): BatAnalysis[] => analyzeXabcd(ctx, t, evaluate, misses, empty);

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export const checkBatCandidate = (ctx: FormationContext, t: number, input: BatPointsInput): Candidate => checkXabcd(ctx, t, input, evaluate, empty);
