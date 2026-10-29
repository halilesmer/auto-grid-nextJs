/**
 * Linienformationen (T618, ENC, KEI): gemeinsame Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * `es` ist die Seite des Extrems in Trendrichtung (Aufwärtstrend: Widerstand, Hochs), `cs` die Gegenseite. Die Gegenlinie läuft durch
 * die Startpunkte der letzten 2 Impulse: zwei Wendepunkte von `cs` des Trendzugs (TRD-34/TRD-35). Es fließen nur Kerzen der übergebenen Liste ein, also nur
 * geschlossene Kerzen bis t. Preise laufen über `outward(Seite, Preis)`: Verkauf (Aufwärtstrend) und Kauf (Abwärtstrend) sind derselbe Code.
 */
import { closesBeyond, otherSide, outward, wickEnd, type ZoneSide } from './frz';
import { alternatingCount, lineAt, type Touch } from './tdf';
import type { Pivot, TrendModel } from './trd';
import type { FormationBar, Side } from './types';

type Bars = readonly FormationBar[];

/** Seite der Zone des Extrems in Trendrichtung → Handelsrichtung der Wende (Aufwärtstrend: Verkauf) */
export const reversalSide = (es: ZoneSide): Side => (es === 'resistance' ? 'sell' : 'buy');

/** Rundungsspielraum für Preise, die genau auf einer Linie liegen (weit unter einem Kurspunkt, keine Toleranz nach TRD-40) */
const EPS = 1e-9;

/** Die letzten `count` Längen werden jeweils kürzer (TRD-24); null bei zu wenigen Längen */
export function shrinks(lens: readonly number[], count: number): boolean | null {
  if (lens.length < count) return null;
  const tail = lens.slice(-count);
  return tail.every((x, i) => i === 0 || x < tail[i - 1]);
}

/** Züge der Wendepunkte von `side` vor Kerze `before` (ohne den Startpunkt), alt → neu */
export function legLens(pivots: readonly Pivot[], side: ZoneSide, before: number): number[] {
  return pivots.filter((p) => p.side === side && p.len > 0 && p.idx < before).map((p) => p.len);
}

/** Linie durch zwei Punkte, zur Kerze k; nach beiden Seiten verlängert */
export const lineAtBar = (bars: Bars, a: Pivot | { idx: number; price: number }, b: Pivot | { idx: number; price: number }, k: number): number =>
  lineAt(bars, a, b, bars[k].time);

/** Erste Kerze nach `from`, die mit dem Körper jenseits der Linie der Seite `side` schließt (Docht allein zählt nicht) */
export function firstCloseBeyond(bars: Bars, side: ZoneSide, levelAt: (k: number) => number, from: number): number | null {
  for (let k = from + 1; k < bars.length; k++) if (closesBeyond(bars[k], levelAt(k), side)) return k;
  return null;
}

// ---- Kanal / Keil -----------------------------------------------------------------------------------------------

/**
 * Fünf aufeinanderfolgende Wendepunkte: Tief l0, Impulsende hs (Beginn der Zählung), Tief la, zweites Extrem h2, zweites Tief lb.
 * Die Trendlinie läuft durch l0 und la (Startpunkte der letzten 2 Impulse); lb ist die zweite Berührung unten.
 */
export interface ChannelBase {
  es: ZoneSide;
  l0: Pivot;
  hs: Pivot;
  la: Pivot;
  h2: Pivot;
  lb: Pivot;
}

/** Kandidaten aus den letzten Wendepunkten des Trendzugs, jüngster zuerst; beide Richtungen */
export function channelBases(model: TrendModel, maxStarts: number): ChannelBase[] {
  const pv = model.pivots;
  const out: ChannelBase[] = [];
  for (let j = pv.length - 5; j >= 0 && out.length < maxStarts; j--) {
    out.push({ es: pv[j + 1].side, l0: pv[j], hs: pv[j + 1], la: pv[j + 2], h2: pv[j + 3], lb: pv[j + 4] });
  }
  return out;
}

export type ChannelKind = 'parallel' | 'wedge';

export interface Channel {
  base: ChannelBase;
  /** Linie der Gegenseite durch l0 und la (Trendlinie nach TRD-34/TRD-35; die Anker sind rohe Dochtspitzen, ohne den Spike-Ersatz TRD-36 und ohne die Wartezeit auf den zweiten Impuls) */
  counterAt: (k: number) => number;
  /** Gegenlinie: Kopie der Trendlinie am äußersten Extrem (Kanal) bzw. Linie durch hs und h2 (Keil) */
  extremeAt: (k: number) => number;
  /** erster Schluss jenseits der Trendlinie nach hs (Aktivierung); null ohne solchen */
  act: number | null;
  /** letzte Kerze der Zählung: vor der Aktivierung, sonst die letzte */
  end: number;
  count: { top: number; bottom: number };
  /** Kerze der letzten Berührung der Zählung */
  lastTouch: number | null;
}

/** Senkrechter Abstand der beiden Linien an Kerze k */
export const widthAt = (c: Channel, k: number): number => Math.abs(c.extremeAt(k) - c.counterAt(k));

/**
 * Misst Linien, Aktivierung und die abwechselnd gezählten Berührungen ab hs (TDF-28, TRD-40). Berührung: der Docht erreicht die Linie,
 * der Schluss liegt nicht jenseits. Beide Linien haben keine Pip- oder ATR-Toleranz.
 */
export function measureChannel(bars: Bars, base: ChannelBase, kind: ChannelKind): Channel {
  const { es, l0, hs, la, h2 } = base;
  const cs = otherSide(es);
  const counterAt = (k: number) => lineAtBar(bars, l0, la, k);
  let extremeAt: (k: number) => number;
  if (kind === 'wedge') {
    extremeAt = (k) => lineAtBar(bars, hs, h2, k);
  } else {
    const offset = Math.max(...[hs, h2].map((p) => outward(es, p.price) - outward(es, counterAt(p.idx))));
    extremeAt = (k) => (es === 'resistance' ? counterAt(k) + offset : counterAt(k) - offset);
  }
  const act = firstCloseBeyond(bars, cs, counterAt, hs.idx);
  const end = act === null ? bars.length - 1 : act - 1;
  const touches: Touch[] = [];
  for (let k = hs.idx; k <= end; k++) {
    const b = bars[k];
    const up = extremeAt(k);
    const lo = counterAt(k);
    const slack = EPS * Math.max(1, Math.abs(up));
    if (outward(es, wickEnd(b, es)) >= outward(es, up) - slack && !closesBeyond(b, up, es)) touches.push({ idx: k, top: true });
    if (outward(cs, wickEnd(b, cs)) >= outward(cs, lo) - slack && !closesBeyond(b, lo, cs)) touches.push({ idx: k, top: false });
  }
  const count = alternatingCount(touches);
  const lastTouch = touches.length > 0 ? Math.max(...touches.map((t) => t.idx)) : null;
  return { base, counterAt, extremeAt, act, end, count, lastTouch };
}

/** Beide Linien zeigen in Trendrichtung (Aufwärtstrend: beide steigen) */
export const slopesWithTrend = (c: Channel): { counter: boolean; extreme: boolean } => {
  const { es, l0, hs, la, h2 } = c.base;
  return { counter: outward(es, la.price - l0.price) > 0, extreme: outward(es, h2.price - hs.price) > 0 };
};
