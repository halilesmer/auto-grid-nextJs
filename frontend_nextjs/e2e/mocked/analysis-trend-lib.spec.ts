/**
 * Trendzug im Chart (ANA-21): Segmente aus dem Zug von `buildTrend`, Abschneiden am Chart-Rand und die Einstellungen.
 * Die Punkte der EURCAD-D1-Reihe sind die Erwartung aus Referenzchart (FRM-03, `formation-trd-lib.spec.ts`).
 * ANA-21 Trendzug im Chart
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { buildTrend, emptyTrend } from '../../src/lib/formation/trd';
import { buildTrendPath, TREND_PATH_MAX_BARS, clipSegments, closedBars, ewoPairValid, sanitizeTrendSettings, trendSegments, usableTrendSettings } from '../../src/lib/formation/trdPath';
import type { FormationBar } from '../../src/lib/formation/types';

const ana = (name: string, fn: () => void) => test(name, { tag: '@ANA-21' }, fn);

const eurcad = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/trd-up-d1-01.json', 'utf-8')));
const indexOfTime = (bars: readonly FormationBar[], time: number) => bars.findIndex((b) => b.time === time);

/** Von Hand gebautes Modell: nur Kerzenzeiten, Punkte und Wechsel zählen für die Segmente */
function handModel(pivots: [number, 'support' | 'resistance', number][], changes: [number, 'up' | 'down'][]) {
  const bars: FormationBar[] = Array.from({ length: 80 }, (_, i) => ({ time: 1000 + i * 60, open: 1, high: 2, low: 0.5, close: 1.5 }));
  const m = emptyTrend('H1', bars, []);
  m.pivots = pivots.map(([idx, side, price]) => ({ idx, doneAt: idx + 2, side, price, kind: 'impulse', len: 0 }));
  m.changes = changes.map(([k, to]) => ({ k, to, refPrice: 0, refIdx: 0, refBar: 0 }));
  return { m, bars };
}

