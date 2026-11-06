/**
 * Broker des echten Backtest-Laufs (B4): der Kurs läuft über den Kerzenpfad (candles/pathModel.ts), Aufträge, TP
 * und SL lösen in Preis-Reihenfolge aus, und der Broker rechnet Gewinn, Kommission und Swap (broker/costs.ts).
 * Auftragsbuch und MT5-API kommen von SimBroker (Parität zum Bot); hier kommt nur das Marktmodell dazu.
 *
 * Preise: die Kerzen sind Bid-Kerzen, Ask = Bid + Spread der Kerze. Damit löst ein Kauf-Stop schon bei
 * Bid = Orderpreis − Spread aus, ein Verkaufs-TP bei Bid = TP − Spread.
 * Ausführung „gap“: ist der Kurs über die Auslösemarke hinweggesprungen (Kurslücke zwischen zwei Kerzen oder eine
 * Order, die der Bot schon hinter dem Kurs gesetzt hat), füllt sie zum Marktpreis. „parity“ füllt immer zum
 * Orderpreis, wie der FakeMT5 der Musterlösungen.
 */
import { RunError } from '@/lib/backtest/runContext';
import { TimeframeAggregator, type BaseBar } from '@/lib/backtest/candles/bars';
import { parseFractalComment } from '@/lib/backtest/engine/orders';
import {
  BUY_ORDER_TYPES,
  ORDER_STATE_FILLED,
  ORDER_TYPE_BUY_LIMIT,
  ORDER_TYPE_BUY_STOP,
  ORDER_TYPE_SELL_LIMIT,
  ORDER_TYPE_SELL_STOP,
  POSITION_TYPE_BUY,
  POSITION_TYPE_SELL,
  type Bar,
  type Position,
  type SymbolInfo,
  type Timeframe,
} from '@/lib/backtest/engine/types';
import type { Trade } from '@/lib/analysis/tradePairing';
import type { Excursion } from '@/lib/analysis/excursions';
import {
  brokerDay,
  cents,
  commissionHalf,
  profitOf,
  profitRaw,
  spreadCost,
  swapNights,
  swapPerNight,
  type SymbolCosts,
} from './costs';
import { SimBroker } from './simBroker';

export type FillModel = 'gap' | 'parity';

/** DEAL_REASON_*: 3 = Experte (Bot oder Testende), 4 = SL, 5 = TP */
const REASON_EXPERT = 3;
const REASON_SL = 4;
const REASON_TP = 5;

export type CloseReason = 'tp' | 'sl' | 'bot' | 'end';
const REASON_CODE: Record<CloseReason, number> = { tp: REASON_TP, sl: REASON_SL, bot: REASON_EXPERT, end: REASON_EXPERT };

/**
 * BKT-22: echte Werte der Minute aus den Ticks (Preise). `extremes`: Ask-Marken gelten gegen askHigh/askLow statt gegen
 * Bid + Minutenmittel. `grid` > 1: Kursraster in Punkten; `askPhase`/`bidPhase` = Rest der Kurse in Punkten mod grid.
 */
export interface MinuteQuotes {
  askHigh: number;
  askLow: number;
  high: number;
  low: number;
  extremes: boolean;
  grid: number;
  askPhase: number;
  bidPhase: number;
}

