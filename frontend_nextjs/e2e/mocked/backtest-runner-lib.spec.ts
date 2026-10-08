/**
 * Backtest-Rechner (B4), ohne Browserseite: Auslösungen im Kerzenpfad, Kurslücke, Kosten, Swap mit Dreifach-Tag,
 * Testende, Zeitrahmen des Bots, Abbruchgründe. Die Zahlen sind von Hand gerechnet (Rechnung im Kommentar).
 * BKT-04 Backtest-Rechner mit Kosten
 */
import { expect, test } from '@playwright/test';
import { snapshotSymbol, type SymbolSnapshot } from '../../src/lib/backtest/broker/costs';
import { PathBroker } from '../../src/lib/backtest/broker/pathBroker';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import {
  ORDER_TYPE_BUY_STOP,
  TRADE_ACTION_DEAL,
  TRADE_ACTION_PENDING,
  ORDER_TYPE_SELL,
} from '../../src/lib/backtest/engine/types';
import type { RunRequest, WorkerMessage } from '../../src/lib/backtest/protocol';
import { RunError } from '../../src/lib/backtest/runContext';
import { FETCH_TIMEOUT_MS, httpFetchJson, runJob } from '../../src/lib/backtest/runJob';
import { downsampleCurve, EquityTrack } from '../../src/lib/backtest/runSummary';
import { runBacktest, strategyTimeframes, warmupSeconds, type RunInput, type RunModel } from '../../src/lib/backtest/runner';
import type { SymbolDetail } from '../../src/store/types';

/**
 * Gold-ähnlich: Tick 0,01, Tickwert 1,00 (Gewinn und Verlust), 1 Lot = 100 Einheiten.
 * Also bringt 1,00 Preisbewegung bei 0,10 Lot 100 Ticks × 1,00 × 0,10 = 10,00.
 */
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

function snapshot(detail: Partial<SymbolDetail> = {}, swapEnabled = false): SymbolSnapshot {
  const result = snapshotSymbol({ ...DETAIL, ...detail }, { swapEnabled, approximate: false });
  if (!('snapshot' in result)) throw new Error(JSON.stringify(result.problems));
  return result.snapshot;
}

/** Zeilen: [Zeit, Eröffnung, Hoch, Tief, Schluss, Spread in Punkten] */
function candles(rows: number[][]): LoadedRates {
  const col = (i: number) => Float64Array.from(rows.map((r) => r[i]));
  return { t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), s: Float64Array.from(rows.map((r) => r[5] ?? NaN)), missing: [], digits: 2, point: 0.01, liveFrom: null };
}

/** Kauf-Grid, Raster 1,00 ab 2600, 0,10 Lot, TP 1,00; der Bot setzt um den Kurs je zwei Stufen darunter und darüber */
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

/** Mittwoch 2026-10-07 00:00 (Brokerzeit); Tag 20733 */
const WED = 1_791_331_200;
const MODEL: RunModel = { fill: 'gap', slFirst: false, path: 'auto', closeAtEnd: false };

function run(rates: LoadedRates, extra: Partial<RunInput> = {}) {
  const t0 = rates.t[0];
  return runBacktest({
    zone: ZONE,
    snapshot: snapshot(),
    rates,
    dataTimeframe: 'M1',
    from: t0,
    to: rates.t[rates.t.length - 1] + 60,
    spread: { mode: 'candle' },
    commissionPerLot: 4,
    model: MODEL,
    startCapital: 10_000,
    ...extra,
  });
}

/** Kerze 1 (10:00): fällt von 2650,00 über das Hoch 2650,30 zum Tief 2648,40 und schließt bei 2648,60 */
const T1 = WED + 10 * 3600;
const C1 = [T1, 2650.0, 2650.3, 2648.4, 2648.6, 20];
/** Kerze 2 (10:01): steigt von 2648,60 über das Tief 2648,50 zum Hoch 2651,20 und schließt bei 2651,00 */
const C2 = [T1 + 60, 2648.6, 2651.2, 2648.5, 2651.0, 20];

