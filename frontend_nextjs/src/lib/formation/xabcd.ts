/**
 * XABCD-Kern für Gartley und Bat: Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * X, A, B und C sind vier aufeinanderfolgende Wendepunkte des Trendzugs (trd.ts), D ist der äußerste Docht seit C.
 * Das AB=CD im Inneren kommt aus abcd.ts (`shapeOf` mit A, B, C), ohne dessen Verhalten zu ändern.
 * Preise laufen über `outward(Seite, Preis)`; eine Kauf-Formation (X, B, D sind Tiefs) und ihr Spiegelbild sind derselbe Code.
 * Level der Fib X → A und der Fib A → B stehen in der Notation Start = 1, Ende = 0 (Ausdehnungen negativ).
 */
import { shapeOf, gapToRect, type AbcdShape } from './abcd';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import type { FormationContext } from './context';
import { closesBeyond, outward, probeFractal, wickEnd, type Rect, type ZoneSide } from './frz';
import { HARMONIC_PARAMS, FRZ_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, dirSide, envFor, neighborTf, type Env } from './reasons';
import { engulfAt, engulfZones, rsiExtreme, trailingRun, divergenceOf, zoneSideOf } from './sig';
import type { Pivot } from './trd';
import type { Anchor, Candidate, Check, CheckState, FormationBar, Side } from './types';

type Bars = readonly FormationBar[];

export interface XPoint {
  idx: number;
  price: number;
}

/** X, A, B, C vor der Messung: Kerzenindex und Preis */
export interface XabcdBase {
  x: XPoint;
  a: XPoint;
  b: XPoint;
  c: XPoint;
}

export interface XabcdShape extends XabcdBase {
  /** Seite von X, B und D (Tief = Unterstützung beim Kauf): dort liegt D */
  es: ZoneSide;
  /** Seite von A und C */
  cs: ZoneSide;
  /** Seite des Trades am D: Richtung von X → A (aufwärts → Kauf) */
  side: Side;
  /** Länge X → A */
  len: number;
  /** äußerster Docht in Richtung X seit C; null ohne Kerze nach C (oder der Eingabe-Punkt) */
  d: XPoint | null;
  /** AB=CD im Inneren (A, B, C) mit Level 1 und Korrekturtiefe von C */
  abcd: AbcdShape;
}

const N = FRZ_PARAMS.neighbors;

/** Formen und Verhältnisse; `d` überschreibt den gemessenen äußersten Docht (eigene Punkte) */
export function shapeOfX(bars: Bars, p: XabcdBase, d?: XPoint): XabcdShape {
  const abcd = shapeOf(bars, { a: p.a, b: p.b, c: p.c }, d);
  return {
    ...p,
    es: abcd.es,
    cs: abcd.cs,
    side: abcd.side,
    len: Math.abs(p.a.price - p.x.price),
    d: abcd.d,
    abcd,
  };
}

/**
 * Kandidaten: C ist einer der letzten `lookbackPivots` Wendepunkte, B, A und X sind die drei davor; jüngstes C zuerst.
 * Welcher Kandidat gilt, entscheiden die Formbedingungen in `analyzeGar` bzw. `analyzeBat`.
 */
export function selectBases(pivots: readonly Pivot[]): XabcdBase[] {
  const pt = (p: Pivot): XPoint => ({ idx: p.idx, price: p.price });
  const out: XabcdBase[] = [];
  for (let j = pivots.length - 1; j >= Math.max(3, pivots.length - HARMONIC_PARAMS.lookbackPivots); j--) {
    out.push({ x: pt(pivots[j - 3]), a: pt(pivots[j - 2]), b: pt(pivots[j - 1]), c: pt(pivots[j]) });
  }
  return out;
}

/** Ein Pip des Symbols (Annahme: Paare 0.0001, JPY-Paare 0.01, Gold 0.1, Silber 0.01, übrige Symbole 0.01) */
export function pipOf(symbol: string): number {
  const p = HARMONIC_PARAMS.pip;
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU')) return p.gold;
  if (s.startsWith('XAG')) return p.silver;
  if (!/^[A-Z]{6}/.test(s)) return p.other;
  return s.includes('JPY') ? p.jpy : p.default;
}

