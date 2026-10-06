/**
 * Simulierter Broker für den Backtest, Paritätsmodus (BKT-02).
 *
 * Verhält sich wie der FakeMT5 der Musterlösungen (worker_python/tests/fakes/fake_mt5.py mit
 * TimelineMT5 aus tests/parity/runner.py):
 * - Pending Orders werden zum Orderpreis gefüllt, sobald Ask (BUY) bzw. Bid (SELL) ihn erreicht,
 *   auch bei einer Kurslücke. Das Gap-Modell (Füllung zum Kurs) kommt mit B4.
 * - TP/SL schließen zum aktuellen Bid (BUY) bzw. Ask (SELL).
 * - Je Tick erst der Markt (`marketStep`: Füllungen, dann TP/SL), danach ein Bot-Durchlauf.
 * - Kerzen jedes Zeitrahmens entstehen nur aus der Historie und den bisherigen Ticks (kein Blick
 *   in die Zukunft); Position 0 ist die laufende Kerze.
 *
 * Jede Aktion meldet ein Ereignis (`onEvent`) im Format der Golden-Files, ohne Ticketnummern.
 * Orders und Positionen werden als dieselben Objekte zurückgegeben (wie der FakeMT5), damit die
 * Engine Änderungen im selben Durchlauf sieht.
 */
import {
  BUY_ORDER_TYPES,
  MT5,
  type Bar,
  type BrokerApi,
  type Order,
  type Position,
  type SymbolInfo,
  type Tick,
  type TradeRequest,
  type TradeResult,
} from '../engine/mt5';
import { pyRound } from '../engine/pyRound';

export const TF_SECONDS: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
const TF_BY_CONST: Record<number, string> = {
  [MT5.TIMEFRAME_M1]: 'M1',
  [MT5.TIMEFRAME_M5]: 'M5',
  [MT5.TIMEFRAME_M15]: 'M15',
  [MT5.TIMEFRAME_M30]: 'M30',
  [MT5.TIMEFRAME_H1]: 'H1',
  [MT5.TIMEFRAME_H4]: 'H4',
  [MT5.TIMEFRAME_D1]: 'D1',
};
export const TYPE_NAMES: Record<number, string> = {
  0: 'BUY', 1: 'SELL', 2: 'BUY_LIMIT', 3: 'SELL_LIMIT', 4: 'BUY_STOP', 5: 'SELL_STOP',
};
const POSITION_NAMES: Record<number, string> = { 0: 'BUY', 1: 'SELL' };

/** Symbol wie im Szenario: Name, digits, point, Spread in Punkten und weitere SymbolInfo-Felder */
export type SymbolSpec = Partial<SymbolInfo> & { name: string; spread_points?: number };

/** Ereignis wie in tests/parity/runner.py (Recorder); Preise ungerundet */
export type SimEvent =
  | { ev: 'place'; type: string; price: number; volume: number; tp: number; sl: number; magic: number; comment: string }
  | { ev: 'market'; type: string; price: number; volume: number; tp: number; sl: number; magic: number }
  | { ev: 'cancel'; type: string; price: number; magic: number }
  | { ev: 'modify'; type: string; price: number; tp: number; sl: number; magic: number }
  | { ev: 'sltp'; type: string; open: number; tp: number; sl: number; magic: number }
  | { ev: 'close'; type: string; open: number; price: number; volume: number; magic: number }
  | { ev: 'fill'; type: string; price: number; volume: number; magic: number }
  | { ev: 'exit'; type: string; open: number; price: number; reason: 'tp' | 'sl'; volume: number; magic: number };

/** Position mit Eröffnungszeit (für Trades/Statistik ab B4; die Engine liest sie nicht) */
export type SimPosition = Position & { openTime: number };

export interface SimBrokerOptions {
  /** Abgeschlossene Kerzen vor dem Start je Zeitrahmen (alt → neu) */
  history?: Record<string, Bar[]>;
  /** Startzeit in Sekunden (Brokerzeit) */
  start: number;
  /** Erster Bid (Kurs bei Start) */
  firstBid: number;
  onEvent?: (e: SimEvent) => void;
}

export class SimBroker implements BrokerApi {
  readonly symbol: string;
  readonly info: SymbolInfo;
  readonly spread: number;
  now: number;
  orders: Order[] = [];
  positions: SimPosition[] = [];
  /** Order-Historie: Ticket → Order (gefüllt/gelöscht) bzw. eröffnende Marktorder */
  history = new Map<number, Order>();
  private tick: Tick;
  private nextTicket = 1000;
  private readonly bars: Record<string, Bar[]>;
  /** (Zeit, Bid) der bisher gelaufenen Ticks */
  private readonly seen: [number, number][] = [];
  private readonly onEvent: (e: SimEvent) => void;

