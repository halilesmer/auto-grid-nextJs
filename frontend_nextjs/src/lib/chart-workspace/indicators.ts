import type { Bar, MissingRange } from '@/lib/analysis/candles';

export const INDICATOR_KINDS = ['SMA', 'EMA', 'RSI', 'EWO', 'MACD', 'BB', 'ATR'] as const;
export type IndicatorKind = typeof INDICATOR_KINDS[number];
export type Source = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
export type Smoothing = 'none' | 'SMA' | 'EMA' | 'RMA' | 'WMA' | 'BB';
export interface Indicator {
  id: string;
  kind: IndicatorKind;
  visible: boolean;
  period: number;
  slow: number;
  signal: number;
  source: Source;
  color: string;
  negative: string;
  maColor: string;
  width: 1 | 2 | 3 | 4;
  upper: number;
  middle: number;
  lower: number;
  bands: boolean;
  background: boolean;
  gradients: boolean;
  smoothing: Smoothing;
  smoothingPeriod: number;
  deviation: number;
  percent: boolean;
  divergence: boolean;
  labels: boolean;
  values: boolean;
  /** 0 = chart; higher intervals are aggregated from available chart candles. */
  timeframe: number;
  waitClose: boolean;
  minTimeframe: number;
  maxTimeframe: number;
}
export type Value = number | null;
export interface IndicatorResult { main: Value[]; extra: Value[][]; divergences: { from: number; to: number; bullish: boolean }[] }

export function newIndicator(kind: IndicatorKind, color = ''): Indicator {
  let period = 20;
  if (kind === 'EWO') period = 5; else if (kind === 'MACD') period = 12; else if (kind === 'RSI' || kind === 'ATR') period = 14;
  return {
    id: crypto.randomUUID(), kind, visible: true,
    period,
    slow: kind === 'MACD' ? 26 : 35, signal: 9, source: 'close', color, negative: '', maColor: '', width: 1,
    upper: 70, middle: 50, lower: 30, bands: true, background: true, gradients: true,
    smoothing: kind === 'RSI' ? 'SMA' : 'none', smoothingPeriod: 14, deviation: 2,
    percent: true, divergence: false, labels: true, values: true, timeframe: 0, waitClose: true,
    minTimeframe: 0, maxTimeframe: 86400,
  };
}

export function sourceValue(b: Bar, source: Source): number {
  if (source === 'hl2') return (b.high + b.low) / 2;
  if (source === 'hlc3') return (b.high + b.low + b.close) / 3;
  if (source === 'ohlc4') return (b.open + b.high + b.low + b.close) / 4;
  return b[source];
}

/** O(n) averages. Null resets warm-up; confirmed session breaks do not insert null. */
export function average(values: readonly Value[], period: number, type: Exclude<Smoothing, 'none' | 'BB'> = 'SMA'): Value[] {
  const out: Value[] = new Array(values.length).fill(null);
  let sum = 0, count = 0, previous: Value = null, weighted = 0;
  const queue: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) { sum = count = weighted = 0; previous = null; queue.length = 0; continue; }
    if (type === 'EMA' || type === 'RMA') {
      if (previous === null) {
        sum += v; count++;
        if (count === period) previous = sum / period;
      } else { const a = type === 'EMA' ? 2 / (period + 1) : 1 / period; previous += a * (v - previous); }
      out[i] = previous;
    } else {
      queue.push(v);
      // Maintain the weighted sum without visiting the whole window on every bar.
      if (count >= period) { weighted -= sum; sum -= queue[count - period]; }
      sum += v; weighted += v * Math.min(count + 1, period); count++;
      if (count >= period) out[i] = type === 'WMA' ? weighted / (period * (period + 1) / 2) : sum / period;
    }
  }
  return out;
}

function stddev(values: readonly Value[], period: number): Value[] {
  const result: Value[] = new Array(values.length).fill(null);
  let sum = 0, squares = 0, start = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) { start = i + 1; sum = squares = 0; continue; }
    sum += v; squares += v * v;
    if (i - start >= period) { const old = values[i - period] as number; sum -= old; squares -= old * old; }
    if (i - start + 1 >= period) result[i] = Math.sqrt(Math.max(0, squares / period - (sum / period) ** 2));
  }
  return result;
}

