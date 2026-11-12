/**
 * BKT-26 Backtest: Tetik-Reihenfolge im selben Tick (A1) und Bot-Verzögerung nach der Füllung (A2).
 * Live füllen drei Limits auf einem Tick und schließen mit dem Stufen-SL, bevor der Bot TP/SL ändert (Plan bt-a-tick-order).
 */
import { expect, test } from '@playwright/test';
import { BOT_REACT_DELAY_S, sltpDelaySeconds } from '../../src/lib/backtest/botDelay';
import { PathBroker } from '../../src/lib/backtest/broker/pathBroker';
import { snapshotSymbol } from '../../src/lib/backtest/broker/costs';
import {
  ORDER_FILLING_RETURN,
  ORDER_TIME_GTC,
  ORDER_TYPE_BUY_LIMIT,
  TRADE_ACTION_PENDING,
  TRADE_ACTION_SLTP,
  TRADE_RETCODE_DONE,
} from '../../src/lib/backtest/engine/types';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import { BOT_REACT_DEFAULT, FILL_SLTP_DELAY_DEFAULT, runBacktest, SAME_TICK_BATCH_DEFAULT, type RunInput, type RunModel } from '../../src/lib/backtest/runner';
import type { SymbolDetail } from '../../src/store/types';

const DETAIL: SymbolDetail = {
  name: 'XAUUSD', digits: 2, point: 0.01, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_mode: 4,
  currency_base: 'XAU', currency_profit: 'USD', currency_margin: 'XAU', trade_tick_value: 1, trade_tick_size: 0.01,
  trade_contract_size: 100, trade_calc_mode: 2, trade_tick_value_profit: 1, trade_tick_value_loss: 1, swap_mode: 4,
  swap_long: -6.5, swap_short: 2, swap_rollover3days: 3, spread: 20, trade_stops_level: 0,
};
const WED = 1_791_331_200;
const T1 = WED + 10 * 3600;
const MAGIC = 100001;

function snapshot() {
  const result = snapshotSymbol(DETAIL, { swapEnabled: false, approximate: false });
  if (!('snapshot' in result)) throw new Error(JSON.stringify(result.problems));
  return result.snapshot;
}

// ------------------------------------------------------------------ A2: Broker
function broker(fillSltpDelay: number) {
  const snap = snapshot();
  const b = new PathBroker({
    info: snap.info, costs: snap.costs, start: T1, firstBid: 2650, fill: 'gap', commissionPerLot: 0, slFirst: false,
    timeframes: [{ name: 'M1', sec: 60 }], zoneLabel: () => null, fillSltpDelay,
  });
  b.setTradeOpen(true);
  return b;
}
const sltp = (b: PathBroker, position: number, tp: number, sl: number) =>
  b.orderSend({ action: TRADE_ACTION_SLTP, position, symbol: 'XAUUSD', tp, sl });

/** BUY LIMIT 2649 (TP 2650, SL 2646) füllt bei Ask 2649; Replay-Minute */
function filled(delay: number) {
  const b = broker(delay);
  b.beginCandle(T1, 2650, 20);
  b.beginReplay();
  b.setQuote(2650.0, 2650.2, T1);
  const result = b.orderSend({
    action: TRADE_ACTION_PENDING, symbol: 'XAUUSD', volume: 0.1, type: ORDER_TYPE_BUY_LIMIT, price: 2649, magic: MAGIC,
    comment: 't', type_time: ORDER_TIME_GTC, type_filling: ORDER_FILLING_RETURN, tp: 2650, sl: 2646, deviation: 20,
  });
  expect(result.retcode).toBe(TRADE_RETCODE_DONE);
  b.setQuote(2648.8, 2649.0, T1 + 1);
  const triggers = b.quoteTriggers();
  expect(triggers.map((t) => t.kind)).toEqual(['fill']);
  b.fire(triggers[0], true);
  return b;
}

