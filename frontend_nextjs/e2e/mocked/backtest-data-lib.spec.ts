/**
 * Daten- und Kostenschicht des Backtest-Rechners (B4), ohne Browserseite: Kerzen laden, höhere Zeitrahmen
 * ohne Zukunftsdaten, Kerzenpfad, Gewinn, Kommission, Swap, Spread, Schnappschuss der Symbolwerte.
 * Alle erwarteten Werte sind von Hand gerechnet.
 * BKT-04 Backtest-Rechner mit Kosten
 */
import { expect, test } from '@playwright/test';
import {
  brokerDay,
  candleSpreadPoints,
  cents,
  commissionHalf,
  profitOf,
  snapshotSymbol,
  spreadCost,
  swapNights,
  swapPerNight,
  weekdayOfDay,
  type SymbolCosts,
} from '../../src/lib/backtest/broker/costs';
import { TimeframeAggregator } from '../../src/lib/backtest/candles/bars';
import { loadRates } from '../../src/lib/backtest/candles/loadRates';
import { candleWaypoints, waypointTimes } from '../../src/lib/backtest/candles/pathModel';
import { RUN_LOG_MAX_LINES, RunLog } from '../../src/lib/backtest/runContext';
import type { SymbolDetail } from '../../src/store/types';

/** Gold-ähnliches Symbol: Tick 0,01, Tickwert 1,00 bei Gewinn und 1,05 bei Verlust (je Lot) */
const COSTS: SymbolCosts = { point: 0.01, digits: 2, tickSize: 0.01, tickValueProfit: 1, tickValueLoss: 1.05, swap: null };

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
  trade_tick_value_loss: 1.05,
  swap_mode: 4,
  swap_long: -6.5,
  swap_short: 2,
  swap_rollover3days: 3,
  spread: 25,
  trade_stops_level: 0,
};