export interface PathBrokerOptions {
  info: SymbolInfo;
  costs: SymbolCosts;
  /** Startzeit in Sekunden (Brokerzeit) und erster Bid-Kurs */
  start: number;
  firstBid: number;
  fill: FillModel;
  /** Kommission je Lot, hin und zurück (positiv = Kosten) */
  commissionPerLot: number;
  /** Bei gleichem Auslösepreis: SL vor TP (konservativ) statt TP vor SL */
  slFirst: boolean;
  /** Zeitrahmen, die der Bot lesen darf, und die Sekunden einer Kerze der Datenauflösung */
  timeframes: readonly { name: Timeframe; sec: number }[];
  /** Name der Zone zu einer Magic-Nummer (für die Trades) */
  zoneLabel: (magic: number) => string | null;
  /**
   * Konservativer Spread (Standard: an). Das Spread-Feld der Kerze ist ein Endwert; im Rollover und bei Spitzen
   * war der echte Spread in der Minute höher. Es gilt max(Spread dieser Kerze, Spread der Vorkerze) für die
   * Füllprüfung und den Füllpreis. War die Vorkerze breiter, füllt eine Limit-Order per Kurslücke nie zu einem
   * besseren Preis als dem Orderpreis.
   */
  carrySpread?: boolean;
  /**
   * SL-Schlupf in Punkten (Standard: halber Spread der Kerze). 0 = aus. Ein SL füllt um diesen Betrag schlechter
   * als die Stufe; TP füllt weiter auf der Stufe (live eher besser, also bleibt der Backtest konservativ).
   */
  slSlippagePoints?: number | null;
}

/** Position, die zum Startzeitpunkt schon offen war (Daten aus den Live-Deals vor `from`) */
export interface InitialPosition {
  side: 'buy' | 'sell';
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  magic: number;
  /** Kommentar der Eröffnungsorder, bei Fraktal-Positionen mit Fraktalzeit (markiert das Fraktal als erledigt) */
  comment?: string;
  /** Eröffnungszeit in Sekunden; ohne Angabe die Startzeit */
  time?: number;
}

export interface Trigger {
  kind: 'fill' | 'tp' | 'sl';
  ticket: number;
  /** Bid-Kurs, bei dem die Marke erreicht wird */
  bid: number;
  /** Die Bedingung gilt schon am Ausgangskurs (kein Weg dorthin) */
  immediate: boolean;
}

interface OpenInfo {
  time: number;
  price: number;
  /** Eingangs-Kommission (negativ) */
  commission: number;
  swap: number;
  favorablePrice: number;
  adversePrice: number;
}

export class PathBroker extends SimBroker {
  readonly trades: Trade[] = [];
  readonly excursions: Record<string, Excursion> = {};
  /** Summe Netto der geschlossenen Trades */
  realized = 0;
  /** Nur zur Anzeige: Summe der Spread-Kosten aller eröffneten Positionen */
  spreadInfo = 0;

  private readonly costs: SymbolCosts;
  private readonly fill: FillModel;
  private readonly commissionPerLot: number;
  private readonly slFirst: boolean;
  private readonly zoneLabel: (magic: number) => string | null;
  private readonly aggregators = new Map<Timeframe, TimeframeAggregator>();
  private readonly opens = new Map<number, OpenInfo>();
  private forming: BaseBar | null = null;
  /** Spread der laufenden Kerze als Preisabstand (gesetzt von beginCandle) */
  spreadPrice = 0;
  private profitStale = true;
  private exitTickets = 0;
  private readonly carrySpread: boolean;
  private readonly slSlippagePoints: number | null;
  private prevSpreadPrice = 0;
  /** Die Vorkerze war breiter: Kurslücken-Füllung von Limit-Orders nie besser als der Orderpreis */
  private wideBefore = false;
  /** BKT-20: Replay-Minute: Bid/Ask kommen aus den Ticks, SL ohne Schlupf, keine Kurslücken-Sperre für Limit-Orders */
  private replaying = false;
  /** BKT-22: Abstand Ask-Hoch − Bid-Hoch und Ask-Tief − Bid-Tief der Minute (Preis); null = Minutenmittel gilt */
  private spUp: number | null = null;
  private spDn: number | null = null;
  /** BKT-22: echte Ask-Grenzen der Minute für den Marktpreis; null = keine */
  private askBounds: { lo: number; hi: number } | null = null;
  /** BKT-22: Kursraster der Minute in Punkten (1 = keins) und die Phasen von Ask und Bid */
  private grid = 1;
  private askPhase = 0;
  private bidPhase = 0;

