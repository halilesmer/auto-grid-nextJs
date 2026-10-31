/**
 * Trend (TRD): Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * `buildTrend` läuft einmal von links nach rechts über die Kerzen. Bei Kerze k fließen nur Kerzen bis k ein
 * (ein Punkt entscheidet sich an der Kerze, mit der sein Fraktal fertig wird, Wechsel brauchen geschlossene Kerzen),
 * so gibt es keinen Blick in die Zukunft.
 */
import { closesBeyond, fractalIndices, outward, wickEnd, zoneGeometry, type ZoneSide } from './frz';
import { wilderAtr } from './indicators';
import { FRZ_PARAMS, TRD_PARAMS, type ContextTimeframe, type TrendOptions } from './params';
import { zugRule, type ZugEdit, type ZugPoint } from './trdZug';
import type { FormationBar } from './types';

export type TrendDir = 'up' | 'down';
type Bars = readonly FormationBar[];

const N = FRZ_PARAMS.neighbors;

/** Richtung eines Zugs, der an einem Punkt dieser Seite endet (Hoch → aufwärts) */
export const legDir = (side: ZoneSide): TrendDir => (side === 'resistance' ? 'up' : 'down');
/** Seite des Extrems in Trendrichtung (Aufwärtstrend: Hochs) */
export const extremeSide = (dir: TrendDir): ZoneSide => (dir === 'up' ? 'resistance' : 'support');
export const counterSide = (dir: TrendDir): ZoneSide => (dir === 'up' ? 'support' : 'resistance');

/** Fertiges Fraktal als Kandidat für einen Wendepunkt (TRD-03) */
export interface TrdCand {
  idx: number;
  /** Index der Kerze, mit der das Fraktal fertig wird */
  doneAt: number;
  side: ZoneSide;
  price: number;
  /** gezeichnet: Teil des Trendzugs */
  drawn: boolean;
  /** Korrektur gegen den Trend zum Zeitpunkt des Kandidaten; null, solange es keinen Trend gab */
  isCorrection: boolean | null;
  /** Länge / Maß des Zugs (TRD-07, TRD-09); null, wenn es kein Maß gibt */
  ratio: number | null;
  /** Punkt wurde gezeichnet */
  accepted: boolean;
}

/** Gezeichneter Wendepunkt des Trendzugs */
export interface Pivot {
  idx: number;
  doneAt: number;
  side: ZoneSide;
  price: number;
  kind: 'start' | 'impulse' | 'correction';
  /** Länge des Zugs vom vorigen Punkt */
  len: number;
}

export interface TrendChange {
  /** Kerze, ab der der Wechsel gilt (zweiter Schluss) */
  k: number;
  to: TrendDir;
  /** Preis der Bezugszone (TRD-15, TRD-16) */
  refPrice: number;
  /** Index des Punkts der Bezugszone im Trendzug zum Zeitpunkt des Wechsels */
  refIdx: number;
  /** Kerzenindex dieses Punkts zum Zeitpunkt des Wechsels (der Punkt selbst kann später durch ein weiteres Extrem ersetzt werden) */
  refBar: number;
}

export interface TrendModel {
  tf: ContextTimeframe;
  bars: Bars;
  wave: (number | null)[];
  cands: TrdCand[];
  pivots: Pivot[];
  dir: TrendDir | null;
  /** Position im Trendzug, an der der laufende Trend beginnt */
  originPos: number;
  changes: TrendChange[];
  /** Schluss jenseits der Bezugszone ohne Bestätigung durch die zweite Kerze (TRD-17) */
  unconfirmedBreaks: number;
  /** laufende Reihe Schlüsse jenseits der Bezugszone am Ende der Kerzen */
  pendingRun: number;
  /** Maß der jüngsten Korrektur (TRD-09); null ohne Korrektur oder Maß */
  refCorrection: number | null;
  /** Kerzen mit Schluss jenseits des vorigen Extrems in Trendrichtung (TRD-12, TRD-30), Kerzenindizes */
  impulseBars: number[];
}

export const lastOf = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

/** Fraktale je Kerze, mit der sie fertig werden (TRD-03) */
export function fractalsByDone(bars: Bars): Map<number, { idx: number; side: ZoneSide }[]> {
  const byDone = new Map<number, { idx: number; side: ZoneSide }[]>();
  for (const side of ['resistance', 'support'] as const) {
    for (const idx of fractalIndices(bars, side)) {
      const list = byDone.get(idx + N) ?? [];
      list.push({ idx, side });
      byDone.set(idx + N, list);
    }
  }
  return byDone;
}

export const emptyTrend = (tf: ContextTimeframe, bars: Bars, wave: (number | null)[]): TrendModel => ({
  tf,
  bars,
  wave,
  cands: [],
  pivots: [],
  dir: null,
  originPos: 0,
  changes: [],
  unconfirmedBreaks: 0,
  pendingRun: 0,
  refCorrection: null,
  impulseBars: [],
});

