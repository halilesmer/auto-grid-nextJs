/**
 * Signale (SIG): Prüfung je Bedingungs-ID und Zeichnungen Z-SIG-01 bis Z-SIG-05.
 * `analyzeSig` prüft die letzte geschlossene Kerze jeder geladenen Zeiteinheit (Divergenz an den letzten zwei Wendepunkten),
 * `checkSigDivergence` vergleicht zwei beliebige Punkte einer Seite.
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (SIG-15, SIG-16, SIG-30, SIG-31, SIG-38, SIG-07) heißt ☑ „liegt vor“, bei
 * Ausschlüssen also „ausgeschlossen“. Ohne die nötigen Daten oder ohne `side` ist der Zustand „nicht messbar“.
 * SIG-42 (Anzeige „stark“ ab 3 Gründen) hat keine Prüfung; die Gründe stehen in `SigAnalysis.reasons`.
 */
import { outward, type Rect, type ZoneSide } from './frz';
import { bandOf, breakoutOf, refState } from './fib';
import { FIB_PARAMS, RSI_PARAMS, SIG_PARAMS, TRD_PARAMS, type ContextTimeframe } from './params';
import {
  buildEnv,
  computeReasons,
  countReasons,
  dirSide,
  envFor,
  lastBarOf,
  neighborTf,
  touches,
  type Env,
  type Reason,
} from './reasons';
import {
  divergenceOf,
  engulfAt,
  engulfZones,
  mergeBars,
  rsiExtreme,
  sawAt,
  tradeSideOf,
  trailingRun,
  zoneSideOf,
  type Divergence,
  type Engulf,
} from './sig';
import { counterSide, extremeSide } from './trd';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import type { FormationContext } from './context';
import type { Anchor, Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Side, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'SIG-01': ['required', 'confirmed'],
  'SIG-02': ['required', 'confirmed'],
  'SIG-03': ['required', 'confirmed'],
  'SIG-04': ['required', 'confirmed'],
  'SIG-05': ['required', 'confirmed'],
  'SIG-06': ['bonus', 'confirmed'],
  'SIG-07': ['exclusion', 'confirmed'],
  'SIG-08': ['bonus', 'secondary'],
  'SIG-09': ['required', 'confirmed'],
  'SIG-10': ['required', 'assumption'],
  'SIG-11': ['required', 'confirmed'],
  'SIG-12': ['required', 'confirmed'],
  'SIG-13': ['required', 'confirmed'],
  'SIG-14': ['required', 'assumption'],
  'SIG-15': ['exclusion', 'confirmed'],
  'SIG-16': ['exclusion', 'assumption'],
  'SIG-17': ['bonus', 'confirmed'],
  'SIG-18': ['required', 'confirmed'],
  'SIG-19': ['required', 'confirmed'],
  'SIG-20': ['required', 'confirmed'],
  'SIG-21': ['required', 'confirmed'],
  'SIG-22': ['required', 'confirmed'],
  'SIG-23': ['required', 'confirmed'],
  'SIG-24': ['required', 'confirmed'],
  'SIG-25': ['required', 'assumption'],
  'SIG-26': ['required', 'confirmed'],
  'SIG-27': ['required', 'confirmed'],
  'SIG-28': ['required', 'confirmed'],
  'SIG-29': ['required', 'confirmed'],
  'SIG-30': ['exclusion', 'confirmed'],
  'SIG-31': ['exclusion', 'confirmed'],
  'SIG-32': ['bonus', 'confirmed'],
  'SIG-33': ['required', 'confirmed'],
  'SIG-34': ['required', 'assumption'],
  'SIG-35': ['required', 'assumption'],
  'SIG-36': ['bonus', 'confirmed'],
  'SIG-37': ['bonus', 'confirmed'],
  'SIG-38': ['exclusion', 'confirmed'],
  'SIG-39': ['exclusion', 'assumption'],
  'SIG-40': ['required', 'confirmed'],
  'SIG-41': ['required', 'assumption'],
  'SIG-43': ['bonus', 'confirmed'],
  'SIG-44': ['bonus', 'assumption'],
  'SIG-45': ['required', 'confirmed'],
  'SIG-46': ['required', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const SIG_CHECK_IDS: readonly string[] = Object.keys(RULES);
/** Immer „nicht messbar“: Aussage zum Risikoverhalten (SIG-08), Stop und Ziel aus dem Handel (SIG-29), Wirtschaftskalender (SIG-39) */
export const SIG_UNMEASURABLE_IDS: readonly string[] = ['SIG-08', 'SIG-29', 'SIG-39'];

export interface SigOptions {
  /** Seite des geplanten Trades; ohne sie sind die Bedingungen mit Trade-Richtung nicht messbar */
  side?: Side;
  /** G9: Der Ort ist ein Formationspunkt */
  formationPoint?: boolean;
}

export interface SigPointsInput {
  tf: ContextTimeframe;
  /** Seite der verglichenen Punkte: Widerstand = Hochs, Unterstützung = Tiefs */
  side: ZoneSide;
  /** Öffnungszeiten der beiden Kerzen (MT5-Sekunden), alt → neu */
  timeA: number;
  timeB: number;
}

export interface SigAnalysis {
  tf: ContextTimeframe;
  /** Gründe G1 bis G11 für die Seite des Trades; leer ohne `side` */
  reasons: Reason[];
  candidate: Candidate;
}

const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? 'unmeasurable' : flag(v));
const U: CheckState = 'unmeasurable';
const other = (side: Side): Side => (side === 'buy' ? 'sell' : 'buy');

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

/** Ort der Kerze: Fraktalzone der Zeiteinheit (auch nach Rollenwechsel), gültige Engulf-Zone (ohne die der Kerze `skipEngulf` selbst) oder Korrekturzone der Fibonacci */
function placeRects(env: Env, zoneSide: ZoneSide | null, skipEngulf = -1): Rect[] {
  const view = env.views.get(env.tf)!;
  const rects: Rect[] = [];
  for (const z of [...env.frz.zones, ...env.frz.reversed]) {
    if (z.tf === env.tf && (zoneSide === null || z.side === zoneSide)) rects.push(z.rect);
  }
  for (const z of engulfZones(view.bars, view.wide)) {
    if (z.idx !== skipEngulf && z.holds && (zoneSide === null || zoneSideOf(z.side) === zoneSide)) rects.push(z.rect);
  }
  const st = env.fibs.get(env.tf)?.state;
  // das Band der Korrektur ist Unterstützung bei einem Aufwärtsimpuls, Widerstand bei einem Abwärtsimpuls
  if (st && (zoneSide === null || counterSide(st.leg.dir) === zoneSide)) rects.push(bandOf(st.leg));
  return rects;
}

function engulfOf(env: Env, tf: ContextTimeframe, side: Side | undefined, maxBars: 1 | 2): Engulf | null {
  const view = env.views.get(tf);
  if (!view || view.bars.length === 0) return null;
  const k = view.bars.length - 1;
  for (const s of side ? [side] : (['buy', 'sell'] as const)) {
    const e = engulfAt(view.bars, view.wide, k, s, maxBars);
    if (e) return e;
  }
  return null;
}

function evaluate(env: Env, explicit: SigPointsInput | null, options: SigOptions): SigAnalysis {
  const { tf } = env;
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const fib = env.fibs.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const bar = lastBarOf(env, tf);
  const side = options.side;
  const lowerTf = neighborTf(env, tf, 1);
  const rsiNow = last >= 0 ? view.rsi[last] : null;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  // Vergleichsseite (SIG-11): die Seite des Trades, sonst die Seite der Trendfarbe
  let compareSide: ZoneSide | null = null;
  if (explicit) compareSide = explicit.side;
  else if (side) compareSide = zoneSideOf(side);
  else if (trend.dir) compareSide = extremeSide(trend.dir);
  const indexOfTime = (time: number) => bars.findIndex((b) => b.time === time);
  const divFor = (zs: ZoneSide): Divergence | null =>
    explicit && explicit.side === zs ? divergenceOf(trend, zs, indexOfTime(explicit.timeA), indexOfTime(explicit.timeB)) : divergenceOf(trend, zs);
  const div = compareSide ? divFor(compareSide) : null;
  const reasons = side && bar ? computeReasons(env, side, { formationPoint: options.formationPoint }) : [];
  const nReasons = countReasons(reasons);

  // RSI
  add('SIG-01', bar ? flag(rsiNow !== null) : U, rsiNow ?? undefined);
  let extreme: boolean | null = null;
  if (rsiNow !== null) extreme = side ? rsiExtreme(rsiNow, side) : rsiExtreme(rsiNow, 'sell') || rsiExtreme(rsiNow, 'buy');
  add('SIG-02', tri(extreme), rsiNow ?? undefined);
  const atPlace = bar ? placeRects(env, side ? zoneSideOf(side) : null).some((r) => touches(r, bar)) : false;
  add('SIG-03', extreme === true ? flag(atPlace) : U);
  const tradeZone = side ? zoneSideOf(side) : compareSide;
  const pivotsOfSide = tradeZone ? trend.pivots.filter((p) => p.side === tradeZone) : [];
  const previous = pivotsOfSide.length >= 2 ? pivotsOfSide[pivotsOfSide.length - 2] : undefined;
  const prevRsi = previous ? view.rsi[previous.idx] : null;
  add('SIG-04', previous && prevRsi !== null && tradeZone ? tri(rsiExtreme(prevRsi, tradeSideOf(tradeZone))) : U, prevRsi ?? undefined);
  const lowerEngulf = side && lowerTf ? engulfOf(env, lowerTf, side, 2) !== null : null;
  let minReasons: number | null = null;
  if (trend.dir && side) minReasons = dirSide(trend.dir) === side ? TRD_PARAMS.reasons.with : TRD_PARAMS.reasons.counter;
  const enoughReasons = minReasons !== null && bar ? nReasons >= minReasons : null;
  if (!side) add('SIG-05', U);
  else if (extreme === true || lowerEngulf === true || enoughReasons === true) add('SIG-05', 'met');
  else add('SIG-05', extreme === null || lowerEngulf === null || enoughReasons === null ? U : 'unmet');
  const daily = env.views.get('D1');
  const dailyRsi = daily && daily.rsi.length > 0 ? daily.rsi[daily.rsi.length - 1] : null;
  add('SIG-06', !side || (tf !== 'H4' && tf !== 'H1') || dailyRsi === null ? U : tri(rsiExtreme(dailyRsi, side)), dailyRsi ?? undefined);
  add('SIG-07', !side || rsiNow === null ? U : tri(rsiExtreme(rsiNow, other(side))), rsiNow ?? undefined);
  add('SIG-08', U);

  // Divergenz im Wave
  add('SIG-09', div ? flag(div.a.wave !== null && div.b.wave !== null) : U);
  const waveNow = last >= 0 ? view.wave[last] : null;
  add('SIG-10', bar ? flag(waveNow !== null) : U, waveNow ?? undefined);
  add('SIG-11', compareSide && trend.dir ? flag(compareSide === extremeSide(trend.dir)) : U);
  add('SIG-12', div ? flag(div.a.pivot && div.b.pivot) : U);
  add('SIG-13', div && div.a.wave !== null && div.b.wave !== null ? flag(div.strict) : U);
  const gap = div && div.a.wave !== null && div.b.wave !== null ? div.b.wave - div.a.wave : undefined;
  add('SIG-14', gap === undefined ? U : flag(div!.tie), gap);
  const high = divFor('resistance');
  const low = divFor('support');
  add('SIG-15', high && high.b.wave !== null && high.a.wave !== null ? flag(high.tie && side !== 'sell') : U);
  add('SIG-16', low && low.b.wave !== null && low.a.wave !== null ? flag(low.tie && side !== 'buy') : U);
  const tradeDiv = side ? divFor(zoneSideOf(side)) : null;
  add('SIG-17', tradeDiv && tradeDiv.a.wave !== null && tradeDiv.b.wave !== null ? flag(tradeDiv.tie) : U);

  // Divergenz-Strategie
  const ref = refState(fib);
  add('SIG-18', ref && ref.corr ? flag(ref.depth >= FIB_PARAMS.retrace[0]) : U, ref?.corr ? ref.depth : undefined);
  const bo = breakoutOf(fib);
  add('SIG-19', !fib.state ? U : flag((bo?.reach ?? 0) >= FIB_PARAMS.extensions[0]), bo?.reach ?? 0);
  add('SIG-20', div && div.a.wave !== null && div.b.wave !== null ? flag(div.tie) : U);
  const lastPivot = div ? trend.pivots.some((p) => p.idx === div.b.idx && p.side === div.side) : false;
  let beyondLater = false;
  if (div) {
    for (let k = div.b.idx + 1; k <= last; k++) {
      const wick = div.side === 'resistance' ? bars[k].high : bars[k].low;
      if (outward(div.side, wick) > outward(div.side, div.b.price)) beyondLater = true;
    }
  }
  add('SIG-21', div ? flag(lastPivot && !beyondLater) : U);
  const rsiAtB = div ? view.rsi[div.b.idx] : null;
  add('SIG-22', div && rsiAtB !== null ? tri(rsiExtreme(rsiAtB, tradeSideOf(div.side))) : U, rsiAtB ?? undefined);

  // Engulf
  const one = bar ? engulfOf(env, tf, side, 1) : null;
  const two = bar ? engulfOf(env, tf, side, 2) : null;
  add('SIG-23', bar ? flag(one !== null) : U);
  add('SIG-24', one ? tri(one.prevWide) : U);
  if (two && two.count === 2) add('SIG-25', tri(two.engulfWide));
  else add('SIG-25', bar ? 'unmet' : U);
  const any = one ?? two;
  const anyZones = any && bar ? placeRects(env, zoneSideOf(any.side), any.idx) : [];
  const engulfAtZone = any ? bars.slice(any.prevIdx, any.idx + 1).some((b) => anyZones.some((r) => touches(r, b))) : false;
  add('SIG-26', any ? flag(engulfAtZone) : U);
  const holding = engulfZones(bars, view.wide).filter((z) => z.holds && (!side || z.side === side));
  add('SIG-27', bar ? flag(holding.length > 0) : U, holding.length);
  add('SIG-28', side && lowerTf ? flag(lowerEngulf === true) : U);
  add('SIG-29', U);
  const lowerAgainst = side && lowerTf ? engulfOf(env, lowerTf, other(side), 2) !== null : null;
  add('SIG-30', tri(lowerAgainst));
  const ahead =
    side && bar
      ? engulfZones(bars, view.wide).some(
          (z) => z.holds && z.big && z.side === other(side) && (side === 'buy' ? z.rect.bottom >= bar.close : z.rect.top <= bar.close),
        )
      : null;
  add('SIG-31', tri(ahead));
  const double = (() => {
    if (!bar) return null;
    for (const s of side ? [side] : (['buy', 'sell'] as const)) {
      if (engulfAt(bars, view.wide, last, s, 1) === null) continue;
      if ([last - 2, last - 3].some((j) => j >= 1 && engulfAt(bars, view.wide, j, s, 1) !== null)) return true;
    }
    return false;
  })();
  add('SIG-32', tri(double));

  // Kerzengröße
  const wideNow = last >= 0 ? view.wide[last] : null;
  add('SIG-33', wideNow === null || !bar ? U : flag(bar.high > bar.low));
  add('SIG-34', tri(wideNow));
  const run = trailingRun(view.narrow);
  const narrowNow = last >= 0 ? view.narrow[last] : null;
  add('SIG-35', narrowNow === null ? U : flag(run >= SIG_PARAMS.narrow.run), run);
  if (narrowNow === null || run < SIG_PARAMS.narrow.run) {
    add('SIG-36', narrowNow === null ? U : 'unmet');
  } else {
    const before = view.wide.slice(Math.max(0, last - run - 4), last - run + 1);
    add('SIG-36', flag(before.filter((w) => w === true).length >= 2));
  }
  const fst = fib.state;
  if (!fst || last <= fst.leg.end.idx) {
    add('SIG-37', U);
  } else {
    const count = (flags: readonly (boolean | null)[], from: number, to: number) => flags.slice(from, to).filter((f) => f === true).length;
    const { start, end } = fst.leg;
    const impulseWide = count(view.wide, start.idx + 1, end.idx + 1);
    const impulseNarrow = count(view.narrow, start.idx + 1, end.idx + 1);
    const corrWide = count(view.wide, end.idx + 1, last + 1);
    const corrNarrow = count(view.narrow, end.idx + 1, last + 1);
    add('SIG-37', flag(impulseWide > impulseNarrow && corrNarrow > corrWide));
  }
  let against: boolean | null = null;
  if (bar && side) against = side === 'buy' ? bar.close < bar.open : bar.close > bar.open;
  add('SIG-38', side && wideNow !== null && against !== null ? flag(wideNow && against) : U);
  add('SIG-39', U);

  // Gründe
  add('SIG-40', side && minReasons !== null && bar ? flag(nReasons >= minReasons) : U, side && bar ? nReasons : undefined);
  add('SIG-41', side && bar ? flag(nReasons >= 1) : U, side && bar ? nReasons : undefined);

  // Testere
  const saw = bar && last >= 2 ? (side ? [side] : (['buy', 'sell'] as const)).map((s) => sawAt(bars, view.wide, last, s)).find((x) => x !== null) ?? null : null;
  add('SIG-43', bar ? flag(saw !== null) : U);
  add('SIG-44', saw ? flag(saw.wickShare <= SIG_PARAMS.sawWick) : U, saw?.wickShare);
  const sawSide = saw && bar ? (side ?? (bars[last].close > bars[last].open ? 'buy' : 'sell')) : null;
  const sawAtZone = sawSide && bar ? placeRects(env, zoneSideOf(sawSide), last).some((r) => touches(r, bar)) : false;
  const sawReasons = sawSide ? countReasons(computeReasons(env, sawSide, { formationPoint: options.formationPoint }), ['G3', 'G8']) : 0;
  add('SIG-45', saw ? flag(sawAtZone && sawReasons >= 1) : U);

  // Kerzen zusammenfassen
  add('SIG-46', mergeCheck(env));

  const drawings = drawingsOf(env, div, extreme, side, any, engulfZones(bars, view.wide).filter((z) => z.holds));
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((d) => d.rules.includes(c.id)).map((d) => d.id))],
  }));
  const excluded = (['SIG-07', 'SIG-15', 'SIG-16', 'SIG-30', 'SIG-31', 'SIG-38'] as const).some(
    (id) => checks.find((c) => c.id === id)?.state === 'met',
  );
  let verdict: Verdict = 'valid';
  if (!bar) verdict = 'forming';
  else if (side && excluded) verdict = 'invalid';
  const points: Candidate['points'] = {};
  if (div) {
    points.A = { time: bars[div.a.idx].time, price: div.a.price };
    points.B = { time: bars[div.b.idx].time, price: div.b.price };
  }
  const candidateSide = side ?? (compareSide ? tradeSideOf(compareSide) : 'buy');
  return { tf, reasons, candidate: { code: 'SIG', side: candidateSide, tf, points, checks: withDrawings, drawings, verdict } };
}

