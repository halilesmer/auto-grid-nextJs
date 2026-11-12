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
import { PathBroker, type FillModel, type InitialOrder, type InitialPosition, type MinuteQuotes } from '@/lib/backtest/broker/pathBroker';
import { tradeOpenAt } from '@/lib/backtest/broker/tradeSessions';
import type { LoadedRates } from '@/lib/backtest/candles/loadRates';
import { candleWaypoints, waypointTimes, type PathMode } from '@/lib/backtest/candles/pathModel';
import { manageDynamicGrid, type ActiveZones } from '@/lib/backtest/engine/orchestrator';
import { EngineState } from '@/lib/backtest/engine/state';
import { TF_SECONDS, type Timeframe, type ZoneDict } from '@/lib/backtest/engine/types';
import { toTimeframe, zget, zoneLogId } from '@/lib/backtest/engine/helpers';
import { BOT_REACT_DELAY_S, sltpDelaySeconds } from '@/lib/backtest/botDelay';
import { zoneSymbolOf } from '@/lib/backtest/engine/zoneSelector';
import { RunError, RunLog, type RunLogLine } from '@/lib/backtest/runContext';
import { downsampleCurve, EquityTrack, type RunSummary } from '@/lib/backtest/runSummary';

export const MAX_EVENTS_PER_CANDLE = 100_000;
/** So viele Punkte behält die Equity-Kurve höchstens (Tief und Hoch je Gruppe bleiben) */
export const EQUITY_CURVE_POINTS = 20_000;
/** Der Bot liest höchstens 301 Kerzen des Strategie-Zeitrahmens (fractal_entry.py RATES_COUNT + 1) */
const BOT_BARS = 301;
const PROGRESS_EVERY = 5000;
/** Im Replay läuft der Bot wie live höchstens einmal je Sekunde (LOOP_INTERVAL_SECONDS 1,0), danach nur nach einer Auslösung und am Minutenende */
const REPLAY_BOT_INTERVAL = 1;
/** Abweichung von Tick-Hoch/-Tief zum Kerzen-Hoch/-Tief in Punkten, ab der die Minute als abweichend zählt */
const REPLAY_BAR_TOLERANCE_POINTS = 1.5;
/** BKT-23: Ausführungsverzögerung des Brokers in ms: Füllung und Ausstieg im Replay nehmen die letzte Quote bis so lange nach der Auslösung (Plan 1109-K57.2) */
export const REPLAY_FILL_LATENCY_MS = 1;
/** BKT-23: Vorgabe für `RunModel.triggerReplay`; nach der Abnahme A und B an (Plan 1109-K57.3/K57.4, Entscheidung 1110-K3.2) */
export const TRIGGER_REPLAY_DEFAULT = true;

export interface RunModel {
  fill: FillModel;
  /** Bei gleichem Auslösepreis zählt der SL vor dem TP (konservativ) */
  slFirst: boolean;
  path: PathMode;
  closeAtEnd: boolean;
  /** Konservativer Spread (max aus Kerze und Vorkerze); Standard an, siehe PathBrokerOptions */
  carrySpread?: boolean;
  /** SL-Schlupf in Punkten; ohne Angabe halber Kerzen-Spread, 0 = aus */
  slSlippagePoints?: number | null;
  /** BKT-20: Rollover-/Sprung-Minuten mit den echten Ticks abspielen (nur Spread „tick“ und M1-Daten mit Replay-Minuten); Standard an */
  tickReplay?: boolean;
  /** BKT-21: Handelsseiten des Brokers (Schnappschuss) anwenden: zu = 10018, nichts löst aus; Standard an, ohne Seiten wirkungslos */
  tradeSessions?: boolean;
  /** BKT-22: Ask-Marken gegen die echten Ask-Extreme der Minute (nur Spread „tick“, Minuten ohne Replay); Standard an */
  askExtremes?: boolean;
  /** BKT-22: Füllpreise und Marken auf dem Kursraster der Minute (nur Spread „tick“, Minuten ohne Replay); Standard an */
  quoteGrid?: boolean;
  /**
   * BKT-23: Ein-/Ausstiegsminuten der eigenen Trades mit den echten Ticks nachspielen (der Auftrag holt sie in mehreren
   * Durchgängen vom Worker) und dort Füllung/Ausstieg mit Ausführungsverzögerung rechnen. Wirkt nur mit Spread „tick“,
   * M1-Daten und Replay-Karte; Vorgabe TRIGGER_REPLAY_DEFAULT.
   */
  triggerReplay?: boolean;
  /** BKT-26 (A1): in der Replay-Minute feuern alle Marken desselben Ticks, danach läuft der Bot einmal; Vorgabe SAME_TICK_BATCH_DEFAULT */
  sameTickBatch?: boolean;
  /** BKT-26 (B): nach einer Marke läuft der Bot erst nach BOT_REACT_DELAY_S (oder botReactDelay); ersetzt die Broker-Verzögerung (A2), beide wirken nie zusammen; Vorgabe BOT_REACT_DEFAULT */
  botReact?: boolean;
  /** BKT-26 (B): Sekunden statt BOT_REACT_DELAY_S (nur mit botReact) */
  botReactDelay?: number;
  /** BKT-26 (A2): nach einer Füllung in der Replay-Minute bleibt das Stufen-SL/TP für die gemessene Bot-Verzögerung; Vorgabe FILL_SLTP_DELAY_DEFAULT */
  fillSltpDelay?: boolean;
}