test.describe('Gewinn und Kosten', () => {
  test('Gewinn: Ticks × Tickwert × Lot, Verlust mit dem Verlust-Tickwert', { tag: '@BKT-04' }, () => {
    // Kauf 0,10 Lot: 2650,00 → 2651,50 = 150 Ticks × 1,00 × 0,10
    expect(profitOf(COSTS, true, 0.1, 2650, 2651.5)).toBe(15);
    // Kauf 0,10 Lot: 2650,00 → 2649,00 = 100 Ticks × 1,05 × 0,10
    expect(profitOf(COSTS, true, 0.1, 2650, 2649)).toBe(-10.5);
    // Verkauf 0,20 Lot: 2650,00 → 2648,70 = 130 Ticks × 1,00 × 0,20
    expect(profitOf(COSTS, false, 0.2, 2650, 2648.7)).toBe(26);
    // Verkauf 0,20 Lot gegen die Richtung: 2650,00 → 2650,40 = 40 Ticks × 1,05 × 0,20
    expect(profitOf(COSTS, false, 0.2, 2650, 2650.4)).toBe(-8.4);
    // Rundung auf Cent: 35 Ticks × 1,00 × 0,07 = 2,45
    expect(profitOf(COSTS, true, 0.07, 100, 100.35)).toBe(2.45);
  });

  test('Kommission: je Hälfte, negativ, auf Cent', { tag: '@BKT-04' }, () => {
    // 7,00 je Lot hin und zurück, 0,10 Lot: 0,35 beim Einstieg und 0,35 beim Ausstieg
    expect(commissionHalf(7, 0.1)).toBe(-0.35);
    expect(commissionHalf(7, 0.04)).toBe(-0.14);
    expect(commissionHalf(0, 0.1)).toBe(0);
    expect(Object.is(commissionHalf(0, 0.1), 0)).toBe(true);
  });

  test('Spread: Kosten nur zur Anzeige, 25 Punkte = 0,25 = 25 Ticks × 1,05 × 0,20', { tag: '@BKT-04' }, () => {
    expect(spreadCost(COSTS, 0.25, 0.2)).toBe(5.25);
    // Cent-Rundung wie Python round(): 0,125 ist exakt darstellbar und rundet zur geraden Zahl
    expect(cents(0.125)).toBe(0.12);
  });

  test('Swap in Geld der Kontowährung: Satz × Lot je Nacht', { tag: '@BKT-04' }, () => {
    const swap = { mode: 4 as const, long: -6.5, short: 2, rollover3days: 3 };
    expect(swapPerNight(swap, COSTS, true, 0.1)).toBeCloseTo(-0.65, 12);
    expect(swapPerNight(swap, COSTS, false, 0.5)).toBeCloseTo(1, 12);
  });

  test('Swap in Punkten: Punkte × Punktwert × Lot, Gutschrift mit Gewinn-, Belastung mit Verlust-Tickwert', { tag: '@BKT-04' }, () => {
    const swap = { mode: 1 as const, long: -12, short: 8, rollover3days: 3 };
    // Verkauf 0,20 Lot: 8 Punkte × 0,01 × (1,00 ÷ 0,01) × 0,20 = 1,60
    expect(swapPerNight(swap, COSTS, false, 0.2)).toBeCloseTo(1.6, 12);
    // Kauf 0,10 Lot: −12 Punkte × 0,01 × (1,05 ÷ 0,01) × 0,10 = −1,26
    expect(swapPerNight(swap, COSTS, true, 0.1)).toBeCloseTo(-1.26, 12);
  });

  test('Swap-Nächte: Dreifach-Tag des Symbols, Wochenende 0', { tag: '@BKT-04' }, () => {
    // Tag 20733 = Mittwoch, 2026-10-07 (Tag 0 = Donnerstag 1970-01-01)
    const WED = 20733;
    const nights = (r3: number) => [0, 1, 2, 3, 4, 5, 6].map((i) => swapNights(WED + i, r3));
    // Mi Do Fr Sa So Mo Di; Dreifach-Tag Mittwoch (Forex)
    expect(nights(3)).toEqual([3, 1, 1, 0, 0, 1, 1]);
    // Dreifach-Tag Freitag (viele Indizes)
    expect(nights(5)).toEqual([1, 1, 3, 0, 0, 1, 1]);
    // Eine Woche zählt 7 Nächte
    expect(nights(3).reduce((a, b) => a + b, 0)).toBe(7);
  });

  test('Spread je Kerze: aus MT5, fest oder das Maximum; ohne Wert null', { tag: '@BKT-04' }, () => {
    expect(candleSpreadPoints({ mode: 'candle' }, 18)).toBe(18);
    expect(candleSpreadPoints({ mode: 'candle' }, null)).toBeNull();
    expect(candleSpreadPoints({ mode: 'fixed', points: 30 }, 18)).toBe(30);
    expect(candleSpreadPoints({ mode: 'max', points: 30 }, 18)).toBe(30);
    expect(candleSpreadPoints({ mode: 'max', points: 30 }, 45)).toBe(45);
    expect(candleSpreadPoints({ mode: 'max', points: 30 }, null)).toBe(30);
  });

  test('Spread einer Kerze ohne Wert (NaN aus dem CSV-Import, 0 von MT5) gilt als unbekannt', { tag: '@BKT-04' }, () => {
    expect(candleSpreadPoints({ mode: 'candle' }, NaN)).toBeNull();
    expect(candleSpreadPoints({ mode: 'candle' }, 0)).toBeNull();
    expect(candleSpreadPoints({ mode: 'max', points: 30 }, NaN)).toBe(30);
    expect(candleSpreadPoints({ mode: 'max', points: 30 }, 0)).toBe(30);
  });

  test('Brokertag und Wochentag: Tag 0 war ein Donnerstag', { tag: '@BKT-04' }, () => {
    expect(brokerDay(86399)).toBe(0);
    expect(brokerDay(86400)).toBe(1);
    expect(brokerDay(1_791_331_200)).toBe(20733);
    expect(weekdayOfDay(0)).toBe(4);
    expect(weekdayOfDay(20733)).toBe(3); // Mittwoch 2026-10-07
    expect(weekdayOfDay(-1)).toBe(3); // Mittwoch 1969-12-31
  });
});

