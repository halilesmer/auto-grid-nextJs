/**
 * Trend-618 (T618): Prüfung je Bedingungs-ID und Zeichnungen Z-T618-01 bis Z-T618-04.
 * `analyzeT618` sucht je geladener Zeiteinheit das Extrem P vor dem Bruch, die Linie durch die Startpunkte der letzten 2 Impulse und das
 * Impulsende I; `checkT618Candidate` prüft eigene Punkte (P, optional I). Die Anker der Linie sind die Wendepunkte der Gegenseite
 * direkt vor P im Trendzug (der letzte und der drittletzte Wendepunkt vor P).
 *
 * Lesart der Zustände: Formkern (T618-01 bis T618-07) ist Pflicht, T618-08 und T618-09 sind Verstärkung. T618-09 ist ☑, wenn die Kerze
 * an der Berührung nicht volumenstark gegen die Trade-Richtung ist. Ohne die nötigen Daten ist der Zustand „nicht messbar“.
 * Verkauf nach Aufwärtstrend und Kauf nach Abwärtstrend sind derselbe Code.
 */
import type { FormationContext } from './context';
import { levelPrice } from './fib';
import { closesBeyond, otherSide, outward, zoneGeometry, type ZoneSide } from './frz';
import { lineAtBar, legLens, reversalSide, shrinks } from './lineChannel';
import type { ObPoint } from './obo';
import { T618_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, envFor, type Env } from './reasons';
import { divergenceOf } from './sig';
import { impulseEnds } from './f2618';
import { lineTouches, returnTouch } from './t618';
import type { TrendModel } from './trd';
import type { Anchor, Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Side, Verdict } from './types';
import { anchorAt, fractalDone, ids, unmeasurable } from './xabcd';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'T618-01': ['required', 'secondary'],
  'T618-02': ['required', 'secondary'],
  'T618-03': ['required', 'assumption'],
  'T618-04': ['required', 'secondary'],
  'T618-05': ['required', 'secondary'],
  'T618-06': ['required', 'secondary'],
  'T618-07': ['required', 'secondary'],
  'T618-08': ['bonus', 'secondary'],
  'T618-09': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const T618_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Struktur vor dem Bruch: ist sie verletzt, ist die Formation ungültig */
const STRUCTURE_IDS = ids('T618', [1, 2, 3]);
/** Ereignisse nach dem Bruch: fehlen sie noch, ist die Formation im Aufbau */
const EVENT_IDS = ids('T618', [4, 5, 6, 7]);

export interface T618PointsInput {
  tf: ContextTimeframe;
  /** Dochtspitze des Extrems P vor dem Bruch: Öffnungszeit der Kerze und Preis */
  p: Anchor;
  /** Ohne Angabe: das jüngste Impulsende seit P */
  i?: Anchor;
}

export interface T618Analysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('T618', tf, T618_CHECK_IDS, RULES);

/** Volumenstarke Kerze gegen die Trade-Richtung an der Berührung: die Kerze davor und die Kerze der Berührung; null, solange eine Kerze nicht messbar ist */
function wideAgainst(env: Env, tf: ContextTimeframe, es: ZoneSide, idx: number): boolean | null {
  const view = env.views.get(tf)!;
  const flags: (boolean | null)[] = [];
  for (const k of [idx - 1, idx]) {
    if (k < 0) continue;
    const b = view.bars[k];
    const against = es === 'resistance' ? b.close > b.open : b.close < b.open;
    flags.push(view.wide[k] === null ? null : view.wide[k] === true && against);
  }
  if (flags.includes(true)) return true;
  return flags.includes(null) ? null : false;
}

function evaluate(env: Env, tf: ContextTimeframe, model: TrendModel, pPos: number, i: ObPoint): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const pv = model.pivots;
  const p = pv[pPos];
  const l1 = pv[pPos - 3];
  const l2 = pv[pPos - 1];
  if (!p || !l1 || !l2) return empty(tf);
  const es = p.side;
  const cs = otherSide(es);
  const wantedDir = es === 'resistance' ? 'down' : 'up';
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));
  const levelAt = (k: number) => lineAtBar(bars, l1, l2, k);

  // Linie und Bruch (T618-02 bis T618-04)
  let breakIdx: number | null = null;
  for (let k = p.idx + 1; k < bars.length; k++) {
    if (closesBeyond(bars[k], levelAt(k), cs)) {
      breakIdx = k;
      break;
    }
  }
  const touches = lineTouches(bars, cs, l1, l2, p, breakIdx ?? bars.length);

  add('T618-01', tri(shrinks(legLens(pv, es, p.idx + 1), T618_PARAMS.shrinkCount)));
  add('T618-02', flag(outward(es, l2.price - l1.price) > 0));
  add('T618-03', flag(!touches.violatedBeforeP), touches.total);
  add('T618-04', flag(breakIdx !== null));
  add('T618-05', flag(model.changes.some((c) => c.to === wantedDir && c.k > p.idx)));

  const s = returnTouch(bars, es, cs, p, i);
  add('T618-06', flag(breakIdx !== null && i.idx >= breakIdx && fractalDone(bars, i, cs)));
  add('T618-07', flag(s.touch !== null), s.depth);

  const prior = pv[pPos - 2];
  const div = prior ? divergenceOf(model, es, prior.idx, p.idx) : null;
  add('T618-08', div && div.a.wave !== null && div.b.wave !== null ? flag(div.tie) : U);
  const wide = s.touch ? wideAgainst(env, tf, es, s.touch.idx) : null;
  add('T618-09', s.touch ? tri(wide === null ? null : !wide) : U);

  const drawings = drawingsOf(env, tf, model, pPos, i, s);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  let verdict: Verdict = 'valid';
  if (STRUCTURE_IDS.some((id) => stateOf(id) === 'unmet')) verdict = 'invalid';
  else if (EVENT_IDS.some((id) => stateOf(id) !== 'met')) verdict = 'forming';

  const points: Candidate['points'] = {
    L1: anchorAt(bars, l1.idx, l1.price),
    L2: anchorAt(bars, l2.idx, l2.price),
    P: anchorAt(bars, p.idx, p.price),
    I: anchorAt(bars, i.idx, i.price),
  };
  if (s.touch) points.K = anchorAt(bars, s.touch.idx, s.touch.level);
  return { code: 'T618', side: reversalSide(es), tf, points, checks: withDrawings, drawings, verdict };
}

