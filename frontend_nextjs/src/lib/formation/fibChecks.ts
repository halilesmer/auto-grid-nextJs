/**
 * Fibonacci (FIB): Prüfung je Bedingungs-ID und Zeichnungen Z-FIB-01 bis Z-FIB-08.
 * `analyzeFib` misst den letzten Impuls jeder geladenen Zeiteinheit, `checkFibCandidate` prüft eine beliebige Messung
 * (eigene Anker), auch wenn sie nicht der Messung der Erkennung entspricht (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (FIB-06, FIB-21, FIB-22, FIB-28) heißt ☑ „liegt vor“. Ohne die nötigen
 * Daten ist der Zustand „nicht messbar“. FIB-31 (Ziel des Gegentrend-Trades) ist Anzeige und hat keine Prüfung.
 */
import { outward, probeFractal, rectGap, wickEnd, zoneGeometry, type Rect } from './frz';
import {
  bandOf,
  breakoutOf,
  legDirOf,
  legLength,
  legState,
  levelPrice,
  refState,
  type FibLeg,
  type FibModel,
  type LegState,
} from './fib';
import { FIB_PARAMS, FRZ_PARAMS, SIG_PARAMS, type ContextTimeframe } from './params';
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
} from './reasons';
import { engulfZones } from './sig';
import { counterSide, extremeSide } from './trd';
import type { FormationContext } from './context';
import type { Anchor, Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Side, Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'FIB-01': ['required', 'confirmed'],
  'FIB-02': ['required', 'confirmed'],
  'FIB-03': ['required', 'confirmed'],
  'FIB-04': ['required', 'confirmed'],
  'FIB-05': ['required', 'confirmed'],
  'FIB-06': ['required', 'confirmed'],
  'FIB-07': ['required', 'confirmed'],
  'FIB-08': ['required', 'confirmed'],
  'FIB-09': ['required', 'confirmed'],
  'FIB-10': ['required', 'confirmed'],
  'FIB-11': ['required', 'confirmed'],
  'FIB-12': ['required', 'confirmed'],
  'FIB-13': ['exclusion', 'confirmed'],
  'FIB-14': ['required', 'confirmed'],
  'FIB-15': ['required', 'assumption'],
  'FIB-16': ['bonus', 'confirmed'],
  'FIB-17': ['required', 'assumption'],
  'FIB-18': ['required', 'confirmed'],
  'FIB-19': ['required', 'confirmed'],
  'FIB-20': ['required', 'confirmed'],
  'FIB-21': ['required', 'confirmed'],
  'FIB-22': ['bonus', 'confirmed'],
  'FIB-23': ['required', 'confirmed'],
  'FIB-24': ['bonus', 'confirmed'],
  'FIB-25': ['bonus', 'assumption'],
  'FIB-26': ['required', 'confirmed'],
  'FIB-27': ['bonus', 'confirmed'],
  'FIB-28': ['exclusion', 'confirmed'],
  'FIB-29': ['required', 'confirmed'],
  'FIB-30': ['required', 'confirmed'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const FIB_CHECK_IDS: readonly string[] = Object.keys(RULES);

export interface FibOptions {
  /** Seite des geplanten Trades (FIB-23, FIB-28); ohne sie sind diese Bedingungen nicht messbar */
  side?: Side;
}

export interface FibLegInput {
  tf: ContextTimeframe;
  /** Start (Level 1) und Ende (Level 0): Öffnungszeit der Kerze und Preis */
  start: Anchor;
  end: Anchor;
}

export interface FibAnalysis {
  tf: ContextTimeframe;
  model: FibModel;
  candidate: Candidate;
}

const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const U: CheckState = 'unmeasurable';

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

const indexOfTime = (env: Env, tf: ContextTimeframe, time: number): number =>
  env.views.get(tf)?.bars.findIndex((b) => b.time === time) ?? -1;

/** Messung der Erkennung: die vorläufige, solange das Ende noch läuft, sonst die fertige */
const measureOf = (model: FibModel): FibLeg | null => (model.state ? (model.state.running ?? model.state.leg) : null);

/** Längster Lauf volumenarmer Kerzen im Bereich */
function narrowRun(flags: readonly (boolean | null)[], from: number): number {
  let best = 0;
  let run = 0;
  for (let k = from; k < flags.length; k++) {
    run = flags[k] === true ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Kleinster Abstand der Level zum Rechteck, geteilt durch dessen Höhe (0 = ein Level liegt darin) */
function nearest(levels: readonly number[], rect: Rect): number {
  const height = rect.top - rect.bottom;
  const gap = Math.min(...levels.map((p) => Math.max(rect.bottom - p, p - rect.top, 0)));
  if (height > 0) return gap / height;
  return gap === 0 ? 0 : Infinity;
}

interface Confluence {
  rect: Rect;
  ratio: number;
}

function evaluate(env: Env, fib: FibModel, input: FibLegInput | null, options: FibOptions): Candidate {
  const { tf } = fib;
  const view = env.views.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const lastBar = lastBarOf(env, tf);

  let leg: FibLeg | null = null;
  if (input) {
    const si = indexOfTime(env, tf, input.start.time);
    const ei = indexOfTime(env, tf, input.end.time);
    if (si >= 0 && ei >= 0) {
      leg = {
        start: { idx: si, price: input.start.price },
        end: { idx: ei, price: input.end.price },
        dir: legDirOf(input.start.price, input.end.price),
      };
    }
  } else {
    leg = measureOf(fib);
  }
  const model: FibModel = input && leg ? { ...fib, legs: [leg], state: legState(bars, leg) } : fib;
  const st: LegState | null = model.state;
  // Korrekturbedingungen gelten nur, wenn das Ende ein fertiges Fraktal ist und die Messung nicht vorläufig weiterläuft (FIB-05)
  const fixedLeg = st?.leg ?? null;
  const fixedEnd =
    !!fixedLeg &&
    st!.running === null &&
    (() => {
      const p = probeFractal(bars, fixedLeg.end.idx, extremeSide(fixedLeg.dir));
      return p.leftBars === N && p.rightBars === N && p.beyond === 0;
    })();
  const corrOk = fixedEnd && st!.corr !== null;
  const b = breakoutOf(model);
  const refSt = refState(model);
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));
  const depth = st?.depth;

  // Impuls und Anker
  if (!leg) {
    for (const id of ['FIB-01', 'FIB-02', 'FIB-03', 'FIB-04', 'FIB-05', 'FIB-06', 'FIB-08', 'FIB-18']) add(id, U);
  } else {
    const es = extremeSide(leg.dir);
    const cs = counterSide(leg.dir);
    add('FIB-01', fib.dir ? flag(leg.dir === fib.dir) : U);
    const auto = measureOf(fib);
    add('FIB-02', auto ? flag(auto.start.idx === leg.start.idx && auto.end.idx === leg.end.idx) : U);
    add(
      'FIB-03',
      flag(leg.start.price === wickEnd(bars[leg.start.idx], cs) && leg.end.price === wickEnd(bars[leg.end.idx], es)),
    );
    add('FIB-04', flag(leg.start.idx < leg.end.idx));
    add('FIB-05', flag(fixedEnd));
    let further = false;
    for (let k = leg.start.idx + 1; k <= last; k++) {
      if (outward(es, wickEnd(bars[k], es)) > outward(es, leg.end.price)) further = true;
    }
    add('FIB-06', flag(!further));
    add('FIB-08', flag(legLength(leg) > 0), levelPrice(leg, FIB_PARAMS.retrace[0]));
    add('FIB-18', flag(legLength(leg) > 0), levelPrice(leg, -FIB_PARAMS.extensions[0]));
  }

  // Korrektur
  const dep = corrOk ? st!.depth : undefined;
  const reached = (levels: readonly number[]) => (dep === undefined ? 0 : Math.max(0, ...levels.filter((l) => dep >= l)));
  add('FIB-07', dep === undefined ? U : flag(dep >= FIB_PARAMS.retrace[0]), dep);
  add('FIB-09', dep === undefined ? U : flag(reached(FIB_PARAMS.levels) > 0), reached(FIB_PARAMS.levels));
  add('FIB-10', dep === undefined ? U : flag(reached(FIB_PARAMS.retrace) > 0), reached(FIB_PARAMS.retrace));
  add('FIB-11', corrOk && lastBar ? flag(touches(bandOf(fixedLeg!), lastBar)) : U);
  const refDepth = refSt && refSt.corr ? refSt.depth : undefined;
  add('FIB-12', refDepth === undefined ? U : flag(refDepth >= FIB_PARAMS.retrace[0]), refDepth);
  if (dep === undefined) {
    add('FIB-13', U);
  } else {
    const small = narrowRun(view.narrow, fixedLeg!.end.idx + 1) >= SIG_PARAMS.narrow.run;
    add('FIB-13', flag(dep >= FIB_PARAMS.bowl && dep < FIB_PARAMS.retrace[0] && small), dep);
  }
  const barsAfter = !!fixedLeg && last > fixedLeg.end.idx;
  add('FIB-14', barsAfter ? flag(!st!.ended) : U, depth);
  add('FIB-15', barsAfter ? flag(!st!.ended) : U);
  add('FIB-16', dep === undefined ? U : flag(dep >= FIB_PARAMS.retrace[0] && dep < FIB_PARAMS.strongTurn), dep);
  add('FIB-17', dep === undefined ? U : flag(dep < FIB_PARAMS.farLevel), dep);

  // Ausdehnung und gesunder Trend
  const bigEnough = b !== null && refDepth !== undefined && refDepth >= FIB_PARAMS.retrace[0];
  if (b === null) add('FIB-19', U);
  else if (!b.closedBeyond) add('FIB-19', U, b.reach);
  else add('FIB-19', flag(bigEnough && b.reach >= FIB_PARAMS.extensions[0]), b.reach);
  const hasLeg = !!fixedLeg;
  add('FIB-20', !hasLeg ? U : flag((b?.reach ?? 0) >= FIB_PARAMS.extensions[0]), b?.reach ?? 0);
  add('FIB-21', !hasLeg ? U : flag(!!b && b.closedBeyond && b.reach < FIB_PARAMS.extensions[0]), b?.reach ?? 0);
  if (!fixedLeg || last <= fixedLeg.end.idx) {
    add('FIB-22', U);
  } else if ((b?.reach ?? 0) >= FIB_PARAMS.extensions[0]) {
    add('FIB-22', 'unmet');
  } else if (!view.wide.slice(fixedLeg.end.idx + 1).some((w) => w !== null)) {
    add('FIB-22', U);
  } else {
    const es = extremeSide(fixedLeg.dir);
    const zone = zoneGeometry(bars, fixedLeg.end.idx, es, tf);
    let hit = false;
    for (let k = fixedLeg.end.idx + 1; k <= last; k++) {
      const out = es === 'resistance' ? bars[k].close < zone.bottom : bars[k].close > zone.top;
      // die volumenstarke Kerze läuft gegen den Impuls zurück
      const back = es === 'resistance' ? bars[k].close < bars[k].open : bars[k].close > bars[k].open;
      if (view.wide[k] === true && out && back) hit = true;
    }
    add('FIB-22', flag(hit));
  }

  // Einstieg in der Korrekturzone
  const side = options.side;
  const reasons = side ? computeReasons(env, side) : [];
  const inBand = corrOk && lastBar ? touches(bandOf(fixedLeg!), lastBar) : false;
  add('FIB-23', !side || !corrOk ? U : flag(inBand && countReasons(reasons, ['G4', 'G5']) >= 1), side ? countReasons(reasons, ['G4', 'G5']) : undefined);

  // Konfluenz mit Zonen: Fraktalzonen der Zeiteinheit auf der Seite der Korrektur und gültige Engulf-Zonen
  let confluence: Confluence[] = [];
  let potential: Confluence[] | null = null;
  if (corrOk) {
    const levels = FIB_PARAMS.retrace.map((l) => levelPrice(fixedLeg!, l));
    const zoneSide = counterSide(fixedLeg!.dir);
    const own = env.frz.zones.filter((z) => z.tf === tf && z.side === zoneSide).map((z) => z.rect);
    const engulf = engulfZones(bars, view.wide)
      .filter((z) => z.holds && dirSide(fixedLeg!.dir) === z.side)
      .map((z) => z.rect);
    confluence = [...own, ...engulf].map((rect) => ({ rect, ratio: nearest(levels, rect) }));
    const reversed = env.frz.reversed.filter((z) => z.tf === tf && z.side === zoneSide && z.strength === 0);
    potential = reversed.map((z) => ({ rect: z.rect, ratio: nearest([levels[0]], z.rect) }));
  }
  const best = confluence.length > 0 ? Math.min(...confluence.map((c) => c.ratio)) : undefined;
  add('FIB-24', !corrOk ? U : flag(best === 0), best);
  add('FIB-25', !corrOk ? U : flag(best !== undefined && best <= FIB_PARAMS.nearZone), best);
  add('FIB-26', !corrOk || potential === null || potential.length === 0 ? U : flag(potential.some((c) => c.ratio <= FIB_PARAMS.nearZone)));

  // zwei Zeiteinheiten
  const lowerTf = neighborTf(env, tf, 1);
  const higherTf = neighborTf(env, tf, -1);
  const otherTf = lowerTf ?? higherTf;
  const other = otherTf ? env.fibs.get(otherTf)?.state : undefined;
  const bandA = fixedLeg ? bandOf(fixedLeg) : undefined;
  const bandB = other ? bandOf(other.leg) : undefined;
  add('FIB-27', !bandA || !bandB || !other ? U : flag(other.leg.dir === fixedLeg!.dir && rectGap(bandA, bandB) === 0));
  const higherDir = higherTf ? env.fibs.get(higherTf)?.dir : null;
  add(
    'FIB-28',
    !side || !higherDir || !st ? U : flag(dirSide(higherDir) !== side && st.depth > FIB_PARAMS.lastLevel),
    depth,
  );
  const higherFib = higherTf ? env.fibs.get(higherTf) : undefined;
  const hb = higherFib ? breakoutOf(higherFib) : null;
  if (!higherTf || !higherFib?.state) {
    add('FIB-29', U);
    add('FIB-30', U);
  } else {
    const hBars = env.views.get(higherTf)!.bars;
    const hRef = hb ? legState(hBars, hb.ref) : higherFib.state;
    const healthy = !!hRef.corr && hRef.depth >= FIB_PARAMS.retrace[0];
    add('FIB-29', flag(healthy && (hb?.reach ?? 0) >= FIB_PARAMS.extensions[0]), hb?.reach ?? 0);
    const hLeg = higherFib.state.leg;
    const hes = extremeSide(hLeg.dir);
    const zone = zoneGeometry(hBars, hLeg.end.idx, hes, higherTf);
    const trend = env.trends.get(tf)!;
    const found = trend.cands.some(
      (p) => p.side === hes && bars[p.idx].time >= hBars[hLeg.end.idx].time && p.price >= zone.bottom && p.price <= zone.top,
    );
    add('FIB-30', flag(found));
  }

  const drawings = leg ? drawingsOf(env, fib, leg, confluence, other ?? null) : [];
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((d) => d.rules.includes(c.id)).map((d) => d.id))],
  }));
  let verdict: Verdict = 'valid';
  if (!leg) verdict = 'forming';
  else if (st?.ended) verdict = 'invalid';
  else if (checks.find((c) => c.id === 'FIB-28')?.state === 'met') verdict = 'invalid';
  const points: Candidate['points'] = {};
  if (leg) {
    points.S = { time: bars[leg.start.idx].time, price: leg.start.price };
    points.E = { time: bars[leg.end.idx].time, price: leg.end.price };
  }
  return { code: 'FIB', side: leg ? dirSide(leg.dir) : 'buy', tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, fib: FibModel, leg: FibLeg, confluence: Confluence[], other: LegState | null): Drawing[] {
  const bars = env.views.get(fib.tf)!.bars;
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const lastTime = bars[bars.length - 1].time;
  const ids = (list: number[]) => list.map((n) => `FIB-${String(n).padStart(2, '0')}`);
  const side = dirSide(leg.dir);
  const anchors = [at(leg.start.idx, leg.start.price), at(leg.end.idx, leg.end.price)];
  const [l382, , l618] = FIB_PARAMS.retrace;
  const ext = FIB_PARAMS.extensions.map((x) => -x);
  const out: Drawing[] = [
    { id: 'Z-FIB-01', tool: 'fib', anchors, levels: [1, l618, FIB_PARAMS.retrace[1], l382, 0], rules: ids([1, 2, 3, 4, 5, 6, 7, 8, 9]), side },
    {
      id: 'Z-FIB-02',
      tool: 'zone',
      anchors: [at(leg.end.idx, levelPrice(leg, l382)), { time: lastTime, price: levelPrice(leg, l618) }],
      rules: ids([10, 11, 12, 14, 16]),
      side,
    },
    { id: 'Z-FIB-03', tool: 'fibExt', anchors, levels: ext, rules: ids([18, 19, 20, 21]), side },
    { id: 'Z-FIB-04', tool: 'fib', anchors, levels: [...ext, 0, ...FIB_PARAMS.levels, 1], rules: ids([10, 17, 18]), side },
    { id: 'Z-FIB-05', tool: 'hline', anchors: [at(leg.end.idx, levelPrice(leg, FIB_PARAMS.bowl))], levels: [FIB_PARAMS.bowl], rules: ids([13]), side },
  ];
  for (const level of [0, ...ext.slice(0, 1), ...ext.slice(2)]) {
    out.push({ id: 'Z-FIB-06', tool: 'marker', anchors: [at(leg.end.idx, levelPrice(leg, level))], levels: [level], rules: ids([19, 31]), side });
  }
  if (other) {
    const a = bandOf(leg);
    const b = bandOf(other.leg);
    const lo = Math.max(a.bottom, b.bottom);
    const hi = Math.min(a.top, b.top);
    out.push({
      id: 'Z-FIB-07',
      tool: 'zone',
      anchors: [at(leg.end.idx, Math.min(lo, hi)), { time: lastTime, price: Math.max(lo, hi) }],
      rules: ids([27]),
      side,
    });
  }
  const band = bandOf(leg);
  for (const c of confluence) {
    const lo = Math.max(band.bottom, c.rect.bottom);
    const hi = Math.min(band.top, c.rect.top);
    if (lo > hi) continue;
    out.push({ id: 'Z-FIB-08', tool: 'zone', anchors: [at(leg.end.idx, lo), { time: lastTime, price: hi }], rules: ids([24, 25, 26]), side });
  }
  return out;
}

function unmeasurable(tf: ContextTimeframe): Candidate {
  const checks = FIB_CHECK_IDS.map((id) => mk(id, U));
  return { code: 'FIB', side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' };
}

/** Misst den letzten Impuls jeder geladenen Zeiteinheit (hoch → tief) */
export function analyzeFib(ctx: FormationContext, t: number, options: FibOptions = {}): FibAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const model = env.fibs.get(tf)!;
    return { tf, model, candidate: evaluate(env, model, null, options) };
  });
}

/** Prüft eine Messung mit eigenen Ankern; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkFibCandidate(
  ctx: FormationContext,
  t: number,
  input: FibLegInput,
  options: FibOptions = {},
): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const fib = env?.fibs.get(input.tf);
  if (!env || !fib) return unmeasurable(input.tf);
  if (indexOfTime(env, input.tf, input.start.time) < 0 || indexOfTime(env, input.tf, input.end.time) < 0) return unmeasurable(input.tf);
  return evaluate(env, fib, input, options);
}
