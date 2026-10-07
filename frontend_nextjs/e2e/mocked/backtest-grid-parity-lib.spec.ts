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
import type { SimEvent } from '../../src/lib/backtest/broker/simBroker';
import { pyRound } from '../../src/lib/backtest/engine/pyRound';
import { defaultZone } from '../../src/utils/zoneHelpers';
import {
  firstDifference,
  isFractalScenario,
  loadGolden,
  loadScenario,
  PARITY_DIR,
  runScenario,
  scenarioNames,
} from '../fixtures/parity';

/** Fraktal-Szenarien: backtest-fractal-parity-lib.spec.ts (BKT-03) */
const GRID_SCENARIOS = scenarioNames().filter((name) => !isFractalScenario(loadScenario(name)));

/** Tick, in dem die Zone verlassen wird: die aktive Zone wird leer */
function exitTick(events: SimEvent[]): number {
  const exit = events.find((e) => e.ev === 'active' && Object.keys(e.zones as object).length === 0);
  if (!exit) throw new Error('Szenario ohne Zonenausstieg');
  return exit.i;
}

const EXIT_FIELDS = ['clear_on_exit', 'clear_exit_side', 'clear_scope', 'clear_target_side'] as const;

/** Ausstiegs-Felder einer Zone (Szenario oder UI-Standard) */
function exitFields(zone: Partial<Record<(typeof EXIT_FIELDS)[number], unknown>>): Record<string, unknown> {
  return Object.fromEntries(EXIT_FIELDS.map((k) => [k, zone[k]]));
}

/** Pending Orders des ersten Ticks mit diesem Typ, in der Reihenfolge der Folge */
function firstPlaces(events: SimEvent[], type: string): SimEvent[] {
  return events.filter((e) => e.i === 0 && e.ev === 'place' && e.type === type);
}

/** Typen der Ereignisse einer Art in einem Tick, in der Reihenfolge der Folge */
function kindsInTick(events: SimEvent[], i: number, ev: string): unknown[] {
  return events.filter((e) => e.i === i && e.ev === ev).map((e) => e.type);
}