/** Anteil der Strecke X → A, den ein Preis von A aus Richtung X zurückläuft (A = 0, X = 1); null bei Länge 0 */
export function retraceXA(s: XabcdShape, price: number): number | null {
  return s.len === 0 ? null : (outward(s.cs, s.a.price) - outward(s.cs, price)) / s.len;
}

/** Preis des Levels der Fib X → A (A = 0, X = 1) */
export const levelXA = (s: XabcdShape, level: number): number => s.a.price + level * (s.x.price - s.a.price);

/** Preis des Levels der Fib A → B (B = 0, A = 1; −0.272 liegt jenseits von B) */
export const levelAB = (s: XabcdShape, level: number): number => s.b.price + level * (s.a.price - s.b.price);

/** Länge A → B */
export const lenAB = (s: XabcdShape): number => Math.abs(s.a.price - s.b.price);

/** Berührung eines Pflicht-Levels: der Anteil `value` erreicht `level`, bis zur Toleranz (`touchPips` Pips) davor gilt noch als Berührung */
export const reaches = (value: number | null, level: number, len: number, pip: number): boolean =>
  value !== null && len > 0 && value >= level - (HARMONIC_PARAMS.touchPips * pip) / len;

/** Reihenfolge X < A < B < C (< D) und eine Strecke X → A ungleich 0 */
export function ordered(s: XabcdShape): boolean {
  const base = s.x.idx < s.a.idx && s.a.idx < s.b.idx && s.b.idx < s.c.idx && s.len > 0;
  return base && (s.d === null || s.d.idx > s.c.idx);
}

/** Die Punkte wechseln die Seite: X und B liegen auf einer Seite von A, C auf der anderen Seite von B (Zickzack in Trade-Richtung) */
export function alternates(s: XabcdShape): boolean {
  const sx = Math.sign(s.x.price - s.a.price);
  const sb = Math.sign(s.b.price - s.a.price);
  return sx !== 0 && sx === sb && Math.sign(s.c.price - s.b.price) === -sb;
}

/** Fraktal der Seite `side` an Kerze `idx` ist fertig (2 + 2 Nachbarn, keiner schließt jenseits) und der Preis ist die Dochtspitze */
export function fractalDone(bars: Bars, p: XPoint, side: ZoneSide): boolean {
  const probe = probeFractal(bars, p.idx, side);
  return probe.leftBars === N && probe.rightBars === N && probe.beyond === 0 && p.price === wickEnd(bars[p.idx], side);
}

/** Zwischen den Kerzen von X und A liegt kein Docht jenseits von X oder A: beide sind die Extreme derselben Bewegung */
export function oneMove(bars: Bars, s: XabcdShape): boolean {
  for (let k = s.x.idx; k <= s.a.idx; k++) {
    if (outward(s.es, wickEnd(bars[k], s.es)) > outward(s.es, s.x.price)) return false;
    if (outward(s.cs, wickEnd(bars[k], s.cs)) > outward(s.cs, s.a.price)) return false;
  }
  return true;
}

/** Abstand zweier Preise in Vielfachen der ATR; null ohne ATR */
export const atrDistance = (a: number, b: number, atr: number | null): number | null => (atr === null || atr <= 0 ? null : Math.abs(a - b) / atr);

/** Schluss jenseits von X in der H4-Reihe (ersatzweise der Formations-Zeiteinheit) nach der Kerze von X */
export function closedBeyondX(env: Env, tf: ContextTimeframe, s: XabcdShape): boolean {
  const close = HARMONIC_PARAMS.closeTimeframe as ContextTimeframe;
  const view = env.views.get(env.views.has(close) ? close : tf)!;
  const xTime = env.views.get(tf)!.bars[s.x.idx].time;
  const dur = TIMEFRAME_SEC[view.tf];
  // die Kerze, die X enthält, zählt mit: sie schließt nach X
  return view.bars.some((b) => b.time + dur > xTime && closesBeyond(b, s.x.price, s.es));
}

