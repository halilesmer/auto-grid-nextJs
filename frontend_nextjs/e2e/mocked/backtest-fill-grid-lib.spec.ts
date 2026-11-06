/**
 * BKT-22: Füllpreis wie live. Ask-Extreme der Minute (D2) und Kursraster (D1) im PathBroker und im Lauf.
 * Öl-ähnlich: 3 Stellen, Tick 0,001, Raster 10 Punkte; Ask-Phase 9, Bid-Phase 7 (wie USOUSD am 05.11.).
 * Alle Werte sind von Hand gerechnet (Rechnung im Kommentar).
 * BKT-22 Backtest: Kursraster und Ask-Extreme je Minute (Füllpreis wie live)
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol } from '../../src/lib/backtest/broker/costs';
import { PathBroker, type MinuteQuotes } from '../../src/lib/backtest/broker/pathBroker';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import { ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_BUY_STOP, ORDER_TYPE_SELL_STOP, TRADE_ACTION_PENDING } from '../../src/lib/backtest/engine/types';
import { runBacktest, type RunInput, type RunModel } from '../../src/lib/backtest/runner';
import type { SymbolDetail } from '../../src/store/types';

const DETAIL: SymbolDetail = {
  name: 'USOUSD', digits: 3, point: 0.001, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_mode: 4,
  currency_base: 'USO', currency_profit: 'USD', currency_margin: 'USD', trade_tick_value: 1, trade_tick_size: 0.001,
  trade_contract_size: 100, trade_calc_mode: 2, trade_tick_value_profit: 1, trade_tick_value_loss: 1, swap_mode: 0,
  swap_long: 0, swap_short: 0, swap_rollover3days: 3, spread: 42, trade_stops_level: 0,
};
const snap = () => {
  const r = snapshotSymbol(DETAIL, { swapEnabled: false, approximate: false });
  if (!('snapshot' in r)) throw new Error(JSON.stringify(r.problems));
  return r.snapshot;
};
const T1 = 1_791_331_200 + 10 * 3600;
const GRID = { grid: 10, askPhase: 9, bidPhase: 7 };

/**
 * Eine Minute: Bid läuft von `from` nach `to`; ein Pending-Auftrag liegt im Buch. Gibt Einstiegspreise der Füllungen zurück.
 * `quotes`: Minutenwerte (Preise); ohne sie rechnet der Broker mit dem Minutenmittel `sa`.
 */
function walk(opts: {
  type: number; price: number; from: number; to: number; sa: number; tp?: number; sl?: number;
  quotes?: MinuteQuotes;
}) {
  const s = snap();
  const broker = new PathBroker({ info: s.info, costs: s.costs, start: T1, firstBid: opts.from, fill: 'gap', commissionPerLot: 0, slFirst: false, timeframes: [], zoneLabel: () => null });
  broker.beginCandle(T1, opts.from, opts.sa, opts.sa, opts.quotes);
  broker.setMarket(opts.from, T1);
  const sent = broker.orderSend({ action: TRADE_ACTION_PENDING, symbol: 'USOUSD', volume: 0.1, type: opts.type, price: opts.price, magic: 200001, comment: 'x', tp: opts.tp ?? 0, sl: opts.sl ?? 0 });
  if (sent?.retcode !== 10009) throw new Error('order not placed ' + JSON.stringify(sent));
  let cur = opts.from;
  for (let guard = 0; guard < 10; guard++) {
    const trigger = broker.nextTrigger(cur, opts.to);
    if (!trigger) break;
    broker.setMarket(trigger.bid, T1 + 30);
    broker.fire(trigger, trigger.immediate);
    cur = trigger.bid;
  }
  broker.setMarket(opts.to, T1 + 59);
  return broker;
}
const entries = (b: PathBroker) => [...b.trades.map((t) => t.entryPrice), ...b.positionsGet().map((p) => p.price_open)];

