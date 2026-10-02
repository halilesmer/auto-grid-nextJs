import type { Bar, MissingRange } from './candles';

/** Bestätigtes Fraktal: Kerze (Öffnungszeit) und Preis (Hoch beim oberen, Tief beim unteren). */
export interface Fractal {
  time: number;
  price: number;
  side: 'U' | 'D';
}

/**
 * Bill-Williams-Fraktale (5 Kerzen) wie der Bot (grid_execution/fractal_signals.find_fractals, MT5
 * Fractals.mq5): oberes Fraktal High[i] > die zwei rechten und >= die zwei linken Hochs; unteres
 * symmetrisch. Nur geschlossene Kerzen (`liveFrom` = laufende Kerze zählt nicht), und nie über einen
 * fehlenden Datenbereich hinweg: dort wären die Nachbarn keine echten Nachbarn.
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
    for (let i = 2; i < s.length - 2; i++) {
      const { high: h, low: l, time } = s[i];
      if (h > s[i + 1].high && h > s[i + 2].high && h >= s[i - 1].high && h >= s[i - 2].high) {
        out.push({ time, price: h, side: 'U' });
      }
      if (l < s[i + 1].low && l < s[i + 2].low && l <= s[i - 1].low && l <= s[i - 2].low) {
        out.push({ time, price: l, side: 'D' });
      }
    }
  }
  return out;
}
