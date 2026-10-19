/**
 * BKT-14: Live-Trades gegen Backtest-Trades desselben Zeitraums (Zone für Zone über die Magic-Nummer).
 * Reine Rechnung ohne React; die Seite lädt die Deals und übergibt die Läufe, der Worker speichert das Ergebnis.
 * Alle Zeiten sind MT5-Sekunden (Brokerzeit), Preise in Symbolpreisen, Gewinn in Kontowährung.
 */
import type { Trade, TradeEntry } from '@/lib/analysis/tradePairing';
import type { RunSettingsValue } from '@/lib/backtest/runSettings';

/** Die M1-Kerze, in der ein Einstieg liegt: Live und Backtest müssen in derselben Kerze einsteigen */
export const CANDLE_SEC = 60;
/** Weiter auseinander liegende Einstiege derselben Zone und Seite sind keine Paare, sondern fehlende Trades */
export const MATCH_WINDOW_SEC = 3600;
/** Gewinne unter diesem Betrag gelten als null (Rundung der Kommission) */
const ZERO_PROFIT = 0.01;

export interface Tolerance {
  /** Pro Symbol gleich viele Trades */
  sameTradeCount: boolean;
  /** Einstieg in derselben M1-Kerze */
  entrySameCandle: boolean;
  /** Ein- und Ausstiegspreis höchstens so viele Spreads auseinander */
  priceSpreadFactor: number;
  /** Gewinn je Symbol höchstens so viele Prozent vom Live-Gewinn entfernt */
  profitPercent: number;
}

/** Streng: gleiche Anzahl, gleiche Kerze, ±0,5 Spread, ±5 % Gewinn */
export const DEFAULT_TOLERANCE: Tolerance = { sameTradeCount: true, entrySameCandle: true, priceSpreadFactor: 0.5, profitPercent: 5 };

export interface TradeLite {
  side: 'buy' | 'sell';
  magic: number | null;
  volume: number;
  entryTime: number | null;
  entryPrice: number | null;
  exitTime: number;
  exitPrice: number;
  exitReason: number | null;
  net: number;
}

export type Deviation = 'entryCandle' | 'entryPrice' | 'exitPrice' | 'profit';

export interface Pair {
  magic: number | null;
  live: TradeLite;
  backtest: TradeLite;
  entryDeltaSec: number | null;
  entryPriceDelta: number | null;
  profitDeltaPercent: number | null;
  deviations: Deviation[];
}

export interface Metrics {
  trades: number;
  net: number;
  maxDrawdown: number;
  openPositions: number;
}

export interface SymbolRow {
  symbol: string;
  magics: number[];
  spreadPrice: number;
  /** Kommission je Lot, mit der der Lauf rechnete; fehlt in Berichten vor diesem Feld */
  commissionPerLot?: number | null;
  live: Metrics;
  backtest: Metrics;
  pairs: Pair[];
  unmatchedLive: TradeLite[];
  unmatchedBacktest: TradeLite[];
  profitDeltaPercent: number | null;
  countOk: boolean;
  entryOk: boolean;
  priceOk: boolean;
  profitOk: boolean;
  passed: boolean;
}

/** Ein übernommener Backtest-Lauf einer Zone */
export interface CollectedRun {
  magic: number;
  symbol: string;
  /** Zone wie im Dashboard gespeichert */
  zone: Record<string, unknown>;
  trades: Trade[];
  openPositions: number;
  /** Spread in Preis (Spread-Punkte × Punktgröße zum Start des Laufs) */
  spreadPrice: number;
  /** Kommission je Lot, mit der der Lauf rechnete (Eingabe oder Vorschlag aus dem Archiv) */
  commissionPerLot: number;
  form: RunSettingsValue;
  from: number;
  to: number;
  currency: string | null;
}

export interface LiveData {
  trades: Trade[];
  entries: TradeEntry[];
}

export function toLite(trade: Trade): TradeLite {
  return {
    side: trade.side, magic: trade.magic, volume: trade.volume, entryTime: trade.entryTime, entryPrice: trade.entryPrice,
    exitTime: trade.exitTime, exitPrice: trade.exitPrice, exitReason: trade.exitReason, net: trade.net,
  };
}

const sortKey = (trade: TradeLite) => trade.entryTime ?? trade.exitTime;
const byTime = (a: TradeLite, b: TradeLite) => sortKey(a) - sortKey(b) || a.exitTime - b.exitTime;
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Größter Rückgang der laufenden Summe geschlossener Trades (nach Ausstiegszeit), positiv */
export function maxDrawdownOf(trades: readonly TradeLite[]): number {
  let sum = 0;
  let peak = 0;
  let worst = 0;
  for (const trade of [...trades].sort((a, b) => a.exitTime - b.exitTime)) {
    sum += trade.net;
    if (sum > peak) peak = sum;
    else worst = Math.max(worst, peak - sum);
  }
  return round(worst);
}

