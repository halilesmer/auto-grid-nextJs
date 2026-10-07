/**
 * Szenario-Treiber für die Paritätstests des Bot-Nachbaus (BKT-02, BKT-03): spielt ein Szenario
 * aus worker_python/tests/parity/scenarios wie worker_python/tests/parity/runner.py (run) ab und liefert
 * die Ereignisfolge im Format der Golden-Dateien.
 *
 * Je Tick (docs/analyse-regeln.md §5): erst der Markt (Füllungen, TP/SL), dann ein Bot-Durchlauf,
 * danach `active`, wenn sich die aktive Zone eines Symbols geändert hat.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SimBroker, type HistoryBar, type SimEvent, type SimSymbol } from '../../src/lib/backtest/broker/simBroker';
import { manageDynamicGrid, type ActiveZones } from '../../src/lib/backtest/engine/orchestrator';
import { EngineState } from '../../src/lib/backtest/engine/state';
import type { Timeframe, ZoneDict } from '../../src/lib/backtest/engine/types';

export const PARITY_DIR = path.resolve(__dirname, '../../../worker_python/tests/parity');

export interface Scenario {
  name: string;
  description: string;
  symbol: SimSymbol;
  start: number;
  zones: ZoneDict[];
  history: Partial<Record<Timeframe, HistoryBar[]>>;
  ticks: [number, number][];
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

export function scenarioNames(): string[] {
  return fs
    .readdirSync(path.join(PARITY_DIR, 'scenarios'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function loadScenario(name: string): Scenario {
  return readJson<Scenario>(path.join(PARITY_DIR, 'scenarios', `${name}.json`));
}

export function loadGolden(name: string): SimEvent[] {
  return readJson<SimEvent[]>(path.join(PARITY_DIR, 'golden', `${name}.json`));
}

/** Szenario mit Fraktal-Zone (BKT-03, e2e/mocked/backtest-fractal-parity-lib.spec.ts) */
export function isFractalScenario(scenario: Scenario): boolean {
  return scenario.zones.some((z) => z.entry_mode === 'fractal');
}

function sameZones(a: ActiveZones, b: ActiveZones): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Spielt das Szenario mit frischem Bot-Zustand ab; Rückgabe: Ereignisfolge */
export function runScenario(input: Scenario): SimEvent[] {
  const scenario: Scenario = structuredClone(input);
  const broker = new SimBroker({
    symbol: scenario.symbol,
    start: scenario.start,
    firstBid: scenario.ticks[0][1],
    history: scenario.history,
  });
  const state = new EngineState(() => broker.now);
  const infos = broker.symbolInfos();
  let active: ActiveZones = {};
  let shown: ActiveZones = {};
  scenario.ticks.forEach(([dt, bid], i) => {
    broker.marketStep(i, dt, scenario.start + dt, bid);
    [, active] = manageDynamicGrid(broker, scenario.zones, active, infos, state);
    if (!sameZones(active, shown)) {
      shown = { ...active };
      const zones = Object.fromEntries(Object.keys(shown).sort().map((k) => [k, shown[k]]));
      broker.emit('active', { zones });
    }
  });
  return broker.events;
}

/** Erstes abweichendes Ereignis als lesbarer Text (für die Fehlermeldung des Tests) */
export function firstDifference(actual: SimEvent[], expected: SimEvent[]): string | null {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) {
      return (
        `Ereignis #${i} weicht ab\n  erwartet: ${JSON.stringify(expected[i] ?? '—')}\n` +
        `  erhalten: ${JSON.stringify(actual[i] ?? '—')}\n  (${expected.length} erwartet, ${actual.length} erhalten)`
      );
    }
  }
  return null;
}
