import type { Timeframe } from '@/lib/analysis/candles';
import type { RatesRequest } from '@/hooks/useMarketRates';
import { DAY_SEC } from '@/lib/serverTime';
import { HISTORY_DAYS, TREND_LEAD_DAYS, type ContextTimeframe } from './params';
import { W1_HISTORY_DAYS } from './weekly';

/** Tage, die die Suche je Zeiteinheit lädt: D1 den Verlauf für W1 (die D1-Ansicht ist derselbe Verlauf), sonst Verlaufsfenster plus Vorlauf des Trendzugs */
export const LOAD_DAYS: Record<ContextTimeframe, number> = {
  D1: Math.max(HISTORY_DAYS.D1, W1_HISTORY_DAYS),
  H4: HISTORY_DAYS.H4 + TREND_LEAD_DAYS.H4,
  H1: HISTORY_DAYS.H1 + TREND_LEAD_DAYS.H1,
  M15: HISTORY_DAYS.M15 + TREND_LEAD_DAYS.M15,
};

/** Die vier Kerzen-Anfragen eines Produkts; `to` = Ende des laufenden Brokertags (MT5-Sekunden). */
export function formationRequests(accountId: string, symbol: string, to: number): Record<ContextTimeframe, RatesRequest> {
  const one = (timeframe: Timeframe & ContextTimeframe): RatesRequest => ({ accountId, symbol, timeframe, from: to - LOAD_DAYS[timeframe] * DAY_SEC, to });
  return { D1: one('D1'), H4: one('H4'), H1: one('H1'), M15: one('M15') };
}

/** Fehlender Bereich im Verlaufsfenster der Zeiteinheit bis `to`: nur er setzt den Lückenhinweis (Lücken im Vorlauf ändern die Suche im Fenster nicht sichtbar) */
export const gapInHistory = (tf: ContextTimeframe, missing: readonly { from: number; to: number }[], to: number): boolean =>
  missing.some((m) => m.to > to - HISTORY_DAYS[tf] * DAY_SEC && m.from < to);