test.describe('Lauf: Füllung, TP, offener Verlust', () => {
  test('Kauf wird im Weg zum Orderpreis gefüllt; Testende zeigt den offenen Verlust', { tag: '@BKT-04' }, () => {
    /**
     * Der Bot setzt bei Bid 2650,00 / Ask 2650,20 (Mittelkurs 2650,10) BUY_LIMIT 2649 und 2648 (TP 2650 und 2649)
     * sowie BUY_STOP 2651 und 2652. Die fallende Kerze läuft 2650,00 → 2650,30 → 2648,40 → 2648,60.
     * BUY_LIMIT 2649 füllt, wenn Ask ≤ 2649 ist, also bei Bid 2648,80: Einstieg 2649,00.
     * BUY_LIMIT 2648 braucht Bid ≤ 2647,80 und wird nie erreicht.
     * Am Ende (Bid 2648,60): offen −0,40 = 40 Ticks × 1,00 × 0,10 = −4,00; Eingangskommission 4,00 × 0,10 ÷ 2 = 0,20.
     */
    const result = run(candles([C1]));
    expect(result.trades).toEqual([]);
    expect(result.summary.openPositions).toBe(1);
    expect(result.summary.realized).toBe(0);
    expect(result.summary.openResult).toBeCloseTo(-4.2, 9);
    expect(result.summary.endEquity).toBeCloseTo(9995.8, 9);
    expect(result.summary.closedAtEnd).toBe(false);
    // „davon Spread“ nur zur Anzeige: 0,20 ÷ 0,01 = 20 Ticks × 1,00 × 0,10 = 2,00
    expect(result.summary.spreadInfo).toBe(2);
    // Eine Equity-Zeile am Kerzenende (10:00:59)
    expect(result.equity).toHaveLength(1);
    expect(result.equity[0].time).toBe(T1 + 59);
    expect(result.equity[0].value).toBeCloseTo(9995.8, 9);
    // Verlust vor dem ersten Gewinn zählt als Rückgang vom Startkapital: 10000 − 9995,80
    expect(result.summary.maxDrawdown).toBeCloseTo(4.2, 9);
    // Pflichthinweise stehen immer im Protokoll
    const codes = result.log.lines.map((l) => l.code);
    for (const code of ['run.marginNotChecked', 'run.rejectsNotSimulated', 'run.stopsLevelNotSimulated', 'run.costsEstimated']) {
      expect(codes).toContain(code);
    }
  });

  test('TP-Ausstiege in Preis-Reihenfolge mit Gewinn, Kommission und Netto je Trade', { tag: '@BKT-04' }, () => {
    /**
     * Kerze 2 steigt 2648,60 → 2648,50 → 2651,20. Der Bot setzt auf dem Weg BUY_STOP 2650 und 2651 nach.
     * Bid 2649,80: BUY_STOP 2650 füllt (Ask 2650,00). Bid 2650,00: TP der Position von 2649 (TP 2650) schließt.
     * Bid 2650,80: BUY_STOP 2651 füllt. Bid 2651,00: TP der Position von 2650 (TP 2651) schließt.
     * Je Trade: 100 Ticks × 1,00 × 0,10 = 10,00 Gewinn; Kommission 0,20 + 0,20 = 0,40; Netto 9,60.
     * Die Position von 2651 bleibt offen (Bid 2651,00): offen 0,00 − 0,20 Eingangskommission.
     */
    const result = run(candles([C1, C2]));
    expect(result.trades.map((t) => [t.side, t.volume, t.entryPrice, t.exitPrice, t.exitReason, t.profit, t.commission, t.swap, t.net])).toEqual([
      ['buy', 0.1, 2649, 2650, 5, 10, -0.4, 0, 9.6],
      ['buy', 0.1, 2650, 2651, 5, 10, -0.4, 0, 9.6],
    ]);
    expect(result.summary.realized).toBe(19.2);
    expect(result.summary.openPositions).toBe(1);
    expect(result.summary.openResult).toBeCloseTo(-0.2, 9);
    expect(result.summary.endEquity).toBeCloseTo(10_019, 9);
    expect(result.summary.commission).toBe(-0.8);
    expect(result.summary.trades).toBe(2);
    // Trades im Format der Analyse: Zone und Ausstiegszeit liegen im Weg der Kerze
    expect(result.trades[0].zone).toEqual({ kind: 'zone', magic: 200001, label: null });
    expect(result.trades[0].exitTime).toBeGreaterThan(T1 + 60);
    expect(result.trades[1].exitTime).toBeGreaterThan(result.trades[0].exitTime);
    expect(result.trades[1].exitTime).toBeLessThanOrEqual(T1 + 119);
  });

  test('„Am Ende alles schließen“ schließt zum Marktpreis und zeigt keine offene Position', { tag: '@BKT-04' }, () => {
    /**
     * Kerze 1 wie oben, am Ende Bid 2648,60 (Position von 2649): Verlust 40 Ticks × 1,00 × 0,10 = −4,00,
     * Kommission 0,20 + 0,20 = −0,40, Netto −4,40.
     */
    const result = run(candles([C1]), { model: { ...MODEL, closeAtEnd: true } });
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ entryPrice: 2649, exitPrice: 2648.6, exitReason: 3, profit: -4, commission: -0.4, net: -4.4 });
    expect(result.summary).toMatchObject({ realized: -4.4, openResult: 0, openPositions: 0, closedAtEnd: true });
    expect(result.summary.endEquity).toBeCloseTo(9995.6, 9);
  });

  test('inaktive Zone: der Lauf schaltet sie für die Kopie ein', { tag: '@BKT-04' }, () => {
    const result = run(candles([C1]), { zone: { ...ZONE, is_active: false } });
    expect(result.summary.openPositions).toBe(1);
  });
});