test.describe('ANA-21 Trendzug im Chart', () => {
  ana('Der Zug der EURCAD-Reihe wird zu Segmenten zwischen den Punkten 14, 29, 84, 87, 103, 110 und 133', () => {
    const segments = buildTrendPath('D1', eurcad.bars, DEFAULT_TREND_SETTINGS);
    expect(segments.map((s) => [indexOfTime(eurcad.bars, s.from.time), indexOfTime(eurcad.bars, s.to.time)])).toEqual([
      [14, 29],
      [29, 84],
      [84, 87],
      [87, 103],
      [103, 110],
      [110, 133],
    ]);
  });

  /** Deterministische Wellenreihe mit n Kerzen (kein Zufall, kein Timing) */
  const wave = (n: number): FormationBar[] =>
    Array.from({ length: n }, (_, i) => {
      const c = 100 + 10 * Math.sin(i / 7) + 4 * Math.sin(i / 23) + i * 0.01;
      return { time: 1_000_000 + i * 3600, open: c - 0.3, high: c + 1, low: c - 1, close: c };
    });

  ana('Bis TREND_PATH_MAX_BARS Kerzen bleibt der Pfad unverändert (gleich dem Pfad ohne Kappung)', () => {
    const exact = wave(TREND_PATH_MAX_BARS);
    expect(buildTrendPath('D1', eurcad.bars, DEFAULT_TREND_SETTINGS)).toEqual(trendSegments(buildTrend('D1', eurcad.bars, [], DEFAULT_TREND_SETTINGS)));
    expect(buildTrendPath('H1', exact, DEFAULT_TREND_SETTINGS)).toEqual(trendSegments(buildTrend('H1', exact, [], DEFAULT_TREND_SETTINGS)));
  });

  ana('Über TREND_PATH_MAX_BARS Kerzen gehen nur die letzten in den Pfad', () => {
    const bars = wave(TREND_PATH_MAX_BARS + 1200);
    const tail = bars.slice(-TREND_PATH_MAX_BARS);
    const segments = buildTrendPath('H1', bars, DEFAULT_TREND_SETTINGS);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments).toEqual(buildTrendPath('H1', tail, DEFAULT_TREND_SETTINGS));
    expect(segments[0].from.time).toBeGreaterThanOrEqual(tail[0].time);
  });

  ana('Ein Segment endet dort, wo das nächste beginnt, mit demselben Preis', () => {
    const segments = buildTrendPath('D1', eurcad.bars, DEFAULT_TREND_SETTINGS);
    expect(segments.slice(1).every((s, i) => s.from.time === segments[i].to.time && s.from.price === segments[i].to.price)).toBe(true);
  });

  ana('Segmente tragen die Richtung des Trends an ihrem Ende; eine Korrektur behält die Farbe', () => {
    const { m } = handModel([[10, 'support', 100], [20, 'resistance', 110], [30, 'support', 104], [40, 'resistance', 112], [50, 'support', 98], [60, 'resistance', 103]], [[45, 'down']]);
    expect(trendSegments(m).map((s) => s.tone)).toEqual(['up', 'up', 'up', 'down', 'down']);
  });

  ana('Kommt der Wechsel nach dem Endpunkt eines Schenkels in dessen Richtung, nimmt der Schenkel die neue Farbe', () => {
    const { m } = handModel([[0, 'resistance', 110], [10, 'support', 100], [20, 'resistance', 108], [30, 'support', 104]], [[22, 'up']]);
    expect(trendSegments(m).map((s) => s.tone)).toEqual(['down', 'up', 'up']);
  });

  ana('Ohne zwei Punkte gibt es keine Segmente', () => {
    expect(trendSegments(handModel([[10, 'support', 100]], []).m)).toEqual([]);
    expect(trendSegments(handModel([], []).m)).toEqual([]);
  });

  ana('Abschneiden am Rand: der Teil vor der ersten und nach der letzten Kerze des Charts fällt weg, die Kerze bleibt am Schnittpunkt', () => {
    const seg = (t1: number, p1: number, t2: number, p2: number) => ({ from: { time: t1, price: p1 }, to: { time: t2, price: p2 }, tone: 'up' as const });
    const axis = [0, 100, 150, 200, 250, 300, 400];
    const clipped = clipSegments([seg(0, 1, 100, 3), seg(100, 3, 200, 2), seg(200, 2, 300, 4), seg(300, 4, 400, 1)], 150, 250, axis);
    // Die Linie läuft über Kerzen, nicht über Sekunden: von 100 (Index 1) nach 200 (Index 3) liegt die Kerze 150 (Index 2) in der Mitte
    expect(clipped).toEqual([seg(150, 2.5, 200, 2), seg(200, 2, 250, 3)]);
  });

  ana('Nur geschlossene Kerzen: eine Kerze zählt erst, wenn Öffnungszeit plus Dauer erreicht ist', () => {
    const bars = [{ time: 0 }, { time: 86400 }, { time: 172800 }];
    expect(closedBars(bars, 86400, 172800, null)).toEqual([{ time: 0 }, { time: 86400 }]);
    expect(closedBars(bars, 86400, 172799, null)).toEqual([{ time: 0 }]);
    expect(closedBars(bars, 86400, 259200, null)).toEqual(bars);
  });

  ana('Die laufende Kerze zählt nie, auch wenn die Uhr sie schon als geschlossen zeigt', () => {
    const bars = [{ time: 0 }, { time: 3600 }, { time: 7200 }];
    expect(closedBars(bars, 3600, 99999, 7200)).toEqual([{ time: 0 }, { time: 3600 }]);
  });

  ana('Ohne bekannte Brokerzeit fällt die letzte Kerze weg', () => {
    const bars = [{ time: 0 }, { time: 3600 }, { time: 7200 }];
    expect(closedBars(bars, 3600, null, null)).toEqual([{ time: 0 }, { time: 3600 }]);
  });

  ana('Ohne Brokerzeit, aber mit UTC-Zeit: Kerzen, die vor UTC jetzt minus 12 Stunden enden, zählen als geschlossen (A13.3.1)', () => {
    const bars = [{ time: 0 }, { time: 3600 }, { time: 7200 }];
    const h12 = 12 * 3600;
    // Die zweite Kerze endet bei 7200; sie zählt ab utc = 7200 + 12 h, nicht früher
    expect(closedBars(bars, 3600, null, null, 7200 + h12)).toEqual(bars.slice(0, 2));
    expect(closedBars(bars, 3600, null, null, 7200 + h12 - 1)).toEqual(bars.slice(0, 1));
    // Eine vergangene Spanne behält alle Kerzen, auch die letzte
    expect(closedBars(bars, 3600, null, null, 10800 + h12)).toEqual(bars);
    // Die laufende Kerze (liveFrom) zählt weiter nie
    expect(closedBars(bars, 3600, null, 7200, 10800 + h12)).toEqual(bars.slice(0, 2));
  });

  ana('Über eine Marktpause wird nach Kerzen geschnitten, nicht nach Sekunden', () => {
    // Freitag 0, Dienstag 10 (das Wochenende liegt dazwischen), Mittwoch 110, Donnerstag 120
    const axis = [0, 10, 110, 120];
    const segment = { from: { time: 0, price: 100 }, to: { time: 120, price: 130 }, tone: 'up' as const };
    expect(clipSegments([segment], 10, 120, axis)).toEqual([{ ...segment, from: { time: 10, price: 110 } }]);
  });

  ana('Ein Segment, das den Chart nicht berührt, wird nicht gezeichnet', () => {
    const away = { from: { time: 0, price: 1 }, to: { time: 100, price: 2 }, tone: 'down' as const };
    expect(clipSegments([away], 150, 250, [0, 100, 150, 250])).toEqual([]);
  });

  ana('Eine kleinere Mindestgröße gibt mehr Segmente als der Standard', () => {
    const fine = buildTrendPath('D1', eurcad.bars, { ...DEFAULT_TREND_SETTINGS, minSize: 1 });
    expect(fine.length).toBeGreaterThan(6);
  });

  ana('Gespeicherte Werte: Unsinn fällt auf den Standard, Zahlen bleiben in ihren Grenzen', () => {
    expect(sanitizeTrendSettings(null)).toEqual(DEFAULT_TREND_SETTINGS);
    expect(sanitizeTrendSettings({ rule: 'quatsch', minSize: 'x', changeCloses: 7, formationZug: 'trend', ewoFast: 1.5 })).toEqual(DEFAULT_TREND_SETTINGS);
    expect(sanitizeTrendSettings({ rule: 'welle382' }).rule).toBe('welle382');
    expect(sanitizeTrendSettings({ minSize: 99, ewoRetreat: -1, atrPeriod: 500 })).toEqual({ ...DEFAULT_TREND_SETTINGS, minSize: 3.5, ewoRetreat: 0.1, atrPeriod: 100 });
    expect(sanitizeTrendSettings({ rule: 'geruest', minSize: 1.75, changeCloses: 2, ewoFast: 4, ewoSlow: 30, atrPeriod: 10, ewoRetreat: 0.4, formationZug: 'fein' })).toEqual({
      rule: 'geruest', minSize: 1.75, changeCloses: 2, ewoFast: 4, ewoSlow: 30, atrPeriod: 10, ewoRetreat: 0.4,
    });
  });

  ana('EWO lang muss größer sein als EWO kurz, sonst rechnet der Zug mit dem Paar des Standards und die Eingabe bleibt stehen', () => {
    const typed = sanitizeTrendSettings({ ewoFast: 40, ewoSlow: 20 });
    expect([typed.ewoFast, typed.ewoSlow, ewoPairValid(typed)]).toEqual([40, 20, false]);
    const used = usableTrendSettings(typed);
    expect([used.ewoFast, used.ewoSlow]).toEqual([5, 35]);
    expect(usableTrendSettings({ ...typed, ewoFast: 4, ewoSlow: 30 })).toMatchObject({ ewoFast: 4, ewoSlow: 30 });
  });

  ana('Der Standard ist Trendzug mit Mindestgröße 2,5 ATR, ein Schluss', () => {
    expect(DEFAULT_TREND_SETTINGS).toEqual({ rule: 'groesse', minSize: 2.5, ewoRetreat: 0.2, changeCloses: 1, ewoFast: 5, ewoSlow: 35, atrPeriod: 14 });
  });
});
