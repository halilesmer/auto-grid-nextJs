/**
 * Gewinn-Umrechnung zum Kurs des Schließens (BKT-28, Plan 1112-K9): Paarwahl aus der Symbolliste, Kurs je Zeit
 * (Bid/Ask, Lücke, 4-Tage-Grenze) und Gewinn im Broker (direkt, umgekehrt, Symbol selbst, Schnappschuss).
 * Alle Zahlen von Hand gerechnet.
 */
import { expect, test } from '@playwright/test';
import { MAX_RATE_AGE_SEC, pickConversionPair, rateAt, type RateSeries } from '../../src/lib/backtest/broker/conversion';
import { profitOf, swapPerNight, type SymbolCosts } from '../../src/lib/backtest/broker/costs';
import { PathBroker } from '../../src/lib/backtest/broker/pathBroker';
import { ORDER_TYPE_BUY, ORDER_TYPE_SELL, TRADE_ACTION_DEAL, type SymbolInfo } from '../../src/lib/backtest/engine/types';
import type { SymbolDetail } from '../../src/store/types';
import { defaultState } from '../fixtures/data';

const sym = (name: string, base: string, profit: string, extra: Partial<SymbolDetail> = {}): SymbolDetail =>
  ({ ...defaultState().symbols[0], name, currency_base: base, currency_profit: profit, currency_margin: base, trade_calc_mode: 0, ...extra }) as SymbolDetail;

const LIST = [sym('EURUSD', 'EUR', 'USD'), sym('USDCHF', 'USD', 'CHF'), sym('USDJPY', 'USD', 'JPY'), sym('GER40', 'EUR', 'EUR', { trade_calc_mode: 2 })];

test('Paarwahl: direkt, umgekehrt, Symbol selbst, keins; ohne Namensraten', { tag: '@BKT-28' }, () => {
  const pick = (name: string, profit: string) => pickConversionPair(LIST, sym(name, 'XXX', profit), 'USD');
  expect(pick('GER40', 'EUR')).toEqual({ kind: 'pair', name: 'EURUSD', invert: false });
  expect(pick('EURCHF', 'CHF')).toEqual({ kind: 'pair', name: 'USDCHF', invert: true });
  expect(pickConversionPair(LIST, LIST[2], 'USD')).toEqual({ kind: 'self', name: 'USDJPY', invert: true });
  expect(pick('EURUSD', 'USD')).toEqual({ kind: 'none', name: '', invert: false });
  expect(pick('XAUZZZ', 'ZZZ')).toBeNull();
  // Konto ohne Währungsangabe oder älterer Worker ohne currency_base: kein Paar
  expect(pickConversionPair(LIST, LIST[0], undefined)).toBeNull();
  expect(pickConversionPair(LIST.map((s) => ({ ...s, currency_base: '' })), sym('EURCHF', 'EUR', 'CHF'), 'USD')).toBeNull();
});

test('Paarwahl: bei mehreren Kandidaten Forex-Berechnung, dann kürzester Name', { tag: '@BKT-28' }, () => {
  const list = [sym('EURUSD.r', 'EUR', 'USD', { trade_calc_mode: 2 }), sym('EURUSDm', 'EUR', 'USD'), sym('EURUSD', 'EUR', 'USD')];
  expect(pickConversionPair(list, sym('GER40', 'XXX', 'EUR'), 'USD')?.name).toBe('EURUSD');
});

const SERIES: RateSeries = { t: [0, 60, 120], c: [1.1, 1.2, 1.3], s: [0, 20, 0], point: 0.00001 };

test('Kurs je Zeit: Kerze der Zeit, Bid für Kauf, Ask (Bid + Spread × Punkt) für Verkauf', { tag: '@BKT-28' }, () => {
  expect(rateAt(SERIES, 0, true)).toBe(1.1);
  expect(rateAt(SERIES, 119, true)).toBe(1.2);
  expect(rateAt(SERIES, 119, false)).toBeCloseTo(1.2 + 20 * 0.00001, 12);
  expect(rateAt(SERIES, 130, false)).toBe(1.3); // Spread 0 = unbekannt: Ask = Bid
});

test('Kurs je Zeit: Lücke = letzter Schlusskurs, über 4 Tage oder vor der Reihe = kein Kurs', { tag: '@BKT-28' }, () => {
  expect(rateAt(SERIES, 120 + 60 + 3 * 86400, true)).toBe(1.3);
  expect(rateAt(SERIES, 120 + 60 + MAX_RATE_AGE_SEC + 1, true)).toBeNull();
  expect(rateAt(SERIES, -1, true)).toBeNull();
});

const COSTS: SymbolCosts = { point: 0.01, digits: 2, tickSize: 0.01, contractSize: 1, tickValueProfit: 0.01, tickValueLoss: 0.01, swap: null };

test('profitOf ohne Umrechnung = Schnappschuss (unverändert); mit Umrechnung × bzw. ÷ Kurs, auf Cent', { tag: '@BKT-28' }, () => {
  // 1 Lot, +10,00 Preis, Vertragsgröße 1: 10,00 in Gewinnwährung
  expect(profitOf(COSTS, true, 1, 100, 110)).toBe(10); // Schnappschuss: 1000 Ticks × 0,01
  expect(profitOf(COSTS, true, 1, 100, 110, { rate: 1.1, invert: false, contractSize: 1 })).toBe(11);
  // CHF → USD: 1000 ÷ 0,9 = 1111,11
  expect(profitOf({ ...COSTS, tickSize: 0.00001, contractSize: 100000 }, true, 1, 0.95, 0.96, { rate: 0.9, invert: true, contractSize: 100000 })).toBe(1111.11);
  // Verlust: −0,5 × 100000 = −50000 JPY ÷ 150,5 = −332,23
  expect(profitOf({ ...COSTS, tickSize: 0.001, contractSize: 100000 }, true, 1, 151, 150.5, { rate: 150.5, invert: true, contractSize: 100000 })).toBe(-332.23);
});

