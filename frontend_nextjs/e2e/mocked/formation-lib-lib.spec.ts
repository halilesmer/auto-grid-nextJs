/**
 * Libra: je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `zig(punkte, LEGS, 3)` setzt die Wendepunkte
 * auf Index 2 + Summe der Zuglängen davor. Basis (Verkauf): Vorlauf-Tief 100, P1 130 (Index 10), Korrektur C 112 (18), P2 140 (26),
 * Wendebewegung in 4 Kerzen auf P3 105 (30), Rücklauf auf K 131 (38).
 * Rechnung: Fib P2 → P3 hat die Länge 35; Level 0.786 = 105 + 0,786 × 35 = 132,51. Die Zone beginnt an der Körperkante von P1
 * (Schluss 129,8) und endet an der Docht-Spitze von P2 (140). Die zuerst erreichte Kante ist die untere (129,8); K 131 erreicht sie,
 * K 128 nicht. Ziel 1 = obere Kante der Zone von P3 (105 + 0,5 × Spanne der rechten Nachbarkerze 3,25 = 106,625). CRV = (129,8 − 106,625) /
 * (140 − 129,8) = 2,27.
 * FRM-09 Formationserkennung: Libra
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeLib, checkLibCandidate, LIB_CHECK_IDS } from '../../src/lib/formation/libChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H1, H4, M15, barsOf, mirror, patched, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-09' }, fn);

const STEP = { D1, H4, H1, M15 } as const;
type Tf = keyof typeof STEP;

const ctxOf = (input: Partial<Record<Tf, Row[]>>) => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext('TEST', bars);
};

const wick = (rows: Row[], idx: number, high: boolean, step: number = H4): Anchor => ({ time: idx * step, price: high ? rows[idx][1] : rows[idx][2] });

interface At {
  p1: number;
  p2: number;
  p3?: number;
}
const AT: At = { p1: 10, p2: 26, p3: 30 };

interface Options {
  /** Verkauf nach Hochs P1/P2 (Standard); false für das Spiegelbild */
  top?: boolean;
  tf?: Tf;
  t?: number;
  harmonics?: Candidate[];
}

