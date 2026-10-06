/**
 * Spielt ein Szenario der Musterlösungen (worker_python/tests/parity) mit dem Bot-Nachbau ab und
 * zeichnet die Ereignisfolge auf wie tests/parity/runner.py (Recorder): je Tick erst der Markt
 * (simBroker.marketStep), dann ein Durchlauf (manageDynamicGrid); Preise auf digits + 2 gerundet.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SimBroker, type SimEvent, type SymbolSpec } from '../../src/lib/backtest/broker/simBroker';
import type { Bar } from '../../src/lib/backtest/engine/mt5';
import { manageDynamicGrid, newLoopState } from '../../src/lib/backtest/engine/orchestrator';
import { pyRound } from '../../src/lib/backtest/engine/pyRound';
import { EngineState, type EngineContext } from '../../src/lib/backtest/engine/state';
import type { Zone } from '../../src/lib/backtest/engine/zoneMagic';

export const PARITY_DIR = path.join(__dirname, '../../../worker_python/tests/parity');

export interface Scenario {
  name: string;
  description: string;
  symbol: SymbolSpec;
  start: number;
  zones: Zone[];
  history?: Record<string, Bar[]>;
  ticks: [number, number][];
}

export type RecordedEvent = { i: number; t: number; ev: string } & Record<string, unknown>;

export function scenarioNames(): string[] {
  return readdirSync(path.join(PARITY_DIR, 'scenarios'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function loadScenario(name: string): Scenario {
  return JSON.parse(readFileSync(path.join(PARITY_DIR, 'scenarios', `${name}.json`), 'utf-8'));
}

export function loadGolden(name: string): RecordedEvent[] {
  return JSON.parse(readFileSync(path.join(PARITY_DIR, 'golden', `${name}.json`), 'utf-8'));
}

const NOT_ROUNDED = new Set(['ev', 'type', 'magic', 'comment', 'reason']);

export function runScenario(source: Scenario, logs: string[] = []): RecordedEvent[] {
  const scenario: Scenario = structuredClone(source);
  const digits = scenario.symbol.digits ?? 3;
  const r = (x: unknown) => pyRound(Number(x || 0), digits + 2);
  const events: RecordedEvent[] = [];
  let index = 0;
  let dt = 0;

  const broker = new SimBroker(scenario.symbol, {
    start: scenario.start,
    firstBid: scenario.ticks[0][1],
    history: scenario.history,
    onEvent: (e: SimEvent) => {
      const out: RecordedEvent = { i: index, t: dt, ev: e.ev };
      for (const [k, v] of Object.entries(e)) if (k !== 'ev') out[k] = NOT_ROUNDED.has(k) ? v : r(v);
      events.push(out);
    },
  });
  const ctx: EngineContext = {
    mt5: broker,
    state: new EngineState(),
    log: (msg, level = 'INFO') => logs.push(`[${level}] ${msg}`),
    now: () => broker.now,
  };
  const loop = newLoopState({ [broker.symbol]: broker.info });

  let active = '{}';
  scenario.ticks.forEach(([t, bid], i) => {
    index = i;
    dt = t;
    broker.marketStep(scenario.start + t, bid);
    manageDynamicGrid(ctx, scenario.zones, loop);
    const sorted = Object.fromEntries(Object.entries(loop.activeZones).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (JSON.stringify(sorted) !== active) {
      active = JSON.stringify(sorted);
      events.push({ i, t, ev: 'active', zones: sorted });
    }
  });
  return events;
}
