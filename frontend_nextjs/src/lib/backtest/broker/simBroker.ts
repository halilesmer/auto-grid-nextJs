/**
 * Simulierter Broker für den Bot-Nachbau (lib/backtest/engine/).
 * Quelle: worker_python/tests/fakes/fake_mt5.py (FakeMT5: Orderbuch, Füllung, TP/SL) und
 * worker_python/tests/parity/runner.py (TimelineMT5: Kerzen nur aus Historie und bisherigen Ticks;
 * Recorder: Ereignisfolge ohne Ticketnummern).
 *
 * Modus „parity“: Pending Orders füllen zum Orderpreis, TP/SL schließen ohne Kurslücke, wie der
 * FakeMT5 der Musterlösungen (BKT-01). Der Lauf mit Kerzenpfad, Kosten und Füllung zum Marktpreis nach einer Lücke
 * steht in pathBroker.ts (PathBroker erbt von dieser Klasse).
 */
import { pyRound } from '@/lib/backtest/engine/pyRound';
import {
  BUY_ORDER_TYPES,
  ORDER_STATE_CANCELED,
  ORDER_STATE_FILLED,
  ORDER_STATE_PLACED,
  ORDER_TYPE_BUY,
  ORDER_TYPE_BUY_LIMIT,
  ORDER_TYPE_BUY_STOP,
  ORDER_TYPE_SELL_LIMIT,
  ORDER_TYPE_SELL_STOP,
  POSITION_TYPE_BUY,
  POSITION_TYPE_SELL,
  TF_SECONDS,
  TRADE_ACTION_DEAL,
  TRADE_ACTION_MODIFY,
  TRADE_ACTION_PENDING,
  TRADE_ACTION_REMOVE,
  TRADE_ACTION_SLTP,
  TRADE_RETCODE_DONE,
  TRADE_RETCODE_INVALID,
  type Bar,
  type Broker,
  type Order,
  type Position,
  type SymbolInfo,
  type Tick,
  type Timeframe,
  type TradeRequest,
  type TradeResult,
} from '@/lib/backtest/engine/types';

export type FillMode = 'parity';

/** Marktanfragen des Bots, die eine Position eröffnen oder schließen (Preis: Bid bei Kauf, Ask bei Verkauf) */
export interface SimBrokerHooks {
  openedByBot(position: Position, price: number): void;
  closedByBot(position: Position, price: number): void;
}

/** Symbol wie im Szenario: name, digits, point, spread_points und weitere SymbolInfo-Felder */
export interface SimSymbol extends Partial<SymbolInfo> {
  name: string;
  spread_points?: number;
}

export type HistoryBar = Pick<Bar, 'time' | 'open' | 'high' | 'low' | 'close'> & Partial<Bar>;

export interface SimBrokerOptions {
  symbol: SimSymbol;
  /** Startzeit in Sekunden (Brokerzeit) */
  start: number;
  /** Erster Bid-Kurs (Startkurs des Symbols) */
  firstBid: number;
  /** Abgeschlossene Kerzen vor dem Start je Zeitrahmen (alt → neu) */
  history?: Partial<Record<Timeframe, HistoryBar[]>>;
  mode?: FillMode;
}

const TYPE_NAMES: Record<number, string> = {
  0: 'BUY',
  1: 'SELL',
  2: 'BUY_LIMIT',
  3: 'SELL_LIMIT',
  4: 'BUY_STOP',
  5: 'SELL_STOP',
};
const POSITION_NAMES: Record<number, string> = { 0: 'BUY', 1: 'SELL' };

/** Ereignis wie in den Golden-Dateien: {i, t, ev, …} */
export type SimEvent = { i: number; t: number; ev: string } & Record<string, unknown>;

/** Standardwerte von SymbolInfo in fake_mt5.py */
function symbolInfoOf(spec: SimSymbol): SymbolInfo {
  return {
    name: spec.name,
    point: spec.point ?? 0.001,
    digits: spec.digits ?? 3,
    volume_min: spec.volume_min ?? 0.01,
    volume_max: spec.volume_max ?? 50.0,
    volume_step: spec.volume_step ?? 0.01,
    trade_stops_level: spec.trade_stops_level ?? 0,
    trade_contract_size: spec.trade_contract_size ?? 1000.0,
    trade_tick_size: spec.trade_tick_size ?? 0,
    trade_tick_value: spec.trade_tick_value ?? 0,
  };
}

export class SimBroker implements Broker {
  readonly mode: FillMode;
  readonly symbol: string;
  readonly info: SymbolInfo;
  readonly events: SimEvent[] = [];
  /** Aktuelle Zeit in Sekunden (simulierte Uhr) */
  now: number;
  /** Index und Sekunden ab Start des laufenden Ticks (für die Ereignisse) */
  index = 0;
  dt = 0;

