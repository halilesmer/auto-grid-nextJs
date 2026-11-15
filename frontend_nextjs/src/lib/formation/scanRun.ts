import { FormationContext, type ContextInput } from './context';
import type { ContextTimeframe, TrendSettings } from './params';
import { scanFormations, type ScanHit } from './scan';

/** Auftrag der Suche (1114-A1.5): alles, was `FormationContext` und `scanFormations` brauchen, als reine Daten (Web Worker oder direkt) */
export interface ScanRequest {
  id: number;
  symbol: string;
  input: ContextInput;
  at: number;
  trend: TrendSettings;
}

/** Letzte ATR (> 0) je Zeiteinheit zum Suchzeitpunkt: die Seite braucht vom Kontext nur sie (Band bei 1,5 ATR) */
export type ScanAtr = Partial<Record<ContextTimeframe, number | null>>;

export type ScanResponse =
  | { id: number; ok: true; hits: ScanHit[]; atr: ScanAtr; ms: number }
  | { id: number; ok: false; ms: number };

export function runScan(request: ScanRequest): ScanResponse {
  const started = performance.now();
  try {
    const context = new FormationContext(request.symbol, request.input, { trend: request.trend });
    const hits = scanFormations(context, request.at);
    const atr: ScanAtr = {};
    for (const tf of context.timeframes()) {
      const view = context.view(tf, request.at);
      atr[tf] = [...(view?.atr ?? [])].reverse().find((v): v is number => v !== null && v > 0) ?? null;
    }
    return { id: request.id, ok: true, hits, atr, ms: Math.round(performance.now() - started) };
  } catch (err) {
    // Ungültige Kerzen vom Worker (Reihenfolge, NaN): die technische Meldung der Bibliothek ist nur für Entwickler, daher nur in der Konsole
    console.error('Formation scan failed', err);
    return { id: request.id, ok: false, ms: Math.round(performance.now() - started) };
  }
}