/** Prüft P1, P2 und P3; `top = false` für das Spiegelbild */
function run(input: Partial<Record<Tf, Row[]>>, at: At = AT, options: Options = {}): Candidate {
  const tf = options.tf ?? 'H4';
  const rows = input[tf]!;
  const top = options.top ?? true;
  const step = STEP[tf];
  return checkLibCandidate(
    ctxOf(input),
    options.t ?? END,
    {
      tf: tf as ContextTimeframe,
      p1: wick(rows, at.p1, top, step),
      p2: wick(rows, at.p2, top, step),
      ...(at.p3 === undefined ? {} : { p3: wick(rows, at.p3, !top, step) }),
    },
    options.harmonics,
  );
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;
const idOf = (n: number) => `LIB-${String(n).padStart(2, '0')}`;

// ---- Reihen ----------------------------------------------------------------------------------------------------

const LEGS = [8, 8, 8, 4, 8];
const BASE = zig([100, 130, 112, 140, 105, 131], LEGS, 3);
/** Wendebewegung in 8 statt 4 Kerzen: keine Kerze ist volumenstark (Spanne 4,6 < 1,5 × Mittel) */
const SLOW_LEGS = [8, 8, 8, 8, 8];
const SLOW = zig([100, 130, 112, 140, 105, 131], SLOW_LEGS, 3);
const SLOW_AT: At = { p1: 10, p2: 26, p3: 34 };
/** K 128 bleibt unter der Zonenkante 129,8 */
const NO_TOUCH = zig([100, 130, 112, 140, 105, 128], LEGS, 3);
/** P3 ist die letzte Kerze: noch kein Fraktal */
const OPEN_P3 = zig([100, 130, 112, 140, 105], LEGS, 0);
/** P2 140 liegt nicht über P1 150 (Index 10 und 26 bleiben) */
const P2_BELOW = zig([100, 150, 112, 140, 105, 131], LEGS, 3);
/** Docht bis 105, aber alle Schlüsse der Wendebewegung bleiben über C 112 */
const WICK_ONLY = patched(zig([100, 130, 112, 140, 113, 131], LEGS, 3), 30, [113.75, 113.85, 105, 113.2]);
/** Fall in 2 Kerzen, aber ein Schluss unter C reicht dem Trend nicht: der Trend bleibt aufwärts (Kurzer Fall, Rücklauf in 1 Kerze) */
const ONE_CLOSE = zig([100, 130, 112, 140, 105, 131], [8, 8, 8, 2, 1], 3);
const ONE_CLOSE_AT: At = { p1: 10, p2: 26, p3: 28 };
/** Nach K schließt der Preis über 140 (Docht-Spitze von P2): Libra verletzt */
const VIOLATED = zig([100, 130, 112, 140, 105, 131, 120, 145], [8, 8, 8, 4, 8, 6, 8], 3);
/** Rücklauf in 40 Kerzen: Berührung bei Index 70, 40 Kerzen nach P3 */
const LATE = zig([100, 130, 112, 140, 105, 131], [8, 8, 8, 4, 40], 3);
/** Zickzack zwischen P3 und K: je zwei Hochs und zwei Tiefs als Fraktale */
const ZIGZAG = zig([100, 130, 112, 140, 105, 112, 108, 118, 113, 131], [8, 8, 8, 4, 4, 4, 4, 4, 4, 8], 3);
/** Innerer AB=CD: A' 105 (P3), B' 125, C' 112,5, D' = 112,5 + 20 = 132,5 ≈ Level 0.786 (132,51) */
const INNER = zig([100, 130, 112, 140, 105, 125, 112.5, 131], [8, 8, 8, 4, 8, 6, 8], 3);
/** P2 150: Stop weiter weg, CRV = (129,8 − 106,6) / (150 − 129,8) ≈ 1,15 */
const WIDE_STOP = zig([100, 130, 112, 150, 105, 131], LEGS, 3);
/** Nach K fällt der Preis auf 100: das Ziel (106,625) wird erreicht */
const TARGET = zig([100, 130, 112, 140, 105, 131, 100], [8, 8, 8, 4, 8, 8], 3);
/** H4-Aufwärtstrend und H4-Abwärtstrend für LIB-07 */
const H4_UP = zig([100, 120, 110, 140, 125, 160], 8, 3);
const H4_DOWN = mirror(H4_UP);
/** 40 ruhige Kerzen vor der Reihe: die Wave (SMA 35) ist erst danach gerechnet */
const LEAD: Row[] = Array.from({ length: 40 }, () => plain(100, 100));
/** Harmonik (Kauf) mit D auf Kerze `dIdx` und A weit darüber */
const harmonic = (rows: Row[], dIdx: number, a: number, over: Partial<Candidate> = {}): Candidate => ({
  code: 'GAR',
  side: 'buy',
  tf: 'H4',
  points: { A: { time: 0, price: a }, D: { time: dIdx * H4, price: rows[dIdx][2] } },
  checks: [],
  drawings: [],
  verdict: 'valid',
  ...over,
});
/** Divergenz am Hoch: P2 wird in 14 statt 8 Kerzen erreicht, die Wave ist dort schwächer als an P1 */
const DIVERGENT = [...LEAD, ...zig([100, 130, 112, 140, 105, 131], [8, 8, 14, 4, 8], 3)];
const DIVERGENT_AT: At = { p1: 50, p2: 72, p3: 76 };
/** P1 120 in 14 Kerzen, P2 150 in 4 Kerzen: die Wave ist an P2 stärker, keine Divergenz */
const NO_DIVERGENCE = [...LEAD, ...zig([100, 120, 112, 150, 105, 131], [14, 8, 4, 4, 8], 3)];
const NO_DIVERGENCE_AT: At = { p1: 56, p2: 68, p3: 72 };

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  {
    name: 'Basis: P1, Korrektur, P2, volumenstarke Wendebewegung, P3, Berührung der Zone: alles erfüllt',
    candidate: () => run({ H4: BASE }),
    expect: { '01': M, '02': M, '03': M, '04': M, '06': M, '07': M, '08': N, '09': U, '10': N, '11': M, '12': M, '13': N, '14': N, '15': N, '16': N },
  },
  { name: 'Regel 01 ☐: P2 liegt nicht jenseits von P1', candidate: () => run({ H4: P2_BELOW }), expect: { '01': N } },
  { name: 'Regel 02 ☐: die Wendebewegung erreicht C nur mit Docht, kein Schluss (Doppeltop/-boden, nicht Libra)', candidate: () => run({ H4: WICK_ONLY }), expect: { '02': N, '04': M, '12': M } },
  { name: 'Regel 02 ☐: ein Schluss jenseits von C genügt nicht, der Trend bleibt aufwärts', candidate: () => run({ H4: ONE_CLOSE }, ONE_CLOSE_AT), expect: { '02': N } },
  { name: 'Regel 03 ☐: keine volumenstarke Kerze in der Wendebewegung', candidate: () => run({ H4: SLOW }, SLOW_AT), expect: { '03': N, '02': M } },
  { name: 'Regel 04 ☐: an P3 ist noch kein Fraktal fertig', candidate: () => run({ H4: OPEN_P3 }, { p1: 10, p2: 26 }), expect: { '04': N, '12': N } },
  { name: 'Regel 06 ☐: Zeiteinheit H1', candidate: () => run({ H1: BASE }, AT, { tf: 'H1' }), expect: { '06': N } },
  { name: 'Regel 06 ☑: Zeiteinheit D1', candidate: () => run({ D1: BASE }, AT, { tf: 'D1' }), expect: { '06': M } },
  { name: 'Regel 07 ☑: M15-Verkauf mit H4-Abwärtstrend', candidate: () => run({ H4: H4_DOWN, M15: BASE }, AT, { tf: 'M15' }), expect: { '07': M, '16': M } },
  { name: 'Regel 07 ☐: M15-Verkauf gegen den H4-Aufwärtstrend', candidate: () => run({ H4: H4_UP, M15: BASE }, AT, { tf: 'M15' }), expect: { '07': N } },
  { name: 'Regel 07 nicht messbar: M15 ohne geladene H4-Kerzen', candidate: () => run({ M15: BASE }, AT, { tf: 'M15' }), expect: { '07': U } },
  { name: 'Regel 08 ☑: Level 0.786 liegt am D eines inneren AB=CD', candidate: () => run({ H4: INNER }), expect: { '08': M, '15': N } },
  { name: 'Regel 09 nicht messbar: Cypher fehlt', candidate: () => run({ H4: BASE }), expect: { '09': U } },
  {
    name: 'Regel 10 ☑: Harmonik mit D auf P3, Ziele erreicht, Divergenz am Hoch',
    candidate: () => run({ H4: DIVERGENT }, DIVERGENT_AT, { harmonics: [harmonic(DIVERGENT, 76, 135)] }),
    expect: { '10': M },
  },
  { name: 'Regel 10 ☐: Harmonik mit D auf einer anderen Kerze', candidate: () => run({ H4: DIVERGENT }, DIVERGENT_AT, { harmonics: [harmonic(DIVERGENT, 75, 135)] }), expect: { '10': N } },
  { name: 'Regel 10 ☐: Harmonik passt, aber P2 hat keine Divergenz zu P1', candidate: () => run({ H4: NO_DIVERGENCE }, NO_DIVERGENCE_AT, { harmonics: [harmonic(NO_DIVERGENCE, 72, 135)] }), expect: { '10': N } },
  { name: 'Regel 10 ☐: die Harmonik ist ungültig', candidate: () => run({ H4: DIVERGENT }, DIVERGENT_AT, { harmonics: [harmonic(DIVERGENT, 76, 135, { verdict: 'invalid' })] }), expect: { '10': N } },
  { name: 'Regel 10 ☐: die Harmonik hat die falsche Seite', candidate: () => run({ H4: DIVERGENT }, DIVERGENT_AT, { harmonics: [harmonic(DIVERGENT, 76, 135, { side: 'sell' })] }), expect: { '10': N } },
  // A 160: Ziel 0.382 = 105 + 0,382 × 55 = 126,0 wird erreicht, Ziel 0.618 = 139 nicht (K 131)
  { name: 'Regel 10 ☐: nur das erste Ziel der Harmonik ist erreicht', candidate: () => run({ H4: DIVERGENT }, DIVERGENT_AT, { harmonics: [harmonic(DIVERGENT, 76, 160)] }), expect: { '10': N } },
  { name: 'Regel 11 ☐: weiter Stop, CRV bis TP1 unter 2', candidate: () => run({ H4: WIDE_STOP }), expect: { '11': N, '12': M } },
  { name: 'Regel 12 ☐: Rücklauf erreicht die Zone nicht', candidate: () => run({ H4: NO_TOUCH }), expect: { '12': N, '14': N, '15': N } },
  { name: 'Regel 13 ☑: Schluss jenseits der Docht-Spitze von P2', candidate: () => run({ H4: VIOLATED }), expect: { '13': M, '12': M } },
  { name: 'Regel 14 ☑: Berührung 40 Kerzen nach P3', candidate: () => run({ H4: LATE }, { p1: 10, p2: 26, p3: 30 }), expect: { '14': M, '12': M, '15': N } },
  { name: 'Regel 15 ☑: vier Fraktale zwischen P3 und Berührung', candidate: () => run({ H4: ZIGZAG }), expect: { '15': M, '14': N, '12': M } },
  { name: 'Regel 16 ☑: Zeiteinheit M15', candidate: () => run({ H4: H4_DOWN, M15: BASE }, AT, { tf: 'M15' }), expect: { '16': M, '06': N } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = c.candidate();
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, `LIB-${n}`), `${idOf(Number(n))}`).toBe(want);
  });
}