/** Zonen (Fraktal- und Engulf-Zonen) nahe `price`, die nicht erst das D selbst bildet */
export function zonesNear(env: Env, tf: ContextTimeframe, s: XabcdShape, price: number, near: number): Rect[] {
  const view = env.views.get(tf)!;
  const tradeZone = zoneSideOf(s.side);
  const dTime = s.d ? view.bars[s.d.idx].time : Infinity;
  const out: Rect[] = [];
  for (const z of [...env.frz.zones, ...env.frz.reversed]) {
    const formedByD = z.fractalTimes.every((ft) => ft >= dTime);
    if (z.side === tradeZone && !formedByD && gapToRect(z.rect, price) <= near) out.push(z.rect);
  }
  for (const z of engulfZones(view.bars, view.wide)) {
    const formedByD = s.d !== null && z.idx >= s.d.idx;
    if (z.holds && z.side === s.side && !formedByD && gapToRect(z.rect, price) <= near) out.push(z.rect);
  }
  return out;
}

/** Zeit und Höhe genügen (Dauer X → D bzw. bis zur letzten Kerze, Höhe X → A als Vielfaches der ATR); null ohne ATR */
export function enoughSpace(s: XabcdShape, lastIdx: number, atr: number | null): boolean | null {
  if (atr === null || atr <= 0) return null;
  const to = s.d ? s.d.idx : lastIdx;
  return to - s.x.idx >= HARMONIC_PARAMS.space.bars && s.len >= HARMONIC_PARAMS.space.atr * atr;
}

/** Mindestens `share` der Kerzen von X bis A sind volumenstark (BAT-02); null, solange eine Kerze nicht messbar ist */
export function wideShareOfMove(wide: readonly (boolean | null)[], s: XabcdShape): boolean | null {
  const flags = wide.slice(s.x.idx + 1, s.a.idx + 1);
  if (flags.length === 0 || flags.some((f) => f === null)) return null;
  return flags.filter(Boolean).length / flags.length >= HARMONIC_PARAMS.wideShare;
}

/**
 * Höhere Zeiteinheit gegen den Trade (GAR-19): Divergenz in D1 und W1 an den Extremen und RSI(7) in H4 lange im Extrem.
 * W1 gehört nicht zum Kontext (FRZ-27): der Teil ist nicht messbar. Ein ☐ eines Teils macht die Bedingung ☐.
 */
export function higherAgainst(env: Env, side: Side): CheckState {
  const against: Side = side === 'buy' ? 'sell' : 'buy';
  const d1 = env.trends.get('D1');
  const div = d1 ? divergenceOf(d1, zoneSideOf(against)) : null;
  const divD1 = !div || div.a.wave === null || div.b.wave === null ? null : div.tie;
  const h4 = env.views.get('H4');
  const rsiRun = h4 ? trailingRun(h4.rsi.map((v) => rsiExtreme(v, against))) >= HARMONIC_PARAMS.longRun : null;
  const parts: (boolean | null)[] = [divD1, null, rsiRun];
  if (parts.includes(false)) return 'unmet';
  return parts.includes(null) ? 'unmeasurable' : 'met';
}

/** Anker an Kerze `idx` */
export const anchorAt = (bars: Bars, idx: number, price: number): Anchor => ({ time: bars[idx].time, price });

export const ids = (code: string, list: number[]): string[] => list.map((n) => `${code}-${String(n).padStart(2, '0')}`);

/** Eigene Punkte einer Prüfung: Dochtspitzen mit Öffnungszeit der Kerze */
export interface XabcdInput {
  tf: ContextTimeframe;
  x: Anchor;
  a: Anchor;
  b: Anchor;
  c: Anchor;
  /** Ohne Angabe: der äußerste Docht seit C */
  d?: Anchor;
}

export interface XabcdAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

export type Evaluate = (env: Env, tf: ContextTimeframe, s: XabcdShape, pip: number) => Candidate;

