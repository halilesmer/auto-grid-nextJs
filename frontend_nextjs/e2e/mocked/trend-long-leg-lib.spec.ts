/**
 * Langer Schenkel (ANA-29, Halil 2026-11-26, 1125-A2.1 bis A2.4): Läuft ein Schenkel der Regel „EWO + Fibo 382“ weit über den vorigen hinaus, teilt die
 * Linie ihn mit einem AB=CD aus den Spitzen der EWO-Wellen. Prüft die Zahlen auf einem Jahr echter H1-Kerzen (XAUUSD, EURUSD; Kerzen als
 * [Zeit, Open, High, Low, Close], Brokerzeit als UTC kodiert).
 * ANA-29 Langer Schenkel teilt die Trendlinie
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { wave } from '../../src/lib/formation/indicators';
import { DEFAULT_TREND_SETTINGS, type TrendSettings } from '../../src/lib/formation/params';
import { TrendRun, buildTrend } from '../../src/lib/formation/trd';
import { legSummary, sanitizeTrendSettings, trendFingerprint, usableTrendSettings } from '../../src/lib/formation/trdPath';
import type { FormationBar } from '../../src/lib/formation/types';

const load = (name: string): FormationBar[] =>
  (JSON.parse(readFileSync(`e2e/fixtures/long-leg-${name}-h1.json`, 'utf-8')) as number[][]).map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const XAU = load('xauusd');
const EUR = load('eurusd');
const ana = (name: string, fn: () => void) => test(name, { tag: '@ANA-29' }, fn);
const settings = (patch: Partial<TrendSettings> = {}) => usableTrendSettings({ ...DEFAULT_TREND_SETTINGS, ...patch });
const build = (bars: FormationBar[], patch: Partial<TrendSettings> = {}) => buildTrend('H1', bars, wave(bars), settings(patch));
const at = (bars: FormationBar[], iso: string) => bars.findIndex((b) => b.time === Date.parse(iso) / 1000);
/** Die letzten `n` Punkte des Zugs an der Kerze `iso` (das ist die Kerze, an der geteilt wurde) */
function tail(bars: FormationBar[], iso: string, n: number): number[] {
  const run = new TrendRun('H1', bars, wave(bars), settings());
  run.advanceTo(at(bars, iso) + 1);
  return run.model.pivots.slice(-n).map((p) => p.price);
}

