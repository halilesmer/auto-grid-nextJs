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
import { fibPrice, outcomesOf, realizedOutcomesOf, tradeMetrics } from '../../src/lib/formation/trade';
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

// 2026-11-20: Der Not-SL eines eingegangenen Handels rechnet mit der ATR der Einstiegskerze und ändert sich später nicht mehr
for (const hc of cases) {
  for (const buy of [true, false]) {
    const side = buy ? 'buy' : 'sell';
    const mir = (p: number) => (buy ? p : 200 - p);
    t39(`${hc.code} (${side}): Not-SL bleibt bei der ATR der Einstiegskerze, spätere große Kerzen ändern Stand und Wert nicht`, () => {
      const run = makeRun(hc.check, hc.at as never);
      const build = (extra: Row[]) => tradeOf(run({ H4: buy ? [...hc.rows, ...extra] : mirror([...hc.rows, ...extra]) }, hc.at as never, { buy }));
      const t0 = build([]);
      const entry = mir(t0.entry!);
      const stop = mir(t0.stop!);
      const notSl = mir(t0.emergencyStop!);
      expect(notSl, 'Not-SL liegt hinter dem Stop').toBeLessThan(stop);
      // große Kerzen: Spanne bis knapp unter den Not-SL, Schluss über dem Stop, kein Ziel berührt
      const big: Row = [entry, entry + 0.5, notSl + 0.05, entry];
      // Docht knapp durch den alten Not-SL, Schluss über dem Stop
      const wick: Row = [entry + 1, stop + 2, notSl - 0.01, stop + 1];
      const plain1 = build([wick]);
      const grown = build([big, big, big, big, big, big, wick]);
      for (const t of [plain1, grown]) {
        expect(t.status?.kind, 'Docht durch den Not-SL der Einstiegskerze').toBe('stopped');
        expect(t.status?.stopBy).toBe('wick');
        expect(mir(t.emergencyStop!), 'gezeigter Not-SL').toBeCloseTo(notSl, 6);
      }
    });
  }
}

// 2026-11-20: Butterfly und Crab – TP2 am Einstieg gehört zum eingefrorenen Docht der Berührungskerze; ein später tieferer Docht (D läuft weiter) verschiebt ihn nicht
for (const hc of cases.filter((c) => !c.atLevel)) {
  for (const buy of [true, false]) {
    const side = buy ? 'buy' : 'sell';
    const mir = (p: number) => (buy ? p : 200 - p);
    t39(`${hc.code} (${side}): TP2 am Einstieg bleibt am Docht der Berührungskerze, wenn D danach weiterläuft`, () => {
      const run = makeRun(hc.check, hc.at as never);
      const build = (extra: Row[]) => tradeOf(run({ H4: buy ? [...hc.rows, ...extra] : mirror([...hc.rows, ...extra]) }, hc.at as never, { buy }));
      const t0 = build([]);
      const entry = mir(t0.entry!);
      // Kerze mit neuem äußersten Docht (D läuft 2 weiter), Schluss über dem Einstieg
      const further: Row = [entry + 1, entry + 1.5, hc.dEnd - 2, entry + 0.5];
      const t = build([further]);
      expect(t.entry, 'Einstieg bleibt eingefroren').toBeCloseTo(t0.entry!, 6);
      expect(t.tp2, 'TP2 läuft mit dem Docht').not.toBeCloseTo(t0.tp2!, 6);
      expect(t.tp2AtEntry, 'TP2 am Einstieg = Fib A → Docht der Berührungskerze').toBeCloseTo(mir(fibPrice(130, hc.entry, 0.618)), 6);
      // 1120-A10.2: auch TP1 am Einstieg hängt am Docht der Berührungskerze; CRV und Ergebnisse in R ändern sich nach dem Einstieg nicht
      expect(t.tp1AtEntry, 'TP1 am Einstieg = Fib A → Docht der Berührungskerze').toBeCloseTo(mir(fibPrice(130, hc.entry, 0.382)), 6);
      expect(t.tp1, 'TP1 läuft mit dem Docht').not.toBeCloseTo(t0.tp1!, 6);
      const m0 = tradeMetrics(t0, side)!;
      const m1 = tradeMetrics(t, side);
      expect(m1, 'CRV bleibt vorhanden').not.toBeNull();
      expect(m1!.reward).toBeCloseTo(m0.reward, 6);
      expect(outcomesOf(t, side)).toEqual(outcomesOf(t0, side));
    });
  }
}
