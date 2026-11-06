/**
 * Backtest und Handelsseiten des Brokers (10018 „Market closed“), ohne Browserseite.
 * BKT-21 Backtest: Handelsseiten des Brokers (10018)
 * Zahlen von Hand gerechnet: Gold-ähnliches Symbol (Tick 0,01), Spread 20 Punkte = 0,20, 10:00 Brokerzeit = 36 000 s.
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol, type SymbolSnapshot } from '../../src/lib/backtest/broker/costs';
import { PathBroker } from '../../src/lib/backtest/broker/pathBroker';
import { parseTradeSessions, tradeOpenAt, type TradeSessions } from '../../src/lib/backtest/broker/tradeSessions';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import { EngineState } from '../../src/lib/backtest/engine/state';
import { cancelOrder } from '../../src/lib/backtest/engine/orders';
import { ORDER_TYPE_BUY_LIMIT, TRADE_ACTION_PENDING, TRADE_RETCODE_DONE } from '../../src/lib/backtest/engine/types';
import { runBacktest, type RunInput, type RunModel } from '../../src/lib/backtest/runner';
import type { SymbolDetail } from '../../src/store/types';

const DETAIL: SymbolDetail = {
  name: 'XAUUSD',
  digits: 2,
  point: 0.01,
  volume_min: 0.01,
  volume_max: 50,
  volume_step: 0.01,
  trade_mode: 4,
  currency_base: 'XAU',
  currency_profit: 'USD',
  currency_margin: 'XAU',
  trade_tick_value: 1,
  trade_tick_size: 0.01,
  trade_contract_size: 100,
  trade_calc_mode: 2,
  trade_tick_value_profit: 1,
  trade_tick_value_loss: 1,
  swap_mode: 4,
  swap_long: -6.5,
  swap_short: 2,
  swap_rollover3days: 3,
  spread: 20,
  trade_stops_level: 0,
};

function snapshot(detail: Partial<SymbolDetail> = {}): SymbolSnapshot {
  const result = snapshotSymbol({ ...DETAIL, ...detail }, { swapEnabled: false, approximate: false });
  if (!('snapshot' in result)) throw new Error(JSON.stringify(result.problems));
  return result.snapshot;
}

/** Zeilen: [Zeit, Eröffnung, Hoch, Tief, Schluss, Spread in Punkten] */
function candles(rows: number[][], sa?: number[]): LoadedRates {
  const col = (i: number) => Float64Array.from(rows.map((r) => r[i]));
  const tick = sa ? { sa: Float64Array.from(sa), sx: Float64Array.from(sa) } : {};
  return { t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: Float64Array.from(rows.map((r) => r[5] ?? NaN)), ...tick, missing: [], digits: 2, point: 0.01, liveFrom: null };
}

const ZONE = {
  id: 'z1',
  symbol: 'XAUUSD',
  order_type: 'BUY',
  min_price: 2600,
  max_price: 2700,
  grid_step: 1,
  lot_size: 0.1,
  take_profit: 1,
  stop_loss: 0,
  sell_grid_step: 1,
  sell_lot_size: 0.1,
  sell_take_profit: 1,
  sell_stop_loss: 0,
  is_breakout: false,
  pullback_distance: 0.5,
  sell_pullback_distance: 0.5,
  sync_buy_sell: true,
  levels_below: 2,
  levels_above: 2,
  max_positions: 10,
  clear_on_exit: false,
  clear_exit_side: 'Farketmez',
  clear_scope: 'Sadece Bekleyen Emirler',
  clear_target_side: 'Farketmez (Hepsi)',
  exit_condition: 'Anlık Fiyat',
  exit_timeframe: 'M15',
};

/** Mittwoch 2026-10-07 00:00 (Brokerzeit) */
const WED = 1_791_331_200;
const T1 = WED + 10 * 3600;
const MODEL: RunModel = { fill: 'gap', slFirst: false, path: 'auto', closeAtEnd: true };
const FULL: [number, number][] = [[0, 86400]];
/** Woche, in der nur der Mittwoch die gegebenen Seiten hat (Index 0 = Sonntag) */
const week = (wed: [number, number][]): TradeSessions => [FULL, FULL, FULL, wed, FULL, FULL, FULL];
/** Mittwoch offen bis `from` und ab `to` (Sekunden des Tages); dazwischen zu */
const closedBetween = (from: number, to: number) => week([[0, from], [to, 86400]]);