frm('Regel 11: Wert ist das CRV bis TP1 am gewählten Einstieg (Handrechnung 2,27 und 1,15)', () => {
  expect(find(run({ H4: BASE }), 'LIB-11').value).toBeCloseTo(2.27, 1);
  expect(find(run({ H4: WIDE_STOP }), 'LIB-11').value).toBeCloseTo(1.15, 1);
});

frm('Urteil: gültig, im Aufbau ohne Berührung oder ohne fertiges P3, ungültig bei Ausschluss und fehlender Pflicht', () => {
  expect(run({ H4: BASE }).verdict).toBe('valid');
  expect(run({ H4: NO_TOUCH }).verdict).toBe('forming');
  expect(run({ H4: OPEN_P3 }, { p1: 10, p2: 26 }).verdict).toBe('forming');
  expect(run({ H4: VIOLATED }).verdict).toBe('invalid');
  expect(run({ H4: LATE }).verdict).toBe('invalid');
  expect(run({ H4: ZIGZAG }).verdict).toBe('invalid');
  expect(run({ H4: WICK_ONLY }).verdict).toBe('invalid');
  expect(run({ H4: SLOW }, SLOW_AT).verdict).toBe('invalid');
  expect(run({ H4: P2_BELOW }).verdict).toBe('invalid');
  expect(run({ H4: H4_UP, M15: BASE }, AT, { tf: 'M15' }).verdict).toBe('invalid');
});

