/**
 * Signale (SIG): Bausteine als reine Funktionen über geschlossene Kerzen: RSI-Extrem, Divergenz im Wave zwischen
 * Trendextremen, Engulf mit Engulf-Zone, Testere und das Zusammenfassen von Kerzen. Es fließen nur Kerzen der
 * übergebenen Liste ein (FormationContext.view), also kein Blick in die Zukunft.
 */
import { outward, wickEnd, type Rect, type ZoneSide } from './frz';
import { RSI_PARAMS, SIG_PARAMS } from './params';
import type { Pivot, TrendModel } from './trd';
import type { FormationBar, Side } from './types';

type Bars = readonly FormationBar[];
type Flags = readonly (boolean | null)[];

/** RSI-Extrem in Trade-Richtung (SIG-02): Verkauf ≥ 80, Kauf ≤ 20 */
export const rsiExtreme = (value: number | null, side: Side): boolean | null => {
  if (value === null) return null;
  return side === 'sell' ? value >= RSI_PARAMS.overbought : value <= RSI_PARAMS.oversold;
};

/** Seite der Zone, die eine Verkaufs- bzw. Kaufabsicht betrifft: Verkauf am Widerstand, Kauf an der Unterstützung */
export const zoneSideOf = (side: Side): ZoneSide => (side === 'sell' ? 'resistance' : 'support');
export const tradeSideOf = (side: ZoneSide): Side => (side === 'resistance' ? 'sell' : 'buy');

export interface DivPoint {
  idx: number;
  price: number;
  /** größter (Hoch) bzw. kleinster (Tief) Wave-Wert zwischen Start und Ende derselben Bewegung (SIG-14) */
  wave: number | null;
  /** Punkt ist ein Wendepunkt des Trendzugs (SIG-12) */
  pivot: boolean;
}

export interface Divergence {
  side: ZoneSide;
  a: DivPoint;
  b: DivPoint;
  /** Preis des zweiten Punkts liegt weiter außen als der des ersten */
  priceBeyond: boolean;
  /** SIG-13: Wave strikt schwächer */
  strict: boolean;
  /** SIG-14: Wave schwächer oder gleich */
  tie: boolean;
}

function pointAt(trend: TrendModel, side: ZoneSide, idx: number): DivPoint {
  const { pivots, bars, wave } = trend;
  const pos = pivots.findIndex((p) => p.idx === idx && p.side === side);
  const before = [...pivots].reverse().find((p) => p.idx < idx && p.side !== side);
  const from = before ? before.idx : 0;
  let best: number | null = null;
  for (let k = from; k <= idx; k++) {
    const w = wave[k];
    if (w === null) continue;
    if (best === null || outward(side, w) > outward(side, best)) best = w;
  }
  return { idx, price: wickEnd(bars[idx], side), wave: best, pivot: pos >= 0 };
}

/**
 * Divergenz zwischen zwei Punkten einer Seite (SIG-13, SIG-14). Ohne Angabe: die letzten zwei Rekord-Extrempunkte dieser Seite (SIG-12: Enden der Trendbewegungen, nicht innere Hochs).
 * null, wenn es keine zwei Punkte gibt.
 */
export function divergenceOf(trend: TrendModel, side: ZoneSide, idxA?: number, idxB?: number): Divergence | null {
  let a = idxA;
  let b = idxB;
  if (a === undefined || b === undefined) {
    // Impuls-Extrempunkte sind die Rekorde: jeder liegt weiter außen als alle Wendepunkte dieser Seite davor
    const records = (list: readonly Pivot[]) =>
      list.filter((p, i) => p.side === side && list.slice(0, i).every((q) => q.side !== side || outward(side, p.price) > outward(side, q.price)));
    let own = records(trend.pivots);
    // Verdeckt ein alter Rekord vor dem Trendwechsel die neuen Enden (weniger als zwei Rekorde), zählt die laufende Struktur ab dem Ursprung
    if (own.length < 2) own = records(trend.pivots.slice(trend.originPos));
    if (own.length < 2) return null;
    a = own[own.length - 2].idx;
    b = own[own.length - 1].idx;
  }
  const pa = pointAt(trend, side, a);
  const pb = pointAt(trend, side, b);
  const priceBeyond = outward(side, pb.price) > outward(side, pa.price);
  const weaker = pa.wave !== null && pb.wave !== null ? outward(side, pb.wave) - outward(side, pa.wave) : null;
  return {
    side,
    a: pa,
    b: pb,
    priceBeyond,
    strict: priceBeyond && weaker !== null && weaker < 0,
    tie: priceBeyond && weaker !== null && weaker <= 0,
  };
}

export interface Engulf {
  side: Side;
  /** letzte Kerze des Engulf */
  idx: number;
  /** umschlossene Kerze */
  prevIdx: number;
  /** 1 oder 2 Kerzen (SIG-25) */
  count: 1 | 2;
  /** Engulf-Zone (SIG-27) */
  zone: Rect;
  /** umschlossene Kerze volumenstark (SIG-24) */
  prevWide: boolean | null;
  /** alle Engulf-Kerzen volumenstark (SIG-25) */
  engulfWide: boolean | null;
}

