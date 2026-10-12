/** ENG-31: Python-Golden-Folgen und Grenzen der Spread-Entscheidung im Browser. */
import { expect, test } from '@playwright/test';
import { loadGolden, loadScenario, runScenario, scenarioNames } from '../fixtures/parity';
import { tickSpread } from '../../src/lib/backtest/engine/spreadGuard';
import { EngineState } from '../../src/lib/backtest/engine/state';
import { spreadGuardError } from '../../src/lib/spreadGuardSettings';

for (const name of scenarioNames().filter((n) => n.startsWith('spread_'))) {
  test(`Spread-Schutz gleicht Python: ${name}`, { tag: '@ENG-31' }, () => {
    const events = runScenario(loadScenario(name));
    expect(events).toEqual(loadGolden(name));
    expect(events.some((e) => e.ev === 'place' || e.ev === 'market')).toBe(true);
    expect(events.some((e) => e.ev === 'cancel')).toBe(true);
  });
}

test('Frische, gleiche Grenze und defekte Kurse', { tag: '@ENG-31' }, () => {
  expect(tickSpread({ bid: 97, ask: 97.01, time: 1000, time_msc: 1000000 }, 1060, 3)).toBe(0.01);
  expect(tickSpread({ bid: 97, ask: 97.01, time: 1000, time_msc: 1000000 }, 1061, 3)).toBeNull();
  expect(tickSpread({ bid: 97, ask: 96, time: 1000, time_msc: 1000000 }, 1000, 3)).toBeNull();
  expect(tickSpread({ bid: 97, ask: NaN, time: 1000, time_msc: 1000000 }, 1000, 3)).toBeNull();
  expect(tickSpread(null, 1000, 3)).toBeNull();
});

test('Unvollständige Felder und Grid mit Fraktal werden abgelehnt', { tag: '@ENG-31' }, () => {
  expect(spreadGuardError({ spread_guard: { enabled: true, mode: 'fixed' } })).toBeTruthy();
  expect(spreadGuardError({ spread_guard: { enabled: true, mode: 'fixed', max_spread: true } })).toBeTruthy();
  expect(spreadGuardError({ entry_mode: 'fractal', spread_guard: { enabled: true, mode: 'grid', grid_percent: 10 } })).toBeTruthy();
  expect(spreadGuardError({ spread_guard: { enabled: true, mode: 'relative', multiplier: 3, bootstrap: 'manual' } })).toBeTruthy();
});


test('Manueller Start lernt auch bei gesperrtem Einstieg', { tag: '@ENG-31' }, () => {
  let now = 1000;
  const state = new EngineState(() => now);
  const guard = state.spreadGuard;
  guard.configure([{ symbol: 'TEST', magic: 200001, spread_guard: { enabled: true, mode: 'relative', multiplier: 3, bootstrap: 'manual', initial_spread: 0.001 } }], {}, state);
  for (let i = 0; i < 60; i++) {
    guard.observe(new Map([['TEST', 0.01]]), now);
    expect(guard.evaluate(200001, 0.01, now)).toBe(false);
    now += 60;
  }
  expect(guard.status.get(200001)).toMatchObject({ samples: 60, reference: 0.01, limit: 0.003, blocked: true });
});

test('Grenzgleichheit, strenge 80 Prozent und 30 Sekunden Erholung', { tag: '@ENG-31' }, () => {
  const state = new EngineState(() => 1000);
  const guard = state.spreadGuard;
  guard.configure([{ symbol: 'TEST', magic: 200001, spread_guard: { enabled: true, mode: 'fixed', max_spread: 0.01 } }], {}, state);
  expect(guard.evaluate(200001, 0.01, 0)).toBe(true);
  expect(guard.evaluate(200001, 0.02, 1)).toBe(false);
  expect(guard.evaluate(200001, 0.008, 2)).toBe(false);
  expect(guard.evaluate(200001, 0.008, 32)).toBe(false);
  expect(guard.evaluate(200001, 0.007, 33)).toBe(false);
  expect(guard.evaluate(200001, null, 62)).toBe(false);
  expect(guard.evaluate(200001, 0.007, 63)).toBe(false);
  expect(guard.evaluate(200001, 0.007, 92)).toBe(false);
  expect(guard.evaluate(200001, 0.007, 93)).toBe(true);
});