export function calculateIndicator(bars: readonly Bar[], config: Indicator, missing: readonly Pick<MissingRange, 'from' | 'to'>[] = []): IndicatorResult {
  const v: Value[] = bars.map(b => sourceValue(b, config.source));
  // Insert a reset between real candles across unavailable data. Do not discard the first valid candle.
  const expanded: Value[] = [], indices: number[] = [];
  const sorted = [...missing].sort((a, b) => a.from - b.from);
  let gap = 0;
  for (let i = 0; i < bars.length; i++) {
    while (gap < sorted.length && sorted[gap].to <= (bars[i - 1]?.time ?? -Infinity)) gap++;
    if (i && gap < sorted.length && sorted[gap].from < bars[i].time && sorted[gap].to > bars[i - 1].time) expanded.push(null);
    indices.push(expanded.length); expanded.push(v[i]);
  }
  const pack = (a: readonly Value[]) => indices.map(i => a[i]);
  const a = average(expanded, config.period, config.kind === 'EMA' || config.kind === 'MACD' ? 'EMA' : 'SMA');
  let main = a, extra: Value[][] = [];
  if (config.kind === 'RSI') {
    const gains = expanded.map((x, i) => x === null || i === 0 || expanded[i - 1] === null ? null : Math.max(0, x - (expanded[i - 1] as number)));
    const losses = expanded.map((x, i) => x === null || i === 0 || expanded[i - 1] === null ? null : Math.max(0, (expanded[i - 1] as number) - x));
    const g = average(gains, config.period, 'RMA'), l = average(losses, config.period, 'RMA');
    main = g.map((x, i) => { if (x === null || l[i] === null) return null; if (l[i] === 0) return 100; if (x === 0) return 0; return 100 - 100 / (1 + x / (l[i] as number)); });
    if (config.smoothing !== 'none') {
      const ma = average(main, config.smoothingPeriod, config.smoothing === 'BB' ? 'SMA' : config.smoothing);
      extra = [ma];
      if (config.smoothing === 'BB') {
        const sd = stddev(main, config.smoothingPeriod);
        extra.push(ma.map((x, i) => x === null || sd[i] === null ? null : x + config.deviation * (sd[i] as number)), ma.map((x, i) => x === null || sd[i] === null ? null : x - config.deviation * (sd[i] as number)));
      }
    }
  } else if (config.kind === 'EWO' || config.kind === 'MACD') {
    const slow = average(expanded, config.slow, config.kind === 'MACD' ? 'EMA' : 'SMA');
    main = a.map((x, i) => x === null || slow[i] === null ? null : x - (slow[i] as number));
    if (config.kind === 'EWO' && config.percent) {
      const close: Value[] = new Array(expanded.length).fill(null);
      indices.forEach((index, i) => { close[index] = bars[i].close; });
      main = main.map((x, i) => x === null || !close[i] ? null : x / (close[i] as number) * 100);
    }
    if (config.kind === 'MACD') {
      const signal = average(main, config.signal, 'EMA');
      extra = [signal, main.map((x, i) => x === null || signal[i] === null ? null : x - (signal[i] as number))];
    }
  } else if (config.kind === 'BB') {
    const sd = stddev(expanded, config.period);
    extra = [a.map((x, i) => x === null || sd[i] === null ? null : x + config.deviation * (sd[i] as number)), a.map((x, i) => x === null || sd[i] === null ? null : x - config.deviation * (sd[i] as number))];
  } else if (config.kind === 'ATR') {
    const tr: Value[] = new Array(expanded.length).fill(null);
    indices.forEach((index, i) => {
      const b = bars[i], prev = index && expanded[index - 1] !== null ? bars[i - 1] : null;
      tr[index] = prev ? Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close)) : b.high - b.low;
    });
    main = average(tr, config.period, 'RMA');
  }
  const packed = pack(main);
  const divergences: IndicatorResult['divergences'] = [];
  if (config.kind === 'RSI' && config.divergence) {
    // Match the built-in RSI's regular divergences: pivots 5/5, distance 5..60.
    // The right pivot is published only after all five confirmation candles exist.
    let low = -1, high = -1;
    for (let i = 5; i + 5 < bars.length; i++) {
      const x = packed[i]; if (x === null) continue;
      const window = packed.slice(i - 5, i + 6);
      if (window.some(x => x === null)) continue;
      const bullish = window.every((n, j) => j === 5 || (n as number) > x);
      const bearish = window.every((n, j) => j === 5 || (n as number) < x);
      let previous = -1; if (bullish) previous = low; else if (bearish) previous = high;
      if (previous >= 0 && i - previous >= 5 && i - previous <= 60 && !sorted.some(g => g.from < bars[i + 5].time && g.to > bars[previous].time)) {
        if (bullish && x > (packed[previous] as number) && bars[i].low < bars[previous].low) divergences.push({ from: previous, to: i, bullish: true });
        if (bearish && x < (packed[previous] as number) && bars[i].high > bars[previous].high) divergences.push({ from: previous, to: i, bullish: false });
      }
      if (bullish) low = i; if (bearish) high = i;
    }
  }
  return { main: packed, extra: extra.map(pack), divergences };
}

/** Only complete initial buckets and gap-free buckets can contribute to a higher timeframe.
 * Confirmed values are timestamped at the last constituent candle, never at the bucket start.
 */
export function aggregateIndicatorBars(bars: readonly Bar[], seconds: number, chartSeconds: number, closeOnly: boolean, until: number, missing: readonly Pick<MissingRange, 'from' | 'to'>[] = []): Bar[] {
  const buckets = new Map<number, Bar>();
  for (const bar of bars) {
    const bucket = Math.floor(bar.time / seconds) * seconds;
    if (bucket < (bars[0]?.time ?? Infinity)) continue;
    if (missing.some(g => g.from < bucket + seconds && g.to > bucket)) continue;
    if (closeOnly && bucket + seconds > until) continue;
    const last = buckets.get(bucket);
    if (last) { last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close; }
    else buckets.set(bucket, { ...bar, time: bucket + seconds - chartSeconds });
  }
  // An unfinished current bucket is only known at the latest visible constituent candle.
  return [...buckets.values()].map(b => ({ ...b, time: Math.min(b.time, bars.at(-1)?.time ?? b.time) }));
}
