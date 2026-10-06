/**
 * Bot-Nachbau Grid (B2) gegen die Musterlösungen des Python-Bots (BKT-01): jedes Grid-, Exit- und
 * Sofort-Einstieg-Szenario aus worker_python/tests/parity muss genau dieselbe Ereignisfolge geben.
 * Reine Rechnung ohne Browserseite. Die Fraktal-Szenarien folgen mit B3 (BKT-03).
 * BKT-02 Bot-Nachbau Grid im Browser
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pyRound } from '../../src/lib/backtest/engine/pyRound';
import { loadGolden, loadScenario, PARITY_DIR, runScenario, scenarioNames } from '../fixtures/parity';

const GRID_SCENARIOS = scenarioNames().filter((n) => !n.startsWith('fractal_'));

test.describe('Bot-Nachbau Grid: Parität mit dem Python-Bot', () => {
  test('alle 13 Grid-, Exit- und Sofort-Einstieg-Szenarien sind dabei', { tag: '@BKT-02' }, () => {
    expect(GRID_SCENARIOS).toHaveLength(13);
  });

  test('pyRound gleicht Pythons round() in allen Grenzfällen (pyround.json)', { tag: '@BKT-02' }, () => {
    const cases: [number, number, number][] = JSON.parse(
      readFileSync(path.join(PARITY_DIR, 'golden', 'pyround.json'), 'utf-8'),
    );
    for (const [x, n, expected] of cases) expect(pyRound(x, n), `round(${x}, ${n})`).toBe(expected);
    // round() ohne Stellen: Bankrundung
    expect([0.5, 1.5, 2.5, -1.5].map((x) => pyRound(x))).toEqual([0, 2, 2, -2]);
  });

  for (const name of GRID_SCENARIOS) {
    test(`${name}: Ereignisfolge gleich der Musterlösung`, { tag: '@BKT-02' }, () => {
      const logs: string[] = [];
      const events = runScenario(loadScenario(name), logs);
      const expected = loadGolden(name);
      const first = events.findIndex((e, i) => JSON.stringify(e) !== JSON.stringify(expected[i]));
      const at = first === -1 ? Math.min(events.length, expected.length) : first;
      expect(
        events,
        `${name}: Ereignis #${at} weicht ab\n  erwartet: ${JSON.stringify(expected[at])}\n  erhalten: ${JSON.stringify(events[at])}\n` +
          `  (${expected.length} erwartet, ${events.length} erhalten)\n  Fehler im Log: ${logs.filter((l) => l.startsWith('[ERROR]')).slice(0, 3).join(' | ')}`,
      ).toEqual(expected);
    });
  }

  test('zweimal abgespielt ergibt dieselbe Folge (kein geteilter Zustand)', { tag: '@BKT-02' }, () => {
    const scenario = loadScenario('grid_noise');
    expect(runScenario(scenario)).toEqual(runScenario(scenario));
  });
});