test.describe('Zonengrenze im Wegstück', () => {
  test('der Bot wird geweckt, sobald der Mittelkurs die Zonengrenze überschreitet, nicht erst am Ende des Wegstücks', { tag: '@BKT-04' }, () => {
    /**
     * Obergrenze der Zone 2651,00, Aufräumen beim Ausstieg an (sonst steht nichts im Protokoll). Der Bot prüft den Mittelkurs (Bid + 0,10). Kerze 2 steigt 2648,60 → 2648,50 (0,10)
     * → 2651,20 (2,70) → 2651,00 (0,20): Weglänge 3,00 auf 59 s. Mittelkurs > 2651,00 gilt ab Bid 2650,91 (Raster 0,01).
     * Zeit: 59 × (0,10 + 2,41) ÷ 3,00 = 49,3633 s nach Kerzenbeginn (10:01:00). Das Hoch 2651,20 läge erst bei 55,03 s.
     */
    const result = run(candles([C1, C2]), { zone: { ...ZONE, max_price: 2651, clear_on_exit: true } });
    const exited = result.log.lines.find((l) => l.code === 'zone.exited');
    expect(exited).toBeDefined();
    expect((exited?.time ?? 0) - (T1 + 60)).toBeCloseTo(49.3633, 3);
  });
});

test.describe('Kurslücke', () => {
  /** Kerze 3 (10:02) eröffnet bei 2655,00 und steigt zum Hoch 2655,50: eine Lücke von 4,00 über den Schluss 2651,00 */
  const C3 = [T1 + 120, 2655.0, 2655.5, 2655.0, 2655.3, 20];

  test('Gap-Ausführung: TP und Pending Orders füllen zum Marktpreis der Lücke', { tag: '@BKT-04' }, () => {
    /**
     * Vor der Lücke ist die Position von 2651 offen (TP 2652). Die Lücke springt auf Bid 2655,00 / Ask 2655,20:
     * der TP schließt zum Bid 2655,00 (nicht zu 2652): 400 Ticks × 1,00 × 0,10 = 40,00; Netto 40,00 − 0,40 = 39,60.
     * Die BUY_STOP 2652 und 2653 (TP 2653 und 2654) füllen zum Ask 2655,20, nicht zu ihrem Orderpreis. Ihr TP liegt
     * unter dem Kurs und schließt sofort zum Bid 2655,00: −0,20 = −20 Ticks × 1,00 × 0,10 = −2,00; Netto −2,40 je Trade.
     * Summe: 9,60 + 9,60 + 39,60 − 2,40 − 2,40 = 54,00.
     */
    const result = run(candles([C1, C2, C3]));
    expect(result.trades[2]).toMatchObject({ entryPrice: 2651, exitPrice: 2655, exitReason: 5, profit: 40, commission: -0.4, net: 39.6 });
    expect(result.trades.slice(3).map((t) => [t.entryPrice, t.exitPrice, t.profit, t.net])).toEqual([
      [2655.2, 2655, -2, -2.4],
      [2655.2, 2655, -2, -2.4],
    ]);
    expect(result.summary).toMatchObject({ realized: 54, openPositions: 0, trades: 5 });
  });

  test('Parität: dieselbe Lücke füllt zum Orderpreis und schließt zum TP-Preis', { tag: '@BKT-04' }, () => {
    /**
     * Wie die Musterlösungen (FakeMT5): die Position von 2651 schließt zum TP 2652, die BUY_STOP 2652 und 2653 füllen
     * zu ihrem Preis und schließen zu ihrem TP 2653 und 2654. Je Trade 100 Ticks × 1,00 × 0,10 = 10,00; Netto 9,60.
     * Fünf Trades: 5 × 9,60 = 48,00.
     */
    const result = run(candles([C1, C2, C3]), { model: { ...MODEL, fill: 'parity' } });
    expect(result.trades.slice(2).map((t) => [t.entryPrice, t.exitPrice, t.profit, t.net])).toEqual([
      [2651, 2652, 10, 9.6],
      [2652, 2653, 10, 9.6],
      [2653, 2654, 10, 9.6],
    ]);
    expect(result.summary).toMatchObject({ realized: 48, openPositions: 0, trades: 5 });
  });
});

