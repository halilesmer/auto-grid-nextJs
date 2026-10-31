'use client';

import { useMemo } from 'react';
import { useMarketRates, type RatesRequest } from '@/hooks/useMarketRates';
import { TIMEFRAME_SEC, type Timeframe } from '@/lib/analysis/candles';
import { CONTEXT_TIMEFRAMES, HISTORY_DAYS, type ContextTimeframe, type TrendSettings } from '@/lib/formation/params';
import { buildTrendPath, closedBars, usableTrendSettings, type TrendSegment } from '@/lib/formation/trdPath';
import { brokerToday, DAY_SEC, dayStart } from '@/lib/serverTime';

export interface TrendPath {
  segments: TrendSegment[];
  /** Kerzenzeiten der Rechnung; der Chart schneidet die Linie nach ihnen ab */
  axis: number[];
  loading: boolean;
  error: string | null;
}

const NONE = { segments: [] as TrendSegment[], axis: [] as number[] };

/** Der Trendzug gilt nur auf den Zeiteinheiten der Formationen (D1, H4, H1, M15) */
export function contextTimeframe(timeframe: Timeframe): ContextTimeframe | null {
  return CONTEXT_TIMEFRAMES.find((tf) => tf === timeframe) ?? null;
}

/**
 * Trendzug aus eigenen Kerzen mit fester Historie (HISTORY_DAYS), unabhängig vom Zeitraum des Charts. Solange der Zug
 * aus ist oder die Zeiteinheit nicht passt, wird nichts geladen. Nur geschlossene Kerzen gehen in die Rechnung.
 */
export function useTrendPath(
  input: { accountId: string; symbol: string | null; timeframe: Timeframe; offsetSec: number | null; clockReady: boolean },
  enabled: boolean,
  settings: TrendSettings,
  nowSec: () => number,
): TrendPath {
  const { accountId, symbol, timeframe, offsetSec, clockReady } = input;
  const tf = contextTimeframe(timeframe);
  const day = dayStart(brokerToday(offsetSec ?? 0)) + DAY_SEC;
  const request = useMemo<RatesRequest | null>(
    () => (enabled && tf && symbol && clockReady ? { accountId, symbol, timeframe: tf, from: day - HISTORY_DAYS[tf] * DAY_SEC, to: day } : null),
    [enabled, tf, symbol, clockReady, accountId, day],
  );
  const rates = useMarketRates(request, nowSec);
  const bars = rates.data?.bars;
  const serverNow = rates.data?.serverNow ?? null;
  const liveFrom = rates.data?.liveFrom ?? null;
  const path = useMemo(() => {
    if (!tf || !bars) return NONE;
    // Brokerzeit der Antwort; ohne sie die Uhr des Charts, und ohne verlässliche Uhr gilt die Zeit als unbekannt
    const now = serverNow ?? (offsetSec === null ? null : nowSec());
    const closed = closedBars(bars, TIMEFRAME_SEC[tf], now, liveFrom);
    return { segments: buildTrendPath(tf, closed, usableTrendSettings(settings)), axis: closed.map((b) => b.time) };
    // nowSec ändert sich nur mit der Brokeruhr; die Kerzen laden bei jeder Antwort neu
  }, [tf, bars, serverNow, liveFrom, offsetSec, settings, nowSec]);
  return { ...path, loading: rates.loading, error: rates.error };
}
