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

  constructor(options: PathBrokerOptions) {
    super({ symbol: options.info, start: options.start, firstBid: options.firstBid });
    this.costs = options.costs;
    this.fill = options.fill;
    this.commissionPerLot = options.commissionPerLot;
    this.slFirst = options.slFirst;
    this.zoneLabel = options.zoneLabel;
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

  /** Neue Kerze der Datenauflösung: Spread der Kerze (Punkte) gilt bis zum Kerzenende */
  beginCandle(time: number, open: number, spreadPoints: number): void {
    this.spreadPrice = this.round(spreadPoints * this.costs.point);
    this.forming = { time, open, high: open, low: open, close: open };
  }

  endCandle(): void {
    if (!this.forming) return;
    for (const agg of this.aggregators.values()) agg.push(this.forming);
    this.forming = null;
  }

  /** Kurs und Uhr setzen; Ask = Bid + Spread */
  setMarket(bid: number, time: number): void {
    this.now = time;
    this.tick = this.makeTick(bid, this.round(bid + this.spreadPrice));
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
    const up = to > from;
    const down = to < from;
    const order = this.slFirst ? { sl: 0, tp: 1, fill: 2 } : { tp: 0, sl: 1, fill: 2 };
    const pick: { best: Trigger | null } = { best: null };
    const consider = (kind: Trigger['kind'], ticket: number, atOrAbove: boolean, mark: number) => {
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
    const sp = this.spreadPrice;
    for (const o of this.orders) {
      if (o.type === ORDER_TYPE_BUY_LIMIT) consider('fill', o.ticket, false, this.round(o.price_open - sp));
      else if (o.type === ORDER_TYPE_BUY_STOP) consider('fill', o.ticket, true, this.round(o.price_open - sp));
      else if (o.type === ORDER_TYPE_SELL_LIMIT) consider('fill', o.ticket, true, o.price_open);
      else if (o.type === ORDER_TYPE_SELL_STOP) consider('fill', o.ticket, false, o.price_open);
    }
    for (const p of this.positions) {
      if (p.type === POSITION_TYPE_BUY) {
        if (p.tp) consider('tp', p.ticket, true, p.tp);
        if (p.sl) consider('sl', p.ticket, false, p.sl);
      } else {
        if (p.tp) consider('tp', p.ticket, false, this.round(p.tp - sp));
        if (p.sl) consider('sl', p.ticket, true, this.round(p.sl - sp));
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
      const price = useMarket ? marketPrice : order.price_open;
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
    const marketPrice = buy ? this.tick.bid : this.tick.ask;
    const price = useMarket ? marketPrice : level;
    this.closePosition(position, price, trigger.kind);
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
    this.opens.set(position.ticket, { time: this.now, price, commission, swap: 0, favorablePrice: price, adversePrice: price });
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
