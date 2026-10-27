/**
 * Indikatoren der Formationserkennung als reine Funktionen über Kerzen (alt → neu).
 * Alle Reihen sind kausal: Wert i hängt nur von Kerzen bis i ab. Fehlt die Vorlaufzeit, steht null.
 */
import { wilderRsi } from '@/lib/analysis/candles';
import { atr } from '@/lib/backtest/engine/fractalSignals';
import { ATR_PERIOD, RSI_PARAMS, SIG_PARAMS, WAVE_PARAMS, WIDE_RANGE_PARAMS } from './params';
import type { FormationBar } from './types';

export type Series = (number | null)[];

/** RSI nach Wilder auf Schlusskursen (SIG-01: Periode 7) */
export function rsi(bars: readonly FormationBar[], period: number = RSI_PARAMS.period): Series {
  return wilderRsi(
    bars.map((b) => b.close),
    period,
  );
}

/** Einfacher gleitender Mittelwert; die ersten `period - 1` Werte sind null */
function sma(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Wave (SIG-10): SMA(fast) − SMA(slow) des Medianpreises; Histogramm im Unterfenster */
export function wave(
  bars: readonly FormationBar[],
  fast: number = WAVE_PARAMS.fast,
  slow: number = WAVE_PARAMS.slow,
): Series {
  const median = bars.map((b) => (b.high + b.low) / 2);
  const f = sma(median, fast);
  const s = sma(median, slow);
  return median.map((_, i) => {
    const a = f[i];
    const b = s[i];
    return a === null || b === null ? null : a - b;
  });
}

/** ATR (Mittel der True Range), Hilfsmaß ohne Bedingungs-ID */
export function atrSeries(bars: readonly FormationBar[], period: number = ATR_PERIOD): Series {
  return atr(bars, period);
}

/**
 * Volumenstarke Kerze (SIG-34): Spanne (High − Low) ≥ factor × Mittel der Spannen der
 * `lookback` Kerzen davor (ohne die Kerze selbst). null, solange weniger als `lookback` Kerzen davor liegen.
 */
export function wideRange(
  bars: readonly FormationBar[],
  factor: number = WIDE_RANGE_PARAMS.factor,
  lookback: number = WIDE_RANGE_PARAMS.lookback,
): (boolean | null)[] {
  const spans = bars.map((b) => b.high - b.low);
  const out: (boolean | null)[] = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i >= lookback) {
      // eine Kerze ohne Spanne ist nie volumenstark, auch nicht nach lauter flachen Kerzen
      out[i] = spans[i] > 0 && spans[i] >= factor * (sum / lookback);
      sum -= spans[i - lookback];
    }
    sum += spans[i];
  }
  return out;
}

/**
 * Volumenarme Kerze (SIG-35): Spanne ≤ factor × Mittel der Spannen der `lookback` Kerzen davor.
 * null, solange weniger als `lookback` Kerzen davor liegen.
 */
export function narrowRange(
  bars: readonly FormationBar[],
  factor: number = SIG_PARAMS.narrow.factor,
  lookback: number = SIG_PARAMS.narrow.lookback,
): (boolean | null)[] {
  const spans = bars.map((b) => b.high - b.low);
  const out: (boolean | null)[] = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i >= lookback) {
      out[i] = spans[i] <= factor * (sum / lookback);
      sum -= spans[i - lookback];
    }
    sum += spans[i];
  }
  return out;
}
