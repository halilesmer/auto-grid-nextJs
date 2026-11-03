'use client';

import { useMemo } from 'react';
import type { MarketRates } from '@/hooks/useMarketRates';
import { TIMEFRAME_SEC, type Bar, type Timeframe } from '@/lib/analysis/candles';
import { closedBars } from '@/lib/formation/trdPath';

const NONE: Bar[] = [];

/**
 * Geschlossene Kerzen des Charts, aus denen RSI(7) und Wave 5/35 rechnen (ChartView). Brokerzeit der Antwort,
 * sonst die Uhr des Charts; ohne verlässliche Uhr fällt die letzte Kerze weg (wie beim Trendzug).
 */
export function useSignalBars(rates: MarketRates | null, timeframe: Timeframe, offsetSec: number | null, nowSec: () => number): Bar[] {
  return useMemo(() => {
    if (!rates) return NONE;
    const now = rates.serverNow ?? (offsetSec === null ? null : nowSec());
    return closedBars(rates.bars, TIMEFRAME_SEC[timeframe], now, rates.liveFrom);
    // nowSec ändert sich nur mit der Brokeruhr
  }, [rates, timeframe, offsetSec, nowSec]);
}