test.describe('Swap', () => {
  /**
   * Position von 2649 (aus Kerze 1) bleibt über Mitternacht offen. Kerze 1 liegt 23:58 am Mittwoch, Kerze 2
   * um 00:00 am Donnerstag und steigt von 2648,60 bis 2650,20: der TP 2650 schließt nach dem Brokertag-Wechsel.
   */
  const LATE = WED + 23 * 3600 + 58 * 60;
  const NIGHT = [
    [LATE, 2650.0, 2650.3, 2648.4, 2648.6, 20],
    [WED + 24 * 3600, 2648.6, 2650.2, 2648.6, 2650.2, 20],
  ];

  test('Dreifach-Tag Mittwoch: Mi → Do kostet 3 Nächte (−6,50 × 0,10 × 3 = −1,95)', { tag: '@BKT-04' }, () => {
    const result = run(candles(NIGHT), { snapshot: snapshot({}, true) });
    // Gewinn 10,00; Kommission −0,40; Swap −1,95 → Netto 7,65
    expect(result.trades[0]).toMatchObject({ entryPrice: 2649, exitPrice: 2650, profit: 10, commission: -0.4, swap: -1.95, net: 7.65 });
    expect(result.summary.swap).toBe(-1.95);
  });

  test('Dreifach-Tag Freitag: Mi → Do kostet nur 1 Nacht (−0,65)', { tag: '@BKT-04' }, () => {
    const result = run(candles(NIGHT), { snapshot: snapshot({ swap_rollover3days: 5 }, true) });
    expect(result.trades[0]).toMatchObject({ swap: -0.65, net: 8.95 });
  });

  test('Swap aus: keine Swap-Buchung', { tag: '@BKT-04' }, () => {
    const result = run(candles(NIGHT), { snapshot: snapshot({}, false) });
    expect(result.trades[0]).toMatchObject({ swap: 0, net: 9.6 });
  });

  test('offene Position am Testende trägt den gebuchten Swap in der Equity', { tag: '@BKT-04' }, () => {
    // Nur Kerze 1 (23:58), Kerze 2 endet auf 2648,60 ohne TP: Position von 2649 offen über die Nacht
    const flat = [NIGHT[0], [WED + 24 * 3600, 2648.6, 2648.7, 2648.6, 2648.6, 20]];
    const result = run(candles(flat), { snapshot: snapshot({}, true) });
    // Bid 2648,60: −4,00; Kommission −0,20; Swap −1,95 → −6,15
    expect(result.summary.openPositions).toBe(1);
    expect(result.summary.openResult).toBeCloseTo(-6.15, 9);
  });
});

