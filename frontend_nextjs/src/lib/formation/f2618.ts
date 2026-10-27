/**
 * 2618: Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * Auf ein Doppeltop (Punkte H1, N, H2 aus cdt.ts) folgt der Schluss jenseits von N, ein Impuls bis I und die Korrektur,
 * die Level 0.618 der Fib Impuls-Beginn → I berührt. Es fließen nur Kerzen der übergebenen Liste ein, also nur
 * geschlossene Kerzen bis t. Preise laufen über `outward(Seite, Preis)`; Verkauf (Doppeltop) und Kauf (Doppelboden) sind derselbe Code.
 */
import { nearEdge, type CdtBase, type CdtPoint, type CdtShape } from './cdt';
import { closesBeyond, outward, wickEnd, zoneGeometry, type ZoneSide } from './frz';
import { legDirOf, levelPrice, type FibLeg } from './fib';
import { F2618_PARAMS } from './params';
import type { Env } from './reasons';
import { buildTrend } from './trd';
import { fractalDone } from './xabcd';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

export interface FibTouch {
  /** erste Kerze nach I, deren Docht Level 0.618 erreicht */
  idx: number;
  /** Level 0.618 der Fib */
  level: number;
}

/** Messung zu einem Doppeltop-Paar und einem Impulsende I */
export interface F2618Shape {
  cdt: CdtShape;
  /** erster Schluss jenseits des Dochtendes von N nach H2 (2618-02) */
  breakIdx: number | null;
  /** Ende des trendwendenden Impulses (Fib-Ende, Level 0) */
  i: CdtPoint;
  /** Beginn des Impulses (Fib-Beginn, Level 1): H2 oder der Wendepunkt der Seite von H2 vor I (E-8) */
  start: CdtPoint;
  leg: FibLeg;
  /** Berührung von 0.618; null, solange die Korrektur das Level nicht erreicht hat */
  touch: FibTouch | null;
  /** tiefste Korrekturtiefe als Anteil des Impulses bis zum Ende des Suchbereichs */
  depth: number;
  /** Kerze, bis zu der gemessen wird (Berührung, sonst Ende des Bereichs ohne neues Extrem jenseits von I) */
  windowEnd: number;
}

/**
 * Zweites Hoch H2 (E-4): das erste fertige Fraktal der Seite von H1 nach N, das die Zone von H1 erreicht (CDT-05). Das spätere
 * Extrem zählt nicht als H2; ein Schluss jenseits der Zone danach ist der Ausschluss 2618-09. Ohne solches Fraktal: undefined,
 * dann gilt der äußerste Docht seit N wie beim Doppeltop.
 */
export function secondTop(bars: Bars, base: CdtBase, es: ZoneSide, tf: Env['tf']): CdtPoint | undefined {
  const edge = nearEdge(es, zoneGeometry(bars, base.h1.idx, es, tf));
  for (let k = base.n.idx + 1; k < bars.length; k++) {
    const point = { idx: k, price: wickEnd(bars[k], es) };
    if (outward(es, point.price) >= outward(es, edge) && fractalDone(bars, point, es)) return point;
  }
  return undefined;
}

/** Erster Schluss jenseits des Dochtendes von N nach H2 und spätestens an Kerze `upTo` (dem Impulsende I); null ohne solche Kerze */
export function breakOf(bars: Bars, s: CdtShape, upTo: number): number | null {
  if (!s.h2) return null;
  for (let k = s.h2.idx + 1; k <= upTo; k++) if (closesBeyond(bars[k], s.n.price, s.cs)) return k;
  return null;
}

/**
 * Kandidaten für I: laufende Extreme der Seite von N seit H2 (neuer Docht jenseits des bisherigen Extrems), jedes mit fertigem
 * Fraktal, dazu das letzte Extrem, auch wenn sein Fraktal noch nicht fertig ist. Alt → neu, höchstens die letzten `maxEnds`.
 */
export function impulseEnds(bars: Bars, h2: CdtPoint, cs: ZoneSide): CdtPoint[] {
  const out: CdtPoint[] = [];
  let best: CdtPoint | null = null;
  for (let k = h2.idx + 1; k < bars.length; k++) {
    const price = wickEnd(bars[k], cs);
    if (best !== null && outward(cs, price) <= outward(cs, best.price)) continue;
    best = { idx: k, price };
    if (fractalDone(bars, best, cs)) out.push(best);
  }
  if (best !== null && !out.some((p) => p.idx === best.idx)) out.push(best);
  return out.slice(-F2618_PARAMS.maxEnds);
}

