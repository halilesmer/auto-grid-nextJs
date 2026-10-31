import type { Timeframe } from '@/lib/analysis/candles';
import type { RatesRequest } from '@/hooks/useMarketRates';
import { DAY_SEC } from '@/lib/serverTime';
import type { ContextTimeframe } from './params';

/** Tage Verlauf je Zeiteinheit: genug Wendepunkte für die Suche, wenig genug für eine schnelle Antwort (Annahme) */
export const HISTORY_DAYS = { D1: 400, H4: 120, H1: 40, M15: 10 } as const;

/** Die vier Kerzen-Anfragen eines Produkts; `to` = Ende des laufenden Brokertags (MT5-Sekunden) */
export function formationRequests(accountId: string, symbol: string, to: number): Record<ContextTimeframe, RatesRequest> {
  const one = (timeframe: Timeframe & ContextTimeframe): RatesRequest => ({
    accountId,
    symbol,
    timeframe,
    from: to - HISTORY_DAYS[timeframe] * DAY_SEC,
    to,
  });
  return { D1: one('D1'), H4: one('H4'), H1: one('H1'), M15: one('M15') };
}