test.describe('Broker im Kerzenpfad', () => {
  function broker(options: { fill?: 'gap' | 'parity'; slFirst?: boolean; commissionPerLot?: number; swap?: boolean } = {}): PathBroker {
    const snap = snapshot({}, options.swap ?? false);
    const b = new PathBroker({
      info: snap.info,
      costs: snap.costs,
      start: WED,
      firstBid: 2650,
      fill: options.fill ?? 'gap',
      commissionPerLot: options.commissionPerLot ?? 0,
      slFirst: options.slFirst ?? false,
      timeframes: [{ name: 'M5', sec: 300 }],
      zoneLabel: () => 'Z1',
    });
    b.beginCandle(WED, 2650, 20); // Spread 20 Punkte = 0,20
    b.setMarket(2650, WED);
    return b;
  }

  const pending = (type: number, price: number, tp = 0, sl = 0) => ({
    action: TRADE_ACTION_PENDING,
    symbol: 'XAUUSD',
    volume: 0.1,
    type,
    price,
    tp,
    sl,
    magic: 200001,
    comment: 'AutoGrid_Z1',
  });

  test('Kauf-Stop löst bei Bid = Orderpreis − Spread aus, Verkaufs-TP bei Bid = TP − Spread', { tag: '@BKT-04' }, () => {
    const b = broker();
    b.orderSend(pending(ORDER_TYPE_BUY_STOP, 2651, 2652, 2650));
    // Aufwärts von 2650,00 bis 2652,00: Ask 2651,00 = Bid 2650,80
    expect(b.nextTrigger(2650, 2652)).toEqual({ kind: 'fill', ticket: 1000, bid: 2650.8, immediate: false });
    // Abwärts kommt die Order nicht
    expect(b.nextTrigger(2650, 2649)).toBeNull();
    b.setMarket(2650.8, WED + 1);
    b.fire({ kind: 'fill', ticket: 1000, bid: 2650.8, immediate: false }, false);
    // Kauf-Position schließt zum Bid: TP bei Bid 2652,00, SL bei Bid 2650,00
    expect(b.nextTrigger(2650.8, 2653)).toEqual({ kind: 'tp', ticket: 1000, bid: 2652, immediate: false });
    expect(b.nextTrigger(2650.8, 2649)).toEqual({ kind: 'sl', ticket: 1000, bid: 2650, immediate: false });
    // Verkaufs-Position schließt zum Ask: TP 2649 bei Bid 2648,80, SL 2651 bei Bid 2650,80
    const sell = broker();
    sell.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'XAUUSD', volume: 0.1, type: ORDER_TYPE_SELL, price: 2650, tp: 2649, sl: 2651, magic: 200001 });
    expect(sell.nextTrigger(2650, 2647)).toEqual({ kind: 'tp', ticket: 1000, bid: 2648.8, immediate: false });
    expect(sell.nextTrigger(2650, 2652)).toEqual({ kind: 'sl', ticket: 1000, bid: 2650.8, immediate: false });
  });

  test('mehrere Marken: erst die zuerst erreichte; bei gleichem Preis TP vor SL, mit „SL zuerst“ umgekehrt', { tag: '@BKT-04' }, () => {
    for (const slFirst of [false, true]) {
      const b = broker({ slFirst });
      // Kauf mit TP 2652 (Bid 2652,00) und Verkauf mit SL 2652,20 (Ask 2652,20 = Bid 2652,00): derselbe Preis
      b.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'XAUUSD', volume: 0.1, type: 0, price: 2650.2, tp: 2652, sl: 2640, magic: 200001 });
      b.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'XAUUSD', volume: 0.1, type: ORDER_TYPE_SELL, price: 2650, tp: 2640, sl: 2652.2, magic: 200001 });
      const hit = b.nextTrigger(2650, 2653);
      expect(hit).toMatchObject({ kind: slFirst ? 'sl' : 'tp', bid: 2652 });
    }
    // Andere Preise: die nähere Marke zuerst, aufwärts wie abwärts
    const b = broker();
    b.orderSend(pending(ORDER_TYPE_BUY_STOP, 2652, 0, 0)); // Bid 2651,80
    b.orderSend(pending(ORDER_TYPE_BUY_STOP, 2651, 0, 0)); // Bid 2650,80
    expect(b.nextTrigger(2650, 2655)).toMatchObject({ ticket: 1001, bid: 2650.8 });
    // Ab 2651,50 gilt die Marke von 2651 (Bid 2650,80) schon: sofort, zum Ausgangskurs
    expect(b.nextTrigger(2651.5, 2655)).toEqual({ kind: 'fill', ticket: 1001, bid: 2651.5, immediate: true });
  });

  test('Der Spread der Kerze verschiebt die Marken: 50 Punkte → Kauf-Stop 2651 löst bei Bid 2650,50 aus', { tag: '@BKT-04' }, () => {
    const b = broker();
    b.beginCandle(WED + 60, 2650, 50);
    b.orderSend(pending(ORDER_TYPE_BUY_STOP, 2651, 0, 0));
    expect(b.nextTrigger(2650, 2652)).toMatchObject({ bid: 2650.5 });
  });

  test('Marke, die am Ausgangskurs schon gilt, löst sofort aus', { tag: '@BKT-04' }, () => {
    const b = broker();
    b.orderSend(pending(ORDER_TYPE_BUY_STOP, 2651, 0, 0));
    expect(b.nextTrigger(2655, 2656)).toEqual({ kind: 'fill', ticket: 1000, bid: 2655, immediate: true });
    expect(b.nextTrigger(2655, 2655)).toMatchObject({ kind: 'fill', immediate: true });
  });

  test('Gap füllt zum Marktpreis, Parität zum Orderpreis; TP zum Bid bzw. zum TP-Preis', { tag: '@BKT-04' }, () => {
    for (const fill of ['gap', 'parity'] as const) {
      const b = broker({ fill });
      b.orderSend(pending(ORDER_TYPE_BUY_STOP, 2651, 2652, 0));
      b.setMarket(2655, WED + 60); // Bid 2655,00 / Ask 2655,20
      const [trigger] = [b.nextTrigger(2650, 2655)!];
      b.fire(trigger, true);
      expect(b.positionsGet()[0].price_open).toBe(fill === 'gap' ? 2655.2 : 2651);
      // TP 2652 liegt unter dem Kurs: sofort fällig
      const tp = b.nextTrigger(2655, 2655)!;
      expect(tp.kind).toBe('tp');
      b.fire(tp, true);
      expect(b.trades[0].exitPrice).toBe(fill === 'gap' ? 2655 : 2652);
      expect(b.trades[0].entryPrice).toBe(fill === 'gap' ? 2655.2 : 2651);
    }
  });

  test('Kerzen des Bots: Zeitrahmen mit laufender Kerze, nicht registrierter Zeitrahmen bricht ab', { tag: '@BKT-04' }, () => {
    const b = broker();
    b.warm({ time: WED - 300, open: 2640, high: 2645, low: 2639, close: 2644 });
    b.setMarket(2652, WED + 30);
    const bars = b.copyRatesFromPos('XAUUSD', 'M5', 0, 5)!;
    expect(bars.map((x) => [x.time, x.open, x.high, x.low, x.close])).toEqual([
      [WED - 300, 2640, 2645, 2639, 2644],
      [WED, 2650, 2652, 2650, 2652], // laufende Kerze: Eröffnung 2650, bisheriger Weg bis 2652
    ]);
    expect(() => b.copyRatesFromPos('XAUUSD', 'H4', 0, 5)).toThrow();
  });
});