/**
 * Beginn des Impulses zu I (E-8): ist I ein Wendepunkt des Trendzugs, der Wendepunkt davor auf der Seite von H2 (nicht vor H2),
 * sonst H2.
 */
export function startOf(env: Env, tf: Env['tf'], s: CdtShape, h2: CdtPoint, i: CdtPoint): CdtPoint {
  const pivots = env.trends.get(tf)?.pivots ?? [];
  const at = pivots.findIndex((p) => p.idx === i.idx && p.side === s.cs);
  const prev = at > 0 ? pivots[at - 1] : undefined;
  return prev && prev.side === s.es && prev.idx >= h2.idx ? { idx: prev.idx, price: prev.price } : h2;
}

/** Messung von Berührung und Korrekturtiefe nach I; neue Extreme jenseits von I beenden den Suchbereich (nächster Impuls) */
export function measureTouch(bars: Bars, s: CdtShape, i: CdtPoint, start: CdtPoint): { touch: FibTouch | null; depth: number; windowEnd: number } {
  const leg: FibLeg = { start, end: i, dir: legDirOf(start.price, i.price) };
  const level = levelPrice(leg, F2618_PARAMS.entryLevel);
  const len = Math.abs(start.price - i.price);
  let depth = 0;
  let windowEnd = bars.length - 1;
  for (let k = i.idx + 1; k < bars.length; k++) {
    if (outward(s.cs, wickEnd(bars[k], s.cs)) > outward(s.cs, i.price)) {
      windowEnd = k - 1;
      break;
    }
    if (len > 0) depth = Math.max(depth, (outward(s.es, wickEnd(bars[k], s.es)) - outward(s.es, i.price)) / len);
    if (outward(s.es, wickEnd(bars[k], s.es)) >= outward(s.es, level)) return { touch: { idx: k, level }, depth, windowEnd: k };
  }
  return { touch: null, depth, windowEnd };
}

/** Zusammengesetzte Messung für ein Paar und ein Impulsende */
export function shapeOf2618(env: Env, tf: Env['tf'], cdt: CdtShape, i: CdtPoint): F2618Shape {
  const bars = env.views.get(tf)!.bars;
  const start = startOf(env, tf, cdt, cdt.h2 ?? i, i);
  const leg: FibLeg = { start, end: i, dir: legDirOf(start.price, i.price) };
  return { cdt, breakIdx: breakOf(bars, cdt, i.idx), i, start, leg, ...measureTouch(bars, cdt, i, start) };
}

/** Äußere Kante der größeren Zone von H1 und H2 (2618-09, E-4) */
export function stopEdge(s: CdtShape, zoneOfH2: { top: number; bottom: number }): number {
  return s.es === 'resistance' ? Math.max(s.zone.top, zoneOfH2.top) : Math.min(s.zone.bottom, zoneOfH2.bottom);
}

/** Schluss jenseits der Stop-Zone zwischen H2 und der Berührung (bzw. dem Ende des Suchbereichs) */
export function closedBeyondStop(bars: Bars, s: F2618Shape, edge: number): boolean {
  const to = s.touch ? s.touch.idx - 1 : s.windowEnd;
  for (let k = s.cdt.h2!.idx + 1; k <= to; k++) if (closesBeyond(bars[k], edge, s.cdt.es)) return true;
  return false;
}

/** Trend der Formations-Zeiteinheit nach den Kerzen bis `idx` (2618-06); null ohne Trend */
export function trendDirUpTo(env: Env, tf: Env['tf'], idx: number): 'up' | 'down' | null {
  const view = env.views.get(tf)!;
  return buildTrend(tf, view.bars.slice(0, idx + 1), view.wave.slice(0, idx + 1)).dir;
}

/**
 * Volumenstarke Kerze gegen die Trade-Richtung an der Berührung (2618-10): die Kerze vor und die Kerze der Berührung.
 * Gegen den Verkauf läuft eine steigende Kerze, gegen den Kauf eine fallende. null, solange eine Kerze nicht messbar ist.
 */
export function wideAgainst(env: Env, tf: Env['tf'], s: CdtShape, idx: number): boolean | null {
  const view = env.views.get(tf)!;
  const flags: (boolean | null)[] = [];
  for (const k of [idx - 1, idx]) {
    if (k < 0) continue;
    const b = view.bars[k];
    const against = s.es === 'resistance' ? b.close > b.open : b.close < b.open;
    flags.push(view.wide[k] === null ? null : view.wide[k] === true && against);
  }
  if (flags.includes(true)) return true;
  return flags.includes(null) ? null : false;
}
