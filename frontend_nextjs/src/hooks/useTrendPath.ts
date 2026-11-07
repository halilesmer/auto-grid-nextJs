'use client';

import { useMemo } from 'react';
import { useMarketRates, type RatesRequest } from '@/hooks/useMarketRates';
import { ratesWindow, TIMEFRAME_SEC, type ChartTimeframe } from '@/lib/analysis/candles';
import { CONTEXT_TIMEFRAMES, HISTORY_DAYS, type ContextTimeframe, type TrendSettings } from '@/lib/formation/params';
import { buildTrendPath, closedBars, usableTrendSettings, type TrendSegment } from '@/lib/formation/trdPath';
import { DAY_SEC } from '@/lib/serverTime';

export interface TrendPath {
  segments: TrendSegment[];
  /** Kerzenzeiten der Rechnung; der Chart schneidet die Linie nach ihnen ab */
  axis: number[];
  loading: boolean;
  error: string | null;
}

const NONE = { segments: [] as TrendSegment[], axis: [] as number[] };

/** Der Trendzug gilt nur auf den Zeiteinheiten der Formationen (D1, H4, H1, M15) */
export function contextTimeframe(timeframe: ChartTimeframe): ContextTimeframe | null {
  return CONTEXT_TIMEFRAMES.find((tf) => tf === timeframe) ?? null;
}

/**
 * Trendzug aus eigenen Kerzen über den Zeitraum des Charts plus Vorlauf HISTORY_DAYS davor (die Linie ist am linken
 * Rand eingeschwungen). Das Ende der Anfrage ist das Ende des Charts. Solange der Zug
 * aus ist oder die Zeiteinheit nicht passt, wird nichts geladen. Nur geschlossene Kerzen gehen in die Rechnung.
 */
export function useTrendPath(
  input: {
    accountId: string; symbol: string | null; timeframe: ChartTimeframe; range: { from: number | null; to: number };
    offsetSec: number | null; clockReady: boolean;
  },
  enabled: boolean,
  settings: TrendSettings,
  nowSec: () => number,
): TrendPath {
  const { accountId, symbol, timeframe, range, offsetSec, clockReady } = input;
  const { from: rangeFrom, to: rangeTo } = range;
  const tf = contextTimeframe(timeframe);
  const request = useMemo<RatesRequest | null>(() => {
    if (!enabled || !tf || !symbol || !clockReady) return null;
    // Anfang des Chart-Fensters wie im Chart selbst (auch bei „alles“ und gekürztem Zeitraum)
    const chartFrom = ratesWindow(rangeFrom, rangeTo, TIMEFRAME_SEC[tf]).from;
    return { accountId, symbol, timeframe: tf, from: chartFrom - HISTORY_DAYS[tf] * DAY_SEC, to: rangeTo };
  }, [enabled, tf, symbol, clockReady, accountId, rangeFrom, rangeTo]);
  const rates = useMarketRates(request, nowSec);
  const bars = rates.data?.bars;
  const serverNow = rates.data?.serverNow ?? null;
  const liveFrom = rates.data?.liveFrom ?? null;
  const path = useMemo(() => {
    if (!tf || !bars) return NONE;
    // Brokerzeit der Antwort; ohne sie die Uhr des Charts, und ohne verlässliche Uhr zählen Kerzen vor UTC jetzt minus 12 h als geschlossen (A13.3.1)
    const now = serverNow ?? (offsetSec === null ? null : nowSec());
    const closed = closedBars(bars, TIMEFRAME_SEC[tf], now, liveFrom, offsetSec === null ? nowSec() : null);
    return { segments: buildTrendPath(tf, closed, usableTrendSettings(settings)), axis: closed.map((b) => b.time) };
    // nowSec ändert sich nur mit der Brokeruhr; die Kerzen laden bei jeder Antwort neu
  }, [tf, bars, serverNow, liveFrom, offsetSec, settings, nowSec]);
  return { ...path, loading: rates.loading, error: rates.error };
}
