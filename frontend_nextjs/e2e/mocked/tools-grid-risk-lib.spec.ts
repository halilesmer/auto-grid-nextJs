/**
 * Reine Rechenfälle (von Hand nachgerechnet) des Grid-Risiko-Rechners.
 * TLS-01 Grid-Risiko-Rechner
 */
import { expect, test } from '@playwright/test';
import { calcGridRisk, effectiveSwapDays, stepCount, MAX_LEVELS, type GridRiskInput } from '../../src/lib/tools/gridRisk';

const base: GridRiskInput = {
  capital: 1050, p0: 80, floor: 50, step: 0.5, lot: 0.01, contractSize: 100, leverage: 10,
  digits: 2, point: 0.01, tickValue: 1, tickSize: 0.01, swapPoints: 5, days: 50,
  marginPerLot: null, marginPrice: null, stopOutPct: null,
};

test.describe('Grid-Risiko-Rechner', { tag: '@TLS-01' }, () => {
  test('A2.1: Stufen in ganzen Rasterschritten (kein Fließkomma-Fehler)', () => {
    expect(Math.floor((50.91 - 45) / 0.03)).toBe(196); // der Fließkomma-Fehler, den die alte Rechnung hatte
    expect(stepCount(50.91, 45, 0.03, 2)).toBe(197);
    expect(stepCount(62, 50, 0.5, 3)).toBe(24);
  });

  test('A2.5: Dreifach-Swap-Tage und Swap in Geld über tick_value/tick_size', () => {
    expect(effectiveSwapDays(50)).toBe(64);
    const r = calcGridRisk({ ...base, p0: 62, floor: 50, lot: 0.01, swapPoints: -5.2, days: 7 });
    if (!r.ok) throw new Error('unerwartet');
    // 1 Position: -5,2 * 0,01 * (1/0,01) * 0,01 * 9 Tage = -0,468
    expect(r.levels[0].swap).toBeCloseTo(-0.468, 6);
    expect(r.levels[1].swap).toBeCloseTo(-0.936, 6);
  });

  test('A2.4: Margenlage bestimmt den Status; Beispiel Hebel 1:10 wird Margin Call, mit Stop-out 90 % Stop out', () => {
    const r = calcGridRisk(base);
    if (!r.ok) throw new Error('unerwartet');
    // Verlust am Dip: 100 * 0,01 * 0,5 * 60*61/2 = 915; Swap 61 * 0,05 * 64 / 64... = 61 * (5*0,01*100*0,01*64)
    expect(r.last.loss).toBeCloseTo(915, 6);
    expect(r.last.swap).toBeCloseTo(61 * 3.2, 6);
    expect(r.last.margin).toBeCloseTo(396.5, 6);
    expect(r.last.marginLevel).toBeCloseTo(((1050 - 915 + 195.2) / 396.5) * 100, 6);
    expect(r.status).toBe('marginCall');
    expect(r.firstMarginCall?.price).toBeLessThan(80);
    expect(r.firstStopOut).toBeNull();
    const strict = calcGridRisk({ ...base, stopOutPct: 90 });
    if (!strict.ok) throw new Error('unerwartet');
    expect(strict.status).toBe('stopOut');
    expect(strict.firstStopOut?.price).toBe(50);
  });

  test('A2.3: positiver Swap senkt die Last, negativer erhöht sie', () => {
    const plus = calcGridRisk({ ...base, swapPoints: 5 });
    const minus = calcGridRisk({ ...base, swapPoints: -5 });
    if (!plus.ok || !minus.ok) throw new Error('unerwartet');
    expect(plus.last.swap).toBeGreaterThan(0);
    expect(minus.last.swap).toBeLessThan(0);
    expect(plus.last.load).toBeLessThan(minus.last.load);
  });

  test('A2.6: Marge aus MT5 skaliert mit dem Preis; ohne sie Näherung', () => {
    const mt5 = calcGridRisk({ ...base, marginPerLot: 100, marginPrice: 80 });
    if (!mt5.ok) throw new Error('unerwartet');
    expect(mt5.marginApproximated).toBe(false);
    // Stufe 1 bei 80: 100 * 0,01 * 80/80 = 1
    expect(mt5.levels[0].margin).toBeCloseTo(1, 9);
    expect(calcGridRisk(base)).toMatchObject({ ok: true, marginApproximated: true });
  });

  test('Fehler: ungültig, Dip über P0, zu viele Stufen mit richtiger Zahl', () => {
    expect(calcGridRisk({ ...base, lot: 0 })).toEqual({ ok: false, error: 'invalid' });
    expect(calcGridRisk({ ...base, floor: 90 })).toEqual({ ok: false, error: 'floorAbovePrice' });
    const many = calcGridRisk({ ...base, p0: 100, floor: 1, step: 0.01 });
    expect(many).toEqual({ ok: false, error: 'tooManyLevels', count: 9901 });
    expect(MAX_LEVELS).toBe(2000);
  });
});
