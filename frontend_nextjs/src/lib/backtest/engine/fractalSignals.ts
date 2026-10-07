/**
 * ATR und Parabolic SAR als reine Funktionen (wie die MT5-Indikatoren).
 * Quelle: worker_python/src/core/grid_execution/fractal_signals.py (atr, parabolic_sar). find_fractals
 * steht als fractalsOf in src/lib/analysis/fractals.ts, die auch der Chart nutzt.
 *
 * `rates` sind Kerzen alt → neu; gelesen werden nur high, low und close.
 */
import type { Bar } from './types';

type RateBar = Pick<Bar, 'high' | 'low' | 'close'>;

/** Average True Range wie ATR.mq5: einfacher Mittelwert der True Range; die ersten `period` Kerzen null */
export function atr(rates: readonly RateBar[], periodIn: number): (number | null)[] {
  const period = Math.max(1, Math.trunc(periodIn));
  const out: (number | null)[] = new Array(rates.length).fill(null);
  const trs: number[] = [];
  for (let i = 0; i < rates.length; i++) {
    const { high: h, low: lo } = rates[i];
    let tr = h - lo;
    if (i > 0) {
      const pc = rates[i - 1].close;
      tr = Math.max(h, pc) - Math.min(lo, pc);
    }
    trs.push(tr);
    if (i >= period) {
      // Summe von links nach rechts wie sum() in Python 3.11 (Worker-venv); ab 3.12 rechnet sum() kompensiert
      let sum = 0;
      for (let k = i - period + 1; k <= i; k++) sum += trs[k];
      out[i] = sum / period;
    }
  }
  return out;
}

/**
 * Parabolic SAR nach Wilder: [sar, isLong], Länge rates.length + 1.
 * Das letzte Element gehört zur laufenden Kerze: nur aus geschlossenen Kerzen berechnet, in MT5 der
 * Punkt dieser Kerze → der SL einer offenen Position.
 */
export function parabolicSar(rates: readonly RateBar[], stepIn = 0.02, maximumIn = 0.2): [(number | null)[], boolean[]] {
  const n = rates.length;
  const sar: (number | null)[] = new Array(n + 1).fill(null);
  const longs: boolean[] = new Array(n + 1).fill(true);
  if (n < 2) return [sar, longs];
  const step = Math.max(1e-6, stepIn);
  const maximum = Math.max(step, maximumIn);

  const high = rates.map((r) => r.high);
  const low = rates.map((r) => r.low);
  let isLong = high[1] + low[1] >= high[0] + low[0];
  let ep = isLong ? Math.max(high[0], high[1]) : Math.min(low[0], low[1]);
  let cur = isLong ? Math.min(low[0], low[1]) : Math.max(high[0], high[1]);
  let af = step;
  sar[1] = cur;
  longs[1] = isLong;

  for (let i = 2; i <= n; i++) {
    let nxt = cur + af * (ep - cur);
    // Der SAR darf nicht in die Spanne der zwei vorigen Kerzen
    if (isLong) nxt = Math.min(nxt, low[i - 1], low[i - 2]);
    else nxt = Math.max(nxt, high[i - 1], high[i - 2]);
    if (i === n) {
      // Laufende Kerze: keine Wende-Prüfung möglich
      sar[i] = nxt;
      longs[i] = isLong;
      break;
    }
    if (isLong && low[i] < nxt) {
      isLong = false;
      nxt = ep;
      ep = low[i];
      af = step;
    } else if (!isLong && high[i] > nxt) {
      isLong = true;
      nxt = ep;
      ep = high[i];
      af = step;
    } else if (isLong && high[i] > ep) {
      ep = high[i];
      af = Math.min(af + step, maximum);
    } else if (!isLong && low[i] < ep) {
      ep = low[i];
      af = Math.min(af + step, maximum);
    }
    cur = nxt;
    sar[i] = cur;
    longs[i] = isLong;
  }
  return [sar, longs];
}
