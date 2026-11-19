/**
 * Erken dönüş (1114-A4.5): AB=CD, bei der D das Level 1 nicht erreicht, aber vorher in einer Zone der Handelsseite mit einer
 * Engulf-Kerze in Handelsrichtung dreht. Reine Rechnung ohne Abhängigkeiten von der Anzeige; das Urteil bleibt „im Aufbau“,
 * die Prüfliste, der Alarm und die Favoriten ändern sich nicht. Nur der Handelsblock zeigt einen eigenen Zustand.
 *
 * Bedingung (Verkauf, Kauf gespiegelt):
 * - D hat die Ausdehnung −0.272 (ABCD-06) erreicht, aber Level 1 nicht (auch nicht mit der Toleranz von ABCD-08).
 * - Im Band zwischen −0.272 und Level 1 liegt eine Fraktalzone oder Engulf-Zone der Handelsseite, und die Kerze des D berührt sie.
 * - Bei oder nach dem D schließt eine Engulf-Kerze in Handelsrichtung (`engulfAt`, wie ABCD-20), deren Kerzen die Zone berühren.
 *   Gesucht wird in der Zeiteinheit der Formation und in der nächstkleineren (SIG-28, wie ABCD-20; 1119-A35.1.1); gilt der erste
 *   Engulf, der zeitlich zuerst schließt. Ohne Ansicht der kleineren Zeiteinheit gilt nur die Formations-Zeiteinheit.
 *
 * Werte: Einstieg = Schluss der Engulf-Kerze; Stop = ferne Kante der Zone (gilt mit dem Kerzenschluss);
 * Ziel 1 = nächste Zone der Gegenseite in Handelsrichtung ab dem Einstieg (nahe Kante); Ziel 2 = Zone am Punkt C (nahe Kante).
 */
import { extensionPrice, type AbcdShape } from './abcd';
import { emitDiag } from './diag';
import { outward, type Rect, type ZoneSide } from './frz';
import { ABCD_PARAMS } from './params';
import { touches } from './reasons';
import { engulfAt, zoneSideOf, type EngulfZone } from './sig';
import type { FormationBar, Side } from './types';

/**
 * Nahe Kante der Gegenzone, die vom Einstieg aus in Handelsrichtung am nächsten liegt (Gewinn > 0); null ohne solche Zone.
 * Gemeinsam für Erken dönüş (Ziel 1, Ziel 2) und den Wiedereinstieg (1114-A4.4).
 */
export function nearestEdgeFrom(rects: readonly Rect[], entry: number, side: Side): number | null {
  const sell = side === 'sell';
  const gain = (price: number) => (sell ? entry - price : price - entry);
  const edges = rects.map((r) => (sell ? r.top : r.bottom)).filter((p) => gain(p) > 0);
  return edges.length === 0 ? null : edges.reduce((a, b) => (gain(a) <= gain(b) ? a : b));
}

/** Fraktalzone (auch gedrehte) zur Anzeige; mehr braucht die Rechnung nicht */
export interface EarlyZone {
  side: ZoneSide;
  rect: Rect;
  /** Öffnungszeiten der Fraktalkerzen der Zone; eine Zone, die erst das D bildet, zählt nicht als Ort des D (wie ABCD-10) */
  fractalTimes?: readonly number[];
}

export interface EarlyReversal {
  /** Index der Engulf-Kerze (Einstieg); bei einem Engulf der kleineren Zeiteinheit der Index der Formationskerze, in der er schließt */
  idx: number;
  /** Öffnungszeit der Engulf-Kerze in ihrer eigenen Zeiteinheit */
  time: number;
  /** Der Engulf liegt in der nächstkleineren Zeiteinheit (SIG-28) */
  lower: boolean;
  entry: number;
  /** Ferne Kante der Zone, in der das D wendet */
  stop: number;
  /** Nahe Kante der nächsten Gegenzone in Handelsrichtung; null ohne Zone */
  target1: number | null;
  /** Nahe Kante der Zone am Punkt C, hinter Ziel 1; null ohne solche Zone */
  target2: number | null;
  /** Preisstrecke vom äußersten Docht bis Level 1 */
  gap: number;
}

interface EarlyInput {
  bars: readonly FormationBar[];
  wide: readonly (boolean | null)[];
  s: AbcdShape;
  /** D gilt als erreicht (Level 1 mit Toleranz): dann gilt der normale Einstieg */
  reached: boolean;
  zones: readonly EarlyZone[];
  engulfZones: readonly EngulfZone[];
  /** Sekunden einer Formationskerze; nur nötig, wenn `lower` gesetzt ist */
  sec?: number;
  /** Nächstkleinere Zeiteinheit (wie ABCD-20); ohne sie sucht der Engulf nur in der Formations-Zeiteinheit */
  lower?: { bars: readonly FormationBar[]; wide: readonly (boolean | null)[]; sec: number };
}