  private readonly spread: number;
  private readonly eventDigits: number;
  protected tick: Tick;
  protected orders: Order[] = [];
  protected positions: Position[] = [];
  protected readonly history = new Map<number, Order>();
  private readonly historyBars: Partial<Record<Timeframe, HistoryBar[]>>;
  private readonly seen: [number, number][] = [];
  protected nextTicket = 1000;
  /** Der Lauf (PathBroker) hängt hier Kosten und Trades ein; im Paritätsmodus bleibt es leer */
  protected hooks: SimBrokerHooks | null = null;

  constructor(options: SimBrokerOptions) {
    this.mode = options.mode ?? 'parity';
    this.info = symbolInfoOf(options.symbol);
    this.symbol = options.symbol.name;
    this.spread = (options.symbol.spread_points ?? 10) * this.info.point;
    this.eventDigits = this.info.digits + 2;
    this.now = options.start;
    this.historyBars = options.history ?? {};
    // add_symbol: Ask = Bid + 10 point
    this.tick = this.makeTick(options.firstBid, pyRound(options.firstBid + 10 * this.info.point, this.info.digits));
  }

  /** Infos für den Bot (symbol_infos) */
  symbolInfos(): Record<string, SymbolInfo> {
    return { [this.symbol]: this.info };
  }

  // ------------------------------------------------------------------ Markt
  /**
   * Ein Tick: Uhr stellen, Kurs setzen, dann wie der Broker erst Pending Orders füllen, danach TP/SL
   * auslösen (so bleibt auch ein Ausstieg im selben Tick wie die Füllung sichtbar).
   */
  marketStep(index: number, dt: number, time: number, bid: number): void {
    this.index = index;
    this.dt = dt;
    this.now = time;
    this.seen.push([time, bid]);
    this.tick = this.makeTick(bid, pyRound(bid + this.spread, this.info.digits));

    const before = [...this.orders];
    this.fillPending();
    const open = new Set(this.orders.map((o) => o.ticket));
    const filledVolume = new Map(this.positions.map((p) => [p.ticket, p.volume]));
    for (const o of before) {
      if (open.has(o.ticket) || o.state !== ORDER_STATE_FILLED) continue;
      this.emit('fill', {
        type: TYPE_NAMES[o.type],
        price: this.r(o.price_open),
        volume: this.r(filledVolume.get(o.ticket) ?? o.volume_initial),
        magic: o.magic,
      });
    }

    const positionsBefore = [...this.positions];
    this.triggerTpSl();
    const still = new Set(this.positions.map((p) => p.ticket));
    for (const p of positionsBefore) {
      if (still.has(p.ticket)) continue;
      const buy = p.type === POSITION_TYPE_BUY;
      const hitTp = Boolean(p.tp) && ((buy && this.tick.bid >= p.tp) || (!buy && this.tick.ask <= p.tp));
      this.emit('exit', {
        type: POSITION_NAMES[p.type],
        open: this.r(p.price_open),
        price: this.r(buy ? this.tick.bid : this.tick.ask),
        reason: hitTp ? 'tp' : 'sl',
        volume: this.r(p.volume),
        magic: p.magic,
      });
    }
  }

  /** Ereignis des Szenario-Treibers (z. B. `active`) */
  emit(ev: string, data: Record<string, unknown>): void {
    this.events.push({ i: this.index, t: this.dt, ev, ...data });
  }

  protected r(x: number | undefined): number {
    return pyRound(x || 0, this.eventDigits);
  }

  protected makeTick(bid: number, ask: number): Tick {
    const timeMsc = Math.trunc(this.now * 1000);
    return { bid, ask, time_msc: timeMsc, time: Math.floor(timeMsc / 1000) };
  }

  private fillPending(): void {
    const { bid, ask } = this.tick;
    const stillOpen: Order[] = [];
    for (const o of this.orders) {
      const filled =
        o.symbol === this.symbol &&
        ((o.type === ORDER_TYPE_BUY_LIMIT && ask <= o.price_open) ||
          (o.type === ORDER_TYPE_BUY_STOP && ask >= o.price_open) ||
          (o.type === ORDER_TYPE_SELL_LIMIT && bid >= o.price_open) ||
          (o.type === ORDER_TYPE_SELL_STOP && bid <= o.price_open));
      if (!filled) {
        stillOpen.push(o);
        continue;
      }
      // Parität: Füllung zum Orderpreis, auch nach einer Kurslücke
      this.positions.push({
        ticket: o.ticket,
        identifier: o.ticket,
        symbol: o.symbol,
        type: BUY_ORDER_TYPES.includes(o.type) ? POSITION_TYPE_BUY : POSITION_TYPE_SELL,
        price_open: o.price_open,
        volume: o.volume_current,
        tp: o.tp,
        sl: o.sl,
        magic: o.magic,
        profit: 0,
        comment: o.comment,
      });
      o.volume_current = 0;
      o.state = ORDER_STATE_FILLED;
      this.history.set(o.ticket, o);
    }
    this.orders = stillOpen;
  }

