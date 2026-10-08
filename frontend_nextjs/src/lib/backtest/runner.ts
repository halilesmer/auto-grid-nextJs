/**
 * Backtest-Lauf (B4): spielt die Kerzen über den Kerzenpfad ab und ruft den Bot-Nachbau (engine/) auf.
 * Reiner Rechenkern ohne Web-Worker-API; backtest.worker.ts lädt die Kerzen und ruft ihn auf.
 *
 * Ablauf je Kerze (docs/analyse-regeln.md §5): Swap für überschrittene Mitternächte, Sprung vom letzten Schluss zur
 * Eröffnung (Kurslücke), dann Wegstück für Wegstück: alle Auslösungen (Order, TP, SL) in Preis-Reihenfolge, nach
 * jeder ein Bot-Durchlauf; am Ende des Wegstücks noch einmal. Bot-Durchläufe gibt es außerdem, wenn der Kurs eine
 * Zonengrenze überquert. Nichts wird übersprungen: mehr als 100.000 Ereignisse in einer Kerze brechen den Lauf ab.
 */
import type { MissingRange } from '@/lib/analysis/candles';
import type { CurvePoint } from '@/lib/analysis/curves';
import type { Trade } from '@/lib/analysis/tradePairing';
import type { Excursion } from '@/lib/analysis/excursions';
import { candleSpreadPoints, cents, type SpreadSetting, type SymbolSnapshot } from '@/lib/backtest/broker/costs';
import { PathBroker, type FillModel } from '@/lib/backtest/broker/pathBroker';
import type { LoadedRates } from '@/lib/backtest/candles/loadRates';
import { candleWaypoints, waypointTimes, type PathMode } from '@/lib/backtest/candles/pathModel';
import { manageDynamicGrid, type ActiveZones } from '@/lib/backtest/engine/orchestrator';
import { EngineState } from '@/lib/backtest/engine/state';
import { TF_SECONDS, type Timeframe, type ZoneDict } from '@/lib/backtest/engine/types';
import { toTimeframe, zget } from '@/lib/backtest/engine/helpers';
import { zoneSymbolOf } from '@/lib/backtest/engine/zoneSelector';
import { RunError, RunLog, type RunLogLine } from '@/lib/backtest/runContext';
import { downsampleCurve, EquityTrack, type RunSummary } from '@/lib/backtest/runSummary';

export const MAX_EVENTS_PER_CANDLE = 100_000;
/** So viele Punkte behält die Equity-Kurve höchstens (Tief und Hoch je Gruppe bleiben) */
export const EQUITY_CURVE_POINTS = 20_000;
/** Der Bot liest höchstens 301 Kerzen des Strategie-Zeitrahmens (fractal_entry.py RATES_COUNT + 1) */
const BOT_BARS = 301;
const PROGRESS_EVERY = 5000;

export interface RunModel {
  fill: FillModel;
  /** Bei gleichem Auslösepreis zählt der SL vor dem TP (konservativ) */
  slFirst: boolean;
  path: PathMode;
  closeAtEnd: boolean;
}

export interface RunInput {
  /** Kopie der Zone; der Lauf setzt `is_active` auf true, damit eine inaktive Zone keinen leeren Lauf ergibt */
  zone: ZoneDict;
  snapshot: SymbolSnapshot;
  /** Kerzen der Datenauflösung inklusive Vorlauf vor `from` */
  rates: LoadedRates;
  dataTimeframe: Timeframe;
  /** Zeitraum [from, to), MT5-Sekunden; Kerzen davor sind nur Vorlauf für die Zeitrahmen des Bots */
  from: number;
  to: number;
  spread: SpreadSetting;
  commissionPerLot: number;
  model: RunModel;
  /** Kontostand zu Beginn für die Equity-Kurve; ohne Angabe 0 (Kurve = Gewinn/Verlust) */
  startCapital?: number;
  accountCurrency?: string;
  zoneLabel?: string | null;
  /** Meldungen vor dem Lauf (z. B. aus dem Schnappschuss), kommen vorn ins Protokoll */
  notes?: { code: string; params?: Record<string, unknown> }[];
  onProgress?: (fraction: number) => void;
  /** Obergrenze der Ereignisse je Kerze; Standard MAX_EVENTS_PER_CANDLE (nur der Test setzt einen kleineren Wert) */
  maxEventsPerCandle?: number;
}

export interface RunResult {
  trades: Trade[];
  /** Exakte MFE/MAE aus dem Kerzenpfad des Simulators, ohne erneuten M1-Abruf. */
  excursions: Record<string, Excursion>;
  /** Equity (Startkapital + realisiert + offen) am Ende jeder Kerze, auf höchstens EQUITY_CURVE_POINTS Punkte reduziert */
  equity: CurvePoint[];
  summary: RunSummary;
  log: { lines: RunLogLine[]; counts: Record<string, number>; dropped: number };
  candles: number;
  /** Mittlere Spanne (Hoch − Tief) der Kerzen im Zeitraum, in Preis; die Seite warnt, wenn der Grid-Abstand kleiner ist */
  avgRange: number;
  missing: MissingRange[];
  path: PathMode;
}