test.describe('D2: Ask-Extreme der Minute', () => {
  test('Minutenhoch: Kauf-Stop 90,400 füllt nicht, wenn der echte Ask höchstens 90,399 war (Fall 13)', { tag: '@BKT-22' }, () => {
    // Bid-Hoch 90,367, sa 35,1: Modell-Ask 90,4021 ≥ 90,4 → bisher Fülle. Echter Ask-Höchstwert 90,399 → nie.
    const base = { type: ORDER_TYPE_BUY_STOP, price: 90.4, from: 90.3, to: 90.367, sa: 35.1 };
    expect(entries(walk(base))).toEqual([90.4]);
    const q = { askHigh: 90.399, askLow: 90.3, high: 90.367, low: 90.3, extremes: true, grid: 1, askPhase: 0, bidPhase: 0 };
    expect(entries(walk({ ...base, quotes: q }))).toEqual([]);
  });

  test('Minutenhoch: der echte Ask erreicht den Preis, obwohl Bid-Hoch + Mittel ihn nicht erreicht', { tag: '@BKT-22' }, () => {
    // 90,367 + 0,020 = 90,387 < 90,400; echter Ask-Höchstwert 90,409 (Spread am Hoch 42)
    const base = { type: ORDER_TYPE_BUY_STOP, price: 90.4, from: 90.3, to: 90.367, sa: 20 };
    expect(entries(walk(base))).toEqual([]);
    const q = { askHigh: 90.409, askLow: 90.3, high: 90.367, low: 90.3, extremes: true, grid: 1, askPhase: 0, bidPhase: 0 };
    expect(entries(walk({ ...base, quotes: q }))).toEqual([90.4]);
  });

  test('Minutentief: Kauf-Limit füllt nicht, wenn der echte Ask nie so tief war', { tag: '@BKT-22' }, () => {
    // Bid-Tief 90,310, sa 20: Modell-Ask-Tief 90,330 ≤ 90,340 → bisher Fülle; echtes Ask-Tief 90,345 (Spread am Tief 35)
    const base = { type: ORDER_TYPE_BUY_LIMIT, price: 90.34, from: 90.4, to: 90.31, sa: 20 };
    expect(entries(walk(base))).toEqual([90.34]);
    const q = { askHigh: 90.45, askLow: 90.345, high: 90.4, low: 90.31, extremes: true, grid: 1, askPhase: 0, bidPhase: 0 };
    expect(entries(walk({ ...base, quotes: q }))).toEqual([]);
  });

  test('Kurslücke: Marktpreis (Ask) liegt innerhalb der echten Ask-Grenzen der Minute', { tag: '@BKT-22' }, () => {
    const s = snap();
    const b = new PathBroker({ info: s.info, costs: s.costs, start: T1, firstBid: 90.367, fill: 'gap', commissionPerLot: 0, slFirst: false, timeframes: [], zoneLabel: () => null });
    b.beginCandle(T1, 90.367, 35.1, 35.1, { askHigh: 90.399, askLow: 90.309, high: 90.367, low: 90.3, extremes: true, grid: 1, askPhase: 0, bidPhase: 0 });
    b.setMarket(90.367, T1);
    expect(b.symbolInfoTick('USOUSD')?.ask).toBe(90.399); // 90,3621 + … = 90,4021 → auf das Hoch gekappt (Fall 13: Bot setzt BUY STOP)
  });
});