export function earlyReversalOf(o: EarlyInput): EarlyReversal | null {
  // Tanı (diag.ts): tiefste erreichte Stufe 3–8 je Aufruf; ändert das Ergebnis nicht
  let deep = 2;
  const r = earlyReversalRun(o, (n) => {
    if (n > deep) deep = n;
  });
  if (o.s.d && !o.reached) emitDiag({ fn: 'early', key: `${o.s.side}|${o.bars[o.s.a.idx]?.time}|${o.bars[o.s.b.idx]?.time}|${o.bars[o.s.c.idx]?.time}`, step: r ? 8 : deep });
  return r;
}

function earlyReversalRun(o: EarlyInput, mark: (n: number) => void): EarlyReversal | null {
  const { bars, s } = o;
  const { d, es, side } = s;
  if (o.reached || !d || s.len === 0) return null;
  const out = (p: number) => outward(es, p);
  const ext = extensionPrice(s, ABCD_PARAMS.minExtension);
  // Band −0.272 … Level 1 und Ausdehnung des D
  if (!(out(ext) < out(s.level1)) || out(d.price) < out(ext)) return null;
  mark(3);
  const lo = Math.min(ext, s.level1);
  const hi = Math.max(ext, s.level1);
  const tipBar = bars[d.idx];

  const sell = side === 'sell';
  const far = (r: Rect) => (sell ? r.top : r.bottom);
  const gain = (entry: number, price: number) => (sell ? entry - price : price - entry);

  // Zonen der Handelsseite im Band, die das D berührt; engste ferne Kante zuerst
  const own: Rect[] = [
    ...o.zones.filter((z) => z.side === zoneSideOf(side) && !(z.fractalTimes && z.fractalTimes.every((ft) => ft >= tipBar.time))).map((z) => z.rect),
    ...o.engulfZones.filter((z) => z.holds && z.side === side && z.idx < d.idx).map((z) => z.rect),
  ]
    .filter((r) => r.bottom <= hi && r.top >= lo && touches(r, tipBar))
    .sort((p, q) => out(far(p)) - out(far(q)));

  if (own.length > 0) mark(4);
  // Erste passende Engulf-Kerze ab der D-Kerze in einer Zeiteinheit; Rückgabe mit Schlusszeit für den zeitlichen Vergleich
  const scan = (zone: Rect, sb: readonly FormationBar[], wide: readonly (boolean | null)[], sec: number, from: number) => {
    for (let k = Math.max(from, 1); k < sb.length; k++) {
      const e = engulfAt(sb, wide, k, side);
      if (!e) continue;
      mark(5);
      // Wie ABCD-20: eine nicht volumenstarke Kerze verwirft den Engulf; unbekannte Stärke zählt nicht
      if ([e.prevWide, ...(e.count === 2 ? [e.engulfWide] : [])].some((w) => w !== true)) continue;
      mark(6);
      if (!sb.slice(e.prevIdx, e.idx + 1).some((b) => touches(zone, b))) continue;
      mark(7);
      // Stop jenseits des Einstiegs: sonst ist dieser Engulf ungültig, die Suche geht in derselben Zone weiter
      if (!(out(far(zone)) > out(sb[k].close))) continue;
      return { k, close: sb[k].time + sec, bar: sb[k] };
    }
    return null;
  };
  const lowerFrom = o.lower ? o.lower.bars.findIndex((b) => b.time >= tipBar.time) : -1;
  for (const zone of own) {
    const own1 = scan(zone, bars, o.wide, o.sec ?? 0, d.idx);
    const low = o.lower && o.sec !== undefined && lowerFrom >= 0 ? scan(zone, o.lower.bars, o.lower.wide, o.lower.sec, lowerFrom) : null;
    const lowHit = low ? { ...low, lower: true, idx: Math.max(0, bars.findLastIndex((b) => b.time < low.close)) } : null;
    const ownHit = own1 ? { ...own1, lower: false, idx: own1.k } : null;
    const hit = ownHit && (!lowHit || ownHit.close <= lowHit.close) ? ownHit : lowHit;
    if (!hit) continue;
    {
      const entry = hit.bar.close;
      const stop = far(zone);
      const opposing = o.zones.filter((z) => z.side === zoneSideOf(sell ? 'buy' : 'sell'));
      const nearestFrom = (rects: Rect[]): number | null => nearestEdgeFrom(rects, entry, side);
      const target1 = nearestFrom(opposing.map((z) => z.rect));
      // Ziel 2 liegt hinter Ziel 1; dieselbe Zone zweimal zu zeigen hilft nicht
      const beyond1 = (r: Rect) => target1 !== null && gain(entry, sell ? r.top : r.bottom) > gain(entry, target1);
      const target2 = target1 === null ? null : nearestFrom(opposing.filter((z) => touches(z.rect, bars[s.c.idx]) && beyond1(z.rect)).map((z) => z.rect));
      const gap = Math.max(0, out(s.level1) - out(d.price));
      return { idx: hit.idx, time: hit.bar.time, lower: hit.lower, entry, stop, target1, target2, gap };
    }
  }
  return null;
}
