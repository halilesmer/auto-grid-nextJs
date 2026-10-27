/**
 * AB=CD (ABCD): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `zig(punkte, 8, 0)` setzt die Wendepunkte
 * auf Index 2, 10, 18, 26 … (8 Kerzen je Zug); die Anker A, B, C kommen mit ihren Indizes in `run`.
 * Verkaufs-Formation: A = Tief, B = Hoch, C = Tief; Level 1 = C + (B − A).
 * FRM-05 Formationserkennung: AB=CD
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { timeframeExcluded } from '../../src/lib/formation/abcd';
import {
  ABCD_CHECK_IDS,
  ABCD_UNMEASURABLE_IDS,
  analyzeAbcd,
  checkAbcdCandidate,
} from '../../src/lib/formation/abcdChecks';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H4, barsOf, mirror, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-05' }, fn);

const STEP = { D1, H4 } as const;
type Tf = keyof typeof STEP;

const ctxOf = (input: Partial<Record<Tf, Row[]>>) => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext('TEST', bars);
};

/** Wick einer Zeile: Hoch oder Tief */
const wick = (rows: Row[], idx: number, high: boolean): Anchor => ({ time: idx * H4, price: high ? rows[idx][1] : rows[idx][2] });

/** Prüft A, B, C (und D) einer Verkaufs-Formation; `sell = false` für die gespiegelte Kauf-Formation */
function run(
  input: Partial<Record<Tf, Row[]>>,
  at: { a: number; b: number; c: number; d?: number },
  options: { sell?: boolean; t?: number } = {},
): Candidate {
  const rows = input.H4!;
  const sell = options.sell ?? true;
  return checkAbcdCandidate(ctxOf(input), options.t ?? END, {
    tf: 'H4',
    a: wick(rows, at.a, !sell),
    b: wick(rows, at.b, sell),
    c: wick(rows, at.c, !sell),
    ...(at.d === undefined ? {} : { d: wick(rows, at.d, sell) }),
  });
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

const ABC = { a: 2, b: 10, c: 18 };

// ---- Reihen: Form ----------------------------------------------------------------------------------------------

/** A 100, B 130, C 114 (Tiefe 0,533), D 144 = Level 1; D ist die letzte Kerze, ohne Fraktal */
const S1 = zig([100, 130, 114, 144], 8, 0);
/** Wie S1 mit drei Kerzen danach: D wird ein fertiges Fraktal und damit eine Zone */
const S1_TAIL = zig([100, 130, 114, 144], 8, 3);
/** D noch nicht erreicht: nach C drei kleine Schritte aufwärts */
const S_FORMING = zig([100, 130, 114], 8, 3);
/** C 125: Tiefe 0,167 */
const S_SHALLOW = zig([100, 130, 125, 155], 8, 0);
/** C 95 unter A: Tiefe 1,167 */
const S_BEYOND_A = zig([100, 130, 95, 125], 8, 0);
/** C 105: Tiefe 0,833, Level 1 135 liegt unter −0.272 (138,16) */
const S_DEEP = zig([100, 130, 105, 135], 8, 0);
/** D 143 statt 144: fehlt 0,033 von AB */
const S_NEAR_MISS = zig([100, 130, 114, 143], 8, 0);
/** D 141: fehlt 0,1 von AB */
const S_MISS = zig([100, 130, 114, 141], 8, 0);
/** Wie unten, D 138,3: fehlt 0,003 von AB (Toleranz hält), ABCD-07 streng ☐ */
const S_CONFLUENCE_NEAR = zig([100, 130, 108.4, 138.3], 8, 0);
/** C 108,4: Tiefe 0,72, Level 1 138,4 liegt 0,24 neben −0.272 (138,16) */
const S_CONFLUENCE = zig([100, 130, 108.4, 138.4], 8, 0);
/** Innere Bewegung im D-Bein: A' 120, B' 170, C' 134 ergibt D' = 134 + 50 = 184 = Level 1 (124 + 60) */
const S_DOUBLE = zig([100, 160, 124, 150, 120, 170, 134, 184], 8, 0);
const DOUBLE = { a: 2, b: 10, c: 18 };

// ---- Reihen: Zone am D -----------------------------------------------------------------------------------------

/** Widerstand 140 (Index 2), dann A 100, B 130, C 110: Level 1 = 140; D 139,9 liegt in der Zone, ohne Schluss darüber */
const Z_INSIDE = zig([140, 100, 130, 110, 139.9], 8, 0);
/** Wie oben, D 143: die Kerzen schließen über der Zone */
const Z_THROUGH = zig([140, 100, 130, 110, 143], 8, 0);
/** Wie oben, D 133: der Kurs bleibt mehr als eine Zonenhöhe unter der Zone (kein Test) */
const Z_BELOW = zig([140, 100, 130, 110, 133], 8, 0);
const ZABC = { a: 10, b: 18, c: 26 };
/** Tageskerzen: Widerstand bei 140 (Fraktal-Hoch) */
const D1_ZONE = zig([140, 100, 125], 4);
/** Tageskerzen weit weg vom Level 1 */
const D1_FAR = zig([60, 40, 50], 4);
/** Tageskerzen im Aufwärtstrend weit unter dem Kurs */
const D1_UP = zig([10, 40, 28, 38]);
const D1_DOWN = mirror(D1_UP);

// ---- Reihen: Signale am D --------------------------------------------------------------------------------------

/** Hochs 130@14, 135@38, 138@62: Wave-Spitze am Hoch 138 (7,18) unter der am Hoch 135 (9,84), RSI am Hoch 138 = 88,5 */
const DIV_BEAR = zig([100, 130, 112, 135, 120, 138], 12);
/** Das dritte Hoch 150: Wave-Spitze stärker, keine Divergenz */
const DIV_NONE = zig([100, 130, 112, 135, 120, 150], 12);
/** Wie DIV_BEAR, der letzte Zug aus Treppen: RSI am Hoch 138 = 75,3 */
const DIV_STAIRS = (() => {
  const closes = [124, 128, 125, 129, 126, 131, 133];
  let prev = DIV_BEAR[54][3];
  const rows = closes.map((c): Row => {
    const row = plain(prev, c);
    prev = c;
    return row;
  });
  return [...DIV_BEAR.slice(0, 55), ...rows, ...DIV_BEAR.slice(62)];
})();
const DIV = { a: 26, b: 38, c: 50 };
/** Die Kerze direkt nach C: der RSI liegt nach dem Abstieg weit unten */
const DIV_EARLY = { ...DIV, d: 51 };

/** Kerzen mit Spanne 1,2 steigen auf 100, danach zwei volumenstarke Aufwärtskerzen (Spanne 6,1 ≥ 1,5 × Mittel) */
const rise24 = Array.from({ length: 24 }, (_, i): Row => plain(76 + i, 77 + i));
const WIDE2 = [...rise24, [100, 106, 99.9, 105.5] as Row, [105.5, 111.6, 105.4, 111] as Row];
const WIDE1 = [...rise24, [100, 106, 99.9, 105.5] as Row, plain(105.5, 106.5)];
const WIDE_AT = { a: 20, b: 22, c: 23, d: 25 };
/** D 138 am Ende, danach eine Abwärtskerze, die unter dem Tief der Vorkerze schließt (Engulf nach dem D) */
/** A 100, B 130, C 112, D 129,85 = Doppeltop: D berührt die Zone von B (128,875 bis 130), kein Schluss über B, RSI(7) an B über 80 */
const S_DOUBLE_TOP = zig([120, 100, 130, 112, 129.85], 8, 3);
const DT = { a: 10, b: 18, c: 26, d: 34 };
const S_ENGULF = [...zig([100, 130, 114, 138], 8, 0), [137.7, 137.8, 133, 133.5] as Row];

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  {
    name: 'Form: Tiefe 0,533, D genau auf Level 1',
    candidate: () => run({ H4: S1 }, ABC),
    expect: {
      'ABCD-01': M, 'ABCD-02': M, 'ABCD-03': M, 'ABCD-04': M, 'ABCD-05': M, 'ABCD-06': M, 'ABCD-07': M, 'ABCD-08': M,
      'ABCD-10': N, 'ABCD-11': M, 'ABCD-15': N, 'ABCD-25': N,
    },
  },
  {
    name: 'Anker A nicht an der Dochtspitze',
    candidate: () => checkAbcdCandidate(ctxOf({ H4: S1 }), END, {
      tf: 'H4',
      a: { time: 2 * H4, price: S1[2][2] + 0.5 },
      b: wick(S1, 10, true),
      c: wick(S1, 18, false),
    }),
    expect: { 'ABCD-01': N },
  },
  {
    name: 'C ist kein fertiges Fraktal (Kerze mitten im D-Bein)',
    candidate: () => run({ H4: S1 }, { a: 2, b: 10, c: 22 }),
    expect: { 'ABCD-02': N },
  },
  {
    name: 'Ohne Schluss jenseits von B ist das D-Bein kein neuer Impuls',
    candidate: () => run({ H4: S_FORMING }, ABC),
    expect: { 'ABCD-03': N, 'ABCD-07': N, 'ABCD-08': N },
  },
  {
    name: 'Korrektur nur 0,167: Mindestkorrektur 0,382 fehlt',
    candidate: () => run({ H4: S_SHALLOW }, ABC),
    expect: { 'ABCD-04': N, 'ABCD-05': M, 'ABCD-06': M },
  },
  {
    name: 'C unter A: Tiefe 1,167, keine Mindest-Extension',
    candidate: () => run({ H4: S_BEYOND_A }, ABC),
    expect: { 'ABCD-04': M, 'ABCD-05': N, 'ABCD-06': N },
  },
  {
    name: 'C zu tief: Tiefe 0,833 lässt Level 1 unter −0.272 liegen',
    candidate: () => run({ H4: S_DEEP }, ABC),
    expect: { 'ABCD-04': M, 'ABCD-05': M, 'ABCD-06': N },
  },
  {
    name: 'D fehlt 0,033 von AB: Toleranz 5 % hält, streng nicht erreicht',
    candidate: () => run({ H4: S_NEAR_MISS }, ABC),
    expect: { 'ABCD-07': N, 'ABCD-08': M },
  },
  {
    name: 'D fehlt 0,1 von AB: außerhalb der Toleranz',
    candidate: () => run({ H4: S_MISS }, ABC),
    expect: { 'ABCD-07': N, 'ABCD-08': N },
  },
  {
    name: 'Doppeltes AB=CD: innere Bewegung endet auf Level 1',
    candidate: () => run({ H4: S_DOUBLE }, DOUBLE),
    expect: { 'ABCD-09': M },
  },
  {
    name: 'Kein doppeltes AB=CD ohne innere Bewegung',
    candidate: () => run({ H4: S1 }, ABC),
    expect: { 'ABCD-09': N },
  },
  {
    name: 'Die Zone, die das D selbst bildet (fertiges Fraktal am D), zählt nicht als Ort des D',
    candidate: () => run({ H4: S1_TAIL }, ABC),
    expect: { 'ABCD-10': N, 'ABCD-13': U },
  },
  {
    name: 'Zone am D: Konfluenz mit −0.272 zählt als Zone und als zweites Level',
    candidate: () => run({ H4: S_CONFLUENCE }, ABC),
    expect: { 'ABCD-10': M, 'ABCD-15': M, 'ABCD-06': M },
  },
  {
    name: 'Zone am D: Widerstand liegt auf Level 1, der Kurs erreicht sie ohne Schluss darüber',
    candidate: () => run({ H4: Z_INSIDE }, ZABC),
    expect: { 'ABCD-10': M, 'ABCD-22': N, 'ABCD-13': N },
  },
  {
    name: 'Kurs schließt über der Zone am D',
    candidate: () => run({ H4: Z_THROUGH }, ZABC),
    expect: { 'ABCD-22': M },
  },
  {
    name: 'Zone am D noch ungetestet, solange der Kurs sie nicht erreicht',
    candidate: () => run({ H4: Z_BELOW }, ZABC),
    expect: { 'ABCD-10': M, 'ABCD-13': M, 'ABCD-22': N },
  },
  {
    name: 'ATR(14) fehlt bei zu wenigen Kerzen: „nahe“ nicht messbar',
    candidate: () => run({ H4: zig([100, 130, 114], 2, 0) }, { a: 2, b: 4, c: 6 }),
    expect: { 'ABCD-11': N, 'ABCD-10': U, 'ABCD-09': U, 'ABCD-15': U },
  },
  {
    name: 'Zone aus der Tageskerze am D',
    candidate: () => run({ D1: D1_ZONE, H4: Z_INSIDE }, ZABC),
    expect: { 'ABCD-12': M },
  },
  {
    name: 'Tageskerzen geladen, aber keine Zone nahe Level 1',
    candidate: () => run({ D1: D1_FAR, H4: Z_INSIDE }, ZABC),
    expect: { 'ABCD-12': N },
  },
  {
    name: 'Ohne höhere Zeiteinheit ist ABCD-12 nicht messbar',
    candidate: () => run({ H4: Z_INSIDE }, ZABC),
    expect: { 'ABCD-12': U, 'ABCD-14': U },
  },
  {
    name: 'Verkauf mit dem Trend der Tageskerzen (abwärts)',
    candidate: () => run({ D1: D1_DOWN, H4: S1 }, ABC),
    expect: { 'ABCD-14': M },
  },
  {
    name: 'Verkauf gegen den Trend der Tageskerzen (aufwärts)',
    candidate: () => run({ D1: D1_UP, H4: S1 }, ABC),
    expect: { 'ABCD-14': N },
  },
  {
    name: 'RSI(7) am D bei 88,5: Extrem und kurz davor',
    candidate: () => run({ H4: DIV_BEAR }, DIV),
    expect: { 'ABCD-17': M, 'ABCD-18': M, 'ABCD-19': M },
  },
  {
    name: 'RSI(7) am D bei 75,3: nur kurz vor dem Extrem',
    candidate: () => run({ H4: DIV_STAIRS }, DIV),
    expect: { 'ABCD-17': N, 'ABCD-18': M },
  },
  {
    name: 'RSI(7) unten (Kerze nach C): weder Extrem noch kurz davor',
    candidate: () => run({ H4: DIV_BEAR }, DIV_EARLY),
    expect: { 'ABCD-17': N, 'ABCD-18': N },
  },
  {
    name: 'Kein Hoch über dem Preis des vorigen Hochs mit schwächerer Wave: Divergenz fehlt',
    candidate: () => run({ H4: DIV_NONE }, DIV),
    expect: { 'ABCD-19': N },
  },
  {
    name: 'Umkehrkerze nach dem D: Engulf in Verkaufsrichtung',
    candidate: () => run({ H4: S_ENGULF }, ABC),
    expect: { 'ABCD-20': M },
  },
  {
    name: 'Keine Umkehrkerze nach dem D',
    candidate: () => run({ H4: S1 }, ABC),
    expect: { 'ABCD-20': N },
  },
  {
    name: 'Gegen den Trend und keine Divergenz schließt aus',
    candidate: () => run({ D1: D1_UP, H4: DIV_NONE }, DIV),
    expect: { 'ABCD-14': N, 'ABCD-19': N, 'ABCD-21': M },
  },
  {
    name: 'Gegen den Trend, aber mit Divergenz: kein Ausschluss',
    candidate: () => run({ D1: D1_UP, H4: DIV_BEAR }, DIV),
    expect: { 'ABCD-14': N, 'ABCD-19': M, 'ABCD-21': N },
  },
  {
    name: 'Mit dem Trend: kein Ausschluss, auch ohne Divergenz',
    candidate: () => run({ D1: D1_DOWN, H4: DIV_NONE }, DIV),
    expect: { 'ABCD-14': M, 'ABCD-19': N, 'ABCD-21': N },
  },
  {
    name: 'ABCD-24: D berührt die Zone von B ohne Schluss darüber, RSI an B im Extrem, Trend steigt: Doppeltop',
    candidate: () => run({ H4: S_DOUBLE_TOP }, DT),
    expect: { 'ABCD-24': M },
  },
  {
    name: 'ABCD-24: D schließt weit über B, kein Doppeltop',
    candidate: () => run({ H4: S1 }, ABC),
    expect: { 'ABCD-24': N },
  },
  {
    name: 'Zwei volumenstarke Kerzen in Richtung D schließen aus',
    candidate: () => run({ H4: WIDE2 }, WIDE_AT),
    expect: { 'ABCD-23': M },
  },
  {
    name: 'Nur eine volumenstarke Kerze im D-Bein',
    candidate: () => run({ H4: WIDE1 }, WIDE_AT),
    expect: { 'ABCD-23': N },
  },
];