/** Neuer Impuls: erster Schluss jenseits des vorigen Extrems in Trendrichtung (TRD-12) */
export function noteImpulse(m: TrendModel, k: number): void {
  if (!m.dir) return;
  const ext = [...m.pivots].reverse().find((p) => p.side === extremeSide(m.dir!));
  if (ext && closesBeyond(m.bars[k], ext.price, extremeSide(m.dir))) m.impulseBars.push(k);
}

/** Bezugspunkt des Wechsels (TRD-15, TRD-16): der Gegenpunkt, an dem der laufende Impuls begann */
export function changeRef(m: TrendModel): Pivot | undefined {
  if (!m.dir) return undefined;
  const side = extremeSide(m.dir);
  const pos = m.pivots.map((p) => p.side).lastIndexOf(side);
  return pos > 0 ? m.pivots[pos - 1] : undefined;
}

function setDrawn(m: TrendModel, p: ZugPoint, drawn: boolean): void {
  const cand = m.cands.find((c) => c.idx === p.idx && c.side === p.side);
  if (cand) cand.drawn = drawn;
}

function appendPivot(m: TrendModel, f: ZugPoint): void {
  const prev = lastOf(m.pivots);
  if (prev && !m.dir) m.dir = legDir(f.side);
  let kind: Pivot['kind'] = 'start';
  if (prev) kind = legDir(f.side) === m.dir ? 'impulse' : 'correction';
  m.pivots.push({ ...f, kind, len: prev ? Math.abs(f.price - prev.price) : 0 });
  setDrawn(m, f, true);
}

function applyEdit(m: TrendModel, edit: ZugEdit): void {
  for (const gone of m.pivots.splice(m.pivots.length - edit.cut)) setDrawn(m, gone, false);
  for (const f of edit.add) appendPivot(m, f);
  // die Regel `filter` kann den Punkt streichen, an dem der laufende Trend beginnt
  m.originPos = Math.min(m.originPos, m.pivots.length - 1);
}

export function buildTrend(
  tf: ContextTimeframe,
  bars: Bars,
  wave: (number | null)[],
  options: Partial<TrendOptions> = {},
): TrendModel {
  const opt: TrendOptions = { ...TRD_PARAMS.trend, changeCloses: TRD_PARAMS.changeCloses, ...options };
  const byDone = fractalsByDone(bars);
  const atr = wilderAtr(bars, opt.atrPeriod);
  const minLeg = (idx: number) => opt.minSize * atr[idx];
  const nextEdit = zugRule(opt, bars, minLeg);

  const m = emptyTrend(tf, bars, wave);

  for (let k = 0; k < bars.length; k++) {
    // 1. Trendwechsel: Schlüsse jenseits des Gegenpunkts, an dem der Impuls begann (TRD-15 bis TRD-17)
    if (m.dir) {
      const ref = changeRef(m);
      if (ref) {
        if (closesBeyond(bars[k], ref.price, ref.side)) {
          m.pendingRun++;
          if (m.pendingRun >= opt.changeCloses) {
            const to: TrendDir = m.dir === 'up' ? 'down' : 'up';
            const refIdx = m.pivots.indexOf(ref);
            m.changes.push({ k, to, refPrice: ref.price, refIdx, refBar: ref.idx });
            m.dir = to;
            m.originPos = refIdx;
            m.pendingRun = 0;
            // die Züge seit der Bezugszone gehören zum neuen Trend: Impuls und Korrektur tauschen
            for (const p of m.pivots.slice(refIdx)) p.kind = legDir(p.side) === to ? 'impulse' : 'correction';
          }
        } else if (m.pendingRun > 0) {
          m.unconfirmedBreaks++;
          m.pendingRun = 0;
        }
      }
    }

    // 2. Fraktale, die mit Kerze k fertig werden (TRD-03)
    let batch = byDone.get(k) ?? [];
    // Außenkerze: Hoch- und Tief-Fraktal in einer Kerze; höchstens eine Seite wird ein Wendepunkt, zuerst die, die zum letzten Punkt wechselt
    const outerBar = batch.length === 2 && batch[0].idx === batch[1].idx;
    if (outerBar) {
      const prev = lastOf(m.pivots);
      batch = prev ? [...batch].sort((a) => (a.side === prev.side ? 1 : -1)) : batch.slice(0, 1);
    }
    for (const c of batch) {
      const price = wickEnd(bars[c.idx], c.side);
      const cand: TrdCand = {
        idx: c.idx,
        doneAt: k,
        side: c.side,
        price,
        drawn: false,
        isCorrection: null,
        ratio: null,
        accepted: false,
      };
      const last = lastOf(m.pivots);
      const legStart = last?.side === c.side ? m.pivots[m.pivots.length - 2] : last;
      const movesLeg = last?.side !== c.side || outward(c.side, price) > outward(c.side, last.price);
      // ein zweites, schwächeres Fraktal derselben Seite hinter einer verworfenen Korrektur zählt nicht als eigene Korrektur
      const folded = last && m.cands.find((x) => x.isCorrection && !x.accepted && x.side === c.side && x.idx > last.idx);
      const weaker = folded && outward(c.side, price) <= outward(c.side, folded.price);
      if (legStart && m.dir && legDir(c.side) !== m.dir && movesLeg && !weaker) {
        cand.isCorrection = true;
        if (opt.rule !== 'welle') {
          cand.ratio = Math.abs(price - legStart.price) / minLeg(c.idx);
          m.refCorrection = minLeg(c.idx);
        }
      }
      m.cands.push(cand);
      const edit = nextEdit(m.pivots, { idx: c.idx, doneAt: k, side: c.side, price });
      if (edit) {
        cand.accepted = true;
        applyEdit(m, edit);
        if (outerBar) break;
      }
    }

    noteImpulse(m, k);
  }
  return m;
}

