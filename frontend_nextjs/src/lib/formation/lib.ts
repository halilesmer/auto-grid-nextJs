/**
 * Libra: Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * Zwei Impulse in alter Trendrichtung (P1, P2) mit einer Korrektur C dazwischen, danach eine volumenstarke Wendebewegung
 * bis P3, die jenseits von C schließt, und der Rücklauf in die Zone P1–P2 oder an Level 0.786 der Fib P2 → P3.
 * Es fließen nur Kerzen der übergebenen Liste ein, also nur geschlossene Kerzen bis t. Preise laufen über `outward(Seite, Preis)`;
 * Verkauf (P1, P2 sind Hochs) und Kauf (Tiefs) sind derselbe Code. es = Seite von P1 und P2, cs = Seite von C und P3.
 */
import { nearEdge } from './cdt';
import { levelPrice, legDirOf, type FibLeg } from './fib';
import { closesBeyond, fractalIndices, outward, wickEnd, type ZoneSide } from './frz';
import { FRZ_PARAMS, LIB_PARAMS } from './params';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

export interface LibPoint {
  idx: number;
  price: number;
}

/** P1 und P2 vor der Messung */
export interface LibBase {
  p1: LibPoint;
  p2: LibPoint;
}

export interface LibTouch {
  /** erste Kerze nach P3, deren Docht die erste erreichte Kante erreicht */
  idx: number;
  level: number;
}

export interface LibEntry {
  /** gewählter Einstiegspreis (E-2 a) */
  price: number;
  /** CRV bis TP1 am gewählten Einstieg; null bei Risiko 0 */
  crv: number | null;
}

/** Messung zu einem Paar P1/P2 und einem P3 */
export interface LibShape {
  es: ZoneSide;
  cs: ZoneSide;
  p1: LibPoint;
  p2: LibPoint;
  /** tiefstes fertiges Fraktal der Gegenseite zwischen P1 und P2 (Korrektur); null ohne eines */
  c: LibPoint | null;
  p3: LibPoint;
  /** Zone P1 (Körperkante) bis P2 (Docht-Spitze) */
  zone: { top: number; bottom: number };
  /** Kante der Zone, die zum Kurs hin liegt */
  zoneEdge: number;
  level786: number;
  /** zuerst erreichte der beiden Kanten */
  first: number;
  touch: LibTouch | null;
  /** letzte Kerze der Messung (Berührung, sonst Kerze vor einem neuen Extrem jenseits von P3, sonst Ende der Reihe) */
  windowEnd: number;
}

/** Körperkante der Kerze auf der Seite `side` (Verkauf: das höhere Körperende) */
export const bodyEdgeOf = (b: FormationBar, side: ZoneSide): number => (side === 'resistance' ? Math.max(b.open, b.close) : Math.min(b.open, b.close));

/** Zone P1 (Körperkante, E-5) bis P2 (Docht-Spitze) */
export function libZone(bars: Bars, p1: LibPoint, p2: LibPoint, es: ZoneSide): { top: number; bottom: number } {
  const edge = bodyEdgeOf(bars[p1.idx], es);
  return es === 'resistance' ? { top: p2.price, bottom: Math.min(edge, p2.price) } : { top: Math.max(edge, p2.price), bottom: p2.price };
}

/**
 * Paare P1/P2: P2 ist eines der jüngsten fertigen Fraktale der Seite es, P1 ein früheres fertiges Fraktal derselben Seite,
 * das weniger weit außen liegt. Jüngstes P2 zuerst.
 */
export function pairsOf(bars: Bars, es: ZoneSide): LibBase[] {
  // Benachbarte Fraktale (Abstand höchstens die Nachbarkerzen) sind ein Punkt: das äußerste gilt
  const peaks: LibPoint[] = [];
  let lastIdx = -Infinity;
  for (const idx of fractalIndices(bars, es)) {
    const point: LibPoint = { idx, price: wickEnd(bars[idx], es) };
    const tail = peaks[peaks.length - 1];
    if (idx - lastIdx > FRZ_PARAMS.neighbors) peaks.push(point);
    else if (outward(es, point.price) > outward(es, tail.price)) peaks[peaks.length - 1] = point;
    lastIdx = idx;
  }
  const recent = peaks.slice(-LIB_PARAMS.maxPeaks);
  const out: LibBase[] = [];
  for (let j = recent.length - 1; j >= Math.max(1, recent.length - LIB_PARAMS.maxP2); j--) {
    let found = 0;
    for (let i = j - 1; i >= 0 && found < LIB_PARAMS.maxP1; i--) {
      if (outward(es, recent[i].price) >= outward(es, recent[j].price)) continue;
      // zwischen P1 und P2 liegt kein Punkt, der P2 erreicht: P1 und P2 sind zwei aufeinanderfolgende Impulse
      if (recent.slice(i + 1, j).some((m) => outward(es, m.price) >= outward(es, recent[j].price))) continue;
      out.push({ p1: recent[i], p2: recent[j] });
      found++;
    }
  }
  return out;
}

