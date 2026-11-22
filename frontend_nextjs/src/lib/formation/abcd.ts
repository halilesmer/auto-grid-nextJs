/**
 * AB=CD (ABCD): Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * A, B und C sind Wendepunkte des Trendzugs (trd.ts, jeder ein fertiges Fraktal; ABCD-02 prüft B und C); D ist der äußerste Docht seit C.
 * Es fließen nur Kerzen der übergebenen Liste ein, also nur geschlossene Kerzen bis t.
 * Preise laufen über `outward(Seite, Preis)`; eine Verkaufs-Formation (B ist ein Hoch) und ihr Spiegelbild sind derselbe Code.
 */
import { otherSide, outward, wickEnd, type ZoneSide } from './frz';
import { ABCD_PARAMS } from './params';
import { legDir, type Pivot, type TrendModel } from './trd';
import { tradeSideOf } from './sig';
import type { FormationBar, Side } from './types';

type Bars = readonly FormationBar[];

export interface AbcdPoint {
  idx: number;
  price: number;
}

/** A, B, C vor der Messung: Kerzenindex und Preis */
export interface AbcdPoints {
  a: AbcdPoint;
  b: AbcdPoint;
  c: AbcdPoint;
}

export interface AbcdShape extends AbcdPoints {
  /** Seite von B (Hoch = Widerstand): dort liegt D */
  es: ZoneSide;
  /** Seite von A und C */
  cs: ZoneSide;
  /** Seite des Trades am D: Verkauf, wenn B ein Hoch ist */
  side: Side;
  /** Länge AB */
  len: number;
  /** Anteil von AB, den die Korrektur B → C zurückläuft; null bei Länge 0 */
  depth: number | null;
  /** Level 1 der trendbasierten Ausdehnung A → B → C (Länge CD = Länge AB) */
  level1: number;
  /** äußerster Docht in Richtung B seit C; null ohne Kerze nach C (oder der Eingabe-Punkt) */
  d: AbcdPoint | null;
}

/**
 * Wählt A, B, C aus den Wendepunkten: C ist einer der letzten `lookbackPivots` Wendepunkte, B und A die zwei davor.
 * Genommen wird das jüngste C, dessen Korrekturtiefe die Formbedingungen ABCD-04 bis ABCD-06 erfüllt; gibt es keines,
 * der letzte Wendepunkt. Liegt ein späterer Wendepunkt schon jenseits von B, ist er das D (es zählt der äußerste Docht seit C).
 * Weniger als drei Wendepunkte: null.
 */
export function selectPoints(pivots: readonly Pivot[]): AbcdPoints | null {
  return selectOrder(pivots)[0] ?? null;
}

/** Korrekturtiefe von C in AB im erlaubten Bereich (ABCD_PARAMS.minCorrection bis maxCorrection) */
export function depthOk(p: AbcdPoints): boolean {
  const len = Math.abs(p.b.price - p.a.price);
  if (len === 0) return false;
  const side: ZoneSide = p.b.price > p.a.price ? 'resistance' : 'support';
  const depth = (outward(side, p.b.price) - outward(side, p.c.price)) / len;
  return depth >= ABCD_PARAMS.minCorrection && depth <= ABCD_PARAMS.maxCorrection;
}

/**
 * Reihenfolge der Wahl: unter den letzten `lookbackPivots` Wendepunkten jedes C mit gültiger Korrekturtiefe, jüngstes zuerst; danach die
 * letzten drei Wendepunkte, wenn ihre Tiefe nicht gültig ist (ohne gültiges Tripel sind sie die Wahl). `selectPoints` ist das erste; die folgenden gelten, wenn das erste einen beim Einstieg nicht gezeigten Handel trägt (1122-A1.4 b).
 */
export function selectOrder(pivots: readonly Pivot[]): AbcdPoints[] {
  const n = pivots.length;
  if (n < 3) return [];
  const pt = (p: Pivot): AbcdPoint => ({ idx: p.idx, price: p.price });
  const at = (j: number): AbcdPoints => ({ a: pt(pivots[j - 2]), b: pt(pivots[j - 1]), c: pt(pivots[j]) });
  const out: AbcdPoints[] = [];
  for (let j = n - 1; j >= Math.max(2, n - ABCD_PARAMS.lookbackPivots); j--) if (depthOk(at(j))) out.push(at(j));
  // ohne gültige Tiefe an n − 1: die letzten drei Wendepunkte zuletzt (ohne gültiges Tripel die Wahl selbst)
  if (!depthOk(at(n - 1))) out.push(at(n - 1));
  return out;
}

/** Äußerster Docht auf der Seite `es` nach Kerze `from` (ohne `from`); null ohne spätere Kerze */
export function extremeAfter(bars: Bars, from: number, es: ZoneSide): AbcdPoint | null {
  let best: AbcdPoint | null = null;
  for (let k = from + 1; k < bars.length; k++) {
    const price = wickEnd(bars[k], es);
    if (best === null || outward(es, price) > outward(es, best.price)) best = { idx: k, price };
  }
  return best;
}