/** Fraktal, das vor `from` schon gehandelt wurde (Order gefüllt oder gelöscht): der Lauf legt dafür keine Order mehr */
export interface InitialFractalDone {
  side: 'U' | 'D';
  /** Kerzenzeit des Fraktals (Sekunden) */
  time: number;
}

export interface RunInput {
  /** Kopie der Zone; der Lauf setzt `is_active` auf true, damit eine inaktive Zone keinen leeren Lauf ergibt */
  zone: ZoneDict;
  snapshot: SymbolSnapshot;
  /** Kerzen der Datenauflösung inklusive Vorlauf vor `from` */
  rates: LoadedRates;
  dataTimeframe: Timeframe;
  /** Zeitraum [from, to), MT5-Sekunden; Kerzen davor sind nur Vorlauf für die Zeitrahmen des Bots, es laufen nur Kerzen ganz im Zeitraum */
  from: number;
  to: number;
  spread: SpreadSetting;
  commissionPerLot: number;
  model: RunModel;
  /** Kontostand zu Beginn für die Equity-Kurve; ohne Angabe 0 (Kurve = Gewinn/Verlust) */
  startCapital?: number;
  accountCurrency?: string;
  zoneLabel?: string | null;
  /** Startzustand: Positionen, die zum Start live offen waren (Standard: leer wie bisher) */
  initialPositions?: InitialPosition[];
  /** BKT-24: Startzustand: Pending Orders, die zum Start live im Orderbuch standen (ohne Angabe oder leer: Lauf wie bisher) */
  initialOrders?: InitialOrder[];
  /** Startzustand: schon gehandelte Fraktale der Zone (Positionen mit Fraktal-Kommentar zählen automatisch) */
  initialFractalDone?: InitialFractalDone[];
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
  /** BKT-23: Minutenbeginne (Sekunden), in denen Trades ein- oder ausgestiegen sind bzw. Positionen offen blieben und die noch nicht in der Replay-Karte stehen; leer ohne `triggerReplay` */
  triggerMinutes?: number[];
}

/** BKT-26: Vorgaben; zum Zurücknehmen auf false setzen */
// Alle aus: P8 entscheidet über das Einschalten (Journal 2026-11-12). Aus = Ergebnis wie vor BKT-26.
export const SAME_TICK_BATCH_DEFAULT = false;
export const FILL_SLTP_DELAY_DEFAULT = false;
export const BOT_REACT_DEFAULT = false;
export const botReactOn = (model: Pick<RunModel, 'botReact'>): boolean => model.botReact ?? BOT_REACT_DEFAULT;
export const sameTickBatchOn = (model: Pick<RunModel, 'sameTickBatch'>): boolean => model.sameTickBatch ?? SAME_TICK_BATCH_DEFAULT;
export const fillSltpDelayOn = (model: Pick<RunModel, 'fillSltpDelay'>): boolean => model.fillSltpDelay ?? FILL_SLTP_DELAY_DEFAULT;

