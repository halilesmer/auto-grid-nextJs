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
export function tradeMetrics(trade: Pick<Trade, 'entry' | 'stop' | 'tp1'>, side: Side): TradeMetrics | null {
  const { entry, stop, tp1 } = trade;
  if (entry === null || stop === null || tp1 === null) return null;
  const risk = side === 'buy' ? entry - stop : stop - entry;
  const reward = side === 'buy' ? tp1 - entry : entry - tp1;
  if (!(risk > 0) || !(reward > 0)) return null;
  const crv = reward / risk;
  return Number.isFinite(crv) ? { risk, reward, crv } : null;
}

/** Not-SL (HDL-41): Schluss-Stop ± 1 × ATR(14) der Zeiteinheit der Formation, gegen die Position; null ohne ATR oder Stop */
export function emergencyStopOf(stop: number | null, side: Side, atr: number | null): number | null {
  if (stop === null || atr === null || !Number.isFinite(atr)) return null;
  return side === 'buy' ? stop - atr : stop + atr;
}

/** Preis eines Fibonacci-Levels, Notation Start = 1, Ende = 0 (wie `levelPrice` in fib.ts, ohne dessen Abhängigkeiten) */
export const fibPrice = (start: number, end: number, level: number): number => end + level * (start - end);