  private triggerTpSl(): void {
    const { bid, ask } = this.tick;
    this.positions = this.positions.filter((p) => {
      if (p.symbol !== this.symbol) return true;
      if (p.type === POSITION_TYPE_BUY) return !((p.tp && bid >= p.tp) || (p.sl && bid <= p.sl));
      return !((p.tp && ask <= p.tp) || (p.sl && ask >= p.sl));
    });
  }

  // ------------------------------------------------------------------ Kerzen ohne Zukunft
  private bars(timeframe: Timeframe): Bar[] {
    const step = TF_SECONDS[timeframe];
    const bars: Bar[] = (this.historyBars[timeframe] ?? []).map((b) => ({ tick_volume: 0, spread: 0, ...b }));
    const lastHist = bars.length > 0 ? bars[bars.length - 1].time : null;
    for (const [t, bid] of this.seen) {
      const start = Math.floor(Math.trunc(t) / step) * step;
      if (lastHist !== null && start <= lastHist) continue; // die Historie endet vor dem Start
      const last = bars[bars.length - 1];
      if (last && last.time === start) {
        last.high = Math.max(last.high, bid);
        last.low = Math.min(last.low, bid);
        last.close = bid;
        last.tick_volume += 1;
      } else {
        bars.push({ time: start, open: bid, high: bid, low: bid, close: bid, tick_volume: 1, spread: 0 });
      }
    }
    return bars;
  }

  copyRatesFromPos(symbol: string, timeframe: Timeframe, startPos: number, count: number): Bar[] | null {
    if (symbol !== this.symbol) return null;
    const full = this.bars(timeframe);
    const end = full.length - startPos;
    if (end <= 0) return null;
    const slice = full.slice(Math.max(0, end - count), end);
    return slice.length > 0 ? slice : null;
  }

  // ------------------------------------------------------------------ MT5-API
  symbolInfo(symbol: string): SymbolInfo | null {
    return symbol === this.symbol ? this.info : null;
  }

  symbolInfoTick(symbol: string): Tick | null {
    return symbol === this.symbol ? { ...this.tick } : null;
  }

  ordersGet(ticket?: number): Order[] {
    return this.orders.filter((o) => ticket === undefined || o.ticket === ticket);
  }

  positionsGet(ticket?: number): Position[] {
    return this.positions.filter((p) => ticket === undefined || p.ticket === ticket);
  }

  historyOrdersGet(ticket: number): Order[] {
    const order = this.history.get(ticket);
    return order ? [order] : [];
  }

  orderCheck(): TradeResult {
    return { retcode: 0, order: 0, comment: '' };
  }

  lastError(): string {
    return 'Success';
  }

  orderSend(request: TradeRequest): TradeResult {
    const ordersBefore = new Map(this.orders.map((o) => [o.ticket, { ...o }]));
    const positionsBefore = new Map(this.positions.map((p) => [p.ticket, { ...p }]));
    const result = this.execute(request);
    if (result.retcode === TRADE_RETCODE_DONE) this.recordBotEvent(request, ordersBefore, positionsBefore);
    return result;
  }

  private done(order = 0): TradeResult {
    return { retcode: TRADE_RETCODE_DONE, order, comment: '' };
  }

