/**
 * Wochenkerzen aus D1 (Paket D, Befund 16): der Worker liefert kein W1, der Browser bildet es.
 * Eine Woche beginnt am Sonntag 00:00 Brokerzeit (wie MT5-W1; MT5-Sekunden sind Brokerzeit). W1 dient nur Trend, RSI und Divergenz.
 */
import type { MissingRange } from '@/lib/analysis/candles';
import { weeklyFromDaily } from '@/lib/analysis/calendarBars';
import { DAY_SEC } from '@/lib/serverTime';
import { D1_VIEW_DAYS } from './params';
import type { FormationBar } from './types';

export { W1_SEC, weekStart, weeklyFromDaily } from '@/lib/analysis/calendarBars';

type GapRange = Pick<MissingRange, 'from' | 'to'>;

/** Tage D1-Verlauf, aus dem W1 entsteht (Annahme): ≈ 157 Wochen; Wave braucht 35, danach bleiben ≈ 120 Wochen mit Werten */
export const W1_HISTORY_DAYS = 1100;

export interface DailyData {
  bars: FormationBar[];
  missing: GapRange[];
}

/**
 * Teilt die langen D1-Daten: die D1-Ansicht behält die letzten `D1_VIEW_DAYS` Tage (bis `to`, Ende des laufenden Brokertags),
 * W1 entsteht aus allen. Ein fehlender Bereich, der ganz vor der D1-Ansicht endet, betrifft nur W1 und setzt keinen Lückenhinweis.
 */
export function splitDaily(bars: readonly FormationBar[], missing: readonly GapRange[], to: number): { d1: DailyData; w1: DailyData } {
  const from = to - D1_VIEW_DAYS * DAY_SEC;
  return {
    d1: { bars: bars.filter((b) => b.time >= from), missing: missing.filter((m) => m.to > from) },
    w1: { bars: weeklyFromDaily(bars, missing), missing: [] },
  };
}
