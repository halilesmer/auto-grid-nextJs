/**
 * Libra: Prüfung je Bedingungs-ID und Zeichnungen Z-LIB-01 bis Z-LIB-07.
 * `analyzeLib` sucht je geladener Zeiteinheit und je Seite das Paar P1/P2 und das Ende P3 der Wendebewegung und misst die
 * Berührung der zuerst erreichten Kante (Zone oder Level 0.786); `checkLibCandidate` prüft eigene Punkte.
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (LIB-02, LIB-03, LIB-12 bis LIB-15) heißt ☑ „liegt vor“, bei den Ausschlüssen
 * LIB-13 bis LIB-16 also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“; LIB-09 ist es immer, solange
 * es keine Cypher-Erkennung gibt. LIB-07 gilt nur in M15 (Pflicht); in den anderen Zeiteinheiten steht ☑ als Verstärkung.
 * LIB-11 ist eine Anzeige: der Wert ist das CRV bis TP1 am gewählten Einstieg. Verkauf nach Hochs P1/P2, Kauf nach Tiefs.
 * LIB-15 zählt Schwungpunkte (benachbarte Fraktale einer Seite zählen einmal), LIB-08 baut den inneren AB=CD aus diesen Punkten.
 */
import { analyzeBat } from './batChecks';
import type { FormationContext } from './context';
import { trendDirUpTo } from './f2618';
import { analyzeGar } from './garChecks';
import { outward, wickEnd, zoneGeometry, type ZoneSide } from './frz';
import {
  breakOf,
  chooseEntry,
  closedBeyondP2,
  correctionOf,
  endsOf,
  innerLevels,
  pairsOf,
  shapeOfLib,
  swingsAfter,
  targetEdge,
  targetReachedAt,
  type LibBase,
  type LibPoint,
  type LibShape,
} from './lib';
import { FRZ_PARAMS, LIB_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, envFor, type Env } from './reasons';
import { divergenceOf, tradeSideOf } from './sig';
import type { Anchor, Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Verdict } from './types';
import { anchorAt, fractalDone, ids, unmeasurable } from './xabcd';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'LIB-01': ['required', 'confirmed'],
  'LIB-02': ['required', 'confirmed'],
  'LIB-03': ['required', 'confirmed'],
  'LIB-04': ['required', 'confirmed'],
  'LIB-06': ['bonus', 'confirmed'],
  'LIB-07': ['required', 'secondary'],
  'LIB-08': ['bonus', 'confirmed'],
  'LIB-09': ['bonus', 'confirmed'],
  'LIB-10': ['bonus', 'confirmed'],
  'LIB-11': ['bonus', 'confirmed'],
  'LIB-12': ['required', 'confirmed'],
  'LIB-13': ['exclusion', 'confirmed'],
  'LIB-14': ['exclusion', 'assumption'],
  'LIB-15': ['exclusion', 'assumption'],
  'LIB-16': ['exclusion', 'confirmed'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const LIB_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form, Berührung und die Ausschlüsse */
const FORM_IDS = ['LIB-01', 'LIB-02', 'LIB-03', 'LIB-04', 'LIB-07', 'LIB-12'];
const EXCLUSION_IDS = ['LIB-13', 'LIB-14', 'LIB-15', 'LIB-16'];

export interface LibPointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen: Öffnungszeit der Kerze und Preis */
  p1: Anchor;
  p2: Anchor;
  /** Ohne Angabe: das jüngste Ende der Wendebewegung seit P2 */
  p3?: Anchor;
}

export interface LibAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

/** Ergebnisse von Gartley und Bat für LIB-10; werden nur bei Bedarf gerechnet */
type Harmonics = () => readonly Candidate[];