test.describe('Schnappschuss der Symbolwerte', () => {
  const OPTIONS = { swapEnabled: true, approximate: false };

  test('vollständige Werte ergeben Schnappschuss mit Swap in Geld', { tag: '@BKT-04' }, () => {
    const result = snapshotSymbol(DETAIL, OPTIONS);
    if (!('snapshot' in result)) throw new Error(JSON.stringify(result.problems));
    expect(result.snapshot.costs.swap).toEqual({ mode: 4, long: -6.5, short: 2, rollover3days: 3 });
    expect(result.snapshot.costs.tickValueLoss).toBe(1.05);
    expect(result.snapshot.spreadPoints).toBe(25);
    expect(result.warnings).toEqual([]);
  });

  test('fehlender Kostenwert blockiert den Lauf und nennt das Feld, kein Ersatzwert', { tag: '@BKT-04' }, () => {
    const result = snapshotSymbol({ ...DETAIL, trade_tick_value_loss: null, swap_long: undefined }, OPTIONS);
    expect(result).toEqual({
      problems: [{ code: 'run.symbolFieldMissing', params: { symbol: 'XAUUSD', fields: ['trade_tick_value_loss', 'swap_long'] } }],
    });
  });

  test('Swap aus: Swap-Felder dürfen fehlen; Modus 0 ergibt keinen Swap', { tag: '@BKT-04' }, () => {
    const noSwapFields = { ...DETAIL, swap_mode: undefined, swap_long: undefined, swap_short: undefined, swap_rollover3days: undefined };
    const off = snapshotSymbol(noSwapFields, { swapEnabled: false, approximate: false });
    expect('snapshot' in off && off.snapshot.costs.swap).toBeNull();
    const mode0 = snapshotSymbol({ ...DETAIL, swap_mode: 0 }, OPTIONS);
    expect('snapshot' in mode0 && mode0.snapshot.costs.swap).toBeNull();
  });

  test('nicht unterstützter Swap-Modus blockiert den Lauf', { tag: '@BKT-04' }, () => {
    expect(snapshotSymbol({ ...DETAIL, swap_mode: 6 }, OPTIONS)).toEqual({ problems: [{ code: 'run.swapModeUnsupported', params: { mode: 6 } }] });
  });

  test('unplausible Werte blockieren wie fehlende: Dreifach-Tag am Wochenende, Nachkommastellen, Berechnungsart', { tag: '@BKT-04' }, () => {
    expect(snapshotSymbol({ ...DETAIL, swap_rollover3days: 6 }, OPTIONS)).toEqual({
      problems: [{ code: 'run.swapTripleDayInvalid', params: { day: 6 } }],
    });
    // 7 liegt außerhalb der Woche
    expect('problems' in snapshotSymbol({ ...DETAIL, swap_rollover3days: 7 }, OPTIONS)).toBe(true);
    expect(snapshotSymbol({ ...DETAIL, digits: -1, trade_calc_mode: 2.5 }, OPTIONS)).toEqual({
      problems: [{ code: 'run.symbolFieldMissing', params: { symbol: 'XAUUSD', fields: ['digits', 'trade_calc_mode'] } }],
    });
    // ohne Swap darf der Dreifach-Tag beliebig sein
    expect('snapshot' in snapshotSymbol({ ...DETAIL, swap_rollover3days: 6 }, { swapEnabled: false, approximate: false })).toBe(true);
  });

  test('Berechnungsart außerhalb der Liste: blockiert, mit Näherungsmodus nur Warnung', { tag: '@BKT-04' }, () => {
    const futures = { ...DETAIL, trade_calc_mode: 1 };
    expect(snapshotSymbol(futures, OPTIONS)).toEqual({ problems: [{ code: 'run.calcModeUnsupported', params: { mode: 1 } }] });
    const approx = snapshotSymbol(futures, { swapEnabled: true, approximate: true });
    expect('warnings' in approx && approx.warnings).toEqual([{ code: 'run.calcModeApproximate', params: { mode: 1 } }]);
  });
});

