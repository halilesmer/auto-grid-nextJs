import type { Value } from './indicators';

export interface DrawingPriority { toolActive: boolean; drawingHovered: boolean }

/** Wert der Reihe an `time`; ohne Zeit der letzte Wert. Zwischen zwei Zeitpunkten gilt der Wert der letzten Zeit davor (höhere Indikator-Zeitrahmen tragen die Zeit ihrer letzten Kerze). */
export function valueAtTime(times: readonly number[], values: readonly Value[], time: number | null): Value {
  if (!times.length) return null;
  if (time === null) return values.at(-1) ?? null;
  let low = 0, high = times.length - 1, found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= time) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return found < 0 ? null : values[found] ?? null;
}

/** Indikator, dessen Linie hervorgehoben wird; Zeichenwerkzeug und Zeichnung unter der Maus haben Vorrang. */
export function lineTarget(owner: string | null, priority: DrawingPriority): string | null {
  return priority.toolActive || priority.drawingHovered ? null : owner;
}

/** Auswahl nach einem Klick: Linie wählt sie, Klick ins Leere hebt auf; bei Vorrang der Zeichnung bleibt sie. */
export function nextSelection(current: string | null, clicked: string | null, priority: DrawingPriority): string | null {
  return priority.toolActive || priority.drawingHovered ? current : clicked;
}