  constructor(spec: SymbolSpec, opts: SimBrokerOptions) {
    const { name, spread_points: spreadPoints = 10, ...rest } = spec;
    this.symbol = name;
    this.info = {
      name,
      point: 0.001,
      digits: 3,
      volume_min: 0.01,
      volume_max: 50.0,
      volume_step: 0.01,
      trade_stops_level: 0,
      trade_contract_size: 1000.0,
      trade_tick_size: 0,
      trade_tick_value: 0,
      filling_mode: 2,
      ...rest,
    };
    this.spread = spreadPoints * (spec.point ?? 0.001);
    this.now = opts.start;
    this.bars = Object.fromEntries(Object.entries(opts.history ?? {}).map(([tf, bars]) => [tf, bars.map((b) => ({ ...b }))]));
    this.onEvent = opts.onEvent ?? (() => {});
    const bid = opts.firstBid;
    const ask = pyRound(bid + 10 * this.info.point, this.info.digits);
    this.tick = this.makeTick(bid, ask);
  }

  private makeTick(bid: number, ask: number): Tick {
    const timeMsc = Math.trunc(this.now * 1000);
    return { bid, ask, time_msc: timeMsc, time: Math.floor(timeMsc / 1000) };
  }

  askFor(bid: number): number {
    return pyRound(bid + this.spread, this.info.digits);
  }

  /** Neuer Tick: Kurs setzen, Pending Orders füllen, dann TP/SL auslösen */
  marketStep(time: number, bid: number) {
    this.now = time;
    this.seen.push([time, bid]);
    this.tick = this.makeTick(bid, this.askFor(bid));
    this.fillPending();
    this.triggerTpSl();
  }

  private fillPending() {
    const { bid, ask } = this.tick;
    const stillOpen: Order[] = [];
    for (const o of this.orders) {
      const filled =
        o.symbol === this.symbol &&
        ((o.type === MT5.ORDER_TYPE_BUY_LIMIT && ask <= o.price_open) ||
          (o.type === MT5.ORDER_TYPE_BUY_STOP && ask >= o.price_open) ||
          (o.type === MT5.ORDER_TYPE_SELL_LIMIT && bid >= o.price_open) ||
          (o.type === MT5.ORDER_TYPE_SELL_STOP && bid <= o.price_open));
      if (!filled) {
        stillOpen.push(o);
        continue;
      }
      const posType = BUY_ORDER_TYPES.includes(o.type) ? MT5.POSITION_TYPE_BUY : MT5.POSITION_TYPE_SELL;
      const volume = o.volume_current;
      this.positions.push({
        ticket: o.ticket, symbol: o.symbol, type: posType, price_open: o.price_open, volume,
        tp: o.tp, sl: o.sl, magic: o.magic, comment: o.comment, identifier: o.ticket, openTime: this.now,
      });
      o.volume_current = 0;
      o.state = MT5.ORDER_STATE_FILLED;
      this.history.set(o.ticket, o);
      this.onEvent({ ev: 'fill', type: TYPE_NAMES[o.type], price: o.price_open, volume, magic: o.magic });
    }
    this.orders = stillOpen;
  }

  private triggerTpSl() {
    const { bid, ask } = this.tick;
    const remaining: SimPosition[] = [];
    for (const p of this.positions) {
      const buy = p.type === MT5.POSITION_TYPE_BUY;
      const hitTp = !!p.tp && (buy ? bid >= p.tp : ask <= p.tp);
      const hitSl = !!p.sl && (buy ? bid <= p.sl : ask >= p.sl);
      if (p.symbol !== this.symbol || !(hitTp || hitSl)) {
        remaining.push(p);
        continue;
      }
      this.onEvent({
        ev: 'exit', type: POSITION_NAMES[p.type], open: p.price_open, price: buy ? bid : ask,
        reason: hitTp ? 'tp' : 'sl', volume: p.volume, magic: p.magic,
      });
    }
    this.positions = remaining;
  }

  // ------------------------------------------------------------------ BrokerApi
  symbolInfo(symbol: string): SymbolInfo | null {
    return symbol === this.symbol ? this.info : null;
  }

  symbolInfoTick(symbol: string): Tick | null {
    return symbol === this.symbol ? this.tick : null;
  }

  ordersGet(ticket?: number): Order[] {
    return this.orders.filter((o) => ticket === undefined || o.ticket === ticket);
  }

  positionsGet(ticket?: number): Position[] {
    return this.positions.filter((p) => ticket === undefined || p.ticket === ticket);
  }

  historyOrdersGet(ticket: number): Order[] {
    const o = this.history.get(ticket);
    return o ? [o] : [];
  }

  lastError(): [number, string] {
    return [1, 'Success'];
  }

  orderCheck(): { retcode: number } {
    return { retcode: 0 };
  }

  /** Kerzen ohne Zukunft: Historie + bisherige Ticks; Position 0 = laufende Kerze, alt → neu */
  copyRatesFromPos(symbol: string, timeframe: number, startPos: number, count: number): Bar[] | null {
    if (symbol !== this.symbol) return null;
    const full = this.barsOf(timeframe);
    const end = full.length - startPos;
    if (end <= 0) return null;
    const out = full.slice(Math.max(0, end - count), end).map((b) => ({ ...b }));
    return out.length ? out : null;
  }

