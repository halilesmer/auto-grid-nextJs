/**
 * Cypher (CYP): Prüfung je Bedingungs-ID und Zeichnungen Z-CYP-01 bis Z-CYP-06.
 * `analyzeCyp` sucht je geladener Zeiteinheit die letzten Punkte X, A, B, C aus den Wendepunkten und misst D;
 * `checkCypCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (CYP-07, CYP-11, CYP-14, CYP-15) heißt ☑ „liegt vor“, bei Ausschlüssen also
 * „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“ (CYP-02 ohne höhere Zeiteinheit im Kontext).
 * Nur CYP-07 nutzt 1 Pip Toleranz; CYP-03, CYP-04 und die Ausschluss-Level werden ohne Pip-Toleranz geprüft.
 * Die Divergenz (CYP-05) und der RSI (CYP-06) am C sind Pflicht, der RSI am D (CYP-08) nur Verstärkung.
 */
import type { FormationContext } from './context';
import { outward } from './frz';
import { closedBeyondBLimit, closedBeyondCLimit, extensionOfC, levelBC, levelXC, lenXC, retraceXC } from './cyp';
import { analyzeLib } from './libChecks';
import { CYP_PARAMS, HARMONIC_PARAMS, type ContextTimeframe } from './params';
import { dirSide, neighborTf, type Env } from './reasons';
import { divergenceOf, rsiExtreme } from './sig';
import {
  alternates,
  analyzeXabcd,
  anchorAt,
  atrDistance,
  checkXabcd,
  fractalDone,
  ids,
  reaches,
  retraceXA,
  levelXA,
  unmeasurable,
  zigOf,
  zonesNear,
  type XabcdAnalysis,
  type XabcdInput,
  type XabcdShape,
} from './xabcd';
import type { Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Side, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'CYP-01': ['required', 'confirmed'],
  'CYP-02': ['required', 'confirmed'],
  'CYP-03': ['required', 'confirmed'],
  'CYP-04': ['required', 'confirmed'],
  'CYP-05': ['required', 'confirmed'],
  'CYP-06': ['required', 'confirmed'],
  'CYP-07': ['required', 'confirmed'],
  'CYP-08': ['bonus', 'secondary'],
  'CYP-09': ['bonus', 'confirmed'],
  'CYP-10': ['bonus', 'confirmed'],
  'CYP-11': ['exclusion', 'assumption'],
  'CYP-12': ['bonus', 'secondary'],
  'CYP-13': ['bonus', 'confirmed'],
  'CYP-14': ['exclusion', 'confirmed'],
  'CYP-15': ['exclusion', 'assumption'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const CYP_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form, Vorlauf (Divergenz, RSI) und der Ausschluss der Punkte */
const FORM_IDS = ['CYP-01', 'CYP-03', 'CYP-04', 'CYP-05', 'CYP-06'];
const POINT_EXCLUSIONS = ['CYP-11', 'CYP-15'];

export type CypPointsInput = XabcdInput;
export type CypAnalysis = XabcdAnalysis;

/** Libra-Ergebnisse für CYP-10; werden nur bei Bedarf gerechnet */
type Libras = () => readonly Candidate[];

const P = CYP_PARAMS;
const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

/** CYP-10: ein Libra-Einstieg (LIB-12) derselben Richtung liegt höchstens `near` vom Cypher-Einstieg */
const libraAtEntry = (libras: readonly Candidate[], tf: ContextTimeframe, side: Side, entry: number, near: number): boolean =>
  libras.some((l) => l.tf === tf && l.side === side && l.verdict !== 'invalid' && l.points.E !== undefined && Math.abs(l.points.E.price - entry) <= near);

function evaluate(env: Env, tf: ContextTimeframe, s: XabcdShape, pip: number, libras: Libras): Candidate {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const { x, a, b, c, d, es, cs, side } = s;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  // Struktur: Impuls X → A, neuer Impuls B → C jenseits von A, vier fertige Fraktale
  const impulse = trend.pivots.some((p) => p.idx === a.idx && p.side === cs && p.kind === 'impulse');
  const extC = extensionOfC(s);
  const structure =
    fractalDone(bars, x, es) &&
    fractalDone(bars, a, cs) &&
    fractalDone(bars, b, es) &&
    fractalDone(bars, c, cs) &&
    impulse &&
    alternates(s) &&
    extC !== null &&
    extC > 0;
  add('CYP-01', flag(structure));

  const higher = neighborTf(env, tf, -1);
  const higherDir = higher ? env.trends.get(higher)?.dir : null;
  add('CYP-02', higherDir ? flag(dirSide(higherDir) === side) : U);

  // Vorlauf: Korrektur, zweiter Impuls, Divergenz und RSI am C
  const rB = retraceXA(s, b.price);
  add('CYP-03', flag(outward(es, b.price) >= outward(es, levelXA(s, P.bLevel))), rB ?? undefined);
  add('CYP-04', flag(outward(cs, c.price) >= outward(cs, levelXA(s, -P.cExtension))), extC ?? undefined);
  const div = divergenceOf(trend, cs, a.idx, c.idx);
  add('CYP-05', div === null || div.a.wave === null || div.b.wave === null ? U : flag(div.strict));
  const rsiC = view.rsi[c.idx] ?? null;
  add('CYP-06', rsiC === null ? U : tri(rsiExtreme(rsiC, side === 'buy' ? 'sell' : 'buy')), rsiC ?? undefined);

  // Vollendung an 0.786 der Fib X → C
  const rD = d ? retraceXC(s, d.price) : null;
  add('CYP-07', flag(d !== null && reaches(rD, P.dLevel, lenXC(s), pip)), rD ?? undefined);

  // Signal und Ort am D
  const entry = levelXC(s, P.dLevel);
  const atr = view.atr[d ? d.idx : last] ?? null;
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  add('CYP-08', rsiD === null ? U : tri(rsiExtreme(rsiD, side)), rsiD ?? undefined);
  add('CYP-09', flag(zonesNear(env, tf, s, entry, 0).length > 0));
  add('CYP-10', atr === null ? U : flag(libraAtEntry(libras(), tf, side, entry, P.nearAtr * atr)));

  // Ausschluss und PRZ
  add('CYP-11', flag(closedBeyondCLimit(bars, s)));
  const prz = atrDistance(levelBC(s, P.bcInversion), entry, atr);
  add('CYP-12', prz === null ? U : flag(prz <= P.nearAtr), prz ?? undefined);
  add('CYP-13', flag(HARMONIC_PARAMS.highTimeframes.includes(tf)));
  add('CYP-14', flag(HARMONIC_PARAMS.excludedTimeframes.includes(tf)));
  add('CYP-15', flag(closedBeyondBLimit(bars, s)));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  const reached = stateOf('CYP-07') === 'met';
  const drawings = drawingsOf(env, tf, s, reached);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  // D (CYP-07) fehlt nur noch: im Aufbau
  let verdict: Verdict = 'valid';
  if (['CYP-11', 'CYP-14', 'CYP-15'].some((id) => stateOf(id) === 'met')) verdict = 'invalid';
  else if (checks.some((k) => k.kind === 'required' && k.state === 'unmet' && k.id !== 'CYP-07')) verdict = 'invalid';
  else if (!reached) verdict = 'forming';

  const points: Candidate['points'] = {
    X: anchorAt(bars, x.idx, x.price),
    A: anchorAt(bars, a.idx, a.price),
    B: anchorAt(bars, b.idx, b.price),
    C: anchorAt(bars, c.idx, c.price),
  };
  if (d) points.D = anchorAt(bars, d.idx, d.price);
  return { code: 'CYP', side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, tf: ContextTimeframe, s: XabcdShape, reached: boolean): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const lastTime = bars[bars.length - 1].time;
  const { x, a, b, c, d, side } = s;
  const out: Drawing[] = [
    { id: 'Z-CYP-01', tool: 'fib', anchors: [anchorAt(bars, x.idx, x.price), anchorAt(bars, a.idx, a.price)], levels: [P.bLevel, -P.cExtension, -P.cExclude], rules: ids('CYP', [3, 4, 11, 15]), side },
    { id: 'Z-CYP-02', tool: 'fib', anchors: [anchorAt(bars, x.idx, x.price), anchorAt(bars, c.idx, c.price)], levels: [P.dLevel], rules: ids('CYP', [7]), side },
    { id: 'Z-CYP-04', tool: 'fib', anchors: [anchorAt(bars, b.idx, b.price), anchorAt(bars, c.idx, c.price)], levels: [P.bcInversion], rules: ids('CYP', [12]), side },
    { id: 'Z-CYP-05', tool: 'zigzag', anchors: zigOf(bars, s, reached), rules: ids('CYP', [1, 3, 4, 7]), side },
  ];
  if (d && reached) {
    const t = P.targets;
    out.push({ id: 'Z-CYP-03', tool: 'fib', anchors: [anchorAt(bars, c.idx, c.price), anchorAt(bars, d.idx, d.price)], levels: [t.tp1, t.tp2, -t.stop], rules: [], side });
    out.push({ id: 'Z-CYP-06', tool: 'marker', anchors: [anchorAt(bars, c.idx, c.price), anchorAt(bars, d.idx, d.price), { time: lastTime, price: levelXC(s, P.dLevel) }], rules: [], side });
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('CYP', tf, CYP_CHECK_IDS, RULES);

const misses = (cand: Candidate): number =>
  cand.checks.filter((k) => (FORM_IDS.includes(k.id) && k.state === 'unmet') || (POINT_EXCLUSIONS.includes(k.id) && k.state === 'met')).length;

/** Libra aller geladenen Zeiteinheiten ohne LIB-09 (sonst riefen sich beide Erkennungen gegenseitig auf); eine Rechnung je Aufruf */
const librasOf = (ctx: FormationContext, t: number): Libras => {
  let cache: readonly Candidate[] | null = null;
  return () => (cache ??= analyzeLib(ctx, t, { withCypher: false }).map((a) => a.candidate));
};

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte X, A, B, C und misst D */
export function analyzeCyp(ctx: FormationContext, t: number): CypAnalysis[] {
  const libras = librasOf(ctx, t);
  return analyzeXabcd(ctx, t, (env, tf, s, pip) => evaluate(env, tf, s, pip, libras), misses, empty);
}

/** Prüft eigene Punkte; `libras` ersetzt die gemessenen Ergebnisse der Libra (CYP-10) */
export function checkCypCandidate(ctx: FormationContext, t: number, input: CypPointsInput, libras?: readonly Candidate[]): Candidate {
  const provider: Libras = libras ? () => libras : librasOf(ctx, t);
  return checkXabcd(ctx, t, input, (env, tf, s, pip) => evaluate(env, tf, s, pip, provider), empty);
}