test.describe('D1: Kursraster', () => {
  const q = (extra: Record<string, number> = {}) => ({ askHigh: 91.149, askLow: 90.939, high: 91.107, low: 90.897, extremes: true, ...GRID, ...extra });

  test('Kauf-Stop 91,000 füllt am ersten Raster-Ask darüber (91,009), nicht am Orderpreis', { tag: '@BKT-22' }, () => {
    // ceilAsk(91000, Phase 9) = 91009; Marke = 91,009 − (91,149 − 91,107 = 0,042) = 90,967 ≤ Bid-Hoch 91,107
    const base = { type: ORDER_TYPE_BUY_STOP, price: 91, from: 90.897, to: 91.107, sa: 42 };
    expect(entries(walk(base))).toEqual([91]);
    expect(entries(walk({ ...base, quotes: q() }))).toEqual([91.009]);
  });

  test('Kauf-Limit 90,400 füllt am Raster-Ask darunter (90,399)', { tag: '@BKT-22' }, () => {
    // floorAsk(90400, Phase 9) = 90399; Ask-Tief 90,379 → Spread am Tief 0,042 bei Bid-Tief 90,337
    const quotes = { askHigh: 90.5, askLow: 90.379, high: 90.457, low: 90.337, extremes: true, ...GRID };
    const base = { type: ORDER_TYPE_BUY_LIMIT, price: 90.4, from: 90.457, to: 90.337, sa: 42 };
    expect(entries(walk({ ...base, quotes }))).toEqual([90.399]);
  });

  test('Verkaufs-Stop 91,000 füllt am Raster-Bid darunter (90,997)', { tag: '@BKT-22' }, () => {
    // floorBid(91000, Phase 7) = 90997
    const base = { type: ORDER_TYPE_SELL_STOP, price: 91, from: 91.107, to: 90.897, sa: 42 };
    expect(entries(walk({ ...base, quotes: q() }))).toEqual([90.997]);
  });

  test('TP einer Kauf-Position: Ausstieg am ersten Raster-Bid über dem TP (91,157 statt 91,150)', { tag: '@BKT-22' }, () => {
    // Einstieg 91,009; TP 91,150 → ceilBid(91150, Phase 7) = 91157; Bid-Hoch 91,207
    const quotes = { askHigh: 91.249, askLow: 90.939, high: 91.207, low: 90.897, extremes: true, ...GRID };
    const b = walk({ type: ORDER_TYPE_BUY_STOP, price: 91, from: 90.897, to: 91.207, sa: 42, tp: 91.15, quotes });
    expect(b.trades.map((t) => [t.entryPrice, t.exitPrice, t.exitReason])).toEqual([[91.009, 91.157, 5]]);
  });

  test('Minute ohne Raster (g = 1) und ohne Ask-Phase: Verhalten wie ohne Grid', { tag: '@BKT-22' }, () => {
    const base = { type: ORDER_TYPE_BUY_STOP, price: 91, from: 90.897, to: 91.107, sa: 42 };
    const flat = { askHigh: 91.149, askLow: 90.939, high: 91.107, low: 90.897, extremes: true, grid: 1, askPhase: 0, bidPhase: 0 };
    expect(entries(walk({ ...base, quotes: flat }))).toEqual([91]);
  });

  test('Marktpreis auf dem Raster: Bid 90,367 + sa 35,1 ergibt den Raster-Ask 90,399', { tag: '@BKT-22' }, () => {
    const s = snap();
    const b = new PathBroker({ info: s.info, costs: s.costs, start: T1, firstBid: 90.367, fill: 'gap', commissionPerLot: 0, slFirst: false, timeframes: [], zoneLabel: () => null });
    b.beginCandle(T1, 90.367, 35.1, 35.1, { askHigh: 90.409, askLow: 90.309, high: 90.367, low: 90.3, extremes: false, ...GRID });
    b.setMarket(90.367, T1);
    expect(b.symbolInfoTick('USOUSD')?.ask).toBe(90.399); // nächster Wert ≡ 9 (mod 10 Punkte) zu 90,4021
  });
});

