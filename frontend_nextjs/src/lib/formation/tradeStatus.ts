/**
 * Durum eines AB=CD-Handels nach dem Einstieg (1114-A4.2 Schritt b). Reine Rechnung: läuft die Kerzen nach der Einfrierkerze ab.
 * Gilt nur zur Anzeige, es gibt keine Order.
 *
 * Regeln:
 * - Der Stop gilt mit dem Schluss der Kerze, der Not-SL schon bei Docht-Berührung (wie im Handelsblock: „Stop (Schluss)“ und „Not-SL“).
 * - TP1 und TP2 laufen mit dem äußersten Docht; jede Kerze nutzt das Extrem bis zur VORIGEN Kerze (Fib `from → Extrem`).
 * - Stop und Ziel in einer Kerze zählen als Stop. Macht die Kerze ein neues Extrem, zählt keine Zielberührung dieser Kerze.
 * - Nach TP1 rückt der Stop auf den Einstieg (nie gegen die Position). Der Rest schließt dort, wenn eine Kerze über dem Einstieg
 *   schließt (gleiche Schlussregel; Annahme). Der Not-SL gilt nur vor TP1: danach ist der Stop am Einstieg maßgebend, ein Docht allein beendet nichts.
 * - TP1 und TP2 in einer Kerze zählen beide; schließt dieselbe Kerze aber jenseits des Einstiegs, gilt TP1 mit Rest am Einstieg.
 * - Großes AB=CD-Ziel (1114-A4.3, nur mit `big`): TP2 beendet den Handel nicht, das letzte Drittel steht weiter am Einstieg (der Stop rückt nicht weiter).
 *   Das Ziel läuft wie TP1 mit dem äußersten Docht, zählt aber erst, wenn eine Kerze in Gewinnrichtung jenseits von A schloss (Aktivierung;
 *   die Kerze der Aktivierung darf es selbst berühren: Annahme). Ein Schluss jenseits des Einstiegs beendet den Rest am Einstieg.
 */
import { fibPrice } from './trade';
import type { FormationBar, Side } from './types';

export type TradeStatusKind = 'open' | 'tp1' | 'tp12' | 'tp123' | 'stopped' | 'breakeven';

export interface TradeStatus {
  kind: TradeStatusKind;
  /** Der Stop, der jetzt gilt: Schluss-Stop, nach TP1 der Einstieg */
  stopNow: number;
  /** Index der Kerze, ab der der Stop auf dem Einstieg steht (TP1 erreicht) */
  stopMovedIdx?: number;
  /** Womit der Stop auslöste (nur `stopped`) */
  stopBy?: 'close' | 'wick';
  /** Index der Kerze, in der der Handel endete (Stop, Rest am Einstieg, TP2 oder mit großem Ziel dieses) */
  endIdx?: number;
  /** Preis, zu dem TP1 gezählt wurde (das mitlaufende TP1 der Kerze, in der es erreicht wurde); fehlt, solange TP1 nicht erreicht ist */
  tp1Fill?: number;
  /** Preis, zu dem TP2 gezählt wurde; fehlt, solange TP2 nicht erreicht ist */
  tp2Fill?: number;
  /** Index der Kerze, in der TP2 gezählt wurde (1114-A4.4: Wiedereinstieg zählt erst danach) */
  tp2Idx?: number;
  /** Preis, zu dem das große Ziel gezählt wurde (nur `tp123`) */
  bigFill?: number;
  /** Nur mit großem Ziel: eine Kerze hat jenseits von A geschlossen, das Ziel ist aktiv */
  bigActive?: boolean;
}