/** Längen der Züge einer Art im laufenden Trend, alt → neu */
export function lensOf(m: TrendModel, kind: 'impulse' | 'correction'): number[] {
  return m.pivots.slice(m.originPos).filter((p) => p.kind === kind).map((p) => p.len);
}

export interface TrendLine {
  /** Anker in Zeit und Preis, nach Spike-Ersatz (TRD-36) */
  a: { time: number; price: number };
  b: { time: number; price: number };
  /** Anker waren ein Spike-Docht und wurden ersetzt */
  replaced: boolean;
  /** Pivot-Positionen der Anker im Trendzug */
  posA: number;
  posB: number;
}

/** Anker eines Punkts: bei einem Manipulationsdocht (FRZ-16) das äußerste Dochtende der direkten Nachbarn */
function anchorOf(m: TrendModel, p: Pivot): { time: number; price: number; replaced: boolean } {
  const geom = zoneGeometry(m.bars, p.idx, p.side, m.tf);
  if (!geom.manipulation) return { time: m.bars[p.idx].time, price: p.price, replaced: false };
  const nb = [p.idx - 1, p.idx + 1].filter((k) => k >= 0 && k < m.bars.length);
  let best = nb[0];
  for (const k of nb) if (outward(p.side, wickEnd(m.bars[k], p.side)) > outward(p.side, wickEnd(m.bars[best], p.side))) best = k;
  return { time: m.bars[best].time, price: wickEnd(m.bars[best], p.side), replaced: true };
}

/**
 * Gültige Linien des laufenden Trends, alt → neu (TRD-34, TRD-35): durch die letzten 2 Tiefs (Aufwärtstrend) bzw. Hochs.
 * Die Linie gilt erst, wenn nach dem zweiten Anker ein Schluss jenseits des Extrems davor kam (zweiter Impuls).
 */
export function trendLines(m: TrendModel): TrendLine[] {
  if (!m.dir) return [];
  const side = counterSide(m.dir);
  const poss = m.pivots.map((p, pos) => ({ p, pos })).filter((x) => x.pos >= m.originPos && x.p.side === side);
  const out: TrendLine[] = [];
  for (let j = 1; j < poss.length; j++) {
    const first = poss[j - 1];
    const second = poss[j];
    const rising = outward(side, second.p.price) < outward(side, first.p.price);
    if (!rising) continue;
    const before = [...m.pivots.slice(0, second.pos)].reverse().find((p) => p.side === extremeSide(m.dir!));
    if (!before) continue;
    let impulse = false;
    for (let k = second.p.idx + 1; k < m.bars.length; k++) {
      if (closesBeyond(m.bars[k], before.price, extremeSide(m.dir))) {
        impulse = true;
        break;
      }
    }
    if (!impulse) continue;
    const a = anchorOf(m, first.p);
    const b = anchorOf(m, second.p);
    out.push({ a, b, replaced: a.replaced || b.replaced, posA: first.pos, posB: second.pos });
  }
  return out;
}

export const lineAt = (line: TrendLine, time: number): number =>
  line.a.price + ((line.b.price - line.a.price) * (time - line.a.time)) / (line.b.time - line.a.time);

export interface LineScan {
  touches: number;
  /** Schluss jenseits der Linie nach dem zweiten Anker */
  violated: boolean;
}

/** Berührung (TRD-40): Docht erreicht oder durchsticht die Linie, der Schluss liegt nicht jenseits */
export function scanLine(m: TrendModel, line: TrendLine): LineScan {
  const side = counterSide(m.dir!);
  const from = m.pivots[line.posB].idx + 1;
  let touches = 0;
  let violated = false;
  // die Kerzen direkt nach dem Anker liegen noch an der Linie und zählen nicht als neue Berührung
  let prevTouch = true;
  for (let k = from; k < m.bars.length; k++) {
    const b = m.bars[k];
    const level = lineAt(line, b.time);
    const reaches = side === 'support' ? b.low <= level : b.high >= level;
    const beyond = closesBeyond(b, level, side);
    if (beyond) violated = true;
    const touch = reaches && !beyond;
    if (touch && !prevTouch) touches++;
    prevTouch = touch;
  }
  return { touches, violated };
}
