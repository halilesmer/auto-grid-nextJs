/**
 * 2618: Prüfung je Bedingungs-ID und Zeichnungen Z-2618-01 bis Z-2618-05.
 * `analyze2618` sucht je geladener Zeiteinheit das Doppeltop-Paar (H1, N), das Impulsende I und den Beginn des Impulses und misst die
 * Berührung von 0.618; `check2618Candidate` prüft eigene Punkte.
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (2618-02, 2618-03, 2618-05, 2618-09, 2618-10) heißt ☑ „liegt vor“, bei den
 * Ausschlüssen 2618-09 und 2618-10 also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“.
 * Das Signal am Einstieg hat keine Zeile: ohne RSI, Wave und Umkehrkerze (E-2). Die Formation ist ein Verkauf nach einem Doppeltop,
 * ein Kauf nach einem Doppelboden.
 */
import { evaluateCdt } from './cdtChecks';
import { shapeOn, selectBases, type CdtBase, type CdtPoint, type CdtShape } from './cdt';
import type { FormationContext } from './context';
import { closedBeyondStop, impulseEnds, secondTop, shapeOf2618, stopEdge, trendDirUpTo, wideAgainst, type F2618Shape } from './f2618';
import { legLength, levelPrice } from './fib';
import { outward, zoneGeometry, type ZoneSide } from './frz';
import { CONTEXT_TIMEFRAMES, F2618_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, envFor, type Env } from './reasons';
import { anchorAt, fractalDone, ids, unmeasurable } from './xabcd';
import type { Anchor, Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Verdict } from './types';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  '2618-01': ['required', 'confirmed'],
  '2618-02': ['required', 'confirmed'],
  '2618-03': ['required', 'confirmed'],
  '2618-04': ['required', 'assumption'],
  '2618-05': ['required', 'confirmed'],
  '2618-06': ['required', 'confirmed'],
  '2618-07': ['bonus', 'assumption'],
  '2618-08': ['bonus', 'confirmed'],
  '2618-09': ['exclusion', 'assumption'],
  '2618-10': ['exclusion', 'assumption'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const F2618_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form, Berührung, Trend und die Ausschlüsse */
const FORM_IDS = ['2618-01', '2618-02', '2618-03', '2618-04', '2618-05', '2618-06'];
const EXCLUSION_IDS = ['2618-09', '2618-10'];
const CDT_FORM = ['CDT-01', 'CDT-02', 'CDT-03', 'CDT-04', 'CDT-05', 'CDT-06'];

export interface F2618PointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen: Öffnungszeit der Kerze und Preis */
  h1: Anchor;
  n: Anchor;
  /** Ohne Angabe: der äußerste Docht seit N */
  h2?: Anchor;
  /** Ohne Angabe: das jüngste Impulsende seit H2 */
  i?: Anchor;
}

export interface F2618Analysis {
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

/** 2618-07: der Einstiegspunkt liegt nahe einem Level 0.382/0.5/0.618 einer größeren Fib-Bewegung dieser oder einer höheren Zeiteinheit */
function atLargerLevel(env: Env, tf: ContextTimeframe, s: F2618Shape, atr: number | null): boolean | null {
  if (atr === null) return null;
  const entry = levelPrice(s.leg, F2618_PARAMS.entryLevel);
  const near = F2618_PARAMS.nearAtr * atr;
  const tfs = CONTEXT_TIMEFRAMES.slice(0, CONTEXT_TIMEFRAMES.indexOf(tf) + 1);
  const legs = tfs.flatMap((x) => env.fibs.get(x)?.legs ?? []).filter((leg) => legLength(leg) > legLength(s.leg));
  return legs.some((leg) => F2618_PARAMS.confluenceLevels.some((level) => Math.abs(levelPrice(leg, level) - entry) <= near));
}

function evaluate(env: Env, tf: ContextTimeframe, c: CdtShape, cdt: Candidate, i: CdtPoint | null): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const s: F2618Shape | null = c.h2 && i ? shapeOf2618(env, tf, c, i) : null;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  const cdtStates = CDT_FORM.map((id) => cdt.checks.find((k) => k.id === id)!.state);
  const form = cdtStates.includes(U) ? U : 'met';
  add('2618-01', cdtStates.includes('unmet') ? 'unmet' : form);

