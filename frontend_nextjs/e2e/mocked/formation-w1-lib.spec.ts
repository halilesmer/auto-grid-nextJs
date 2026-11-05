/**
 * Wochenkerzen aus D1 (Befund 16, Variante A): Woche ab Sonntag 00:00 Brokerzeit, W1 nur für Trend, RSI und Divergenz.
 * W1 ist kein Teil von CONTEXT_TIMEFRAMES: keine Fraktalzonen und keine Formationssuche auf W1 (FRZ-27).
 * FRM-34 Wochenkerzen aus D1
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { analyzeFrz } from '../../src/lib/formation/frzChecks';
import { splitDaily, weeklyFromDaily } from '../../src/lib/formation/weekly';
import type { FormationBar } from '../../src/lib/formation/types';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-34' }, fn);

const DAY = 86400;
/** Sonntag 2024-01-07 00:00 */
const SUN1 = 1704585600;
const SUN2 = SUN1 + 7 * DAY;
const SUN3 = SUN2 + 7 * DAY;

/** Mo–Fr zweier Wochen; Woche 1: Open 100+i, High 110+i, Low 90+i, Close 101+i; Woche 2: Open 200+i, High 210+i, Low 195+i, Close 201+i */
function twoWeeks(): FormationBar[] {
  const out: FormationBar[] = [];
  for (let w = 0; w < 2; w++) {
    for (let i = 0; i < 5; i++) {
      const base = w === 0 ? 100 : 200;
      out.push({ time: (w === 0 ? SUN1 : SUN2) + (i + 1) * DAY, open: base + i, high: base + 10 + i, low: (w === 0 ? 90 : 195) + i, close: base + 1 + i });
    }
  }
  return out;
}

test.describe('W1 aus D1', () => {
  frm('zehn D1-Kerzen Mo–Fr → zwei W1-Kerzen mit Sonntag-Zeitstempel', () => {
    expect(weeklyFromDaily(twoWeeks())).toEqual([
      { time: SUN1, open: 100, high: 114, low: 90, close: 105 },
      { time: SUN2, open: 200, high: 214, low: 195, close: 205 },
    ]);
  });

  frm('eine D1-Kerze am Sonntag gehört zur neuen Woche', () => {
    const bars = [...twoWeeks().slice(0, 5), { time: SUN2, open: 150, high: 300, low: 140, close: 160 }, ...twoWeeks().slice(5)];
    const w = weeklyFromDaily(bars);
    expect(w).toHaveLength(2);
    expect(w[0]).toEqual({ time: SUN1, open: 100, high: 114, low: 90, close: 105 });
    expect(w[1]).toEqual({ time: SUN2, open: 150, high: 300, low: 140, close: 205 });
  });

  frm('Lücke zwischen den Wochen oder in der Woche → W1 trägt gapBefore', () => {
    const between = weeklyFromDaily(twoWeeks(), [{ from: SUN1 + 6 * DAY, to: SUN2 + DAY }]);
    expect(between.map((b) => b.gapBefore)).toEqual([undefined, true]);
    const inside = weeklyFromDaily(twoWeeks(), [{ from: SUN2 + 3 * DAY, to: SUN2 + 4 * DAY }]);
    expect(inside.map((b) => b.gapBefore)).toEqual([undefined, true]);
    expect(weeklyFromDaily(twoWeeks(), []).map((b) => b.gapBefore)).toEqual([undefined, undefined]);
  });

  frm('laufende Woche ist bis time + 7 Tage nicht in der Ansicht (kein Blick in die Zukunft)', () => {
    const ctx = new FormationContext('T', { W1: weeklyFromDaily(twoWeeks()) }, { trend: FIXTURE_TREND });
    expect(ctx.view('W1', SUN2 + 7 * DAY - 1)?.bars.map((b) => b.time)).toEqual([SUN1]);
    expect(ctx.view('W1', SUN2 + 7 * DAY)?.bars.map((b) => b.time)).toEqual([SUN1, SUN2]);
    expect(ctx.view('W1', SUN1 + 7 * DAY - 1)?.bars).toEqual([]);
    expect(ctx.view('W1', SUN3)?.bars).toHaveLength(2);
  });

  frm('W1 steht nicht in timeframes(); die FRZ-Analyse liefert keine W1-Zone', () => {
    const weeks: FormationBar[] = Array.from({ length: 60 }, (_, i) => {
      const p = 100 + (i % 2 === 0 ? 0 : 10) + i * 0.1;
      return { time: SUN1 + i * 7 * DAY, open: p, high: p + 3, low: p - 3, close: p + 1 };
    });
    const d1: FormationBar[] = weeks.map((w) => ({ ...w, time: w.time + DAY }));
    const ctx = new FormationContext('T', { D1: d1, W1: weeks }, { trend: FIXTURE_TREND });
    expect(ctx.timeframes()).toEqual(['D1']);
    const frz = analyzeFrz(ctx, SUN1 + 70 * 7 * DAY);
    expect([...frz.zones, ...frz.reversed].map((z) => z.tf as string)).not.toContain('W1');
  });

  frm('W1 hat RSI, Wave und ATR im Kontext', () => {
    const weeks = Array.from({ length: 40 }, (_, i): FormationBar => ({ time: SUN1 + i * 7 * DAY, open: 100 + i, high: 103 + i, low: 98 + i, close: 101 + i }));
    const v = new FormationContext('T', { W1: weeks }, { trend: FIXTURE_TREND }).view('W1', SUN1 + 100 * 7 * DAY)!;
    expect(v.tf).toBe('W1');
    expect(v.bars).toHaveLength(40);
    expect(v.rsi).toHaveLength(40);
    expect(v.wave[39]).not.toBeNull();
    expect(v.wave[10]).toBeNull();
  });
});

test.describe('D1-Zusatzteil für W1', () => {
  frm('splitDaily: D1 behält die letzten 400 Tage, W1 entsteht aus allen; Lücke im Zusatzteil meldet keinen Lückenhinweis', () => {
    const to = SUN3 + 2000 * DAY;
    const old = { time: to - 600 * DAY, open: 1, high: 2, low: 0, close: 1 };
    const recent = { time: to - 10 * DAY, open: 5, high: 6, low: 4, close: 5 };
    const r = splitDaily([old, recent], [{ from: to - 700 * DAY, to: to - 650 * DAY }], to);
    expect(r.d1.bars).toEqual([recent]);
    expect(r.d1.missing).toEqual([]);
    expect(r.w1.bars.length).toBe(2);
    expect(r.w1.bars[1].gapBefore).toBeUndefined();
    const r2 = splitDaily([old, recent], [{ from: to - 100 * DAY, to: to - 90 * DAY }], to);
    expect(r2.d1.missing).toEqual([{ from: to - 100 * DAY, to: to - 90 * DAY }]);
    expect(r2.w1.bars[1].gapBefore).toBe(true);
  });
});
