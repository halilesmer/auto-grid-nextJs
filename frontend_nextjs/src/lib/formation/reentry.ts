/**
 * Yeniden giriş (1114-A4.4): AB=CD, deren erster Handel TP1 und TP2 erreicht hat, und der Kurs kehrt danach in die Engulf-Zone am D zurück.
 * Reine Rechnung ohne Abhängigkeiten von der Anzeige; das Urteil, der Alarm und die Favoriten ändern sich nicht. Nur der Handelsblock zeigt es.
 *
 * Bedingung (Verkauf, Kauf gespiegelt):
 * - Es gibt eine Engulf-Zone der Handelsseite, die vor dem D entstand und die Kerze des D berührt.
 * - Keine Kerze seit der Zone hat über ihrer fernen Kante geschlossen (Kauf: darunter). Sonst ist die Zone verbraucht, es gibt nichts zu zeigen.
 * - TP1 und TP2 des ersten Handels sind erreicht, und eine spätere Kerze berührt die Zone: Wiedereinstieg.
 *   Ob der Rest einer Dritteilung (großes Ziel) noch offen oder schon geschlossen ist, spielt keine Rolle (Annahme).
 * - Ist nur TP1 erreicht (TP2 nicht), berührt der Kurs die Zone aber: keine Werte, nur der Hinweis `tp1Only`.
 *
 * Werte: Einstieg = nahe Kante der Zone (die Berührung); Stop = ferne Kante (gilt mit dem Kerzenschluss, der Not-SL kommt vom Aufrufer);
 * Ziel = nächste Gegenzone in Handelsrichtung ab dem Einstieg (dieselbe Wahl wie Ziel 1 der Erken dönüş). Keine Aufteilung, kein Stand danach.
 */
import { nearestEdgeFrom, type EarlyZone } from './earlyReversal';
import { zoneSideOf, type EngulfZone } from './sig';
import { touches } from './reasons';
import type { TradeStatus } from './tradeStatus';
import type { FormationBar, Side } from './types';

export type ReentryResult =
  | { kind: 'reentry'; /** Kerze der ersten Berührung nach TP2 */ idx: number; entry: number; stop: number; target: number | null }
  | { kind: 'tp1Only'; idx: number };

export function reentryOf(o: {
  bars: readonly FormationBar[];
  side: Side;
  /** Kerze des D (äußerster Docht) */
  dIdx: number;
  status: TradeStatus;
  engulfZones: readonly EngulfZone[];
  /** Fraktalzonen (auch gedrehte); die der Gegenseite liefern das Ziel */
  zones: readonly EarlyZone[];
}): ReentryResult | null {
  const { bars, side, status } = o;
  const sell = side === 'sell';
  const dBar = bars[o.dIdx];
  if (!dBar) return null;
  // TP1 und TP2 genommen → Wiedereinstieg zählt ab der Kerze nach TP2; nur TP1 → Hinweis ab der Kerze nach TP1
  const tp2Taken = status.tp2Fill !== undefined && status.tp2Idx !== undefined;
  const tp1Taken = status.tp1Fill !== undefined && status.stopMovedIdx !== undefined;
  let after: number | undefined;
  if (tp2Taken) after = status.tp2Idx;
  else if (tp1Taken) after = status.stopMovedIdx;
  if (after === undefined) return null;

  const far = (r: { top: number; bottom: number }) => (sell ? r.top : r.bottom);
  const out = (p: number) => (sell ? p : -p);
  const closedBeyond = (b: FormationBar, r: { top: number; bottom: number }) => out(b.close) > out(far(r));

  // Zonen der Handelsseite, die das D berührt; engste ferne Kante zuerst
  const candidates = o.engulfZones
    .filter((z) => z.side === side && z.idx < o.dIdx && touches(z.rect, dBar))
    .sort((p, q) => out(far(p.rect)) - out(far(q.rect)));

  for (const zone of candidates) {
    // Verbraucht: irgendeine Kerze seit der Zone hat jenseits der fernen Kante geschlossen
    if (bars.slice(zone.idx + 1).some((b) => closedBeyond(b, zone.rect))) continue;
    for (let k = after + 1; k < bars.length; k++) {
      if (!touches(zone.rect, bars[k])) continue;
      if (!tp2Taken) return { kind: 'tp1Only', idx: k };
      const entry = sell ? zone.rect.bottom : zone.rect.top;
      const opposing = o.zones.filter((z) => z.side === zoneSideOf(sell ? 'buy' : 'sell')).map((z) => z.rect);
      return { kind: 'reentry', idx: k, entry, stop: far(zone.rect), target: nearestEdgeFrom(opposing, entry, side) };
    }
  }
  return null;
}
