'use client';

import { useMemo } from 'react';
import type { MarketRates } from '@/hooks/useMarketRates';
import { barEnd, isCalendarTimeframe } from '@/lib/analysis/calendarBars';
import { TIMEFRAME_SEC, type Bar, type ChartTimeframe } from '@/lib/analysis/candles';
import { closedBars } from '@/lib/formation/trdPath';

const NONE: Bar[] = [];

/**
 * Geschlossene Kerzen des Charts, aus denen RSI(7) und Wave 5/35 rechnen (ChartView). Brokerzeit der Antwort,
 * sonst die Uhr des Charts; ohne verlässliche Uhr fällt die letzte Kerze weg (anders als beim Trendzug, der dann UTC − 12 h nimmt).
 */
export function useSignalBars(rates: MarketRates | null, timeframe: ChartTimeframe, offsetSec: number | null, nowSec: () => number): Bar[] {
  return useMemo(() => {
    if (!rates) return NONE;
    const now = rates.serverNow ?? (offsetSec === null ? null : nowSec());
    if (isCalendarTimeframe(timeframe)) {
      // A week or month has no fixed length: a candle is closed when its end (barEnd) has passed.
      const known = now === null ? rates.bars.slice(0, -1) : rates.bars.filter((b) => barEnd(timeframe, b.time) <= now);
      return rates.liveFrom === null ? known : known.filter((b) => b.time < rates.liveFrom!);
    }
    return closedBars(rates.bars, TIMEFRAME_SEC[timeframe], now, rates.liveFrom);
    // nowSec ändert sich nur mit der Brokeruhr
  }, [rates, timeframe, offsetSec, nowSec]);
}
