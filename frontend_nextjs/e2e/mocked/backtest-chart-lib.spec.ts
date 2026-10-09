import { expect, test } from '@playwright/test';
import { buildChartData } from '../../src/lib/analysis/candles';
import { PathBroker } from '../../src/lib/backtest/broker/pathBroker';
import { buildDisplayBars } from '../../src/lib/backtest/candles/displayBars';
import type { LoadedRates } from '../../src/lib/backtest/candles/loadRates';
import { TRADE_ACTION_DEAL, ORDER_TYPE_BUY, ORDER_TYPE_SELL } from '../../src/lib/backtest/engine/types';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { DEFAULT_RUN_SETTINGS } from '../../src/lib/backtest/runSettings';
import { defaultZone } from '../../src/utils/zoneHelpers';
import { defaultState } from '../fixtures/data';

function rates(times: number[]): LoadedRates {
  return { t: Float64Array.from(times), o: Float64Array.from(times, (_, i) => 100 + i),
    h: Float64Array.from(times, (_, i) => 102 + i), l: Float64Array.from(times, (_, i) => 99 + i),
    c: Float64Array.from(times, (_, i) => 101 + i), s: new Float64Array(times.length),
    missing: [], digits: 2, point: 0.01, liveFrom: null };
}

test('Jahr M1: höchstens 50.000 vollständige Kerzen, kleinere Auflösung und unfertiges Ende ausgeschlossen', { tag: '@BKT-07' }, () => {
  const year = rates(Array.from({ length: 525600 }, (_, i) => i * 60));
  const minute = buildDisplayBars(year, 'M1', 'M1', 0, 31536000);
  expect(minute.bars).toHaveLength(50000);
  expect(minute.bars[0].time).toBe(28536000);
  expect(minute.bars.at(-1)?.time).toBe(31535940);
  expect(minute.clipped).toBe(true);
  const hour = buildDisplayBars(year, 'M1', 'H1', 0, 31535999);
  expect(hour.bars).toHaveLength(8759);
  expect(hour.bars[0]).toEqual({ time: 0, open: 100, high: 161, low: 99, close: 160 });
  expect(hour.bars.at(-1)?.time).toBe(31528800);
  expect(hour.clipped).toBe(false);
  expect(buildDisplayBars(year, 'M5', 'M1', 0, 300).bars).toEqual([]);
  expect(buildDisplayBars(year, 'M1', 'M5', 0, 299).bars).toEqual([]);
  expect(buildDisplayBars(year, 'M1', 'M5', 0, 300).bars).toEqual([{ time: 0, open: 100, high: 106, low: 99, close: 105 }]);
});

test('Fehlende Bereiche bleiben Leerstellen ohne OHLC und enden an der Replay-Grenze', { tag: '@BKT-07' }, () => {
  const data = rates([0, 60, 300, 360]);
  data.missing = [{ from: 120, to: 300, reason: 'csv_gap', checked_at: null }];
  const display = buildDisplayBars(data, 'M1', 'M1', 0, 420);
  expect(display.bars.map((b) => b.time)).toEqual([0, 60, 300, 360]);
  const chart = buildChartData(display.bars.filter((b) => b.time < 240), display.missing, 60, 240);
  expect(chart.points).toEqual([
    { time: 0, open: 100, high: 102, low: 99, close: 101 },
    { time: 60, open: 101, high: 103, low: 100, close: 102 },
    { time: 120 }, { time: 180 },
  ]);
  expect(chart.missing).toEqual([{ from: 120, to: 240, reason: 'csv_gap', checked_at: null, firstSlot: 120, lastSlot: 180 }]);
});

for (const side of ['buy', 'sell'] as const) {
  test(`${side}: MFE/MAE enthält den Spread beim Einstieg und nur den gehaltenen Weg`, { tag: '@BKT-07' }, () => {
    const info = { name: 'TEST', point: 0.01, digits: 2, volume_min: 0.01, volume_max: 50, volume_step: 0.01,
      trade_stops_level: 0, trade_contract_size: 100, trade_tick_size: 0.01, trade_tick_value: 1 };
    const broker = new PathBroker({ info, costs: { point: 0.01, digits: 2, tickSize: 0.01, tickValueProfit: 1, tickValueLoss: 1.05, swap: null },
      start: 0, firstBid: 100, fill: 'gap', commissionPerLot: 0, slFirst: false, timeframes: [], zoneLabel: () => null });
    broker.beginCandle(0, 100, 20);
    broker.setMarket(100, 0);
    broker.orderSend({ action: TRADE_ACTION_DEAL, symbol: 'TEST', type: side === 'buy' ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,
      volume: 0.1, price: side === 'buy' ? 100.2 : 100, magic: 200001 });
    broker.setMarket(side === 'buy' ? 100.1 : 99.9, 10);
    broker.setMarket(side === 'buy' ? 102 : 98, 20);
    broker.closeAll();
    broker.setMarket(side === 'buy' ? 200 : 1, 30); // nach Ausstieg darf nichts mehr einfließen
    const excursion = broker.excursions[broker.trades[0].id];
    expect(excursion.ok).toBe(true);
    if (!excursion.ok) throw new Error('Ausflug fehlt');
    expect(excursion.mfe).toBeCloseTo(1.8, 10);
    expect(excursion.mae).toBeCloseTo(0.2, 10);
    expect(excursion.mfePts).toBeCloseTo(180, 10);
    expect(excursion.maePts).toBeCloseTo(20, 10);
    expect(excursion.mfeMoney).toBeCloseTo(18, 10);
    expect(excursion.maeMoney).toBeCloseTo(2.1, 10);
  });
}

test('Chart-Antworten gehören zu Lauf, Setup und neuester Anfrage; nach Kontowechsel sind sie ungültig', { tag: '@BKT-07' }, () => {
  useBacktestStore.setState({ accountId: null, sequence: 0, setups: [], runs: {}, activeId: null });
  const store = () => useBacktestStore.getState();
  store().clearUnless('mock');
  const id = store().add({ zone: defaultZone(), form: { ...DEFAULT_RUN_SETTINGS }, range: { preset: 'last7' }, unsaved: false })!;
  const runId = store().begin('mock', { setupId: id, currency: 'USD', unsaved: false, params: {
    accountId: 'mock', zone: {}, symbol: defaultState().symbols[0], from: 0, to: 600, dataTimeframe: 'M1',
    spread: { mode: 'fixed', points: 20 }, commissionPerLot: 0, swapEnabled: false, approximate: false,
    model: { fill: 'gap', slFirst: false, closeAtEnd: false }, path: 'auto',
  } })!;
  store().receive(id, { type: 'result', runId, results: [] });
  store().expectChartRequest(id, 2);
  const message = { type: 'bars' as const, runId, requestId: 2, timeframe: 'M1' as const,
    bars: [{ time: 0, open: 1, high: 2, low: 0, close: 1 }], missing: [], clipped: false };
  store().receive(id, { ...message, runId: runId - 1 });
  store().receive(id, { ...message, requestId: 1 });
  store().receive('other-setup', message);
  expect(store().runs[id].chartData).toBeNull();
  store().receive(id, message);
  expect(store().runs[id].chartData?.bars).toEqual([{ time: 0, open: 1, high: 2, low: 0, close: 1 }]);
  store().clearUnless('other-account');
  store().receive(id, message);
  expect(store().runs).toEqual({});
});