test.describe('BKT-02 Bot-Nachbau Grid', () => {
  test('Genau die 24 Grid-, Ausstiegs- und Sofort-Einstieg-Szenarien', { tag: '@BKT-02' }, () => {
    // Ein neues Szenario in make_scenarios.py fällt hier auf und braucht eine bewusste Entscheidung
    expect(GRID_SCENARIOS).toHaveLength(24);
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

  // Wächter (B2.1): jedes Szenario aus den Lücken G1–G7 erreicht wirklich seinen Pfad in der Musterlösung
  test('Die Ausstiegs-Felder der UI-Szenarien gleichen dem Standard einer neuen Zone', { tag: '@BKT-02' }, () => {
    const ui = exitFields(defaultZone());
    expect(exitFields(loadScenario('exit_ui_default_up').zones[0])).toEqual(ui);
    expect(exitFields(loadScenario('exit_ui_default_down').zones[0])).toEqual(ui);
  });

  test('UI-Standard, Ausstieg nach oben: kein Löschen im Ausstiegs-Tick, die Orders löscht der nächste Tick', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('exit_ui_default_up');
    const k = exitTick(golden);
    expect(kindsInTick(golden, k, 'cancel')).toEqual([]);
    expect(kindsInTick(golden, k + 1, 'cancel')).toEqual(['BUY_LIMIT', 'BUY_LIMIT', 'BUY_LIMIT', 'BUY_LIMIT']);
  });

  test('UI-Standard, Ausstieg nach unten: erst nur BUY-Orders, die SELL-Orders im nächsten Tick', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('exit_ui_default_down');
    const k = exitTick(golden);
    expect(kindsInTick(golden, k, 'cancel')).toEqual(['BUY_STOP', 'BUY_STOP', 'BUY_STOP', 'BUY_STOP']);
    expect(kindsInTick(golden, k + 1, 'cancel')).toEqual(['SELL_LIMIT', 'SELL_LIMIT', 'SELL_LIMIT', 'SELL_LIMIT']);
  });

  test('Ausstieg nach oben, alles schließen, nur SELL: BUY-Positionen bleiben offen', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('exit_up_sell_only_all');
    const k = exitTick(golden);
    expect(kindsInTick(golden, k, 'close')).toEqual(Array(8).fill('SELL'));
    expect(golden.some((e) => e.ev === 'exit' && e.type === 'BUY' && e.i > k)).toBe(true);
  });

  test('Stops Level: TP der Order verschoben, die Order bleibt stehen (keine Order-Flut)', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('grid_stops_level');
    // TP 0,03 → mindestens 50 Points (0,05) Abstand zum Orderpreis
    expect(golden[0]).toMatchObject({ ev: 'place', type: 'BUY_LIMIT', price: 96.9, tp: 96.95 });
    // Die Order mit verschobenem TP wird nicht gelöscht und neu gesetzt, sondern gefüllt
    const first = golden.filter((e) => e.type === 'BUY_LIMIT' && e.price === 96.9).map((e) => e.ev);
    expect(first.slice(0, 2)).toEqual(['place', 'fill']);
    // Vor dem Fix (docs/journal/2026-10-06-stops-level-order-flood.md): 131 Cancels, 19 Füllungen
    expect(golden.filter((e) => e.ev === 'cancel')).toHaveLength(23);
    expect(golden.filter((e) => e.ev === 'fill')).toHaveLength(34);
  });

  test('step_by_loss rechnet mit Tick-Wert und Lot je Seite (nicht mit der Kontraktgröße)', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('grid_step_by_loss_tick_value');
    const buy = firstPlaces(golden, 'BUY_LIMIT');
    const sell = firstPlaces(golden, 'SELL_LIMIT');
    // 3,0 je 0,01 = 300 je Preiseinheit; BUY 0,01 Lot: Abstand 0,5/3 = 0,167, TP 0,4/3 = 0,133, SL 1,5/3 = 0,5
    expect(buy[0]).toMatchObject({ price: 96.86, volume: 0.01, tp: 96.993, sl: 96.36 });
    expect(buy[1]).toMatchObject({ price: 96.693 });
    // SELL 0,02 Lot: Abstand 0,5/6 = 0,083, TP 0,4/6 = 0,067, SL 1,5/6 = 0,25
    expect(sell[0]).toMatchObject({ price: 97.11, volume: 0.02, tp: 97.043, sl: 97.36 });
    expect(sell[1]).toMatchObject({ price: 97.193 });
  });

  test('max_positions 0 heißt ohne Grenze: 15 Füllungen statt höchstens 10', { tag: '@BKT-02' }, () => {
    const fills = loadGolden('grid_max_positions_unlimited').filter((e) => e.ev === 'fill');
    expect(fills).toHaveLength(15);
  });

  test('Lot unter volume_min wird angehoben, SELL-Lot rastet auf volume_step', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('grid_lot_below_min');
    expect(firstPlaces(golden, 'BUY_LIMIT')[0]).toMatchObject({ volume: 0.1 });
    expect(firstPlaces(golden, 'SELL_LIMIT')[0]).toMatchObject({ price: 97.2, volume: 0.3 });
  });

  test('Ohne Sync und mit leerem sell_lot_size nimmt SELL das BUY-Lot', { tag: '@BKT-02' }, () => {
    const sell = firstPlaces(loadGolden('grid_sell_lot_empty'), 'SELL_LIMIT');
    expect(sell[0]).toMatchObject({ price: 97.2, volume: 0.03, tp: 97.05 });
  });

  test('Mit Sync gelten für SELL Abstand, Lot, TP und SL der BUY-Seite', { tag: '@BKT-02' }, () => {
    const sell = firstPlaces(loadGolden('grid_sync_ignores_sell'), 'SELL_LIMIT');
    expect(sell[0]).toMatchObject({ price: 97.1, volume: 0.01, tp: 97.0, sl: 0 });
    expect(sell[1]).toMatchObject({ price: 97.2 });
  });

  test('Start über der Zone ohne clear_on_exit: Grid der ersten Zone läuft, kein Aufräumen', { tag: '@BKT-02' }, () => {
    const name = 'grid_start_outside_no_clear';
    const golden = loadGolden(name);
    // Bid 97,84 liegt über max_price 97,5, trotzdem setzt der Bot die oberste Stufe der Zone
    expect(loadScenario(name).ticks[3]).toEqual([15, 97.84]);
    expect(golden.find((e) => e.ev === 'place')).toMatchObject({ i: 3, type: 'BUY_LIMIT', price: 97.5 });
    expect(golden.filter((e) => e.ev === 'active')).toEqual([{ i: 0, t: 0, ev: 'active', zones: { USOUSD: 0 } }]);
  });

  test('Gespeicherte magic 200007 gilt für Orders, Kommentar und Aufräumen', { tag: '@BKT-02' }, () => {
    const golden = loadGolden('exit_stored_magic');
    expect([...new Set(golden.filter((e) => 'magic' in e).map((e) => e.magic))]).toEqual([200007]);
    expect([...new Set(golden.filter((e) => e.ev === 'place').map((e) => e.comment))]).toEqual(['AutoGrid_Z7']);
    expect(kindsInTick(golden, exitTick(golden), 'cancel')).toEqual(['BUY_LIMIT', 'BUY_LIMIT', 'BUY_LIMIT', 'BUY_LIMIT']);
  });

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