test.describe('ABCD: Bedingungen', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const candidate = c.candidate();
      const got = Object.fromEntries(Object.keys(c.expect).map((id) => [id, state(candidate, id)]));
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('ABCD: Abdeckung und Eigenschaften', () => {
  frm('jede messbare Bedingung hat einen Fall mit ☑ und einen mit ☐', () => {
    const missing: string[] = [];
    for (const id of ABCD_CHECK_IDS) {
      if (ABCD_UNMEASURABLE_IDS.includes(id)) continue;
      const states = new Set(CASES.map((c) => c.expect[id]).filter((s) => s !== undefined));
      // ABCD-25 ☑ gibt es nur für M1 und M5; der Kontext lädt sie nicht, den ☑-Fall deckt der Test der Funktion ab
      if (!states.has(M) && id !== 'ABCD-25') missing.push(`${id} ☑`);
      if (!states.has(N)) missing.push(`${id} ☐`);
    }
    expect(missing).toEqual([]);
  });

  frm('ABCD-16 ist immer nicht messbar', () => {
    const c = run({ H4: S1 }, ABC);
    expect(ABCD_UNMEASURABLE_IDS.map((id) => state(c, id))).toEqual([U]);
  });

  frm('ABCD-25: M1 und M5 sind ausgeschlossen, die Zeiteinheiten des Kontexts nicht', () => {
    expect(['M1', 'M5'].map(timeframeExcluded)).toEqual([true, true]);
    expect(['M15', 'M30', 'H1', 'H4', 'D1'].map(timeframeExcluded)).toEqual([false, false, false, false, false]);
  });

  frm('Verkaufs-Formation und gespiegelte Kauf-Formation haben dieselben Zustände', () => {
    const sell = run({ H4: DIV_BEAR }, DIV);
    const buy = run({ H4: mirror(DIV_BEAR) }, DIV, { sell: false });
    expect(sell.side).toBe('sell');
    expect(buy.side).toBe('buy');
    expect(buy.checks.map((c) => [c.id, c.state, c.kind])).toEqual(sell.checks.map((c) => [c.id, c.state, c.kind]));
    expect(buy.verdict).toBe(sell.verdict);
  });

  frm('Kauf-Formation: gespiegelte Zone, Engulf und volumenstarkes D-Bein geben dieselben Zustände', () => {
    const pairs: [Row[], { a: number; b: number; c: number; d?: number }, string[]][] = [
      [Z_THROUGH, ZABC, ['ABCD-10', 'ABCD-22']],
      [S_ENGULF, ABC, ['ABCD-20', 'ABCD-07']],
      [WIDE2, WIDE_AT, ['ABCD-23']],
    ];
    for (const [rows, idx, ids] of pairs) {
      const sell = run({ H4: rows }, idx);
      const buy = run({ H4: mirror(rows) }, idx, { sell: false });
      expect(ids.map((id) => state(buy, id))).toEqual(ids.map((id) => state(sell, id)));
    }
    expect(state(run({ H4: mirror(WIDE2) }, WIDE_AT, { sell: false }), 'ABCD-23')).toBe(M);
    expect(state(run({ H4: mirror(S_ENGULF) }, ABC, { sell: false }), 'ABCD-20')).toBe(M);
  });

  frm('Auswahl: das jüngste C mit passender Korrekturtiefe, sonst der letzte Wendepunkt', () => {
    const pick = (rows: Row[]) => analyzeAbcd(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate.points;
    // Pivots 100, 130, 114, 144, 141: die letzten beiden Dreiergruppen haben Tiefe 0,1 bzw. negativ, die erste 0,533
    expect(pick(zig([100, 130, 114, 144, 141], 8, 3)).C).toEqual({ time: 18 * H4, price: 114 });
    // Pivots 100, 130, 125, 155: keine Gruppe passt, es bleibt der letzte Wendepunkt als C
    expect(pick(zig([100, 130, 125, 155], 8, 3)).C).toEqual({ time: 26 * H4, price: 155 });
  });

  frm('Bedingte Art: ABCD-20 ist Pflicht ohne RSI-Extrem, sonst Verstärkung', () => {
    expect(find(run({ H4: DIV_BEAR }, DIV_EARLY), 'ABCD-20').kind).toBe('required');
    expect(find(run({ H4: DIV_BEAR }, DIV), 'ABCD-20').kind).toBe('bonus');
  });

  frm('Bedingte Art: ABCD-19 ist Pflicht gegen den Trend, sonst Verstärkung', () => {
    expect(find(run({ D1: D1_UP, H4: DIV_BEAR }, DIV), 'ABCD-19').kind).toBe('required');
    expect(find(run({ D1: D1_DOWN, H4: DIV_BEAR }, DIV), 'ABCD-19').kind).toBe('bonus');
  });

  frm('Urteil: gültig, im Aufbau und ungültig', () => {
    expect([
      run({ H4: S_CONFLUENCE }, ABC).verdict,
      run({ H4: S_CONFLUENCE_NEAR }, ABC).verdict,
      // DIV_BEAR: D 138 liegt nur 3 über B 135 (0,13 von AB, unter 0,272, keine volumenstarke Kerze) bei RSI 88,5 an B: Doppeltop (ABCD-24 ☑)
      run({ H4: DIV_BEAR }, DIV).verdict,
      run({ H4: S_FORMING }, ABC).verdict,
      run({ H4: S_DEEP }, ABC).verdict,
      run({ H4: Z_THROUGH }, ZABC).verdict,
      run({ H4: WIDE2 }, WIDE_AT).verdict,
      run({ H4: S_DOUBLE_TOP }, DT).verdict,
    ]).toEqual(['valid', 'valid', 'invalid', 'forming', 'invalid', 'invalid', 'invalid', 'invalid']);
  });

  frm('Automatische Auswahl: Verkaufs-Formation und ihr Spiegel liefern A, B, C aus den Wendepunkten', () => {
    const sell = analyzeAbcd(ctxOf({ H4: S1_TAIL }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(sell.side).toBe('sell');
    expect(sell.points).toEqual({
      A: { time: 2 * H4, price: S1_TAIL[2][2] },
      B: { time: 10 * H4, price: S1_TAIL[10][1] },
      C: { time: 18 * H4, price: S1_TAIL[18][2] },
      D: { time: 26 * H4, price: S1_TAIL[26][1] },
    });
    const buy = analyzeAbcd(ctxOf({ H4: mirror(S1_TAIL) }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(buy.side).toBe('buy');
    expect(buy.checks.map((c) => [c.id, c.state])).toEqual(sell.checks.map((c) => [c.id, c.state]));
  });

  frm('Ohne drei Wendepunkte gibt es keine Formation: alles nicht messbar, im Aufbau', () => {
    const c = analyzeAbcd(ctxOf({ H4: zig([100, 130], 8, 3) }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(c.checks.every((x) => x.state === U)).toBe(true);
    expect(c.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [24, 31]) {
      const full = analyzeAbcd(ctxOf({ H4: S1_TAIL }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeAbcd(ctxOf({ H4: S1_TAIL.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Punkte ohne geschlossene Kerze sind nicht messbar', () => {
    const c = checkAbcdCandidate(ctxOf({ H4: S1 }), END, {
      tf: 'H4',
      a: { time: 999 * H4, price: 100 },
      b: wick(S1, 10, true),
      c: wick(S1, 18, false),
    });
    expect(c.checks.every((x) => x.state === U)).toBe(true);
  });

  frm('Zeichnungen: Zickzack, Level 1, Fib A → B, Zone, Ziel-Fib und Label auch bei ☐', () => {
    const c = run({ H4: S1 }, ABC);
    const ids = c.drawings.map((d) => d.id);
    expect(ids).toEqual(['Z-ABCD-01', 'Z-ABCD-02', 'Z-ABCD-03', 'Z-ABCD-04', 'Z-ABCD-06', 'Z-ABCD-05']);
    const zigzag = c.drawings.find((d) => d.id === 'Z-ABCD-01')!;
    expect(zigzag.anchors.map((a) => a.price)).toEqual([S1[2][2], S1[10][1], S1[18][2], S1[26][1]]);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-02')!.anchors[0].price).toBe(144);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-03')!.levels).toEqual([0.382, -0.272]);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-05')!.levels).toEqual([0.382, 0.618, -0.382]);
    expect(find(c, 'ABCD-07').drawings).toEqual(['Z-ABCD-02', 'Z-ABCD-06']);
    // ohne erreichtes D: Zickzack nur bis C, keine Ziel-Fib
    const forming = run({ H4: S_FORMING }, ABC);
    expect(forming.drawings.map((d) => d.id)).not.toContain('Z-ABCD-05');
    expect(forming.drawings.find((d) => d.id === 'Z-ABCD-01')!.anchors).toHaveLength(3);
    // mit Divergenz zielt die Fib von A aus und trägt 0.786
    const rows = DIV_BEAR;
    const div = checkAbcdCandidate(ctxOf({ H4: rows }), END, {
      tf: 'H4',
      a: wick(rows, DIV.a, false),
      b: wick(rows, DIV.b, true),
      c: wick(rows, DIV.c, false),
      d: { time: 62 * H4, price: 143 },
    });
    const target = div.drawings.find((d) => d.id === 'Z-ABCD-05');
    expect(target?.levels).toEqual([0.382, 0.618, 0.786, -0.382]);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (name: string, iso: string): Candidate => {
  const fx = loadFixture(name);
  const ctx = new FormationContext(fx.symbol, { H4: fx.bars } as ContextInput);
  return analyzeAbcd(ctx, at(iso)).find((a) => a.tf === 'H4')!.candidate;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));

test.describe('ABCD: echte Kerzen', () => {
  frm('sig-rsi-h4-01: Negativ – Verkauf mit RSI(7) über 80 am D, doch der Kurs ist durch die Zone nahe Level 1 geschlossen', () => {
    const c = analyzeAt('sig-rsi-h4-01', '2025-11-11T04:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-04', 'ABCD-06', 'ABCD-08', 'ABCD-09', 'ABCD-10', 'ABCD-17', 'ABCD-22'])).toEqual([M, M, M, M, M, M, M]);
    expect(find(c, 'ABCD-17').value!).toBeGreaterThanOrEqual(80);
    expect(c.verdict).toBe('invalid');
  });

  frm('sig-diverg-h4-01: Verkauf am D mit Wave-Divergenz und Umkehrkerze ist gültig', () => {
    const c = analyzeAt('sig-diverg-h4-01', '2025-11-25T08:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-08', 'ABCD-17', 'ABCD-19', 'ABCD-20'])).toEqual([M, N, M, M]);
    expect(c.verdict).toBe('valid');
  });

  frm('abcd-double-h4-01: Verkauf am D mit RSI(7) über 80 ohne Umkehrkerze ist gültig', () => {
    const c = analyzeAt('abcd-double-h4-01', '2025-11-13T00:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-08', 'ABCD-17', 'ABCD-20'])).toEqual([M, M, N]);
    expect(find(c, 'ABCD-17').value!).toBeGreaterThanOrEqual(80);
    expect(find(c, 'ABCD-20').kind).toBe('bonus');
    expect(c.verdict).toBe('valid');
  });

  frm('sig-diverg-h4-01: Kauf am D ohne RSI-Extrem, Umkehrkerze vorhanden, aber Zone durchbrochen', () => {
    const c = analyzeAt('sig-diverg-h4-01', '2025-12-02T12:00');
    expect(c.side).toBe('buy');
    expect(states(c, ['ABCD-08', 'ABCD-17', 'ABCD-18', 'ABCD-20', 'ABCD-22'])).toEqual([M, N, N, M, M]);
    expect(find(c, 'ABCD-20').kind).toBe('required');
    // der Kurs hat die Zone nahe Level 1 schon durchbrochen (Schluss jenseits): ausgeschlossen
    expect(c.verdict).toBe('invalid');
  });

  frm('sig-nosignal-h4-01: Negativ – ohne RSI-Extrem und ohne Umkehrkerze ist der Einstieg unzulässig', () => {
    const c = analyzeAt('sig-nosignal-h4-01', '2025-11-19T12:00');
    expect(states(c, ['ABCD-17', 'ABCD-18', 'ABCD-20', 'ABCD-10'])).toEqual([N, N, N, N]);
    expect(find(c, 'ABCD-20').kind).toBe('required');
    expect(c.verdict).toBe('invalid');
  });

  frm('abcd-small-h4-01: Negativ – die kleine Bewegung erreicht 0,382 nicht, später schon (kein Blick in die Zukunft)', () => {
    const fx = loadFixture('abcd-small-h4-01');
    const bars = fx.bars;
    const idx = (iso: string) => bars.findIndex((b) => b.time === at(iso));
    const a = idx('2025-10-06T16:00');
    const b = idx('2025-10-08T04:00');
    const c = idx('2025-10-08T12:00');
    const input = (cIdx: number) => ({
      tf: 'H4' as const,
      a: { time: bars[a].time, price: bars[a].high },
      b: { time: bars[b].time, price: bars[b].low },
      c: { time: bars[cIdx].time, price: bars[cIdx].high },
    });
    const ctx = new FormationContext(fx.symbol, { H4: bars } as ContextInput);
    // Kerze 12:00 geschlossen (Schluss 16:00): C-Hoch 0.80588, Tiefe 0.331 von AB 0.0143
    const early = checkAbcdCandidate(ctx, at('2025-10-08T16:00'), input(c));
    expect(state(early, 'ABCD-04')).toBe(N);
    expect(find(early, 'ABCD-04').value!).toBeCloseTo(0.331, 3);
    expect(early.verdict).toBe('invalid');
    // eine Kerze später liegt das Hoch bei 0.80682, Tiefe 0.397
    const later = checkAbcdCandidate(ctx, at('2025-10-08T20:00'), input(c + 1));
    expect(state(later, 'ABCD-04')).toBe(M);
    expect(find(later, 'ABCD-04').value!).toBeCloseTo(0.397, 3);
  });

  frm('abcd-double-h4-01: Negativ – volumenstarkes D-Bein schließt aus, ein Verkauf ohne Zone', () => {
    const c = analyzeAt('abcd-double-h4-01', '2025-11-18T12:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-23', 'ABCD-10'])).toEqual([M, N]);
    expect(c.verdict).toBe('invalid');
  });

  frm('sig-diverg-h4-02: Negativ – C unter A, die Mindest-Extension fehlt', () => {
    const c = analyzeAt('sig-diverg-h4-02', '2025-12-22T20:00');
    expect(states(c, ['ABCD-05', 'ABCD-06'])).toEqual([N, N]);
    expect(c.verdict).toBe('invalid');
  });
});