function metricsOf(trades: readonly TradeLite[], openPositions: number): Metrics {
  return { trades: trades.length, net: round(trades.reduce((sum, trade) => sum + trade.net, 0)), maxDrawdown: maxDrawdownOf(trades), openPositions };
}

/** Abweichung von `base` in Prozent; null, wenn `base` null ist und `value` nicht */
function percentDelta(base: number, value: number): number | null {
  if (Math.abs(base) < ZERO_PROFIT) return Math.abs(value) < ZERO_PROFIT ? 0 : null;
  return round(((value - base) / Math.abs(base)) * 100);
}

function profitWithin(base: number, value: number, percent: number): boolean {
  const delta = percentDelta(base, value);
  return delta !== null && Math.abs(delta) <= percent;
}

/** Obergrenze für die Größe der Zuordnungstabelle (Live × Backtest je Zone und Seite); darüber paart die Reihenfolge gierig */
const MAX_ALIGN_CELLS = 4_000_000;
/** Ein Paar zählt mehr als jede mögliche Summe von Zeitabständen (höchstens MATCH_WINDOW_SEC je Paar) */
const PAIR_WEIGHT = 1e9;

/** Reihenfolge-treue Zuordnung: zuerst möglichst viele Paare, dann die kleinste Summe der Zeitabstände */
function alignByTime(a: readonly TradeLite[], b: readonly TradeLite[]): [number, number][] {
  const width = b.length + 1;
  const best = new Float64Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const gap = Math.abs(sortKey(a[i]) - sortKey(b[j]));
      const skip = Math.max(best[(i + 1) * width + j], best[i * width + j + 1]);
      best[i * width + j] = gap <= MATCH_WINDOW_SEC ? Math.max(skip, PAIR_WEIGHT - gap + best[(i + 1) * width + j + 1]) : skip;
    }
  }
  const matched: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const gap = Math.abs(sortKey(a[i]) - sortKey(b[j]));
    if (gap <= MATCH_WINDOW_SEC && best[i * width + j] === PAIR_WEIGHT - gap + best[(i + 1) * width + j + 1]) {
      matched.push([i++, j++]);
    } else if (best[(i + 1) * width + j] >= best[i * width + j + 1]) i++;
    else j++;
  }
  return matched;
}

/** Gierige Paarung für sehr große Listen: der n-te Live-Trade zum n-ten Backtest-Trade, solange sie im Fenster liegen */
function alignGreedy(a: readonly TradeLite[], b: readonly TradeLite[]): [number, number][] {
  const matched: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const gap = sortKey(a[i]) - sortKey(b[j]);
    if (Math.abs(gap) <= MATCH_WINDOW_SEC) matched.push([i++, j++]);
    else if (gap < 0) i++;
    else j++;
  }
  return matched;
}

/**
 * Paart Live- und Backtest-Trades einer Zone: je Seite nach Einstiegszeit geordnet, die Reihenfolge bleibt erhalten,
 * zwei Trades bilden ein Paar nur, wenn sie höchstens MATCH_WINDOW_SEC auseinander liegen. Gewählt wird die Zuordnung
 * mit den meisten Paaren und dann der kleinsten Summe der Zeitabstände: gleiche Zahl von Trades mit versetzten Zeiten
 * ergibt Paare, ein fehlender Trade nur eine Lücke und verschiebt die übrigen Paare nicht.
 */
export function pairByOrder(live: readonly TradeLite[], backtest: readonly TradeLite[]) {
  const pairs: { live: TradeLite; backtest: TradeLite }[] = [];
  const unmatchedLive: TradeLite[] = [];
  const unmatchedBacktest: TradeLite[] = [];
  for (const side of ['buy', 'sell'] as const) {
    const a = live.filter((trade) => trade.side === side).sort(byTime);
    const b = backtest.filter((trade) => trade.side === side).sort(byTime);
    const matched = (a.length + 1) * (b.length + 1) <= MAX_ALIGN_CELLS ? alignByTime(a, b) : alignGreedy(a, b);
    const usedLive = new Set(matched.map(([i]) => i));
    const usedBacktest = new Set(matched.map(([, j]) => j));
    for (const [i, j] of matched) pairs.push({ live: a[i], backtest: b[j] });
    unmatchedLive.push(...a.filter((_, i) => !usedLive.has(i)));
    unmatchedBacktest.push(...b.filter((_, j) => !usedBacktest.has(j)));
  }
  return { pairs, unmatchedLive, unmatchedBacktest };
}

