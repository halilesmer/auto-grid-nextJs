/**
 * Kennzahlen aus gepaarten Trades (docs/analyse-regeln.md §4.4). Gewinn/Verlust nach Netto
 * (Gewinn + Kommission + Swap + Gebühr). Reine Funktionen ohne React, auch für die Lib-Tests.
 */
import type { Trade } from './tradePairing';

/** DEAL_REASON_TP: ein Ausstieg durch Take Profit = ein Grid-Zyklus */
const REASON_TP = 5;

export interface TradeStats {
  trades: number;
  /** Eindeutige Positionsnummern */
  positions: number;
  wins: number;
  losses: number;
  /** Netto genau 0 */
  flat: number;
  /** Anteil Gewinn-Trades an allen Trades (0–1); null ohne Trades */
  winRate: number | null;
  net: number;
  grossProfit: number;
  /** Summe der Verluste (≤ 0) */
  grossLoss: number;
  /** Bruttogewinn / |Bruttoverlust|; null ohne Verlust („—“ statt ∞) */
  profitFactor: number | null;
  avg: number | null;
  best: number | null;
  worst: number | null;
  /** TP-Schließungen */
  cycles: number;
  /** Größter Rückgang der realisierten Kurve (ab 0) vom bisherigen Höchststand, ≥ 0 */
  maxDrawdown: number;
}

export function computeStats(trades: Trade[]): TradeStats {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime || a.exitTicket - b.exitTicket);
  let wins = 0;
  let losses = 0;
  let flat = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let cycles = 0;
  let best: number | null = null;
  let worst: number | null = null;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const tr of sorted) {
    if (tr.net > 0) {
      wins++;
      grossProfit += tr.net;
    } else if (tr.net < 0) {
      losses++;
      grossLoss += tr.net;
    } else flat++;
    if (tr.exitReason === REASON_TP) cycles++;
    best = best === null ? tr.net : Math.max(best, tr.net);
    worst = worst === null ? tr.net : Math.min(worst, tr.net);
    equity += tr.net;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const n = sorted.length;
  return {
    trades: n,
    positions: new Set(sorted.map((tr) => tr.positionId)).size,
    wins,
    losses,
    flat,
    winRate: n > 0 ? wins / n : null,
    net: grossProfit + grossLoss,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    avg: n > 0 ? (grossProfit + grossLoss) / n : null,
    best,
    worst,
    cycles,
    maxDrawdown,
  };
}
