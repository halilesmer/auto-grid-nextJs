/**
 * Preisweg einer Kerze (docs/analyse-regeln.md §5, „Kerzenpfad-Modell“): steigende Kerze (Schluss ≥ Eröffnung)
 * Eröffnung → Tief → Hoch → Schluss, fallende Eröffnung → Hoch → Tief → Schluss. Die Kerzen sind Bid-Kerzen.
 */
export type PathMode = 'auto' | 'lowFirst' | 'highFirst';

/** Eckpunkte des Wegs; gleiche aufeinanderfolgende Preise zählen einmal */
export function candleWaypoints(open: number, high: number, low: number, close: number, mode: PathMode): number[] {
  const lowFirst = mode === 'lowFirst' || (mode === 'auto' && close >= open);
  const raw = lowFirst ? [open, low, high, close] : [open, high, low, close];
  return raw.filter((price, i) => i === 0 || price !== raw[i - 1]);
}

/**
 * Zeit jedes Eckpunkts: Eröffnung am Kerzenanfang, Schluss `end` (eine Sekunde vor Kerzenende), dazwischen nach
 * Weglänge verteilt. Hat der Weg keine Länge, liegt alles am Anfang.
 */
export function waypointTimes(prices: readonly number[], start: number, end: number): number[] {
  const lengths: number[] = [0];
  for (let i = 1; i < prices.length; i++) lengths.push(lengths[i - 1] + Math.abs(prices[i] - prices[i - 1]));
  const total = lengths[lengths.length - 1];
  if (total === 0) return prices.map(() => start);
  // Der letzte Eckpunkt liegt genau auf `end` (kein Rundungsrest: 30-s-Bremse, Mitternacht)
  return lengths.map((len, i) => (i === lengths.length - 1 ? end : start + ((end - start) * len) / total));
}