test.describe('Schließen durch den Bot und am Testende', () => {
  function open(b: PathBroker, type: number, price: number): void {
    b.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'XAUUSD', volume: 0.1, type, price, magic: 200001, comment: 'AutoGrid_Z1' });
  }
  const close = (b: PathBroker, ticket: number) => b.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'XAUUSD', volume: 0.1, position: ticket, magic: 200001 });
  function start(options: { commissionPerLot: number; swap?: boolean }): PathBroker {
    const snap = snapshot({}, options.swap ?? false);
    const b = new PathBroker({
      info: snap.info,
      costs: snap.costs,
      start: WED,
      firstBid: 2650,
      fill: 'gap',
      commissionPerLot: options.commissionPerLot,
      slFirst: false,
      timeframes: [{ name: 'M5', sec: 300 }],
      zoneLabel: () => 'Z1',
    });
    b.beginCandle(WED, 2650, 20);
    b.setMarket(2650, WED);
    return b;
  }

  test('Verkauf: Marktanfrage des Bots schließt zum Ask (Bid 2649,00 + 0,20)', { tag: '@BKT-04' }, () => {
    const b = start({ commissionPerLot: 4 });
    open(b, ORDER_TYPE_SELL, 2650);
    b.setMarket(2649, WED + 60);
    close(b, 1000);
    // 2650,00 − 2649,20 = 0,80 = 80 Ticks × 1,00 × 0,10 = 8,00; Kommission 0,20 + 0,20; Netto 7,60
    expect(b.trades).toHaveLength(1);
    expect(b.trades[0]).toMatchObject({ side: 'sell', entryPrice: 2650, exitPrice: 2649.2, exitReason: 3, profit: 8, commission: -0.4, swap: 0, net: 7.6 });
    expect(b.realized).toBe(7.6);
    expect(b.openCount).toBe(0);
  });

  test('Kauf: schließt zum Bid; Swap der Nacht steht im Trade', { tag: '@BKT-04' }, () => {
    const b = start({ commissionPerLot: 4, swap: true });
    open(b, 0, 2650.2); // Kauf zum Ask 2650,20
    // Mittwoch → Donnerstag: Dreifach-Tag, 3 × (−6,50 × 0,10) = −1,95
    b.rollover(WED + 23 * 3600 + 59 * 60, WED + 24 * 3600);
    b.setMarket(2651, WED + 24 * 3600 + 60);
    close(b, 1000);
    // 2651,00 − 2650,20 = 0,80 → 8,00; Kommission −0,40; Swap −1,95; Netto 5,65
    expect(b.trades[0]).toMatchObject({ side: 'buy', entryPrice: 2650.2, exitPrice: 2651, profit: 8, commission: -0.4, swap: -1.95, net: 5.65 });
  });

  test('Swap über zwei Wochen bleibt auf Cent: 14 Nächte × −0,65 = −9,10', { tag: '@BKT-04' }, () => {
    const b = start({ commissionPerLot: 0, swap: true });
    open(b, 0, 2650.2);
    b.rollover(WED + 23 * 3600, WED + 14 * 86400); // Mittwoch 23:00 bis Mittwoch 00:00 zwei Wochen später
    b.setMarket(2650.2, WED + 14 * 86400 + 1);
    close(b, 1000);
    // 2 Wochen × 7 Nächte (Mi 3, Do 1, Fr 1, Mo 1, Di 1; Sa/So 0) = 14 Nächte = −9,10 ohne Rundungsrest der Summe
    expect(Object.is(b.trades[0].swap, -9.1)).toBe(true);
  });

  test('Testende: Verkaufs-Position wird zum Ask geschlossen, Verlust und Kommission zählen', { tag: '@BKT-04' }, () => {
    const b = start({ commissionPerLot: 4 });
    open(b, ORDER_TYPE_SELL, 2650);
    b.setMarket(2652, WED + 60); // Ask 2652,20
    expect(b.openResult()).toBeCloseTo(-22.2, 9); // 220 Ticks × 1,00 × 0,10 = −22,00 und Eingangskommission −0,20
    b.closeAll();
    // −22,00; Kommission −0,40; Netto −22,40
    expect(b.trades[0]).toMatchObject({ side: 'sell', exitPrice: 2652.2, exitReason: 3, profit: -22, commission: -0.4, net: -22.4 });
    expect(b.openCount).toBe(0);
    expect(b.openResult()).toBe(0);
    expect(b.equity()).toBe(-22.4);
  });
});

