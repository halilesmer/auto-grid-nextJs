/**
 * Trend-618 (T618): Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * Nach einem Trend mit Kraftverlust bricht eine schräge Linie durch die Startpunkte der letzten 2 Impulse; der Preis läuft bis I und
 * korrigiert bis Level 0.618 der Fib P → I. `es` ist die Seite des Extrems P (Verkauf: Hochs), `cs` die Gegenseite. Es fließen nur Kerzen
 * der übergebenen Liste ein, also nur geschlossene Kerzen bis t.
 */
import { legDirOf, levelPrice, type FibLeg } from './fib';
import { closesBeyond, outward, wickEnd, type ZoneSide } from './frz';
import { lineAtBar } from './lineChannel';
import { T618_PARAMS } from './params';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

export interface T618Point {
  idx: number;
  price: number;
}

export interface ReturnTouch {
  /** erste Kerze nach I, deren Docht Level 0.618 der Fib P → I erreicht */
  idx: number;
  level: number;
}

/** Berührungen der Linie: 2 Anker plus weitere Berührungen bis zum Bruch (T618-03, TRD-40) */
export interface LineTouches {
  total: number;
  /** ein Schluss jenseits der Linie vor P: sie hält nicht als Unterstützung bzw. Widerstand */
  violatedBeforeP: boolean;
}

/** Zusätzliche Berührungen nach dem zweiten Anker bis vor Kerze `until`; die Kerzen direkt nach dem Anker zählen nicht neu */
export function lineTouches(bars: Bars, cs: ZoneSide, l1: T618Point, l2: T618Point, p: T618Point, until: number): LineTouches {
  const levelAt = (k: number) => lineAtBar(bars, l1, l2, k);
  let violatedBeforeP = false;
  for (let k = l1.idx + 1; k <= p.idx; k++) if (closesBeyond(bars[k], levelAt(k), cs)) violatedBeforeP = true;
  let extra = 0;
  let prevTouch = true;
  for (let k = l2.idx + 1; k < until; k++) {
    const reaches = outward(cs, wickEnd(bars[k], cs)) >= outward(cs, levelAt(k));
    const touch = reaches && !closesBeyond(bars[k], levelAt(k), cs);
    if (touch && !prevTouch) extra++;
    prevTouch = touch;
  }
  return { total: T618_PARAMS.touches + extra, violatedBeforeP };
}

/**
 * Rücklauf nach I (T618-07): erste Kerze, deren Docht Level 0.618 erreicht, ohne Toleranz. Ein neues Extrem jenseits von I
 * beendet den Suchbereich (nächster Impuls). `depth` ist die größte Korrekturtiefe als Anteil des Impulses P → I.
 */
export function returnTouch(bars: Bars, es: ZoneSide, cs: ZoneSide, p: T618Point, i: T618Point): { leg: FibLeg; touch: ReturnTouch | null; depth: number } {
  const leg: FibLeg = { start: p, end: i, dir: legDirOf(p.price, i.price) };
  const level = levelPrice(leg, T618_PARAMS.entryLevel);
  const len = Math.abs(p.price - i.price);
  let depth = 0;
  for (let k = i.idx + 1; k < bars.length; k++) {
    if (outward(cs, wickEnd(bars[k], cs)) > outward(cs, i.price)) break;
    if (len > 0) depth = Math.max(depth, (outward(es, wickEnd(bars[k], es)) - outward(es, i.price)) / len);
    if (outward(es, wickEnd(bars[k], es)) >= outward(es, level)) return { leg, touch: { idx: k, level }, depth };
  }
  return { leg, touch: null, depth };
}