/** Alles „nicht messbar“, im Aufbau */
export function unmeasurable(code: string, tf: ContextTimeframe, checkIds: readonly string[], rules: Record<string, [Check['kind'], Check['status']]>): Candidate {
  const checks: Check[] = checkIds.map((id) => ({ id, kind: rules[id][0], status: rules[id][1], state: 'unmeasurable', drawings: [] }));
  return { code, side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' };
}

/**
 * Sucht je geladener Zeiteinheit (hoch → tief) die Punkte X, A, B, C: unter den Kandidaten gilt der mit den wenigsten
 * verletzten Form-Bedingungen (`misses`), bei Gleichstand der jüngste.
 */
export function analyzeXabcd(
  ctx: FormationContext,
  t: number,
  evaluate: Evaluate,
  misses: (c: Candidate) => number,
  empty: (tf: ContextTimeframe) => Candidate,
): XabcdAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  const pip = pipOf(ctx.symbol);
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const bars = env.views.get(tf)!.bars;
    let best: { candidate: Candidate; unmet: number } | null = null;
    for (const picked of selectBases(env.trends.get(tf)!.pivots)) {
      const candidate = evaluate(env, tf, shapeOfX(bars, picked), pip);
      const unmet = misses(candidate);
      if (best === null || unmet < best.unmet) best = { candidate, unmet };
    }
    return { tf, candidate: best ? best.candidate : empty(tf) };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen oder stimmt die Reihenfolge nicht, sind die Prüfungen nicht messbar */
export function checkXabcd(ctx: FormationContext, t: number, input: XabcdInput, evaluate: Evaluate, empty: (tf: ContextTimeframe) => Candidate): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const at = (a: Anchor): XPoint => ({ idx: idxOf(a), price: a.price });
  const base: XabcdBase = { x: at(input.x), a: at(input.a), b: at(input.b), c: at(input.c) };
  const d = input.d ? at(input.d) : undefined;
  if (Object.values(base).some((p) => p.idx < 0) || (d && d.idx < 0)) return empty(input.tf);
  const s = shapeOfX(bars, base, d);
  return ordered(s) ? evaluate(env, input.tf, s, pipOf(ctx.symbol)) : empty(input.tf);
}

/** Verlauf eines Kandidaten für die Zeichnungen: X, A, B, C und, wenn D fertig ist, D */
export const zigOf = (bars: Bars, s: XabcdShape, withD: boolean): Anchor[] => {
  const out = [s.x, s.a, s.b, s.c].map((p) => anchorAt(bars, p.idx, p.price));
  if (withD && s.d) out.push(anchorAt(bars, s.d.idx, s.d.price));
  return out;
};

/** Eine Kerze nach C schließt jenseits von B (ABCD-03): erst dann wird D gesucht; zählt bis zur Kerze von D, ohne D bis zur letzten Kerze */
export function closedBeyondB(bars: Bars, s: XabcdShape): boolean {
  const to = s.d ? s.d.idx : bars.length - 1;
  for (let k = s.c.idx + 1; k <= to; k++) if (closesBeyond(bars[k], s.b.price, s.es)) return true;
  return false;
}

/** Trend der nächsthöheren geladenen Zeiteinheit in Trade-Richtung; ohne höhere Zeiteinheit nicht messbar */
export function higherWith(env: Env, tf: ContextTimeframe, side: Side): CheckState {
  const higher = neighborTf(env, tf, -1);
  const dir = higher ? env.trends.get(higher)?.dir : null;
  if (!dir) return 'unmeasurable';
  return dirSide(dir) === side ? 'met' : 'unmet';
}

/** Umkehrkerze in Trade-Richtung (Engulf, SIG-23 bis SIG-26) in der nächsttieferen geladenen Zeiteinheit ab der Kerze von D; ohne D oder tiefere Zeiteinheit nicht messbar */
export function lowerReversal(env: Env, tf: ContextTimeframe, s: XabcdShape): CheckState {
  const lower = neighborTf(env, tf, 1);
  const view = lower ? env.views.get(lower) : undefined;
  if (!s.d || !view) return 'unmeasurable';
  const from = env.views.get(tf)!.bars[s.d.idx].time;
  // die tiefere Zeiteinheit reicht nicht bis zur Kerze von D zurück: nichts zu vergleichen
  if (view.bars.length === 0 || view.bars[0].time > from) return 'unmeasurable';
  for (let k = 0; k < view.bars.length; k++) {
    if (view.bars[k].time >= from && engulfAt(view.bars, view.wide, k, s.side) !== null) return 'met';
  }
  return 'unmet';
}
