/**
 * Handelswerte zur Anzeige (A40.3): CRV, Risiko, Gewinn und Not-SL. Reine Rechnung ohne Abhängigkeiten.
 * Das Anbringen an einen Kandidaten (mit Veto und SIG-29) steht in `tradeApply.ts`.
 */
import type { Side, Trade } from './types';

/** CRV = Abstand Einstieg → Ziel durch Abstand Einstieg → Stop; null bei Risiko 0 */
export function crvOf(entry: number, stop: number, target: number): number | null {
  const risk = Math.abs(stop - entry);
  return risk > 0 ? Math.abs(entry - target) / risk : null;
}

/** Rundung bei Dezimalpreisen: 1:1 soll nicht durch 1,0000000000000002 als „über 1“ gelten */
export const CRV_EPS = 1e-9;

/** Pip-Größe als Preis: 10 × Punkt bei 3 oder 5 Nachkommastellen, sonst null (dann zeigt die Anzeige den Preisabstand) */
export const pipSizeOf = (digits: number | null): number | null => (digits === 3 || digits === 5 ? 10 ** (1 - digits) : null);

export interface TradeMetrics {
  risk: number;
  reward: number;
  crv: number;
}

/**
 * Risiko, Gewinn und CRV bis TP1 in Richtung der Seite; null, wenn ein Wert fehlt oder Stop oder Ziel nicht auf ihrer Seite des Einstiegs liegen
 * (`!(x > 0)` fängt auch NaN ab).
 */
export function tradeMetrics(trade: Pick<Trade, 'entry' | 'stop' | 'tp1'> & Partial<Pick<Trade, 'tp1AtEntry'>>, side: Side): TradeMetrics | null {
  // AB=CD: das Verhältnis gilt am Einstieg (TP1 am Einstieg), nicht am mitlaufenden TP1
  const { entry, stop } = trade;
  const tp1 = trade.tp1AtEntry ?? trade.tp1;
  if (entry === null || stop === null || tp1 === null) return null;
  const risk = side === 'buy' ? entry - stop : stop - entry;
  const reward = side === 'buy' ? tp1 - entry : entry - tp1;
  if (!(risk > 0) || !(reward > 0)) return null;
  const crv = reward / risk;
  return Number.isFinite(crv) ? { risk, reward, crv } : null;
}

export interface TradeOutcomes {
  /** Stop: das ganze Risiko */
  stop: number;
  /** TP1 zum Anteil, der Rest schließt am Einstieg */
  tp1: number;
  /** TP1 und TP2 zu ihren Anteilen, der Rest schließt am Einstieg (mit großem Ziel) oder ist ganz geschlossen (ohne) */
  tp12: number;
  /** Nur mit großem AB=CD-Ziel (1114-A4.3): alle drei Ziele, je ein Drittel */
  tp123?: number;
}

type OutcomeTrade = Pick<Trade, 'entry' | 'stop' | 'tp1'> & Partial<Pick<Trade, 'tp1AtEntry' | 'tp2' | 'tp2AtEntry' | 'tpBig' | 'tpBigAtEntry'>>;

/**
 * Ergebnis in R (Risiko = 1) der Wege (1114-A4.2, A4.3): Stop −1; TP1 und Rest am Einstieg; TP1 und TP2; mit großem Ziel dazu alle drei.
 * Ohne großes Ziel gilt ½ · ½: TP1 = 0.5 × TP1-Abstand / Risiko, TP1 und TP2 = 0.5 × (TP1- + TP2-Abstand) / Risiko.
 * Mit großem Ziel gilt ⅓ · ⅓ · ⅓ (TP2: ⅓ × (r1 + r2), alle drei: ⅓ × (r1 + r2 + r3)). Alle Abstände gelten am Einstieg.
 * null ohne TP2 (Harmoniken) oder bei falscher Seite.
 */