frm('Urteil: ist P2 die letzte Kerze, fehlt noch alles nach P2 – im Aufbau, nichts erfunden', () => {
  const c = run({ H4: BASE.slice(0, 27) }, { p1: 10, p2: 26 });
  expect(c.verdict).toBe('forming');
  for (const n of [1, 2, 3, 4, 8, 10, 11, 12, 14, 15]) expect(state(c, idOf(n)), idOf(n)).toBe(U);
});

frm('Abgrenzung Doppeltop/-boden: nur Docht jenseits von C ist keine Libra (Regel 02 ☐), mit Schluss schon', () => {
  const wickOnly = run({ H4: WICK_ONLY });
  expect(state(wickOnly, 'LIB-02')).toBe(N);
  expect(wickOnly.verdict).toBe('invalid');
  const closing = run({ H4: BASE });
  expect(state(closing, 'LIB-02')).toBe(M);
  expect(closing.verdict).toBe('valid');
});

frm('Spiegelfall: Kauf nach Tiefs P1/P2 hat dieselben Zustände wie der Verkauf', () => {
  for (const [name, rows, at] of [
    ['Basis', BASE, AT],
    ['ohne Berührung', NO_TOUCH, AT],
    ['Docht', WICK_ONLY, AT],
    ['verletzt', VIOLATED, AT],
    ['Zickzack', ZIGZAG, AT],
    ['innerer AB=CD', INNER, AT],
    ['weiter Stop', WIDE_STOP, AT],
  ] as const) {
    const top = run({ H4: rows }, at);
    const bottom = run({ H4: mirror(rows) }, at, { top: false });
    expect(top.side, name).toBe('sell');
    expect(bottom.side, name).toBe('buy');
    expect(bottom.checks.map((x) => [x.id, x.state]), name).toEqual(top.checks.map((x) => [x.id, x.state]));
    expect(bottom.verdict, name).toBe(top.verdict);
  }
});

