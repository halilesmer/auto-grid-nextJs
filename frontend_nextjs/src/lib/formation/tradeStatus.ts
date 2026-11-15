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
 */
import { fibPrice } from './trade';
import type { FormationBar, Side } from './types';

export type TradeStatusKind = 'open' | 'tp1' | 'tp12' | 'stopped' | 'breakeven';

export interface TradeStatus {
  kind: TradeStatusKind;
  /** Der Stop, der jetzt gilt: Schluss-Stop, nach TP1 der Einstieg */
  stopNow: number;
  /** Index der Kerze, ab der der Stop auf dem Einstieg steht (TP1 erreicht) */
  stopMovedIdx?: number;
  /** Womit der Stop auslöste (nur `stopped`) */
  stopBy?: 'close' | 'wick';
  /** Index der Kerze, in der der Handel endete (Stop, Rest am Einstieg oder TP2) */
  endIdx?: number;
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
  const status = (extra: Partial<TradeStatus> = {}): TradeStatus => ({ kind, stopNow, ...(stopMovedIdx === undefined ? {} : { stopMovedIdx }), ...extra });

  for (let k = o.entryIdx + 1; k < bars.length; k++) {
    const b = bars[k];
    const newExtreme = beyond(against(b), ext);
    const tp1 = fibPrice(from, ext, o.targets.tp1);
    const tp2 = fibPrice(from, ext, o.targets.tp2);
    if (kind === 'open') {
      if (beyond(b.close, stop)) return status({ kind: 'stopped', stopBy: 'close', endIdx: k });
      if (emergencyStop !== null && touchesEmergency(against(b), emergencyStop)) {
        return status({ kind: 'stopped', stopBy: 'wick', endIdx: k });
      }
      if (!newExtreme && touchesTarget(b, tp1)) {
        kind = 'tp1';
        stopNow = entry;
        stopMovedIdx = k;
        // Dieselbe Kerze: schließt sie jenseits des Einstiegs, ist der Rest am Einstieg ausgestoppt; sonst zählt TP2, falls berührt
        if (beyond(b.close, entry)) return status({ kind: 'breakeven', endIdx: k });
        if (touchesTarget(b, tp2)) return status({ kind: 'tp12', endIdx: k });
      }
    } else {
      if (beyond(b.close, entry)) return status({ kind: 'breakeven', endIdx: k });
      if (!newExtreme && touchesTarget(b, tp2)) return status({ kind: 'tp12', endIdx: k });
    }
    if (newExtreme) ext = against(b);
  }
  return status();
}