const bullish = (b: FormationBar): boolean => b.close > b.open;
const bearish = (b: FormationBar): boolean => b.close < b.open;
const all = (flags: (boolean | null)[]): boolean | null => (flags.some((f) => f === null) ? null : flags.every(Boolean));

/** Engulf mit der Kerze k als letzter Kerze (SIG-23, SIG-25); Maßstab ist das Docht-Extrem der umschlossenen Kerze */
export function engulfAt(bars: Bars, wide: Flags, k: number, side: Side, maxBars: 1 | 2 = 2): Engulf | null {
  const buy = side === 'buy';
  const dirOk = (b: FormationBar) => (buy ? bullish(b) : bearish(b));
  const opp = (b: FormationBar) => (buy ? bearish(b) : bullish(b));
  const beyond = (close: number, ref: FormationBar) => (buy ? close > ref.high : close < ref.low);
  const zoneOf = (open: number, tip: number): Rect => ({ top: Math.max(open, tip), bottom: Math.min(open, tip) });
  const tipOf = (list: FormationBar[]) => (buy ? Math.min(...list.map((b) => b.low)) : Math.max(...list.map((b) => b.high)));
  if (k >= 1 && dirOk(bars[k]) && opp(bars[k - 1]) && beyond(bars[k].close, bars[k - 1])) {
    return {
      side,
      idx: k,
      prevIdx: k - 1,
      count: 1,
      zone: zoneOf(bars[k - 1].open, tipOf([bars[k]])),
      prevWide: wide[k - 1],
      engulfWide: wide[k],
    };
  }
  if (maxBars === 2 && k >= 2 && dirOk(bars[k]) && dirOk(bars[k - 1]) && opp(bars[k - 2]) && beyond(bars[k].close, bars[k - 2])) {
    return {
      side,
      idx: k,
      prevIdx: k - 2,
      count: 2,
      zone: zoneOf(bars[k - 2].open, tipOf([bars[k - 1], bars[k]])),
      prevWide: wide[k - 2],
      engulfWide: all([wide[k - 1], wide[k]]),
    };
  }
  return null;
}

export interface EngulfZone {
  side: Side;
  idx: number;
  rect: Rect;
  /** Engulf-Kerze volumenstark („großer“ Engulf, SIG-31) */
  big: boolean;
  /** kein späterer Schluss jenseits der Zone */
  holds: boolean;
}

/** Engulf-Zonen der Kerzenliste (SIG-27): Engulf mit volumenstarker umschlossener Kerze (SIG-24) */
export function engulfZones(bars: Bars, wide: Flags): EngulfZone[] {
  const out: EngulfZone[] = [];
  for (let k = 1; k < bars.length; k++) {
    for (const side of ['buy', 'sell'] as const) {
      const e = engulfAt(bars, wide, k, side, 1);
      if (!e || e.prevWide !== true) continue;
      let holds = true;
      for (let j = k + 1; j < bars.length; j++) {
        if (side === 'sell' ? bars[j].close > e.zone.top : bars[j].close < e.zone.bottom) holds = false;
      }
      out.push({ side, idx: k, rect: e.zone, big: e.engulfWide === true, holds });
    }
  }
  return out;
}

/** Testere (SIG-43): die Kerze k umschließt die Engulf-Kerze k−1 der Gegenrichtung und ist volumenstark */
export function sawAt(bars: Bars, wide: Flags, k: number, side: Side): { wickShare: number } | null {
  if (k < 2 || wide[k] !== true) return null;
  const e = engulfAt(bars, wide, k, side, 1);
  if (!e) return null;
  const earlier = engulfAt(bars, wide, k - 1, side === 'buy' ? 'sell' : 'buy', 1);
  if (!earlier) return null;
  const b = bars[k];
  const span = b.high - b.low;
  // Docht jenseits des Schlusses in Richtung der Testere (SIG-44)
  const wick = side === 'buy' ? b.high - b.close : b.close - b.low;
  return { wickShare: span === 0 ? 0 : wick / span };
}

/**
 * Kerzen zusammenfassen (SIG-46): je `toSec`-Raster die vollständigen Gruppen aus `fromSec`-Kerzen.
 * Eröffnung = erste, Schluss = letzte, High/Low = Extreme. Unvollständige Gruppen fehlen (erst nach Schluss der letzten Kerze).
 */
export function mergeBars(bars: Bars, fromSec: number, toSec: number): FormationBar[] {
  if (toSec / fromSec !== SIG_PARAMS.mergeBars) throw new Error('Kerzen zusammenfassen: nur 4 Kerzen je Gruppe');
  const groups = new Map<number, FormationBar[]>();
  for (const b of bars) {
    const key = Math.floor(b.time / toSec) * toSec;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const out: FormationBar[] = [];
  for (const [time, list] of groups) {
    if (list.length !== SIG_PARAMS.mergeBars) continue;
    out.push({
      time,
      open: list[0].open,
      high: Math.max(...list.map((b) => b.high)),
      low: Math.min(...list.map((b) => b.low)),
      close: list[list.length - 1].close,
    });
  }
  return out;
}

/** Länge des Laufs wahrer Werte am Ende der Reihe */
export function trailingRun(flags: Flags): number {
  let n = 0;
  for (let k = flags.length - 1; k >= 0 && flags[k] === true; k--) n++;
  return n;
}
