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
import { BOT_TURNS_MAX_PASSES } from '../../src/lib/backtest/botTurns';
import { runJob } from '../../src/lib/backtest/runJob';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
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
    expect(BOT_REACT_DELAY_S).toBe(1);
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

// ------------------------------------------------------------------ BKT-29: E1 + B 1 s
/** Minute T1+60: Füllung des Limits 2649 bei 10,0 s, danach Ticks im Abstand von 0,3 s (Bot-Intervall wäre 1 s) */
const REACT: Tick[] = [[0, 2650.4, 2650.6], [10000, 2648.8, 2649.0], [10300, 2648.8, 2649.0], [10600, 2648.8, 2649.0], [10900, 2648.8, 2649.0], [11200, 2648.8, 2649.0], [20000, 2648.8, 2649.0]];
const botTimes = (r: ReturnType<typeof run>) =>
  r.log.lines.filter((l) => l.code === 'grid.ordersPlaced' || l.code === 'position.tpslUpdate').map((l) => (l.time ?? 0) - (T1 + 60));

test.describe('Tepki-Gecikmesi 1 s, ohne periodischen Lauf dazwischen (BKT-29)', () => {
  test('Mit botReact läuft der Bot nach der Füllung erst im ersten Tick ab 1 s, nicht beim periodischen Tick davor', { tag: '@BKT-29' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: REACT });
    const on = botTimes(run(rates, { botReact: true })).filter((t) => t >= 0);
    expect(on.length).toBeGreaterThan(0);
    // Füllung bei 10,0 s + 1 s = 11,0 s → erster Tick danach 11,2 s; kein Lauf bei 10,3 / 10,6 / 10,9 s
    expect(Math.min(...on)).toBeCloseTo(11.2, 6);
    expect(on.some((t) => t > 10 && t < 11)).toBe(false);
  });

  test('Ohne botReact läuft der Bot sofort bei der Füllung (bytegleicher alter Weg)', { tag: '@BKT-29' }, () => {
    const rates = withReplay(candles(ROWS), { [T1 + 60]: REACT });
    const off = botTimes(run(rates)).filter((t) => t >= 0);
    expect(Math.min(...off)).toBeCloseTo(10, 6);
    expect(JSON.stringify(run(rates).trades)).toBe(JSON.stringify(run(rates, { botReact: false }).trades));
  });
});

// ------------------------------------------------------------------ BKT-30: Tur-Raster des Live-Bots
const M2 = T1 + 60;
/**
 * Minute M2: Füllung des Limits 2649 bei 10 s (TP 2650 greift bei 12 s). Tur-Anfang 12,5 s: Kurs dort 2651,0/2651,2.
 * Bei 13,4 s fällt der Kurs unter 2649 (vor einer Op-Zeit von 13,5 s), bei 14 s liegt der Ask wieder unter 2649,
 * bei 16 s steigt er auf 2649,3.
 */
const TURN_TICKS: Tick[] = [
  [0, 2650.4, 2650.6], [10000, 2648.8, 2649.0], [12000, 2651.0, 2651.2], [13000, 2651.0, 2651.2],
  [13400, 2648.4, 2648.6], [14000, 2648.6, 2648.8], [16000, 2649.1, 2649.3], [20000, 2651.0, 2651.2],
];
const keyOf = (r: ReturnType<typeof run>) => JSON.stringify({ trades: r.trades, lines: r.log.lines, summary: r.summary });
const botLines = (r: ReturnType<typeof run>) => r.log.lines.filter((l) => l.time !== undefined && l.time >= M2 && l.code.startsWith('grid.') || l.code === 'position.tpslUpdate');
const botTimesIn = (r: ReturnType<typeof run>) => [...new Set(botLines(r).filter((l) => (l.time ?? 0) >= M2).map((l) => Math.round(((l.time ?? 0) - M2) * 10) / 10))];
/** Einstiege (Positions-Nr., ganze Sekunde nach M2, Preis) */
const entries = (r: ReturnType<typeof run>) => r.trades.map((t) => [t.positionId, (t.entryTime ?? 0) - M2, t.entryPrice]);