/** SIG-46: die aus der tieferen Zeiteinheit zusammengefassten Kerzen stimmen mit der geladenen höheren überein */
function mergeCheck(env: Env): CheckState {
  const pairs: [ContextTimeframe, ContextTimeframe][] = [
    ['M15', 'H1'],
    ['H1', 'H4'],
  ];
  let compared = 0;
  for (const [from, to] of pairs) {
    const a = env.views.get(from);
    const b = env.views.get(to);
    if (!a || !b) continue;
    const loaded = new Map(b.bars.map((x) => [x.time, x]));
    for (const m of mergeBars(a.bars, TIMEFRAME_SEC[from], TIMEFRAME_SEC[to])) {
      const x = loaded.get(m.time);
      if (!x) continue;
      compared++;
      if (x.open !== m.open || x.high !== m.high || x.low !== m.low || x.close !== m.close) return 'unmet';
    }
  }
  return compared > 0 ? 'met' : U;
}

function drawingsOf(
  env: Env,
  div: Divergence | null,
  extreme: boolean | null,
  side: Side | undefined,
  engulf: Engulf | null,
  zones: ReturnType<typeof engulfZones>,
): Drawing[] {
  const bars = env.views.get(env.tf)!.bars;
  if (bars.length === 0) return [];
  const last = bars.length - 1;
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const out: Drawing[] = [
    { id: 'Z-SIG-01', tool: 'rsi', anchors: [at(0, 0), at(last, 100)], levels: [RSI_PARAMS.oversold, RSI_PARAMS.overbought], rules: ['SIG-01', 'SIG-02', 'SIG-04'] },
    { id: 'Z-SIG-03', tool: 'wave', anchors: [at(0, 0), at(last, 0)], rules: ['SIG-09', 'SIG-10'] },
  ];
  if (extreme === true) {
    const rsi = env.views.get(env.tf)!.rsi;
    const top = side ? side === 'sell' : (rsi[last] ?? 0) >= 50;
    let from = last;
    while (from > 0 && rsi[from - 1] !== null && (top ? rsi[from - 1]! >= RSI_PARAMS.overbought : rsi[from - 1]! <= RSI_PARAMS.oversold)) from--;
    out.push({
      id: 'Z-SIG-02',
      tool: 'zone',
      anchors: top ? [at(from, RSI_PARAMS.overbought), at(last, 100)] : [at(from, 0), at(last, RSI_PARAMS.oversold)],
      rules: ['SIG-02', 'SIG-04', 'SIG-06'],
    });
  }
  if (div) {
    out.push({
      id: 'Z-SIG-04',
      tool: 'trendline',
      anchors: [at(div.a.idx, div.a.price), at(div.b.idx, div.b.price)],
      rules: ['SIG-11', 'SIG-12', 'SIG-13', 'SIG-14', 'SIG-15', 'SIG-16', 'SIG-17', 'SIG-20'],
      side: tradeSideOf(div.side),
    });
  }
  const rules = ['SIG-23', 'SIG-26', 'SIG-27', 'SIG-31', 'SIG-43'];
  if (engulf) {
    out.push({
      id: 'Z-SIG-05',
      tool: 'zone',
      anchors: [at(engulf.prevIdx, engulf.zone.bottom), at(last, engulf.zone.top)],
      rules,
      side: engulf.side,
    });
  }
  for (const z of zones.slice(-3)) {
    if (engulf && z.idx === engulf.idx) continue;
    out.push({ id: 'Z-SIG-05', tool: 'zone', anchors: [at(z.idx - 1, z.rect.bottom), at(last, z.rect.top)], rules, side: z.side });
  }
  return out;
}

function unmeasurable(tf: ContextTimeframe): SigAnalysis {
  const checks = SIG_CHECK_IDS.map((id) => mk(id, U));
  return { tf, reasons: [], candidate: { code: 'SIG', side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' } };
}

/** Prüft die letzte geschlossene Kerze jeder geladenen Zeiteinheit (hoch → tief) */
export function analyzeSig(ctx: FormationContext, t: number, options: SigOptions = {}): SigAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => evaluate(envFor(base, ctx, t, tf), null, options));
}

/** Vergleicht zwei beliebige Punkte einer Seite; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkSigDivergence(ctx: FormationContext, t: number, input: SigPointsInput, options: SigOptions = {}): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars || !bars.some((b) => b.time === input.timeA) || !bars.some((b) => b.time === input.timeB)) {
    return unmeasurable(input.tf).candidate;
  }
  return evaluate(env, input, options).candidate;
}
