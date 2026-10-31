/**
 * Kopf-Schulter (OBO): Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * LS, K und RS sind fertige Fraktale einer Seite (es), N1 und N2 die tiefsten fertigen Fraktale der Gegenseite (cs) zwischen LS und K
 * bzw. K und RS. Die Nackenlinie läuft durch N1 und N2 und wird nach rechts verlängert. Es fließen nur Kerzen der übergebenen
 * Liste ein, also nur geschlossene Kerzen bis t. Preise laufen über `outward(Seite, Preis)`; OBO (es = Widerstand) und TOBO sind derselbe Code.
 */
import { closesBeyond, fractalIndices, outward, wickEnd, type ZoneSide } from './frz';
import { FRZ_PARAMS, OBO_PARAMS } from './params';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

export interface ObPoint {
  idx: number;
  price: number;
}

/** Punkte vor der Messung; `rs` und `n2` fehlen, solange die rechte Schulter nicht fertig ist */
export interface OboBase {
  ls: ObPoint;
  n1: ObPoint | null;
  k: ObPoint;
  n2: ObPoint | null;
  rs: ObPoint | null;
}

/** Fertige Fraktale der Seite `side`; benachbarte (Abstand höchstens die Nachbarkerzen) sind ein Punkt, das äußerste gilt */
export function peaksOf(bars: Bars, side: ZoneSide): ObPoint[] {
  const peaks: ObPoint[] = [];
  let lastIdx = -Infinity;
  for (const idx of fractalIndices(bars, side)) {
    const point: ObPoint = { idx, price: wickEnd(bars[idx], side) };
    const tail = peaks[peaks.length - 1];
    if (idx - lastIdx > FRZ_PARAMS.neighbors) peaks.push(point);
    else if (outward(side, point.price) > outward(side, tail.price)) peaks[peaks.length - 1] = point;
    lastIdx = idx;
  }
  return peaks;
}

/** Äußerstes fertiges Fraktal der Seite `side` zwischen den Kerzen `from` und `to`; null ohne eines */
export function innerExtreme(bars: Bars, side: ZoneSide, from: number, to: number): ObPoint | null {
  let best: ObPoint | null = null;
  for (const idx of fractalIndices(bars, side)) {
    if (idx <= from || idx >= to) continue;
    const price = wickEnd(bars[idx], side);
    if (best === null || outward(side, price) > outward(side, best.price)) best = { idx, price };
  }
  return best;
}

/**
 * Kandidaten: K ist eines der jüngsten Fraktale der Seite es, LS ein früheres, das weniger weit außen liegt (ohne ein Fraktal dazwischen,
 * das K erreicht), RS ein späteres (oder keines: die rechte Schulter ist noch nicht fertig). Jüngster Kopf zuerst.
 */
export function basesOf(bars: Bars, es: ZoneSide): OboBase[] {
  const cs: ZoneSide = es === 'resistance' ? 'support' : 'resistance';
  const recent = peaksOf(bars, es).slice(-OBO_PARAMS.maxPeaks);
  const out: OboBase[] = [];
  for (let j = recent.length - 1; j >= Math.max(1, recent.length - OBO_PARAMS.maxHeads); j--) {
    const k = recent[j];
    const rights: (ObPoint | null)[] = recent.slice(j + 1).slice(-OBO_PARAMS.maxRight);
    if (rights.length === 0) rights.push(null);
    let found = 0;
    for (let i = j - 1; i >= 0 && found < OBO_PARAMS.maxLeft; i--) {
      if (outward(es, recent[i].price) >= outward(es, k.price)) continue;
      if (recent.slice(i + 1, j).some((m) => outward(es, m.price) >= outward(es, k.price))) continue;
      found++;
      const ls = recent[i];
      const n1 = innerExtreme(bars, cs, ls.idx, k.idx);
      for (const rs of rights) {
        // N2: tiefstes Korrektur-Fraktal nach dem Kopf (bis zur rechten Schulter, ohne sie bis zum Ende der Reihe)
        out.push({ ls, n1, k, rs, n2: innerExtreme(bars, cs, k.idx, rs ? rs.idx : bars.length) });
      }
    }
  }
  return out;
}

/** Preis der Nackenlinie zur Zeit `time` (Gerade durch N1 und N2, nach rechts verlängert) */
export function necklineAt(times: { t1: number; t2: number }, n1: ObPoint, n2: ObPoint, time: number): number {
  return n1.price + ((n2.price - n1.price) * (time - times.t1)) / (times.t2 - times.t1);
}

/** Erste Kerze nach `from`, die mit dem Körper jenseits der Nackenlinie schließt (cs-Seite); null ohne solche (Docht allein zählt nicht) */
export function neckBreak(bars: Bars, cs: ZoneSide, n1: ObPoint, n2: ObPoint, from: number): number | null {
  const times = { t1: bars[n1.idx].time, t2: bars[n2.idx].time };
  for (let k = from + 1; k < bars.length; k++) if (closesBeyond(bars[k], necklineAt(times, n1, n2, bars[k].time), cs)) return k;
  return null;
}

/** `closes` aufeinanderfolgende Schlüsse jenseits von `edge` (cs-Seite) in den Kerzen `from`…`to` (TRD-17) */
export function closesInRowBeyond(bars: Bars, cs: ZoneSide, edge: number, span: { from: number; to: number; closes: number }): boolean {
  let run = 0;
  for (let k = span.from; k <= span.to; k++) {
    run = closesBeyond(bars[k], edge, cs) ? run + 1 : 0;
    if (run >= span.closes) return true;
  }
  return false;
}

/** Eine Kerze nach der rechten Schulter schließt jenseits ihrer Docht-Spitze (OBO-13) */
export function closedBeyondRs(bars: Bars, rs: ObPoint, es: ZoneSide): boolean {
  for (let k = rs.idx + 1; k < bars.length; k++) if (closesBeyond(bars[k], rs.price, es)) return true;
  return false;
}