frm('Eigene Punkte in falscher Reihenfolge oder mit unbekannter Zeit: alles nicht messbar', () => {
  const bars = BASE;
  const ctx = ctxOf({ H4: bars });
  const a = (idx: number, price: number): Anchor => ({ time: idx * H4, price });
  for (const input of [
    { tf: 'H4' as const, p1: a(26, 140), p2: a(10, 130) },
    { tf: 'H4' as const, p1: a(10, 130), p2: a(26, 140), p3: a(20, 105) },
    { tf: 'H4' as const, p1: a(10.5, 130), p2: a(26, 140) },
  ]) {
    const c = checkLibCandidate(ctx, END, input);
    expect(c.verdict).toBe('forming');
    expect(c.checks.every((k) => k.state === U)).toBe(true);
  }
});

frm('Messung ohne eigenes P3 findet das Ende der Wendebewegung selbst', () => {
  const c = run({ H4: BASE }, { p1: 10, p2: 26 });
  expect(c.points.P3.time).toBe(30 * H4);
  expect(state(c, 'LIB-12')).toBe(M);
  expect(c.verdict).toBe('valid');
});

frm('Abdeckung: jede messbare Bedingung hat einen ☑- und einen ☐-Fall, Regel 09 bleibt nicht messbar', () => {
  const seen: Record<string, Set<CheckState>> = {};
  const all = [
    run({ H4: BASE }),
    run({ H4: P2_BELOW }),
    run({ H4: WICK_ONLY }),
    run({ H4: SLOW }, SLOW_AT),
    run({ H4: OPEN_P3 }, { p1: 10, p2: 26 }),
    run({ H1: BASE }, AT, { tf: 'H1' }),
    run({ H4: H4_DOWN, M15: BASE }, AT, { tf: 'M15' }),
    run({ H4: H4_UP, M15: BASE }, AT, { tf: 'M15' }),
    run({ M15: BASE }, AT, { tf: 'M15' }),
    run({ H4: INNER }),
    run({ H4: DIVERGENT }, DIVERGENT_AT, { harmonics: [harmonic(DIVERGENT, 76, 135)] }),
    run({ H4: WIDE_STOP }),
    run({ H4: NO_TOUCH }),
    run({ H4: VIOLATED }),
    run({ H4: LATE }),
    run({ H4: ZIGZAG }),
  ];
  for (const cand of all) for (const k of cand.checks) (seen[k.id] ??= new Set()).add(k.state);
  for (const id of LIB_CHECK_IDS) {
    if (id === 'LIB-09') continue;
    expect(seen[id]?.has(M), `${id} ☑`).toBe(true);
    expect(seen[id]?.has(N), `${id} ☐`).toBe(true);
  }
  expect([...seen['LIB-09']]).toEqual([U]);
  expect(seen['LIB-07'].has(U)).toBe(true);
});