test.describe('Kerzen laden', () => {
  /** Zwei Seiten à 2 Kerzen M1; die zweite Seite hat einen fehlenden Bereich und keinen Spread */
  function pages(): (path: string) => Promise<unknown> {
    const seen: string[] = [];
    const fetchJson = async (path: string) => {
      seen.push(path);
      if (seen.length === 1) {
        return { t: [0, 60], o: [10, 11], h: [12, 13], l: [9, 10], c: [11, 12], s: [20, 21], missing: [], digits: 2, point: 0.01, next_from: 120 };
      }
      return {
        t: [180, 240],
        o: [12, 13],
        h: [14, 15],
        l: [11, 12],
        c: [13, 14],
        s: [null, 22],
        missing: [{ from: 120, to: 180, reason: 'unavailable', checked_at: 1 }],
        digits: 2,
        point: 0.01,
        next_from: null,
      };
    };
    return Object.assign(fetchJson, { seen });
  }

  test('Seiten werden über next_from verbunden, Fehlendes bleibt sichtbar, unbekannter Spread ist NaN', { tag: '@BKT-04' }, async () => {
    const fetchJson = pages();
    const rates = await loadRates({ fetchJson, accountId: 'acc 1', symbol: 'XAUUSD', timeframe: 'M1', from: 0, to: 300, source: 'csv:abc' });
    expect(Array.from(rates.t)).toEqual([0, 60, 180, 240]);
    expect(Array.from(rates.c)).toEqual([11, 12, 13, 14]);
    expect(Array.from(rates.s).map((v) => (Number.isNaN(v) ? 'nan' : v))).toEqual([20, 21, 'nan', 22]);
    expect(rates.t).toBeInstanceOf(Float64Array);
    expect(rates.missing).toEqual([{ from: 120, to: 180, reason: 'unavailable', checked_at: 1 }]);
    expect(rates.point).toBe(0.01);
    // Anfragen: zweite Seite ab next_from, Quelle und Konto kodiert
    const seen = (fetchJson as unknown as { seen: string[] }).seen;
    expect(seen).toEqual([
      '/market/acc%201/rates?symbol=XAUUSD&timeframe=M1&from=0&to=300&source=csv%3Aabc',
      '/market/acc%201/rates?symbol=XAUUSD&timeframe=M1&from=120&to=300&source=csv%3Aabc',
    ]);
  });

  test('mehr Kerzen als das Limit: Abbruch mit Meldung', { tag: '@BKT-04' }, async () => {
    await expect(
      loadRates({ fetchJson: pages(), accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 300, maxCandles: 3 }),
    ).rejects.toMatchObject({ code: 'run.tooManyCandles', params: { limit: 3 } });
  });

  test('Zeit nicht streng steigend oder Spalten ungleich lang: Abbruch', { tag: '@BKT-04' }, async () => {
    const same = async () => ({ t: [0, 0], o: [1, 1], h: [1, 1], l: [1, 1], c: [1, 1], next_from: null });
    await expect(loadRates({ fetchJson: same, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 300 })).rejects.toMatchObject({
      code: 'run.ratesNotAscending',
    });
    const short = async () => ({ t: [0, 60], o: [1], h: [1, 1], l: [1, 1], c: [1, 1], next_from: null });
    await expect(loadRates({ fetchJson: short, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 300 })).rejects.toMatchObject({
      code: 'run.badRatesResponse',
    });
  });

  test('die laufende Kerze (live_from) zählt nicht, Kerzen vor from werden abgeschnitten', { tag: '@BKT-04' }, async () => {
    const fetchJson = async () => ({
      t: [0, 60, 120],
      o: [1, 2, 3],
      h: [1, 2, 3],
      l: [1, 2, 3],
      c: [1, 2, 3],
      s: [5, 6, 7],
      live_from: 120,
      next_from: null,
    });
    const rates = await loadRates({ fetchJson, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 60, to: 300 });
    expect(Array.from(rates.t)).toEqual([60]);
    expect(Array.from(rates.s)).toEqual([6]);
    expect(rates.liveFrom).toBe(120);
  });

  test('ungültiger Zeitraum und missing, das keine Liste ist: Abbruch mit Code', { tag: '@BKT-04' }, async () => {
    const page = async () => ({ t: [], o: [], h: [], l: [], c: [], missing: 'x', next_from: null });
    await expect(loadRates({ fetchJson: page, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 300 })).rejects.toMatchObject({
      code: 'run.badRatesResponse',
    });
    await expect(loadRates({ fetchJson: page, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 300, to: 300 })).rejects.toMatchObject({
      code: 'run.badRange',
    });
  });

  test('next_from, der nicht vorwärts geht, bricht ab statt endlos zu laden', { tag: '@BKT-04' }, async () => {
    const stuck = async () => ({ t: [], o: [], h: [], l: [], c: [], next_from: 0 });
    await expect(loadRates({ fetchJson: stuck, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 300 })).rejects.toMatchObject({
      code: 'run.badRatesResponse',
    });
  });
});