function run(rates: LoadedRates, extra: Partial<RunInput> = {}) {
  return runBacktest({
    zone: ZONE,
    snapshot: snapshot(),
    rates,
    dataTimeframe: 'M1',
    from: rates.t[0],
    to: rates.t[rates.t.length - 1] + (extra.dataTimeframe === 'M5' ? 300 : 60),
    spread: { mode: 'candle' },
    commissionPerLot: 0,
    model: MODEL,
    startCapital: 10_000,
    ...extra,
  });
}
const withSessions = (sessions: TradeSessions | null) => ({ snapshot: snapshot({ trade_sessions: sessions }) });
const codes = (r: ReturnType<typeof run>, code: string) => r.log.lines.filter((l) => l.code === code);

/** A (10:00) flach: der Bot setzt BUY_LIMIT 2649/2648 und BUY_STOP 2651/2652; B (10:01) taucht unter 2649 und kehrt zurück; C (10:02) flach */
const A = [T1, 2650, 2650, 2650, 2650, 20];
const B_DIP = [T1 + 60, 2650, 2650, 2648.4, 2650, 20];
const C = [T1 + 120, 2650, 2650, 2650, 2650, 20];
const CLOSED_B = closedBetween(36_060, 36_120);

test.describe('tradeOpenAt / parseTradeSessions', () => {
  test('Seite gilt von (einschließlich) bis (ausschließlich) am Wochentag der Brokerzeit', { tag: '@BKT-21' }, () => {
    const sessions = week([[7200, 36_000], [36_120, 86_400]]); // Mittwoch zu von 10:00 bis 10:02
    expect(tradeOpenAt(sessions, WED + 7199)).toBe(false);
    expect(tradeOpenAt(sessions, WED + 7200)).toBe(true);
    expect(tradeOpenAt(sessions, T1 - 1)).toBe(true);
    expect(tradeOpenAt(sessions, T1)).toBe(false);
    expect(tradeOpenAt(sessions, T1 + 119)).toBe(false);
    expect(tradeOpenAt(sessions, T1 + 120)).toBe(true);
    expect(tradeOpenAt(sessions, WED + 86_400)).toBe(true); // Donnerstag 00:00: ein anderer Tag
    expect(tradeOpenAt(sessions, WED - 1)).toBe(true); // Dienstag 23:59:59
  });

  test('Ungültige oder fehlende Pläne sind null', { tag: '@BKT-21' }, () => {
    expect(parseTradeSessions(undefined)).toBeNull();
    expect(parseTradeSessions(null)).toBeNull();
    expect(parseTradeSessions([[], []])).toBeNull();
    expect(parseTradeSessions(week([[100, 100]]))).toBeNull();
    expect(parseTradeSessions(week([[0, 86_401]]))).toBeNull();
    expect(parseTradeSessions(week([[3600, 7200], [7000, 8000]]))).toBeNull();
    expect(parseTradeSessions(week([[0, 3600]]))).toEqual(week([[0, 3600]]));
  });

  test('Schnappschuss übernimmt trade_sessions oder null', { tag: '@BKT-21' }, () => {
    expect(snapshot({ trade_sessions: CLOSED_B }).tradeSessions).toEqual(CLOSED_B);
    expect(snapshot().tradeSessions).toBeNull();
    expect(snapshot({ trade_sessions: [[]] as unknown as TradeSessions }).tradeSessions).toBeNull();
  });
});