export const triggerReplayOn = (model: Pick<RunModel, 'triggerReplay'>): boolean => model.triggerReplay ?? TRIGGER_REPLAY_DEFAULT;

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
  // Nur ganze Kerzen im Zeitraum: für eine Grenze innerhalb einer Kerze gibt es keine echten Preisdaten
  let end = first;
  while (end < n && rates.t[end] + dataSec <= input.to) end++;
  if (end === first) throw new RunError('run.noCandles', { from: input.from, to: input.to });
  const startsInCandle = first > 0 && rates.t[first - 1] + dataSec > input.from;
  const endsInCandle = end < n && rates.t[end] < input.to;

  const log = new RunLog();
  log.add('INFO', 'run.marginNotChecked');
  log.add('INFO', model.tradeSessions !== false && snapshot.tradeSessions ? 'run.rejectsNotSimulatedExceptClosed' : 'run.rejectsNotSimulated');
  log.add('INFO', 'run.stopsLevelNotSimulated', { stopsLevel: snapshot.info.trade_stops_level });
  log.add('INFO', 'run.costsEstimated');
  if (input.accountCurrency && snapshot.currencyProfit && input.accountCurrency !== snapshot.currencyProfit) {
    log.add('INFO', 'run.currencyToday', { profit: snapshot.currencyProfit, account: input.accountCurrency });
  }
  for (const note of input.notes ?? []) log.add('WARN', note.code, note.params);
  if (startsInCandle || endsInCandle) {
    log.add('WARN', 'run.rangeRounded', {
      from: startsInCandle ? rates.t[first] : input.from,
      to: endsInCandle ? rates.t[end - 1] + dataSec : input.to,
    });
  }
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
    carrySpread: model.carrySpread,
    slSlippagePoints: model.slSlippagePoints,
    fillSltpDelay: fillSltpDelayOn(model) && !botReactOn(model) ? sltpDelaySeconds(symbol) : 0,
  });
  for (const init of input.initialPositions ?? []) broker.seedPosition(init);
  // BKT-25: eine Zeile, die den Live-Startzustand sichtbar macht (nur wenn etwas eingesetzt wurde)
  const seededFractals = (input.initialFractalDone ?? []).length;
  if ((input.initialPositions ?? []).length > 0 || seededFractals > 0) {
    log.add('INFO', 'run.startPositions', { positions: (input.initialPositions ?? []).length, fractals: seededFractals });
  }
  // BKT-24: erst die Positionen (ihre Ticketnummern bleiben wie bisher), dann die Orders
  const initialOrders = input.initialOrders ?? [];
  for (const init of initialOrders) broker.seedOrder(init);
  if (initialOrders.length > 0) {
    log.add('INFO', 'run.startOrders', { orders: initialOrders.length });
    if (zone.entry_mode === 'fractal') {
      const unknown = initialOrders.filter((o) => !/_F[UD]\d+/.test(o.comment ?? '')).length;
      if (unknown > 0) log.add('WARN', 'run.startOrderNoFractal', { orders: unknown });
    }
  }
  for (let i = 0; i < first; i++) {
    broker.warm({ time: rates.t[i], open: rates.o[i], high: rates.h[i], low: rates.l[i], close: rates.c[i], spread: rates.s[i] });
  }

  const latency = triggerReplayOn(model);
  const batch = sameTickBatchOn(model);
  const state = new EngineState(
    () => broker.now,
    (entry) => log.add(entry.level, entry.code, entry.params, broker.now),
  );
  const zones = [zone];
  for (const f of input.initialFractalDone ?? []) {
    const key = `${zoneLogId(zone, 0)}:${symbol}:${toTimeframe(zget(zone, 'fractal_timeframe', 'H4'))}:${f.side}`;
    const set = state.fractalDone.get(key) ?? new Set<number>();
    set.add(f.time);
    state.fractalDone.set(key, set);
  }
  const infos = broker.symbolInfos();
  const sessions = model.tradeSessions === false ? null : snapshot.tradeSessions;
  let active: ActiveZones = {};
  let lastBot = -Infinity;
  const reactDelay = botReactOn(model) ? (model.botReactDelay ?? BOT_REACT_DELAY_S) : 0;
  let pendingBot: number | null = null;
  const runBot = () => {
    [, active] = manageDynamicGrid(broker, zones, active, infos, state);
    lastBot = broker.now;
  };

  const capital = input.startCapital ?? 0;
  const track = new EquityTrack(capital);
  let spreadFallbacks = 0;
  let tickFallbacks = 0;
  let replayMinutes = 0;
  let replayTicks = 0;
  let replayMismatches = 0;
  let gridMinutes = 0;
  let quotesMissing = 0;
  let closedCandles = 0;
  let partialCandles = 0;
  let prevClose = rates.o[first];
  let prevTime = rates.t[first];
  const total = end - first;
  const eventLimit = input.maxEventsPerCandle ?? MAX_EVENTS_PER_CANDLE;

  for (let i = first; i < end; i++) {
    if ((i - first) % PROGRESS_EVERY === 0) input.onProgress?.((i - first) / total);
    const t0 = rates.t[i];
    const tEnd = t0 + dataSec - 1;
    // „max“ und „tick“ ohne eigenen Wert (0) nehmen den Symbol-Spread als Untergrenze; fehlt er, gilt der Kerzen-Spread
    const spreadSetting: SpreadSetting =
      (input.spread.mode === 'max' || input.spread.mode === 'tick') && !(input.spread.points > 0) && snapshot.spreadPoints !== null && snapshot.spreadPoints > 0
        ? { mode: input.spread.mode, points: snapshot.spreadPoints }
        : input.spread;
    const minuteSpread = rates.sa ? rates.sa[i] : null;
    if (input.spread.mode === 'tick' && !(typeof minuteSpread === 'number' && minuteSpread > 0)) tickFallbacks += 1;
    let spreadPoints = candleSpreadPoints(spreadSetting, rates.s[i], minuteSpread);
    if (spreadPoints === null) {
      spreadPoints = snapshot.spreadPoints;
      if (spreadPoints === null) throw new RunError('run.spreadMissing', { time: t0 });
      spreadFallbacks += 1;
    }

    broker.rollover(prevTime, t0);
    if (sessions) {
      // BKT-21: die Handelsseite zu Beginn der Kerze gilt für die ganze Kerze; liegt eine Grenze darin, zählt es als Warnung
      const open = tradeOpenAt(sessions, t0);
      if (open !== tradeOpenAt(sessions, tEnd)) partialCandles += 1;
      if (!open) closedCandles += 1;
      broker.setTradeOpen(open);
    }
    // Die Zeitrahmen-Kerzen des Bots tragen wie bei MT5 den Kerzen-Spread (Minimum), nicht den Minutenmittelwert
    const barSpread = input.spread.mode === 'tick' && rates.s[i] > 0 ? rates.s[i] : spreadPoints;
    // BKT-22: nur Minuten ohne Replay (dort kommen Bid und Ask aus den Ticks) im Spread-Modus „tick“
    const replayMinute = input.spread.mode === 'tick' && model.tickReplay !== false && rates.replay?.has(t0) === true;
    let quotes: MinuteQuotes | undefined;
    if (input.spread.mode === 'tick' && !replayMinute && (model.askExtremes !== false || model.quoteGrid !== false)) {
      const askHigh = rates.ahi?.[i];
      const askLow = rates.alo?.[i];
      if (askHigh === undefined || askLow === undefined || !Number.isFinite(askHigh) || !Number.isFinite(askLow)) {
        quotesMissing += 1;
      } else {
        const gridPoints = model.quoteGrid !== false && rates.g ? rates.g[i] : 1;
        const grid = Number.isFinite(gridPoints) && gridPoints > 1 ? gridPoints : 1;
        const toPoints = (price: number) => Math.round(price / info.point);
        quotes = {
          askHigh,
          askLow,
          high: rates.h[i],
          low: rates.l[i],
          extremes: model.askExtremes !== false,
          grid,
          askPhase: grid > 1 ? ((toPoints(askHigh) % grid) + grid) % grid : 0,
          bidPhase: grid > 1 ? ((toPoints(rates.o[i]) % grid) + grid) % grid : 0,
        };
        if (grid > 1) gridMinutes += 1;
      }
    }
    broker.beginCandle(t0, rates.o[i], spreadPoints, barSpread, quotes);
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
        const trigger = jump ? broker.nextGapTrigger(cur, b) : broker.nextTrigger(cur, b);
        const wake = jump ? null : nextWake(wakes, cur, b);
        const triggerFirst = trigger !== null && (wake === null || (b > cur ? trigger.bid <= wake : trigger.bid >= wake));
        // BKT-21: endet eine 10018-Pause (60 s) in diesem Wegstück, läuft der Bot dann wie live nach der Pause
        const retryAt = jump || !sessions ? null : state.nextClosedRetry(broker.now);
        if (retryAt !== null && retryAt <= tb) {
          let next = Infinity;
          if (trigger !== null && triggerFirst) next = timeAt(trigger.bid);
          else if (wake !== null) next = timeAt(wake);
          if (retryAt < next) {
            countEvent();
            cur = b === a || tb === ta ? cur : a + ((b - a) * (retryAt - ta)) / (tb - ta);
            broker.setMarket(cur, retryAt);
            runBot();
            continue;
          }
        }
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

    const replay = replayMinute ? rates.replay?.get(t0) : undefined;
    let closeBid = rates.c[i];
    if (replay && replay.ms.length > 0) {
      // BKT-20: Rollover-/Sprung-Minute mit den echten Ticks (Bid und Ask getrennt) statt Kerzenweg
      replayMinutes += 1;
      replayTicks += replay.ms.length;
      broker.beginReplay();
      for (let k = 0; k < replay.ms.length; k++) {
        broker.setQuote(replay.bid[k], replay.ask[k], t0 + replay.ms[k] / 1000);
        let ran = false;
        if (pendingBot !== null && broker.now >= pendingBot) { pendingBot = null; runBot(); }
        for (const trigger of broker.quoteTriggers()) {
          if (!broker.hasTarget(trigger)) continue;
          countEvent();
          // BKT-23: Ausführung zur letzten Quote bis REPLAY_FILL_LATENCY_MS nach dem Tick der Auslösung
          let j = k;
          if (latency) while (j + 1 < replay.ms.length && replay.ms[j + 1] <= replay.ms[k] + REPLAY_FILL_LATENCY_MS) j += 1;
          broker.fire(trigger, true, j === k ? undefined : { bid: replay.bid[j], ask: replay.ask[j] });
          // BKT-26 (A1): alle Marken dieses Ticks feuern zuerst, der Bot läuft danach einmal
          if (reactDelay > 0) { if (pendingBot === null) pendingBot = broker.now + reactDelay; ran = true; continue; }
          if (!batch) runBot();
          ran = true;
        }
        if (ran && batch && reactDelay <= 0) runBot();
        if (!ran && broker.now - lastBot >= REPLAY_BOT_INTERVAL) {
          countEvent();
          runBot();
        }
      }
      closeBid = replay.bid[replay.bid.length - 1];
      const seen = broker.setBarOhlc(rates.o[i], rates.h[i], rates.l[i], rates.c[i]);
      const tolerance = REPLAY_BAR_TOLERANCE_POINTS * info.point;
      if (seen && (Math.abs(seen.high - rates.h[i]) > tolerance || Math.abs(seen.low - rates.l[i]) > tolerance)) replayMismatches += 1;
      broker.endReplay();
      runBot();
    } else {
      traverse(prevClose, way[0], t0, t0, true);
      for (let k = 1; k < way.length; k++) traverse(way[k - 1], way[k], times[k - 1], times[k], false);
      // BKT-21: der Weg endet vor dem Kerzenende (flache Kerze: am Anfang); Pausen nach 10018 enden trotzdem darin
      for (let retryAt = sessions ? state.nextClosedRetry(broker.now) : null; retryAt !== null && retryAt <= tEnd; retryAt = state.nextClosedRetry(broker.now)) {
        countEvent();
        broker.setMarket(way[way.length - 1], retryAt);
        runBot();
      }
    }

    broker.endCandle();
    track.add(tEnd, capital + broker.equity());
    prevClose = closeBid;
    prevTime = tEnd;
  }

  if (sessions) {
    log.add('INFO', 'run.tradeSessions', { candles: closedCandles, rejects: broker.closedRejects });
    if (partialCandles > 0) log.add('WARN', 'run.tradeSessionPartial', { candles: partialCandles });
  }
  if (replayMinutes > 0) log.add('INFO', 'run.tickReplay', { minutes: replayMinutes, ticks: replayTicks });
  if (gridMinutes > 0) log.add('INFO', 'run.quoteGrid', { minutes: gridMinutes });
  if (quotesMissing > 0) log.add('WARN', 'run.askExtremesMissing', { candles: quotesMissing });
  if (replayMismatches > 0) log.add('WARN', 'run.tickReplayMismatch', { minutes: replayMismatches });
  if (tickFallbacks > 0) log.add('WARN', 'run.tickSpreadFallback', { candles: tickFallbacks, total: total });
  if (spreadFallbacks > 0) log.add('WARN', 'run.spreadFallback', { candles: spreadFallbacks, points: snapshot.spreadPoints });
  if (model.closeAtEnd) {
    broker.closeAll();
    track.add(prevTime, capital + broker.equity());
  }
  input.onProgress?.(1);

  const trades = broker.trades;
  const triggerMinutes: number[] = [];
  if (latency && input.spread.mode === 'tick' && dataTimeframe === 'M1' && rates.replay) {
    // BKT-23: Ein- und Ausstiegsminuten (auch offene Positionen), die es als Kerze im Zeitraum gibt und die noch kein Replay haben
    const inRange = new Set<number>();
    for (let i = first; i < end; i++) inRange.add(rates.t[i]);
    const found = new Set<number>();
    const add = (time: number | null) => {
      if (time === null) return;
      const minute = time - (((time % 60) + 60) % 60);
      if (inRange.has(minute) && !rates.replay?.has(minute)) found.add(minute);
    };
    for (const trade of trades) {
      add(trade.entryTime);
      add(trade.exitTime);
    }
    for (const time of broker.openEntryTimes()) add(time);
    triggerMinutes.push(...[...found].sort((a, b) => a - b));
  }
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
    triggerMinutes,
  };
}