  constructor(options: PathBrokerOptions) {
    super({ symbol: options.info, start: options.start, firstBid: options.firstBid });
    this.costs = options.costs;
    this.fill = options.fill;
    this.commissionPerLot = options.commissionPerLot;
    this.slFirst = options.slFirst;
    this.zoneLabel = options.zoneLabel;
    this.carrySpread = options.carrySpread ?? true;
    this.slSlippagePoints = options.slSlippagePoints ?? null;
    for (const tf of options.timeframes) this.aggregators.set(tf.name, new TimeframeAggregator(tf.sec));
    this.hooks = {
      openedByBot: (position, price) => this.register(position, price),
      closedByBot: (position, price) => this.settle(position, price, 'bot'),
    };
  }

  // ------------------------------------------------------------------ Markt
  /** Abgeschlossene Kerze vor dem Start (nur für die Zeitrahmen des Bots) */
  warm(bar: BaseBar): void {
    for (const agg of this.aggregators.values()) agg.push(bar);
  }

  /** Neue Kerze der Datenauflösung: Spread der Kerze (Punkte) gilt bis zum Kerzenende; `barSpreadPoints`: Wert, den die Zeitrahmen-Kerze erhält (Standard: derselbe) */
  beginCandle(time: number, open: number, spreadPoints: number, barSpreadPoints: number = spreadPoints, quotes?: MinuteQuotes): void {
    this.applyQuotes(quotes);
    const own = this.round(spreadPoints * this.costs.point);
    this.wideBefore = this.carrySpread && this.prevSpreadPrice > own;
    this.spreadPrice = this.wideBefore ? this.prevSpreadPrice : own;
    this.prevSpreadPrice = own;
    this.forming = { time, open, high: open, low: open, close: open, spread: barSpreadPoints };
  }

  /** BKT-22: Minutenwerte (echte Ask-Grenzen, Kursraster) übernehmen oder löschen */
  private applyQuotes(quotes?: MinuteQuotes): void {
    this.spUp = null;
    this.spDn = null;
    this.askBounds = null;
    this.grid = 1;
    if (!quotes) return;
    if (quotes.extremes) {
      this.spUp = Math.max(0, this.round(quotes.askHigh - quotes.high));
      this.spDn = Math.max(0, this.round(quotes.askLow - quotes.low));
      this.askBounds = { lo: quotes.askLow, hi: quotes.askHigh };
    }
    if (quotes.grid > 1) {
      this.grid = quotes.grid;
      this.askPhase = quotes.askPhase;
      this.bidPhase = quotes.bidPhase;
    }
  }

  // Raster-Rechnung in ganzen Punkten (Preise liegen auf dem Punktraster)
  private pts(price: number): number {
    return Math.round(price / this.costs.point);
  }
  private fromPts(points: number): number {
    return this.round(points * this.costs.point);
  }
  /** Erster Rasterwert ≥ Preis (`up`) bzw. ≤ Preis (sonst) zur gegebenen Phase; ohne Raster der Preis selbst */
  private snap(price: number, phase: number, up: boolean): number {
    if (this.grid <= 1) return price;
    const x = this.pts(price);
    const rest = (((x - phase) % this.grid) + this.grid) % this.grid;
    if (!up) return this.fromPts(x - rest);
    return this.fromPts(rest === 0 ? x : x + this.grid - rest);
  }
  private snapNearest(price: number, phase: number): number {
    if (this.grid <= 1) return price;
    const x = this.pts(price);
    const rest = (((x - phase) % this.grid) + this.grid) % this.grid;
    return this.fromPts(rest * 2 < this.grid ? x - rest : x + this.grid - rest);
  }
  private askUp = (price: number) => this.snap(price, this.askPhase, true);
  private askDown = (price: number) => this.snap(price, this.askPhase, false);
  private bidUp = (price: number) => this.snap(price, this.bidPhase, true);
  private bidDown = (price: number) => this.snap(price, this.bidPhase, false);

  /** Wirksamer Preis einer Pending Order auf dem Raster: Stop zum nächsten Rasterwert in Richtung Kurs, Limit zum besseren */
  private orderLevel(type: number, price: number): number {
    if (type === ORDER_TYPE_BUY_STOP) return this.askUp(price);
    if (type === ORDER_TYPE_BUY_LIMIT) return this.askDown(price);
    if (type === ORDER_TYPE_SELL_STOP) return this.bidDown(price);
    return this.bidUp(price);
  }

