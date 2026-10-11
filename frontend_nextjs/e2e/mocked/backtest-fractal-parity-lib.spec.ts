/**
 * Bot-Nachbau Fraktal im Browser (Backtest B3), ohne Browserseite: die TypeScript-Engine mit dem
 * simulierten Broker muss für jedes Fraktal-Szenario dieselbe Ereignisfolge liefern wie der Python-Bot
 * (Golden-Dateien aus BKT-01, worker_python/tests/parity/golden).
 * BKT-03 Bot-Nachbau Fraktal im Browser
 */
import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/lib/backtest/broker/simBroker';
import {
  firstDifference,
  isFractalScenario,
  loadGolden,
  loadScenario,
  runScenario,
  scenarioNames,
} from '../fixtures/parity';

const FRACTAL_SCENARIOS = scenarioNames().filter((name) => isFractalScenario(loadScenario(name)));

/** Bot- und Broker-Ereignisse eines Ticks als "ev TYPE preis", in der Reihenfolge der Folge */
function inTick(events: SimEvent[], i: number): string[] {
  return events.filter((e) => e.i === i && e.ev !== 'active').map((e) => `${e.ev} ${String(e.type)} ${String(e.price)}`);
}

function places(events: SimEvent[]): SimEvent[] {
  return events.filter((e) => e.ev === 'place');
}

