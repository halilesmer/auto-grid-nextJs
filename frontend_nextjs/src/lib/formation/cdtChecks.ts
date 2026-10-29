/**
 * Doppeltop / Doppelboden (CDT): Prüfung je Bedingungs-ID und Zeichnungen Z-CDT-01 bis Z-CDT-06.
 * `analyzeCdt` sucht je geladener Zeiteinheit H1 und N aus den Wendepunkten und misst H2; `checkCdtCandidate` prüft eigene Punkte.
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (CDT-05, CDT-13, CDT-15) heißt ☑ „liegt vor“, bei dem Ausschluss CDT-15
 * also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“. Die Art von CDT-13 hängt von CDT-12 ab.
 */
import type { FormationContext } from './context';
import { closesBeyond, probeFractal, wickEnd, zoneGeometry, type ZoneSide } from './frz';
import { gapToRect } from './abcd';
import {
  cdtCore,
  flag,
  tri,
  depthOf,
  meanRangeBefore,
  nearEdge,
  previousPivotOfSide,
  selectBases,
  shapeOn,
  type CdtBase,
  type CdtPoint,
  type CdtShape,
} from './cdt';
import { levelPrice } from './fib';
import { CDT_PARAMS, FIB_PARAMS, FRZ_PARAMS, RSI_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, dirSide, envFor, neighborTf, type Env } from './reasons';
import { reversalAt } from './reversal';
import { divergenceOf, rsiExtreme } from './sig';
import type { Anchor, Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'CDT-01': ['required', 'confirmed'],
  'CDT-02': ['required', 'confirmed'],
  'CDT-03': ['required', 'confirmed'],
  'CDT-04': ['required', 'confirmed'],
  'CDT-05': ['required', 'confirmed'],
  'CDT-06': ['required', 'confirmed'],
  'CDT-07': ['bonus', 'confirmed'],
  'CDT-08': ['bonus', 'assumption'],
  'CDT-09': ['bonus', 'confirmed'],
  'CDT-10': ['bonus', 'confirmed'],
  'CDT-11': ['bonus', 'confirmed'],
  'CDT-12': ['required', 'confirmed'],
  'CDT-13': ['required', 'confirmed'],
  'CDT-14': ['bonus', 'confirmed'],
  'CDT-15': ['exclusion', 'confirmed'],
  'CDT-16': ['bonus', 'secondary'],
};

/** Bedingungen, an denen die Auswahl der Punkte misst: Form, Berührung, Trend und der Ausschluss */
const FORM_IDS = ['CDT-01', 'CDT-02', 'CDT-03', 'CDT-04', 'CDT-05', 'CDT-06'];

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const CDT_CHECK_IDS: readonly string[] = Object.keys(RULES);

export interface CdtPointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen: Öffnungszeit der Kerze und Preis */
  h1: Anchor;
  n: Anchor;
  /** Ohne Angabe: der äußerste Docht seit N */
  h2?: Anchor;
}

export interface CdtAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

const U: CheckState = 'unmeasurable';