/** Korrektur-Fraktal C: das am weitesten innen liegende fertige Fraktal der Seite cs zwischen P1 und P2; null ohne eines */
export function correctionOf(bars: Bars, cs: ZoneSide, p1: LibPoint, p2: LibPoint): LibPoint | null {
  let best: LibPoint | null = null;
  for (const idx of fractalIndices(bars, cs)) {
    if (idx <= p1.idx || idx >= p2.idx) continue;
    const price = wickEnd(bars[idx], cs);
    if (best === null || outward(cs, price) > outward(cs, best.price)) best = { idx, price };
  }
  return best;
}

/**
 * Kandidaten für P3: laufende Extreme der Seite cs seit P2, jedes mit fertigem Fraktal (`done`), dazu das letzte Extrem,
 * auch wenn sein Fraktal noch nicht fertig ist. Alt → neu, höchstens die letzten `maxEnds`.
 */
export function endsOf(bars: Bars, p2: LibPoint, cs: ZoneSide, done: (p: LibPoint) => boolean): LibPoint[] {
  const out: LibPoint[] = [];
  let best: LibPoint | null = null;
  for (let k = p2.idx + 1; k < bars.length; k++) {
    const price = wickEnd(bars[k], cs);
    if (best !== null && outward(cs, price) <= outward(cs, best.price)) continue;
    best = { idx: k, price };
    if (done(best)) out.push(best);
  }
  if (best !== null && !out.some((p) => p.idx === best.idx)) out.push(best);
  return out.slice(-LIB_PARAMS.maxEnds);
}

/** Erster Schluss jenseits von C nach P2, spätestens an Kerze `upTo`; null ohne solche Kerze (Docht allein zählt nicht) */
export function breakOf(bars: Bars, c: LibPoint, p2: LibPoint, cs: ZoneSide, upTo: number): number | null {
  for (let k = p2.idx + 1; k <= Math.min(upTo, bars.length - 1); k++) if (closesBeyond(bars[k], c.price, cs)) return k;
  return null;
}

/** Eine Kerze nach P2 schließt jenseits der Docht-Spitze von P2 (LIB-13) */
export function closedBeyondP2(bars: Bars, p2: LibPoint, es: ZoneSide): boolean {
  for (let k = p2.idx + 1; k < bars.length; k++) if (closesBeyond(bars[k], p2.price, es)) return true;
  return false;
}

/** Berührung der zuerst erreichten Kante; ein neues Extrem jenseits von P3 beendet die Messung (nächster Impuls) */
export function measureTouch(bars: Bars, es: ZoneSide, cs: ZoneSide, p3: LibPoint, first: number): { touch: LibTouch | null; windowEnd: number } {
  let windowEnd = bars.length - 1;
  for (let k = p3.idx + 1; k < bars.length; k++) {
    if (outward(cs, wickEnd(bars[k], cs)) > outward(cs, p3.price)) {
      windowEnd = k - 1;
      break;
    }
    if (outward(es, wickEnd(bars[k], es)) >= outward(es, first)) return { touch: { idx: k, level: first }, windowEnd: k };
  }
  return { touch: null, windowEnd };
}

/** Zusammengesetzte Messung für ein Paar und ein P3 */
export function shapeOfLib(bars: Bars, es: ZoneSide, cs: ZoneSide, base: LibBase, p3: LibPoint): LibShape {
  const { p1, p2 } = base;
  const leg: FibLeg = { start: p2, end: p3, dir: legDirOf(p2.price, p3.price) };
  const zone = libZone(bars, p1, p2, es);
  const zoneEdge = nearEdge(es, zone);
  const level786 = levelPrice(leg, LIB_PARAMS.entryLevel);
  // Von P3 aus wird die weiter innen liegende Kante zuerst erreicht (Verkauf: die tiefere)
  const first = outward(es, zoneEdge) <= outward(es, level786) ? zoneEdge : level786;
  return { es, cs, p1, p2, c: correctionOf(bars, cs, p1, p2), p3, zone, zoneEdge, level786, first, ...measureTouch(bars, es, cs, p3, first) };
}

/** Nahe Kante der Fraktalzone von P3: Ziel 1 */
export const targetEdge = (cs: ZoneSide, zone: { top: number; bottom: number }): number => (cs === 'support' ? zone.top : zone.bottom);

