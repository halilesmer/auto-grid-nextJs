/**
 * Fibonacci (FIB): Messung als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * Notation wie im Regelwerk: Start = 1, Ende = 0, Ausdehnungen negativ (FIB-08). Die Impulse kommen aus dem
 * Trendzug (trd.ts); es fließen nur Kerzen der übergebenen Liste ein, also nur geschlossene Kerzen bis t.
 */
import { closesBeyond, outward, wickEnd, type Rect } from './frz';
import { FIB_PARAMS } from './params';
import { counterSide, extremeSide, type TrendDir, type TrendModel } from './trd';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

export interface FibPoint {
  idx: number;
  price: number;
}

/** Messung über einen Impuls: Start (Level 1) und Ende (Level 0) */
export interface FibLeg {
  start: FibPoint;
  end: FibPoint;
  dir: TrendDir;
}

export const legDirOf = (start: number, end: number): TrendDir => (end > start ? 'up' : 'down');

/** Preis(L) = Ende + L × (Start − Ende) (FIB-08) */
export const levelPrice = (leg: FibLeg, level: number): number => leg.end.price + level * (leg.start.price - leg.end.price);

export const legLength = (leg: FibLeg): number => Math.abs(leg.end.price - leg.start.price);

/** Korrekturzone (FIB-11): Preisband von 0.382 bis 0.618 */
export function bandOf(leg: FibLeg): Rect {
  const a = levelPrice(leg, FIB_PARAMS.retrace[0]);
  const b = levelPrice(leg, FIB_PARAMS.retrace[2]);
  return { top: Math.max(a, b), bottom: Math.min(a, b) };
}

/** Tiefster (bzw. höchster) Docht der Gegenseite in einem Kerzenbereich; null bei leerem Bereich */
function deepest(bars: Bars, leg: FibLeg, from: number, to: number): FibPoint | null {
  const cs = counterSide(leg.dir);
  let best: FibPoint | null = null;
  for (let k = from; k <= to; k++) {
    const price = wickEnd(bars[k], cs);
    if (best === null || outward(cs, price) > outward(cs, best.price)) best = { idx: k, price };
  }
  return best;
}

/** Anteil des Impulses, den die Gegenbewegung bis `price` zurückläuft (0, wenn der Preis jenseits des Endes liegt) */
function depthOf(leg: FibLeg, price: number): number {
  const es = extremeSide(leg.dir);
  const len = legLength(leg);
  if (len === 0) return 0;
  return Math.max(0, (outward(es, leg.end.price) - outward(es, price)) / len);
}

export interface LegState {
  leg: FibLeg;
  /** höchster Docht nach dem Ende, wenn er jenseits des Endes liegt (FIB-06): die Messung läuft weiter */
  breakout: FibPoint | null;
  /** vorläufige Messung bis zum laufenden Extrem (FIB-05); null, wenn kein Docht jenseits des Endes liegt */
  running: FibLeg | null;
  /** tiefster Docht der Korrektur nach dem Ende (bis zum Ausbruch); null ohne Kerzen danach */
  corr: FibPoint | null;
  depth: number;
  /** FIB-15: zwei Schlüsse in Folge jenseits des Starts */
  ended: boolean;
}

/** Zustand einer Messung zum Ende der Kerzenliste */
export function legState(bars: Bars, leg: FibLeg): LegState {
  const es = extremeSide(leg.dir);
  const cs = counterSide(leg.dir);
  let breakout: FibPoint | null = null;
  for (let k = leg.end.idx + 1; k < bars.length; k++) {
    const price = wickEnd(bars[k], es);
    if (outward(es, price) > outward(es, breakout?.price ?? leg.end.price)) breakout = { idx: k, price };
  }
  const corrEnd = breakout ? breakout.idx - 1 : bars.length - 1;
  const corr = deepest(bars, leg, leg.end.idx + 1, corrEnd);
  const depth = corr ? depthOf(leg, corr.price) : 0;
  let running: FibLeg | null = null;
  if (breakout) {
    // Nach einer Korrektur ab 0.382 beginnt der neue Impuls am Korrekturdocht, sonst läuft der alte weiter (FIB-07)
    const start = corr && depth >= FIB_PARAMS.retrace[0] ? corr : leg.start;
    running = { start, end: breakout, dir: leg.dir };
  }
  let run = 0;
  let ended = false;
  for (let k = leg.end.idx + 1; k < bars.length; k++) {
    run = closesBeyond(bars[k], leg.start.price, cs) ? run + 1 : 0;
    if (run >= FIB_PARAMS.endCloses) ended = true;
  }
  return { leg, breakout, running, corr, depth, ended };
}