export function tradeStatusOf(o: {
  bars: FormationBar[];
  /** Einfrierkerze: der Einstieg; abgelaufen werden die Kerzen danach */
  entryIdx: number;
  side: Side;
  entry: number;
  stop: number;
  emergencyStop: number | null;
  /** Fib-Start der Ziele (C oder A) */
  from: number;
  targets: { tp1: number; tp2: number };
  /** Großes AB=CD-Ziel: Preis = äußerster Docht + `offset`; `activation` = A */
  big?: { offset: number; activation: number };
}): TradeStatus {
  const { bars, side, entry, stop, emergencyStop, from } = o;
  // Gegen die Position: Verkauf nach oben, Kauf nach unten
  const sell = side === 'sell';
  const against = (b: FormationBar) => (sell ? b.high : b.low);
  const toward = (b: FormationBar) => (sell ? b.low : b.high);
  const beyond = (price: number, level: number) => (sell ? price > level : price < level);
  /** Docht berührt den Not-SL (Verkauf: Hoch ≥ Not-SL) */
  const touchesEmergency = (price: number, level: number) => (sell ? price >= level : price <= level);
  const touchesTarget = (b: FormationBar, level: number) => (sell ? toward(b) <= level : toward(b) >= level);

  let ext = against(bars[o.entryIdx]);
  let kind: TradeStatusKind = 'open';
  let stopNow = stop;
  let stopMovedIdx: number | undefined;
  let tp1Fill: number | undefined;
  let tp2Fill: number | undefined;
  let tp2Idx: number | undefined;
  let bigFill: number | undefined;
  let bigActive = false;
  const status = (extra: Partial<TradeStatus> = {}): TradeStatus => ({
    kind,
    stopNow,
    ...(stopMovedIdx === undefined ? {} : { stopMovedIdx }),
    ...(tp1Fill === undefined ? {} : { tp1Fill }),
    ...(tp2Fill === undefined ? {} : { tp2Fill }),
    ...(tp2Idx === undefined ? {} : { tp2Idx }),
    ...(bigFill === undefined ? {} : { bigFill }),
    ...(o.big ? { bigActive } : {}),
    ...extra,
  });

  for (let k = o.entryIdx + 1; k < bars.length; k++) {
    const b = bars[k];
    const newExtreme = beyond(against(b), ext);
    const tp1 = fibPrice(from, ext, o.targets.tp1);
    const tp2 = fibPrice(from, ext, o.targets.tp2);
    // Schluss jenseits von A in Gewinnrichtung aktiviert das große Ziel (bleibt aktiv)
    if (o.big && (sell ? b.close < o.big.activation : b.close > o.big.activation)) bigActive = true;
    let justTp1 = false;
    if (kind === 'open') {
      if (beyond(b.close, stop)) return status({ kind: 'stopped', stopBy: 'close', endIdx: k });
      if (emergencyStop !== null && touchesEmergency(against(b), emergencyStop)) {
        return status({ kind: 'stopped', stopBy: 'wick', endIdx: k });
      }
      if (!newExtreme && touchesTarget(b, tp1)) {
        kind = 'tp1';
        tp1Fill = tp1;
        stopNow = entry;
        stopMovedIdx = k;
        justTp1 = true;
        // Dieselbe Kerze: schließt sie jenseits des Einstiegs, ist der Rest am Einstieg ausgestoppt; sonst zählt TP2, falls berührt
        if (beyond(b.close, entry)) return status({ kind: 'breakeven', endIdx: k });
      }
    }
    if (kind !== 'open') {
      if (!justTp1 && beyond(b.close, entry)) return status({ kind: 'breakeven', endIdx: k });
      if (kind === 'tp1' && !newExtreme && touchesTarget(b, tp2)) {
        tp2Fill = tp2;
        tp2Idx = k;
        kind = 'tp12';
        // Ohne großes Ziel beendet TP2 den Handel
        if (!o.big) return status({ kind: 'tp12', endIdx: k });
      }
      if (o.big && kind === 'tp12' && bigActive && !newExtreme && touchesTarget(b, ext + o.big.offset)) {
        bigFill = ext + o.big.offset;
        return status({ kind: 'tp123', endIdx: k });
      }
    }
    if (newExtreme) ext = against(b);
  }
  return status();
}
