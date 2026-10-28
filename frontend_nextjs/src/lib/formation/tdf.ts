/**
 * Trendfortsetzung (TDF): gemeinsame Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * `es` ist die Seite des Extrems in Trendrichtung (Aufwärtstrend: Widerstand, Hochs), `cs` die Gegenseite. Der Impuls endet in H1 (fertiges
 * Fraktal von `es`) und beginnt im äußersten fertigen Fraktal von `cs` zwischen dem vorigen Fraktal von `es` und H1. Die Pause danach
 * wird aktiv mit dem Körperschluss jenseits ihrer Kante in Trendrichtung. Es fließen nur Kerzen der übergebenen Liste ein, also nur
 * geschlossene Kerzen bis t. Preise laufen über `outward(Seite, Preis)`: Kauf (Hochs) und Verkauf (Tiefs) sind derselbe Code.
 */
import { closesBeyond, outward, otherSide, wickEnd, type Rect, type ZoneSide } from './frz';
import { innerExtreme, necklineAt, peaksOf, type ObPoint } from './obo';
import { nearEdge } from './cdt';
import type { FormationBar, Side } from './types';

type Bars = readonly FormationBar[];

/** Handelsrichtung = Trendrichtung: Hochs als Extrem heißt Kauf */
export const sideOf = (es: ZoneSide): Side => (es === 'resistance' ? 'buy' : 'sell');
/** Vorzeichen der Trendrichtung im Preis */
export const signOf = (es: ZoneSide): 1 | -1 => (es === 'resistance' ? 1 : -1);

export interface Impulse {
  /** Beginn des Impulses (Mastbeginn); null ohne fertiges Fraktal davor */
  s: ObPoint | null;
  /** vorheriges Fraktal von `es`, vor dem die vorige Korrektur lag */
  prev: ObPoint | null;
  /** Mastlänge in Preis, 0 ohne Beginn */
  mast: number;
}

/** Impuls zu H1 (TDF-02, TDF-10) */
export function impulseOf(bars: Bars, es: ZoneSide, h1: ObPoint): Impulse {
  const before = peaksOf(bars, es).filter((p) => p.idx < h1.idx);
  const prev = before.length > 0 ? before[before.length - 1] : null;
  const s = innerExtreme(bars, otherSide(es), prev ? prev.idx : -1, h1.idx);
  const mast = s ? Math.max(0, outward(es, h1.price) - outward(es, s.price)) : 0;
  return { s, prev, mast };
}

/** Tiefe eines Preises als Anteil des Masts, gemessen von H1 aus (0 bei H1, 1 am Mastbeginn) */
export function depthOf(es: ZoneSide, h1: ObPoint, mast: number, price: number): number | null {
  return mast > 0 ? (outward(es, h1.price) - outward(es, price)) / mast : null;
}

/** Äußerstes Dochtende der Seite `side` in den Kerzen `from`…`to`; null ohne Kerze */
export function pauseExtreme(bars: Bars, side: ZoneSide, from: number, to: number): ObPoint | null {
  let best: ObPoint | null = null;
  for (let k = Math.max(0, from); k <= Math.min(to, bars.length - 1); k++) {
    const price = wickEnd(bars[k], side);
    if (best === null || outward(side, price) > outward(side, best.price)) best = { idx: k, price };
  }
  return best;
}

/** Gerade durch zwei Punkte, zur Zeit `time` (nach beiden Seiten verlängert) */
export function lineAt(bars: Bars, a: ObPoint, b: ObPoint, time: number): number {
  return necklineAt({ t1: bars[a.idx].time, t2: bars[b.idx].time }, a, b, time);
}

/** Erste Kerze nach `from`, die mit dem Körper jenseits der Kante (Seite `side`) schließt; null ohne solche (Docht allein zählt nicht) */
export function closeBeyondAfter(bars: Bars, side: ZoneSide, edgeAt: (time: number) => number, from: number): number | null {
  for (let k = from + 1; k < bars.length; k++) if (closesBeyond(bars[k], edgeAt(bars[k].time), side)) return k;
  return null;
}

/** Äußere Kante einer Zone der Seite `side` (Widerstand: oben, Unterstützung: unten) */
export const farEdge = (side: ZoneSide, zone: Rect): number => (side === 'resistance' ? zone.top : zone.bottom);

/** Der Docht erreicht die nahe Kante der Zone (Berührung nach CDT-05, ohne Toleranz) */
export const reaches = (side: ZoneSide, wick: number, zone: Rect): boolean => outward(side, wick) >= outward(side, nearEdge(side, zone));

/** Ein Punkt der Berührungsfolge: `top` = Berührung oben (Seite `es`), sonst unten */
export interface Touch {
  idx: number;
  top: boolean;
}

/**
 * Abwechselnd gezählte Berührungen ab dem Impulsende (TDF-28, TDF-29): oben → unten → oben → unten. Eine erneute Berührung derselben
 * Seite ohne Gegenseite dazwischen zählt nicht. Die Folge beginnt mit der ersten Berührung oben.
 */
export function alternatingCount(touches: readonly Touch[]): { top: number; bottom: number } {
  const sorted = [...touches].sort((a, b) => a.idx - b.idx);
  const chain: Touch[] = [];
  for (const t of sorted) {
    if (chain.length === 0 && !t.top) continue;
    if (chain.length === 0 || chain[chain.length - 1].top !== t.top) chain.push(t);
  }
  return { top: chain.filter((t) => t.top).length, bottom: chain.filter((t) => !t.top).length };
}