  private barsOf(timeframe: number): Bar[] {
    const name = TF_BY_CONST[timeframe];
    if (name === undefined) return [];
    const step = TF_SECONDS[name];
    const bars = (this.bars[name] ?? []).map((b) => ({ ...b }));
    const lastHist = bars.length ? bars[bars.length - 1].time : null;
    for (const [t, bid] of this.seen) {
      const start = Math.floor(Math.trunc(t) / step) * step;
      if (lastHist !== null && start <= lastHist) continue;
      const last = bars[bars.length - 1];
      if (last && last.time === start) {
        last.high = Math.max(last.high, bid);
        last.low = Math.min(last.low, bid);
        last.close = bid;
        last.tick_volume = (last.tick_volume ?? 0) + 1;
      } else {
        bars.push({ time: start, open: bid, high: bid, low: bid, close: bid, tick_volume: 1, spread: 0 });
      }
    }
    return bars;
  }

  orderSend(req: TradeRequest): TradeResult {
    const done = (order = 0): TradeResult => ({ retcode: MT5.TRADE_RETCODE_DONE, order, comment: '' });
    const fail = (comment = ''): TradeResult => ({ retcode: 10013, order: 0, comment });

    switch (req.action) {
      case MT5.TRADE_ACTION_PENDING: {
        const order: Order = {
          ticket: this.nextTicket++, symbol: req.symbol ?? '', type: req.type ?? 0, price_open: req.price ?? 0,
          volume_initial: req.volume ?? 0, volume_current: req.volume ?? 0, tp: req.tp ?? 0, sl: req.sl ?? 0,
          magic: req.magic ?? 0, comment: req.comment ?? '', state: MT5.ORDER_STATE_PLACED,
        };
        this.orders.push(order);
        this.onEvent({
          ev: 'place', type: TYPE_NAMES[order.type], price: order.price_open, volume: order.volume_initial,
          tp: order.tp, sl: order.sl, magic: order.magic, comment: order.comment,
        });
        return done(order.ticket);
      }
      case MT5.TRADE_ACTION_REMOVE: {
        const o = this.orders.find((x) => x.ticket === req.order);
        if (!o) return fail();
        this.orders = this.orders.filter((x) => x.ticket !== req.order);
        o.state = MT5.ORDER_STATE_CANCELED;
        this.history.set(o.ticket, o);
        this.onEvent({ ev: 'cancel', type: TYPE_NAMES[o.type], price: o.price_open, magic: o.magic });
        return done();
      }
      case MT5.TRADE_ACTION_MODIFY: {
        const o = this.orders.find((x) => x.ticket === req.order);
        if (!o) return fail();
        o.price_open = req.price ?? o.price_open;
        o.sl = req.sl ?? 0;
        o.tp = req.tp ?? 0;
        this.onEvent({ ev: 'modify', type: TYPE_NAMES[o.type], price: o.price_open, tp: o.tp, sl: o.sl, magic: o.magic });
        return done();
      }
      case MT5.TRADE_ACTION_SLTP: {
        const p = this.positions.find((x) => x.ticket === req.position);
        if (!p) return fail();
        p.tp = req.tp ?? 0;
        p.sl = req.sl ?? 0;
        this.onEvent({ ev: 'sltp', type: POSITION_NAMES[p.type], open: p.price_open, tp: p.tp, sl: p.sl, magic: p.magic });
        return done();
      }
      case MT5.TRADE_ACTION_DEAL: {
        if (req.position !== undefined) {
          const p = this.positions.find((x) => x.ticket === req.position);
          this.positions = this.positions.filter((x) => x.ticket !== req.position);
          if (p) {
            this.onEvent({
              ev: 'close', type: POSITION_NAMES[p.type], open: p.price_open, price: req.price ?? 0,
              volume: p.volume, magic: p.magic,
            });
          }
          return done();
        }
        const posType = req.type === MT5.ORDER_TYPE_BUY ? MT5.POSITION_TYPE_BUY : MT5.POSITION_TYPE_SELL;
        const ticket = this.nextTicket++;
        const pos: SimPosition = {
          ticket, symbol: req.symbol ?? '', type: posType, price_open: req.price ?? 0, volume: req.volume ?? 0,
          tp: req.tp ?? 0, sl: req.sl ?? 0, magic: req.magic ?? 0, comment: '', identifier: ticket, openTime: this.now,
        };
        this.history.set(ticket, {
          ticket, symbol: pos.symbol, type: req.type ?? 0, price_open: pos.price_open, volume_initial: pos.volume,
          volume_current: 0, tp: pos.tp, sl: pos.sl, magic: pos.magic, comment: '', state: MT5.ORDER_STATE_FILLED,
        });
        this.positions.push(pos);
        this.onEvent({
          ev: 'market', type: TYPE_NAMES[req.type ?? 0], price: pos.price_open, volume: pos.volume,
          tp: pos.tp, sl: pos.sl, magic: pos.magic,
        });
        return done(ticket);
      }
      default:
        return fail('unsupported action');
    }
  }
}