test.describe('Lauf mit Handelsseiten', () => {
  test('Kontrolle: ohne Seiten füllt das Kauf-Limit 2649 beim Tauchen in Kerze B', { tag: '@BKT-21' }, () => {
    const result = run(candles([A, B_DIP, C], [20, 20, 20]));
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades[0].entryPrice).toBe(2649);
  });

  test('Kerze B zu: der Tauchgang füllt nichts, die Order bleibt unberührt', { tag: '@BKT-21' }, () => {
    const result = run(candles([A, B_DIP, C], [20, 20, 20]), withSessions(CLOSED_B));
    expect(result.trades).toEqual([]);
  });

  test('Kerze B zu, Kurs bleibt unter dem Limit: Füllung beim Öffnen zum Marktpreis (Ask 2648,20)', { tag: '@BKT-21' }, () => {
    const down = [T1 + 60, 2650, 2650, 2648, 2648, 20];
    const reopen = [T1 + 120, 2648, 2648, 2648, 2648, 20];
    const result = run(candles([A, down, reopen], [20, 20, 20]), withSessions(CLOSED_B));
    expect(result.trades[0].entryPrice).toBe(2648.2);
    const control = run(candles([A, down, reopen], [20, 20, 20]));
    expect(control.trades[0].entryPrice).toBe(2649);
  });

  test('Offener SL-Fall: Kauf-SL im geschlossenen Fenster feuert nicht, beim Öffnen füllt er zum Bid', { tag: '@BKT-21' }, () => {
    const zone = { ...ZONE, instant_entry: true, levels_below: 0, levels_above: 0, stop_loss: 1, take_profit: 50 };
    const flat = [T1, 2650, 2650, 2650, 2650, 20];
    const crash = [T1 + 60, 2650, 2650, 2647, 2647, 20];
    const reopen = [T1 + 120, 2647, 2647, 2647, 2647, 20];
    const result = run(candles([flat, crash, reopen], [20, 20, 20]), { zone, ...withSessions(CLOSED_B) });
    expect(result.trades[0].exitPrice).toBe(2647); // Bid beim Öffnen, kein Schlupf auf dem SL-Preis
    expect(result.trades[0].exitTime).toBeGreaterThanOrEqual(T1 + 120);
  });

  test('Bot kommt zu: 10018, WARN je Versuch, keine PAUSE; die Orders stehen ab Öffnung', { tag: '@BKT-21' }, () => {
    const closedStart = closedBetween(36_000, 36_120);
    const dip = [T1 + 120, 2650, 2650, 2648.4, 2650, 20];
    const result = run(candles([A, [T1 + 60, 2650, 2650, 2650, 2650, 20], dip], [20, 20, 20]), withSessions(closedStart));
    expect(codes(result, 'order.marketClosed').length).toBeGreaterThanOrEqual(2);
    expect(result.log.lines.some((l) => l.code === 'order.checkFailed' && l.params?.retcode === 10018)).toBe(true);
    expect(codes(result, 'zone.pausedAfterRejects')).toEqual([]);
    expect(result.trades.length).toBeGreaterThan(0); // Limit 2649 füllt in Kerze C
    const info = codes(result, 'run.tradeSessions')[0];
    expect(info.params).toMatchObject({ candles: 2 });
    expect(Number(info.params?.rejects)).toBeGreaterThanOrEqual(2);
  });

  test('Wiederholung nach 60 s auch innerhalb einer langen Kerze (M5: fünf Versuche, nicht einer)', { tag: '@BKT-21' }, () => {
    const closedFirst = closedBetween(36_000, 36_300);
    const rates = candles([[T1, 2650, 2650, 2650, 2650, 20], [T1 + 300, 2650, 2650, 2650, 2650, 20]], [20, 20]);
    const result = run(rates, { dataTimeframe: 'M5', ...withSessions(closedFirst) });
    expect(codes(result, 'order.marketClosed').length).toBe(5);
  });

  test('Replay-Minute zu: Ticks mit Ask unter dem Limit füllen nichts', { tag: '@BKT-21' }, () => {
    const ticks = [[0, 2650.0, 2650.2], [10000, 2648.4, 2648.6], [20000, 2650.0, 2650.2]];
    const replay = new Map([[T1 + 60, { ms: ticks.map((x) => x[0]), bid: ticks.map((x) => x[1]), ask: ticks.map((x) => x[2]) }]]);
    const rates = { ...candles([A, B_DIP, C], [20, 20, 20]), replay };
    const spread = { mode: 'tick', points: 0 } as const;
    expect(run(rates, { spread }).trades.length).toBeGreaterThan(0);
    expect(run(rates, { spread, ...withSessions(CLOSED_B) }).trades).toEqual([]);
  });

  test('Seitengrenze mitten in der Kerze: Kerze zählt als offen, Warnung run.tradeSessionPartial', { tag: '@BKT-21' }, () => {
    const result = run(candles([A, B_DIP, C], [20, 20, 20]), withSessions(closedBetween(36_090, 36_120)));
    expect(codes(result, 'run.tradeSessionPartial')[0]?.params).toMatchObject({ candles: 1 });
    expect(result.trades.length).toBeGreaterThan(0);
  });

  test('Seiten null, immer offen oder abgeschaltet: Zahlen und Protokoll wie ohne Seiten', { tag: '@BKT-21' }, () => {
    const rates = () => candles([A, B_DIP, C], [20, 20, 20]);
    for (const spread of [{ mode: 'candle' }, { mode: 'max', points: 0 }, { mode: 'tick', points: 0 }] as const) {
      const none = run(rates(), { spread });
      const unknown = run(rates(), { spread, ...withSessions(null) });
      const alwaysOpen = run(rates(), { spread, ...withSessions(week(FULL)) });
      const off = run(rates(), { spread, snapshot: snapshot({ trade_sessions: CLOSED_B }), model: { ...MODEL, tradeSessions: false } });
      for (const other of [unknown, alwaysOpen, off]) {
        expect(JSON.stringify(other.trades)).toBe(JSON.stringify(none.trades));
        expect(other.summary).toEqual(none.summary);
        expect(other.equity).toEqual(none.equity);
      }
      expect(JSON.stringify(unknown.log.lines)).toBe(JSON.stringify(none.log.lines));
      expect(JSON.stringify(off.log.lines)).toBe(JSON.stringify(none.log.lines));
    }
  });
});

