/**
 * Backtest mit offenen Pending Orders zum Start (BKT-24), ohne Browserseite.
 * Die Orders kommen ins Orderbuch des Brokers; die Engine sieht sie wie der Live-Bot nach einem Neustart.
 * Zahlen von Hand gerechnet: Gold-ähnliches Symbol (Tick 0,01), Spread 20 Punkte = 0,20, 10:00 Brokerzeit = 36 000 s.
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol, type SymbolSnapshot } from '../../src/lib/backtest/broker/costs';
import { PathBroker, type InitialOrder } from '../../src/lib/backtest/broker/pathBroker';
import type { TradeSessions } from '../../src/lib/backtest/broker/tradeSessions';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import { ORDER_TYPE_BUY_LIMIT } from '../../src/lib/backtest/engine/types';
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


/** Order, wie der Bot sie sendet: TP = Preis + Abstand (ZONE: 1, tpFar: 50) */
const buyLimit = (price: number, over: Partial<InitialOrder> = {}): InitialOrder => ({
  type: ORDER_TYPE_BUY_LIMIT, price, volume: 0.1, tp: price + 1, magic: 200001, comment: 'AutoGrid_Z200001', time: T1 - 3600, ...over,
});
const tpFar = { ...ZONE, take_profit: 50 };
const far = (price: number) => buyLimit(price, { tp: price + 50 });
const flat = (price: number, n = 3, step = 0) => candles(Array.from({ length: n }, (_, i) => [T1 + 60 * i, price + step * i, price + step * i, price + step * i, price + step * i, 20]), Array(n).fill(20));
const placedFirst = (r: ReturnType<typeof run>) => Number(codes(r, 'grid.ordersPlaced')[0]?.params?.count ?? 0);

test.describe('Start mit offenen Pending Orders', () => {
  test('Drei Kauf-Limits stehen schon bei Öffnung im Geld: alle füllen in der ersten Kerze', { tag: '@BKT-24' }, () => {
    const rates = flat(2646);
    const seeded = run(rates, { initialOrders: [buyLimit(2649), buyLimit(2648), buyLimit(2647)] });
    expect(seeded.trades.filter((t) => t.entryTime === T1)).toHaveLength(3);
    const control = run(rates);
    expect(control.trades.filter((t) => t.entryTime === T1)).toHaveLength(0);
  });

  test('Kein Doppel: die Order auf einer Stufe des Bots wird nicht noch einmal gesetzt', { tag: '@BKT-24' }, () => {
    const rates = flat(2650);
    const control = run(rates, { zone: tpFar });
    expect(placedFirst(control)).toBeGreaterThanOrEqual(2);
    const seeded = run(rates, { zone: tpFar, initialOrders: [far(2649), far(2648)] });
    expect(placedFirst(seeded)).toBe(placedFirst(control) - 2);
    expect(codes(seeded, 'run.startOrders')[0].params).toMatchObject({ orders: 2 });
  });

  test('Positionsgrenze erreicht: die Orders werden gelöscht (wie live „4/4, Orders bereinigt“)', { tag: '@BKT-24' }, () => {
    const zone = { ...tpFar, max_positions: 1 };
    const result = run(flat(2650), {
      zone,
      initialPositions: [{ side: 'buy', volume: 0.1, price: 2650, magic: 200001 }],
      initialOrders: [buyLimit(2649)],
    });
    expect(codes(result, 'grid.maxPositionsCleared')[0].params).toMatchObject({ count: 1 });
  });

  test('Handelsseite zu: das Löschen wird mit 10018 abgelehnt, die Order bleibt und füllt bei Öffnung', { tag: '@BKT-24' }, () => {
    const zone = { ...tpFar, max_positions: 1 };
    const result = run(flat(2648), {
      zone,
      initialPositions: [{ side: 'buy', volume: 0.1, price: 2650, magic: 200001 }],
      initialOrders: [far(2649)],
      ...withSessions(closedBetween(36_000, 36_120)),
    });
    const entries = result.trades.map((t) => t.entryTime).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(entries).toHaveLength(2);
    expect(entries[1]).toBeGreaterThanOrEqual(T1 + 120);
  });

  test('Start-Orders zählen nicht als verschwunden', { tag: '@BKT-24' }, () => {
    const result = run(flat(2650), { zone: tpFar, initialOrders: [far(2649), far(2648)] });
    expect(codes(result, 'zone.ordersVanished')).toEqual([]);
  });

  test('Der Broker führt die Start-Order mit Kommentar im Orderbuch, ohne Historie', { tag: '@BKT-24' }, () => {
    const broker = new PathBroker({
      info: { ...snapshot().info, name: 'XAUUSD' }, costs: snapshot().costs, start: T1, firstBid: 2650, fill: 'gap', commissionPerLot: 0, slFirst: false,
      timeframes: [{ name: 'M15', sec: 900 }], zoneLabel: () => null,
    });
    broker.seedPosition({ side: 'buy', volume: 0.1, price: 2650, magic: 200001 });
    broker.seedOrder({ type: ORDER_TYPE_BUY_LIMIT, price: 2649, volume: 0.1, magic: 200001, comment: 'AutoGrid_Z200001_FU1760000000', time: T1 - 60 });
    const orders = broker.ordersGet();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ type: ORDER_TYPE_BUY_LIMIT, price_open: 2649, comment: 'AutoGrid_Z200001_FU1760000000', state: 1 });
    expect(orders[0].ticket).toBeGreaterThan(broker.positionsGet()[0].ticket); // erst Positionen, dann Orders
  });

  test('Ohne Orders (fehlend oder leer) ist der Lauf bytegleich zu bisher', { tag: '@BKT-24' }, () => {
    const rates = flat(2650, 4);
    const base = run(rates);
    const empty = run(rates, { initialOrders: [] });
    expect(JSON.stringify(empty.trades)).toBe(JSON.stringify(base.trades));
    expect(empty.log.lines).toEqual(base.log.lines);
    expect(codes(empty, 'run.startOrders')).toEqual([]);
  });

  test('Order ohne Fraktal-Kommentar in einer Fraktal-Zone: WARN', { tag: '@BKT-24' }, () => {
    const zone = { ...ZONE, entry_mode: 'fractal', take_profit: 50 };
    const result = run(flat(2650), { zone, initialOrders: [buyLimit(2649, { comment: '' })] });
    expect(codes(result, 'run.startOrderNoFractal')[0].params).toMatchObject({ orders: 1 });
  });
});
