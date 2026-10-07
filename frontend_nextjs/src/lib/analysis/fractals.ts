import type { Bar, MissingRange } from './candles';

/** Bestätigtes Fraktal: Kerze (Öffnungszeit) und Preis (Hoch beim oberen, Tief beim unteren). */
export interface Fractal {
  time: number;
  price: number;
  side: 'U' | 'D';
}

/** Fraktal einer Kerzenliste mit Index und Spanne der Kerze (für den Bot-Nachbau, Backtest B3). */
export interface BarFractal {
  /** Index der Kerze in der Liste */
  index: number;
  time: number;
  price: number;
  high: number;
  low: number;
}

/**
 * Bill-Williams-Fraktale (5 Kerzen) wie der Bot (grid_execution/fractal_signals.find_fractals, MT5
 * Fractals.mq5): oberes Fraktal High[i] > die zwei rechten und >= die zwei linken Hochs; unteres
 * symmetrisch. Ergebnis [obere, untere], alt → neu. Die Liste darf nur geschlossene Kerzen ohne Lücke
 * enthalten.
 */
export function fractalsOf(bars: readonly Pick<Bar, 'time' | 'high' | 'low'>[]): [BarFractal[], BarFractal[]] {
  const ups: BarFractal[] = [];
  const downs: BarFractal[] = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const { high: h, low: l, time } = bars[i];
    if (h > bars[i + 1].high && h > bars[i + 2].high && h >= bars[i - 1].high && h >= bars[i - 2].high) {
      ups.push({ index: i, time, price: h, high: h, low: l });
    }
    if (l < bars[i + 1].low && l < bars[i + 2].low && l <= bars[i - 1].low && l <= bars[i - 2].low) {
      downs.push({ index: i, time, price: l, high: h, low: l });
    }
  }
  return [ups, downs];
}

/**
 * Fraktale für den Chart (fractalsOf): nur geschlossene Kerzen (`liveFrom` = laufende Kerze zählt nicht),
 * und nie über einen fehlenden Datenbereich hinweg: dort wären die Nachbarn keine echten Nachbarn.
 * Reihenfolge nach Kerze, bei gleicher Kerze oben vor unten.
 */
export function findFractals(bars: Bar[], missing: MissingRange[], liveFrom: number | null): Fractal[] {
  const closed = liveFrom === null ? bars : bars.filter((b) => b.time < liveFrom);
  const out: Fractal[] = [];
  // In Stücke ohne fehlenden Bereich dazwischen teilen
  const segments: Bar[][] = [];
  let seg: Bar[] = [];
  for (const b of closed) {
    const prev = seg[seg.length - 1];
    if (prev && missing.some((m) => m.from < b.time && m.to > prev.time)) {
      segments.push(seg);
      seg = [];
    }
    seg.push(b);
  }
  segments.push(seg);
  for (const s of segments) {
    const [ups, downs] = fractalsOf(s);
    const marked = [
      ...ups.map((f) => ({ f, side: 'U' as const })),
      ...downs.map((f) => ({ f, side: 'D' as const })),
    ].sort((a, b) => a.f.index - b.f.index || (a.side === 'U' ? -1 : 1));
    for (const { f, side } of marked) out.push({ time: f.time, price: f.price, side });
  }
  return out;
}