test.describe('Ergebnis und Abruf', () => {
  test('Kurve: Hoch und Tief jeder Gruppe, erster und letzter Punkt bleiben, Zeiten steigen', { tag: '@BKT-04' }, () => {
    const n = 50_000;
    const times = Array.from({ length: n }, (_, i) => 1000 + i * 60);
    // Zickzack mit Tief −500 bei Punkt 12.345 und Hoch 900 bei Punkt 40.001; Ende bei 0,25
    const values = times.map((_, i) => (i % 2 === 0 ? 1 : -1) * (1 + (i % 7)));
    values[12_345] = -500;
    values[40_001] = 900;
    values[n - 1] = 0.25; // weder Tief noch Hoch seiner Gruppe
    const curve = downsampleCurve(times, values, 20_000);
    expect(curve.length).toBeLessThanOrEqual(20_002);
    expect(curve.length).toBeGreaterThan(10_000);
    expect(curve[0]).toEqual({ time: times[0], value: values[0] });
    expect(curve[curve.length - 1]).toEqual({ time: times[n - 1], value: 0.25 });
    expect(curve.some((p) => p.value === -500 && p.time === times[12_345])).toBe(true);
    expect(curve.some((p) => p.value === 900 && p.time === times[40_001])).toBe(true);
    expect(curve.every((p, i) => i === 0 || p.time > curve[i - 1].time)).toBe(true);
    // Wenige Punkte bleiben unverändert
    expect(downsampleCurve([1, 2, 3], [5, 6, 4], 20_000)).toEqual([
      { time: 1, value: 5 },
      { time: 2, value: 6 },
      { time: 3, value: 4 },
    ]);
  });

  test('Equity-Spur: gleiche Zeit überschreibt, Rückgang zählt vom Startwert', { tag: '@BKT-04' }, () => {
    const track = new EquityTrack(100);
    track.add(10, 95); // Verlust vor dem ersten Gewinn: 5 unter dem Start
    track.add(20, 120);
    track.add(30, 110);
    track.add(30, 104); // gleiche Zeit: der letzte Stand zählt
    expect(track.times).toEqual([10, 20, 30]);
    expect(track.values).toEqual([95, 120, 104]);
    // Höchststand 120, tiefster Stand danach 104 (der überschriebene Wert 110 zählte auch): 120 − 104 = 16
    expect(track.maxDrawdown).toBe(16);
  });

  test('HTTP-Abruf: Adresse, Kopfzeilen und Zeitlimit; Statusfehler und Netzfehler als Code', { tag: '@BKT-04' }, async () => {
    const real = globalThis.fetch;
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const stub = (impl: () => Promise<unknown>) => {
      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return impl();
      }) as unknown as typeof fetch;
    };
    try {
      const get = httpFetchJson('https://w.example/api', { 'X-API-Key': 'k' });
      stub(async () => ({ ok: true, json: async () => ({ t: [] }) }));
      expect(await get('/market/a/rates?x=1')).toEqual({ t: [] });
      expect(calls[0].url).toBe('https://w.example/api/market/a/rates?x=1');
      expect(calls[0].init?.headers).toEqual({ 'X-API-Key': 'k' });
      expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
      expect(FETCH_TIMEOUT_MS).toBe(120_000);
      stub(async () => ({ ok: false, status: 502 }));
      await expect(get('/p')).rejects.toMatchObject({ code: 'run.http', params: { status: 502, path: '/p' } });
      stub(async () => {
        throw new TypeError('Failed to fetch');
      });
      await expect(get('/p')).rejects.toMatchObject({ code: 'run.network', params: { path: '/p' } });
      stub(async () => ({ ok: true, json: async () => { throw new SyntaxError('kein JSON'); } }));
      await expect(get('/p')).rejects.toMatchObject({ code: 'run.network' });
    } finally {
      globalThis.fetch = real;
    }
  });
});

test.describe('Vorbedingungen und Abbruch', () => {
  test('Zeitrahmen des Bots: Ausstieg immer, Fraktal-Zeitrahmen nur bei Fraktal-Zonen; Vorlauf', { tag: '@BKT-04' }, () => {
    expect(strategyTimeframes(ZONE)).toEqual(['M15']);
    expect(strategyTimeframes({ ...ZONE, entry_mode: 'fractal', fractal_timeframe: 'H1' })).toEqual(['M15', 'H1']);
    expect(strategyTimeframes({ ...ZONE, entry_mode: 'fractal' })).toEqual(['M15', 'H4']); // Standard H4
    // Vorlauf: 301 H1-Kerzen × 3600 s × 1,4 für Wochenenden = 1.517.040 s (höchstens 100.000 M1-Kerzen)
    expect(warmupSeconds({ ...ZONE, entry_mode: 'fractal', fractal_timeframe: 'H1' }, 'M1')).toBe(1_517_040);
    // Ohne Fraktal braucht der Bot nur wenige Kerzen des Ausstiegs-Zeitrahmens: 3 × 900 s × 1,4
    expect(warmupSeconds(ZONE, 'M1')).toBe(3780);
  });

  test('Zeitrahmen feiner als die Daten, fremdes Symbol, keine Kerzen im Zeitraum: Abbruch mit Code', { tag: '@BKT-04' }, () => {
    expect(() => run(candles([C1]), { dataTimeframe: 'H1' })).toThrow(expect.objectContaining({ code: 'run.timeframeFinerThanData' }));
    expect(() => run(candles([C1]), { zone: { ...ZONE, symbol: 'EURUSD' } })).toThrow(expect.objectContaining({ code: 'run.symbolMismatch' }));
    expect(() => run(candles([C1]), { zone: { ...ZONE, symbol: '' } })).toThrow(expect.objectContaining({ code: 'run.noSymbol' }));
    expect(() => run(candles([C1]), { from: T1 + 3600, to: T1 + 7200 })).toThrow(expect.objectContaining({ code: 'run.noCandles' }));
  });

  test('zu viele Ereignisse in einer Kerze: Abbruch statt stilles Überspringen', { tag: '@BKT-04' }, () => {
    // Kerze 2 hat mehr als 2 Auslösungen und Zonenwechsel
    expect(() => run(candles([C1, C2]), { maxEventsPerCandle: 2 })).toThrow(expect.objectContaining({ code: 'run.tooManyEvents' }));
  });

  test('Kerze ohne Spread-Wert: Ersatz durch den Symbol-Spread mit Meldung; ohne beides Abbruch', { tag: '@BKT-04' }, () => {
    const noSpread = [T1, 2650.0, 2650.3, 2648.4, 2648.6];
    const result = run(candles([noSpread]));
    expect(result.log.lines.find((l) => l.code === 'run.spreadFallback')).toMatchObject({ params: { candles: 1, points: 20 } });
    const noSymbolSpread = snapshot({ spread: null });
    expect(() => run(candles([noSpread]), { snapshot: noSymbolSpread })).toThrow(expect.objectContaining({ code: 'run.spreadMissing' }));
  });

  test('fester Spread ersetzt den der Kerze: er geht in die Kosten zur Anzeige ein', { tag: '@BKT-04' }, () => {
    // Eine Position (0,10 Lot) bei Spread 20 Punkte kostet 2,00 (Test oben); fest 30 Punkte: 30 Ticks × 1,00 × 0,10 = 3,00
    const result = run(candles([C1]), { spread: { mode: 'fixed', points: 30 } });
    expect(result.summary.spreadInfo).toBe(3);
  });
});

