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
import { outcomesOf, realizedOutcomesOf, strongZoneAt } from '../../src/lib/formation/trade';
import { tradeStatusOf } from '../../src/lib/formation/tradeStatus';
import { earlyReversalOf, type EarlyZone } from '../../src/lib/formation/earlyReversal';
import { dReached, shapeOf } from '../../src/lib/formation/abcd';
import type { EngulfZone } from '../../src/lib/formation/sig';
import {
  ABCD_CHECK_IDS,
  analyzeAbcd,
  checkAbcdCandidate,
} from '../../src/lib/formation/abcdChecks';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { zoneGeometry } from '../../src/lib/formation/frz';
import type { Anchor, Candidate, CheckState, FormationBar } from '../../src/lib/formation/types';
import { D1, END, H1, H4, barsOf, mirror, plain, zig, type Row } from '../fixtures/formation-rows';
import { expectTradeShape } from '../fixtures/formation-trade';
import { FIXTURE_TREND, named, trendOf } from '../fixtures/formation-trend';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-05' }, fn);

const STEP = { D1, H4 } as const;
type Tf = keyof typeof STEP;

const ctxOf = (input: Partial<Record<Tf, Row[]>>) => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext('TEST', bars, { trend: FIXTURE_TREND });
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
/** ABCD-26: nach C ein Hoch 124 unter B, dann fällt der Kurs auf 105 unter C: der Trendzug dreht vor D abwärts, Bezug C */
const S_BREAK_C = zig([100, 130, 114, 124, 105], 8, 3);
/** Wie oben, aber erst nach dem D 144 (Level 1) fällt der Kurs unter C: das ist der Weg zum Ziel */
const S_BREAK_AFTER_D = zig([100, 130, 114, 144, 105], 8, 3);
/** Einstieg am Level 1 (144), dann Bruch von C (105), danach ein neuer äußerster Docht 150: der Bruch liegt nach dem Einstieg */
const S_BREAK_AFTER_ENTRY = zig([100, 130, 114, 144, 105, 150], 8, 3);
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

// ---- Reihen: harmonisches D (ABCD-16) --------------------------------------------------------------------------

/**
 * Kauf-Formation mit X 100 (Index 2), A 130 (20), B 111.46 (24), C 124.94 (28, Tiefe 0.727, knapp unter der Grenze 0.728 von ABCD-06 und GAR-08), D 106.41 (32): das ist ein Gartley.
 * Level 1 = 124.94 − 18.54 = 106.40 liegt vor −0.272 von A → B (106.417): die Zone Z-ABCD-04 enthält das Gartley-D und das ABCD-D ist erreicht.
 */
