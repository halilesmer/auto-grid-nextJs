/**
 * Chart-Tab ohne Browser (Schritt 3 des Analyse-Plans): Kerzen/Leerstellen/Pausen (src/lib/analysis/candles.ts)
 * und Grid-Stufen (src/lib/analysis/levels.ts).
 * ANA-05 Band/Stufen · ANA-11 Marktpausen und fehlende Daten
 */
import { expect, test } from '@playwright/test';
import {
  barsOf,
  buildChartData,
  isBar,
  liveBar,
  MAX_GAP_SLOTS,
  MAX_CHART_BARS,
  mergeTail,
  OPEN_RANGE_BARS,
  ratesWindow,
  wilderRsi,
  type Bar,
} from '../../src/lib/analysis/candles';
import { zoneLevels } from '../../src/lib/analysis/levels';
import { defaultState, makeZone } from '../fixtures/data';

const M15 = 900;
const MON = Date.UTC(2026, 8, 7) / 1000; // Montag 07.09.2026 00:00 (MT5-Zeit)

function bars(from: number, to: number, step = M15): Bar[] {
  const out: Bar[] = [];
  for (let t = from; t < to; t += step) out.push({ time: t, open: 1, high: 2, low: 0.5, close: 1.5 });
  return out;
}

test.describe('ANA-11 Kerzen, fehlende Daten und Marktpausen', () => {
  test('Fehlende Bereiche werden Leerstellen ohne Preis, nie Kerzen', { tag: '@ANA-11' }, () => {
    const real = [...bars(MON, MON + 4 * 3600), ...bars(MON + 8 * 3600, MON + 10 * 3600)];
    const data = buildChartData(real, [{ from: MON + 4 * 3600, to: MON + 8 * 3600, reason: 'unavailable', checked_at: null }], M15, null);

    // Genau die gelieferten Kerzen, keine einzige dazu
    expect(data.points.filter(isBar)).toEqual(real);
    const gaps = data.points.filter((p) => !isBar(p));
    expect(gaps).toHaveLength(16); // 4 h M15
    expect(gaps.every((g) => Object.keys(g).join() === 'time')).toBe(true);
    expect(data.missing).toEqual([
      expect.objectContaining({ reason: 'unavailable', firstSlot: MON + 4 * 3600, lastSlot: MON + 8 * 3600 - M15 }),
    ]);
    // Zeiten streng steigend (lightweight-charts verlangt das)
    expect(data.points.every((p, i) => i === 0 || p.time > data.points[i - 1].time)).toBe(true);
    // Ein fehlender Bereich ist keine Pause
    expect(data.pauses).toEqual([]);
  });

  test('Lange Lücken bekommen höchstens MAX_GAP_SLOTS Leerstellen, die Zukunft fehlt nie', { tag: '@ANA-11' }, () => {
    const month = { from: MON, to: MON + 31 * 86400, reason: 'busy', checked_at: null };
    const data = buildChartData([], [month], 60, null);
    expect(data.points).toHaveLength(MAX_GAP_SLOTS);

    // Ab „jetzt“ abgeschnitten: Bereich ganz in der Zukunft verschwindet
    const now = MON + 3600;
    const clipped = buildChartData([], [{ ...month, from: MON }, { from: now + 60, to: now + 7200, reason: 'error', checked_at: null }], 60, now);
    expect(clipped.missing).toHaveLength(1);
    expect(clipped.missing[0].to).toBe(now);
  });

  test('Marktpause = Lücke zwischen zwei echten Kerzen (Wochenende, Tagespause), kurze Lücke nicht', { tag: '@ANA-11' }, () => {
    const fri = MON - 3 * 86400;
    const real = [
      ...bars(fri + 20 * 3600, fri + 21 * 3600), // Freitagabend
      ...bars(MON, MON + 3600), // Montag
      ...bars(MON + 2 * 3600, MON + 3 * 3600), // 1 h Tagespause
    ];
    // Eine fehlende M15-Kerze (keine Ticks) ist keine Pause
    real.splice(real.length - 2, 1);
    const data = buildChartData(real, [], M15, null);
    expect(data.pauses).toEqual([
      { before: fri + 21 * 3600 - M15, after: MON },
      { before: MON + 3600 - M15, after: MON + 2 * 3600 },
    ]);
  });

  test('Nachladen des Endstücks ersetzt nur ab dem Schnittpunkt', { tag: '@ANA-11' }, () => {
    const old = { bars: bars(MON, MON + 3600), missing: [{ from: MON + 3600, to: MON + 7200, reason: 'busy', checked_at: null }] };
    const from = MON + 3600 - M15;
    const tail = { bars: bars(from, MON + 2 * 3600), missing: [] };
    const merged = mergeTail(old, tail, from);
    expect(merged.bars.map((b) => b.time)).toEqual(bars(MON, MON + 2 * 3600).map((b) => b.time));
    expect(merged.missing).toEqual([]);

    // Ein alter Bereich über den Schnittpunkt hinaus endet dort; der neue gilt ab dem Schnittpunkt
    const across = { bars: [], missing: [{ from: MON, to: MON + 7200, reason: 'busy', checked_at: null }] };
    const fresh = { bars: [], missing: [{ from: MON + 1800, to: MON + 9000, reason: 'unavailable', checked_at: 1 }] };
    expect(mergeTail(across, fresh, MON + 3600).missing).toEqual([
      { from: MON, to: MON + 3600, reason: 'busy', checked_at: null },
      { from: MON + 3600, to: MON + 9000, reason: 'unavailable', checked_at: 1 },
    ]);
  });

  test('Abfragefenster: ausgerichtet, zu lange Zeiträume und „alles“ nur mit dem Ende', { tag: '@ANA-11' }, () => {
    expect(ratesWindow(MON + 100, MON + 3600 + 1, M15)).toEqual({ from: MON, to: MON + 3600 + M15, clipped: false });
    const end = MON + 400 * 86400;
    expect(ratesWindow(MON, end, 60)).toEqual({ from: end - MAX_CHART_BARS * 60, to: end, clipped: true });
    expect(ratesWindow(null, end, M15)).toEqual({ from: end - OPEN_RANGE_BARS * M15, to: end, clipped: true });
  });

  test('Ungültige Kerze wird nicht gezeichnet, sondern als fehlend gemeldet', { tag: '@ANA-11' }, () => {
    const { bars: ok, invalid } = barsOf({ t: [MON, MON + M15], o: [1, NaN], h: [2, 2], l: [0.5, 0.5], c: [1.5, 1.5] }, M15);
    expect(ok.map((b) => b.time)).toEqual([MON]);
    expect(invalid).toEqual([{ from: MON + M15, to: MON + 2 * M15, reason: 'invalid', checked_at: null }]);
  });

  test('Live-Kerze nur für die laufende oder die direkt folgende Zeitspanne', { tag: '@ANA-11' }, () => {
    const last: Bar = { time: MON, open: 1, high: 1.2, low: 0.9, close: 1 };
    expect(liveBar(last, 1.5, MON + 100, M15)).toEqual({ time: MON, open: 1, high: 1.5, low: 0.9, close: 1.5 });
    expect(liveBar(last, 1.1, MON + M15 + 5, M15)).toEqual({ time: MON + M15, open: 1.1, high: 1.1, low: 1.1, close: 1.1 });
    // Nach einer Pause (alter Preis, Markt war zu) keine erfundene Kerze
    expect(liveBar(last, 1.1, MON + 5 * M15, M15)).toBeNull();
    expect(liveBar(null, 1.1, MON, M15)).toBeNull();
  });

  test('RSI nach Wilder', { tag: '@ANA-11' }, () => {
    const up = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = wilderRsi(up, 14);
    expect(rsi.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(rsi[14]).toBe(100);
    const flat = wilderRsi(Array(20).fill(5), 14);
    expect(flat[19]).toBe(50);
  });
});

test.describe('ANA-05 Grid-Stufen wie der Bot', () => {
  // Erwartete Werte: worker_python generate_levels (grid_execution/levels.py) mit denselben Eingaben
  const details = Object.fromEntries(defaultState().symbols.map((s) => [s.name, s]));

  test('Stufen stimmen mit generate_levels überein', { tag: '@ANA-05' }, () => {
    const zone = makeZone({ magic: 200001 });
    expect(zoneLevels(zone, 97.25, [], details)).toEqual({ buy: [96.5, 96, 95.5, 97.5, 98, 98.5], sell: [] });

    const both = makeZone({ order_type: 'BOTH', sync_buy_sell: false, sell_grid_step: 0.3, sell_lot_size: 0.02 });
    expect(zoneLevels(both, 97.25, [], details).sell).toEqual([97.5, 97.8, 98.1, 96.9, 96.6, 96.3]);

    const breakout = makeZone({ order_type: 'BOTH', is_breakout: true, pullback_distance: 0.8 });
    expect(zoneLevels(breakout, 97.25, [], details)).toEqual({ buy: [98.5], sell: [96, 95.5] });

    const narrow = makeZone({ min_price: 96.9, max_price: 97.6 });
    expect(zoneLevels(narrow, 97.25, [], details)).toEqual({ buy: [97.5], sell: [] });
  });

  test('„Abstand nach Verlust“ rechnet vom letzten Einstieg, ohne Tick-Wert keine Stufen', { tag: '@ANA-05' }, () => {
    const zone = makeZone({ magic: 200001, step_by_loss: true, grid_step: 5, lot_size: 0.01 });
    const pos = [{ ticket: 5, magic: 200001, type: 0, price_open: 97.1, time: 1 }];
    expect(zoneLevels(zone, 97.25, pos, details).buy).toEqual([96.6, 96.1, 95.6, 97.6, 98.1, 98.6]);
    expect(zoneLevels(zone, 97.25, pos, {})).toEqual({ buy: [], sell: [], unavailable: 'noSymbolInfo' });
    expect(zoneLevels(makeZone({ entry_mode: 'fractal' }), 97.25, [], details).unavailable).toBe('fractal');
    expect(zoneLevels(zone, null, [], details).unavailable).toBe('noPrice');
  });

  test('Preisschritt aus der Kerzen-Antwort; ohne Preisschritt keine (falsch gerundeten) Stufen', { tag: '@ANA-05' }, () => {
    const eur = makeZone({ symbol: 'EURUSD', min_price: 1.08, max_price: 1.12, grid_step: 0.0005, levels_below: 2, levels_above: 1 });
    expect(zoneLevels(eur, 1.10012, [], {})).toEqual({ buy: [], sell: [], unavailable: 'noSymbolInfo' });
    expect(zoneLevels(eur, 1.10012, [], {}, { point: 0.00001, digits: 5 })).toEqual({ buy: [1.0995, 1.099, 1.1005], sell: [] });
  });
});