  endCandle(): void {
    if (!this.forming) return;
    for (const agg of this.aggregators.values()) agg.push(this.forming);
    this.forming = null;
  }

  /** Kurs und Uhr setzen; Ask = Bid + Spread (oder der gegebene Ask eines Ticks) */
  setMarket(bid: number, time: number, ask?: number): void {
    this.now = time;
    let quote = ask;
    if (quote === undefined) {
      quote = this.round(bid + this.spreadPrice);
      // BKT-22: Marktpreis auf dem Ask-Raster und innerhalb der echten Ask-Grenzen der Minute
      quote = this.snapNearest(quote, this.askPhase);
      if (this.askBounds) quote = Math.min(Math.max(quote, this.askBounds.lo), this.askBounds.hi);
    }
    this.tick = this.makeTick(bid, quote);
    this.profitStale = true;
    for (const position of this.positions) {
      const info = this.opens.get(position.ticket);
      if (!info) continue;
      const price = position.type === POSITION_TYPE_BUY ? this.tick.bid : this.tick.ask;
      if (position.type === POSITION_TYPE_BUY) {
        info.favorablePrice = Math.max(info.favorablePrice, price);
        info.adversePrice = Math.min(info.adversePrice, price);
      } else {
        info.favorablePrice = Math.min(info.favorablePrice, price);
        info.adversePrice = Math.max(info.adversePrice, price);
      }
    }
    const bar = this.forming;
    if (bar) {
      bar.high = Math.max(bar.high, bid);
      bar.low = Math.min(bar.low, bid);
      bar.close = bid;
    }
  }

  /** Replay-Minute beginnen (nach beginCandle): echte Ticks statt Kerzenweg */
  beginReplay(): void {
    this.replaying = true;
    this.applyQuotes();
    this.wideBefore = false;
  }

  /** Replay-Minute beenden: die nächste Minute übernimmt den Spread des letzten Ticks (nicht den Minutenwert) */
  endReplay(): void {
    this.replaying = false;
    this.prevSpreadPrice = this.spreadPrice;
  }

  /** Kurs aus einem Tick setzen (nur im Replay): Bid und Ask getrennt, der aktuelle Spread gilt für Kosten und SL */
  setQuote(bid: number, ask: number, time: number): void {
    this.spreadPrice = this.round(ask - bid);
    this.setMarket(bid, time, ask);
  }

  /** Das Zeitrahmen-Kerzen-OHLC der Minute auf die Werte der Kerze setzen (der Bot liest MT5-Kerzen, nicht Tick-Extrema) */
  setBarOhlc(open: number, high: number, low: number, close: number): { high: number; low: number } | null {
    const bar = this.forming;
    if (!bar) return null;
    const seen = { high: bar.high, low: bar.low };
    bar.open = open;
    bar.high = high;
    bar.low = low;
    bar.close = close;
    return seen;
  }

