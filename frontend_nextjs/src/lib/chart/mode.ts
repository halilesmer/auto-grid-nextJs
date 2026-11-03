import { DEFAULT_TIMEFRAME, isTimeframe, type Timeframe } from '@/lib/analysis/candles';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from '@/lib/formation/params';

/** Die drei Modi der einen Chartseite (/chart): Formationserkennung, Setup einer Zone, freies Produkt */
export const CHART_MODES = ['formation', 'setup', 'free'] as const;
export type ChartMode = (typeof CHART_MODES)[number];

export const DEFAULT_FORMATION_TF: ContextTimeframe = 'H4';

/**
 * Welcher Modus zu einer Adresse gehört. Ein ausdrückliches `mode` gewinnt; ohne gilt für alte Links:
 * `zone` (oder `tab=stats`, die Statistik braucht Zonen) → Setup, `symbol` → Frei, sonst Formation.
 */
export function resolveChartMode(params: URLSearchParams): ChartMode {
  const explicit = params.get('mode');
  if ((CHART_MODES as readonly string[]).includes(explicit ?? '')) return explicit as ChartMode;
  if (params.get('zone') || params.get('tab') === 'stats') return 'setup';
  if (params.get('symbol')?.trim()) return 'free';
  return 'formation';
}

/** `tf` einer Adresse für einen Modus: Formation erlaubt D1/H4/H1/M15 (Standard H4), Setup und Frei M1…D1 (Standard M15) */
export function timeframeParam(mode: ChartMode, tf: string | null): Timeframe {
  if (mode === 'formation') return (CONTEXT_TIMEFRAMES as readonly string[]).includes(tf ?? '') ? (tf as ContextTimeframe) : DEFAULT_FORMATION_TF;
  return isTimeframe(tf) ? tf : DEFAULT_TIMEFRAME;
}

/** Ist die Zeiteinheit im Modus erlaubt? Sonst fällt sie beim Moduswechsel auf den Standard des Modus. */
export function timeframeAllowed(mode: ChartMode, tf: string | null): boolean {
  if (!tf) return true;
  return mode === 'formation' ? (CONTEXT_TIMEFRAMES as readonly string[]).includes(tf) : isTimeframe(tf);
}