const mk = (id: string, state: CheckState, value?: number, kind?: RuleKind): Check => {
  const [defaultKind, status] = RULES[id];
  return { id, kind: kind ?? defaultKind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

function evaluate(env: Env, tf: ContextTimeframe, s: CdtShape): Candidate {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const fib = env.fibs.get(tf)!;
  const { bars } = view;
  const { es, cs, side, h1, n, h2, zone } = s;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number, kind?: RuleKind) => checks.push(mk(id, state, value, kind));
  const fractalDone = (idx: number, sideOf: ZoneSide) => {
    const probe = probeFractal(bars, idx, sideOf);
    return probe.leftBars === N && probe.rightBars === N && probe.beyond === 0;
  };

  // Form
  add('CDT-01', flag(fractalDone(h1.idx, es) && h1.price === wickEnd(bars[h1.idx], es)));
  const prev = previousPivotOfSide(env, tf, es, h1.idx);
  if (prev === null) add('CDT-02', U);
  else {
    let closed = false;
    for (let k = prev.idx + 1; k <= h1.idx; k++) if (closesBeyond(bars[k], prev.price, es)) closed = true;
    add('CDT-02', flag(closed));
  }
  add('CDT-03', flag(fractalDone(n.idx, cs) && n.price === wickEnd(bars[n.idx], cs)));
  const depth = depthOf(env, tf, es, h1, n.price);
  add('CDT-04', depth === null ? U : flag(depth >= CDT_PARAMS.minCorrection), depth ?? undefined);
  const core = cdtCore(env, tf, es, h1, h2, zone);
  add('CDT-05', core.c05);
  add('CDT-06', core.c06);

  // Ort und Kontext
  const higherTf = neighborTf(env, tf, -1);
  const higherDir = higherTf ? (env.trends.get(higherTf)?.dir ?? null) : null;
  add('CDT-07', higherDir ? flag(dirSide(higherDir) === side) : U);
  const a = h2 ? meanRangeBefore(bars, h2.idx) : null;
  const b = meanRangeBefore(bars, h1.idx);
  add('CDT-08', a === null || b === null ? U : flag(a <= CDT_PARAMS.approach.ratio * b), a !== null && b ? a / b : undefined);
  const div = h2 ? divergenceOf(trend, es, h1.idx, h2.idx) : null;
  add('CDT-09', !div || div.a.wave === null || div.b.wave === null ? U : flag(div.tie));
  const atr = view.atr[h1.idx] ?? null;
  if (atr === null) add('CDT-10', U);
  else {
    const near = CDT_PARAMS.nearAtr * atr;
    const legs = [...fib.legs, ...(higherTf ? (env.fibs.get(higherTf)?.legs ?? []) : [])];
    const levels = legs.flatMap((leg) => [...FIB_PARAMS.levels, ...FIB_PARAMS.extensions.map((e) => -e)].map((l) => levelPrice(leg, l)));
    add('CDT-10', flag(levels.some((p) => gapToRect(zone, p) <= near)), near);
  }
  add('CDT-11', flag(CDT_PARAMS.timeframes.includes(tf)));

  // Signal
  add('CDT-12', core.c12, view.rsi[h1.idx] ?? undefined);
  const lowerTf = neighborTf(env, tf, 1);
  const reversal: CheckState = h2 ? reversalAt(env, tf, side, h2, lowerTf ? [tf, lowerTf] : [tf]) : U;
  add('CDT-13', reversal, undefined, core.c12 === 'unmet' ? 'required' : 'bonus');
  const rsiH2 = h2 ? (view.rsi[h2.idx] ?? null) : null;
  add('CDT-14', rsiH2 === null ? U : tri(rsiExtreme(rsiH2, side)), rsiH2 ?? undefined);

  // Ausschluss
  add('CDT-15', core.c15);
  const own = trend.pivots.some((p) => p.idx === n.idx && p.kind === 'correction');
  add('CDT-16', h2 ? flag(fractalDone(h1.idx, es) && fractalDone(h2.idx, es) && own) : U);

  const drawings = drawingsOf(env, tf, s, view.rsi[h1.idx] ?? null);
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((x) => x.rules.includes(c.id)).map((x) => x.id))],
  }));

  const stateOf = (id: string) => checks.find((c) => c.id === id)!.state;
  // Weder RSI-Extrem noch Umkehrkerze: der Einstieg wartet auf die Bestätigung, die Formation bleibt im Aufbau
  const signalMissing = stateOf('CDT-12') === 'unmet' && stateOf('CDT-13') !== 'met';
  let verdict: Verdict = 'valid';
  if (stateOf('CDT-15') === 'met') verdict = 'invalid';
  else if (['CDT-01', 'CDT-02', 'CDT-03', 'CDT-04', 'CDT-06'].some((id) => stateOf(id) === 'unmet')) verdict = 'invalid';
  else if (stateOf('CDT-05') === 'unmet' || signalMissing) verdict = 'forming';

  const points: Candidate['points'] = {
    H1: { time: bars[h1.idx].time, price: h1.price },
    N: { time: bars[n.idx].time, price: n.price },
  };
  if (h2) points.H2 = { time: bars[h2.idx].time, price: h2.price };
  return { code: 'CDT', side, tf, points, checks: withDrawings, drawings, verdict };
}

/** Prüfung einer fertigen Form für andere Formationen (2618 baut auf dem Doppeltop); dieselbe Messung wie `analyzeCdt` */
export const evaluateCdt = (env: Env, tf: ContextTimeframe, shape: CdtShape): Candidate => evaluate(env, tf, shape);