  /**
   * BKT-20: alle Marken, die bei den aktuellen Quotes (Bid und Ask des letzten Ticks) gelten, in Auslöse-Reihenfolge.
   * Kauf-Limit: Ask ≤ Preis, Kauf-Stop: Ask ≥ Preis, Verkaufs-Limit: Bid ≥ Preis, Verkaufs-Stop: Bid ≤ Preis;
   * Kauf-Position TP: Bid ≥ TP, SL: Bid ≤ SL; Verkaufs-Position TP: Ask ≤ TP, SL: Ask ≥ SL.
   */
  quoteTriggers(): Trigger[] {
    if (!this.tradeOpen) return [];
    const { bid, ask } = this.tick;
    const order = this.slFirst ? { sl: 0, tp: 1, fill: 2 } : { tp: 0, sl: 1, fill: 2 };
    const found: Trigger[] = [];
    for (const o of this.orders) {
      let hit = false;
      if (o.type === ORDER_TYPE_BUY_LIMIT) hit = ask <= o.price_open;
      else if (o.type === ORDER_TYPE_BUY_STOP) hit = ask >= o.price_open;
      else if (o.type === ORDER_TYPE_SELL_LIMIT) hit = bid >= o.price_open;
      else if (o.type === ORDER_TYPE_SELL_STOP) hit = bid <= o.price_open;
      if (hit) found.push({ kind: 'fill', ticket: o.ticket, bid, immediate: true });
    }
    for (const p of this.positions) {
      const buy = p.type === POSITION_TYPE_BUY;
      if (p.tp && (buy ? bid >= p.tp : ask <= p.tp)) found.push({ kind: 'tp', ticket: p.ticket, bid, immediate: true });
      if (p.sl && (buy ? bid <= p.sl : ask >= p.sl)) found.push({ kind: 'sl', ticket: p.ticket, bid, immediate: true });
    }
    return found.sort((x, y) => order[x.kind] - order[y.kind] || x.ticket - y.ticket);
  }

  /** Gibt es die Order bzw. Position dieser Marke noch (eine frühere Auslösung im selben Tick kann sie entfernt haben)? */
  hasTarget(trigger: Trigger): boolean {
    return trigger.kind === 'fill' ? this.orders.some((o) => o.ticket === trigger.ticket) : this.positions.some((p) => p.ticket === trigger.ticket);
  }

  /** Brokertag-Wechsel zwischen zwei Zeiten: Swap jeder offenen Position für jede Nacht */
  rollover(prevTime: number, time: number): void {
    const swap = this.costs.swap;
    if (!swap || this.positions.length === 0) return;
    for (let day = brokerDay(prevTime); day < brokerDay(time); day++) {
      const nights = swapNights(day, swap.rollover3days);
      if (nights === 0) continue;
      for (const p of this.positions) {
        const info = this.opens.get(p.ticket);
        if (info) info.swap = cents(info.swap + cents(swapPerNight(swap, this.costs, p.type === POSITION_TYPE_BUY, p.volume) * nights));
      }
    }
  }

  // ------------------------------------------------------------------ Auslösungen
  /**
   * Nächste Marke auf dem Weg von `from` nach `to` (Bid-Kurse): Füllung einer Pending Order, TP oder SL einer
   * Position. Eine Marke, deren Bedingung am Ausgangskurs schon gilt, löst sofort aus (immediate).
   */
  nextTrigger(from: number, to: number): Trigger | null {
    return this.scan(from, to, null);
  }

  /**
   * Wie nextTrigger, aber für eine Kurslücke von `from` (letzter Bid) nach `to` (neuer Bid, Spread der neuen Kerze
   * schon gesetzt): eine Marke zählt nur, wenn ihre Bedingung am neuen Quote gilt. Der alte Bid kennt den neuen
   * Spread nicht; ohne diese Prüfung gälte eine Marke an einem Quote, den es nie gab. Die Reihenfolge entlang der
   * Lücke bleibt die von nextTrigger.
   */
  nextGapTrigger(from: number, to: number): Trigger | null {
    return this.scan(from, to, to);
  }

