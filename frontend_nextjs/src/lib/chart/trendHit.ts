/**
 * Trefferprüfung des Trendzugs (Plan 1105-A7, S4): Abstand eines Punkts zu den Schenkeln in Pixeln.
 * Reine Geometrie ohne Chart, damit sie ohne Browser testbar ist.
 */
export interface ScreenSegment { x1: number; y1: number; x2: number; y2: number }

/** Die Linie gilt als getroffen, wenn der Zeiger höchstens so viele Pixel von ihr entfernt ist */
export const TREND_HIT_PX = 6;

export function distanceToSegment(px: number, py: number, s: ScreenSegment): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const lengthSquared = dx * dx + dy * dy;
  // Länge null: ein Punkt. Sonst der nächste Punkt der Strecke (t auf 0..1 begrenzt, also nie die Verlängerung)
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / lengthSquared));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

/** Kleinster Abstand zu allen Schenkeln; ohne Schenkel `Infinity` */
export function nearestDistance(segments: readonly ScreenSegment[], px: number, py: number): number {
  let best = Infinity;
  for (const s of segments) best = Math.min(best, distanceToSegment(px, py, s));
  return best;
}

/** Schenkel in Pixeln; ein Schenkel, dessen Ende der Chart nicht abbilden kann (null), fällt weg */
export function toScreenSegments<T extends { from: { time: number; price: number }; to: { time: number; price: number } }>(
  lines: readonly T[],
  xOf: (time: number) => number | null,
  yOf: (price: number) => number | null,
): (ScreenSegment & { line: T })[] {
  return lines.flatMap((line) => {
    const x1 = xOf(line.from.time), x2 = xOf(line.to.time), y1 = yOf(line.from.price), y2 = yOf(line.to.price);
    return x1 === null || x2 === null || y1 === null || y2 === null ? [] : [{ x1, y1, x2, y2, line }];
  });
}