export function outcomesOf(trade: OutcomeTrade, side: Side): TradeOutcomes | null {
  const m = tradeMetrics(trade, side);
  const tp2 = trade.tp2AtEntry;
  if (m === null || tp2 === undefined || trade.entry === null) return null;
  const reward2 = side === 'buy' ? tp2 - trade.entry : trade.entry - tp2;
  if (!(reward2 > 0)) return null;
  if (trade.tpBigAtEntry === undefined) return { stop: -1, tp1: (0.5 * m.reward) / m.risk, tp12: (0.5 * (m.reward + reward2)) / m.risk };
  const reward3 = side === 'buy' ? trade.tpBigAtEntry - trade.entry : trade.entry - trade.tpBigAtEntry;
  if (!(reward3 > 0)) return null;
  return {
    stop: -1,
    tp1: m.reward / (3 * m.risk),
    tp12: (m.reward + reward2) / (3 * m.risk),
    tp123: (m.reward + reward2 + reward3) / (3 * m.risk),
  };
}

/**
 * Tatsächliches Ergebnis in R (1115-A21.1): TP1, TP2 und das große Ziel zählen zu den Preisen, die `tradeStatusOf` beim Erreichen festhielt, nicht zu den Werten am Einstieg.
 * Risiko bleibt der Abstand Einstieg → ursprünglicher Stop. Stop −1 (auch bei Schluss-Stop). Ohne Status, offen oder ohne Zählpreis gilt `outcomesOf`;
 * bei TP1 erreicht zeigt der Weg „TP1 und TP2“ den Zählpreis von TP1 und das aktuelle TP2 (`trade.tp2`), der Weg „alle drei“ dazu das aktuelle große Ziel.
 */
export function realizedOutcomesOf(
  trade: OutcomeTrade,
  side: Side,
  status: { tp1Fill?: number; tp2Fill?: number; bigFill?: number } | undefined,
): TradeOutcomes | null {
  const base = outcomesOf(trade, side);
  const m = tradeMetrics(trade, side);
  if (base === null || m === null || trade.entry === null || status?.tp1Fill === undefined) return base;
  const away = (price: number) => (side === 'buy' ? price - trade.entry! : trade.entry! - price);
  const d1 = away(status.tp1Fill);
  const d2 = away(status.tp2Fill ?? trade.tp2 ?? Number.NaN);
  if (base.tp123 === undefined) {
    return {
      stop: -1,
      tp1: (0.5 * d1) / m.risk,
      tp12: Number.isFinite(d2) ? (0.5 * (d1 + d2)) / m.risk : base.tp12,
    };
  }
  const d3 = away(status.bigFill ?? trade.tpBig ?? Number.NaN);
  return {
    stop: -1,
    tp1: d1 / (3 * m.risk),
    tp12: Number.isFinite(d2) ? (d1 + d2) / (3 * m.risk) : base.tp12,
    tp123: Number.isFinite(d2) && Number.isFinite(d3) ? (d1 + d2 + d3) / (3 * m.risk) : base.tp123,
  };
}

/** Hinweis A4.2.8: eine sehr starke Zone der Gegenseite (Verkauf: Stütze) enthält den Preis; `rect` mit `top` und `bottom` */
export function strongZoneAt(
  zones: { side: 'support' | 'resistance'; strength: 0 | 1 | 2; rect: { top: number; bottom: number } }[],
  price: number,
  side: Side,
): boolean {
  const target = side === 'sell' ? 'support' : 'resistance';
  return zones.some((z) => z.side === target && z.strength === 2 && price >= z.rect.bottom && price <= z.rect.top);
}

/** Not-SL (HDL-41): Schluss-Stop ± 1 × ATR(14) der Zeiteinheit der Formation, gegen die Position; null ohne ATR oder Stop */
export function emergencyStopOf(stop: number | null, side: Side, atr: number | null): number | null {
  if (stop === null || atr === null || !Number.isFinite(atr)) return null;
  return side === 'buy' ? stop - atr : stop + atr;
}

/** Preis eines Fibonacci-Levels, Notation Start = 1, Ende = 0 (wie `levelPrice` in fib.ts, ohne dessen Abhängigkeiten) */
export const fibPrice = (start: number, end: number, level: number): number => end + level * (start - end);