test.describe('Verzögerung nach der Füllung (A2)', () => {
  test('Im Fenster schließt das Stufen-SL, obwohl der Bot ein weiteres SL gesetzt hat', { tag: '@BKT-26' }, () => {
    const b = filled(0.76);
    const ticket = b.positionsGet()[0].ticket;
    expect(sltp(b, ticket, 2651, 2640).retcode).toBe(TRADE_RETCODE_DONE);
    // Der Bot sieht seinen Wunsch als gesetzt
    expect(b.positionsGet()[0].sl).toBe(2640);
    b.setQuote(2645.9, 2646.1, T1 + 1.55); // 0,55 s nach der Füllung, unter dem Stufen-SL 2646
    expect(b.quoteTriggers().map((t) => t.kind)).toEqual(['sl']);
    b.fire(b.quoteTriggers()[0], true);
    expect(b.trades).toHaveLength(1);
    expect(b.trades[0].exitReason).toBe(4); // DEAL_REASON_SL
  });

  test('Ohne Verzögerung bleibt die Position mit dem weiteren SL offen', { tag: '@BKT-26' }, () => {
    const b = filled(0);
    sltp(b, b.positionsGet()[0].ticket, 2651, 2640);
    b.setQuote(2645.9, 2646.1, T1 + 1.55);
    expect(b.quoteTriggers()).toEqual([]);
    expect(b.positionsGet()[0].sl).toBe(2640);
  });

  test('Nach dem Fenster gilt der gewünschte TP/SL, die Änderung kommt einmal an', { tag: '@BKT-26' }, () => {
    const b = filled(0.76);
    const ticket = b.positionsGet()[0].ticket;
    sltp(b, ticket, 2651, 2640);
    b.setQuote(2649.0, 2649.2, T1 + 1.7); // vor Ablauf (Füllung bei T1 + 1)
    expect(b.positionsGet()[0].sl).toBe(2640);
    b.setQuote(2648.0, 2648.2, T1 + 1.8); // Fenster zu Ende
    expect(b.quoteTriggers()).toEqual([]); // 2648 über dem neuen SL 2640, Stufen-SL 2646 nicht mehr maßgeblich
    expect(sltp(b, ticket, 2651, 2640).retcode).toBe(TRADE_RETCODE_DONE);
    expect(b.positionsGet()[0].tp).toBe(2651);
  });

  test('Ein im Fenster geschlossener Trade lässt keinen Rest zurück', { tag: '@BKT-26' }, () => {
    const b = filled(0.76);
    const ticket = b.positionsGet()[0].ticket;
    sltp(b, ticket, 2651, 2640);
    b.setQuote(2645.9, 2646.1, T1 + 1.4);
    b.fire(b.quoteTriggers()[0], true);
    b.setQuote(2650, 2650.2, T1 + 5);
    expect(b.positionsGet()).toEqual([]);
  });

  test('Gilt nur in der Replay-Minute: ohne Replay gilt der Wunsch sofort', { tag: '@BKT-26' }, () => {
    const b = broker(0.76);
    b.beginCandle(T1, 2650, 20);
    b.setMarket(2650.0, T1, 2650.2);
    b.orderSend({
      action: TRADE_ACTION_PENDING, symbol: 'XAUUSD', volume: 0.1, type: ORDER_TYPE_BUY_LIMIT, price: 2649, magic: MAGIC,
      comment: 't', type_time: ORDER_TIME_GTC, type_filling: ORDER_FILLING_RETURN, tp: 2650, sl: 2646, deviation: 20,
    });
    b.setMarket(2648.8, T1 + 1, 2649.0);
    b.fire(b.quoteTriggers()[0], true);
    const ticket = b.positionsGet()[0].ticket;
    sltp(b, ticket, 2651, 2640);
    b.setMarket(2645.9, T1 + 1.5, 2646.1);
    expect(b.quoteTriggers()).toEqual([]);
  });

  test('Verzögerung je Symbol: Tabelle, Suffix, Ersatzwert', { tag: '@BKT-26' }, () => {
    expect(sltpDelaySeconds('XAUUSD')).toBe(0.76);
    expect(sltpDelaySeconds('usdjpy.r')).toBe(0.41);
    expect(sltpDelaySeconds('EURCHF')).toBe(0.22);
    expect(sltpDelaySeconds('USOUSD')).toBe(0.62);
    expect(sltpDelaySeconds('GBPAUD')).toBe(0.7);
  });
});

// ------------------------------------------------------------------ A1: Runner
const ZONE = {
  id: 'z1', symbol: 'XAUUSD', order_type: 'BUY', min_price: 2600, max_price: 2700, grid_step: 1, lot_size: 0.1,
  take_profit: 1, stop_loss: 0, sell_grid_step: 1, sell_lot_size: 0.1, sell_take_profit: 1, sell_stop_loss: 0,
  is_breakout: false, is_active: true, levels_below: 3, levels_above: 0, sync_buy_sell: false,
  exit_timeframe: 'M15', entry_mode: 'grid',
};
const TICK0 = { mode: 'tick', points: 0 } as const;
const MODEL: RunModel = { fill: 'gap', slFirst: false, path: 'auto', closeAtEnd: true };