frm('Kein Blick in die Zukunft: Kerzen nach t ändern nichts', () => {
  const t = (38 + 1) * H4;
  const full = run({ H4: BASE }, AT, { t });
  const cut = run({ H4: BASE.slice(0, 39) }, AT, { t });
  expect(full.checks.map((x) => [x.id, x.state])).toEqual(cut.checks.map((x) => [x.id, x.state]));
  expect(full.verdict).toBe(cut.verdict);
  // vor dem Schluss der Berührungskerze gibt es noch keine Berührung
  expect(state(run({ H4: BASE }, AT, { t: 38 * H4 }), 'LIB-12')).toBe(N);
});

frm('Wechsel gültig → ungültig: der Schluss jenseits von P2 kippt dieselbe Libra', () => {
  const before = run({ H4: VIOLATED }, AT, { t: 40 * H4 });
  const after = run({ H4: VIOLATED }, AT, { t: END });
  expect(before.verdict).toBe('valid');
  expect(after.verdict).toBe('invalid');
  expect(state(after, 'LIB-13')).toBe(M);
});

frm('Zeichnungen: Zone, Level 0.786, Fib, Ziel- und Stop-Label und Pfeil kommen auch bei ☐', () => {
  // Ziel 1 = 105 + 0,5 × Spanne der rechten Nachbarkerze von P3: Anstieg 26 bzw. 23 in 8 Kerzen → Spanne 3,25 bzw. 2,875
  for (const [rows, target] of [[BASE, 106.625], [NO_TOUCH, 106.4375]] as const) {
    const c = run({ H4: rows });
    expect(c.drawings.map((d) => d.id)).toEqual(['Z-LIB-01', 'Z-LIB-02', 'Z-LIB-03', 'Z-LIB-04', 'Z-LIB-05', 'Z-LIB-06']);
    const zone = c.drawings.find((d) => d.id === 'Z-LIB-01')!;
    expect(zone.tool).toBe('zone');
    expect(zone.anchors[0].price).toBeCloseTo(129.8, 2);
    expect(zone.anchors[1].price).toBe(140);
    expect(zone.anchors[0].time).toBe(10 * H4);
    const single = c.drawings.find((d) => d.id === 'Z-LIB-02')!;
    expect(single.levels).toEqual([0.786]);
    expect(single.anchors.map((a) => a.price)).toEqual([140, 105]);
    const fib = c.drawings.find((d) => d.id === 'Z-LIB-03')!;
    expect(fib.levels).toEqual([0.382, 0.786, -0.272]);
    expect(c.drawings.find((d) => d.id === 'Z-LIB-04')!.anchors[0].price).toBeCloseTo(target, 3);
    expect(c.drawings.find((d) => d.id === 'Z-LIB-05')!.anchors[0].price).toBe(140);
  }
});

frm('Zeichnung Z-Regel 07 (Häkchen) kommt erst, wenn das Ziel nach der Berührung erreicht ist', () => {
  expect(run({ H4: BASE }).drawings.some((d) => d.id === 'Z-LIB-07')).toBe(false);
  const hit = run({ H4: TARGET }).drawings.find((d) => d.id === 'Z-LIB-07');
  expect(hit?.tool).toBe('marker');
  expect(hit!.anchors[0].price).toBeCloseTo(106.625, 2);
});

frm('Analyse findet Paar, P3 und Berührung selbst und liefert alle Bedingungen', () => {
  const res = analyzeLib(ctxOf({ H4: BASE }), END);
  expect(res.map((r) => r.tf)).toEqual(['H4']);
  const c = res[0].candidate;
  expect(c.checks.map((x) => x.id)).toEqual([...LIB_CHECK_IDS]);
  expect(c.verdict).toBe('valid');
  expect(c.side).toBe('sell');
  expect(c.points.P1.time).toBe(10 * H4);
  expect(c.points.P2.time).toBe(26 * H4);
  expect(c.points.P3.time).toBe(30 * H4);
});

// ---- Echte Kerzenreihen ----------------------------------------------------------------------------------------

interface Real {
  file: string;
  /** Prüfzeitpunkt t (MT5-Sekunden) */
  t: number;
  side: 'sell' | 'buy';
  verdict: Candidate['verdict'];
  /** Kerzenbeginn von P2 und P3 */
  p2: number;
  p3: number;
  expect: Record<string, CheckState>;
}