test.describe('Höhere Zeitrahmen und Kerzenpfad', () => {
  const bar = (time: number, open: number, high: number, low: number, close: number) => ({ time, open, high, low, close });

  test('M5 aus M1: nur abgeschlossene Kerzen plus der bisherige Weg der laufenden', { tag: '@BKT-04' }, () => {
    const m5 = new TimeframeAggregator(300);
    // Fünf M1-Kerzen der M5-Kerze ab 0 und die erste der nächsten (300)
    m5.push(bar(0, 10, 11, 9, 10.5));
    m5.push(bar(60, 10.5, 12, 10, 11));
    m5.push(bar(120, 11, 11.5, 8, 9));
    m5.push(bar(180, 9, 10, 8.5, 9.5));
    m5.push(bar(240, 9.5, 10.5, 9, 10));
    m5.push(bar(300, 10, 10.2, 9.8, 10.1));
    // Laufende M1-Kerze (360) hat bis jetzt Hoch 10,4, Tief 10,0, aktuell 10,3
    const rates = m5.rates(bar(360, 10.1, 10.4, 10, 10.3), 0, 10)!;
    expect(rates.map((r) => [r.time, r.open, r.high, r.low, r.close])).toEqual([
      [0, 10, 12, 8, 10], // Hoch 12 (Minute 2), Tief 8 (Minute 3), Schluss der letzten Minute
      [300, 10, 10.4, 9.8, 10.3], // Eröffnung der ersten Minute, Tief 9,8, Hoch 10,4 aus dem bisherigen Weg
    ]);
    // Position 1, 1 Stück: die letzte abgeschlossene Kerze
    expect(m5.rates(bar(360, 10.1, 10.4, 10, 10.3), 1, 1)!.map((r) => r.time)).toEqual([0]);
  });

  test('die laufende Kerze eines Zeitrahmens ändert die abgeschlossenen nicht (kein Blick in die Zukunft)', { tag: '@BKT-04' }, () => {
    const m5 = new TimeframeAggregator(300);
    m5.push(bar(0, 10, 11, 9, 10.5));
    m5.push(bar(300, 10.5, 10.8, 10.2, 10.6)); // die M5-Kerze ab 0 ist damit abgeschlossen
    const calm = m5.rates(bar(360, 10.6, 10.7, 10.5, 10.6), 0, 5)!;
    // Ein späterer, ganz anderer Weg der laufenden Kerze ändert die abgeschlossene nicht
    const wild = m5.rates(bar(360, 10.6, 99, 1, 98), 0, 5)!;
    expect(calm[0]).toMatchObject({ time: 0, open: 10, high: 11, low: 9, close: 10.5 });
    expect(wild[0]).toEqual(calm[0]);
    expect(calm[1]).toMatchObject({ time: 300, open: 10.5, high: 10.8, low: 10.2, close: 10.6 });
    expect(wild[1]).toMatchObject({ time: 300, open: 10.5, high: 99, low: 1, close: 98 });
  });

  test('ohne Kerzen gibt es null; der Speicher behält nur die letzten Kerzen', { tag: '@BKT-04' }, () => {
    const empty = new TimeframeAggregator(300);
    expect(empty.rates(null, 0, 5)).toBeNull();
    const small = new TimeframeAggregator(60, 3);
    for (let i = 0; i < 20; i++) small.push(bar(i * 60, i, i + 1, i, i));
    const got = small.rates(null, 0, 100)!;
    expect(got[got.length - 1].time).toBe(19 * 60);
    expect(got.length).toBeLessThanOrEqual(7);
  });

  test('Kerzenpfad: steigend Eröffnung→Tief→Hoch→Schluss, fallend Eröffnung→Hoch→Tief→Schluss', { tag: '@BKT-04' }, () => {
    expect(candleWaypoints(10, 12, 9, 11, 'auto')).toEqual([10, 9, 12, 11]);
    expect(candleWaypoints(11, 12, 9, 10, 'auto')).toEqual([11, 12, 9, 10]);
    // Schluss = Eröffnung zählt als steigend
    expect(candleWaypoints(10, 12, 9, 10, 'auto')).toEqual([10, 9, 12, 10]);
    // erzwungene Wege (Prüfung „beide Wege“)
    expect(candleWaypoints(10, 12, 9, 11, 'highFirst')).toEqual([10, 12, 9, 11]);
    expect(candleWaypoints(11, 12, 9, 10, 'lowFirst')).toEqual([11, 9, 12, 10]);
    // gleiche Preise nacheinander zählen einmal
    expect(candleWaypoints(10, 10, 10, 10, 'auto')).toEqual([10]);
    expect(candleWaypoints(10, 12, 10, 12, 'auto')).toEqual([10, 12]);
  });

  test('Zeit im Weg: nach Weglänge, Eröffnung am Anfang, Schluss eine Sekunde vor Kerzenende', { tag: '@BKT-04' }, () => {
    // Weg 10 → 9 → 12 → 11: Längen 1, 3, 1 (zusammen 5) auf 59 Sekunden (0…59)
    const times = waypointTimes([10, 9, 12, 11], 0, 59);
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(11.8, 12);
    expect(times[2]).toBeCloseTo(47.2, 12);
    expect(times[3]).toBe(59);
    expect(waypointTimes([10], 600, 659)).toEqual([600]);
    // Der Schluss liegt exakt auf dem Ende, auch wenn die Teilung nicht aufgeht
    const real = waypointTimes([2650, 2650.3, 2648.4, 2648.6], 1_791_367_200, 1_791_367_259);
    expect(real[3]).toBe(1_791_367_259);
    expect(real[1]).toBeCloseTo(1_791_367_200 + (59 * 0.3) / 2.4, 6);
  });
});

test.describe('Laufprotokoll', () => {
  test('Zähler je Code, Zeilenlimit mit Rest-Zähler', { tag: '@BKT-04' }, () => {
    const log = new RunLog();
    log.add('INFO', 'a', { x: 1 }, 5);
    log.add('WARN', 'b');
    log.add('INFO', 'a');
    expect(log.lines).toEqual([
      { level: 'INFO', code: 'a', params: { x: 1 }, time: 5 },
      { level: 'WARN', code: 'b', params: undefined, time: undefined },
      { level: 'INFO', code: 'a', params: undefined, time: undefined },
    ]);
    expect(log.counts).toEqual({ a: 2, b: 1 });
    for (let i = 0; i < RUN_LOG_MAX_LINES; i++) log.add('INFO', 'many');
    expect(log.lines).toHaveLength(RUN_LOG_MAX_LINES);
    expect(log.dropped).toBe(3);
    expect(log.counts.many).toBe(RUN_LOG_MAX_LINES);
  });
});
