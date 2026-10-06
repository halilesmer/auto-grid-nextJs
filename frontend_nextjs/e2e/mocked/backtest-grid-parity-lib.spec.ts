/**
 * Bot-Nachbau Grid im Browser (Backtest B2), ohne Browserseite: die TypeScript-Engine
 * (src/lib/backtest/engine/) mit dem simulierten Broker (src/lib/backtest/broker/simBroker.ts, Parität)
 * muss für jedes Grid-, Ausstiegs- und Sofort-Einstieg-Szenario dieselbe Ereignisfolge liefern wie der
 * Python-Bot (Golden-Dateien aus BKT-01, worker_python/tests/parity/golden).
 * BKT-02 Bot-Nachbau Grid im Browser
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pyRound } from '../../src/lib/backtest/engine/pyRound';
import {
  firstDifference,
  isFractalScenario,
  loadGolden,
  loadScenario,
  PARITY_DIR,
  runScenario,
  scenarioNames,
} from '../fixtures/parity';

/** Fraktal-Szenarien folgen mit B3 (BKT-03) */
const GRID_SCENARIOS = scenarioNames().filter((name) => !isFractalScenario(loadScenario(name)));

test.describe('BKT-02 Bot-Nachbau Grid', () => {
  test('Genau die 13 Grid-, Ausstiegs- und Sofort-Einstieg-Szenarien', { tag: '@BKT-02' }, () => {
    // Ein neues Szenario in make_scenarios.py fällt hier auf und braucht eine bewusste Entscheidung
    expect(GRID_SCENARIOS).toHaveLength(13);
    expect(GRID_SCENARIOS.every((n) => /^(grid_|exit_|instant_)/.test(n))).toBe(true);
  });

  for (const name of GRID_SCENARIOS) {
    test(`Ereignisfolge gleicht der Musterlösung: ${name}`, { tag: '@BKT-02' }, () => {
      const events = runScenario(loadScenario(name));
      const golden = loadGolden(name);
      expect(events.some((e) => e.ev === 'place' || e.ev === 'market'), 'Szenario ohne Bot-Aktion prüft nichts').toBe(true);
      expect(firstDifference(events, golden), name).toBeNull();
      expect(events).toEqual(golden);
    });
  }

  test('Zweimal abgespielt ergibt dieselbe Folge (kein Zustand zwischen Läufen)', { tag: '@BKT-02' }, () => {
    const scenario = loadScenario('instant_entry');
    expect(runScenario(scenario)).toEqual(runScenario(scenario));
  });

  test('Der Backtest speichert nie eine Zone (Regel 1 des Plans)', { tag: '@BKT-02' }, () => {
    const root = path.resolve(__dirname, '../../src/lib/backtest');
    const files = fs.readdirSync(root, { recursive: true, encoding: 'utf-8' }).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const code = fs.readFileSync(path.join(root, file), 'utf-8');
      expect(code, file).not.toMatch(/mergeAndSaveSettings|\/settings\b|@\/store\/use/);
    }
  });

  test('pyRound gleicht Pythons round() in allen Grenzfällen', { tag: '@BKT-02' }, () => {
    const cases = JSON.parse(fs.readFileSync(path.join(PARITY_DIR, 'golden', 'pyround.json'), 'utf-8')) as [number, number, number][];
    expect(cases.length).toBeGreaterThan(20);
    for (const [x, ndigits, expected] of cases) {
      // Object.is: auch -0.0 (round(-0.5, 0)) muss stimmen
      expect(Object.is(pyRound(x, ndigits), expected), `round(${x}, ${ndigits}) = ${expected}`).toBe(true);
    }
    // Ohne Stellen liefert Python eine ganze Zahl, nie -0
    expect(Object.is(pyRound(-0.4), 0)).toBe(true);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
  });
});