  add('2618-02', s ? flag(s.breakIdx !== null) : U);
  add('2618-03', s ? flag(fractalDone(bars, s.i, c.cs)) : U);
  add('2618-04', s ? flag(fractalDone(bars, s.start, c.es) && outward(c.cs, s.i.price) > outward(c.cs, c.n.price)) : U);
  add('2618-05', s ? flag(s.touch !== null) : U, s?.depth);

  const upTo = s ? (s.touch?.idx ?? s.windowEnd) : null;
  const dir = upTo === null ? null : trendDirUpTo(env, tf, upTo);
  const wanted = c.es === 'resistance' ? 'down' : 'up';
  add('2618-06', dir === null ? U : flag(dir === wanted));

  const atr = upTo === null ? null : (view.atr[upTo] ?? null);
  add('2618-07', s ? tri(atLargerLevel(env, tf, s, atr)) : U);
  add('2618-08', flag(F2618_PARAMS.timeframes.includes(tf)));

  const edge = c.h2 ? stopEdge(c, zoneGeometry(bars, c.h2.idx, c.es, tf)) : null;
  add('2618-09', s && edge !== null ? flag(closedBeyondStop(bars, s, edge)) : U);
  add('2618-10', s && s.touch ? tri(wideAgainst(env, tf, c, s.touch.idx)) : U);

  const drawings = s && edge !== null ? drawingsOf(env, tf, s, edge) : [];
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  const excluded = EXCLUSION_IDS.some((id) => stateOf(id) === 'met');
  // Ohne Impulsende (H2 ist die letzte Kerze) fehlt noch alles nach H2: die Formation ist im Aufbau
  const formMissing = s === null || ['2618-02', '2618-03', '2618-04', '2618-05'].some((id) => stateOf(id) === 'unmet');
  // Ohne Berührung kann sich der Trend noch wenden; mit Berührung gilt der Trend dieser Kerze
  const trendMissing = stateOf('2618-06') === 'unmet';
  let verdict: Verdict = 'valid';
  if (excluded || stateOf('2618-01') === 'unmet' || (trendMissing && s?.touch)) verdict = 'invalid';
  else if (formMissing || trendMissing) verdict = 'forming';

