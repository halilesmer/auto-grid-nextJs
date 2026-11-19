/**
 * Handelsblock der Harmoniken (GAR, BAT, BUT, CRB): TP2, Stand nach dem Einstieg (offen, TP1, TP1 und TP2, Stop, Rest am Einstieg),
 * Stop am Einstieg nach TP1 und Ergebnisse in R (½ · ½). Kerzen sind Zeilen [Open, High, Low, Close].
 * FRM-39 Handelsblock
 */
import { expect, test } from '@playwright/test';
import { checkGarCandidate } from '../../src/lib/formation/garChecks';
import { checkBatCandidate } from '../../src/lib/formation/batChecks';
import { checkButCandidate } from '../../src/lib/formation/butChecks';
import { checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { fibPrice, outcomesOf, realizedOutcomesOf } from '../../src/lib/formation/trade';
import { AT, harmonic, makeRun } from '../fixtures/formation-harmonic';
import { mirror, zig, type Row } from '../fixtures/formation-rows';
import type { Candidate, Trade } from '../../src/lib/formation/types';

const t39 = (name: string, fn: () => void) => test(name, { tag: '@FRM-39' }, fn);

const H_LEGS = [18, 4, 4, 4];
const H_AT = { x: 2, a: 20, b: 24, c: 28 };
const NO_D = { x: AT.x, a: AT.a, b: AT.b, c: AT.c };

const cases = [
  { code: 'GAR', check: checkGarCandidate, rows: zig([100, 130, 111.46, 122.92, 106.41], H_LEGS, 3), at: H_AT, entry: 111.46 - 0.272 * (130 - 111.46), dEnd: 106.41, atLevel: true },
  { code: 'BAT', check: checkBatCandidate, rows: zig([100, 130, 115, 120.8, 103.42], H_LEGS, 3), at: H_AT, entry: 130 + 0.886 * (100 - 130), dEnd: 103.42, atLevel: true },
  { code: 'BUT', check: checkButCandidate, rows: harmonic([100, 130, 106, 120.16, 91.8]), at: NO_D, entry: 91.8, dEnd: 91.8, atLevel: false },
  { code: 'CRB', check: checkCrbCandidate, rows: harmonic([100, 130, 112, 123.68, 81.4]), at: NO_D, entry: 81.4, dEnd: 81.4, atLevel: false },
] as const;

/** Kerze [Open, High, Low, Close] aus Eckwerten; Kauf-Preise, werden für Verkauf gespiegelt */
type Step = 'open' | 'tp1' | 'tp12' | 'stop' | 'breakeven';

function stepRows(dEnd: number, entry: number, stopPrice: number, tp1: number, tp2: number, step: Step): Row[] {
  const calm: Row = [entry + 1, entry + 1.5, dEnd + 0.3, entry + 1];
  const hitTp1: Row = [entry + 1, tp1 + 0.4, dEnd + 0.3, tp1 + 0.2];
  const hitTp2: Row = [tp1 + 0.2, tp2 + 0.4, tp1 - 0.3, tp2 + 0.2];
  const rows: Record<Step, Row[]> = {
    open: [calm],
    tp1: [hitTp1],
    tp12: [hitTp1, hitTp2],
    stop: [[entry + 1, entry + 1.5, stopPrice - 3, stopPrice - 2]],
    breakeven: [hitTp1, [tp1, tp1 + 0.2, entry - 2, entry - 1]],
  };
  return rows[step];
}

const tradeOf = (c: Candidate): Trade => {
  if (!c.trade) throw new Error('kein trade');
  return c.trade;
};

for (const hc of cases) {
  for (const buy of [true, false]) {
    const mir = (p: number) => (buy ? p : 200 - p);
    const side = buy ? 'buy' : 'sell';
    const run = makeRun(hc.check, hc.at as never);
    const go = (step: Step | null) => {
      const base = hc.rows;
      const base0 = run({ H4: buy ? base : mirror(base) }, hc.at as never, { buy });
      if (step === null) return tradeOf(base0);
      const t0 = tradeOf(base0);
      // Preise der Kauf-Seite: Stop, Einstieg und Ziele aus dem Handel vor den Folgekerzen
      const entry = mir(t0.entry!);
      const stop = mir(t0.stop!);
      const tp1 = mir(t0.tp1!);
      const tp2 = mir(t0.tp2!);
      const extra = stepRows(hc.dEnd, entry, stop, tp1, tp2, step);
      const rows = [...base, ...extra];
      return tradeOf(run({ H4: buy ? rows : mirror(rows) }, hc.at as never, { buy }));
    };

    t39(`${hc.code} (${side}): TP2 = Fib A → D 0,618, am Einstieg ${hc.atLevel ? 'Fib A → Einstiegslevel' : 'wie TP1 am Docht'}`, () => {
      const t = go(null);
      expect(t.tp2, 'TP2').toBeCloseTo(mir(fibPrice(130, hc.dEnd, 0.618)), 6);
      expect(t.tp2AtEntry, 'TP2 am Einstieg').toBeCloseTo(mir(fibPrice(130, hc.atLevel ? hc.entry : hc.dEnd, 0.618)), 6);
      expect(t.tpBig, 'kein großes Ziel').toBeUndefined();
      expect(t.reentry, 'kein Wiedereinstieg').toBeUndefined();
      expect(t.earlyReversal, 'kein früher Rückkehr').toBeUndefined();
    });

    t39(`${hc.code} (${side}): Stand offen, TP1 (Stop am Einstieg), TP1 und TP2, Stop, Rest am Einstieg`, () => {
      const open = go('open');
      expect(open.status?.kind).toBe('open');
      expect(open.status?.stopNow).toBeCloseTo(open.stop!, 6);

      const tp1 = go('tp1');
      expect(tp1.status?.kind).toBe('tp1');
      expect(tp1.status?.stopNow, 'Stop rückt auf den Einstieg').toBeCloseTo(tp1.entry!, 6);
      expect(tp1.status?.tp1Fill).toBeDefined();
      expect(tp1.stop, 'ursprünglicher Stop bleibt im Handel').toBeCloseTo(open.stop!, 6);

      const tp12 = go('tp12');
      expect(tp12.status?.kind).toBe('tp12');
      expect(tp12.status?.tp2Fill).toBeDefined();

      expect(go('stop').status?.kind).toBe('stopped');
      const be = go('breakeven').status;
      expect(be?.kind).toBe('breakeven');
      expect(be?.tp2Fill).toBeUndefined();
    });

    t39(`${hc.code} (${side}): Ergebnis in R ½ · ½ – Stop −1, TP1 und Rest am Einstieg, TP1 und TP2`, () => {
      const t = go(null);
      const o = outcomesOf(t, side)!;
      expect(o).not.toBeNull();
      const risk = Math.abs(t.entry! - t.stop!);
      const r1 = Math.abs((t.tp1AtEntry ?? t.tp1!) - t.entry!);
      const r2 = Math.abs(t.tp2AtEntry! - t.entry!);
      expect(o.stop).toBe(-1);
      expect(o.tp1).toBeCloseTo((0.5 * r1) / risk, 6);
      expect(o.tp12).toBeCloseTo((0.5 * (r1 + r2)) / risk, 6);
      expect(o.tp123).toBeUndefined();
      // erreicht: die Zählpreise von TP1 und TP2 ersetzen die Werte am Einstieg
      const done = go('tp12');
      const real = realizedOutcomesOf(done, side, done.status)!;
      const d1 = Math.abs(done.status!.tp1Fill! - done.entry!);
      const d2 = Math.abs(done.status!.tp2Fill! - done.entry!);
      expect(real.tp12).toBeCloseTo((0.5 * (d1 + d2)) / risk, 6);
    });
  }
}