function comparePair(live: TradeLite, backtest: TradeLite, spreadPrice: number, tolerance: Tolerance): Pair {
  const limit = tolerance.priceSpreadFactor * spreadPrice;
  const deviations: Deviation[] = [];
  const entryKnown = live.entryTime !== null && backtest.entryTime !== null;
  const entryDeltaSec = entryKnown ? backtest.entryTime! - live.entryTime! : null;
  if (!entryKnown || Math.floor(live.entryTime! / CANDLE_SEC) !== Math.floor(backtest.entryTime! / CANDLE_SEC)) deviations.push('entryCandle');
  const entryPriceDelta = live.entryPrice !== null && backtest.entryPrice !== null ? round(backtest.entryPrice - live.entryPrice) : null;
  if (entryPriceDelta === null || Math.abs(entryPriceDelta) > limit + 1e-9) deviations.push('entryPrice');
  if (Math.abs(backtest.exitPrice - live.exitPrice) > limit + 1e-9) deviations.push('exitPrice');
  const profitDeltaPercent = percentDelta(live.net, backtest.net);
  if (profitDeltaPercent === null || Math.abs(profitDeltaPercent) > tolerance.profitPercent) deviations.push('profit');
  return { magic: live.magic ?? backtest.magic, live, backtest, entryDeltaSec, entryPriceDelta, profitDeltaPercent, deviations };
}

/**
 * Vergleich je Symbol. Live-Trades gehören zu einem Symbol, wenn ihre Magic-Nummer zu einer übernommenen Zone dieses
 * Symbols gehört; andere Trades des Kontos (Hand-Trades, andere Zonen) zählen nicht mit.
 */
export function buildSymbolRows(runs: readonly CollectedRun[], live: LiveData, tolerance: Tolerance): SymbolRow[] {
  const symbols = [...new Set(runs.map((run) => run.symbol))];
  return symbols.map((symbol) => {
    const own = runs.filter((run) => run.symbol === symbol);
    const magics = [...new Set(own.map((run) => run.magic))].sort((a, b) => a - b);
    const spreadPrice = Math.max(...own.map((run) => run.spreadPrice));
    const commissionPerLot = Math.max(...own.map((run) => run.commissionPerLot));
    const liveTrades = live.trades.filter((trade) => trade.magic !== null && magics.includes(trade.magic)).map(toLite);
    const backtestTrades = own.flatMap((run) => run.trades.map(toLite));
    const livePositions = live.entries.filter((entry) => entry.magic !== null && magics.includes(entry.magic) && !entry.closed).length;

    const pairs: Pair[] = [];
    const unmatchedLive: TradeLite[] = [];
    const unmatchedBacktest: TradeLite[] = [];
    for (const magic of magics) {
      const matched = pairByOrder(liveTrades.filter((trade) => trade.magic === magic), backtestTrades.filter((trade) => trade.magic === magic));
      pairs.push(...matched.pairs.map((pair) => comparePair(pair.live, pair.backtest, spreadPrice, tolerance)));
      unmatchedLive.push(...matched.unmatchedLive);
      unmatchedBacktest.push(...matched.unmatchedBacktest);
    }
    pairs.sort((a, b) => sortKey(a.live) - sortKey(b.live));

    const liveMetrics = metricsOf(liveTrades, livePositions);
    const backtestMetrics = metricsOf(backtestTrades, own.reduce((sum, run) => sum + run.openPositions, 0));
    const countOk = !tolerance.sameTradeCount || liveMetrics.trades === backtestMetrics.trades;
    const entryOk = !tolerance.entrySameCandle
      || (unmatchedLive.length === 0 && unmatchedBacktest.length === 0 && pairs.every((pair) => !pair.deviations.includes('entryCandle')));
    const priceOk = pairs.every((pair) => !pair.deviations.includes('entryPrice') && !pair.deviations.includes('exitPrice'));
    const profitOk = profitWithin(liveMetrics.net, backtestMetrics.net, tolerance.profitPercent);
    return {
      symbol, magics, spreadPrice, commissionPerLot, live: liveMetrics, backtest: backtestMetrics, pairs, unmatchedLive, unmatchedBacktest,
      profitDeltaPercent: percentDelta(liveMetrics.net, backtestMetrics.net),
      countOk, entryOk, priceOk, profitOk, passed: countOk && entryOk && priceOk && profitOk,
    };
  });
}

/** Zonen als flache Werte für den Bericht: verschachtelte Werte (Listen, Objekte) bleiben weg */
export function flatZone(zone: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(zone)) {
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 200);
  }
  return out;
}

/** Fehlender Bereich des Deal-Archivs beim Erstellen des Berichts (MT5-Sekunden) */
export interface ArchiveGap {
  start: number;
  end: number;
  reason: string;
}

/** Was der Worker je Bericht speichert (Spiegel von worker_python/src/api/backtest_reports.py: ReportCreate) */
export interface ReportContent {
  appVersion: string;
  /** Kontowährung der Gewinne; null = unbekannt */
  currency: string | null;
  tolerance: Tolerance;
  run: RunSettingsValue;
  zones: Record<string, string | number | boolean | null>[];
  symbols: SymbolRow[];
  /** Fehlt in Berichten vor diesem Feld */
  archiveGaps?: ArchiveGap[];
}

export interface ReportSummary {
  id: string;
  name: string;
  note: string;
  accountId: string;
  periodFrom: number;
  periodTo: number;
  workerVersion: string;
  createdAt: number;
  owner: string;
  symbolCount: number;
  passedCount: number;
}

export type Report = ReportSummary & ReportContent;