test.describe('Auftrag im Web Worker', () => {
  /** Antwort wie GET /market/{id}/rates: alle Kerzen auf einer Seite */
  function ratesPage(rates: LoadedRates, requests: string[]) {
    return async (path: string) => {
      requests.push(path);
      const col = (a: Float64Array) => Array.from(a);
      return { t: col(rates.t), o: col(rates.o), h: col(rates.h), l: col(rates.l), c: col(rates.c), s: col(rates.s), missing: [], next_from: null, digits: 2, point: 0.01 };
    };
  }

  function request(params: Partial<RunRequest['params']> = {}, runId = 7): RunRequest {
    return {
      type: 'run',
      runId,
      apiBase: 'https://worker.example/api',
      headers: { 'X-API-Key': 'k' },
      params: {
        accountId: 'acc',
        zone: ZONE,
        symbol: DETAIL,
        from: T1,
        to: T1 + 120,
        dataTimeframe: 'M1',
        spread: { mode: 'candle' },
        commissionPerLot: 4,
        swapEnabled: false,
        approximate: false,
        model: { fill: 'gap', slFirst: false, closeAtEnd: false },
        path: 'auto',
        startCapital: 10_000,
        ...params,
      },
    };
  }

  async function job(req: RunRequest, fetchJson: (path: string) => Promise<unknown>): Promise<WorkerMessage[]> {
    const messages: WorkerMessage[] = [];
    await runJob(req, (m) => messages.push(m), fetchJson);
    return messages;
  }

  test('lädt die Kerzen mit Vorlauf, rechnet und meldet Fortschritt und Ergebnis mit der runId', { tag: '@BKT-04' }, async () => {
    const requests: string[] = [];
    const messages = await job(request(), ratesPage(candles([C1, C2]), requests));
    // Vorlauf: 3 × 900 s × 1,4 = 3780 s vor dem Start (nur der Ausstiegs-Zeitrahmen M15, kein Fraktal)
    expect(requests).toEqual([`/market/acc/rates?symbol=XAUUSD&timeframe=M1&from=${T1 - 3780}&to=${T1 + 120}`]);
    expect(messages.every((m) => m.runId === 7)).toBe(true);
    const progress = messages.filter((m) => m.type === 'progress').map((m) => (m.type === 'progress' ? m.fraction : -1));
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    const result = messages[messages.length - 1];
    if (result.type !== 'result') throw new Error(JSON.stringify(result));
    expect(result.results).toHaveLength(1);
    expect(result.results[0].trades.map((t) => t.net)).toEqual([9.6, 9.6]);
    expect(result.results[0].path).toBe('auto');
  });

  test('„beide Wege“: zwei Läufe, Tief zuerst und Hoch zuerst', { tag: '@BKT-04' }, async () => {
    const messages = await job(request({ path: 'both' }), ratesPage(candles([C1, C2]), []));
    const result = messages[messages.length - 1];
    if (result.type !== 'result') throw new Error(JSON.stringify(result));
    expect(result.results.map((r) => r.path)).toEqual(['lowFirst', 'highFirst']);
  });

  test('fehlender Symbolwert, HTTP-Fehler und Abbruchgründe des Laufs kommen als Fehlernachricht mit Code', { tag: '@BKT-04' }, async () => {
    const never = async () => {
      throw new Error('darf nicht geladen werden');
    };
    const missing = await job(request({ symbol: { ...DETAIL, trade_tick_value_profit: null } }), never);
    expect(missing).toEqual([
      {
        type: 'error',
        runId: 7,
        code: 'run.symbolFieldMissing',
        params: { symbol: 'XAUUSD', fields: ['trade_tick_value_profit'] },
        problems: [{ code: 'run.symbolFieldMissing', params: { symbol: 'XAUUSD', fields: ['trade_tick_value_profit'] } }],
      },
    ]);
    const http = await job(request(), async () => {
      throw new RunError('run.http', { status: 502 });
    });
    expect(http).toEqual([{ type: 'error', runId: 7, code: 'run.http', params: { status: 502 } }]);
    const foreign = await job(request({ zone: { ...ZONE, symbol: 'EURUSD' } }), ratesPage(candles([C1]), []));
    expect(foreign[foreign.length - 1]).toMatchObject({ type: 'error', code: 'run.symbolMismatch' });
    const odd = await job(request(), async () => {
      throw new TypeError('kaputt');
    });
    expect(odd).toEqual([{ type: 'error', runId: 7, code: 'run.unexpected', message: 'kaputt' }]);
  });
});