test('swapPerNight: Modus Punkte zum Kurs umgerechnet, Modus Geld unverändert', { tag: '@BKT-28' }, () => {
  const points = { mode: 1 as const, long: -5, short: 2, rollover3days: 3 };
  // −5 Punkte × 0,01 × 1 Vertrag × 2 Lot = −0,10 in Gewinnwährung × 1,1 = −0,11
  expect(swapPerNight(points, COSTS, true, 2, { rate: 1.1, invert: false, contractSize: 1 })).toBeCloseTo(-0.11, 12);
  expect(swapPerNight({ ...points, mode: 4 }, COSTS, true, 2, { rate: 1.1, invert: false, contractSize: 1 })).toBe(-10);
});

const INFO: SymbolInfo = { name: 'TEST', point: 0.01, digits: 2, volume_min: 0.01, volume_max: 50, volume_step: 0.01, trade_stops_level: 0,
  trade_contract_size: 1, trade_tick_size: 0.01, trade_tick_value: 0.01, trade_calc_mode: 2 };

/** Eine Position: Einstieg zum Marktpreis, Ausstieg per closeAll zur Zeit `exitAt`; liefert Gewinn und Zähler */
function roundTrip(options: { side: 'buy' | 'sell'; exit: number; exitAt: number; conversion?: ConstructorParameters<typeof PathBroker>[0]['conversion']; info?: SymbolInfo }) {
  const broker = new PathBroker({
    info: options.info ?? INFO, costs: COSTS, start: 0, firstBid: 100, fill: 'gap', commissionPerLot: 0, slFirst: false,
    timeframes: [], zoneLabel: () => null, conversion: options.conversion,
  });
  broker.beginCandle(0, 100, 0);
  broker.setMarket(100, 0);
  broker.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'TEST', type: options.side === 'buy' ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, volume: 1, price: 100, magic: 200001 });
  broker.setMarket(options.exit, options.exitAt);
  broker.closeAll();
  return { profit: broker.trades[0].profit, fallbacks: broker.convFallbacks };
}

test('Broker: direktes Paar, Kauf nimmt den Bid des Schließmoments (110 − 100 = 10 EUR × 1,2 = 12,00)', { tag: '@BKT-28' }, () => {
  const r = roundTrip({ side: 'buy', exit: 110, exitAt: 70, conversion: { pair: { kind: 'pair', name: 'EURUSD', invert: false }, series: SERIES } });
  expect(r.profit).toBe(12);
  expect(r.fallbacks).toBe(0);
});

test('Broker: Verkauf nimmt den Ask (Kerze 60: 1,2 + 20 × 0,00001 = 1,2002; 10 × 1,2002 = 12,00)', { tag: '@BKT-28' }, () => {
  const r = roundTrip({ side: 'sell', exit: 90, exitAt: 70, conversion: { pair: { kind: 'pair', name: 'EURUSD', invert: false }, series: SERIES } });
  expect(r.profit).toBe(12);
});

test('Broker: umgekehrtes Paar teilt (10 ÷ 1,25 = 8,00)', { tag: '@BKT-28' }, () => {
  const series: RateSeries = { t: [0], c: [1.25], s: [0], point: 0.00001 };
  expect(roundTrip({ side: 'buy', exit: 110, exitAt: 30, conversion: { pair: { kind: 'pair', name: 'USDCHF', invert: true }, series } }).profit).toBe(8);
});

test('Broker: Paar = Symbol selbst nimmt den Preis des Deals (10 ÷ 110 = 0,09)', { tag: '@BKT-28' }, () => {
  expect(roundTrip({ side: 'buy', exit: 110, exitAt: 30, conversion: { pair: { kind: 'self', name: 'TEST', invert: true }, series: null } }).profit).toBe(0.09);
});

test('Broker: Kurs älter als 4 Tage = Schnappschuss (10,00) und der Zähler steigt', { tag: '@BKT-28' }, () => {
  const old: RateSeries = { t: [0], c: [1.5], s: [0], point: 0.00001 };
  const r = roundTrip({ side: 'buy', exit: 110, exitAt: 60 + MAX_RATE_AGE_SEC + 10, conversion: { pair: { kind: 'pair', name: 'EURUSD', invert: false }, series: old } });
  expect(r.profit).toBe(10);
  expect(r.fallbacks).toBe(1);
});

test('Broker: ohne Umrechnung oder mit Gewinnwährung = Konto bleibt der Gewinn der Schnappschuss', { tag: '@BKT-28' }, () => {
  expect(roundTrip({ side: 'buy', exit: 110, exitAt: 30 }).profit).toBe(10);
  expect(roundTrip({ side: 'buy', exit: 110, exitAt: 30, conversion: { pair: { kind: 'none', name: '', invert: false }, series: SERIES } }).profit).toBe(10);
  // Berechnungsart außerhalb von 0/2/3/4 (hier 5): Schnappschuss, kein Zähler
  const r = roundTrip({ side: 'buy', exit: 110, exitAt: 30, info: { ...INFO, trade_calc_mode: 5 }, conversion: { pair: { kind: 'pair', name: 'EURUSD', invert: false }, series: SERIES } });
  expect(r.profit).toBe(10);
  expect(r.fallbacks).toBe(0);
});