  /** `holdsAt`: nur Marken, deren Bedingung bei diesem Bid gilt; null = keine Einschränkung */
  private scan(from: number, to: number, holdsAt: number | null): Trigger | null {
    if (!this.tradeOpen) return null; // BKT-21: bei geschlossener Handelsseite löst nichts aus
    const up = to > from;
    const down = to < from;
    const order = this.slFirst ? { sl: 0, tp: 1, fill: 2 } : { tp: 0, sl: 1, fill: 2 };
    const pick: { best: Trigger | null } = { best: null };
    const consider = (kind: Trigger['kind'], ticket: number, atOrAbove: boolean, mark: number) => {
      if (holdsAt !== null && !(atOrAbove ? holdsAt >= mark : holdsAt <= mark)) return;
      let bid: number;
      let immediate = false;
      if (atOrAbove ? from >= mark : from <= mark) {
        bid = from;
        immediate = true;
      } else if (atOrAbove ? up && mark <= to : down && mark >= to) {
        bid = mark;
      } else {
        return;
      }
      const best = pick.best;
      if (best) {
        const earlier = (up && bid < best.bid) || (down && bid > best.bid);
        const sameSpot = bid === best.bid;
        if (!earlier && !(sameSpot && (order[kind] < order[best.kind] || (order[kind] === order[best.kind] && ticket < best.ticket)))) return;
      }
      pick.best = { kind, ticket, bid, immediate };
    };
    // BKT-22: „Ask ≥ Marke“ (Kauf-Stop, Verkaufs-SL) gilt gegen das echte Ask-Hoch, „Ask ≤ Marke“ (Kauf-Limit, Verkaufs-TP) gegen das Ask-Tief
    const spUp = this.spUp ?? this.spreadPrice;
    const spDn = this.spDn ?? this.spreadPrice;
    for (const o of this.orders) {
      const level = this.orderLevel(o.type, o.price_open);
      if (o.type === ORDER_TYPE_BUY_LIMIT) consider('fill', o.ticket, false, this.round(level - spDn));
      else if (o.type === ORDER_TYPE_BUY_STOP) consider('fill', o.ticket, true, this.round(level - spUp));
      else if (o.type === ORDER_TYPE_SELL_LIMIT) consider('fill', o.ticket, true, level);
      else if (o.type === ORDER_TYPE_SELL_STOP) consider('fill', o.ticket, false, level);
    }
    for (const p of this.positions) {
      if (p.type === POSITION_TYPE_BUY) {
        if (p.tp) consider('tp', p.ticket, true, this.bidUp(p.tp));
        if (p.sl) consider('sl', p.ticket, false, this.bidDown(p.sl));
      } else {
        if (p.tp) consider('tp', p.ticket, false, this.round(this.askDown(p.tp) - spDn));
        if (p.sl) consider('sl', p.ticket, true, this.round(this.askUp(p.sl) - spUp));
      }
    }
    return pick.best;
  }

  /**
   * Marke ausführen. `atMarket`: der Kurs ist hinweggesprungen, im Modell „gap“ gilt der Marktpreis; sonst der
   * Preis der Marke. Der Markt (Kurs, Uhr) ist vorher mit setMarket gestellt.
   */
  fire(trigger: Trigger, atMarket: boolean): void {
    const useMarket = atMarket && this.fill === 'gap';
    if (trigger.kind === 'fill') {
      const order = this.orders.find((o) => o.ticket === trigger.ticket);
      if (!order) throw new RunError('run.internal', { what: 'order missing', ticket: trigger.ticket });
      const buy = BUY_ORDER_TYPES.includes(order.type);
      const marketPrice = buy ? this.tick.ask : this.tick.bid;
      const level = this.orderLevel(order.type, order.price_open);
      let price = useMarket ? marketPrice : level;
      if (useMarket && this.wideBefore) price = buy ? Math.max(price, order.price_open) : Math.min(price, order.price_open);
      if (useMarket && this.grid > 1) {
        // BKT-22: ein Stop füllt nie besser, ein Limit nie schlechter als auf dem Raster der Marke
        const stop = order.type === ORDER_TYPE_BUY_STOP || order.type === ORDER_TYPE_SELL_STOP;
        price = stop === buy ? Math.max(price, level) : Math.min(price, level);
      }
      this.orders = this.orders.filter((o) => o.ticket !== order.ticket);
      const position: Position = {
        ticket: order.ticket,
        identifier: order.ticket,
        symbol: order.symbol,
        type: buy ? POSITION_TYPE_BUY : POSITION_TYPE_SELL,
        price_open: price,
        volume: order.volume_current,
        tp: order.tp,
        sl: order.sl,
        magic: order.magic,
        profit: 0,
        comment: order.comment,
      };
      order.volume_current = 0;
      order.state = ORDER_STATE_FILLED;
      this.history.set(order.ticket, order);
      this.positions.push(position);
      this.register(position, price);
      return;
    }
    const position = this.positions.find((p) => p.ticket === trigger.ticket);
    if (!position) throw new RunError('run.internal', { what: 'position missing', ticket: trigger.ticket });
    const buy = position.type === POSITION_TYPE_BUY;
    const level = trigger.kind === 'tp' ? position.tp : position.sl;
    // BKT-22: die Marke liegt auf dem Raster des Gegenkurses (Kauf-Position schließt am Bid, Verkaufs-Position am Ask)
    const tp = trigger.kind === 'tp';
    let onGrid: number;
    if (buy) onGrid = tp ? this.bidUp(level) : this.bidDown(level);
    else onGrid = tp ? this.askDown(level) : this.askUp(level);
    const marketPrice = buy ? this.tick.bid : this.tick.ask;
    let price = useMarket ? marketPrice : onGrid;
    if (trigger.kind === 'sl' && !this.replaying) {
      const slip = this.slSlippagePoints === null ? this.spreadPrice / 2 : this.slSlippagePoints * this.costs.point;
      let worse = this.round(buy ? level - slip : level + slip);
      if (this.grid > 1) {
        worse = buy ? Math.min(onGrid, this.snapNearest(worse, this.bidPhase)) : Math.max(onGrid, this.snapNearest(worse, this.askPhase));
      }
      if (!useMarket) price = worse;
      else if (buy) price = Math.min(price, worse);
      else price = Math.max(price, worse);
    }
    this.closePosition(position, price, trigger.kind);
  }

