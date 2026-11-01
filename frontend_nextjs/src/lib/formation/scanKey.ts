/**
 * Signatur der geschlossenen Daten je Zeiteinheit (FRM-21). Die Hintergrundsuche läuft neu, sobald sich die
 * Signatur einer Zeiteinheit ändert; so kommt eine neue D1/H4/H1-Kerze auch dann in die Suche, wenn M15 zuerst
 * nachgeladen hat. Die Live-Kerze (`liveFrom`) zählt nicht: ihre Werte sind vorläufig, auch wenn Zeit + Dauer
 * schon ≤ at ist. Erst das Nachladen macht sie zur geschlossenen Kerze und ändert damit die Signatur.
 * Lücken (`missing`) stehen nicht darin: die Suche liest nur Kerzen. Geht ein Lückenwert in die Suche ein, muss er hierher.
 */
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from './params';

/** Geschlossen: time + Dauer ≤ at (wie FormationContext.closedCount) und vor der Live-Kerze */
export function closedSignature(tf: ContextTimeframe, bars: readonly { time: number }[], liveFrom: number | null, at: number): string {
  const dur = TIMEFRAME_SEC[tf];
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const closed = bars[mid].time + dur <= at && (liveFrom === null || bars[mid].time < liveFrom);
    if (closed) lo = mid + 1;
    else hi = mid;
  }
  const last = lo > 0 ? bars[lo - 1].time : '-';
  return `${tf}:${lo}:${last}`;
}

export type ScanSignatureInput = Record<ContextTimeframe, { bars: readonly { time: number }[]; liveFrom: number | null }>;

export function scanSignature(input: ScanSignatureInput, at: number): string {
  return CONTEXT_TIMEFRAMES.map((tf) => closedSignature(tf, input[tf].bars, input[tf].liveFrom, at)).join(',');
}