/** Formen und Verhältnisse; `d` überschreibt den gemessenen äußersten Docht (eigene Punkte) */
export function shapeOf(bars: Bars, p: AbcdPoints, d?: AbcdPoint): AbcdShape {
  const es: ZoneSide = p.b.price > p.a.price ? 'resistance' : 'support';
  const len = Math.abs(p.b.price - p.a.price);
  return {
    ...p,
    es,
    cs: otherSide(es),
    side: tradeSideOf(es),
    len,
    depth: len > 0 ? (outward(es, p.b.price) - outward(es, p.c.price)) / len : null,
    level1: p.c.price + (p.b.price - p.a.price),
    d: d ?? extremeAfter(bars, p.c.idx, es),
  };
}

/** Preis der Ausdehnung A → B jenseits von B um `ratio` × AB (−0.272 ↔ 0.272) */
export const extensionPrice = (s: AbcdShape, ratio: number): number => s.b.price + ratio * (s.b.price - s.a.price);

/** Strecke, um die der D-Docht Level 1 verfehlt, als Anteil von AB (0, wenn Level 1 erreicht ist); null ohne D oder AB */
export function shortfall(s: AbcdShape): number | null {
  if (!s.d || s.len === 0) return null;
  return Math.max(0, outward(s.es, s.level1) - outward(s.es, s.d.price)) / s.len;
}

/** D gilt als erreicht, wenn Level 1 höchstens um die Toleranz verfehlt ist (ABCD-08) */
export const dReached = (s: AbcdShape): boolean => {
  const miss = shortfall(s);
  return miss !== null && miss <= ABCD_PARAMS.tolerance;
};

/**
 * Einstiegskerze (HDL-14): die erste Kerze nach C, die Level 1 mit Toleranz erreicht; ohne erreichtes D null. Gleiche Rechnung wie `shortfall`
 * (Anteil von AB), damit Schleife und `dReached` an der Toleranzgrenze nicht auseinanderlaufen. Ein eigenes D, dessen Preis nicht auf einem Docht
 * liegt, kann keine Kerze treffen: dann gilt die Kerze des D.
 */
export function entryIdxOf(bars: Bars, s: AbcdShape): number | null {
  if (!s.d || !dReached(s)) return null;
  const last = bars.length - 1;
  const missAt = (k: number) => Math.max(0, outward(s.es, s.level1) - outward(s.es, wickEnd(bars[k], s.es))) / s.len;
  let k = s.c.idx + 1;
  while (k <= last && missAt(k) > ABCD_PARAMS.tolerance) k++;
  return k > last ? s.d.idx : k;
}

/**
 * Level 1 innerer AB=CD-Bewegungen im D-Bein (ABCD-09, ABCD-15): je drei aufeinanderfolgende Wendepunkte nach C
 * (A' an der Seite von C, B' an der Seite von B, C' wieder an der Seite von C) ergeben D' = C' + (B' − A').
 */
export function innerLevels(trend: TrendModel, s: AbcdShape): number[] {
  const q = trend.pivots.filter((p) => p.idx > s.c.idx);
  const out: number[] = [];
  for (let i = 0; i + 2 < q.length; i++) {
    if (q[i].side === s.cs && q[i + 1].side === s.es && q[i + 2].side === s.cs) {
      out.push(q[i + 2].price + (q[i + 1].price - q[i].price));
    }
  }
  return out;
}

/** Abstand eines Preises zum Rechteck (0 = darin) */
export const gapToRect = (rect: { top: number; bottom: number }, price: number): number =>
  Math.max(rect.bottom - price, price - rect.top, 0);

/**
 * ABCD-26: der Trendzug wechselt nach C gegen das D-Bein (Verkaufs-Formation: abwärts, Kauf-Formation: aufwärts), bevor D
 * erreicht ist, und die Bezugszone des Wechsels liegt an C oder jenseits davon: der Kurs hat C gebrochen. `entryIdx` ist
 * die Kerze, die Level 1 (mit Toleranz) zuerst erreicht (Einstieg, HDL-14), null solange D nicht erreicht ist. Ein Wechsel
 * ab dieser Kerze ist der Weg zum Ziel und zählt nicht, auch wenn der äußerste Docht später noch weiterläuft.
 */
export function trendBreaksC(trend: TrendModel, s: AbcdShape, entryIdx: number | null): boolean {
  const against = legDir(s.cs);
  return trend.changes.some(
    (ch) =>
      ch.k > s.c.idx &&
      (entryIdx === null || ch.k < entryIdx) &&
      ch.to === against &&
      outward(s.cs, ch.refPrice) >= outward(s.cs, s.c.price),
  );
}

/** ABCD-25: in dieser Zeiteinheit gilt AB=CD nicht */
export const timeframeExcluded = (tf: string): boolean => ABCD_PARAMS.excludedTimeframes.includes(tf);
