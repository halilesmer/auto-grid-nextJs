/**
 * Grid-Risiko-Rechner (TLS-01): saubere Rechnung für eine Kaufleiter, die bei fallendem Kurs Stufe für Stufe
 * zukauft. Reine Funktionen ohne React; die Seite zeigt nur das Ergebnis. Der Rechner eröffnet nie Positionen.
 *
 * Vorzeichen: Swap positiv = Ertrag (senkt die Last), negativ = Kosten. Der Verlust ist immer eine positive Last.
 */
export const MAX_LEVELS = 2000;
export const DEFAULT_STOP_OUT_PCT = 50;
/** MT5 SYMBOL_SWAP_MODE_*: nur diese zwei rechnet der Rechner selbst. */
export const SWAP_MODE_DISABLED = 0;
export const SWAP_MODE_POINTS = 1;

export interface GridRiskInput {
  capital: number;
  p0: number;
  floor: number;
  /** Stufenabstand als Preis (nicht Cent). */
  step: number;
  lot: number;
  contractSize: number;
  leverage: number;
  /** Preisstellen des Symbols; bestimmt die ganzzahlige Rasterung. */
  digits: number;
  point: number;
  tickValue: number;
  tickSize: number;
  /** Swap je Tag und Position in Punkten (nur Modus „Punkte“); positiv = Ertrag. */
  swapPoints: number;
  /** Tage, die jede Position offen bleibt. */
  days: number;
  /** Marge von 1 Lot (MT5) und der Preis, bei dem sie gemessen wurde; null = Näherung aus dem Hebel. */
  marginPerLot: number | null;
  marginPrice: number | null;
  /** Stop-out-Stufe in Prozent der Margenlage (aus dem Konto); fehlt sie, gilt 50. */
  stopOutPct: number | null;
}

export type LevelStatus = 'safe' | 'marginCall' | 'stopOut';

export interface GridLevel {
  index: number;
  price: number;
  openPositions: number;
  totalLots: number;
  /** Offener Verlust (positive Zahl = Verlust). */
  loss: number;
  /** Swap kumuliert; positiv = Ertrag. */
  swap: number;
  margin: number;
  /** Last = Verlust − Swap + Marge. */
  load: number;
  /** Kapital − Last. */
  remaining: number;
  equity: number;
  /** Eigenkapital / Marge in Prozent; null ohne Marge. */
  marginLevel: number | null;
  status: LevelStatus;
}

export type GridRiskError = 'invalid' | 'floorAbovePrice' | 'tooManyLevels';

export type GridRiskResult =
  | { ok: false; error: GridRiskError; count?: number }
  | {
      ok: true;
      count: number;
      levels: GridLevel[];
      last: GridLevel;
      status: LevelStatus;
      firstMarginCall: GridLevel | null;
      firstStopOut: GridLevel | null;
      avgPrice: number;
      totalLots: number;
      stopOutPct: number;
      marginApproximated: boolean;
      /** Anteil der Last am Kapital in Prozent (nicht begrenzt). */
      usagePct: number;
    };

/**
 * Anzahl der Stufen unter P0 in ganzen Rasterschritten gerechnet (50,91 → 45 mit Schritt 0,03 gibt 197,
 * nicht 196 wie bei Fließkomma-`Math.floor`). Die Stufe bei P0 kommt dazu: count = N + 1.
 */
export function stepCount(p0: number, floor: number, step: number, digits: number): number {
  const scale = 10 ** Math.max(0, Math.min(10, digits));
  const span = Math.round(p0 * scale) - Math.round(floor * scale);
  const stepUnits = Math.round(step * scale);
  if (stepUnits <= 0 || span < 0) return 0;
  return Math.floor(span / stepUnits);
}

/** Tage mit Dreifach-Swap: je voller Woche zwei zusätzliche Swap-Tage (Annahme, steht im Hinweis der Seite). */
export function effectiveSwapDays(days: number): number {
  const d = Math.max(0, days);
  return d + 2 * Math.floor(d / 7);
}

/** Preis × Kontraktgröße-unabhängiger Geldwert je Preiseinheit und Lot (tick_value / tick_size). */
export function moneyPerPriceUnit(tickValue: number, tickSize: number): number {
  return tickSize > 0 ? tickValue / tickSize : 0;
}

export function calcGridRisk(input: GridRiskInput): GridRiskResult {
  const { capital, p0, floor, step, lot, contractSize, leverage, digits, point, tickValue, tickSize } = input;
  const positive = [capital, p0, floor, step, lot, contractSize, leverage, tickValue, tickSize];
  if (positive.some((v) => !Number.isFinite(v) || v <= 0)) return { ok: false, error: 'invalid' };
  if (floor >= p0) return { ok: false, error: 'floorAbovePrice' };
  const n = stepCount(p0, floor, step, digits);
  const count = n + 1;
  if (count > MAX_LEVELS) return { ok: false, error: 'tooManyLevels', count };

  const m = moneyPerPriceUnit(tickValue, tickSize);
  const stopOutPct = input.stopOutPct != null && input.stopOutPct > 0 ? input.stopOutPct : DEFAULT_STOP_OUT_PCT;
  const swapPerPosition = input.swapPoints * point * m * lot * effectiveSwapDays(input.days);
  const useMt5Margin = input.marginPerLot != null && input.marginPerLot > 0 && input.marginPrice != null && input.marginPrice > 0;
  const marginOf = (price: number) =>
    useMt5Margin
      ? ((input.marginPerLot as number) * lot * price) / (input.marginPrice as number)
      : (price * lot * contractSize) / leverage;

  const levels: GridLevel[] = [];
  let marginSum = 0;
  let priceSum = 0;
  for (let i = 0; i < count; i++) {
    const price = p0 - i * step;
    marginSum += marginOf(price);
    priceSum += price;
    // Position j öffnet bei p0 − j·step; Verlust beim Stand i: step · (0 + 1 + … + i) · m · lot
    const loss = m * lot * step * ((i * (i + 1)) / 2);
    const swap = swapPerPosition * (i + 1);
    const equity = capital - loss + swap;
    const marginLevel = marginSum > 0 ? (equity / marginSum) * 100 : null;
    let status: LevelStatus = 'safe';
    if (marginLevel !== null && marginLevel < stopOutPct) status = 'stopOut';
    else if (marginLevel !== null && marginLevel < 100) status = 'marginCall';
    const load = loss - swap + marginSum;
    levels.push({
      index: i + 1,
      price,
      openPositions: i + 1,
      totalLots: (i + 1) * lot,
      loss,
      swap,
      margin: marginSum,
      load,
      remaining: capital - load,
      equity,
      marginLevel,
      status,
    });
  }
  const last = levels[levels.length - 1];
  const firstMarginCall = levels.find((l) => l.status !== 'safe') ?? null;
  const firstStopOut = levels.find((l) => l.status === 'stopOut') ?? null;
  let status: LevelStatus = 'safe';
  if (firstStopOut) status = 'stopOut';
  else if (firstMarginCall) status = 'marginCall';
  return {
    ok: true,
    count,
    levels,
    last,
    status,
    firstMarginCall,
    firstStopOut,
    avgPrice: priceSum / count,
    totalLots: count * lot,
    stopOutPct,
    marginApproximated: !useMt5Margin,
    usagePct: (last.load / capital) * 100,
  };
}