test.describe('ANA-29 Langer Schenkel (Zahlen auf H1-Kerzen)', () => {
  ana('Standard: XAUUSD und EURUSD, Punkte und Trendwechsel mit und ohne Teilung', () => {
    const cases: [FormationBar[], Partial<TrendSettings>, number, number][] = [
      [XAU, {}, 219, 43], [EUR, {}, 254, 43], [XAU, { legMeasure: 'off' }, 203, 43], [EUR, { legMeasure: 'off' }, 181, 33],
    ];
    for (const [bars, patch, pivots, changes] of cases) {
      const m = build(bars, patch);
      expect([m.pivots.length, m.changes.length]).toEqual([pivots, changes]);
    }
  });

  ana('XAUUSD: fünf Teilungen, an der Kerze des Auslösers stehen genau diese vier Punkte am Ende', () => {
    const splits: [string, number[]][] = [
      ['2025-12-02T05:00Z', [4173.36, 4142.77, 4264.51, 4199.72]],
      ['2025-12-29T06:00Z', [4525.94, 4448.49, 4549.88, 4496.77]],
      ['2026-03-03T09:00Z', [5249.84, 5130.84, 5419.21, 5305.91]],
      ['2026-08-13T13:00Z', [4303.98, 4229.9, 4449.65, 4364.16]],
      ['2026-11-23T18:00Z', [3832.42, 3886.69, 3502.81, 3689.66]],
    ];
    for (const [iso, points] of splits) expect(tail(XAU, iso, 4), iso).toEqual(points);
  });

  ana('XAUUSD Ende November: die Linie ist das ABCD, das von Hand gezeichnet wurde', () => {
    expect(build(XAU).pivots.slice(-6).map((p) => p.price)).toEqual([4148.52, 3832.42, 3886.69, 3502.81, 3689.66, 3426.69]);
  });

  ana('EURUSD: sieben Teilungen mit A, B und C an der Kerze des Auslösers', () => {
    const splits: [string, number[]][] = [
      ['2026-02-06T09:00Z', [1.18375, 1.17652, 1.18009]],
      ['2026-04-13T07:00Z', [1.16499, 1.17388, 1.16847]],
      ['2026-05-20T21:00Z', [1.16608, 1.15822, 1.16304]],
      ['2026-06-25T20:00Z', [1.14801, 1.13241, 1.13876]],
      ['2026-09-21T17:00Z', [1.15561, 1.14538, 1.14953]],
      ['2026-09-25T16:00Z', [1.14732, 1.13588, 1.14096]],
      ['2026-11-24T18:00Z', [1.10231, 1.08806, 1.09798]],
    ];
    for (const [iso, points] of splits) {
      const got = tail(EUR, iso, 3);
      expect(got.length, iso).toBe(3);
      got.forEach((v, i) => expect(v, iso).toBeCloseTo(points[i], 6));
    }
  });

  ana('1126-A13.1: die erste Gegenbewegung nach C zählt ab Fibo 382 von AB (XAUUSD)', () => {
    const prices = (m: ReturnType<typeof build>) => m.pivots.map((p) => p.price);
    const all = prices(build(XAU));
    // 29. Dez 04:00 und 05:00 sind kein Punkt der Linie mehr
    expect(all).not.toContain(4496.77);
    expect(all).not.toContain(4520.4);
    const r = new TrendRun('H1', XAU, wave(XAU), settings());
    r.advanceTo(at(XAU, '2026-01-05T12:00Z') + 1);
    const t = r.model.pivots.map((p) => p.price);
    const i = t.indexOf(4549.88);
    expect(t.slice(i - 2, i + 4)).toEqual([4525.94, 4448.49, 4549.88, 4274.05, 4402.3, 4310.11]);
    // Trendwechsel nach unten mit Bezug 4448,49: 29. Dez 13:00 statt 08:00
    const ch = build(XAU).changes.find((c) => c.refPrice === 4448.49);
    expect(ch?.to).toBe('down');
    expect(XAU[ch?.k ?? 0].time).toBe(Date.parse('2025-12-29T13:00Z') / 1000);
    // Kerze 24. Nov 18:00: die Linie endet auf 3886,69 · 3502,81 · 3689,66 (vorher kam 3607,51 dazu)
    expect(tail(XAU, '2026-11-24T18:00Z', 3)).toEqual([3886.69, 3502.81, 3689.66]);
  });

  ana('1126-A13.1: EURUSD, 1,09798 und 1,09308 sind kein Punkt, der Wechsel nach oben am 25. Nov 19:00 fehlt', () => {
    const m = build(EUR);
    const prices = m.pivots.map((p) => p.price);
    expect(prices.some((v) => Math.abs(v - 1.09798) < 1e-9)).toBe(false);
    expect(prices.some((v) => Math.abs(v - 1.09308) < 1e-9)).toBe(false);
    expect(m.changes.some((c) => EUR[c.k].time === Date.parse('2026-11-25T19:00Z') / 1000)).toBe(false);
  });

  ana('1126-A13.1: Positivkontrolle, die erste Gegenbewegung nach C, die als Punkt in die Linie kommt, reicht an 382 % von AB', () => {
    const cases: [FormationBar[], string, number][] = [
      [XAU, '2025-12-02T05:00Z', 4], [XAU, '2026-03-03T09:00Z', 4], [XAU, '2026-08-13T13:00Z', 4], [EUR, '2026-02-06T09:00Z', 3], [EUR, '2026-06-25T20:00Z', 3], [EUR, '2026-09-21T17:00Z', 3],
    ];
    let accepted = 0;
    for (const [bars, iso, n] of cases) {
      const run = new TrendRun('H1', bars, wave(bars), settings());
      const k0 = at(bars, iso) + 1;
      run.advanceTo(k0);
      const t = run.model.pivots.slice(-n);
      const [A, B, C] = n === 4 ? [t[1], t[2], t[3]] : [t[0], t[1], t[2]];
      // Kerze für Kerze weiter, bis der Punkt nach C kommt (oder C durch eine Verlängerung ersetzt wird)
      for (let k = k0 + 1; k < bars.length; k++) {
        run.advanceTo(k);
        const piv = run.model.pivots;
        const i = piv.findIndex((p) => p.idx === C.idx && p.side === C.side);
        if (i < 0) break;
        if (i < piv.length - 1) {
          accepted++;
          expect(Math.abs(piv[i + 1].price - C.price) + 1e-9, iso).toBeGreaterThanOrEqual(0.382 * Math.abs(B.price - A.price));
          break;
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });

  ana('Die Teilung schaut nicht voraus: der Stand an Kerze k gleicht dem Lauf über die ersten k + 1 Kerzen', () => {
    const k = at(XAU, '2026-08-13T13:00Z') + 1;
    const whole = new TrendRun('H1', XAU, wave(XAU), settings());
    whole.advanceTo(k);
    const cut = build(XAU.slice(0, k));
    expect(whole.model.pivots.map((p) => p.price)).toEqual(cut.pivots.map((p) => p.price));
  });

  ana('Nur die Regel EWO + Fibo 382 teilt: andere Regeln rechnen wie ohne Teilung', () => {
    for (const rule of ['welle', 'groesse'] as const) {
      const on = build(XAU, { rule, legMeasure: 'mult' });
      const off = build(XAU, { rule, legMeasure: 'off' });
      expect(on.pivots.map((p) => p.price)).toEqual(off.pivots.map((p) => p.price));
    }
  });

  ana('Andere Maße: ein größeres Vielfaches teilt seltener, ATR-Vielfaches und Kerzenzahl teilen', () => {
    const at4 = build(XAU, { legMult: 4.236 }).pivots.length;
    const at1 = build(XAU, { legMult: 1.618 }).pivots.length;
    expect(at4).toBeLessThanOrEqual(219);
    expect(at1).toBeGreaterThanOrEqual(219);
    // ATR-Vielfaches und Kerzenzahl: nicht gegen eine Referenz bestätigt (siehe PR), geprüft wird nur, dass sie rechnen und Punkte liefern
    expect(build(XAU, { legMeasure: 'atr', legAtr: 15 }).pivots.length).toBeGreaterThan(0);
    expect(build(XAU, { legMeasure: 'bars', legBars: 80 }).pivots.length).toBeGreaterThan(0);
  });

  ana('Einstellungen: Fingerabdruck, Speicher und Kurztext', () => {
    const d = DEFAULT_TREND_SETTINGS;
    expect(d.legMeasure).toBe('mult');
    expect(d.legMult).toBe(2.618);
    expect(trendFingerprint(d)).not.toBe(trendFingerprint({ ...d, legMeasure: 'off' }));
    expect(trendFingerprint(d)).not.toBe(trendFingerprint({ ...d, legMult: 4.236 }));
    // ein Feld, das nicht zum gewählten Maß gehört, ändert den Fingerabdruck nicht
    expect(trendFingerprint(d)).toBe(trendFingerprint({ ...d, legAtr: 20 }));
    // eine Regel, die nicht teilt, ändert sich mit dem Maß nicht
    expect(trendFingerprint({ ...d, rule: 'welle' })).toBe(trendFingerprint({ ...d, rule: 'welle', legMeasure: 'off' }));
    // alte gespeicherte Einstellungen ohne Maß und kaputte Werte fallen auf den Standard
    expect(sanitizeTrendSettings({ rule: 'welle382' })).toMatchObject({ legMeasure: 'mult', legMult: 2.618, legAtr: 15, legBars: 80 });
    expect(sanitizeTrendSettings({ legMeasure: 'x', legMult: 3, legAtr: 99, legBars: 5 })).toMatchObject({ legMeasure: 'mult', legMult: 2.618, legAtr: 30, legBars: 20 });
    expect(legSummary(d)).toEqual({ kind: 'mult', value: 2.618 });
    expect(legSummary({ ...d, legMeasure: 'off' })).toEqual({ kind: 'off', value: 0 });
    expect(legSummary({ ...d, rule: 'groesse' })).toBeNull();
  });
});