test.describe('Lauf mit Ask-Extremen und Raster', () => {
  const ZONE = {
    id: 'z1', symbol: 'USOUSD', order_type: 'BUY', min_price: 90, max_price: 92, grid_step: 1, lot_size: 0.1, take_profit: 0.15, stop_loss: 0,
    sell_grid_step: 1, sell_lot_size: 0.1, sell_take_profit: 1, sell_stop_loss: 0, is_breakout: false, pullback_distance: 0.02, sell_pullback_distance: 0.02,
    sync_buy_sell: true, levels_below: 2, levels_above: 2, max_positions: 10, clear_on_exit: false, clear_exit_side: 'Farketmez',
    clear_scope: 'Sadece Bekleyen Emirler', clear_target_side: 'Farketmez (Hepsi)', exit_condition: 'Anlık Fiyat', exit_timeframe: 'M15',
  };
  const MODEL: RunModel = { fill: 'gap', slFirst: false, path: 'auto', closeAtEnd: true };
  // Der Bot setzt Kauf-Limit 90 und Kauf-Stop 92; die Kerze steigt von 90,897 auf 92,107 (Bid-Raster …7, Ask-Raster …9)
  const rows = [[T1, 90.897, 92.107, 90.897, 92.107, 42], [T1 + 60, 92.107, 92.107, 92.007, 92.007, 42]];
  const rates = (extra: Partial<LoadedRates> = {}): LoadedRates => ({
    t: Float64Array.from(rows.map((r) => r[0])), o: Float64Array.from(rows.map((r) => r[1])), h: Float64Array.from(rows.map((r) => r[2])),
    l: Float64Array.from(rows.map((r) => r[3])), c: Float64Array.from(rows.map((r) => r[4])), s: Float64Array.from(rows.map((r) => r[5])),
    sa: Float64Array.from([42, 42]), sx: Float64Array.from([42, 42]), ahi: Float64Array.from([92.149, 92.149]), alo: Float64Array.from([90.939, 92.049]),
    g: Float64Array.from([10, 10]), missing: [], digits: 3, point: 0.001, liveFrom: null, ...extra,
  });
  const run = (r: LoadedRates, model: Partial<RunModel> = {}, extra: Partial<RunInput> = {}) =>
    runBacktest({
      zone: ZONE, snapshot: snap(), rates: r, dataTimeframe: 'M1', from: r.t[0], to: r.t[r.t.length - 1] + 60, spread: { mode: 'tick', points: 0 },
      commissionPerLot: 0, model: { ...MODEL, ...model }, startCapital: 10_000, ...extra,
    });

  test('Einstiege liegen auf dem Raster-Ask (…9), mit beiden Schaltern aus auf dem Orderpreis; Protokoll zählt Minuten', { tag: '@BKT-22' }, () => {
    const on = run(rates());
    expect(on.trades.length).toBeGreaterThan(0);
    for (const t of on.trades) expect(Math.round((t.entryPrice ?? 0) * 1000) % 10).toBe(9);
    expect(on.log.lines.find((l) => l.code === 'run.quoteGrid')).toMatchObject({ params: { minutes: 2 } });
    const off = run(rates(), { quoteGrid: false, askExtremes: false });
    for (const t of off.trades) expect(Math.round((t.entryPrice ?? 0) * 1000) % 10).toBe(0);
    expect(off.log.lines.find((l) => l.code === 'run.quoteGrid')).toBeUndefined();
  });

  test('ohne ahi/alo/g oder ohne Spread „tick“ rechnet alles wie zuvor; fehlende Werte werden gezählt', { tag: '@BKT-22' }, () => {
    const bare = rates({ ahi: undefined, alo: undefined, g: undefined });
    const a = run(bare);
    const b = run(rates(), { quoteGrid: false, askExtremes: false });
    expect(JSON.stringify(a.trades)).toBe(JSON.stringify(b.trades));
    expect(a.log.lines.find((l) => l.code === 'run.askExtremesMissing')).toMatchObject({ params: { candles: 2 } });
    const max = run(rates(), {}, { spread: { mode: 'max', points: 42 } });
    const maxOff = run(rates(), { quoteGrid: false, askExtremes: false }, { spread: { mode: 'max', points: 42 } });
    expect(JSON.stringify(max.trades)).toBe(JSON.stringify(maxOff.trades));
    expect(max.log.lines.find((l) => l.code === 'run.quoteGrid')).toBeUndefined();
  });
});
