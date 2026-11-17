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
 * Ziel (1) = nächste Gegenzone in Handelsrichtung ab dem Einstieg (dieselbe Wahl wie Ziel 1 der Erken dönüş). Keine Aufteilung, kein Stand danach.
 * Ziel 2 = „letzte Tief-/Hochzone“: der äußerste Kurs (Verkauf: tiefstes Tief, Kauf: höchstes Hoch) vom Einstiegskerze des ersten Handels bis zur Berührungskerze;
 * die Gegenzonen, die die Kerze dieses Extrems berührt, liefern ihre nahe Kante; bei mehreren gilt die vom Einstieg am weitesten entfernte (Annahme).
 * Ist es dieselbe Kante wie Ziel 1, keine Zone am Extrem oder kein Ziel 1, bleibt Ziel 2 leer.
 */
import { emitDiag } from './diag';
import { nearestEdgeFrom, type EarlyZone } from './earlyReversal';
import { zoneSideOf, type EngulfZone } from './sig';
import { touches } from './reasons';
import type { TradeStatus } from './tradeStatus';
import type { FormationBar, Side } from './types';

export type ReentryResult =
  | { kind: 'reentry'; /** Kerze der ersten Berührung nach TP2 */ idx: number; entry: number; stop: number; target: number | null; /** Ziel 2 (letzte Tief-/Hochzone) */ target2: number | null }
  | { kind: 'tp1Only'; idx: number };

interface ReentryInput {
  bars: readonly FormationBar[];
  side: Side;
  /** Kerze des D (äußerster Docht) */
  dIdx: number;
  /** Kerze des Einstiegs des ersten Handels */
  entryIdx: number;
  status: TradeStatus;
  engulfZones: readonly EngulfZone[];
  /** Fraktalzonen (auch gedrehte); die der Gegenseite liefern das Ziel */
  zones: readonly EarlyZone[];
  /** Nur Tanı (diag.ts): Aday-Schlüssel; ohne Wirkung auf das Ergebnis */
  diagKey?: string;
}

export function reentryOf(o: ReentryInput): ReentryResult | null {
  // Tanı (diag.ts): Ausgang je Aufruf; ändert das Ergebnis nicht
  let exit = 'noDBar';
  const r = reentryRun(o, (e) => {
    exit = e;
  });
  if (o.diagKey !== undefined) emitDiag({ fn: 'reentry', key: o.diagKey, step: exit });
  return r;
}

function reentryRun(o: ReentryInput, mark: (exit: string) => void): ReentryResult | null {
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
  if (after === undefined) {
    mark('noTpIdx');
    return null;
  }

  const far = (r: { top: number; bottom: number }) => (sell ? r.top : r.bottom);
  const out = (p: number) => (sell ? p : -p);
  const closedBeyond = (b: FormationBar, r: { top: number; bottom: number }) => out(b.close) > out(far(r));

  // Zonen der Handelsseite, die das D berührt; engste ferne Kante zuerst
  const candidates = o.engulfZones
    .filter((z) => z.side === side && z.idx < o.dIdx && touches(z.rect, dBar))
    .sort((p, q) => out(far(p.rect)) - out(far(q.rect)));

  mark(candidates.length === 0 ? 'noZoneAtD' : 'allZonesConsumed');
  for (const zone of candidates) {
    // Verbraucht: irgendeine Kerze seit der Zone hat jenseits der fernen Kante geschlossen
    if (bars.slice(zone.idx + 1).some((b) => closedBeyond(b, zone.rect))) continue;
    mark('noTouchAfterTp');
    for (let k = after + 1; k < bars.length; k++) {
      if (!touches(zone.rect, bars[k])) continue;
      if (!tp2Taken) {
        mark('tp1Only');
        return { kind: 'tp1Only', idx: k };
      }
      mark('reentry');
      const entry = sell ? zone.rect.bottom : zone.rect.top;
      const opposing = o.zones.filter((z) => z.side === zoneSideOf(sell ? 'buy' : 'sell')).map((z) => z.rect);
      const target = nearestEdgeFrom(opposing, entry, side);
      return { kind: 'reentry', idx: k, entry, stop: far(zone.rect), target, target2: target === null ? null : lastExtremeEdge(bars, o.entryIdx, k, side, opposing, entry, target) };
    }
  }
  return null;
}

/** Ziel 2: nahe Kante der Gegenzone am äußersten Kurs zwischen Einstiegs- und Berührungskerze (inklusive); null, wenn keine oder dieselbe Kante wie Ziel 1 */
function lastExtremeEdge(bars: readonly FormationBar[], from: number, to: number, side: Side, opposing: readonly { top: number; bottom: number }[], entry: number, target1: number): number | null {
  const sell = side === 'sell';
  let ext = bars[from];
  if (!ext) return null;
  for (let i = from + 1; i <= to; i++) if (sell ? bars[i].low < ext.low : bars[i].high > ext.high) ext = bars[i];
  const gain = (p: number) => (sell ? entry - p : p - entry);
  const edges = opposing.filter((r) => touches(r, ext)).map((r) => (sell ? r.top : r.bottom)).filter((p) => gain(p) > 0);
  if (edges.length === 0) return null;
  const far = edges.reduce((a, b) => (gain(a) >= gain(b) ? a : b));
  return far === target1 ? null : far;
}
