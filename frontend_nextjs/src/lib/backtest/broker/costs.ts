/**
 * Kosten des Backtests (BKT-04, docs/analyse-regeln.md §6): Schnappschuss der Symbolwerte, Gewinn, Kommission,
 * Swap und Spread. Alle Beträge sind Kontowährung. Gewinn und Kommission eines Trades stehen auf Cent wie die Deals
 * von MT5; der Swap je Nacht ist ungerundet, gerundet wird erst beim Buchen je Rollover (PathBroker.rollover).
 *
 * - Ein fehlender Kostenwert blockiert den Lauf; es gibt keinen Ersatzwert (docs/journal/2026-10-06-backtest-module-plan.md, B1).
 * - Der Spread steckt in den Füllpreisen (Ask = Bid + Spread). Er wird nie als eigene Kostenzeile abgezogen.
 * - Swap: `swap_mode` 0 (aus), 1 (Punkte) und 4 (Geld in Kontowährung) sind unterstützt. Die Nummern stehen nicht
 *   in der MQL5-Dokumentation, nur die Namen in einer Reihenfolge (DISABLED, POINTS, CURRENCY_SYMBOL, CURRENCY_MARGIN,
 *   CURRENCY_DEPOSIT, …): Nummer 0, 1 und 4 sind der erste, zweite und fünfte Name. Nicht gegen MT5 geprüft.
 *   Alle anderen Modi blockieren den Lauf, wenn Swap an ist.
 * - Der Dreifach-Tag muss ein Wochentag von Montag bis Freitag sein; Samstag und Sonntag kosten keine Nacht.
 */
import type { SymbolDetail } from '@/store/types';
import { pyRound } from '@/lib/backtest/engine/pyRound';
import type { SymbolInfo } from '@/lib/backtest/engine/types';
import type { RunProblem } from '@/lib/backtest/runContext';

/** MT5 SYMBOL_CALC_MODE_*: Forex, CFD, CFD-Index, CFD mit Hebel, Forex ohne Hebel (docs/analyse-regeln.md §6) */
export const SUPPORTED_CALC_MODES: readonly number[] = [0, 2, 3, 4, 5];

export const SWAP_MODE_DISABLED = 0;
export const SWAP_MODE_POINTS = 1;
export const SWAP_MODE_DEPOSIT = 4;

export interface SwapRates {
  mode: typeof SWAP_MODE_POINTS | typeof SWAP_MODE_DEPOSIT;
  long: number;
  short: number;
  /** Wochentag des dreifachen Swaps (0 = Sonntag … 6 = Samstag) */
  rollover3days: number;
}

export interface SymbolCosts {
  point: number;
  digits: number;
  tickSize: number;
  /** Wert eines Ticks bei 1 Lot, für Gewinn bzw. Verlust */
  tickValueProfit: number;
  tickValueLoss: number;
  /** null = Swap aus (Einstellung oder Modus 0) */
  swap: SwapRates | null;
}

export interface SymbolSnapshot {
  info: SymbolInfo;
  costs: SymbolCosts;
  /** Aktueller Spread in Punkten (Ersatz für Kerzen ohne Spread-Wert); null = MT5 liefert ihn nicht */
  spreadPoints: number | null;
  currencyProfit: string | null;
  calcMode: number;
}

export interface SnapshotOptions {
  swapEnabled: boolean;
  /** Berechnungsart außerhalb von SUPPORTED_CALC_MODES trotzdem zulassen (Näherungsmodus) */
  approximate: boolean;
}

export type SnapshotResult = { snapshot: SymbolSnapshot; warnings: RunProblem[] } | { problems: RunProblem[] };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function snapshotSymbol(detail: SymbolDetail, options: SnapshotOptions): SnapshotResult {
  const missing: string[] = [];
  /** Wert prüfen; `kind`: positive Zahl, ganze Zahl ab 0 oder beliebige Zahl */
  const need = (name: string, value: unknown, kind: 'positive' | 'wholeNonNegative' | 'any'): number => {
    const valid =
      isNum(value) &&
      (kind === 'any' || (kind === 'positive' ? value > 0 : Number.isInteger(value) && value >= 0));
    if (!valid) {
      missing.push(name);
      return 0;
    }
    return value as number;
  };
  const info: SymbolInfo = {
    name: detail.name,
    point: need('point', detail.point, 'positive'),
    digits: need('digits', detail.digits, 'wholeNonNegative'),
    volume_min: need('volume_min', detail.volume_min, 'positive'),
    volume_max: need('volume_max', detail.volume_max, 'positive'),
    volume_step: need('volume_step', detail.volume_step, 'positive'),
    trade_stops_level: need('trade_stops_level', detail.trade_stops_level, 'wholeNonNegative'),
    trade_contract_size: need('trade_contract_size', detail.trade_contract_size, 'positive'),
    trade_tick_size: need('trade_tick_size', detail.trade_tick_size, 'positive'),
    trade_tick_value: need('trade_tick_value', detail.trade_tick_value, 'positive'),
  };
  const calcMode = need('trade_calc_mode', detail.trade_calc_mode, 'wholeNonNegative');
  const tickValueProfit = need('trade_tick_value_profit', detail.trade_tick_value_profit, 'positive');
  const tickValueLoss = need('trade_tick_value_loss', detail.trade_tick_value_loss, 'positive');

  let swap: SwapRates | null = null;
  const problems: RunProblem[] = [];
  if (options.swapEnabled) {
    const mode = need('swap_mode', detail.swap_mode, 'wholeNonNegative');
    const swapModeKnown = detail.swap_mode != null;
    if (swapModeKnown && mode !== SWAP_MODE_DISABLED) {
      const long = need('swap_long', detail.swap_long, 'any');
      const short = need('swap_short', detail.swap_short, 'any');
      const rollover3days = need('swap_rollover3days', detail.swap_rollover3days, 'wholeNonNegative');
      const tripleDayKnown = Number.isInteger(detail.swap_rollover3days);
      if (tripleDayKnown && (rollover3days < 1 || rollover3days > 5)) problems.push({ code: 'run.swapTripleDayInvalid', params: { day: rollover3days } });
      if (mode === SWAP_MODE_POINTS || mode === SWAP_MODE_DEPOSIT) swap = { mode, long, short, rollover3days };
      else problems.push({ code: 'run.swapModeUnsupported', params: { mode } });
    }
  }
  if (missing.length > 0) problems.push({ code: 'run.symbolFieldMissing', params: { symbol: detail.name, fields: missing } });

  const warnings: RunProblem[] = [];
  if (!SUPPORTED_CALC_MODES.includes(calcMode)) {
    if (options.approximate) warnings.push({ code: 'run.calcModeApproximate', params: { mode: calcMode } });
    else problems.push({ code: 'run.calcModeUnsupported', params: { mode: calcMode } });
  }
  if (problems.length > 0) return { problems };

  return {
    snapshot: {
      info,
      costs: { point: info.point, digits: info.digits, tickSize: info.trade_tick_size, tickValueProfit, tickValueLoss, swap },
      spreadPoints: isNum(detail.spread) ? detail.spread : null,
      currencyProfit: detail.currency_profit,
      calcMode,
    },
    warnings,
  };
}

