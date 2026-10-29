/**
 * Rechenfälle (von Hand nachgerechnet) für das Grundgerüst der Formationserkennung:
 * RSI, Wave, ATR, volumenstarke Kerze, Kontext mehrerer Zeiteinheiten ohne Blick in die Zukunft, Fixture-Prüfung.
 * FRM-01 Formationserkennung: Grundgerüst und Indikatoren
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { atrSeries, rsi, wave, wideRange } from '../../src/lib/formation/indicators';
import { CONTEXT_TIMEFRAMES, RSI_PARAMS, WAVE_PARAMS, WIDE_RANGE_PARAMS } from '../../src/lib/formation/params';
import type { FormationBar } from '../../src/lib/formation/types';

function bar(time: number, high: number, low: number, close: number, open = close): FormationBar {
  return { time, open, high, low, close };
}

/** Kerzen, deren Schlusskurs gleich dem Medianpreis ist: Median m, Spanne 2 */
function medians(m: number[]): FormationBar[] {
  return m.map((v, i) => bar(i * 3600, v + 1, v - 1, v));
}

const closes = (c: number[]): FormationBar[] => c.map((v, i) => bar(i * 3600, v + 0.5, v - 0.5, v));

test.describe('Formation: Parameter', () => {
  test('Zahlen aus der Parameterdatei: RSI 7 mit 80/20, Wave 5/35, volumenstark 1,5 über 20, ZE D1/H4/H1/M15', { tag: '@FRM-01' }, () => {
    expect(RSI_PARAMS).toEqual({ period: 7, overbought: 80, oversold: 20 });
    expect(WAVE_PARAMS).toEqual({ fast: 5, slow: 35 });
    expect(WIDE_RANGE_PARAMS).toEqual({ factor: 1.5, lookback: 20 });
    expect([...CONTEXT_TIMEFRAMES]).toEqual(['D1', 'H4', 'H1', 'M15']);
  });
});