/** CRV = Abstand Einstieg → Ziel durch Abstand Einstieg → Stop; null bei Risiko 0 */
export function crvOf(entry: number, stop: number, target: number): number | null {
  const risk = Math.abs(stop - entry);
  return risk > 0 ? Math.abs(entry - target) / risk : null;
}

/**
 * Einstiegswahl (E-2 a): die zuerst erreichte Kante, wenn dort das CRV bis TP1 mindestens `floorCrv` ist; sonst die andere
 * Kante unter derselben Bedingung; sonst kein Trade (dann das bessere CRV der beiden, zur Anzeige).
 */
export function chooseEntry(s: LibShape, target: number): LibEntry {
  const other = s.first === s.zoneEdge ? s.level786 : s.zoneEdge;
  const a = crvOf(s.first, s.p2.price, target);
  const b = crvOf(other, s.p2.price, target);
  const reachesFloor = (v: number | null) => v !== null && v >= LIB_PARAMS.floorCrv;
  if (reachesFloor(a)) return { price: s.first, crv: a };
  if (reachesFloor(b)) return { price: other, crv: b };
  return (b ?? 0) > (a ?? 0) ? { price: other, crv: b } : { price: s.first, crv: a };
}

/** Schwungpunkt: ein fertiges Fraktal (Seite, Kerze, Dochtpreis) */
export interface Swing extends LibPoint {
  side: ZoneSide;
}

/**
 * Schwungpunkte nach P3, die bis Kerze `endIdx` fertig sind (LIB-08, LIB-15), alt → neu. Fraktale derselben Seite im Abstand
 * der Nachbarkerzen gehören zum selben Schwungpunkt und zählen einmal (das äußerste gilt); das Fraktal an P3 und seine Nachbarn zählen nicht.
 */
export function swingsAfter(bars: Bars, p3: LibPoint, cs: ZoneSide, endIdx: number): Swing[] {
  const out: Swing[] = [];
  for (const side of ['resistance', 'support'] as const) {
    // Gruppen benachbarter Fraktale; auf der Seite von P3 beginnt die erste Gruppe bei P3 selbst und wird verworfen
    const groups: number[][] = side === cs ? [[p3.idx]] : [];
    for (const idx of fractalIndices(bars.slice(0, endIdx + 1), side)) {
      if (idx <= p3.idx) continue;
      const group = groups[groups.length - 1];
      if (group && idx - group[group.length - 1] <= FRZ_PARAMS.neighbors) group.push(idx);
      else groups.push([idx]);
    }
    for (const group of side === cs ? groups.slice(1) : groups) {
      const idx = group.reduce((best, k) => (outward(side, wickEnd(bars[k], side)) > outward(side, wickEnd(bars[best], side)) ? k : best));
      out.push({ idx, side, price: wickEnd(bars[idx], side) });
    }
  }
  return out.sort((x, y) => x.idx - y.idx);
}

/**
 * Level 1 innerer AB=CD-Bewegungen im Rücklauf (ABCD-09): je drei aufeinanderfolgende, abwechselnde Schwungpunkte (cs, es, cs)
 * ab P3 ergeben D' = C' + (B' − A'). Der Rücklauf ist eine Korrektur des gedrehten Trends und hat deshalb keine Wendepunkte im
 * Trendzug (trd.ts); die Punkte kommen aus den Fraktalen.
 */
export function innerLevels(swings: readonly Swing[], p3: LibPoint, es: ZoneSide, cs: ZoneSide): number[] {
  const chain: Swing[] = [{ idx: p3.idx, price: p3.price, side: cs }];
  for (const w of swings) {
    const tail = chain[chain.length - 1];
    if (w.side !== tail.side) chain.push(w);
    else if (chain.length > 1 && outward(w.side, w.price) > outward(w.side, tail.price)) chain[chain.length - 1] = w;
  }
  const out: number[] = [];
  for (let i = 0; i + 2 < chain.length; i++) {
    if (chain[i].side === cs && chain[i + 1].side === es) out.push(chain[i + 2].price + (chain[i + 1].price - chain[i].price));
  }
  return out;
}

/** Kerze, in der der Kurs nach der Berührung das Ziel erreicht (Docht), bis zum Ende der Reihe; null ohne Berührung oder Ziel */
export function targetReachedAt(bars: Bars, s: LibShape, target: number): number | null {
  if (!s.touch) return null;
  for (let k = s.touch.idx + 1; k < bars.length; k++) if (outward(s.cs, wickEnd(bars[k], s.cs)) >= outward(s.cs, target)) return k;
  return null;
}