export interface FibModel {
  tf: TrendModel['tf'];
  bars: Bars;
  dir: TrendDir | null;
  /** fertige Impulse des laufenden Trends, alt → neu; der letzte ist der aktuelle */
  legs: FibLeg[];
  /** Zustand des aktuellen Impulses; null ohne Impuls */
  state: LegState | null;
}

/**
 * Impulse des laufenden Trends. Folgt auf ein Ende ein weiterer Extrempunkt jenseits davon, zählt die Gegenbewegung
 * dazwischen nur bei Tiefe ≥ 0.382 als Korrektur (neuer Impuls ab ihrem tiefsten Docht), sonst rückt das Ende nach (FIB-07).
 */
export function buildFib(trend: TrendModel): FibModel {
  const { bars, dir } = trend;
  const model: FibModel = { tf: trend.tf, bars, dir, legs: [], state: null };
  if (!dir) return model;
  const es = extremeSide(dir);
  const cs = counterSide(dir);
  let start: FibPoint | null = null;
  let end: FibPoint | null = null;
  const legs: FibLeg[] = [];
  // Der Impuls, der den Wechsel ausgelöst hat, beginnt am Punkt vor dem Ursprung des Trends
  for (const p of trend.pivots.slice(Math.max(0, trend.originPos - 1))) {
    const point = { idx: p.idx, price: p.price };
    if (p.side === cs) {
      if (!start) start = point;
      continue;
    }
    if (!start) continue;
    if (!end) {
      end = point;
      continue;
    }
    if (outward(es, p.price) <= outward(es, end.price)) continue;
    const probe: FibLeg = { start, end, dir };
    const low = deepest(bars, probe, end.idx + 1, p.idx);
    if (low && depthOf(probe, low.price) >= FIB_PARAMS.retrace[0]) {
      legs.push(probe);
      start = low;
    }
    end = point;
  }
  if (start && end) legs.push({ start, end, dir });
  model.legs = legs;
  const last = legs[legs.length - 1];
  if (last) model.state = legState(bars, last);
  return model;
}

/** Ausdehnung jenseits des Endes als Anteil des Impulses (−0.272 ↔ 0.272) */
export function extensionReach(leg: FibLeg, price: number): number {
  const es = extremeSide(leg.dir);
  const len = legLength(leg);
  if (len === 0) return 0;
  return Math.max(0, (outward(es, price) - outward(es, leg.end.price)) / len);
}

export interface Breakout {
  /** Impuls, an dem die Ausdehnung gemessen wird (der fertige, nicht der vorläufige) */
  ref: FibLeg;
  /** äußerster Docht des Ausbruchs */
  extreme: FibPoint;
  reach: number;
  /** mindestens ein Schluss jenseits des Endes (FIB-19, FIB-21) */
  closedBeyond: boolean;
}

/**
 * Ausbruch über das Ende des fertigen Impulses: laufend (Docht jenseits, kein Fraktal) oder abgeschlossen
 * (der nächste Impuls beginnt an der Korrektur und endet jenseits des alten Endes).
 */
export function breakoutOf(model: FibModel): Breakout | null {
  const st = model.state;
  if (!st) return null;
  const { bars } = model;
  const make = (ref: FibLeg, extreme: FibPoint): Breakout => {
    const es = extremeSide(ref.dir);
    let closedBeyond = false;
    for (let k = ref.end.idx + 1; k < bars.length; k++) if (closesBeyond(bars[k], ref.end.price, es)) closedBeyond = true;
    return { ref, extreme, reach: extensionReach(ref, extreme.price), closedBeyond };
  };
  if (st.breakout) return make(st.leg, st.breakout);
  const prev = model.legs.length >= 2 ? model.legs[model.legs.length - 2] : undefined;
  if (prev) return make(prev, st.leg.end);
  return null;
}

/** Zustand, an dem die Mindestkorrektur (FIB-12) gemessen wird: bei einem Ausbruch die Korrektur vor dem Ausbruch */
export function refState(model: FibModel): LegState | null {
  const b = breakoutOf(model);
  return b ? legState(model.bars, b.ref) : model.state;
}