const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number, kind?: RuleKind): Check => {
  const [defaultKind, status] = RULES[id];
  return { id, kind: kind ?? defaultKind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

/** LIB-03: mindestens eine Kerze P2 … P3 ist volumenstark (SIG-34); ohne messbare Kerze null */
function wideMove(wide: readonly (boolean | null)[], p2: LibPoint, p3: LibPoint): boolean | null {
  const flags = wide.slice(p2.idx + 1, p3.idx + 1);
  if (flags.includes(true)) return true;
  return flags.length === 0 || flags.includes(null) ? null : false;
}

/**
 * LIB-10 (Dreierkette): eine gültige Harmonik der Gegenrichtung hat ihr D auf P3, ihre Ziele (0.382 und 0.618 der Fib A → D) sind bis zum
 * Ende der Messung erreicht, und P2 trägt eine Divergenz zu P1 (SIG-13).
 */
function threeChain(env: Env, tf: ContextTimeframe, s: LibShape, harmonics: Harmonics): boolean {
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const divergence = divergenceOf(trend, s.es, s.p1.idx, s.p2.idx)?.strict === true;
  if (!divergence) return false;
  const time = view.bars[s.p3.idx].time;
  const opposite = tradeSideOf(s.cs);
  return harmonics().some((h) => {
    const { A, D } = h.points;
    if (h.tf !== tf || h.verdict !== 'valid' || h.side !== opposite || !A || !D || D.time !== time) return false;
    return LIB_PARAMS.harmonicTargets.every((level) => {
      // Fib A → D: Level 0 = D, Level 1 = A
      const price = D.price + level * (A.price - D.price);
      for (let k = s.p3.idx + 1; k <= s.windowEnd; k++) if (outward(s.es, wickEnd(view.bars[k], s.es)) >= outward(s.es, price)) return true;
      return false;
    });
  });
}

function evaluate(env: Env, tf: ContextTimeframe, es: ZoneSide, base: LibBase, p3: LibPoint | null, harmonics: Harmonics, trendAt: (idx: number) => 'up' | 'down' | null): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const cs: ZoneSide = es === 'resistance' ? 'support' : 'resistance';
  const { p1, p2 } = base;
  const s: LibShape | null = p3 ? shapeOfLib(bars, es, cs, base, p3) : null;
  const c = s ? s.c : correctionOf(bars, cs, p1, p2);
  const last = bars.length - 1;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number, kind?: RuleKind) => checks.push(mk(id, state, value, kind));

  // Hat P2 noch keine zwei Kerzen rechts, ist es noch kein Fraktal: nicht messbar statt ☐
  const p2Pending = p2.idx + FRZ_PARAMS.neighbors > last;
  const shapeOk = fractalDone(bars, p1, es) && fractalDone(bars, p2, es) && outward(es, p2.price) > outward(es, p1.price) && c !== null;
  add('LIB-01', p2Pending ? U : flag(shapeOk));

  const wanted = es === 'resistance' ? 'down' : 'up';
  const broke = s && c ? breakOf(bars, c, p2, cs, s.p3.idx) : null;
  // Der Trend dreht nach zwei Schlüssen (TRD-17): gemessen mit den Kerzen bis zur Bestätigung von P3 (zwei Nachbarkerzen rechts)
  const confirmed = s ? Math.min(s.p3.idx + FRZ_PARAMS.neighbors, last) : 0;
  add('LIB-02', s ? flag(broke !== null && trendAt(confirmed) === wanted) : U);
  add('LIB-03', s ? tri(wideMove(view.wide, p2, s.p3)) : U);
  add('LIB-04', s ? flag(fractalDone(bars, s.p3, cs)) : U);
  add('LIB-06', flag(LIB_PARAMS.timeframes.includes(tf)));

  const higher = LIB_PARAMS.needsHigherTrend.includes(tf);
  const h4 = env.trends.get('H4')?.dir ?? null;
  // Nur M15 braucht die H4-Richtung; sonst ist die Bedingung nicht anwendbar und steht als ☑ (Verstärkung)
  const higherState: CheckState = h4 === null ? U : flag(h4 === wanted);
  add('LIB-07', higher ? higherState : 'met', undefined, higher ? 'required' : 'bonus');

  const upTo = s ? (s.touch?.idx ?? s.windowEnd) : null;
  const atr = upTo === null ? null : (view.atr[upTo] ?? null);
  const near = atr === null ? null : LIB_PARAMS.nearAtr * atr;
  const swings = s && upTo !== null ? swingsAfter(bars, s.p3, cs, upTo) : [];
  const inner = s ? innerLevels(swings, s.p3, es, cs) : [];
  add('LIB-08', s && near !== null ? flag(inner.some((level) => Math.abs(level - s.level786) <= near)) : U);
  add('LIB-09', U);
  add('LIB-10', s ? flag(threeChain(env, tf, s, harmonics)) : U);

  const target = s ? targetEdge(cs, zoneGeometry(bars, s.p3.idx, cs, tf)) : null;
  const entry = s && target !== null ? chooseEntry(s, target) : null;
  add('LIB-11', entry && entry.crv !== null ? flag(entry.crv >= LIB_PARAMS.minCrv) : U, entry?.crv ?? undefined);
  add('LIB-12', s ? flag(s.touch !== null) : U);

  add('LIB-13', flag(closedBeyondP2(bars, p2, es)));
  add('LIB-14', s ? flag((s.touch ? s.touch.idx : last) - s.p3.idx > LIB_PARAMS.maxBarsToTouch) : U);
  add('LIB-15', s ? flag(swingsAfter(bars, s.p3, cs, s.touch ? s.touch.idx : last).length > LIB_PARAMS.maxFractals) : U);
  add('LIB-16', flag(LIB_PARAMS.belowH1.includes(tf)));

  const drawings = s && target !== null ? drawingsOf(bars, s, target) : [];
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));

  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  const unmet = (id: string) => stateOf(id) === 'unmet';
  // Solange P3 kein fertiges Fraktal ist, kann die Wendebewegung noch weiterlaufen: im Aufbau
  let verdict: Verdict = 'valid';
  if (EXCLUSION_IDS.some((id) => stateOf(id) === 'met') || unmet('LIB-01')) verdict = 'invalid';
  else if (s === null || unmet('LIB-04')) verdict = 'forming';
  else if (['LIB-02', 'LIB-03', 'LIB-07'].some(unmet)) verdict = 'invalid';
  else if (unmet('LIB-12')) verdict = 'forming';

  const points: Candidate['points'] = { P1: anchorAt(bars, p1.idx, p1.price), P2: anchorAt(bars, p2.idx, p2.price) };
  if (c) points.C = anchorAt(bars, c.idx, c.price);
  if (s) {
    points.P3 = anchorAt(bars, s.p3.idx, s.p3.price);
    if (s.touch) points.K = anchorAt(bars, s.touch.idx, s.touch.level);
  }
  return { code: 'LIB', side: tradeSideOf(es), tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(bars: readonly FormationBar[], s: LibShape, target: number): Drawing[] {
  const lastTime = bars[bars.length - 1].time;
  const { p1, p2, p3, zone, first, touch } = s;
  const side = tradeSideOf(s.es);
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const reached = targetReachedAt(bars, s, target);
  const out: Drawing[] = [
    { id: 'Z-LIB-01', tool: 'zone', anchors: [at(p1.idx, zone.bottom), { time: lastTime, price: zone.top }], rules: ids('LIB', [12, 13]), side },
    { id: 'Z-LIB-02', tool: 'fib', anchors: [at(p2.idx, p2.price), at(p3.idx, p3.price)], levels: [LIB_PARAMS.entryLevel], rules: ids('LIB', [8, 12]), side },
    {
      id: 'Z-LIB-03',
      tool: 'fib',
      anchors: [at(p2.idx, p2.price), at(p3.idx, p3.price)],
      levels: [LIB_PARAMS.minCorrection, LIB_PARAMS.entryLevel, -LIB_PARAMS.targetExtension],
      rules: [],
      side,
    },
    { id: 'Z-LIB-04', tool: 'label', anchors: [{ time: lastTime, price: target }], rules: [], side },
    { id: 'Z-LIB-05', tool: 'label', anchors: [{ time: lastTime, price: p2.price }], rules: ids('LIB', [13]), side },
    {
      id: 'Z-LIB-06',
      tool: 'trendline',
      anchors: [at(p3.idx, p3.price), { time: touch ? bars[touch.idx].time : lastTime, price: first }, { time: lastTime, price: target }],
      rules: ids('LIB', [12]),
      side,
    },
  ];
  if (reached !== null) out.push({ id: 'Z-LIB-07', tool: 'marker', anchors: [at(reached, target)], rules: [], side });
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('LIB', tf, LIB_CHECK_IDS, RULES);

const misses = (cand: Candidate): number =>
  cand.checks.filter((k) => (FORM_IDS.includes(k.id) && k.state === 'unmet') || (EXCLUSION_IDS.includes(k.id) && k.state === 'met')).length;

/** Gartley und Bat aller geladenen Zeiteinheiten; eine Rechnung je Aufruf von `analyzeLib` */
const harmonicsOf = (ctx: FormationContext, t: number): Harmonics => {
  let cache: readonly Candidate[] | null = null;
  return () => (cache ??= [...analyzeGar(ctx, t), ...analyzeBat(ctx, t)].map((a) => a.candidate));
};

/** Sucht je geladener Zeiteinheit (hoch → tief) und Seite Paar P1/P2 und P3; es gilt der Kandidat mit den wenigsten verletzten Form-Bedingungen, bei Gleichstand der jüngste */
export function analyzeLib(ctx: FormationContext, t: number): LibAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  const harmonics = harmonicsOf(ctx, t);
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const bars = env.views.get(tf)!.bars;
    const memo = new Map<number, 'up' | 'down' | null>();
    const trendAt = (idx: number) => {
      if (!memo.has(idx)) memo.set(idx, trendDirUpTo(env, tf, idx));
      return memo.get(idx)!;
    };
    let best: { candidate: Candidate; unmet: number; recent: number } | null = null;
    for (const es of ['resistance', 'support'] as const) {
      const cs: ZoneSide = es === 'resistance' ? 'support' : 'resistance';
      for (const pair of pairsOf(bars, es)) {
        const ends: (LibPoint | null)[] = endsOf(bars, pair.p2, cs, (p) => fractalDone(bars, p, cs)).reverse();
        for (const p3 of ends.length > 0 ? ends : [null]) {
          const candidate = evaluate(env, tf, es, pair, p3, harmonics, trendAt);
          const unmet = misses(candidate);
          const recent = p3 ? p3.idx : pair.p2.idx;
          if (best === null || unmet < best.unmet || (unmet === best.unmet && recent > best.recent)) best = { candidate, unmet, recent };
        }
      }
    }
    return { tf, candidate: best ? best.candidate : empty(tf) };
  });
}