const GARTLEY = zig([100, 130, 111.46, 124.94, 106.41], [18, 4, 4, 4], 3);
const GARTLEY_AT = { a: 20, b: 24, c: 28, d: 32 };
/** Verkaufs-Formation mit X 140 vor A 100: B 130 liegt an 0.75 von X → A, C an 0.533 von A → B: Gartley braucht C an 0.618, Bat ist durch B ≥ 0.618 ausgeschlossen */
const X_NO_HARMONIC = zig([140, 100, 130, 114, 144], 8, 0);
const X_NO_HARMONIC_AT = { a: 10, b: 18, c: 26, d: 34 };
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
/** A 100, B 130, C 112, D 134 mit kurzen Zügen: kleine Schlüsse über B (0,13 von AB) vor Kerze 20, SIG-34 hat noch keinen Vorlauf; RSI(7) an B über 80 */
const S_DOUBLE_TOP_EARLY = zig([100, 130, 112, 134], [8, 3, 3], 3);
const DT_EARLY = { a: 2, b: 10, c: 13, d: 16 };
const S_ENGULF = [...zig([100, 130, 114, 138], 8, 0), [131, 137.9, 130, 137.7] as Row, [137.7, 137.8, 127, 127.5] as Row];

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
    name: 'ABCD-16: Gartley auf denselben A, B, C mit D in der Zone',
    candidate: () => run({ H4: GARTLEY }, GARTLEY_AT, { sell: false }),
    expect: { 'ABCD-16': M },
  },
  {
    name: 'ABCD-16: X vorhanden, aber C nur an 0.533 von A → B (weder Gartley noch Bat)',
    candidate: () => run({ H4: X_NO_HARMONIC }, X_NO_HARMONIC_AT),
    expect: { 'ABCD-16': N },
  },
  {
    name: 'ABCD-16: kein Wendepunkt vor A (X fehlt)',
    candidate: () => run({ H4: S1 }, ABC),
    expect: { 'ABCD-16': U },
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
    name: 'ABCD-26: der Trend dreht vor D und bricht C',
    candidate: () => run({ H4: S_BREAK_C }, ABC),
    expect: { 'ABCD-03': N, 'ABCD-08': N, 'ABCD-26': M },
  },
  {
    name: 'ABCD-26: ohne Trendwechsel nach C bleibt die Formation im Aufbau',
    candidate: () => run({ H4: S_FORMING }, ABC),
    expect: { 'ABCD-26': N },
  },
  {
    name: 'ABCD-26: ein Bruch von C erst nach dem D zählt nicht',
    candidate: () => run({ H4: S_BREAK_AFTER_D }, ABC),
    expect: { 'ABCD-08': M, 'ABCD-26': N },
  },
  {
    name: 'ABCD-26: zählt ab der Einstiegskerze, nicht ab dem späteren äußersten Docht',
    candidate: () => run({ H4: S_BREAK_AFTER_ENTRY }, ABC),
    expect: { 'ABCD-08': M, 'ABCD-26': N },
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
    expect: { 'ABCD-11': U, 'ABCD-10': U, 'ABCD-09': U, 'ABCD-15': U },
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
    name: 'ABCD-24: kleine Schlüsse über B ohne SIG-34-Vorlauf, Volumen unbekannt: nicht messbar',
    candidate: () => run({ H4: S_DOUBLE_TOP_EARLY }, DT_EARLY),
    expect: { 'ABCD-24': U },
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
      const states = new Set(CASES.map((c) => c.expect[id]).filter((s) => s !== undefined));
      // ABCD-25 ☑ gibt es nur für M1 und M5; der Kontext lädt sie nicht, den ☑-Fall deckt der Test der Funktion ab
      if (!states.has(M) && id !== 'ABCD-25') missing.push(`${id} ☑`);
      // ABCD-11 legt nur das Maß „nahe“ fest: mit ATR(14) ☑, ohne ATR nicht messbar; ein ☐ gibt es nicht
      if (!states.has(N) && id !== 'ABCD-11') missing.push(`${id} ☐`);
    }
    expect(missing).toEqual([]);
  });

  frm('ABCD-16 ohne Wendepunkt vor A ist nicht messbar', () => {
    expect(state(run({ H4: S1 }, ABC), 'ABCD-16')).toBe(U);
  });

  frm('Z-ABCD-05 ankert mit harmonischem D (ABCD-16 ☑) ohne Divergenz an A, ohne Harmonik an C', () => {
    const harmonic = run({ H4: GARTLEY }, GARTLEY_AT, { sell: false });
    expect(state(harmonic, 'ABCD-19')).not.toBe(M);
    const withHarmonic = harmonic.drawings.find((d) => d.id === 'Z-ABCD-05')!;
    expect(withHarmonic.anchors.map((a) => [a.time, a.price])).toEqual([[20 * H4, 130], [32 * H4, 106.41]]);
    expect(withHarmonic.levels).toEqual([0.382, 0.618]);
    // Stop eingefroren an der Kerze, die Level 1 erreicht: mit Harmonik ab A (130) zu Level 1 (106.40), −0.382
    expect(harmonic.trade!.entry).toBeCloseTo(106.4, 6);
    expect(harmonic.trade!.stop).toBeCloseTo(106.4 - 0.382 * (130 - 106.4), 6);
    const plainCase = run({ H4: X_NO_HARMONIC }, X_NO_HARMONIC_AT);
    const without = plainCase.drawings.find((d) => d.id === 'Z-ABCD-05')!;
    expect(without.anchors[0].price).toBe(X_NO_HARMONIC[26][2]);
    expect(without.levels).toEqual([0.382, 0.618]);
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
    expect(ids).toEqual(['Z-ABCD-01', 'Z-ABCD-02', 'Z-ABCD-03', 'Z-ABCD-04', 'Z-ABCD-06', 'Z-ABCD-05', 'Z-ABCD-07', 'Z-ABCD-08']);
    const zigzag = c.drawings.find((d) => d.id === 'Z-ABCD-01')!;
    expect(zigzag.anchors.map((a) => a.price)).toEqual([S1[2][2], S1[10][1], S1[18][2], S1[26][1]]);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-02')!.anchors[0].price).toBe(144);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-03')!.levels).toEqual([0.382, -0.272]);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-05')!.levels).toEqual([0.382, 0.618]);
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
    expect(target?.levels).toEqual([0.382, 0.618, 0.786]);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => named(`e2e/fixtures/formation/${name}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8'))));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (name: string, iso: string): Candidate => {
  const fx = loadFixture(name);
  const ctx = new FormationContext(fx.symbol, { H4: fx.bars } as ContextInput, { trend: trendOf(fx.bars) });
  return analyzeAbcd(ctx, at(iso)).find((a) => a.tf === 'H4')!.candidate;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));

test.describe('ABCD: invalidBy', () => {
  test('Ungültig mit wartendem D: invalidBy nennt die verursachenden Regeln, nicht ABCD-03', { tag: '@FRM-19' }, () => {
    const c = run({ H4: S_BEYOND_A }, ABC);
    expect([c.verdict, state(c, 'ABCD-03'), c.invalidBy]).toEqual(['invalid', N, ['ABCD-05', 'ABCD-06']]);
  });

  frm('Trend dreht vor D und bricht C: ungültig statt im Aufbau, invalidBy nennt ABCD-26', () => {
    const c = run({ H4: S_BREAK_C }, ABC);
    expect([c.verdict, c.invalidBy]).toEqual(['invalid', ['ABCD-26']]);
    const mirrored = run({ H4: mirror(S_BREAK_C) }, ABC, { sell: false });
    expect([mirrored.side, mirrored.verdict, mirrored.invalidBy]).toEqual(['buy', 'invalid', ['ABCD-26']]);
  });
});

test.describe('ABCD: echte Kerzen', () => {
  frm('sig-rsi-h4-01: Negativ – Verkauf mit RSI(7) über 80 am D, doch der Kurs ist durch die Zone nahe Level 1 geschlossen', () => {
    const c = analyzeAt('sig-rsi-h4-01', '2025-11-11T04:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-04', 'ABCD-06', 'ABCD-08', 'ABCD-09', 'ABCD-10', 'ABCD-17', 'ABCD-22'])).toEqual([M, M, M, M, M, M, M]);
    expect(find(c, 'ABCD-17').value!).toBeGreaterThanOrEqual(80);
    expect(c.verdict).toBe('invalid');
  });

  frm('sig-diverg-h4-01: Verkauf am D mit Wave-Divergenz, der Engulf umschließt nur eine kleine Kerze (SIG-24): ABCD-20 ☐', () => {
    const c = analyzeAt('sig-diverg-h4-01', '2025-11-25T08:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-08', 'ABCD-17', 'ABCD-19', 'ABCD-20'])).toEqual([M, N, M, N]);
    expect(c.verdict).toBe('invalid');
  });

  // FRM-41 (2026-11-05, Formationen auf dem Trendzug des Nutzers): vorher gültig; auf dem Trendzug des Nutzers liegt am D keine Zone
  frm('abcd-double-h4-01: Verkauf am D mit RSI(7) über 80 ohne Umkehrkerze, ohne Zone am D ungültig (ABCD-10 ☐)', () => {
    const c = analyzeAt('abcd-double-h4-01', '2025-11-13T00:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-08', 'ABCD-17', 'ABCD-20', 'ABCD-10'])).toEqual([M, M, N, N]);
    expect(find(c, 'ABCD-17').value!).toBeGreaterThanOrEqual(80);
    expect(find(c, 'ABCD-20').kind).toBe('bonus');
    expect(c.invalidBy).toEqual(['ABCD-10']);
    expect(c.verdict).toBe('invalid');
  });

  frm('sig-diverg-h4-01: Kauf am D ohne RSI-Extrem, der Engulf umschließt nur eine kleine Kerze (SIG-24), Zone durchbrochen', () => {
    const c = analyzeAt('sig-diverg-h4-01', '2025-12-02T12:00');
    expect(c.side).toBe('buy');
    expect(states(c, ['ABCD-08', 'ABCD-17', 'ABCD-18', 'ABCD-20', 'ABCD-22'])).toEqual([M, N, N, N, M]);
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
    const ctx = new FormationContext(fx.symbol, { H4: bars } as ContextInput, { trend: trendOf(bars) });
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

  // FRM-41 (2026-11-05, Formationen auf dem Trendzug des Nutzers): vorher schloss das volumenstarke D-Bein aus (ABCD-23 ☑, ABCD-10 ☐)
  frm('abcd-double-h4-01: Negativ – Verkauf mit Zone am D, ohne Umkehrkerze ungültig (ABCD-20 ☐)', () => {
    const c = analyzeAt('abcd-double-h4-01', '2025-11-18T12:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['ABCD-23', 'ABCD-10', 'ABCD-20'])).toEqual([N, M, N]);
    expect(c.invalidBy).toEqual(['ABCD-20']);
    expect(c.verdict).toBe('invalid');
  });

  frm('abcd-breakc-h4-01: Verkauf, der Trend dreht vor D abwärts und bricht C: davor im Aufbau, danach ungültig (ABCD-26)', () => {
    // A 1.32721, B 1.35026, C 1.33412; die H4-Kerze 16:00 am 10.11. schließt unter C, der Trendzug dreht abwärts (seit der Regel „Farbe in zwei Kerzen“, 2026-11-19, früher als zuvor 08:00 am 11.11.). Zwischen 12:00 und 16:00 meldet H4 ein anderes (Kauf-)Muster, daher steht „davor“ bei 08:00
    const before = analyzeAt('abcd-breakc-h4-01', '2026-11-10T08:00');
    expect([before.side, before.points.C?.price, before.verdict, state(before, 'ABCD-26')]).toEqual(['sell', 1.33412, 'forming', N]);
    const after = analyzeAt('abcd-breakc-h4-01', '2026-11-10T20:00');
    expect([after.side, after.points.C?.price, state(after, 'ABCD-26'), after.verdict, after.invalidBy]).toEqual(['sell', 1.33412, M, 'invalid', ['ABCD-26']]);
  });

  frm('sig-diverg-h4-02: Negativ – C unter A, die Mindest-Extension fehlt', () => {
    const c = analyzeAt('sig-diverg-h4-02', '2025-12-22T20:00');
    expect(states(c, ['ABCD-05', 'ABCD-06'])).toEqual([N, N]);
    expect(c.verdict).toBe('invalid');
  });
});

// ---- Abnahmefälle der Testliste mit eigenen Punkten ---------------------------------------------------------------

test.describe('ABCD: Abnahmefälle der Testliste, offene Fälle (echte Kerzen)', () => {
  const extreme = (bars: FormationBar[], from: string, to: string, side: 'high' | 'low') =>
    bars
      .filter((b) => b.time >= at(from) && b.time < at(to))
      .reduce((x, y) => {
        const further = side === 'high' ? y.high > x.high : y.low < x.low;
        return further ? y : x;
      });
  const points = (a: FormationBar, ap: number, b: FormationBar, bp: number, c: FormationBar, cp: number) => ({
    tf: 'H4' as const,
    a: { time: a.time, price: ap },
    b: { time: b.time, price: bp },
    c: { time: c.time, price: cp },
  });

  // Die Liste liest A 142.367, B 145.464, C ca. 142.79; unsere Kerzen: 142.375, 145.459, 142.787 (Tiefe 0.866, Liste „ca. 0.86“).
  // Das Urteil „ungültig wegen ABCD-06“ stimmt mit der Liste überein. Abweichung der Zustände: Die Liste nennt „RSI überkauft, keine Divergenz“
  // (ABCD-17 ☑, ABCD-19 ☐) nur aus dem gesprochenen Wort. Das Bild zeigt weder RSI noch Wave. Gemessen am D (145.953, die Liste liest 145.885):
  // RSI(7) 70.5, unter der Linie 80 (SIG-01), also ABCD-17 ☐; Wave-Divergenz liegt vor, ABCD-19 ☑.
  frm('abcd-neg-h4-01: Negativ – C zu tief, Urteil ungültig wegen ABCD-06; ABCD-17 ☐ und ABCD-19 ☑ weichen vom gesprochenen Wort ab', () => {
    const fx = loadFixture('abcd-neg-h4-01');
    const a = extreme(fx.bars, '2025-06-03T00:00', '2025-06-04T00:00', 'low');
    const b = extreme(fx.bars, '2025-06-11T00:00', '2025-06-13T00:00', 'high');
    const c = extreme(fx.bars, '2025-06-13T00:00', '2025-06-14T00:00', 'low');
    expect([a.low, b.high, c.low]).toEqual([142.375, 145.459, 142.787]);
    const ctx = new FormationContext(fx.symbol, { H4: fx.bars } as ContextInput, { trend: trendOf(fx.bars) });
    const cand = checkAbcdCandidate(ctx, at('2025-06-20T20:00'), points(a, a.low, b, b.high, c, c.low));
    expect(cand.side).toBe('sell');
    expect(cand.points?.D?.price).toBe(145.953);
    expect(states(cand, ['ABCD-04', 'ABCD-06', 'ABCD-17', 'ABCD-19'])).toEqual([M, N, N, M]);
    expect(find(cand, 'ABCD-04').value!).toBeCloseTo(0.866, 3);
    expect(find(cand, 'ABCD-17').value!).toBeCloseTo(70.5, 1);
    expect(cand.verdict).toBe('invalid');
    expect(cand.invalidBy).toContain('ABCD-06');
  });

  // Die Liste liest B ≈ 0.8156 und damit eine Tiefe von etwa 0.81; unsere Kerze (2025-06-16 00:00) hat B bei 0.81471 und die Tiefe 0.851,
  // also erreicht D −0.272 von A → B nicht (ABCD-06 ☐, Urteil ungültig). Die Kerze von B ist kein Spike: Docht unter dem Körper 0.00043 bei Körper 0.00322,
  // FRZ-16 (ratio 2) und TRD-36 greifen nicht, die Punktwahl ist kein Fehler. Unser B weicht vom abgelesenen B ab; die Regel gilt vor dem abgelesenen Preis.
  frm('abcd-buy-h4-02: Kauf – B ist kein Spike, die Tiefe 0.851 erreicht −0.272 nicht, Urteil ungültig (Datenquelle weicht von der Liste ab)', () => {
    const fx = loadFixture('abcd-buy-h4-02');
    const a = extreme(fx.bars, '2025-06-10T00:00', '2025-06-11T00:00', 'high');
    const b = extreme(fx.bars, '2025-06-14T00:00', '2025-06-18T00:00', 'low');
    const c = extreme(fx.bars, '2025-06-18T00:00', '2025-06-21T00:00', 'high');
    expect([a.high, b.low, c.high]).toEqual([0.82979, 0.81471, 0.82754]);
    expect(zoneGeometry(fx.bars, fx.bars.indexOf(b), 'support', 'H4').manipulation).toBe(false);
    expect(Math.min(b.open, b.close) - b.low).toBeLessThan(0.5 * Math.abs(b.close - b.open));
    const ctx = new FormationContext(fx.symbol, { H4: fx.bars } as ContextInput, { trend: trendOf(fx.bars) });
    const cand = checkAbcdCandidate(ctx, at('2025-06-24T00:00'), points(a, a.high, b, b.low, c, c.high));
    expect(cand.side).toBe('buy');
    expect(states(cand, ['ABCD-04', 'ABCD-06', 'ABCD-19'])).toEqual([M, N, M]);
    expect(find(cand, 'ABCD-06').value!).toBeCloseTo(0.851, 3);
    expect(cand.verdict).toBe('invalid');
    expect(cand.invalidBy).toContain('ABCD-06');
  });
});

test('Handelsblock: Einstieg am D, Ziel und Stop aus der Fib ab C (oder A); keine Veto-Zeile', { tag: ['@FRM-39', '@FRM-40'] }, () => {
  expectTradeShape(run({ H4: S1_TAIL }, ABC), { veto: false });
});

// ---- Handel: Einstieg an Level 1, eingefrorener Stop (1114-A4.1) ----------------------------------------------

/** A 100, B 130, C 114: Level 1 = 144; D-Docht 150 und 160 liegen jenseits von Level 1 */
const S_PAST = zig([100, 130, 114, 150], 8, 0);
const S_PAST_FAR = zig([100, 130, 114, 160], 8, 0);

test('Handel: Einstieg an Level 1 und Stop eingefroren, auch wenn der Docht weiter läuft; TP1 folgt dem äußersten Docht', { tag: '@FRM-05' }, () => {
  const near = run({ H4: S_PAST }, ABC).trade!;
  const far = run({ H4: S_PAST_FAR }, ABC).trade!;
  // Level 1 = 114 + 30 = 144; Stop = −0.382 der Fib C → Level 1 = 144 + 0.382 × 30
  for (const t of [near, far]) {
    expect(t.entry).toBeCloseTo(144, 9);
    expect(t.stop).toBeCloseTo(155.46, 9);
    expect(t.tp1AtEntry).toBeCloseTo(132.54, 9);
  }
  // TP1: 0.382 der Fib C → äußerster Docht (150 bzw. 160)
  expect(near.tp1).toBeCloseTo(150 - 0.382 * 36, 9);
  expect(far.tp1).toBeCloseTo(160 - 0.382 * 46, 9);
  // CRV am Einstieg = 1, SIG-29 wird vom Weiterlaufen nicht berührt
  expect(near.sig29?.value).toBeCloseTo(1, 9);
  expect(far.sig29?.value).toBeCloseTo(1, 9);
});

test('Handel: Spiegelfall (Kauf) hat dieselben Abstände', { tag: '@FRM-05' }, () => {
  const t = run({ H4: mirror(S_PAST) }, ABC, { sell: false }).trade!;
  const sellT = run({ H4: S_PAST }, ABC).trade!;
  // Risiko und CRV gleich, Stop unter dem Einstieg, TP1 darüber
  expect(t.entry! - t.stop!).toBeCloseTo(sellT.stop! - sellT.entry!, 9);
  expect(t.tp1AtEntry! - t.entry!).toBeCloseTo(sellT.entry! - sellT.tp1AtEntry!, 9);
  expect(t.sig29?.value).toBeCloseTo(1, 9);
});

test('Handel: Z-ABCD-05 ohne Stop-Level, Stop als eigene Linie Z-ABCD-07 mit Beschriftung Z-ABCD-08', { tag: '@FRM-05' }, () => {
  const c = run({ H4: S_PAST }, ABC);
  expect(c.drawings.find((d) => d.id === 'Z-ABCD-05')!.levels).toEqual([0.382, 0.618]);
  const line = c.drawings.find((d) => d.id === 'Z-ABCD-07')!;
  expect(line.tool).toBe('hline');
  expect(line.anchors[0].price).toBeCloseTo(c.trade!.stop!, 9);
  expect(c.drawings.find((d) => d.id === 'Z-ABCD-08')!.label).toBe('stop');
});

test('Handel: Level 1 innerhalb der Toleranz verfehlt, Einstieg bleibt Level 1 und die Lücke steht im Handel', { tag: '@FRM-05' }, () => {
  // D 143 statt 144: fehlt 0,033 von AB (Toleranz hält), Lücke 1 im Preis
  const t = run({ H4: S_NEAR_MISS }, ABC).trade!;
  expect(t.entry).toBeCloseTo(144, 9);
  expect(t.stop).toBeCloseTo(155.46, 9);
  expect(t.missed).toBeCloseTo(1, 9);
  expect(run({ H4: S_PAST }, ABC).trade!.missed).toBeUndefined();
});

test('Handel: mit Divergenz an der Kerze, die Level 1 erreicht, ist der Stop-Anker A', { tag: '@FRM-05' }, () => {
  const rows = DIV_BEAR;
  const c = checkAbcdCandidate(ctxOf({ H4: rows }), END, {
    tf: 'H4',
    a: wick(rows, DIV.a, false),
    b: wick(rows, DIV.b, true),
    c: wick(rows, DIV.c, false),
    d: { time: 62 * H4, price: 143 },
  });
  expect(state(c, 'ABCD-19')).toBe(M);
  const level1 = c.drawings.find((d) => d.id === 'Z-ABCD-02')!.anchors[0].price;
  const a = c.points.A.price;
  // Stop = −0.382 der Fib A → Level 1 (Einstieg); Notation Start = 1, Ende = 0
  expect(c.trade!.entry).toBeCloseTo(level1, 9);
  expect(c.trade!.stop).toBeCloseTo(level1 - 0.382 * (a - level1), 9);
});

// ---- Handel: TP2, TP3 und Ergebnis in R (1114-A4.2 Schritt a) -------------------------------------------------

test('Handel: TP2 = 0.618 der Ziel-Fib und läuft mit dem Docht; tp2AtEntry gilt am Einstieg; ohne Divergenz kein TP3', { tag: '@FRM-05' }, () => {
  const near = run({ H4: S_PAST }, ABC).trade!;
  const far = run({ H4: S_PAST_FAR }, ABC).trade!;
  expect(near.tp2).toBeCloseTo(150 - 0.618 * 36, 9);
  expect(far.tp2).toBeCloseTo(160 - 0.618 * 46, 9);
  // Am Einstieg: 0.618 der Fib C → Level 1 (114 → 144)
  for (const t of [near, far]) {
    expect(t.tp2AtEntry).toBeCloseTo(144 - 0.618 * 30, 9);
    expect(t.tp3).toBeUndefined();
  }
});

test('Handel: Spiegelfall (Kauf) hat spiegelgleiche TP2-Abstände', { tag: '@FRM-05' }, () => {
  const t = run({ H4: mirror(S_PAST) }, ABC, { sell: false }).trade!;
  const sellT = run({ H4: S_PAST }, ABC).trade!;
  expect(t.tp2AtEntry! - t.entry!).toBeCloseTo(sellT.entry! - sellT.tp2AtEntry!, 9);
});

test('Handel: mit Divergenz zeigt der Handel TP3 (0.786 der Fib A → D) als Zusatzziel', { tag: '@FRM-05' }, () => {
  const rows = DIV_BEAR;
  const c = checkAbcdCandidate(ctxOf({ H4: rows }), END, {
    tf: 'H4',
    a: wick(rows, DIV.a, false),
    b: wick(rows, DIV.b, true),
    c: wick(rows, DIV.c, false),
    d: { time: 62 * H4, price: 143 },
  });
  const t = c.trade!;
  expect(state(c, 'ABCD-19')).toBe(M);
  const a = c.points.A.price;
  const d = c.points.D.price;
  // Fib A → D, Notation Start = 1, Ende = 0
  expect(t.tp3).toBeCloseTo(d + 0.786 * (a - d), 9);
  expect(t.tp1).toBeCloseTo(d + 0.382 * (a - d), 9);
  expect(t.tp2).toBeCloseTo(d + 0.618 * (a - d), 9);
});

test('Handel: Ergebnis in R aus den Werten am Einstieg (Verkauf)', { tag: '@FRM-05' }, () => {
  // Einstieg 144, Stop 155.46 (Risiko 11.46), TP1 132.54 (11.46), TP2 125.46 (18.54)
  const t = run({ H4: S_PAST }, ABC).trade!;
  const o = outcomesOf(t, 'sell')!;
  expect(o.stop).toBe(-1);
  expect(o.tp1).toBeCloseTo((0.5 * 11.46) / 11.46, 9);
  expect(o.tp12).toBeCloseTo((0.5 * (11.46 + 18.54)) / 11.46, 9);
});

test('Handel: Ergebnis in R bei Kauf gleich Verkauf, ohne TP2 oder mit falscher Seite null', { tag: '@FRM-05' }, () => {
  const base = { entry: 100, stop: 90, tp1: 110, tp1AtEntry: 110, tp2: 120, tp2AtEntry: 120 };
  expect(outcomesOf(base, 'buy')).toEqual({ stop: -1, tp1: 0.5, tp12: 1.5 });
  const sell = { entry: 100, stop: 110, tp1: 90, tp1AtEntry: 90, tp2: 80, tp2AtEntry: 80 };
  expect(outcomesOf(sell, 'sell')).toEqual({ stop: -1, tp1: 0.5, tp12: 1.5 });
  expect(outcomesOf({ ...base, tp2: undefined, tp2AtEntry: undefined }, 'buy')).toBeNull();
  expect(outcomesOf({ ...base, tp2AtEntry: 95 }, 'buy')).toBeNull();
  expect(outcomesOf({ ...base, stop: null }, 'buy')).toBeNull();
});

test('Handel: Warnung bei sehr starker Zone am TP1 (Gegenseite, Preis in der Zone)', { tag: '@FRM-05' }, () => {
  const zone = (side: 'support' | 'resistance', strength: 0 | 1 | 2, bottom: number, top: number) => ({ side, strength, rect: { bottom, top } });
  // Verkauf: TP1 liegt unten, die Stütze zählt
  expect(strongZoneAt([zone('support', 2, 131, 133)], 132.54, 'sell')).toBe(true);
  expect(strongZoneAt([zone('support', 1, 131, 133)], 132.54, 'sell')).toBe(false);
  expect(strongZoneAt([zone('resistance', 2, 131, 133)], 132.54, 'sell')).toBe(false);
  expect(strongZoneAt([zone('support', 2, 120, 125)], 132.54, 'sell')).toBe(false);
  expect(strongZoneAt([zone('resistance', 2, 131, 133)], 132.54, 'buy')).toBe(true);
});

// ---- Durum nach dem Einstieg (1114-A4.2 Schritt b): Kerzen ab der Einfrierkerze ablaufen ----
// Verkauf: C 100, Einstieg 115 (Einfrierkerze, Docht 115), Stop 120, Not-SL 125; TP1 109.27 / TP2 105.73 (0.382 / 0.618 von C zum äußersten Docht).
// Kauf: alle Preise an 100 gespiegelt (p → 200 − p).
type Sk = [high: number, low: number, close: number];
const statusFor = (side: 'sell' | 'buy', rows: Sk[], over: { emergency?: number | null; entryBar?: Sk } = {}) => {
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const emergency = over.emergency === undefined ? 125 : over.emergency;
  const bars: FormationBar[] = ([over.entryBar ?? ([115, 112, 113] as Sk), ...rows]).map(([h, l, c], i) => {
    const [hh, ll] = side === 'sell' ? [h, l] : [m(l), m(h)];
    return { time: 1000 + i * 14400, open: m(c), high: hh, low: ll, close: m(c) };
  });
  return {
    m,
    status: tradeStatusOf({
      bars,
      entryIdx: 0,
      side,
      entry: m(115),
      stop: m(120),
      emergencyStop: emergency === null ? null : m(emergency),
      from: m(100),
      targets: { tp1: 0.382, tp2: 0.618 },
    }),
  };
};

for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Verkauf' : 'Kauf';
  test(`Status (${tag}): ohne Kerzen nach dem Einstieg und ohne Treffer bleibt der Handel offen`, { tag: '@FRM-05' }, () => {
    const a = statusFor(side, []);
    expect(a.status.kind).toBe('open');
    expect(a.status.stopNow).toBe(a.m(120));
    expect(a.status.stopMovedIdx).toBeUndefined();
    expect(statusFor(side, [[114, 111, 112]]).status.kind).toBe('open');
  });

  test(`Status (${tag}): TP1 erreicht, der Stop rückt auf den Einstieg`, { tag: '@FRM-05' }, () => {
    const { status, m } = statusFor(side, [[113, 109, 110]]);
    expect(status).toMatchObject({ kind: 'tp1', stopNow: m(115), stopMovedIdx: 1 });
  });

  test(`Status (${tag}): TP1 und TP2 erreicht`, { tag: '@FRM-05' }, () => {
    const { status, m } = statusFor(side, [[113, 109, 110], [110, 105, 106]]);
    expect(status).toMatchObject({ kind: 'tp12', stopNow: m(115), endIdx: 2 });
  });

  test(`Status (${tag}): TP1 und TP2 in einer Kerze zählen beide`, { tag: '@FRM-05' }, () => {
    expect(statusFor(side, [[113, 105, 106]]).status.kind).toBe('tp12');
  });

  test(`Status (${tag}): Stop gilt mit dem Schluss der Kerze, ein Docht darüber allein löst ihn nicht aus`, { tag: '@FRM-05' }, () => {
    expect(statusFor(side, [[121, 112, 118]]).status.kind).toBe('open');
    expect(statusFor(side, [[121, 112, 121]]).status).toMatchObject({ kind: 'stopped', stopBy: 'close', endIdx: 1 });
  });

  test(`Status (${tag}): Not-SL gilt schon bei Docht-Berührung`, { tag: '@FRM-05' }, () => {
    expect(statusFor(side, [[125, 112, 118]]).status).toMatchObject({ kind: 'stopped', stopBy: 'wick' });
    expect(statusFor(side, [[124.9, 112, 118]]).status.kind).toBe('open');
    // ohne ATR gibt es keinen Not-SL
    expect(statusFor(side, [[130, 112, 118]], { emergency: null }).status.kind).toBe('open');
  });

  test(`Status (${tag}): nach TP1 schließt der Rest mit dem Schluss über dem Einstieg (Start auf null)`, { tag: '@FRM-05' }, () => {
    const { status, m } = statusFor(side, [[113, 109, 110], [116, 111, 116]]);
    expect(status).toMatchObject({ kind: 'breakeven', stopNow: m(115), stopMovedIdx: 1, endIdx: 2 });
    // Docht über dem Einstieg, Schluss darunter: noch offen
    expect(statusFor(side, [[113, 109, 110], [116, 111, 114]]).status.kind).toBe('tp1');
  });

  test(`Status (${tag}): nach TP1 beendet ein Docht am Not-SL nichts, erst der Schluss über dem Einstieg`, { tag: '@FRM-05' }, () => {
    expect(statusFor(side, [[113, 109, 110], [126, 111, 114]]).status.kind).toBe('tp1');
  });

  test(`Status (${tag}): TP1-Kerze mit Schluss jenseits des Einstiegs (Extrem über dem Einstieg) lässt den Rest am Einstieg enden`, { tag: '@FRM-05' }, () => {
    // Einstiegskerze mit Docht 117: TP1 = 110.506; die Folgekerze erreicht ihn und schließt bei 116 > 115
    const { status, m } = statusFor(side, [[116.5, 110, 116]], { entryBar: [117, 112, 113] });
    expect(status).toMatchObject({ kind: 'breakeven', stopNow: m(115), stopMovedIdx: 1, endIdx: 1 });
  });

  test(`Status (${tag}): Stop und Ziel in derselben Kerze zählen als Stop`, { tag: '@FRM-05' }, () => {
    const { status, m } = statusFor(side, [[121, 109, 121]]);
    expect(status).toMatchObject({ kind: 'stopped', stopNow: m(120) });
    expect(statusFor(side, [[126, 109, 112]]).status.kind).toBe('stopped');
  });

  test(`Status (${tag}): neues Extrem und TP1-Berührung in einer Kerze zählt TP1 nicht; die nächste Kerze nutzt das neue Extrem`, { tag: '@FRM-05' }, () => {
    expect(statusFor(side, [[117, 109, 112]]).status.kind).toBe('open');
    // Extrem 117: TP1 = 110.506, TP2 = 106.494
    expect(statusFor(side, [[117, 109, 112], [113, 110.6, 111]]).status.kind).toBe('open');
    expect(statusFor(side, [[117, 109, 112], [113, 110.5, 111]]).status.kind).toBe('tp1');
  });
}

// ---- Handel: Stand nach dem Einstieg, Stop-Linie rückt auf den Einstieg (1114-A4.2 b) ----
test('Handel: nach TP1 steht die Stop-Linie (Z-ABCD-07/08) auf dem Einstieg, davor auf dem Schluss-Stop', { tag: '@FRM-05' }, () => {
  const open = run({ H4: S_PAST }, ABC);
  expect(open.trade!.status!.kind).toBe('open');
  expect(open.drawings.find((d) => d.id === 'Z-ABCD-07')!.anchors[0].price).toBeCloseTo(155.46, 9);
  // Nach dem Einstieg fällt der Kurs bis 134: TP1 (150 − 0.382 × 36 = 136.25) ist erreicht
  const c = run({ H4: zig([100, 130, 114, 150, 134], 8, 0) }, ABC);
  const st = c.trade!.status!;
  expect(st.kind).toBe('tp1');
  expect(st.stopNow).toBeCloseTo(144, 9);
  expect(c.trade!.stop).toBeCloseTo(155.46, 9);
  const line = c.drawings.find((d) => d.id === 'Z-ABCD-07')!;
  expect(line.anchors[0].price).toBeCloseTo(144, 9);
  expect(c.drawings.find((d) => d.id === 'Z-ABCD-08')!.anchors[0].price).toBeCloseTo(144, 9);
});

// ---- Gerçekleşen sonuç: TP1/TP2 den Zählpreisen, nicht den Werten am Einstieg (1115-A21.1) ----
// Verkauf: C 114, Einstieg 144, Stop 155.46, Extrem 150 → TP1 = 150 − 0.382 × 36 = 136.248, TP2 = 127.752; am Einstieg TP1 132.54, TP2 125.46
for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Verkauf' : 'Kauf';
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const trade = {
    entry: m(144),
    stop: m(155.46),
    tp1: m(136.248),
    tp1AtEntry: m(132.54),
    tp2: m(127.752),
    tp2AtEntry: m(125.46),
  };
  const run2 = (rows: Sk[]) => {
    const bars: FormationBar[] = ([[150, 140, 144], ...rows] as Sk[]).map(([h, l, c], i) => {
      const [hh, ll] = side === 'sell' ? [m(h), m(l)] : [m(l), m(h)];
      return { time: 1000 + i * 14400, open: m(c), high: hh, low: ll, close: m(c) };
    });
    return tradeStatusOf({ bars, entryIdx: 0, side, entry: m(144), stop: m(155.46), emergencyStop: null, from: m(114), targets: { tp1: 0.382, tp2: 0.618 } });
  };
  const r = (v: number) => expect.closeTo(v, 4);

  test(`Gerçekleşen sonuç (${tag}): offen = Werte am Einstieg`, { tag: '@FRM-05' }, () => {
    const st = run2([[148, 140, 144]]);
    expect(st.kind).toBe('open');
    expect(realizedOutcomesOf(trade, side, st)).toEqual(outcomesOf(trade, side));
  });

  test(`Gerçekleşen sonuç (${tag}): TP1 bei Extrem 150 zählt 136.248 → +0.34 R, TP2 offen nutzt das aktuelle TP2`, { tag: '@FRM-05' }, () => {
    const st = run2([[148, 136, 138]]);
    expect(st).toMatchObject({ kind: 'tp1' });
    expect(st.tp1Fill).toBeCloseTo(m(136.248), 9);
    const o = realizedOutcomesOf(trade, side, st)!;
    expect(o.stop).toBe(-1);
    expect(o.tp1).toEqual(r(0.3382));
    // 0.5 × (7.752 + 16.248) / 11.46
    expect(o.tp12).toEqual(r(1.0471));
  });

  test(`Gerçekleşen sonuç (${tag}): TP1 und TP2 zählen beide Zählpreise`, { tag: '@FRM-05' }, () => {
    const st = run2([[148, 136, 138], [140, 127, 130]]);
    expect(st.kind).toBe('tp12');
    expect(st.tp2Fill).toBeCloseTo(m(127.752), 9);
    expect(realizedOutcomesOf(trade, side, st)!.tp12).toEqual(r(1.0471));
  });

  test(`Gerçekleşen sonuç (${tag}): Rest am Einstieg und Stop`, { tag: '@FRM-05' }, () => {
    const be = run2([[148, 136, 138], [146, 138, 146]]);
    expect(be.kind).toBe('breakeven');
    expect(realizedOutcomesOf(trade, side, be)!.tp1).toEqual(r(0.3382));
    const stopped = run2([[156, 140, 156]]);
    expect(stopped.kind).toBe('stopped');
    expect(realizedOutcomesOf(trade, side, stopped)!.stop).toBe(-1);
  });
}

// ---- Büyük AB=CD-Ziel bei harmonischem D (1114-A4.3): dritter Anteil, Aktivierung durch Schluss jenseits von A ----
// Verkauf: C 100 (= A, Aktivierung), Einstieg 115, Stop 120; TP1 109.27, TP2 105.73; großes Ziel = Extrem 115 + Versatz −20 = 95. Kauf gespiegelt (p → 200 − p).
const bigStatus = (side: 'sell' | 'buy', rows: Sk[]) => {
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const bars: FormationBar[] = ([[115, 112, 113] as Sk, ...rows]).map(([h, l, c], i) => {
    const [hh, ll] = side === 'sell' ? [h, l] : [m(l), m(h)];
    return { time: 1000 + i * 14400, open: m(c), high: hh, low: ll, close: m(c) };
  });
  const st = tradeStatusOf({
    bars,
    entryIdx: 0,
    side,
    entry: m(115),
    stop: m(120),
    emergencyStop: null,
    from: m(100),
    targets: { tp1: 0.382, tp2: 0.618 },
    big: { offset: side === 'sell' ? -20 : 20, activation: 100 },
  });
  return { st, m };
};
const TP1_ROW: Sk = [113, 109, 110];
const TP2_ROW: Sk = [110, 105, 106];

for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Verkauf' : 'Kauf';

  test(`Büyük hedef Status (${tag}): nach TP2 bleibt der Handel offen, der Rest steht am Einstieg`, { tag: '@FRM-05' }, () => {
    const { st, m } = bigStatus(side, [TP1_ROW, TP2_ROW]);
    expect(st).toMatchObject({ kind: 'tp12', stopNow: m(115), stopMovedIdx: 1 });
    expect(st.endIdx).toBeUndefined();
    expect(st.tp2Fill).toBeCloseTo(m(105.73), 9);
    expect(st.bigActive).toBe(false);
  });

  test(`Büyük hedef Status (${tag}): ohne Aktivierung zählt die Berührung nicht, mit Schluss jenseits von A schon`, { tag: '@FRM-05' }, () => {
    // Docht erreicht 95, Schluss 101 liegt noch vor A (100): nicht aktiv
    expect(bigStatus(side, [TP1_ROW, TP2_ROW, [106, 94, 101]]).st.kind).toBe('tp12');
    // Aktivierung in einer früheren Kerze (Schluss 98 < 100), dann Berührung
    const act = bigStatus(side, [TP1_ROW, TP2_ROW, [106, 96, 98]]);
    expect(act.st).toMatchObject({ kind: 'tp12', bigActive: true });
    const hit = bigStatus(side, [TP1_ROW, TP2_ROW, [106, 96, 98], [100, 94, 96]]);
    expect(hit.st).toMatchObject({ kind: 'tp123', endIdx: 4 });
    expect(hit.st.bigFill).toBeCloseTo(hit.m(95), 9);
    // Aktivierung und Berührung in derselben Kerze zählen (Annahme)
    expect(bigStatus(side, [TP1_ROW, TP2_ROW, [106, 94, 98]]).st.kind).toBe('tp123');
  });

  test(`Büyük hedef Status (${tag}): nach TP2 schließt der Rest mit dem Schluss jenseits des Einstiegs`, { tag: '@FRM-05' }, () => {
    const { st, m } = bigStatus(side, [TP1_ROW, TP2_ROW, [116, 105, 116]]);
    expect(st).toMatchObject({ kind: 'breakeven', stopNow: m(115), endIdx: 3 });
    expect(st.tp2Fill).toBeDefined();
  });

  test(`Büyük hedef Status (${tag}): TP1, TP2 und großes Ziel in einer Kerze, die jenseits von A schließt`, { tag: '@FRM-05' }, () => {
    expect(bigStatus(side, [[114, 111, 112], [113, 94, 98]]).st).toMatchObject({ kind: 'tp123', endIdx: 2 });
    // Schließt dieselbe Kerze bei 101 (vor A), zählen TP1 und TP2, das große Ziel nicht
    expect(bigStatus(side, [[114, 111, 112], [113, 94, 101]]).st.kind).toBe('tp12');
  });

  test(`Büyük hedef Status (${tag}): Stop gilt vor dem Ziel, TP1 ohne TP2 bleibt TP1`, { tag: '@FRM-05' }, () => {
    expect(bigStatus(side, [[121, 94, 121]]).st).toMatchObject({ kind: 'stopped', stopBy: 'close' });
    expect(bigStatus(side, [TP1_ROW]).st.kind).toBe('tp1');
  });
}

test('Büyük hedef: Ergebnis in R in Dritteln, vier Wege (Tasarimwerte)', { tag: '@FRM-05' }, () => {
  // Einstieg 100, Risiko 10, TP1 +10 (1), TP2 +20 (2), großes Ziel +40 (4)
  const base = { entry: 100, stop: 90, tp1: 110, tp1AtEntry: 110, tp2: 120, tp2AtEntry: 120, tpBig: 140, tpBigAtEntry: 140 };
  const o = outcomesOf(base, 'buy')!;
  expect(o.stop).toBe(-1);
  expect(o.tp1).toBeCloseTo(1 / 3, 9);
  expect(o.tp12).toBeCloseTo(1, 9);
  expect(o.tp123).toBeCloseTo(7 / 3, 9);
  // Verkauf spiegelgleich
  const sell = { entry: 100, stop: 110, tp1: 90, tp1AtEntry: 90, tp2: 80, tp2AtEntry: 80, tpBig: 60, tpBigAtEntry: 60 };
  expect(outcomesOf(sell, 'sell')).toEqual(o);
  // Ohne großes Ziel bleibt es bei Hälften ohne tp123
  expect(outcomesOf({ ...base, tpBig: undefined, tpBigAtEntry: undefined }, 'buy')).toEqual({ stop: -1, tp1: 0.5, tp12: 1.5 });
  // Großes Ziel auf der falschen Seite: keine Ergebnisse
  expect(outcomesOf({ ...base, tpBigAtEntry: 95 }, 'buy')).toBeNull();
});

test('Büyük hedef: gerçekleşen Ergebnis nutzt die Zählpreise aller drei Ziele', { tag: '@FRM-05' }, () => {
  const base = { entry: 100, stop: 90, tp1: 112, tp1AtEntry: 110, tp2: 125, tp2AtEntry: 120, tpBig: 150, tpBigAtEntry: 140 };
  const st = { tp1Fill: 112, tp2Fill: 125, bigFill: 150 };
  const o = realizedOutcomesOf(base, 'buy', st)!;
  expect(o.tp1).toBeCloseTo(12 / 10 / 3, 9);
  expect(o.tp12).toBeCloseTo((12 + 25) / 10 / 3, 9);
  expect(o.tp123).toBeCloseTo((12 + 25 + 50) / 10 / 3, 9);
  // Großes Ziel noch offen: das aktuelle `tpBig` zählt
  expect(realizedOutcomesOf(base, 'buy', { tp1Fill: 112, tp2Fill: 125 })!.tp123).toBeCloseTo((12 + 25 + 50) / 10 / 3, 9);
});

// Harmonisches D (GARTLEY): X 100, A 130, D 106.41, Level 1 106.40 → großes Ziel = D + (A − X) = 136.41, am Einstieg 136.40
frm('Büyük hedef: bei harmonischem D (Kauf) liegt das große Ziel bei D + (A − X), ohne 0.786-Ziel; Aktivierung bei A', () => {
  const c = run({ H4: GARTLEY }, GARTLEY_AT, { sell: false });
  const t = c.trade!;
  expect(t.tpBig).toBeCloseTo(106.41 + 30, 6);
  expect(t.tpBigAtEntry).toBeCloseTo(106.4 + 30, 6);
  expect(t.tpBigActivation).toBeCloseTo(130, 9);
  // Entscheidung 3: das 0.786-Ziel gibt es nur bei Divergenz
  expect(state(c, 'ABCD-19')).not.toBe(M);
  expect(t.tp3).toBeUndefined();
  // Einstiegsstand: offen, großes Ziel noch nicht aktiv
  expect(t.status!.kind).toBe('open');
  expect(t.status!.bigActive).toBeFalsy();
  const line = c.drawings.find((d) => d.id === 'Z-ABCD-09')!;
  expect(line.tool).toBe('hline');
  expect(line.anchors[0].price).toBeCloseTo(t.tpBig!, 9);
  const label = c.drawings.find((d) => d.id === 'Z-ABCD-10')!;
  expect(label).toMatchObject({ tool: 'label', label: 'bigTarget' });
  expect(label.anchors[0].price).toBeCloseTo(t.tpBig!, 9);
});

frm('Büyük hedef: ohne harmonisches D fehlt es; Divergenz allein behält 0.786 als Zusatzziel, Harmonik ohne Divergenz hat keins', () => {
  const plainCase = run({ H4: S_PAST }, ABC).trade!;
  expect([plainCase.tpBig, plainCase.tpBigAtEntry, plainCase.tpBigActivation]).toEqual([undefined, undefined, undefined]);
  expect(run({ H4: X_NO_HARMONIC }, X_NO_HARMONIC_AT).trade!.tpBig).toBeUndefined();
  const rows = DIV_BEAR;
  const div = checkAbcdCandidate(ctxOf({ H4: rows }), END, {
    tf: 'H4',
    a: wick(rows, DIV.a, false),
    b: wick(rows, DIV.b, true),
    c: wick(rows, DIV.c, false),
    d: { time: 62 * H4, price: 143 },
  });
  expect(state(div, 'ABCD-19')).toBe(M);
  expect(div.trade!.tp3).toBeDefined();
  expect(div.trade!.tpBig).toBeUndefined();
  const names = run({ H4: S_PAST }, ABC).drawings.map((d) => d.id);
  expect(names).not.toContain('Z-ABCD-09');
});

frm('Büyük hedef: ohne erreichtes Level 1 gibt es kein großes Ziel und keine Linie', () => {
  // Kurs hat Level 1 noch nicht erreicht: Reihe endet kurz nach C
  const forming = zig([100, 130, 111.46, 124.94], [18, 4, 4], 3);
  const c = run({ H4: forming }, { a: 20, b: 24, c: 28 }, { sell: false });
  expect(c.trade!.entry).toBeNull();
  expect(c.trade!.tpBig).toBeUndefined();
  expect(c.drawings.map((d) => d.id)).not.toContain('Z-ABCD-09');
});

// Büyük hedefin varlığı giriş mumunda belirlenir (Halil 2026-11-16): sonraki mumlar kararı değiştirmez
test('Büyük hedef dondurulur: girişten sonra X altında kapanış (GAR-18) harmonik D denetimini bozsa da hedef ve ⅓ paylar kalır', { tag: ['@FRM-05', '@FRM-39'] }, () => {
  const base = run({ H4: GARTLEY }, GARTLEY_AT, { sell: false }).trade!;
  expect(base.tpBig).toBeDefined();
  // Kerze 36: giriş (32) sonrası X'in (100) altında kapanış
  const after = [...GARTLEY, plain(106, 95)];
  const c = run({ H4: after }, GARTLEY_AT, { sell: false });
  const t = c.trade!;
  expect(t.tpBig).toBeCloseTo(base.tpBig!, 9);
  expect(t.tpBigAtEntry).toBeCloseTo(base.tpBigAtEntry!, 9);
  expect(t.tpBigActivation).toBeCloseTo(base.tpBigActivation!, 9);
  expect(outcomesOf(t, 'buy')!.tp123).toBeDefined();
  expect(c.drawings.map((d) => d.id)).toContain('Z-ABCD-09');
  expect(c.drawings.map((d) => d.id)).toContain('Z-ABCD-10');
});

// Stop'un dayandığı `frozenFrom` (A ya da C) giriş mumunun ortamında belirlenir: sonraki mumlar giriş, stop ve TP1'i oynatmaz
test('Stop dondurulur: girişten sonra X altında kapanış (GAR-18) harmonik D denetimini bozsa da stop ve tp1AtEntry kalır', { tag: ['@FRM-05', '@FRM-39'] }, () => {
  const base = run({ H4: GARTLEY }, GARTLEY_AT, { sell: false }).trade!;
  expect(base.stop).not.toBeNull();
  const t = run({ H4: [...GARTLEY, plain(106, 95)] }, GARTLEY_AT, { sell: false }).trade!;
  expect(t.entry).toBeCloseTo(base.entry!, 9);
  expect(t.stop).toBeCloseTo(base.stop!, 9);
  expect(t.tp1AtEntry).toBeCloseTo(base.tp1AtEntry!, 9);
});

test('Stop dondurulur: aday aynı kaldıkça sonraki her mumda giriş, stop ve büyük hedefin varlığı aynı', { tag: ['@FRM-05', '@FRM-39'] }, () => {
  const base = run({ H4: GARTLEY }, GARTLEY_AT, { sell: false }).trade!;
  const tails = [plain(106, 95), plain(108, 104), plain(112, 106), plain(130, 110), plain(104, 90)];
  for (let n = 1; n <= tails.length; n++) {
    const t = run({ H4: [...GARTLEY, ...tails.slice(0, n)] }, GARTLEY_AT, { sell: false }).trade!;
    expect([n, t.entry, t.stop, t.tp1AtEntry, t.tpBig !== undefined]).toEqual([n, base.entry, base.stop, base.tp1AtEntry, base.tpBig !== undefined]);
  }
});

test('Büyük hedef dondurulur: girişte harmonik D yoksa sonradan da doğmaz', { tag: ['@FRM-05', '@FRM-39'] }, () => {
  // X_NO_HARMONIC: girişte harmonik yok; sonraki mumlar hedef doğurmaz
  const rows = [...X_NO_HARMONIC, plain(144, 150), plain(150, 160)];
  expect(run({ H4: rows }, X_NO_HARMONIC_AT).trade!.tpBig).toBeUndefined();
});

test('Büyük hedef: giriş henüz olmadıysa karar son muma göre verilir (davranış aynen)', { tag: ['@FRM-05', '@FRM-39'] }, () => {
  const forming = zig([100, 130, 111.46, 124.94], [18, 4, 4], 3);
  expect(run({ H4: forming }, { a: 20, b: 24, c: 28 }, { sell: false }).trade!.tpBig).toBeUndefined();
});

// ---- Erken dönüş (1114-A4.5): D, Level 1'den önce (tolerans dahil) bölgede Engulf ile döner ----
// Satış: A 100, B 130, C 114 → Level 1 144, −0.272 uzatma 138.16, tolerans 1.5 (0.05 × AB). Uç 140.5 (bölge 139–141), Engulf kapanışı 122.
// Alış: tüm fiyatlar 100'e göre aynalanır (p → 200 − p), bölge tarafları yer değiştirir.
interface ErCase {
  tip: number;
  bandZone: { bottom: number; top: number } | null;
  engulf: 'bear' | 'bull' | 'none';
  targetZones: { bottom: number; top: number }[];
  cZone: { bottom: number; top: number } | null;
  engulfZones?: boolean;
  /** Die Fraktalzone im Band entsteht erst am D */
  zoneByD?: boolean;
  /** Volumenstärke der umschlossenen Kerze (bei einer Engulf-Kerze zählt nur sie) */
  engulfWide?: boolean | null;
  /** Engulf in der nächstkleineren Zeiteinheit (H1) ab der Kerze nach dem D; `wide` = Volumenstärke beider Kerzen */
  lower?: { wide: boolean | null };
  /** Ersetzt die Kerze nach dem D (Verkaufskoordinaten) */
  tail?: Row[];
}
const ER_BASE: ErCase = { tip: 140.5, bandZone: { bottom: 139, top: 141 }, engulf: 'bear', targetZones: [{ bottom: 117, top: 118 }], cZone: { bottom: 113.5, top: 115 } };

function erRun(side: 'sell' | 'buy', over: Partial<ErCase> = {}) {
  const c = { ...ER_BASE, ...over };
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const engulfRow: Record<ErCase['engulf'], Row> = {
    bear: [Math.min(139.5, c.tip - 0.2), Math.min(139.8, c.tip - 0.1), 121, 122],
    bull: [130, 141, 129, 140],
    none: [139, 139.2, 137, 138],
  };
  const rowsSell: Row[] = [
    [101, 102, 100, 101], // A
    [128, 130, 127, 129], // B
    [116, 116, 114, 115], // C
    [120, 125, 119, 124],
    [124, c.tip, 123, Math.min(139, c.tip - 0.5)], // Uç (D)
    ...(c.tail ?? [engulfRow[c.engulf]]),
  ];
  const rows = rowsSell.map(([o, h, l, cl]): Row => (side === 'sell' ? [o, h, l, cl] : [m(o), m(l), m(h), m(cl)]));
  const bars = barsOf(rows, H4);
  const wide = bars.map(() => true as boolean | null);
  if (c.engulfWide !== undefined) wide[4] = c.engulfWide;
  const s = shapeOf(bars, { a: { idx: 0, price: m(100) }, b: { idx: 1, price: m(130) }, c: { idx: 2, price: m(114) } });
  const rect = (r: { bottom: number; top: number }) => (side === 'sell' ? r : { bottom: m(r.top), top: m(r.bottom) });
  const own = side === 'sell' ? 'resistance' : 'support';
  const opp = side === 'sell' ? 'support' : 'resistance';
  const zones: EarlyZone[] = [];
  if (c.bandZone && !c.engulfZones) zones.push({ side: own, rect: rect(c.bandZone), fractalTimes: [bars[c.zoneByD ? 4 : 0].time] });
  for (const z of c.targetZones) zones.push({ side: opp, rect: rect(z) });
  if (c.cZone) zones.push({ side: opp, rect: rect(c.cZone) });
  const engulf: EngulfZone[] = c.engulfZones && c.bandZone ? [{ side, idx: 3, rect: rect(c.bandZone), big: true, holds: true }] : [];
  let lower: { bars: ReturnType<typeof barsOf>; wide: (boolean | null)[]; sec: number } | undefined;
  if (c.lower) {
    const lrows: Row[] = [
      [138, 139.6, 137.9, 139.4], // yükselen (satışta) / aynalı: Engulf'un sarıldığı mum
      [139.5, 139.7, 121, 122], // Engulf
    ];
    lower = { bars: barsOf(lrows.map(([o, h, l, cl]): Row => (side === 'sell' ? [o, h, l, cl] : [m(o), m(l), m(h), m(cl)])), H1, 5 * H4), wide: [c.lower.wide, c.lower.wide], sec: H1 };
  }
  return { m, er: earlyReversalOf({ bars, wide, s, reached: dReached(s), zones, engulfZones: engulf, sec: H4, ...(lower ? { lower } : {}) }) };
}

for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Satış' : 'Alış';
  const near = (a: number | null | undefined, b: number) => expect(a).toBeCloseTo(b, 9);

  frm(`Erken dönüş (${tag}): koşul tam → Engulf kapanışında giriş, bölgenin uzak kenarında stop, iki hedef`, () => {
    const { m, er } = erRun(side);
    expect(er).not.toBeNull();
    near(er!.entry, m(122));
    near(er!.stop, m(141));
    near(er!.target1, m(118));
    near(er!.target2, m(115));
    near(er!.gap, 3.5);
    expect(er!.idx).toBe(5);
  });
  frm(`Erken dönüş (${tag}): −0,272 uzatmasına ulaşılmadıysa yok`, () => {
    // Bölge uca değer (137–139), yalnız uzatma geçilmedi
    expect(erRun(side, { tip: 137.5, bandZone: { bottom: 137, top: 139 } }).er).toBeNull();
  });
  frm(`Erken dönüş (${tag}): bantta bölge yoksa yok`, () => {
    expect(erRun(side, { bandZone: { bottom: 131, top: 133 } }).er).toBeNull();
    expect(erRun(side, { bandZone: null }).er).toBeNull();
  });
  frm(`Erken dönüş (${tag}): uç bölgeye değmediyse yok`, () => {
    expect(erRun(side, { bandZone: { bottom: 141.5, top: 142.4 } }).er).toBeNull();
  });
  frm(`Erken dönüş (${tag}): Engulf yoksa ya da ters yöndeyse yok`, () => {
    expect(erRun(side, { engulf: 'none' }).er).toBeNull();
    expect(erRun(side, { engulf: 'bull' }).er).toBeNull();
  });
  frm(`Erken dönüş (${tag}): seviye 1'e (toleransla) ulaşıldıysa yok, normal giriş`, () => {
    expect(erRun(side, { tip: 143 }).er).toBeNull();
    expect(erRun(side, { tip: 142.5 }).er).toBeNull();
  });
  frm(`Erken dönüş (${tag}): C'de bölge yoksa hedef 2 yok`, () => {
    const { m, er } = erRun(side, { cZone: null });
    near(er!.target1, m(118));
    expect(er!.target2).toBeNull();
  });
  frm(`Erken dönüş (${tag}): işlem yönünde hiç bölge yoksa hedef 1 ve hedef 2 yok`, () => {
    const { er } = erRun(side, { targetZones: [], cZone: null });
    expect(er).not.toBeNull();
    expect(er!.target1).toBeNull();
    expect(er!.target2).toBeNull();
  });
  frm(`Erken dönüş (${tag}): hedef 1 girişe en yakın karşı bölgenin yakın kenarı; girişin ters tarafındaki bölge sayılmaz`, () => {
    const { m, er } = erRun(side, { targetZones: [{ bottom: 117, top: 118 }, { bottom: 119, top: 120 }, { bottom: 127, top: 129 }] });
    near(er!.target1, m(120));
  });
  frm(`Erken dönüş (${tag}): bölgeyi D'nin kendisi oluşturduysa yok (döngüsel kanıt)`, () => {
    expect(erRun(side, { zoneByD: true }).er).toBeNull();
  });
  frm(`Erken dönüş (${tag}): hacimsiz ya da hacmi bilinmeyen Engulf sayılmaz`, () => {
    expect(erRun(side, { engulfWide: false }).er).toBeNull();
    expect(erRun(side, { engulfWide: null }).er).toBeNull();
  });
  // FRM-39: erken dönüşün Engulf'u formasyon ZD'sine ek olarak bir alt ZD'de de aranır (1119-A35.1.1, SIG-28)
  test(`Erken dönüş (${tag}): hacimli Engulf yalnız alt ZD'de ise giriş verir (alt ZD'de kapanış)`, { tag: ['@FRM-05', '@FRM-39'] }, () => {
    const { m, er } = erRun(side, { engulf: 'none', lower: { wide: true } });
    expect(er).not.toBeNull();
    near(er!.entry, m(122));
    near(er!.stop, m(141));
    expect(er!.lower).toBe(true);
    expect(er!.idx).toBe(5);
    expect(er!.time).toBe(5 * H4 + H1);
  });
  test(`Erken dönüş (${tag}): alt ZD'deki Engulf hacimsiz ya da hacmi bilinmiyorsa yok`, { tag: ['@FRM-05', '@FRM-39'] }, () => {
    expect(erRun(side, { engulf: 'none', lower: { wide: false } }).er).toBeNull();
    expect(erRun(side, { engulf: 'none', lower: { wide: null } }).er).toBeNull();
  });
  test(`Erken dönüş (${tag}): alt ZD görünümü yoksa eski davranış (yalnız formasyon ZD'si)`, { tag: ['@FRM-05', '@FRM-39'] }, () => {
    expect(erRun(side, { engulf: 'none' }).er).toBeNull();
    const base = erRun(side).er!;
    expect(base.lower).toBe(false);
  });
  test(`Erken dönüş (${tag}): iki ZD'de de varsa zamanca ilk kapanan geçerli`, { tag: ['@FRM-05', '@FRM-39'] }, () => {
    const { er } = erRun(side, { lower: { wide: true } });
    expect(er!.lower).toBe(true);
    expect(er!.time).toBe(5 * H4 + H1);
  });
  test(`Erken dönüş (${tag}): ilk Engulf'ta stop girişin ötesindeyse aynı bölgede sonraki Engulf denenir`, { tag: ['@FRM-05', '@FRM-39'] }, () => {
    // Bölge 137–139,5 (stop 139,5); D ucu 140,5 aşılmaz
    const tail: Row[] = [
      [139.95, 140.4, 139.9, 140.3], // Engulf'un sarıldığı mum
      [140.4, 140.45, 138.5, 139.8], // Engulf, kapanış 139,8 > stop 139,5: geçersiz
      [139, 139.4, 138.9, 139.3], // yükselen mum
      [139.4, 139.45, 121, 122], // ikinci Engulf, geçerli
    ];
    const { m, er } = erRun(side, { tail, bandZone: { bottom: 137, top: 139.5 } });
    expect(er).not.toBeNull();
    near(er!.entry, m(122));
    expect(er!.idx).toBe(8);
  });
  frm(`Erken dönüş (${tag}): Engulf bölgesi de bantta bölge sayılır`, () => {
    const { m, er } = erRun(side, { engulfZones: true });
    near(er!.stop, m(141));
  });
}

