/**
 * AB=CD (ABCD): Prüfung je Bedingungs-ID und Zeichnungen Z-ABCD-01 bis Z-ABCD-06.
 * `analyzeAbcd` sucht je geladener Zeiteinheit die letzten Punkte A, B, C aus den Wendepunkten und misst D;
 * `checkAbcdCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (ABCD-03, ABCD-07, ABCD-08, ABCD-21 bis ABCD-23, ABCD-25) heißt ☑
 * „liegt vor“, bei Ausschlüssen also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“.
 * Die Art von ABCD-19 und ABCD-20 hängt von anderen Bedingungen ab und steht im Feld `kind` des Ergebnisses.
 */
import type { FormationContext } from './context';
import { closesBeyond, countTests, outward, probeFractal, wickEnd, type Rect } from './frz';
import {
  dReached,
  extensionPrice,
  gapToRect,
  innerLevels,
  selectPoints,
  shapeOf,
  shortfall,
  timeframeExcluded,
  type AbcdPoint,
  type AbcdPoints,
  type AbcdShape,
} from './abcd';
import { levelPrice, legLength, type FibLeg } from './fib';
import { ABCD_PARAMS, CONTEXT_TIMEFRAMES, FRZ_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, dirSide, envFor, neighborTf, type Env } from './reasons';
import { divergenceOf, engulfAt, engulfZones, rsiExtreme, zoneSideOf } from './sig';
import type { Anchor, Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'ABCD-01': ['required', 'confirmed'],
  'ABCD-02': ['required', 'assumption'],
  'ABCD-03': ['required', 'confirmed'],
  'ABCD-04': ['required', 'confirmed'],
  'ABCD-05': ['required', 'secondary'],
  'ABCD-06': ['required', 'confirmed'],
  'ABCD-07': ['required', 'confirmed'],
  'ABCD-08': ['required', 'assumption'],
  'ABCD-09': ['bonus', 'secondary'],
  'ABCD-10': ['required', 'confirmed'],
  'ABCD-11': ['required', 'assumption'],
  'ABCD-12': ['bonus', 'confirmed'],
  'ABCD-13': ['bonus', 'confirmed'],
  'ABCD-14': ['bonus', 'confirmed'],
  'ABCD-15': ['bonus', 'confirmed'],
  'ABCD-16': ['bonus', 'confirmed'],
  'ABCD-17': ['bonus', 'confirmed'],
  'ABCD-18': ['bonus', 'assumption'],
  'ABCD-19': ['bonus', 'confirmed'],
  'ABCD-20': ['bonus', 'confirmed'],
  'ABCD-21': ['exclusion', 'confirmed'],
  'ABCD-22': ['exclusion', 'confirmed'],
  'ABCD-23': ['exclusion', 'assumption'],
  'ABCD-24': ['exclusion', 'confirmed'],
  'ABCD-25': ['exclusion', 'confirmed'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const ABCD_CHECK_IDS: readonly string[] = Object.keys(RULES);
/** Immer „nicht messbar“: harmonisches D (GAR und BAT folgen später, ABCD-16), Abgrenzung zum Doppeltop (CDT folgt, ABCD-24) */
export const ABCD_UNMEASURABLE_IDS: readonly string[] = ['ABCD-16', 'ABCD-24'];

export interface AbcdPointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen: Öffnungszeit der Kerze und Preis */
  a: Anchor;
  b: Anchor;
  c: Anchor;
  /** Ohne Angabe: der äußerste Docht seit C */
  d?: Anchor;
}

export interface AbcdAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? 'unmeasurable' : flag(v));
const U: CheckState = 'unmeasurable';

