/** BKT-11 / BKT-12: spread_guard läuft durch Preset und Zonentransfer; BKT-15: Uhrzeiten im Preset. */
import { expect, test } from '@playwright/test';
import { parsePresetData, presetZone } from '../../src/lib/backtest/presets';
import { transferZone } from '../../src/lib/backtest/transferZone';
import { defaultZone } from '../../src/utils/zoneHelpers';

const GUARD = { enabled: true, mode: 'fixed', max_spread: 0.00012 } as const;
const FORM = {
  csvImportId: null, timeframe: 'M1', spreadMode: 'candle', spreadPoints: 0, commission: null, swapEnabled: true,
  startCapital: 1000, fill: 'gap', slFirst: true, path: 'auto', closeAtEnd: false, approximate: false,
};

test('presetZone behält den Spread-Schutz mit allen Unterfeldern', { tag: '@BKT-11' }, () => {
  const guard = { enabled: true, mode: 'relative', multiplier: 3, bootstrap: 'manual', initial_spread: 0.01 } as const;
  const zone = presetZone({ ...defaultZone(), symbol: 'EURUSD', spread_guard: guard });
  expect(zone.spread_guard).toEqual({ enabled: true, mode: 'relative', multiplier: 3, bootstrap: 'manual', initial_spread: 0.01 });
});

test('presetZone ohne Spread-Schutz (altes Preset) bleibt ladbar und setzt keinen', { tag: '@BKT-11' }, () => {
  const zone = presetZone({ ...defaultZone(), symbol: 'EURUSD' });
  expect('spread_guard' in zone).toBe(false);
});

test('presetZone lehnt ungültigen Spread-Schutz ab', { tag: '@BKT-11' }, () => {
  const base = { ...defaultZone(), symbol: 'EURUSD' };
  expect(() => presetZone({ ...base, spread_guard: { enabled: true, mode: 'fixed' } })).toThrow();
  expect(() => presetZone({ ...base, spread_guard: { enabled: true, mode: 'fixed', max_spread: -1 } })).toThrow();
  expect(() => presetZone({ ...base, spread_guard: { enabled: true, mode: 'fixed', max_spread: 1, foo: 1 } })).toThrow();
  expect(() => presetZone({ ...base, spread_guard: 'on' })).toThrow();
  expect(() => presetZone({ ...base, spread_guard: { enabled: false, max_spread: 1e101 } })).toThrow();
  expect(() => presetZone({ ...base, entry_mode: 'fractal', spread_guard: { enabled: true, mode: 'grid', grid_percent: 10 } })).toThrow();
});

test('parsePresetData trägt Spread-Schutz und Uhrzeiten', { tag: ['@BKT-11', '@BKT-15'] }, () => {
  const data = parsePresetData({
    version: 1, zone: { ...defaultZone(), symbol: 'EURUSD', spread_guard: GUARD }, form: FORM, appVersion: 'test',
    range: { custom: { from: '2026-10-01', to: '2026-10-07', fromTime: '08:30:00', toTime: '17:00:15' } },
  });
  expect(data.zone.spread_guard).toEqual({ enabled: true, mode: 'fixed', max_spread: 0.00012 });
  expect(data.range).toEqual({ custom: { from: '2026-10-01', to: '2026-10-07', fromTime: '08:30:00', toTime: '17:00:15' } });
});

test('Zonentransfer: Schutz des Setups gewinnt, sonst bleibt der bisherige, neue Zone ohne', { tag: '@BKT-12' }, () => {
  const previous = { ...defaultZone(), symbol: 'EURUSD', spread_guard: GUARD };
  const without = { ...defaultZone(), symbol: 'EURUSD' };
  const own = { ...defaultZone(), symbol: 'EURUSD', spread_guard: { enabled: true, mode: 'fixed', max_spread: 0.5 } } as const;
  expect(transferZone(without, previous).spread_guard).toEqual({ enabled: true, mode: 'fixed', max_spread: 0.00012 });
  expect(transferZone(own, previous).spread_guard).toEqual({ enabled: true, mode: 'fixed', max_spread: 0.5 });
  expect('spread_guard' in transferZone(without, undefined)).toBe(false);
  const gridGuard = { ...previous, spread_guard: { enabled: true, mode: 'grid', grid_percent: 10 } } as const;
  expect('spread_guard' in transferZone({ ...without, entry_mode: 'fractal' }, gridGuard)).toBe(false);
});