/** Zeitrahmen, die der bot für diese Zone liest (Spiegel von config.ts: fractal_timeframe Standard H4) */
export function strategyTimeframes(zone: ZoneDict): Timeframe[] {
  const found = new Set<Timeframe>([toTimeframe(zget(zone, 'exit_timeframe', 'M15'))]);
  if (zone.entry_mode === 'fractal') {
    const raw = zone.fractal_timeframe;
    found.add(typeof raw === 'string' && raw in TF_SECONDS ? (raw as Timeframe) : 'H4');
  }
  return [...found];
}

/**
 * Vorlauf vor dem Zeitraum in Sekunden, damit der Bot beim ersten Durchlauf seine Kerzen hat: 301 Kerzen des
 * Fraktal-Zeitrahmens (+ 40 % für Wochenenden), höchstens 100.000 Kerzen der Datenauflösung.
 */
export function warmupSeconds(zone: ZoneDict, dataTimeframe: Timeframe): number {
  const tfs = strategyTimeframes(zone);
  const longest = Math.max(...tfs.map((tf) => TF_SECONDS[tf]));
  const bars = zone.entry_mode === 'fractal' ? BOT_BARS : 3;
  return Math.min(Math.ceil(bars * longest * 1.4), 100_000 * TF_SECONDS[dataTimeframe]);
}

/** Wacheinstiege des Bots an den Zonengrenzen: der Bot prüft den Mittelkurs (Bid + Spread/2) gegen min/max */
function wakeLevels(zone: ZoneDict, point: number, digits: number, spreadPrice: number): number[] {
  const factor = 10 ** digits;
  const levels: number[] = [];
  for (const key of ['min_price', 'max_price']) {
    const bound = Number(zget(zone, key, 0));
    if (!Number.isFinite(bound) || bound <= 0) continue;
    const steps = (bound - spreadPrice / 2) / point;
    // Liegt der Quotient (Gleitkomma-Rauschen) knapp unter einer ganzen Zahl, zählt die ganze Zahl (auch bei BTC: 1e7 Stufen)
    const nearest = Math.round(steps);
    const below = (Math.abs(steps - nearest) < 1e-6 ? nearest : Math.floor(steps)) * point;
    levels.push(Math.round(below * factor) / factor, Math.round((below + point) * factor) / factor);
  }
  return levels.sort((a, b) => a - b);
}

function nextWake(levels: readonly number[], cur: number, to: number): number | null {
  if (to > cur) return levels.find((w) => w > cur && w <= to) ?? null;
  if (to < cur) {
    for (let i = levels.length - 1; i >= 0; i--) if (levels[i] < cur && levels[i] >= to) return levels[i];
  }
  return null;
}

function averageRange(rates: LoadedRates, first: number, end: number): number {
  let sum = 0;
  for (let i = first; i < end; i++) sum += rates.h[i] - rates.l[i];
  return sum / (end - first);
}