  /** Startzustand: eine schon offene Position übernehmen (ohne Eingangskommission, die liegt vor dem Zeitraum) */
  seedPosition(init: InitialPosition): void {
    const ticket = this.nextTicket++;
    const buy = init.side === 'buy';
    const position: Position = {
      ticket,
      identifier: ticket,
      symbol: this.symbol,
      type: buy ? POSITION_TYPE_BUY : POSITION_TYPE_SELL,
      price_open: init.price,
      volume: init.volume,
      tp: init.tp ?? 0,
      sl: init.sl ?? 0,
      magic: init.magic,
      profit: 0,
      comment: init.comment ?? '',
    };
    this.positions.push(position);
    const exitPrice = buy ? this.tick.bid : this.tick.ask;
    this.opens.set(ticket, { time: init.time ?? this.now, price: init.price, commission: 0, swap: 0, favorablePrice: exitPrice, adversePrice: exitPrice });
    position.time_msc = Math.trunc((init.time ?? this.now) * 1000);
    this.profitStale = true;
  }

  /** Testende „alles schließen“: zum Marktpreis */
  closeAll(): void {
    for (const p of [...this.positions]) this.closePosition(p, p.type === POSITION_TYPE_BUY ? this.tick.bid : this.tick.ask, 'end');
  }

  // ------------------------------------------------------------------ Konto
  get openCount(): number {
    return this.positions.length;
  }

  /** Offener Gewinn/Verlust zum Marktpreis, mit Eingangskommission und gebuchtem Swap */
  openResult(): number {
    let sum = 0;
    for (const p of this.positions) {
      const info = this.opens.get(p.ticket);
      sum += this.floating(p) + (info ? info.commission + info.swap : 0);
    }
    return sum;
  }

  equity(): number {
    return this.realized + this.openResult();
  }

  private floating(p: Position): number {
    const buy = p.type === POSITION_TYPE_BUY;
    return profitRaw(this.costs, buy, p.volume, p.price_open, buy ? this.tick.bid : this.tick.ask);
  }

  private register(position: Position, price: number): void {
    const commission = commissionHalf(this.commissionPerLot, position.volume);
    // Die Position kann schon beim Einstieg nur zum Gegenkurs geschlossen werden.
    // Ohne diesen ersten Kurs fehlt der Spread im MAE, wenn der nächste Tick günstiger ist.
    const exitPrice = position.type === POSITION_TYPE_BUY ? this.tick.bid : this.tick.ask;
    this.opens.set(position.ticket, { time: this.now, price, commission, swap: 0, favorablePrice: exitPrice, adversePrice: exitPrice });
    this.spreadInfo += spreadCost(this.costs, this.spreadPrice, position.volume);
    position.time_msc = Math.trunc(this.now * 1000);
    this.profitStale = true;
  }

