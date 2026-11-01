/**
 * Signatur der geschlossenen Daten je Zeiteinheit (FRM-21). Die Hintergrundsuche läuft neu, sobald sich die
 * Signatur einer Zeiteinheit ändert; so kommt eine neue D1/H4/H1-Kerze auch dann in die Suche, wenn M15 zuerst
 * nachgeladen hat. Die laufende Kerze zählt nicht: ihr Schluss ändert sich bei jedem Nachladen.
 */
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from './params';

/** Gleiche Regel wie FormationContext.closedCount: geschlossen ist eine Kerze, wenn time + Dauer ≤ at */
export function closedSignature(tf: ContextTimeframe, bars: readonly { time: number }[], missing: number, at: number): string {
  const dur = TIMEFRAME_SEC[tf];
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time + dur <= at) lo = mid + 1;
    else hi = mid;
  }
  const last = lo > 0 ? bars[lo - 1].time : '-';
  return `${tf}:${lo}:${last}:${missing}`;
}

export type ScanSignatureInput = Record<ContextTimeframe, { bars: readonly { time: number }[]; missing: number }>;

export function scanSignature(input: ScanSignatureInput, at: number): string {
  return CONTEXT_TIMEFRAMES.map((tf) => closedSignature(tf, input[tf].bars, input[tf].missing, at)).join(',');
}