/** Betrag auf Cent; vermeidet -0 */
export function cents(x: number): number {
  const r = pyRound(x, 2);
  return r === 0 ? 0 : r;
}

/** Gewinn einer Position (ohne Kommission und Swap), ungerundet: Preisdifferenz in Ticks × Tickwert × Lot */
export function profitRaw(c: SymbolCosts, buy: boolean, volume: number, open: number, close: number): number {
  const diff = buy ? close - open : open - close;
  const perTick = diff >= 0 ? c.tickValueProfit : c.tickValueLoss;
  // Ticks auf 6 Stellen: Preisrauschen (100,35 − 100 = 34,99999999999943 Ticks) soll keinen Cent kippen
  const ticks = Math.round((diff / c.tickSize) * 1e6) / 1e6;
  return ticks * perTick * volume;
}

/** Gewinn einer geschlossenen Position auf Cent, wie der Deal bei MT5 */
export function profitOf(c: SymbolCosts, buy: boolean, volume: number, open: number, close: number): number {
  return cents(profitRaw(c, buy, volume, open, close));
}

/** Kosten des Spreads für `volume` Lot, nur zur Anzeige ("davon Spread"): Preisabstand in Ticks × Verlust-Tickwert */
export function spreadCost(c: SymbolCosts, spreadPrice: number, volume: number): number {
  return cents((spreadPrice / c.tickSize) * c.tickValueLoss * volume);
}

/** Kommission einer Hälfte (Einstieg oder Ausstieg) für `volume` Lot; negativ wie bei MT5 */
export function commissionHalf(perLot: number, volume: number): number {
  const half = cents((perLot * volume) / 2);
  return half === 0 ? 0 : -half;
}

/** Swap einer Nacht für eine Position (positiv = Gutschrift), ohne Dreifach-Faktor */
export function swapPerNight(swap: SwapRates, c: SymbolCosts, buy: boolean, volume: number): number {
  const rate = buy ? swap.long : swap.short;
  if (swap.mode === SWAP_MODE_DEPOSIT) return rate * volume;
  const perTick = rate >= 0 ? c.tickValueProfit : c.tickValueLoss;
  return rate * c.point * (perTick / c.tickSize) * volume;
}

const DAY_SEC = 86400;
/** Brokertag einer MT5-Zeit (Sekunden); Tag 0 = 1970-01-01 */
export const brokerDay = (time: number): number => Math.floor(time / DAY_SEC);
/** 0 = Sonntag … 6 = Samstag (1970-01-01 war ein Donnerstag) */
export const weekdayOfDay = (day: number): number => (((day + 4) % 7) + 7) % 7;

/**
 * Wie viele Nächte der Wechsel von `day` auf `day + 1` kostet: Samstag und Sonntag 0, der Dreifach-Tag 3,
 * sonst 1. Eine Woche zählt so 7 Nächte (das Wochenende steckt im Dreifach-Tag).
 */
export function swapNights(day: number, rollover3days: number): number {
  const weekday = weekdayOfDay(day);
  if (weekday === 0 || weekday === 6) return 0;
  return weekday === rollover3days ? 3 : 1;
}

export type SpreadSetting = { mode: 'candle' } | { mode: 'fixed'; points: number } | { mode: 'max'; points: number };

/**
 * Spread einer Kerze in Punkten; null = nicht bestimmbar. Ein Kerzenwert von null, NaN (CSV-Import) oder 0 gilt als
 * unbekannt: MT5 liefert 0, wenn der Broker den Spread der Kerze nicht aufgezeichnet hat.
 */
export function candleSpreadPoints(setting: SpreadSetting, candleValue: number | null): number | null {
  if (setting.mode === 'fixed') return setting.points;
  const candle = candleValue === null || !(candleValue > 0) ? null : candleValue;
  if (candle === null) return setting.mode === 'max' ? setting.points : null;
  return setting.mode === 'max' ? Math.max(setting.points, candle) : candle;
}
