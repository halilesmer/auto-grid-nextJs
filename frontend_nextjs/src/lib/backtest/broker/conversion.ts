/**
 * Kurs der Gewinn-Umrechnung (BKT-28, Plan 1112-K9): MT5 rechnet den Gewinn eines Deals mit dem Kurs im Moment des
 * Schließens um, nicht mit einem festen Kurs von heute. Der Backtest nimmt dafür die M1-Kerzen des Umrechnungspaars.
 *
 * - Kaufposition: Bid des Paars (Kerzenschluss `c`); Verkaufsposition: Ask (`c + s × point`).
 * - Ist das Paar das Symbol selbst (USDJPY mit Gewinnwährung JPY), gilt der Kurs des Deals.
 * - Keine Kerze zur Zeit: der letzte bekannte Schlusskurs. Ist er älter als MAX_RATE_AGE_SEC, gilt kein Kurs
 *   (null); der Aufrufer rechnet dann mit dem Schnappschuss und zählt den Fall.
 */
import type { SymbolDetail } from '@/store/types';

/** Ältester Schlusskurs, der noch gilt (Wochenende plus Feiertag) */
export const MAX_RATE_AGE_SEC = 4 * 86400;
/** Länge der Kerzen der Kursreihe (M1) */
export const RATE_CANDLE_SEC = 60;

/** Beschreibung des Umrechnungspaars; `kind` 'none' = Gewinnwährung ist Kontowährung */
export interface ConversionPair {
  kind: 'none' | 'self' | 'pair';
  /** Name des Paars (bei 'self' das Symbol selbst, bei 'none' leer) */
  name: string;
  /** true: Gewinn wird durch den Kurs geteilt (Paar = Konto/Gewinnwährung), false: mit dem Kurs malgenommen */
  invert: boolean;
}

/** Kursreihe des Paars: Kerzenzeiten aufsteigend, Schlusskurs, Spread in Punkten (NaN/0 = unbekannt) */
export interface RateSeries {
  t: ArrayLike<number>;
  c: ArrayLike<number>;
  s: ArrayLike<number>;
  point: number;
}

export function buildRateSeries(rates: { t: ArrayLike<number>; c: ArrayLike<number>; s: ArrayLike<number>; point: number | null }): RateSeries | null {
  if (rates.t.length === 0 || rates.point === null || !(rates.point > 0)) return null;
  return { t: rates.t, c: rates.c, s: rates.s, point: rates.point };
}

const upper = (s: string | null | undefined): string => (s ?? '').toUpperCase();

/** Reihenfolge der Kandidaten: Forex-Berechnung zuerst, dann ohne Zusatz am Namen, dann kürzester Name */
function rank(a: SymbolDetail, b: SymbolDetail): number {
  const forex = Number(b.trade_calc_mode === 0) - Number(a.trade_calc_mode === 0);
  if (forex !== 0) return forex;
  return a.name.length - b.name.length || a.name.localeCompare(b.name);
}

/**
 * Umrechnungspaar zu `symbol` (Gewinnwährung P) für die Kontowährung A. Gesucht wird in der Symbolliste, nie am Namen:
 * - P = A: kein Paar nötig.
 * - base = P und Gewinnwährung = A: direktes Paar (GER40 → EURUSD), Gewinn × Kurs.
 * - base = A und Gewinnwährung = P: umgekehrtes Paar (EURCHF → USDCHF), Gewinn ÷ Kurs; ist es das Symbol selbst,
 *   kind 'self'.
 * Kein Kandidat oder fehlende Felder (älterer Worker ohne `currency_base`): null.
 */
export function pickConversionPair(symbols: readonly SymbolDetail[], symbol: SymbolDetail, accountCurrency: string | undefined): ConversionPair | null {
  const profit = upper(symbol.currency_profit);
  const account = upper(accountCurrency);
  if (!profit || !account) return null;
  if (profit === account) return { kind: 'none', name: '', invert: false };
  const usable = symbols.filter((s) => upper(s.currency_base) && upper(s.currency_profit));
  const direct = usable.filter((s) => upper(s.currency_base) === profit && upper(s.currency_profit) === account).sort(rank);
  const inverse = usable.filter((s) => upper(s.currency_base) === account && upper(s.currency_profit) === profit).sort(rank);
  // Gleicher Rang bei direktem und umgekehrtem Paar kommt nicht vor (ein Paar gibt es in einer Richtung); direkt gewinnt
  const best = direct[0] ?? inverse[0];
  if (!best) return null;
  const invert = direct.length === 0;
  if (upper(best.name) === upper(symbol.name)) return { kind: 'self', name: best.name, invert };
  return { kind: 'pair', name: best.name, invert };
}

/**
 * Kurs des Paars zur Zeit `time` (Sekunden): Schlusskurs der Kerze, die `time` enthält, oder der letzte davor.
 * Kauf: Bid, Verkauf: Ask. null = keine Kerze, oder die letzte ist älter als MAX_RATE_AGE_SEC.
 */
export function rateAt(series: RateSeries, time: number, buy: boolean): number | null {
  const n = series.t.length;
  let lo = 0;
  let hi = n - 1;
  if (n === 0 || series.t[0] > time) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series.t[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  if (time - (series.t[lo] + RATE_CANDLE_SEC) > MAX_RATE_AGE_SEC) return null;
  const bid = series.c[lo];
  if (buy) return bid;
  const spread = series.s[lo];
  return bid + (Number.isFinite(spread) && spread > 0 ? spread : 0) * series.point;
}