test.describe('BKT-03 Bot-Nachbau Fraktal', () => {
  test('Genau die 16 Fraktal-Szenarien', { tag: '@BKT-03' }, () => {
    // Ein neues Szenario in make_scenarios.py fällt hier auf und braucht eine bewusste Entscheidung
    expect(FRACTAL_SCENARIOS).toHaveLength(16);
    expect(FRACTAL_SCENARIOS.every((n) => n.startsWith('fractal_'))).toBe(true);
  });

  for (const name of FRACTAL_SCENARIOS) {
    test(`Ereignisfolge gleicht der Musterlösung: ${name}`, { tag: '@BKT-03' }, () => {
      const events = runScenario(loadScenario(name));
      const golden = loadGolden(name);
      expect(events.some((e) => e.ev === 'place'), 'Szenario ohne Bot-Aktion prüft nichts').toBe(true);
      expect(firstDifference(events, golden), name).toBeNull();
      expect(events).toEqual(golden);
    });
  }

  // Wächter (B3): jedes neue Szenario erreicht wirklich seinen Pfad in der Musterlösung
  test('ENG-30 Abstand: die zweite Order wartet, bis der Kurs 0,3 gegen die Position läuft', { tag: '@BKT-03' }, () => {
    const name = 'fractal_next_loss_pips';
    const golden = loadGolden(name);
    expect(inTick(golden, 44)).toEqual(['fill BUY_STOP 97.45', 'cancel BUY_STOP 97.8']);
    // Bid 97,15: 97,45 − 97,15 ist als float 0,2999… < 0,3, erst 97,14 öffnet die Sperre
    expect(loadScenario(name).ticks.slice(85, 87)).toEqual([[1700, 97.15], [1720, 97.14]]);
    expect(golden.filter((e) => e.ev === 'place' && e.i > 0)[0]).toMatchObject({ i: 86, type: 'BUY_STOP', price: 97.8 });
  });

  test('ENG-30 Betrag: ohne Gewinn im Paritätsmodus kommt die Order erst nach dem Ausstieg wieder', { tag: '@BKT-03' }, () => {
    const golden = loadGolden('fractal_next_loss_money');
    expect(inTick(golden, 44)).toEqual(['fill BUY_STOP 97.45', 'cancel BUY_STOP 97.8']);
    expect(golden.filter((e) => e.ev === 'place' && e.i > 0 && e.i < 125)).toEqual([]);
    expect(inTick(golden, 125)).toEqual(['exit BUY 96.75', 'place BUY_STOP 97.8']);
  });

  test('Positionsgrenze: alle Fraktal-Orders weg, nach dem Ausstieg ohne das erledigte Fraktal zurück', { tag: '@BKT-03' }, () => {
    const golden = loadGolden('fractal_max_positions');
    expect(inTick(golden, 44)).toEqual([
      'fill BUY_STOP 97.45',
      'cancel BUY_STOP 97.8',
      'cancel SELL_STOP 96.6',
      'cancel SELL_STOP 96.4',
    ]);
    expect(inTick(golden, 125)).toEqual([
      'exit BUY 96.75',
      'place BUY_STOP 97.8',
      'place SELL_STOP 96.6',
      'place SELL_STOP 96.4',
    ]);
  });

  test('Rebound: Bid berührt die BUY LIMIT, der Ask nicht; die Order bleibt und füllt später', { tag: '@BKT-03' }, () => {
    const name = 'fractal_bid_touch_kept';
    const golden = loadGolden(name);
    expect(loadScenario(name).ticks[100]).toEqual([2000, 96.5]);
    expect(golden.filter((e) => e.ev === 'cancel')).toEqual([]);
    expect(golden.find((e) => e.ev === 'fill')).toMatchObject({ i: 142, type: 'BUY_LIMIT', price: 96.5 });
    expect(loadScenario(name).ticks[142]).toEqual([2840, 96.49]);
  });

  test('Stops Level: BUY STOP erst mit genug Abstand, SELL mit zu nahem TP nie', { tag: '@BKT-03' }, () => {
    const name = 'fractal_stops_level';
    const golden = loadGolden(name);
    // Tick 9: Ask 97,36, Abstand 0,09; Tick 10: Ask 97,35, Abstand als float 0,1000…09 > 0,1
    expect(loadScenario(name).ticks.slice(9, 11)).toEqual([[180, 97.35], [200, 97.34]]);
    // Ohne SL kein rr-TP; TP 1,5 als Betrag bei 0,01 Lot × 1000 = 0,15
    expect(places(golden)).toEqual([expect.objectContaining({ i: 10, type: 'BUY_STOP', price: 97.45, sl: 0, tp: 97.6 })]);
  });

  test('M1 ohne Historie: die erste Order erst nach 6 Kerzen aus den Ticks', { tag: '@BKT-03' }, () => {
    const first = places(loadGolden('fractal_live_m1'))[0];
    expect(first).toMatchObject({ i: 72, t: 360, type: 'SELL_STOP', price: 96.6 });
  });

  test('ATR fehlt: SL aus Kerze ± Puffer wie im Puffer-Modus, rr 0 ohne TP', { tag: '@BKT-03' }, () => {
    const fallback = places(loadGolden('fractal_atr_fallback')).slice(0, 2);
    const buffer = places(loadGolden('fractal_breakout_buffer')).slice(0, 2);
    expect(fallback.map((e) => [e.type, e.price, e.sl, e.tp])).toEqual([
      ['BUY_STOP', 97.6, 96.75, 0],
      ['SELL_STOP', 96.5, 97.35, 0],
    ]);
    expect(fallback.map((e) => e.sl)).toEqual(buffer.map((e) => e.sl));
  });

  test('Ungültiger SL: das ältere Fraktal bleibt ohne Order, kein Nachrücken', { tag: '@BKT-03' }, () => {
    const golden = loadGolden('fractal_sl_invalid');
    expect(places(golden)).toEqual([expect.objectContaining({ i: 0, type: 'BUY_LIMIT', price: 96.6, sl: 96.06 })]);
  });

  test('Füllung erledigt das Fraktal, auch wenn die Bid-Kerzen es nicht erreichen', { tag: '@BKT-03' }, () => {
    const name = 'fractal_done_after_fill';
    const golden = loadGolden(name);
    // Bid höchstens 97,44, der Ask 97,45 füllt die BUY STOP
    expect(Math.max(...loadScenario(name).ticks.slice(0, 45).map(([, bid]) => bid))).toBe(97.44);
    expect(inTick(golden, 44)).toEqual(['fill BUY_STOP 97.45']);
    expect(inTick(golden, 113)).toEqual(['exit BUY 96.75']);
    expect(places(golden).filter((e) => e.price === 97.45)).toHaveLength(1);
    // rr 1,5: TP = 97,45 + 1,5 × (97,45 − 96,75)
    expect(places(golden)[0]).toMatchObject({ sl: 96.75, tp: 98.5 });
  });

  test('BOTH ohne Sync: eigene SELL-Anzahl und SELL-Lot, Fraktal über max_price ohne Order', { tag: '@BKT-03' }, () => {
    const golden = loadGolden('fractal_sell_count_range');
    expect(places(golden).filter((e) => e.i === 0).map((e) => [e.type, e.price, e.volume])).toEqual([
      ['BUY_STOP', 97.45, 0.01],
      ['SELL_STOP', 96.6, 0.02],
    ]);
  });

  test('Zweimal abgespielt ergibt dieselbe Folge (kein Zustand zwischen Läufen)', { tag: '@BKT-03' }, () => {
    const scenario = loadScenario('fractal_max_positions');
    expect(runScenario(scenario)).toEqual(runScenario(scenario));
  });
});

for (const name of ['fractal_next_loss_forex', 'fractal_next_loss_ticks']) {
  test(`ENG-30 echte Einheiten öffnen exakt an der Grenze: ${name}`, { tag: ['@ENG-30', '@BKT-03'] }, () => {
    const events = runScenario(loadScenario(name));
    expect(events).toEqual(loadGolden(name));
    expect(events.find((event) => event.ev === 'place' && event.i > 44)).toMatchObject({ i: 85, type: 'BUY_STOP' });
  });
}

test('ENG-30 unbekannte Instrumentklasse blockiert neue Abstandseinheiten im Backtest', { tag: '@ENG-30' }, () => {
  const scenario = loadScenario('fractal_next_loss_ticks');
  delete scenario.symbol.trade_calc_mode;
  expect(runScenario(scenario).filter((event) => event.ev === 'place')).toEqual([]);
});