type Return = NonNullable<ReturnType<typeof returnTouch>>;

/** Z-T618-01 (die schräge Linie durch die Startpunkte der letzten 2 Impulse, bis zur letzten Kerze verlängert) und die Stop-Zone an P */
function drawingsOfLine(bars: readonly FormationBar[], l1: ObPoint, l2: ObPoint, p: ObPoint, es: ZoneSide, tf: ContextTimeframe): Drawing[] {
  const last = bars.length - 1;
  const side: Side = reversalSide(es);
  const pZone = zoneGeometry(bars, p.idx, es, tf);
  return [
    {
      id: 'Z-T618-01',
      tool: 'trendline',
      anchors: [anchorAt(bars, l1.idx, l1.price), { time: bars[last].time, price: lineAtBar(bars, l1, l2, last) }],
      rules: ids('T618', [2, 3, 4]),
      side,
    },
    { id: 'Z-T618-03', tool: 'zone', anchors: [anchorAt(bars, p.idx, pZone.bottom), { time: bars[last].time, price: pZone.top }], rules: [], side },
  ];
}

function drawingsOf(env: Env, tf: ContextTimeframe, model: TrendModel, pPos: number, i: ObPoint, s: Return): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const pv = model.pivots;
  const p = pv[pPos];
  const es = p.side;
  const cs = otherSide(es);
  const side = reversalSide(es);
  const lastTime = bars[bars.length - 1].time;
  const iZone = zoneGeometry(bars, i.idx, cs, tf);
  const entry = levelPrice(s.leg, T618_PARAMS.entryLevel);
  const [line, pZoneDrawing] = drawingsOfLine(bars, pv[pPos - 3], pv[pPos - 1], p, es, tf);
  const out: Drawing[] = [
    line,
    {
      id: 'Z-T618-02',
      tool: 'fib',
      anchors: [anchorAt(bars, p.idx, p.price), anchorAt(bars, i.idx, i.price)],
      levels: [T618_PARAMS.zoneLevel, T618_PARAMS.entryLevel, ...T618_PARAMS.targetExtensions.map((x) => -x)],
      rules: ids('T618', [6, 7]),
      side,
    },
    pZoneDrawing,
    { id: 'Z-T618-03b', tool: 'zone', anchors: [anchorAt(bars, i.idx, iZone.bottom), { time: lastTime, price: iZone.top }], rules: [], side },
  ];
  if (s.touch) {
    out.push({
      id: 'Z-T618-04',
      tool: 'fibExt',
      anchors: [anchorAt(bars, p.idx, p.price), anchorAt(bars, i.idx, i.price), anchorAt(bars, s.touch.idx, entry)],
      levels: [...T618_PARAMS.expansion],
      rules: [],
      side,
    });
  }
  return out;
}

const misses = (cand: Candidate): number => cand.checks.filter((k) => [...STRUCTURE_IDS, ...EVENT_IDS].includes(k.id) && k.state === 'unmet').length;

/** Sucht je geladener Zeiteinheit (hoch → tief) P, Linie und I; es gilt der Kandidat mit den wenigsten verletzten Form-Bedingungen, bei Gleichstand der jüngste */
export function analyzeT618(ctx: FormationContext, t: number): T618Analysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const model = env.trends.get(tf)!;
    const bars = env.views.get(tf)!.bars;
    let best: { candidate: Candidate; unmet: number } | null = null;
    const first = Math.max(3, model.pivots.length - T618_PARAMS.maxPeaks);
    for (let pPos = model.pivots.length - 1; pPos >= first; pPos--) {
      const p = model.pivots[pPos];
      for (const i of impulseEnds(bars, p, otherSide(p.side)).reverse()) {
        const candidate = evaluate(env, tf, model, pPos, i);
        const unmet = misses(candidate);
        if (best === null || unmet < best.unmet) best = { candidate, unmet };
      }
    }
    return { tf, candidate: best ? best.candidate : empty(tf) };
  });
}

/** Prüft eigene Punkte; ist P kein Wendepunkt des Trendzugs oder eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkT618Candidate(ctx: FormationContext, t: number, input: T618PointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const model = env?.trends.get(input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !model || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const pIdx = idxOf(input.p);
  const pPos = model.pivots.findIndex((x) => x.idx === pIdx);
  const iIdx = input.i ? idxOf(input.i) : undefined;
  if (pPos < 0 || iIdx === -1 || (iIdx !== undefined && iIdx <= pIdx)) return empty(input.tf);
  const p = model.pivots[pPos];
  const i = input.i && iIdx !== undefined ? { idx: iIdx, price: input.i.price } : impulseEnds(bars, p, otherSide(p.side)).pop();
  return i ? evaluate(env, input.tf, model, pPos, i) : empty(input.tf);
}