function candles(rows: number[][]): LoadedRates {
  const col = (i: number) => Float64Array.from(rows.map((r) => r[i]));
  const sa = Float64Array.from(rows.map((r) => r[5]));
  return { t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: sa, sa, sx: sa, missing: [], digits: 2, point: 0.01, liveFrom: null };
}
type Tick = [number, number, number];
const withReplay = (rates: LoadedRates, minutes: Record<number, Tick[]>): LoadedRates => ({
  ...rates,
  replay: new Map(Object.entries(minutes).map(([t, ticks]) => [Number(t), { ms: ticks.map((x) => x[0]), bid: ticks.map((x) => x[1]), ask: ticks.map((x) => x[2]) }])),
});
function run(rates: LoadedRates, model: Partial<RunModel> = {}, extra: Partial<RunInput> = {}) {
  return runBacktest({
    zone: ZONE, snapshot: snapshot(), rates, dataTimeframe: 'M1', from: rates.t[0], to: rates.t[rates.t.length - 1] + 60,
    spread: TICK0, commissionPerLot: 0, model: { ...MODEL, ...model }, startCapital: 10_000, ...extra,
  });
}

/** Minute T1 ohne Fenster, Minute T1+60: ein Tick, der durch drei Limit-Stufen fällt */
const GAP: Tick[] = [[0, 2650.4, 2650.6], [20000, 2646.4, 2646.6], [30000, 2646.4, 2646.6]];
const ROWS = [[T1, 2650.5, 2650.6, 2650.4, 2650.5, 20], [T1 + 60, 2650.5, 2650.6, 2646.4, 2646.5, 20]];

test.describe('Tetik-Reihenfolge im selben Tick (A1)', () => {
  test('Alle Limits des Ticks füllen, bevor der Bot läuft; ohne Schalter bleibt es beim Einzelweg', { tag: '@BKT-26' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: GAP });
    const batch = run(rates, { sameTickBatch: true });
    const single = run(rates, { sameTickBatch: false });
    expect(batch.trades.length).toBeGreaterThanOrEqual(single.trades.length);
    expect(batch.trades.length).toBeGreaterThan(0);
  });

  test('Der Schalter ändert nichts ohne Replay-Karte (Weg-Modus bleibt)', { tag: '@BKT-26' }, () => {
    const plain = candles(ROWS);
    expect(JSON.stringify(run(plain, { sameTickBatch: true }).trades)).toBe(JSON.stringify(run(plain, { sameTickBatch: false }).trades));
  });

  test('Mit beiden Schaltern aus ist das Ergebnis bytegleich zum alten Lauf', { tag: '@BKT-26' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: GAP });
    const off = run(rates, { sameTickBatch: false, fillSltpDelay: false });
    const alsoOff = run(rates, { sameTickBatch: false, fillSltpDelay: false });
    expect(JSON.stringify(off.trades)).toBe(JSON.stringify(alsoOff.trades));
    expect(JSON.stringify(run(rates).trades)).toBe(JSON.stringify(run(rates).trades)); // deterministisch
  });
});

test.describe('Bot-Reaktionsverzögerung (B) und Vorgaben', () => {
  test('Alle Schalter sind aus; P8 entscheidet über das Einschalten', { tag: '@BKT-26' }, () => {
    expect(SAME_TICK_BATCH_DEFAULT).toBe(false);
    expect(FILL_SLTP_DELAY_DEFAULT).toBe(false);
    expect(BOT_REACT_DEFAULT).toBe(false);
    expect(BOT_REACT_DELAY_S).toBe(2);
  });

  test('Ohne Schalter ist das Ergebnis gleich dem mit allen Schaltern ausdrücklich aus', { tag: '@BKT-26' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: GAP });
    const plain = run(rates);
    const off = run(rates, { sameTickBatch: false, fillSltpDelay: false, botReact: false });
    expect(JSON.stringify(plain.trades)).toBe(JSON.stringify(off.trades));
  });

  test('Mit Reaktionsverzögerung läuft der Lauf, ist deterministisch und die Broker-Verzögerung (A2) wirkt nicht dazu', { tag: '@BKT-26' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: GAP });
    const b = run(rates, { botReact: true });
    expect(b.trades.length).toBeGreaterThan(0);
    expect(JSON.stringify(run(rates, { botReact: true }).trades)).toBe(JSON.stringify(b.trades));
    expect(JSON.stringify(run(rates, { botReact: true, fillSltpDelay: true }).trades)).toBe(JSON.stringify(b.trades));
  });

  test('Der Schalter B ändert nichts ohne Replay-Karte (Weg-Modus bleibt)', { tag: '@BKT-26' }, () => {
    const plain = candles(ROWS);
    expect(JSON.stringify(run(plain, { botReact: true }).trades)).toBe(JSON.stringify(run(plain).trades));
  });

  test('Verzögerung 0 schaltet B ab, auch mit Schalter an', { tag: '@BKT-26' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: GAP });
    expect(JSON.stringify(run(rates, { botReact: true, botReactDelay: 0 }).trades)).toBe(JSON.stringify(run(rates).trades));
  });
});
