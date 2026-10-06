/**
 * Vorschlag für die Kommission je Lot (hin und zurück) aus dem Deal-Archiv (GET /history/{id}/deals),
 * BKT-04 / docs/analyse-regeln.md §6. Der Backtest bucht den Wert je zur Hälfte bei Ein- und Ausstieg.
 *
 * Regeln:
 * - Nur Kauf/Verkauf-Deals (DEAL_TYPE_BUY/SELL) des Symbols; Einzahlungen usw. zählen nicht.
 * - Nur ganz geschlossene Positionen: Einstiegs- und Ausstiegsvolumen sind gleich. Eine offene oder
 *   teilweise geschlossene Position hätte die Ausstiegskommission noch nicht und würde den Wert verfälschen.
 * - Umkehr-Deals (DEAL_ENTRY_INOUT, nur Netting) machen die Position ungültig: der Backtest kennt nur Hedging.
 * - Kommission je Lot = −Σ commission ÷ Σ geschlossenes Volumen. Ein Broker, der nur beim Einstieg
 *   (oder nur beim Ausstieg) berechnet, ergibt so trotzdem den Wert für hin und zurück.
 * - `fee` (Gebühr je Deal) ist keine Kommission und zählt nicht mit.
 * Ergebnis ist positiv für Kosten (MT5 bucht die Kommission negativ). Ohne passende Positionen: null.
 */
import { DEAL_BUY, DEAL_SELL, ENTRY_IN, ENTRY_INOUT, ENTRY_OUT, ENTRY_OUT_BY, type Deal } from '../analysis/tradePairing';

const EPS = 1e-9;

export interface CommissionProposal {
  /** Kommission je Lot, hin und zurück, in Kontowährung (positiv = Kosten) */
  perLot: number;
  /** Anzahl ganz geschlossener Positionen, aus denen der Wert stammt */
  positions: number;
  /** Summe des geschlossenen Volumens dieser Positionen (Lot) */
  lots: number;
}

interface PositionSum {
  inVolume: number;
  outVolume: number;
  commission: number;
  invalid: boolean;
}

export function proposeCommission(deals: readonly Deal[], symbol: string): CommissionProposal | null {
  const byPosition = new Map<number, PositionSum>();
  for (const d of deals) {
    if (d.symbol !== symbol || (d.type !== DEAL_BUY && d.type !== DEAL_SELL) || d.position_id == null) continue;
    let p = byPosition.get(d.position_id);
    if (!p) {
      p = { inVolume: 0, outVolume: 0, commission: 0, invalid: false };
      byPosition.set(d.position_id, p);
    }
    const volume = d.volume ?? 0;
    if (d.entry === ENTRY_IN) p.inVolume += volume;
    else if (d.entry === ENTRY_OUT || d.entry === ENTRY_OUT_BY) p.outVolume += volume;
    else if (d.entry === ENTRY_INOUT) p.invalid = true;
    p.commission += d.commission ?? 0;
  }

  let positions = 0;
  let lots = 0;
  let commission = 0;
  for (const p of byPosition.values()) {
    if (p.invalid || p.inVolume <= EPS || Math.abs(p.inVolume - p.outVolume) > EPS) continue;
    positions += 1;
    lots += p.outVolume;
    commission += p.commission;
  }
  if (positions === 0) return null;
  return { perLot: commission === 0 ? 0 : -commission / lots, positions, lots };
}