function drawingsOf(env: Env, tf: ContextTimeframe, s: CdtShape, rsiH1: number | null): Drawing[] {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const lastTime = bars[bars.length - 1].time;
  const { es, cs, side, h1, n, h2, zone } = s;
  const ids = (list: number[]) => list.map((x) => `CDT-${String(x).padStart(2, '0')}`);
  const nZone = zoneGeometry(bars, n.idx, cs, tf);
  const stopEdge = es === 'resistance' ? zone.top : zone.bottom;
  const targetEdge = nearEdge(es, nZone) === nZone.bottom ? nZone.top : nZone.bottom;
  const top = es === 'resistance';
  let from = h1.idx;
  let to = h1.idx;
  while (from > 0 && rsiExtreme(view.rsi[from - 1], side) === true) from--;
  while (to < bars.length - 1 && rsiExtreme(view.rsi[to + 1], side) === true) to++;
  const out: Drawing[] = [
    { id: 'Z-CDT-01', tool: 'zone', anchors: [at(h1.idx, zone.bottom), { time: lastTime, price: zone.top }], rules: ids([1, 5, 15]), side },
    {
      id: 'Z-CDT-03',
      tool: 'zone',
      anchors: [at(n.idx, nZone.bottom), { time: lastTime, price: nZone.top }],
      rules: ids([3]),
      side,
    },
    {
      id: 'Z-CDT-04',
      tool: 'zone',
      anchors: [at(from, top ? RSI_PARAMS.overbought : 0), at(to, top ? 100 : RSI_PARAMS.oversold)],
      rules: ids([12]),
      side,
    },
    {
      id: 'Z-CDT-05',
      tool: 'label',
      anchors: [{ time: lastTime, price: stopEdge }, { time: lastTime, price: targetEdge }],
      rules: [],
      side,
    },
    { id: 'Z-CDT-06', tool: 'hline', anchors: [at(n.idx, n.price)], rules: ids([3]), side },
  ];
  if (h2) {
    const prices = [h1.price, h2.price];
    out.splice(1, 0, {
      id: 'Z-CDT-02',
      tool: 'zone',
      anchors: [at(h1.idx, Math.min(...prices)), at(h2.idx, Math.max(...prices))],
      rules: ids([5]),
      side,
    });
  }
  return rsiH1 === null ? out.filter((d) => d.id !== 'Z-CDT-04') : out;
}

function unmeasurable(tf: ContextTimeframe): Candidate {
  const checks = CDT_CHECK_IDS.map((id) => mk(id, U));
  return { code: 'CDT', side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' };
}

/** Sucht je geladener Zeiteinheit (hoch → tief) H1 und N und misst H2 */
export function analyzeCdt(ctx: FormationContext, t: number): CdtAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const bars = env.views.get(tf)!.bars;
    // Das Paar mit den wenigsten verletzten Form-Bedingungen gilt; bei Gleichstand das jüngste
    let best: { candidate: Candidate; unmet: number } | null = null;
    for (const picked of selectBases(env, tf)) {
      const candidate = evaluate(env, tf, shapeOn(bars, tf, picked, picked.es));
      const unmet = candidate.checks.filter((c) => (FORM_IDS.includes(c.id) && c.state === 'unmet') || (c.id === 'CDT-15' && c.state === 'met')).length;
      if (best === null || unmet < best.unmet) best = { candidate, unmet };
    }
    return { tf, candidate: best ? best.candidate : unmeasurable(tf) };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkCdtCandidate(ctx: FormationContext, t: number, input: CdtPointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return unmeasurable(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const [i1, i2] = [idxOf(input.h1), idxOf(input.n)];
  const idxH2 = input.h2 ? idxOf(input.h2) : undefined;
  // Reihenfolge H1 < N < H2 (wie ABCD-01 bei AB=CD): sonst ist H2 nicht der Anlauf nach N
  if (i1 < 0 || i2 <= i1 || idxH2 === -1 || (idxH2 !== undefined && idxH2 <= i2)) return unmeasurable(input.tf);
  const es: ZoneSide = input.h1.price > input.n.price ? 'resistance' : 'support';
  const base: CdtBase = { h1: { idx: i1, price: input.h1.price }, n: { idx: i2, price: input.n.price } };
  const h2: CdtPoint | undefined = input.h2 && idxH2 !== undefined ? { idx: idxH2, price: input.h2.price } : undefined;
  return evaluate(env, input.tf, shapeOn(bars, input.tf, base, es, h2));
}
