/**
 * Zahlen der Formationserkennung an einer Stelle. Schlüssel = Bedingungs-ID.
 * Wer eine Annahme ändern will, ändert sie hier und nirgends sonst.
 */
import type { Timeframe } from '@/lib/analysis/candles';

/** RSI-Einstellung (SIG-01): Periode, Schlusskurs, Linien */
export const RSI_PARAMS = { period: 7, overbought: 80, oversold: 20 } as const;

/** Wave = SMA(schnell) − SMA(langsam) des Medianpreises (High + Low) / 2 (SIG-10, Annahme) */
export const WAVE_PARAMS = { fast: 5, slow: 35 } as const;

/** Volumenstarke Kerze (SIG-34, Annahme): Spanne ≥ factor × mittlere Spanne der letzten `lookback` Kerzen */
export const WIDE_RANGE_PARAMS = { factor: 1.5, lookback: 20 } as const;

/** Hilfsmaß ohne Bedingungs-ID: Toleranz und Abstände */
export const ATR_PERIOD = 14;

/** Zeiteinheiten des Kontexts (FRZ-27), von hoch nach tief */
export const CONTEXT_TIMEFRAMES = ['D1', 'H4', 'H1', 'M15'] as const satisfies readonly Timeframe[];
export type ContextTimeframe = (typeof CONTEXT_TIMEFRAMES)[number];
