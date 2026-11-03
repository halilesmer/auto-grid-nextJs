import { buildChartData, type ChartData } from '@/lib/analysis/candles';
import type { TimeframeView } from './context';

/**
 * Chartdaten der Formationsansicht (UI-13): Kerzen der Ansicht plus Pausen (aus den Abständen) und Datenlücken (aus den
 * fehlenden Bereichen der Reihe, nur innerhalb der gezeigten Kerzen). Die Leerstellen der Lücken stehen in `points`: der
 * logische Index des Charts zählt sie mit, die Zeichnungen müssen darüber die Zeit in x umrechnen.
 */
export function formationChartData(view: Pick<TimeframeView, 'bars' | 'missing'> | null, tfSec: number): ChartData {
  const bars = view?.bars ?? [];
  const first = bars[0]?.time ?? 0, last = bars.at(-1)?.time ?? 0;
  const missing = (view?.missing ?? []).filter(m => m.to > first && m.from < last).map(m => ({ from: m.from, to: m.to, reason: 'unavailable', checked_at: null }));
  return buildChartData([...bars], missing, tfSec, null);
}
