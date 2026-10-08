/** Anzeige-Kerzen für den Backtest-Chart. Der Bot rechnet weiter mit allen Basis-Kerzen. */
import type { MissingRange } from '@/lib/analysis/candles';
import type { Timeframe } from '@/lib/analysis/candles';
import { TF_SECONDS } from '@/lib/backtest/engine/types';
import type { LoadedRates } from './loadRates';

export const MAX_BACKTEST_CHART_BARS = 50_000;

export interface DisplayBars {
  bars: { time: number; open: number; high: number; low: number; close: number }[];
  missing: MissingRange[];
  clipped: boolean;
}

/** Kerzen eines Zeitrahmens bilden und nur vollständig abgeschlossene Zeitfenster zurückgeben. */
export function buildDisplayBars(
  rates: LoadedRates,
  dataTimeframe: Timeframe,
  displayTimeframe: Timeframe,
  from: number,
  to: number,
): DisplayBars {
  const baseSec = TF_SECONDS[dataTimeframe];
  const displaySec = TF_SECONDS[displayTimeframe];
  if (displaySec < baseSec || displaySec % baseSec !== 0 || !Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return { bars: [], missing: [], clipped: false };
  }

  const all: DisplayBars['bars'] = [];
  const lastComplete = Math.floor((to - displaySec) / displaySec) * displaySec;
  const windowStart = Math.max(from, lastComplete - (MAX_BACKTEST_CHART_BARS - 1) * displaySec);
  let clipped = false;
  for (let i = 0; i < rates.t.length; i++) {
    const time = rates.t[i];
    const bucket = Math.floor(time / displaySec) * displaySec;
    if (bucket + displaySec > to) continue;
    if (bucket < from) continue;
    if (bucket < windowStart) {
      clipped = true;
      continue;
    }
    const current = all[all.length - 1];
    if (current?.time === bucket) {
      current.high = Math.max(current.high, rates.h[i]);
      current.low = Math.min(current.low, rates.l[i]);
      current.close = rates.c[i];
    } else {
      all.push({ time: bucket, open: rates.o[i], high: rates.h[i], low: rates.l[i], close: rates.c[i] });
    }
  }

  const bars = all.slice(-MAX_BACKTEST_CHART_BARS);
  const start = bars[0]?.time ?? windowStart;
  const missing = rates.missing
    .filter((gap) => gap.from < to && gap.to > start)
    .map((gap) => ({ ...gap, from: Math.max(start, gap.from), to: Math.min(to, gap.to) }))
    .filter((gap) => gap.from < gap.to);
  return { bars, missing, clipped };
}