const mk = (id: string, state: CheckState, value?: number, kind?: RuleKind): Check => {
  const [defaultKind, status] = RULES[id];
  return { id, kind: kind ?? defaultKind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

interface NearZone {
  rect: Rect;
  tf: ContextTimeframe;
  /** Tests der Fraktalzone vor der D-Kerze (ohne D selbst); Engulf-Zonen haben keine Zählung */
  testsBeforeD: number;
}

function evaluate(env: Env, p: AbcdPoints, dInput: AbcdPoint | undefined): Candidate {
  const { tf } = env;
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const fib = env.fibs.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const s = shapeOf(bars, p, dInput);
  const { es, cs, side, d } = s;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number, kind?: RuleKind) => checks.push(mk(id, state, value, kind));

  // Form
  const fractalDone = (idx: number, sideOf: typeof es) => {
    const probe = probeFractal(bars, idx, sideOf);
    return probe.leftBars === N && probe.rightBars === N && probe.beyond === 0;
  };
  add(
    'ABCD-01',
    flag(
      s.a.idx < s.b.idx &&
        s.b.idx < s.c.idx &&
        s.a.price === wickEnd(bars[s.a.idx], cs) &&
        s.b.price === wickEnd(bars[s.b.idx], es) &&
        s.c.price === wickEnd(bars[s.c.idx], cs),
    ),
  );
  add('ABCD-02', flag(fractalDone(s.b.idx, es) && fractalDone(s.c.idx, cs)));
  let beyondB = false;
  for (let k = s.c.idx + 1; k <= last; k++) if (closesBeyond(bars[k], s.b.price, es)) beyondB = true;
  add('ABCD-03', flag(beyondB));
  const depth = s.depth ?? undefined;
  add('ABCD-04', flag(depth !== undefined && depth >= ABCD_PARAMS.minCorrection), depth);
  add('ABCD-05', flag(depth !== undefined && depth <= 1), depth);
  add('ABCD-06', flag(depth !== undefined && depth <= ABCD_PARAMS.maxCorrection), depth);
  add('ABCD-07', flag(!!d && outward(es, d.price) >= outward(es, s.level1)), shortfall(s) ?? undefined);
  const reached = dReached(s);
  add('ABCD-08', flag(reached), shortfall(s) ?? undefined);

  // Ort und Kontext (gemessen an Level 1)
  const atr = view.atr[d ? d.idx : last] ?? null;
  const near = atr !== null ? ABCD_PARAMS.nearAtr * atr : null;
  const tradeZone = zoneSideOf(side);
  const nearZones: NearZone[] = [];
  // Die Zone, die erst das D selbst bildet (fertiges Fraktal am D), zählt nicht als Ort des D (Zirkelschluss)
  const dTime = d ? bars[d.idx].time : Infinity;
  const testsBefore = (z: { rect: Rect; fractalTimes: number[] }): number => {
    if (!d) return 0;
    const lastFractal = Math.max(...z.fractalTimes.map((ft) => bars.findIndex((b) => b.time === ft)));
    return countTests(bars, tradeZone, z.rect, lastFractal + N + 1, d.idx - 1, () => false, []);
  };
  if (near !== null) {
    for (const z of [...env.frz.zones, ...env.frz.reversed]) {
      const formedByD = z.fractalTimes.every((ft) => ft >= dTime);
      if (z.side === tradeZone && !formedByD && gapToRect(z.rect, s.level1) <= near) {
        nearZones.push({ rect: z.rect, tf: z.tf, testsBeforeD: testsBefore(z) });
      }
    }
    for (const z of engulfZones(bars, view.wide)) {
      const formedByD = d !== null && z.idx >= d.idx;
      if (z.holds && z.side === side && !formedByD && gapToRect(z.rect, s.level1) <= near) {
        nearZones.push({ rect: z.rect, tf, testsBeforeD: 0 });
      }
    }
  }
  const higherTf = neighborTf(env, tf, -1);
  const lowerTf = neighborTf(env, tf, 1);

  const inner = innerLevels(trend, s);
  const isNear = (level: number) => near !== null && Math.abs(level - s.level1) <= near;
  add('ABCD-09', near === null ? U : flag(inner.some(isNear)));

  // zweites Level nahe Level 1 (ABCD-15): −0.272 von A → B, 0.618 einer größeren Gegenbewegung, innere Bewegung
  const bigLegs: FibLeg[] = [...fib.legs, ...(higherTf ? (env.fibs.get(higherTf)?.legs ?? []) : [])].filter(
    (leg) => (leg.dir === 'up') !== (es === 'resistance') && legLength(leg) > s.len,
  );
  const secondLevels = [
    extensionPrice(s, ABCD_PARAMS.minExtension),
    ...bigLegs.map((leg) => levelPrice(leg, ABCD_PARAMS.confluenceLevel)),
    ...inner,
  ];
  const confluent = secondLevels.filter(isNear);
  const hasConfluence = confluent.length > 0;

  add('ABCD-10', near === null ? U : flag(nearZones.length > 0 || hasConfluence));
  add('ABCD-11', flag(near !== null), near ?? undefined);
  const tfRank = CONTEXT_TIMEFRAMES.indexOf(tf);
  const isHigher = (x: ContextTimeframe) => CONTEXT_TIMEFRAMES.indexOf(x) < tfRank || x === CONTEXT_TIMEFRAMES[0];
  const higherZones = nearZones.filter((z) => isHigher(z.tf));
  const higherLoaded = CONTEXT_TIMEFRAMES.some((x) => CONTEXT_TIMEFRAMES.indexOf(x) < tfRank && env.views.has(x));
  const noHigherContext = !higherLoaded && tf !== CONTEXT_TIMEFRAMES[0];
  if (near === null || (higherZones.length === 0 && noHigherContext)) add('ABCD-12', U);
  else add('ABCD-12', flag(higherZones.length > 0));
  add('ABCD-13', nearZones.length === 0 ? U : flag(nearZones.every((z) => z.testsBeforeD === 0)));
  const higherDir = higherTf ? (env.trends.get(higherTf)?.dir ?? null) : null;
  const withTrend = higherDir ? dirSide(higherDir) === side : null;
  add('ABCD-14', tri(withTrend));
  add('ABCD-15', near === null ? U : flag(hasConfluence), confluent.length);
  add('ABCD-16', U);

  // Signal am D
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  const rsi17 = rsiD === null ? null : rsiExtreme(rsiD, side);
  const nearExtreme = (value: number) => (side === 'sell' ? value >= ABCD_PARAMS.rsiNear.sell : value <= ABCD_PARAMS.rsiNear.buy);
  const rsi18 = rsiD === null ? null : nearExtreme(rsiD);
  add('ABCD-17', tri(rsi17), rsiD ?? undefined);
  add('ABCD-18', tri(rsi18), rsiD ?? undefined);
  const div = d ? divergenceOf(trend, es, s.b.idx, d.idx) : null;
  const divState: CheckState = !div || div.a.wave === null || div.b.wave === null ? U : flag(div.tie);
  const counter = withTrend === null ? null : !withTrend;
  add('ABCD-19', divState, undefined, counter === true ? 'required' : 'bonus');
  let reversal: boolean | null = null;
  if (d) {
    reversal = false;
    for (let k = d.idx; k <= last && !reversal; k++) reversal = engulfAt(bars, view.wide, k, side) !== null;
    const lower = lowerTf ? env.views.get(lowerTf) : undefined;
    if (!reversal && lower) {
      const from = bars[d.idx].time;
      for (let k = 0; k < lower.bars.length && !reversal; k++) {
        if (lower.bars[k].time >= from) reversal = engulfAt(lower.bars, lower.wide, k, side) !== null;
      }
    }
  }
  const noRsi = checks.find((c) => c.id === 'ABCD-17')!.state === 'unmet' && checks.find((c) => c.id === 'ABCD-18')!.state === 'unmet';
  add('ABCD-20', tri(reversal), undefined, noRsi ? 'required' : 'bonus');

  // Ausschluss
  if (counter === null) add('ABCD-21', U);
  else if (!counter) add('ABCD-21', 'unmet');
  else add('ABCD-21', divState === U ? U : flag(divState !== 'met'));
  // Eine Zone, durch die der Kurs schon geschlossen hat, wechselt die Rolle (FRZ-35): sie steht dann bei den gedrehten Zonen
  const broken: NearZone[] = [];
  if (near !== null) {
    for (const z of env.frz.reversed) {
      if (z.side !== tradeZone && gapToRect(z.rect, s.level1) <= near) broken.push({ rect: z.rect, tf: z.tf, testsBeforeD: 0 });
    }
  }
  const zonesAtD = [...nearZones, ...broken];
  if (!d || zonesAtD.length === 0) {
    add('ABCD-22', U);
  } else {
    const closedBeyond = zonesAtD.some((z) => {
      for (let k = d.idx; k <= last; k++) {
        if (side === 'sell' ? bars[k].close > z.rect.top : bars[k].close < z.rect.bottom) return true;
      }
      return false;
    });
    add('ABCD-22', flag(closedBeyond));
  }
  if (!d) {
    add('ABCD-23', U);
  } else {
    const flags = view.wide.slice(s.c.idx + 1, d.idx + 1);
    let strong = 0;
    for (let k = s.c.idx + 1; k <= d.idx; k++) {
      const toward = es === 'resistance' ? bars[k].close > bars[k].open : bars[k].close < bars[k].open;
      if (view.wide[k] === true && toward) strong++;
    }
    add('ABCD-23', flags.every((w) => w === null) ? U : flag(strong >= ABCD_PARAMS.wideBars), strong);
  }
  add('ABCD-24', U);
  add('ABCD-25', flag(timeframeExcluded(tf)));

  const drawings = drawingsOf(env, s, reached, divState === 'met', secondLevels.find(isNear));
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((x) => x.rules.includes(c.id)).map((x) => x.id))],
  }));

  const stateOf = (id: string) => checks.find((c) => c.id === id)!.state;
  let verdict: Verdict = 'valid';
  if (['ABCD-21', 'ABCD-22', 'ABCD-23', 'ABCD-24', 'ABCD-25'].some((id) => stateOf(id) === 'met')) verdict = 'invalid';
  else if (['ABCD-01', 'ABCD-02', 'ABCD-04', 'ABCD-05', 'ABCD-06'].some((id) => stateOf(id) === 'unmet')) verdict = 'invalid';
  else if (stateOf('ABCD-03') === 'unmet' || stateOf('ABCD-08') === 'unmet') verdict = 'forming';
  else if (checks.some((c) => c.kind === 'required' && c.state === 'unmet' && !['ABCD-07', 'ABCD-11'].includes(c.id))) {
    // ABCD-07 (streng) ist durch die Toleranz von ABCD-08 ersetzt; ABCD-11 ohne ATR heißt „nahe nicht messbar“, nicht Verstoß
    verdict = 'invalid';
  }

  const points: Candidate['points'] = {
    A: { time: bars[s.a.idx].time, price: s.a.price },
    B: { time: bars[s.b.idx].time, price: s.b.price },
    C: { time: bars[s.c.idx].time, price: s.c.price },
  };
  if (d) points.D = { time: bars[d.idx].time, price: d.price };
  return { code: 'ABCD', side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, s: AbcdShape, reached: boolean, divergence: boolean, second: number | undefined): Drawing[] {
  const bars = env.views.get(env.tf)!.bars;
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const lastTime = bars[bars.length - 1].time;
  const ids = (list: number[]) => list.map((n) => `ABCD-${String(n).padStart(2, '0')}`);
  const { side } = s;
  const zig = [at(s.a.idx, s.a.price), at(s.b.idx, s.b.price), at(s.c.idx, s.c.price)];
  if (s.d && reached) zig.push(at(s.d.idx, s.d.price));
  const ext = extensionPrice(s, ABCD_PARAMS.minExtension);
  const secondPrice = second ?? ext;
  const out: Drawing[] = [
    { id: 'Z-ABCD-01', tool: 'zigzag', anchors: zig, rules: ids([1, 2, 3]), side },
    { id: 'Z-ABCD-02', tool: 'hline', anchors: [at(s.b.idx, s.level1)], levels: [1], rules: ids([7, 8]), side },
    {
      id: 'Z-ABCD-03',
      tool: 'fib',
      anchors: [at(s.a.idx, s.a.price), at(s.b.idx, s.b.price)],
      levels: [ABCD_PARAMS.minCorrection, -ABCD_PARAMS.minExtension],
      rules: ids([4, 6]),
      side,
    },
    {
      id: 'Z-ABCD-04',
      tool: 'zone',
      anchors: [at(s.c.idx, Math.min(s.level1, secondPrice)), { time: lastTime, price: Math.max(s.level1, secondPrice) }],
      rules: ids([9, 15, 16]),
      side,
    },
    { id: 'Z-ABCD-06', tool: 'label', anchors: [{ time: lastTime, price: s.level1 }], rules: ids([7]), side },
  ];
  if (s.d && reached) {
    const from = divergence ? s.a : s.c;
    const levels = [ABCD_PARAMS.targets.tp1, ABCD_PARAMS.targets.tp2, ...(divergence ? [ABCD_PARAMS.targets.divergence] : []), -ABCD_PARAMS.targets.stop];
    out.push({ id: 'Z-ABCD-05', tool: 'fib', anchors: [at(from.idx, from.price), at(s.d.idx, s.d.price)], levels, rules: [], side });
  }
  return out;
}

function unmeasurable(tf: ContextTimeframe): Candidate {
  const checks = ABCD_CHECK_IDS.map((id) => mk(id, U));
  return { code: 'ABCD', side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' };
}

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte A, B, C und misst D */
export function analyzeAbcd(ctx: FormationContext, t: number): AbcdAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const points = selectPoints(env.trends.get(tf)!.pivots);
    return { tf, candidate: points ? evaluate(env, points, undefined) : unmeasurable(tf) };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkAbcdCandidate(ctx: FormationContext, t: number, input: AbcdPointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return unmeasurable(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const [ia, ib, ic] = [idxOf(input.a), idxOf(input.b), idxOf(input.c)];
  const idxD = input.d ? idxOf(input.d) : undefined;
  if (ia < 0 || ib < 0 || ic < 0 || idxD === -1) return unmeasurable(input.tf);
  const points: AbcdPoints = {
    a: { idx: ia, price: input.a.price },
    b: { idx: ib, price: input.b.price },
    c: { idx: ic, price: input.c.price },
  };
  return evaluate(env, points, input.d && idxD !== undefined ? { idx: idxD, price: input.d.price } : undefined);
}