  private closePosition(position: Position, price: number, reason: CloseReason): void {
    this.positions = this.positions.filter((p) => p.ticket !== position.ticket);
    this.settle(position, price, reason);
  }

  private settle(position: Position, price: number, reason: CloseReason): void {
    const info = this.opens.get(position.ticket);
    if (!info) throw new RunError('run.internal', { what: 'open info missing', ticket: position.ticket });
    this.opens.delete(position.ticket);
    const buy = position.type === POSITION_TYPE_BUY;
    const profit = profitOf(this.costs, buy, position.volume, info.price, price);
    const commission = cents(info.commission + commissionHalf(this.commissionPerLot, position.volume));
    const net = cents(profit + commission + info.swap);
    const fractal = parseFractalComment(position.comment);
    this.exitTickets += 1;
    this.realized = cents(this.realized + net);
    const id = `${position.ticket}-${this.exitTickets}`;
    if (buy) {
      info.favorablePrice = Math.max(info.favorablePrice, price);
      info.adversePrice = Math.min(info.adversePrice, price);
    } else {
      info.favorablePrice = Math.min(info.favorablePrice, price);
      info.adversePrice = Math.max(info.adversePrice, price);
    }
    const favorableMove = Math.max(0, buy ? info.favorablePrice - info.price : info.price - info.favorablePrice);
    const adverseMove = Math.max(0, buy ? info.price - info.adversePrice : info.adversePrice - info.price);
    this.excursions[id] = {
      ok: true,
      mfe: favorableMove,
      mae: adverseMove,
      mfePts: favorableMove / this.costs.point,
      maePts: adverseMove / this.costs.point,
      mfeMoney: Math.max(0, profitRaw(this.costs, buy, position.volume, info.price, info.favorablePrice)),
      maeMoney: Math.max(0, -profitRaw(this.costs, buy, position.volume, info.price, info.adversePrice)),
    };
    this.trades.push({
      id,
      positionId: position.identifier,
      symbol: position.symbol,
      side: buy ? 'buy' : 'sell',
      volume: position.volume,
      entryTime: Math.floor(info.time),
      entryPrice: info.price,
      exitTime: Math.floor(this.now), // MT5-Deals haben ganze Sekunden
      exitPrice: price,
      exitTicket: this.exitTickets,
      exitReason: REASON_CODE[reason],
      profit,
      commission,
      fee: 0,
      swap: info.swap,
      net,
      partial: false,
      reversal: false,
      closeBy: false,
      magic: position.magic,
      zone: { kind: 'zone', magic: position.magic, label: this.zoneLabel(position.magic) },
      fractal: fractal ? { side: fractal[1], time: fractal[2] } : null,
    });
  }

  // ------------------------------------------------------------------ MT5-API
  /** Der Lauf führt kein Ereignisprotokoll wie die Musterlösungen (Millionen Ereignisse) */
  protected override recordBotEvent(): void {}

  override positionsGet(ticket?: number): Position[] {
    if (this.profitStale) {
      for (const p of this.positions) p.profit = this.floating(p);
      this.profitStale = false;
    }
    return super.positionsGet(ticket);
  }

  override copyRatesFromPos(symbol: string, timeframe: Timeframe, startPos: number, count: number): Bar[] | null {
    if (symbol !== this.symbol) return null;
    const agg = this.aggregators.get(timeframe);
    if (!agg) throw new RunError('run.timeframeUnavailable', { timeframe });
    return agg.rates(this.forming, startPos, count);
  }

  /** Auf die Preisstellen des Symbols (schnell; die Preise liegen auf dem Raster, keine Halbwerte) */
  private round(x: number): number {
    const factor = 10 ** this.info.digits;
    return Math.round(x * factor) / factor;
  }
}