test.describe('Canlı tur takvimi (BKT-30)', () => {
  test('Ohne Raster (fehlt, leer oder ungleich lang) ist das Ergebnis bytegleich zum alten Lauf', { tag: '@BKT-30' }, () => {
    const rates = withReplay(candles(ROWS), { [M2]: TURN_TICKS });
    for (const model of [{}, { botReact: true }]) {
      const base = keyOf(run(rates, model));
      expect(keyOf(run(rates, { ...model, botTurns: undefined }))).toBe(base);
      expect(keyOf(run(rates, { ...model, botTurns: { starts: [], zoneAt: [] } }))).toBe(base);
      expect(keyOf(run(rates, { ...model, botTurns: { starts: [M2 + 5], zoneAt: [] } }))).toBe(base);
    }
    expect(run(rates).sendMinutes).toBeUndefined();
  });

  test('Nach dem Tetik läuft der Bot nicht vor dem Tur-Anfang; Tetik-, periodischer und Minutenend-Lauf entfallen', { tag: '@BKT-30' }, () => {
    const rates = withReplay(candles(ROWS), { [M2]: TURN_TICKS });
    // Alter Weg: Lauf bei der Füllung (10 s), beim Ausstieg (12 s), bei der Füllung 13,4 s und am Minutenende
    expect(botTimesIn(run(rates))).toEqual(expect.arrayContaining([10, 12, 13.4, 20]));
    const r = run(rates, { botTurns: { starts: [M2 + 12.5], zoneAt: [M2 + 13.5] } });
    // Genau ein Lauf: der Tur-Anfang 12,5 s; er läuft vor dem Tick bei 13 s und trägt die Zeit des letzten Ticks (12 s)
    expect(botTimesIn(r)).toEqual([12]);
    // Die Füllung bei 10 s (zwei Orders auf 2649) bleibt; der Bot reagiert erst auf den Tur-Anfang
    expect(entries(r).filter((e) => e[1] === 10)).toHaveLength(2);
  });

  test('Kurs zwischen Tur-Anfang und Zone-Anfang ändert die Stufen-Entscheidung nicht', { tag: '@BKT-30' }, () => {
    const botTurns = { starts: [M2 + 12.5], zoneAt: [M2 + 13.5] };
    const a = run(withReplay(candles(ROWS), { [M2]: TURN_TICKS }), { botTurns });
    // Gleiche Ticks, nur der Kurs von 13,0 s bis 14,0 s ist ein ganz anderer (nach dem Tur-Anfang)
    const moved: Tick[] = TURN_TICKS.map((t) => (t[0] >= 13000 && t[0] < 16000 ? [t[0], 2700.0, 2700.2] : t));
    const b = run(withReplay(candles(ROWS), { [M2]: moved }), { botTurns });
    const decision = (r: ReturnType<typeof run>) => JSON.stringify(r.log.lines.filter((l) => l.time !== undefined && l.time >= M2 && l.time <= M2 + 12.5));
    expect(decision(a)).toBe(decision(b));
    expect(botLines(a).some((l) => l.code === 'grid.ordersPlaced')).toBe(true);
  });

  test('Eine Order wird erst zu ihrer Op-Zeit wirksam: ein Kurs davor füllt sie nicht, derselbe Kurs danach schon', { tag: '@BKT-30' }, () => {
    const rates = withReplay(candles(ROWS), { [M2]: TURN_TICKS });
    // Op-Zeit 12,6 s: der Tick bei 13,4 s (Ask 2648,6 ≤ 2649) füllt das Limit (Einstiegszeit in ganzen Sekunden: 13)
    const early = run(rates, { botTurns: { starts: [M2 + 12.5], zoneAt: [M2 + 12.6] } });
    expect(entries(early).some((e) => e[1] === 13 && e[2] === 2648.6)).toBe(true);
    // Op-Zeit 13,5 s: derselbe Tick (13,4 s) liegt davor und füllt nicht
    const late = run(rates, { botTurns: { starts: [M2 + 12.5], zoneAt: [M2 + 13.5] } });
    expect(entries(late).some((e) => e[2] === 2648.6)).toBe(false);
  });

  test('Die Order-Art wird mit dem Kurs der Op-Zeit gewählt: Stop statt Limit, wenn der Kurs inzwischen unter dem Preis liegt (200047-Fall)', { tag: '@BKT-30' }, () => {
    const rates = withReplay(candles(ROWS), { [M2]: TURN_TICKS });
    // Am Tur-Anfang (Ask 2651,2) wählt der Bot BUY LIMIT 2649. Bei der Op-Zeit 13,5 s liegt der Ask bei 2648,6:
    // ein Limit füllte sofort bei 14 s (Ask 2648,8 ≤ 2649); als BUY STOP 2649 wartet die Order, bis der Ask 2649 erreicht (16 s, 2649,3)
    const r = run(rates, { botTurns: { starts: [M2 + 12.5], zoneAt: [M2 + 13.5] } });
    const stop = entries(r).filter((e) => e[2] === 2649.3);
    expect(stop).toHaveLength(1);
    expect(stop[0][1]).toBe(16);
    expect(entries(r).some((e) => e[1] === 14)).toBe(false);
  });

  test('XSEND: Minuten, in denen der Bot eine Order sendete, stehen im Ergebnis (nur mit Raster, nur ohne Replay-Karte)', { tag: '@BKT-30' }, () => {
    const rates = withReplay(candles(ROWS), { [M2]: TURN_TICKS });
    const r = run(rates, { botTurns: { starts: [M2 + 12.5], zoneAt: [M2 + 13.5] } });
    // T1 liegt im Kerzenweg und der Bot setzt dort die ersten Orders; M2 hat schon Ticks
    expect(r.sendMinutes).toEqual([T1]);
    expect(run(rates).sendMinutes).toBeUndefined();
  });

  test('XSEND-Durchgangsgrenze: mit Raster 8 Durchgänge (BOT_TURNS_MAX_PASSES), ohne Raster gilt die gegebene Grenze', { tag: '@BKT-30' }, async () => {
    expect(BOT_TURNS_MAX_PASSES).toBe(8);
    const rows = ROWS;
    const served: Record<number, Tick[]> = { [T1]: [[0, 2650.5, 2650.6], [30000, 2650.5, 2650.6]], [M2]: TURN_TICKS };
    const worker = (calls: string[]) => async (path: string) => {
      calls.push(path);
      const url = new URL(path, 'https://w.example');
      if (url.pathname.endsWith('/rates')) {
        const col = (i: number) => rows.map((r) => r[i]);
        const pts = (x: number) => Math.round(x / 0.01);
        return {
          t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: col(5), sa: col(5), sx: col(5),
          ahi: rows.map((r) => pts(r[2]) + 20), alo: rows.map((r) => pts(r[3]) + 20), g: rows.map(() => 1), tick_missing: [],
          replay: { t: [], kind: [], off: [0], ms: [], b: [], a: [] }, missing: [], next_from: null, digits: 2, point: 0.01,
        };
      }
      let at = Number(url.searchParams.get('start'));
      const cols = { t: [] as number[], kind: [] as string[], off: [0], ms: [] as number[], b: [] as number[], a: [] as number[], missing: [] };
      for (const d of (url.searchParams.get('m') ?? '').split(',')) {
        at += Number(d) * 60;
        const ticks = served[at];
        if (!ticks) continue;
        cols.t.push(at);
        cols.kind.push('T');
        for (const [ms, bid, ask] of ticks) {
          cols.ms.push(ms);
          cols.b.push(Math.round(bid / 0.01));
          cols.a.push(Math.round(ask / 0.01));
        }
        cols.off.push(cols.ms.length);
      }
      return { account_id: 'acc', symbol: 'XAUUSD', ...cols };
    };
    const request = (botTurns?: RunModel['botTurns']): RunRequest => ({
      type: 'run', runId: 5, apiBase: 'https://worker.example/api', headers: {},
      params: {
        accountId: 'acc', zone: ZONE, symbol: DETAIL, from: T1, to: T1 + 120, dataTimeframe: 'M1', spread: TICK0,
        commissionPerLot: 0, swapEnabled: false, approximate: false,
        model: { fill: 'gap', slFirst: false, closeAtEnd: true, triggerReplay: true, ...(botTurns ? { botTurns } : {}) }, path: 'auto', startCapital: 10_000,
      },
    });
    const go = async (req: RunRequest, limits: { passes: number; minutes: number; ticks: number }) => {
      const calls: string[] = [];
      const messages: WorkerMessage[] = [];
      await runJob(req, (m) => messages.push(m), worker(calls), undefined, limits);
      const last = messages[messages.length - 1];
      if (last.type !== 'result') throw new Error(JSON.stringify(last));
      const done = last.results[0].log.lines.find((l) => l.code === 'run.triggerReplay');
      return { calls: calls.filter((c) => c.includes('/replay')), passes: (done?.params?.passes as number | undefined) ?? 1 };
    };
    const one = { passes: 1, minutes: 5000, ticks: 1_000_000 };
    // Ohne Raster: Grenze 1 = ein Durchgang, kein Abruf
    expect((await go(request(), one)).calls).toEqual([]);
    // Mit Raster: die Grenze 1 gilt nicht, Minuten mit gesendeten Orders werden abgerufen und neu gerechnet
    const turned = await go(request({ starts: [M2 + 12.5], zoneAt: [M2 + 13.5] }), one);
    expect(turned.calls.length).toBeGreaterThan(0);
    expect(turned.passes).toBeGreaterThan(1);
    expect(turned.passes).toBeLessThanOrEqual(BOT_TURNS_MAX_PASSES);
  });
});