test.describe('Bot-Nachbau: 10018 wie ENG-32/33', () => {
  const info = snapshot();
  const make = () => {
    const broker = new PathBroker({
      info: info.info,
      costs: info.costs,
      start: T1,
      firstBid: 2650,
      fill: 'gap',
      commissionPerLot: 0,
      slFirst: false,
      timeframes: [],
      zoneLabel: () => null,
    });
    broker.beginCandle(T1, 2650, 20);
    broker.setMarket(2650, T1);
    const state = new EngineState(() => broker.now);
    const place = broker.orderSend({ action: TRADE_ACTION_PENDING, symbol: 'XAUUSD', volume: 0.1, type: ORDER_TYPE_BUY_LIMIT, price: 2640, magic: 200001, comment: 'x', tp: 0 });
    expect(place?.retcode).toBe(TRADE_RETCODE_DONE);
    const order = broker.ordersGet(place?.order)?.[0];
    if (!order) throw new Error('order missing');
    return { broker, state, order };
  };

  test('Löschen bei geschlossenem Markt: 10018, danach 60 s kein Versuch (ENG-33), dann klappt es', { tag: '@BKT-21' }, () => {
    const { broker, state, order } = make();
    broker.setTradeOpen(false);
    expect(cancelOrder(broker, order, state)).toBe(false);
    expect(state.lastRetcode).toBe(10018);
    expect(broker.closedRejects).toBe(1);
    expect(cancelOrder(broker, order, state)).toBe(false);
    expect(broker.closedRejects).toBe(1); // kein neuer Versuch innerhalb der Pause
    broker.setTradeOpen(true);
    broker.setMarket(2650, T1 + 30);
    expect(cancelOrder(broker, order, state)).toBe(false); // Pause läuft noch
    broker.setMarket(2650, T1 + 61);
    expect(cancelOrder(broker, order, state)).toBe(true);
    expect(broker.ordersGet(order.ticket)).toEqual([]);
  });
});