const loadReal = (file: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')));

const GOOD = { '01': M, '02': M, '03': M, '04': M, '06': M, '07': M, '12': M, '13': N, '14': N, '15': N, '16': N } as const;
const REAL: Real[] = [
  // Verkauf, CRV 2,13 am gewählten Einstieg
  { file: 'lib-sell-h4-01', t: 1760486400, side: 'sell', verdict: 'valid', p2: 1760112000, p3: 1760443200, expect: { ...GOOD, '08': N, '10': N, '11': M } },
  // Kauf (Spiegelfall), dieselbe Libra eine Kerze nach P3-Bestätigung noch ohne Berührung: im Aufbau
  { file: 'lib-buy-h4-01', t: 1761048000, side: 'buy', verdict: 'valid', p2: 1760688000, p3: 1761004800, expect: { ...GOOD, '10': N, '11': M } },
  { file: 'lib-buy-h4-01', t: 1760976000, side: 'buy', verdict: 'forming', p2: 1760688000, p3: 1760932800, expect: { '01': M, '02': M, '03': M, '04': M, '12': N } },
  // Level 0.786 liegt am D eines inneren AB=CD; zwei Kerzen später schließt eine Kerze über P2: dieselbe Libra ist verletzt
  { file: 'lib-swing-h4-01', t: 1765195200, side: 'sell', verdict: 'valid', p2: 1764763200, p3: 1764921600, expect: { ...GOOD, '08': M } },
  { file: 'lib-swing-h4-01', t: 1765252800, side: 'sell', verdict: 'invalid', p2: 1764763200, p3: 1764921600, expect: { ...GOOD, '08': M, '13': M } },
  // Negativfall: mehr als 2 Schwungpunkte zwischen P3 und Berührung (zweite Libra derselben Reihe: zusätzlich Level 0.786 am inneren AB=CD)
  { file: 'lib-zigzag-h4-01', t: 1760616000, side: 'sell', verdict: 'invalid', p2: 1760414400, p3: 1760428800, expect: { '01': M, '02': M, '03': M, '04': M, '12': M, '13': N, '14': N, '15': M } },
  { file: 'lib-zigzag-h4-01', t: 1762545600, side: 'sell', verdict: 'invalid', p2: 1761825600, p3: 1762300800, expect: { '01': M, '02': M, '03': M, '04': M, '08': M, '12': M, '15': M } },
  // Negativfall: Docht, aber kein Schluss jenseits der Korrektur
  { file: 'lib-docht-h4-01', t: 1760976000, side: 'buy', verdict: 'invalid', p2: 1760688000, p3: 1760932800, expect: { '01': M, '02': N, '04': M, '12': M } },
  // gültig, dann verletzt
  { file: 'lib-gone-h4-01', t: 1763064000, side: 'buy', verdict: 'valid', p2: 1762992000, p3: 1763020800, expect: { ...GOOD } },
  { file: 'lib-gone-h4-01', t: 1763107200, side: 'buy', verdict: 'invalid', p2: 1762992000, p3: 1763020800, expect: { ...GOOD, '13': M } },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file} bei t=${r.t}`, () => {
    const fx = loadReal(r.file);
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const c = analyzeLib(new FormationContext(fx.symbol, { H4: known }), r.t)[0].candidate;
    expect(c.side).toBe(r.side);
    expect(c.verdict).toBe(r.verdict);
    expect(c.points.P2.time).toBe(r.p2);
    expect(c.points.P3.time).toBe(r.p3);
    for (const [n, want] of Object.entries(r.expect)) expect(state(c, idOf(Number(n))), idOf(Number(n))).toBe(want);
    // Kein Blick in die Zukunft: mit allen Kerzen der Datei und gleichem t derselbe Befund
    const full = analyzeLib(new FormationContext(fx.symbol, { H4: fx.bars }), r.t)[0].candidate;
    expect(full.checks.map((x) => [x.id, x.state])).toEqual(c.checks.map((x) => [x.id, x.state]));
    expect(full.verdict).toBe(c.verdict);
  });
}
