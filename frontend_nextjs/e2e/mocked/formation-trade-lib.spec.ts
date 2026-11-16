/**
 * Handelsblock und Veto (A40.2, A40.3): `Candidate.trade` (Einstieg, Stop, Not-SL, TP1, Gründe), die Veto-Zeile SIG-15/SIG-16
 * und SIG-29 an der Handelsblock-Seite. Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts).
 * LIB-Basis (Verkauf) siehe formation-lib-lib.spec.ts: Einstieg 129,8, Stop P2 140, TP1 106,625, CRV 2,27.
 * FRM-39 Handelsblock, FRM-40 Veto-Zeile
 */
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { checkLibCandidate } from '../../src/lib/formation/libChecks';
import { analyzeEnc } from '../../src/lib/formation/encChecks';
import { analyzeKei } from '../../src/lib/formation/keiChecks';
import { analyzeT618 } from '../../src/lib/formation/t618Checks';
import { AXIS, ctxOf, lineRows } from '../fixtures/formation-lines';
import { buildEnv } from '../../src/lib/formation/reasons';
import { tradeSigChecks } from '../../src/lib/formation/sigChecks';
import { crvOf, emergencyStopOf, fibPrice, pipSizeOf, tradeMetrics } from '../../src/lib/formation/trade';
import { checkGarCandidate } from '../../src/lib/formation/garChecks';
import { checkBatCandidate } from '../../src/lib/formation/batChecks';
import { checkButCandidate } from '../../src/lib/formation/butChecks';
import { checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { AT as HARMONIC_AT, harmonic, makeRun } from '../fixtures/formation-harmonic';
import type { Anchor, Candidate, Trade } from '../../src/lib/formation/types';
import { END, H4, barsOf, mirror, plain, zig, type Row } from '../fixtures/formation-rows';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

const trade = (tag: '@FRM-39' | '@FRM-40') => (name: string, fn: () => void) => test(name, { tag }, fn);
const t39 = trade('@FRM-39');
const t40 = trade('@FRM-40');

const wick = (rows: Row[], idx: number, high: boolean): Anchor => ({ time: idx * H4, price: high ? rows[idx][1] : rows[idx][2] });
const LEGS = [8, 8, 8, 4, 8];
const BASE = zig([100, 130, 112, 140, 105, 131], LEGS, 3);

function lib(rows: Row[], top = true): Candidate {
  const input: ContextInput = { H4: barsOf(rows, H4) };
  return checkLibCandidate(new FormationContext('TEST', input, { trend: FIXTURE_TREND }), END, {
    tf: 'H4',
    p1: wick(rows, 10, top),
    p2: wick(rows, 26, top),
    p3: wick(rows, 30, !top),
  });
}

const tradeOf = (c: Candidate): Trade => {
  if (!c.trade) throw new Error('kein trade');
  return c.trade;
};

t39('tradeMetrics: Risiko, Gewinn und CRV je Seite; fehlender Wert oder falsche Seite = null', () => {
  const sell: Trade = { entry: 100, stop: 110, emergencyStop: null, tp1: 80, reason: {} };
  expect(tradeMetrics(sell, 'sell')).toEqual({ risk: 10, reward: 20, crv: 2 });
  expect(tradeMetrics(sell, 'buy')).toBeNull();
  expect(tradeMetrics({ ...sell, tp1: null }, 'sell')).toBeNull();
});

t39('emergencyStopOf: Stop ± 1 × ATR gegen die Position; ohne ATR null', () => {
  expect(emergencyStopOf(140, 'sell', 2)).toBe(142);
  expect(emergencyStopOf(100, 'buy', 2)).toBe(98);
  expect(emergencyStopOf(100, 'buy', null)).toBeNull();
});

t39('crvOf bleibt unverändert (Betrag): Abstand Einstieg → Ziel durch Abstand Einstieg → Stop', () => {
  expect(crvOf(100, 110, 80)).toBe(2);
  expect(crvOf(100, 100, 80)).toBeNull();
});

t39('LIB (Verkauf): Einstieg, Stop und TP1 der Handrechnung, Not-SL jenseits des Stops, CRV 2,27', () => {
  const t = tradeOf(lib(BASE));
  expect(t.entry).toBeCloseTo(129.8, 3);
  expect(t.stop).toBeCloseTo(140, 3);
  expect(t.tp1).toBeCloseTo(106.625, 3);
  expect(t.emergencyStop).toBeGreaterThan(140);
  expect(tradeMetrics(t, 'sell')!.crv).toBeCloseTo(2.27, 1);
});

t39('LIB (Kauf, gespiegelt): Not-SL liegt unter dem Stop', () => {
  const t = tradeOf(lib(mirror(BASE), false));
  expect(t.emergencyStop).toBeLessThan(t.stop!);
});

t39('LIB ohne P3: Einstieg und TP1 fehlen mit Grund, der Stop (P2) steht', () => {
  const rows = zig([100, 130, 112, 140], [8, 8, 8], 0);
  const c = checkLibCandidate(new FormationContext('TEST', { H4: barsOf(rows, H4) }, { trend: FIXTURE_TREND }), END, { tf: 'H4', p1: wick(rows, 10, true), p2: wick(rows, 26, true) });
  const t = tradeOf(c);
  expect(t.entry).toBeNull();
  expect(t.tp1).toBeNull();
  expect(t.stop).toBeCloseTo(140, 3);
  expect(t.reason.entry).toBeTruthy();
  expect(t.reason.tp1).toBeTruthy();
});

t39('SIG-29: CRV 2,27 ist ☑ mit Wert; ein enger Gewinn (CRV ≤ 1) ist nicht ☑', () => {
  const ok = tradeOf(lib(BASE)).sig29!;
  expect(ok.id).toBe('SIG-29');
  expect(ok.state).toBe('met');
  expect(ok.value).toBeCloseTo(2.27, 1);
});

t40('Veto: LIB-Verkauf trägt SIG-16, LIB-Kauf trägt SIG-15; Ausschluss mit veto = true', () => {
  const sell = lib(BASE).checks.filter((k) => k.veto);
  expect(sell.map((k) => k.id)).toEqual(['SIG-16']);
  expect(sell[0].kind).toBe('exclusion');
  const buy = lib(mirror(BASE), false).checks.filter((k) => k.veto);
  expect(buy.map((k) => k.id)).toEqual(['SIG-15']);
});

t40('Veto ändert das Urteil nicht: Urteil und Pflichtzähler gleich ohne die Veto-Zeile', () => {
  const c = lib(BASE);
  const without = { ...c, checks: c.checks.filter((k) => !k.veto) };
  expect(without.checks.length).toBe(c.checks.length - 1);
  expect(c.verdict).toBe('valid');
});

// ---- T618, ENC, KEI auf den Basisreihen ihrer Tests (Verkauf nach Aufwärtstrend; gespiegelt = Kauf) ----------------

const T618_BASE = lineRows([100, 140, 118, 150, 130, 156, 118, 142]);
const ENC_BASE = lineRows([100, 150, 130, 179, 160, 195, 150]);
const KEI_BASE = lineRows([100, 150, 130, 176, 160, 202, 150]);

const lineCases = [
  { name: 'T618', rows: T618_BASE, run: (rows: Row[]) => analyzeT618(ctxOf(rows), END)[0].candidate, tp1: true },
  { name: 'ENC', rows: ENC_BASE, run: (rows: Row[]) => analyzeEnc(ctxOf(rows), END)[0].candidate, tp1: false },
  { name: 'KEI', rows: KEI_BASE, run: (rows: Row[]) => analyzeKei(ctxOf(rows), END)[0].candidate, tp1: true },
];

for (const lc of lineCases) {
  for (const buy of [false, true]) {
    const side = buy ? 'buy' : 'sell';
    t39(`${lc.name} (${side}): Stop liegt auf der Verlustseite des Einstiegs, Not-SL dahinter, TP1 ${lc.tp1 ? 'auf der Gewinnseite' : 'fehlt mit Grund (Regelbuch nennt kein Ziel 1)'}`, () => {
      const c = lc.run(buy ? mirror(lc.rows, AXIS) : lc.rows);
      expect(c.side).toBe(side);
      const t = tradeOf(c);
      expect(t.entry).not.toBeNull();
      expect(t.stop).not.toBeNull();
      // KEI-Basis: der Ausbruch schließt genau auf der Kante der Zone von H2 (Entry = Stop, Risiko 0): die Zone ist nicht auf der anderen Seite
      expect(buy ? t.stop! <= t.entry! : t.stop! >= t.entry!).toBe(true);
      expect(buy ? t.emergencyStop! < t.stop! : t.emergencyStop! > t.stop!).toBe(true);
      if (lc.tp1) {
        expect(t.tp1).not.toBeNull();
        expect(buy ? t.tp1! > t.entry! : t.tp1! < t.entry!).toBe(true);
        if (lc.name !== 'KEI') expect(tradeMetrics(t, c.side)).not.toBeNull();
      } else {
        expect(t.tp1).toBeNull();
        expect(t.reason.tp1).toBeTruthy();
      }
    });
    t40(`${lc.name} (${side}): genau eine Veto-Zeile ${buy ? 'SIG-15' : 'SIG-16'}, Ausschluss, das Urteil hängt nicht von ihr ab`, () => {
      const c = lc.run(buy ? mirror(lc.rows, AXIS) : lc.rows);
      const veto = c.checks.filter((k) => k.veto);
      expect(veto.map((k) => k.id)).toEqual([buy ? 'SIG-15' : 'SIG-16']);
      expect(veto[0].kind).toBe('exclusion');
      expect(c.invalidBy ?? []).not.toContain(veto[0].id);
    });
  }
}

// ---- Veto und SIG-29 direkt (tradeSigChecks) --------------------------------------------------------------------

const LEAD: Row[] = Array.from({ length: 40 }, () => plain(100, 100));
/** Divergenz am Hoch (siehe formation-lib-lib.spec.ts): P2 wird in 14 statt 8 Kerzen erreicht, die Wave ist dort schwächer als an P1 */
const DIVERGENT = [...LEAD, ...zig([100, 130, 112, 140, 105, 131], [8, 8, 14, 4, 8], 3)];

t40('SIG-15 (Kauf) ist ☑ bei Wave-Abweichung an den letzten zwei Hochs; SIG-16 (Verkauf) prüft die Tiefs und bleibt davon unberührt', () => {
  const env = buildEnv(new FormationContext('TEST', { H4: barsOf(DIVERGENT, H4) }, { trend: FIXTURE_TREND }), END, 'H4')!;
  const any = { entry: 100, stop: 90, tp1: 130 };
  const buy = tradeSigChecks(env, 'H4', 'buy', any).veto;
  expect(buy).toMatchObject({ id: 'SIG-15', kind: 'exclusion', status: 'confirmed', state: 'met', veto: true });
  const sell = tradeSigChecks(env, 'H4', 'sell', any).veto;
  expect(sell).toMatchObject({ id: 'SIG-16', kind: 'exclusion', status: 'assumption', veto: true });
  expect(sell.state).not.toBe('met');
});

t39('SIG-29: CRV über 1 ☑ mit Wert; CRV ≤ 1 ohne tiefere ZE nicht messbar mit Wert; fehlender Wert nicht messbar ohne Wert', () => {
  const env = buildEnv(new FormationContext('TEST', { H4: barsOf(DIVERGENT, H4) }, { trend: FIXTURE_TREND }), END, 'H4')!;
  expect(tradeSigChecks(env, 'H4', 'buy', { entry: 100, stop: 90, tp1: 130 }).sig29).toMatchObject({ id: 'SIG-29', state: 'met', value: 3 });
  expect(tradeSigChecks(env, 'H4', 'buy', { entry: 100, stop: 90, tp1: 105 }).sig29).toMatchObject({ state: 'unmeasurable', value: 0.5 });
  const missing = tradeSigChecks(env, 'H4', 'buy', { entry: 100, stop: null, tp1: 130 }).sig29;
  expect(missing.state).toBe('unmeasurable');
  expect(missing.value).toBeUndefined();
});

t39('pipSizeOf: 10 × Punkt bei 3 oder 5 Nachkommastellen, sonst null', () => {
  expect(pipSizeOf(5)).toBeCloseTo(1e-4, 12);
  expect(pipSizeOf(3)).toBeCloseTo(1e-2, 12);
  for (const d of [0, 1, 2, 4, null]) expect(pipSizeOf(d)).toBeNull();
});

// ---- Harmoniken: Einstieg am D-Level (GAR, BAT), Stop eingefroren (alle vier) -----------------------------------
// Das D wandert mit dem äußersten Docht. Nach der Berührung des D-Levels ändert eine weitere Kerze jenseits des Levels
// weder den Einstieg (GAR, BAT: D-Level) noch den Stop; nur TP1 läuft mit dem neuen Ende der Ziel-Fib.

const H_LEGS = [18, 4, 4, 4];
const H_AT = { x: 2, a: 20, b: 24, c: 28 };
const GAR_ROWS = zig([100, 130, 111.46, 122.92, 106.41], H_LEGS, 3);
const BAT_ROWS = zig([100, 130, 115, 120.8, 103.42], H_LEGS, 3);
const BUT_ROWS = harmonic([100, 130, 106, 120.16, 91.8]);
const CRB_ROWS = harmonic([100, 130, 112, 123.68, 81.4]);
const HARMONIC_AT_NO_D = { x: HARMONIC_AT.x, a: HARMONIC_AT.a, b: HARMONIC_AT.b, c: HARMONIC_AT.c };

/** hängt eine Kerze an, deren Tief `low` unter dem bisherigen D liegt (Kauf) */
const overshoot = (rows: Row[], low: number): Row[] => {
  const close = rows[rows.length - 1][3];
  return [...rows, [close, close + 0.1, low, low + 1]];
};

const harmonicCases = [
  { code: 'GAR', check: checkGarCandidate, rows: GAR_ROWS, at: H_AT, low: 104, entryLevel: 111.46 - 0.272 * (130 - 111.46), dEnd: 106.41, entryAtLevel: true },
  { code: 'BAT', check: checkBatCandidate, rows: BAT_ROWS, at: H_AT, low: 101, entryLevel: 130 + 0.886 * (100 - 130), dEnd: 103.42, entryAtLevel: true },
  { code: 'BUT', check: checkButCandidate, rows: BUT_ROWS, at: HARMONIC_AT_NO_D, low: 90, entryLevel: 0, dEnd: 91.8, entryAtLevel: false },
  { code: 'CRB', check: checkCrbCandidate, rows: CRB_ROWS, at: HARMONIC_AT_NO_D, low: 80, entryLevel: 0, dEnd: 81.4, entryAtLevel: false },
] as const;

for (const hc of harmonicCases) {
  for (const buy of [true, false]) {
    t39(`${hc.code} (${buy ? 'Kauf' : 'Verkauf'}): Stop bleibt nach einer Kerze jenseits des D-Levels stehen, TP1 läuft mit${hc.entryAtLevel ? ', Einstieg bleibt am D-Level' : ''}`, () => {
      const run = makeRun(hc.check, hc.at as never);
      const go = (rows: Row[]) => tradeOf(run({ H4: buy ? rows : mirror(rows) }, hc.at as never, { buy }));
      const mir = (p: number) => (buy ? p : 200 - p);
      const before = go(hc.rows);
      const after = go(overshoot(hc.rows, hc.low));
      // Anker des Stops: bei GAR und BAT das D-Level, bei BUT und CRB das Ende der Ziel-Fib bei der ersten Berührung
      const anchor = hc.entryAtLevel ? hc.entryLevel : hc.dEnd;
      const stop = mir(fibPrice(130, anchor, -0.382));
      expect(before.stop, 'Stop vorher').toBeCloseTo(stop, 6);
      expect(after.stop, 'Stop nachher').toBeCloseTo(stop, 6);
      expect(after.tp1, 'TP1 läuft mit').toBeCloseTo(mir(fibPrice(130, hc.low, 0.382)), 6);
      if (hc.entryAtLevel) {
        expect(before.entry, 'Einstieg vorher').toBeCloseTo(mir(hc.entryLevel), 6);
        expect(after.entry, 'Einstieg nachher').toBeCloseTo(mir(hc.entryLevel), 6);
        expect(after.tp1AtEntry, 'TP1 am Einstieg').toBeCloseTo(mir(fibPrice(130, hc.entryLevel, 0.382)), 6);
      }
    });
  }
}