  const points: Candidate['points'] = {
    H1: anchorAt(bars, c.h1.idx, c.h1.price),
    N: anchorAt(bars, c.n.idx, c.n.price),
  };
  if (c.h2) points.H2 = anchorAt(bars, c.h2.idx, c.h2.price);
  if (s) {
    points.I = anchorAt(bars, s.i.idx, s.i.price);
    if (s.start.idx !== c.h2!.idx) points.S = anchorAt(bars, s.start.idx, s.start.price);
    if (s.touch) points.K = anchorAt(bars, s.touch.idx, s.touch.level);
  }
  return { code: '2618', side: c.side, tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(env: Env, tf: ContextTimeframe, s: F2618Shape, edge: number): Drawing[] {
  const bars = env.views.get(tf)!.bars;
  const lastTime = bars[bars.length - 1].time;
  const { cdt, start, i, leg } = s;
  const side = cdt.side;
  const entry = levelPrice(leg, F2618_PARAMS.entryLevel);
  const half = levelPrice(leg, F2618_PARAMS.zoneLevel);
  const target2 = levelPrice(leg, -F2618_PARAMS.targetExtension);
  const iZone = zoneGeometry(bars, i.idx, cdt.cs, tf);
  const tp1Edge = cdt.es === 'resistance' ? iZone.top : iZone.bottom;
  const from = s.touch ? bars[s.touch.idx].time : lastTime;
  return [
    {
      id: 'Z-2618-01',
      tool: 'fib',
      anchors: [anchorAt(bars, start.idx, start.price), anchorAt(bars, i.idx, i.price)],
      levels: [F2618_PARAMS.zoneLevel, F2618_PARAMS.entryLevel, -F2618_PARAMS.targetExtension],
      rules: ids('2618', [4, 5]),
      side,
    },
    {
      id: 'Z-2618-02',
      tool: 'zone',
      anchors: [anchorAt(bars, i.idx, Math.min(half, entry)), { time: lastTime, price: Math.max(half, entry) }],
      rules: ids('2618', [5]),
      side,
    },
    {
      id: 'Z-2618-03',
      tool: 'zone',
      anchors: [anchorAt(bars, i.idx, iZone.bottom), { time: lastTime, price: iZone.top }],
      rules: ids('2618', [3]),
      side,
    },
    { id: 'Z-2618-03b', tool: 'hline', anchors: [anchorAt(bars, i.idx, target2)], levels: [-F2618_PARAMS.targetExtension], rules: [], side },
    { id: 'Z-2618-04', tool: 'label', anchors: [{ time: lastTime, price: edge }, { time: lastTime, price: tp1Edge }], rules: ids('2618', [9]), side },
    { id: 'Z-2618-05', tool: 'trendline', anchors: [{ time: from, price: entry }, { time: lastTime, price: tp1Edge }], rules: [], side },
  ];
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('2618', tf, F2618_CHECK_IDS, RULES);

const misses = (cand: Candidate): number =>
  cand.checks.filter((k) => (FORM_IDS.includes(k.id) && k.state === 'unmet') || (EXCLUSION_IDS.includes(k.id) && k.state === 'met')).length;

/** Sucht je geladener Zeiteinheit (hoch → tief) Doppeltop-Paar und Impulsende; es gilt das Paar mit den wenigsten verletzten Form-Bedingungen, bei Gleichstand das jüngste */
export function analyze2618(ctx: FormationContext, t: number): F2618Analysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const bars = env.views.get(tf)!.bars;
    let best: { candidate: Candidate; unmet: number } | null = null;
    for (const picked of selectBases(env, tf)) {
      const shape = shapeOn(bars, tf, picked, picked.es, secondTop(bars, picked, picked.es, tf));
      const cdt = evaluateCdt(env, tf, shape);
      const ends: (CdtPoint | null)[] = shape.h2 ? impulseEnds(bars, shape.h2, shape.cs).reverse() : [];
      for (const i of ends.length > 0 ? ends : [null]) {
        const candidate = evaluate(env, tf, shape, cdt, i);
        const unmet = misses(candidate);
        if (best === null || unmet < best.unmet) best = { candidate, unmet };
      }
    }
    return { tf, candidate: best ? best.candidate : empty(tf) };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen oder stimmt die Reihenfolge nicht, sind die Prüfungen nicht messbar */
export function check2618Candidate(ctx: FormationContext, t: number, input: F2618PointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const [i1, i2] = [idxOf(input.h1), idxOf(input.n)];
  const idxH2 = input.h2 ? idxOf(input.h2) : undefined;
  const idxI = input.i ? idxOf(input.i) : undefined;
  const ordered = i1 >= 0 && i2 > i1 && idxH2 !== -1 && idxI !== -1 && (idxH2 === undefined || idxH2 > i2) && (idxI === undefined || (idxH2 ?? i2) < idxI);
  if (!ordered) return empty(input.tf);
  const es: ZoneSide = input.h1.price > input.n.price ? 'resistance' : 'support';
  const base: CdtBase = { h1: { idx: i1, price: input.h1.price }, n: { idx: i2, price: input.n.price } };
  const h2: CdtPoint | undefined = input.h2 && idxH2 !== undefined ? { idx: idxH2, price: input.h2.price } : secondTop(bars, base, es, input.tf);
  const shape = shapeOn(bars, input.tf, base, es, h2);
  if (shape.h2 && idxI !== undefined && idxI <= shape.h2.idx) return empty(input.tf);
  const cdt = evaluateCdt(env, input.tf, shape);
  let end: CdtPoint | null = null;
  if (input.i && idxI !== undefined) end = { idx: idxI, price: input.i.price };
  else if (shape.h2) end = impulseEnds(bars, shape.h2, shape.cs).pop() ?? null;
  return evaluate(env, input.tf, shape, cdt, end);
}