// ---- Erken dönüş auf echten Kerzen: Fraktalzone im Band, Engulf bei der D-Kerze ----
/** Widerstand 140 (Index 2), A 100, B 130, C 114 → Level 1 144; Stütze bei 120 und 114; D 140,5 berührt die Zone, danach Engulf (Schluss 134) */
const ER_ROWS: Row[] = (() => {
  const rows = zig([140, 100, 130, 114, 126, 120, 140.5], [8, 8, 8, 8, 8, 24], 0);
  rows[rows.length - 1] = [136, 140.5, 135.8, 139];
  rows.push([139, 139.2, 133.9, 134]);
  return rows;
})();
const ER_ABC = { a: 10, b: 18, c: 26 };

for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Satış' : 'Alış';
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const rows = side === 'sell' ? ER_ROWS : mirror(ER_ROWS);

  frm(`Erken dönüş (${tag}, gerçek mumlar): hüküm oluşuyor kalır, giriş/stop/hedefler dolu, Fibo hedefi ve durum yok`, () => {
    const c = run({ H4: rows }, ER_ABC, { sell: side === 'sell' });
    expect(c.verdict).toBe('forming');
    expect(c.invalidBy ?? []).toEqual([]);
    const t = c.trade!;
    expect(t.entry).toBeCloseTo(m(134), 9);
    expect(t.stop).toBeCloseTo(m(140), 9);
    expect(t.tp1).toBeCloseTo(m(130), 9);
    expect(t.earlyReversal!.target2).toBeCloseTo(m(114.95), 9);
    expect(t.earlyReversal!.gap).toBeCloseTo(3.5, 9);
    expect(t.emergencyStop).not.toBeNull();
    expect([t.tp2, t.tp3, t.status, t.tp2AtEntry, t.tp1AtEntry]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(c.drawings.map((d) => d.id)).toEqual(['Z-ABCD-01', 'Z-ABCD-02', 'Z-ABCD-03', 'Z-ABCD-04', 'Z-ABCD-06', 'Z-ABCD-07', 'Z-ABCD-08']);
    expect(c.drawings.find((d) => d.id === 'Z-ABCD-07')!.anchors[0].price).toBeCloseTo(m(140), 9);
    // Prüfliste unverändert: ABCD-08 bleibt ☐ (im Aufbau)
    expect(state(c, 'ABCD-08')).toBe(N);
  });

  frm(`Erken dönüş (${tag}, gerçek mumlar): erreicht der Kurs später Level 1, kehrt der Block zum normalen Einstieg zurück`, () => {
    const later: Row[] = [...rows, side === 'sell' ? [134, 144.2, 133.8, 144] : [66, 66.2, 55.8, 56]];
    const c = run({ H4: later }, ER_ABC, { sell: side === 'sell' });
    expect(c.trade!.earlyReversal).toBeUndefined();
    expect(c.trade!.entry).toBeCloseTo(m(144), 9);
  });
}