export function runBacktest(input: RunInput): RunResult {
  const { snapshot, rates, dataTimeframe, model } = input;
  const dataSec = TF_SECONDS[dataTimeframe];
  const symbol = zoneSymbolOf(input.zone);
  if (!symbol) throw new RunError('run.noSymbol');
  if (symbol !== snapshot.info.name.toUpperCase().trim()) {
    throw new RunError('run.symbolMismatch', { zone: symbol, symbol: snapshot.info.name });
  }
  const timeframes = strategyTimeframes(input.zone);
  for (const timeframe of timeframes) {
    if (TF_SECONDS[timeframe] < dataSec || TF_SECONDS[timeframe] % dataSec !== 0) {
      throw new RunError('run.timeframeFinerThanData', { timeframe, data: dataTimeframe });
    }
  }

  const n = rates.t.length;
  let first = 0;
  while (first < n && rates.t[first] < input.from) first++;
  let end = first;
  while (end < n && rates.t[end] < input.to) end++;
  if (end === first) throw new RunError('run.noCandles', { from: input.from, to: input.to });

  const log = new RunLog();
  log.add('INFO', 'run.marginNotChecked');
  log.add('INFO', 'run.rejectsNotSimulated');
  log.add('INFO', 'run.stopsLevelNotSimulated', { stopsLevel: snapshot.info.trade_stops_level });
  log.add('INFO', 'run.costsEstimated');
  if (input.accountCurrency && snapshot.currencyProfit && input.accountCurrency !== snapshot.currencyProfit) {
    log.add('INFO', 'run.currencyToday', { profit: snapshot.currencyProfit, account: input.accountCurrency });
  }
  for (const note of input.notes ?? []) log.add('WARN', note.code, note.params);
  if (rates.liveFrom !== null) log.add('WARN', 'run.liveCandleDropped', { time: rates.liveFrom });
  for (const gap of rates.missing) log.add('WARN', 'run.dataMissing', { from: gap.from, to: gap.to, reason: gap.reason });

  const zone: ZoneDict = { ...input.zone, is_active: true };
  const info = { ...snapshot.info, name: symbol };
  const broker = new PathBroker({
    info,
    costs: snapshot.costs,
    start: rates.t[first],
    firstBid: rates.o[first],
    fill: model.fill,
    commissionPerLot: input.commissionPerLot,
    slFirst: model.slFirst,
    timeframes: timeframes.map((name) => ({ name, sec: TF_SECONDS[name] })),
    zoneLabel: () => input.zoneLabel ?? null,
  });
  for (let i = 0; i < first; i++) {
    broker.warm({ time: rates.t[i], open: rates.o[i], high: rates.h[i], low: rates.l[i], close: rates.c[i] });
  }

  const state = new EngineState(
    () => broker.now,
    (entry) => log.add(entry.level, entry.code, entry.params, broker.now),
  );
  const zones = [zone];
  const infos = broker.symbolInfos();
  let active: ActiveZones = {};
  const runBot = () => {
    [, active] = manageDynamicGrid(broker, zones, active, infos, state);
  };

  const capital = input.startCapital ?? 0;
  const track = new EquityTrack(capital);
  let spreadFallbacks = 0;
  let prevClose = rates.o[first];
  let prevTime = rates.t[first];
  const total = end - first;
  const eventLimit = input.maxEventsPerCandle ?? MAX_EVENTS_PER_CANDLE;

  for (let i = first; i < end; i++) {
    if ((i - first) % PROGRESS_EVERY === 0) input.onProgress?.((i - first) / total);
    const t0 = rates.t[i];
    const tEnd = t0 + dataSec - 1;
    let spreadPoints = candleSpreadPoints(input.spread, rates.s[i]);
    if (spreadPoints === null) {
      spreadPoints = snapshot.spreadPoints;
      if (spreadPoints === null) throw new RunError('run.spreadMissing', { time: t0 });
      spreadFallbacks += 1;
    }

    broker.rollover(prevTime, t0);
    broker.beginCandle(t0, rates.o[i], spreadPoints);
    const way = candleWaypoints(rates.o[i], rates.h[i], rates.l[i], rates.c[i], model.path);
    const times = waypointTimes(way, t0, tEnd);
    const wakes = wakeLevels(zone, info.point, info.digits, broker.spreadPrice);
    let events = 0;
    const countEvent = () => {
      events += 1;
      if (events > eventLimit) throw new RunError('run.tooManyEvents', { time: t0, limit: eventLimit });
    };

    /** Von `a` nach `b` laufen; `jump`: Kurslücke, alles Überquerte füllt auf einmal zum Marktpreis */
    const traverse = (a: number, b: number, ta: number, tb: number, jump: boolean) => {
      const timeAt = (price: number) => (b === a ? ta : ta + ((tb - ta) * (price - a)) / (b - a));
      let cur = a;
      if (jump) broker.setMarket(b, ta);
      for (;;) {
        const trigger = broker.nextTrigger(cur, b);
        const wake = jump ? null : nextWake(wakes, cur, b);
        const triggerFirst = trigger !== null && (wake === null || (b > cur ? trigger.bid <= wake : trigger.bid >= wake));
        if (trigger !== null && triggerFirst) {
          countEvent();
          if (!jump) broker.setMarket(trigger.bid, timeAt(trigger.bid));
          broker.fire(trigger, jump || trigger.immediate);
          cur = trigger.bid;
          if (!jump) runBot();
        } else if (wake !== null) {
          countEvent();
          broker.setMarket(wake, timeAt(wake));
          cur = wake;
          runBot();
        } else {
          break;
        }
      }
      broker.setMarket(b, tb);
      runBot();
    };

    traverse(prevClose, way[0], t0, t0, true);
    for (let k = 1; k < way.length; k++) traverse(way[k - 1], way[k], times[k - 1], times[k], false);

    broker.endCandle();
    track.add(tEnd, capital + broker.equity());
    prevClose = rates.c[i];
    prevTime = tEnd;
  }

  if (spreadFallbacks > 0) log.add('WARN', 'run.spreadFallback', { candles: spreadFallbacks, points: snapshot.spreadPoints });
  if (model.closeAtEnd) {
    broker.closeAll();
    track.add(prevTime, capital + broker.equity());
  }
  input.onProgress?.(1);

  const trades = broker.trades;
  const summary: RunSummary = {
    realized: broker.realized,
    openResult: broker.openResult(),
    endEquity: capital + broker.equity(),
    startCapital: capital,
    openPositions: broker.openCount,
    closedAtEnd: model.closeAtEnd,
    maxDrawdown: track.maxDrawdown,
    trades: trades.length,
    commission: cents(trades.reduce((sum, tr) => sum + tr.commission, 0)),
    swap: cents(trades.reduce((sum, tr) => sum + tr.swap, 0)),
    spreadInfo: broker.spreadInfo,
  };
  return {
    trades,
    excursions: broker.excursions,
    equity: downsampleCurve(track.times, track.values, EQUITY_CURVE_POINTS),
    summary,
    log: { lines: log.lines, counts: log.counts, dropped: log.dropped },
    candles: total,
    avgRange: averageRange(rates, first, end),
    missing: rates.missing,
    path: model.path,
  };
}
