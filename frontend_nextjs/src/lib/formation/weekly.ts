/**
 * Wochenkerzen aus D1 (Paket D, Befund 16): der Worker liefert kein W1, der Browser bildet es.
 * Eine Woche beginnt am Sonntag 00:00 Brokerzeit (wie MT5-W1; MT5-Sekunden sind Brokerzeit). W1 dient nur Trend, RSI und Divergenz.
 */
import type { MissingRange } from '@/lib/analysis/candles';
import { weeklyFromDaily } from '@/lib/analysis/calendarBars';
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
 * D1 und W1 aus denselben langen D1-Daten (`W1_HISTORY_DAYS`): die D1-Ansicht ist der ganze Verlauf, damit der D1-Trendzug nicht am Anfang des
 * Verlaufsfensters (`D1_VIEW_DAYS`) beginnt (1114-A4: mit 400 Tagen zeichnete er Wendepunkte im Fenster jeden Tag neu; mit dem ganzen Verlauf
 * ändert er sich von Tag zu Tag nicht öfter als mit festem Anfang). Die Suche selbst bleibt im Verlaufsfenster; den Lückenhinweis setzt nur ein
 * fehlender Bereich im Fenster (`gapInHistory`).
 */
export function splitDaily(bars: readonly FormationBar[], missing: readonly GapRange[]): { d1: DailyData; w1: DailyData } {
  return {
    d1: { bars: [...bars], missing: [...missing] },
    w1: { bars: weeklyFromDaily(bars, missing), missing: [] },
  };
}