test.describe('Formation: Indikatoren', () => {
  test('RSI Periode 2: Schlüsse 10, 12, 11, 13 → 66,667 und 85,714', { tag: '@FRM-01' }, () => {
    // i=2: Gewinn (2+0)/2 = 1, Verlust (0+1)/2 = 0,5, RS 2 → 100 − 100/3 = 66,667
    // i=3: Gewinn (1·1+2)/2 = 1,5, Verlust (0,5·1+0)/2 = 0,25, RS 6 → 100 − 100/7 = 85,714
    const r = rsi(closes([10, 12, 11, 13]), 2);
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
    expect(r[2]).toBeCloseTo(66.6667, 3);
    expect(r[3]).toBeCloseTo(85.7143, 3);
  });

  test('RSI Standard 7: steigende Schlüsse → 100, fallende → 0, davor null', { tag: '@FRM-01' }, () => {
    const up = rsi(closes([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(up.slice(0, 7).every((v) => v === null)).toBe(true);
    expect(up[7]).toBe(100);
    expect(up[8]).toBe(100);
    const down = rsi(closes([9, 8, 7, 6, 5, 4, 3, 2, 1]));
    expect(down[7]).toBe(0);
  });

  test('Wave 2/3: Mediane 10, 12, 14, 13 → null, null, 1, 0,5', { tag: '@FRM-01' }, () => {
    // SMA(2): –, 11, 13, 13,5 · SMA(3): –, –, 12, 13 · Differenz: –, –, 1, 0,5
    const w = wave(medians([10, 12, 14, 13]), 2, 3);
    expect(w).toEqual([null, null, 1, 0.5]);
  });

  test('Wave 5/35: Median steigt um 1 je Kerze → ab Index 34 genau 15, davor null', { tag: '@FRM-01' }, () => {
    // SMA(5) liegt 2 unter dem Median, SMA(35) 17 darunter: Differenz 15
    const w = wave(medians(Array.from({ length: 36 }, (_, i) => i)));
    expect(w[33]).toBeNull();
    expect(w[34]).toBe(15);
    expect(w[35]).toBe(15);
  });

  test('ATR 2 mit Kurslücke: True Range 2 und 5 → (2 + 5) / 2 = 3,5; davor null', { tag: '@FRM-01' }, () => {
    // Kerze 1: max(12, 10) − min(10, 10) = 2 · Kerze 2: max(16, 11) − min(14, 11) = 5
    const a = atrSeries([bar(0, 11, 9, 10), bar(1, 12, 10, 11), bar(2, 16, 14, 15)], 2);
    expect(a[0]).toBeNull();
    expect(a[1]).toBeNull();
    expect(a[2]).toBe(3.5);
  });

  test('ATR Standard 14: gleichmäßig steigende Kerzen mit Spanne 2 → 2 ab Index 14', { tag: '@FRM-01' }, () => {
    const a = atrSeries(medians(Array.from({ length: 16 }, (_, i) => i)));
    expect(a[13]).toBeNull();
    expect(a[14]).toBe(2);
  });
});

test.describe('Formation: volumenstarke Kerze (SIG-34)', () => {
  const flat = (n: number): FormationBar[] => Array.from({ length: n }, (_, i) => bar(i * 3600, 102, 100, 101));

  test('20 Kerzen mit Spanne 2, danach Spanne 3 → 3 ≥ 1,5 × 2: volumenstark', { tag: '@FRM-01' }, () => {
    const w = wideRange([...flat(20), bar(20 * 3600, 103, 100, 101)]);
    expect(w[19]).toBeNull();
    expect(w[20]).toBe(true);
  });

  test('Spanne 2,9 < 3: nicht volumenstark', { tag: '@FRM-01' }, () => {
    const w = wideRange([...flat(20), bar(20 * 3600, 102.9, 100, 101)]);
    expect(w[20]).toBe(false);
  });

  test('SIG-34: flache Kerze nach 20 flachen Kerzen erfüllt die Nullgrenze', { tag: '@FRM-01' }, () => {
    const flatBars = Array.from({ length: 20 }, (_, i) => bar(i * 3600, 100, 100, 100));
    const w = wideRange([...flatBars, bar(20 * 3600, 100, 100, 100), bar(21 * 3600, 100.1, 100, 100)]);
    expect(w[20]).toBe(true);
    expect(w[21]).toBe(true);
  });

  for (const candle of [{ open: 102, close: 100 }, { open: 100, close: 102 }]) {
    test(`SIG-34: Grenze 3 und knapp darunter, Schluss ${candle.close}`, { tag: '@FRM-01' }, () => {
      expect(wideRange([...flat(20), bar(20 * 3600, 103, 100, candle.close, candle.open)])[20]).toBe(true);
      expect(wideRange([...flat(20), bar(20 * 3600, 102.999999, 100, candle.close, candle.open)])[20]).toBe(false);
    });
  }

  test('leere Reihe und Reihe kürzer als die Periode → keine Werte', { tag: '@FRM-01' }, () => {
    expect(rsi([])).toEqual([]);
    expect(wave([])).toEqual([]);
    expect(wideRange([])).toEqual([]);
    expect(atrSeries(closes([1, 2]))).toEqual([null, null]);
  });

  test('Mittel der letzten 20 ohne die Kerze selbst: die starke Kerze hebt das Mittel für die nächste', { tag: '@FRM-01' }, () => {
    // Fenster für Kerze 21 = Kerzen 1..20 → Mittel (19·2 + 3) / 20 = 2,05; 1,5 · 2,05 = 3,075
    const w = wideRange([...flat(20), bar(20 * 3600, 103, 100, 101), bar(21 * 3600, 103.07, 100, 101), bar(22 * 3600, 103.08, 100, 101)]);
    expect(w[21]).toBe(false); // 3,07 < 3,075
    // Fenster für Kerze 22 = Kerzen 2..21 (Kerze 21 hat Spanne 3,07) → Mittel der Kerzen 2..21 = (18·2 + 3 + 3,07) / 20 = 2,1035; 1,5 × = 3,15525
    expect(w[22]).toBe(false); // 3,08 < 3,15525
  });
});

test.describe('Formation: Kontext mehrerer Zeiteinheiten', () => {
  const h4 = [0, 1, 2, 3].map((i) => bar(i * 14400, 11 + i, 9 + i, 10 + i));

  test('Kerze zählt erst, wenn ihre Dauer vorbei ist: H4 ab 28800 → 2 Kerzen, 28799 → 1', { tag: '@FRM-01' }, () => {
    const ctx = new FormationContext('TEST', { H4: h4 });
    expect(ctx.closedCount('H4', 28799)).toBe(1);
    expect(ctx.closedCount('H4', 28800)).toBe(2);
    expect(ctx.closedCount('H4', 0)).toBe(0);
    expect(ctx.closedCount('H4', 10 ** 9)).toBe(4);
  });

  test('view(t) gibt nur geschlossene Kerzen und dieselben Indikatorwerte wie die Rechnung auf dem Teilstück', { tag: '@FRM-01' }, () => {
    const many = Array.from({ length: 60 }, (_, i) => bar(i * 3600, 100 + Math.sin(i) + 1, 100 + Math.sin(i) - 1, 100 + Math.sin(i) * 0.5));
    const ctx = new FormationContext('TEST', { H1: many });
    const t = 40 * 3600; // Kerzen 0..39 geschlossen
    const v = ctx.view('H1', t)!;
    expect(v.bars).toHaveLength(40);
    expect(v.rsi).toEqual(rsi(many.slice(0, 40)));
    expect(v.wave).toEqual(wave(many.slice(0, 40)));
    expect(v.atr).toEqual(atrSeries(many.slice(0, 40)));
    expect(v.wide).toEqual(wideRange(many.slice(0, 40)));
  });

  test('view vor der ersten geschlossenen Kerze → leere Reihen', { tag: '@FRM-01' }, () => {
    const v = new FormationContext('TEST', { H4: h4 }).view('H4', 100)!;
    expect(v.bars).toEqual([]);
    expect(v.rsi).toEqual([]);
  });

  test('nicht geladene Zeiteinheit → null; timeframes() von hoch nach tief', { tag: '@FRM-01' }, () => {
    const ctx = new FormationContext('TEST', { M15: h4, D1: h4 });
    expect(ctx.view('H1', 0)).toBeNull();
    expect(ctx.timeframes()).toEqual(['D1', 'M15']);
  });

  test('Kerze ohne endliche Zahl → Fehler', { tag: '@FRM-01' }, () => {
    expect(() => new FormationContext('TEST', { H4: [bar(0, NaN, 1, 1)] })).toThrow(/endliche Zahl/);
  });

  test('Zeit nicht streng steigend → Fehler', { tag: '@FRM-01' }, () => {
    expect(() => new FormationContext('TEST', { H4: [bar(0, 2, 1, 1), bar(0, 2, 1, 1)] })).toThrow(/streng steigend/);
  });
});

test.describe('Formation: Fixture-Prüfung', () => {
  const ok = { symbol: 'TEST', timeframe: 'H4', bars: [{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5 }] };

  test('gültige Datei wird gelesen', { tag: '@FRM-01' }, () => {
    expect(parseFixture(ok)).toEqual(ok);
  });

  test('ungültige Zeiteinheit, fehlendes Symbol, OHLC-Widerspruch und doppelte Zeit werden abgelehnt', { tag: '@FRM-01' }, () => {
    expect(() => parseFixture({ ...ok, timeframe: 'H5' })).toThrow(/timeframe/);
    expect(() => parseFixture({ ...ok, symbol: '' })).toThrow(/symbol/);
    expect(() => parseFixture({ ...ok, bars: [{ time: 0, open: 1, high: 1, low: 0.5, close: 1.5 }] })).toThrow(/OHLC/);
    expect(() => parseFixture({ ...ok, bars: [{ time: 0, open: 1, high: NaN, low: 0.5, close: 1 }] })).toThrow(/endliche Zahl/);
    expect(() => parseFixture({ ...ok, bars: [ok.bars[0], ok.bars[0]] })).toThrow(/streng steigend/);
  });
});