  private execute(req: TradeRequest): TradeResult {
    const invalid: TradeResult = { retcode: TRADE_RETCODE_INVALID, order: 0, comment: '' };
    switch (req.action) {
      case TRADE_ACTION_PENDING: {
        const ticket = this.nextTicket++;
        const volume = req.volume ?? 0;
        this.orders.push({
          ticket,
          symbol: req.symbol ?? '',
          type: req.type ?? 0,
          price_open: req.price ?? 0,
          volume_initial: volume,
          volume_current: volume,
          tp: req.tp ?? 0,
          sl: req.sl ?? 0,
          magic: req.magic ?? 0,
          comment: req.comment ?? '',
          state: ORDER_STATE_PLACED,
        });
        return this.done(ticket);
      }
      case TRADE_ACTION_REMOVE: {
        const removed = this.orders.filter((o) => o.ticket === req.order);
        this.orders = this.orders.filter((o) => o.ticket !== req.order);
        for (const o of removed) {
          o.state = ORDER_STATE_CANCELED;
          this.history.set(o.ticket, o);
        }
        return removed.length > 0 ? this.done() : invalid;
      }
      case TRADE_ACTION_MODIFY: {
        const o = this.orders.find((x) => x.ticket === req.order);
        if (!o) return invalid;
        o.price_open = req.price ?? o.price_open;
        o.sl = req.sl ?? 0;
        o.tp = req.tp ?? 0;
        return this.done();
      }
      case TRADE_ACTION_SLTP: {
        const p = this.positions.find((x) => x.ticket === req.position);
        if (!p) return invalid;
        p.tp = req.tp ?? 0;
        p.sl = req.sl ?? 0;
        return this.done();
      }
      case TRADE_ACTION_DEAL: {
        if (req.position !== undefined) {
          // Position schließen (wie FakeMT5 auch, wenn es sie nicht mehr gibt)
          const closing = this.positions.find((p) => p.ticket === req.position);
          this.positions = this.positions.filter((p) => p.ticket !== req.position);
          if (closing) this.hooks?.closedByBot(closing, closing.type === POSITION_TYPE_BUY ? this.tick.bid : this.tick.ask);
          return this.done();
        }
        const ticket = this.nextTicket++;
        const type = req.type === ORDER_TYPE_BUY ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
        const volume = req.volume ?? 0;
        const price = req.price ?? 0;
        const opened: Position = {
          ticket,
          identifier: ticket,
          symbol: req.symbol ?? '',
          type,
          price_open: price,
          volume,
          tp: req.tp ?? 0,
          sl: req.sl ?? 0,
          magic: req.magic ?? 0,
          profit: 0,
          comment: '',
        };
        this.positions.push(opened);
        this.hooks?.openedByBot(opened, price);
        // Eröffnende Order in der Historie (add_position)
        this.history.set(ticket, {
          ticket,
          symbol: req.symbol ?? '',
          type: req.type ?? 0,
          price_open: price,
          volume_initial: volume,
          volume_current: 0,
          tp: req.tp ?? 0,
          sl: req.sl ?? 0,
          magic: req.magic ?? 0,
          comment: '',
          state: ORDER_STATE_FILLED,
        });
        return this.done(ticket);
      }
      default:
        return { retcode: TRADE_RETCODE_INVALID, order: 0, comment: 'unsupported action' };
    }
  }

  /** Recorder._bot_event: Ereignis der erfolgreichen Bot-Anfrage, Preise mit digits + 2 Stellen */
  protected recordBotEvent(req: TradeRequest, orders: Map<number, Order>, positions: Map<number, Position>): void {
    switch (req.action) {
      case TRADE_ACTION_PENDING:
        this.emit('place', {
          type: TYPE_NAMES[req.type ?? 0],
          price: this.r(req.price),
          volume: this.r(req.volume),
          tp: this.r(req.tp),
          sl: this.r(req.sl),
          magic: req.magic ?? 0,
          comment: req.comment ?? '',
        });
        return;
      case TRADE_ACTION_REMOVE: {
        const o = orders.get(req.order ?? -1);
        if (o) this.emit('cancel', { type: TYPE_NAMES[o.type], price: this.r(o.price_open), magic: o.magic });
        return;
      }
      case TRADE_ACTION_MODIFY: {
        const o = orders.get(req.order ?? -1);
        if (o) {
          this.emit('modify', {
            type: TYPE_NAMES[o.type],
            price: this.r(req.price ?? o.price_open),
            tp: this.r(req.tp),
            sl: this.r(req.sl),
            magic: o.magic,
          });
        }
        return;
      }
      case TRADE_ACTION_SLTP: {
        const p = positions.get(req.position ?? -1);
        if (p) {
          this.emit('sltp', { type: POSITION_NAMES[p.type], open: this.r(p.price_open), tp: this.r(req.tp), sl: this.r(req.sl), magic: p.magic });
        }
        return;
      }
      case TRADE_ACTION_DEAL: {
        if (req.position !== undefined) {
          const p = positions.get(req.position);
          if (p) {
            this.emit('close', {
              type: POSITION_NAMES[p.type],
              open: this.r(p.price_open),
              price: this.r(req.price),
              volume: this.r(p.volume),
              magic: p.magic,
            });
          }
          return;
        }
        this.emit('market', {
          type: TYPE_NAMES[req.type ?? 0],
          price: this.r(req.price),
          volume: this.r(req.volume),
          tp: this.r(req.tp),
          sl: this.r(req.sl),
          magic: req.magic ?? 0,
        });
        return;
      }
      default:
    }
  }
}