/**
 * Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen oder stimmt die Reihenfolge nicht, sind die Prüfungen
 * nicht messbar. `harmonics` ersetzt die gemessenen Ergebnisse von Gartley und Bat (LIB-10).
 */
export function checkLibCandidate(ctx: FormationContext, t: number, input: LibPointsInput, harmonics?: readonly Candidate[]): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const [i1, i2] = [idxOf(input.p1), idxOf(input.p2)];
  const i3 = input.p3 ? idxOf(input.p3) : undefined;
  if (!(i1 >= 0 && i2 > i1 && i3 !== -1 && (i3 === undefined || i3 > i2))) return empty(input.tf);
  const es: ZoneSide = (input.p3 ? input.p3.price < input.p2.price : input.p2.price > input.p1.price) ? 'resistance' : 'support';
  const cs: ZoneSide = es === 'resistance' ? 'support' : 'resistance';
  const pair: LibBase = { p1: { idx: i1, price: input.p1.price }, p2: { idx: i2, price: input.p2.price } };
  const p3: LibPoint | null = input.p3 && i3 !== undefined ? { idx: i3, price: input.p3.price } : (endsOf(bars, pair.p2, cs, (p) => fractalDone(bars, p, cs)).pop() ?? null);
  const trendAt = (idx: number) => trendDirUpTo(env, input.tf, idx);
  return evaluate(env, input.tf, es, pair, p3, harmonics ? () => harmonics : harmonicsOf(ctx, t), trendAt);
}
