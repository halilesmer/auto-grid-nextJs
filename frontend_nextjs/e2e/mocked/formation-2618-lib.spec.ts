/**
 * 2618: je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `zig(punkte, LEGS, 3)` setzt die Wendepunkte
 * auf Index 2, 10, 18, 26, 34, 42, 50 (8 Kerzen je Zug). Doppeltop wie in formation-cdt-lib.spec.ts: Vorlauf-Hoch 120, Tief 100,
 * H1 130 (Zone 128,875 bis 130), N 112, H2 129,85. Dann fällt der Preis auf I 98 (Docht unter N) und läuft auf K zurück.
 * Fib H2 → I: Länge 31,85; Level 0.5 = 113,925; Level 0.618 = 98 + 0,618 × 31,85 = 117,68; Ausdehnung −0.272 = 98 − 8,66 = 89,34.
 * K 118,5 berührt 0.618; K 116 bleibt darunter.
 * FRM-08 Formationserkennung: 2618
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyze2618, check2618Candidate, F2618_CHECK_IDS } from '../../src/lib/formation/f2618Checks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H4, barsOf, mirror, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-08' }, fn);

const STEP = { D1, H4 } as const;
type Tf = keyof typeof STEP;

const ctxOf = (input: Partial<Record<Tf, Row[]>>) => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext('TEST', bars);
};

const wick = (rows: Row[], idx: number, high: boolean, step: number = H4): Anchor => ({ time: idx * step, price: high ? rows[idx][1] : rows[idx][2] });

interface At {
  h1: number;
  n: number;
  h2: number;
  i: number;
}
const AT: At = { h1: 18, n: 26, h2: 34, i: 42 };

interface Options {
  /** Doppeltop (Verkauf); false für den gespiegelten Doppelboden */
  top?: boolean;
  tf?: Tf;
  t?: number;
  /** ohne Angabe: H2 und I werden gemessen */
  measured?: boolean;
}

/** Prüft H1, N, H2 und I; `top = false` für das Spiegelbild */
function run(input: Partial<Record<Tf, Row[]>>, at: At = AT, options: Options = {}): Candidate {
  const tf = options.tf ?? 'H4';
  const rows = input[tf]!;
  const top = options.top ?? true;
  const step = STEP[tf];
  return check2618Candidate(ctxOf(input), options.t ?? END, {
    tf: tf as ContextTimeframe,
    h1: wick(rows, at.h1, top, step),
    n: wick(rows, at.n, !top, step),
    ...(options.measured ? {} : { h2: wick(rows, at.h2, top, step), i: wick(rows, at.i, !top, step) }),
  });
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;
const idOf = (n: number) => `2618-${String(n).padStart(2, '0')}`;

// ---- Reihen ----------------------------------------------------------------------------------------------------

const LEGS = 8;
/** Doppeltop, Fall auf I 98, Rücklauf auf K 118,5 (0.618 bei 117,68 berührt) */
const BASE = zig([120, 100, 130, 112, 129.85, 98, 118.5], LEGS, 3);
/** K 116: bleibt unter 0.618 */
const NO_TOUCH = zig([120, 100, 130, 112, 129.85, 98, 116], LEGS, 3);
/** N 122: Korrektur H1 → N nur 0,267 tief (CDT-04) */
const SHALLOW = zig([120, 100, 130, 122, 129.85, 98, 118.5], LEGS, 3);
/** I 114 bleibt über N 112: kein Schluss und kein Docht unter N. Fib 129,85 → 114: 0.618 bei 123,8 */
const ABOVE_N = zig([120, 100, 130, 112, 129.85, 114, 124.5], LEGS, 3);
/** Die Reihe endet an I: kein fertiges Fraktal */
const OPEN_I = zig([120, 100, 130, 112, 129.85, 98], LEGS, 0);
/** Fall in 2 Kerzen, Rücklauf in 1 Kerze: nur der Schluss an I liegt unter N, der Trend bleibt aufwärts */
const ONE_CLOSE = zig([120, 100, 130, 112, 129.85, 98, 118.5], [8, 8, 8, 8, 2, 1], 3);
/** Nach H2 fällt der Preis auf 120, springt auf ein neues Hoch 133 (Schluss über der Zone), fällt auf 98 und läuft auf 120,5 (0.618 der Fib 133 → 98 = 119,63) */
const STOP_BROKEN = zig([120, 100, 130, 112, 129.85, 120, 133, 98, 120.5], LEGS, 3);
const STOP_AT: At = { h1: 18, n: 26, h2: 34, i: 58 };
/** K-Kerze mit großer Spanne, steigend (volumenstark gegen den Verkauf) */
const WIDE_K: Row[] = BASE.map((r, k) => (k === 50 ? ([105, 118.5, 104.5, 118.3] as Row) : r));
/** Dieselbe Kerze, aber fallend (Körper mit dem Verkauf) */
const WIDE_DOWN: Row[] = BASE.map((r, k) => (k === 50 ? ([118.3, 118.5, 104.5, 105] as Row) : r));
/** Größere Bewegung in D1 (Hoch 150, Tief 65,4): Level 0.618 = 65,4 + 0,618 × 84,6 = 117,68 */
const D1_BIG = zig([160, 120, 150, 65.4, 100]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  { name: 'Doppeltop, Bruch unter N, I, Rücklauf an 0.618: alles erfüllt', candidate: () => run({ H4: BASE }), expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': M, '08': M, '09': N, '10': N } },
  { name: '2618-01 ☐: Korrektur H1 → N zu flach, kein Doppeltop (nur „618 nach Trendwechsel“)', candidate: () => run({ H4: SHALLOW }), expect: { '01': N } },
  { name: '2618-02 ☐: I bleibt über N, kein Schluss darunter', candidate: () => run({ H4: ABOVE_N }, { ...AT, i: 42 }), expect: { '02': N, '03': M, '04': N, '05': M } },
  { name: '2618-03 ☐: an I ist noch kein Fraktal fertig', candidate: () => run({ H4: OPEN_I }), expect: { '03': N } },
  { name: '2618-05 ☐: Korrektur bleibt unter 0.618', candidate: () => run({ H4: NO_TOUCH }), expect: { '05': N, '10': U } },
  { name: '2618-06 ☐: nur ein Schluss unter N, der Trend bleibt aufwärts', candidate: () => run({ H4: ONE_CLOSE }, { ...AT, i: 36 }), expect: { '02': M, '06': N } },
  { name: '2618-08 ☐: Zeiteinheit D1', candidate: () => run({ D1: BASE }, AT, { tf: 'D1' }), expect: { '08': N } },
  { name: '2618-09 ☑: Schluss über der Stop-Zone vor der Berührung', candidate: () => run({ H4: STOP_BROKEN }, STOP_AT), expect: { '09': M, '05': M } },
  { name: '2618-10 ☑: volumenstarke steigende Kerze an der Berührung', candidate: () => run({ H4: WIDE_K }), expect: { '10': M, '05': M } },
  { name: '2618-10 ☐: dieselbe Kerze fällt (mit dem Verkauf)', candidate: () => run({ H4: WIDE_DOWN }), expect: { '10': N, '05': M } },
  { name: '2618-07 ☑: Level 0.618 der Bewegung in D1 fällt auf den Einstieg', candidate: () => run({ D1: D1_BIG, H4: BASE }), expect: { '07': M } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = c.candidate();
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, `2618-${n}`), `${idOf(Number(n))}`).toBe(want);
  });
}

frm('Urteil: gültig bei allen Pflichten, im Aufbau ohne Berührung, ungültig bei Ausschluss, fehlendem Doppeltop oder Gegentrend an K', () => {
  expect(run({ H4: BASE }).verdict).toBe('valid');
  expect(run({ H4: NO_TOUCH }).verdict).toBe('forming');
  expect(run({ H4: WIDE_K }).verdict).toBe('invalid');
  expect(run({ H4: STOP_BROKEN }, STOP_AT).verdict).toBe('invalid');
  expect(run({ H4: SHALLOW }).verdict).toBe('invalid');
  expect(run({ H4: ONE_CLOSE }, { ...AT, i: 36 }).verdict).toBe('invalid');
});

frm('Urteil: ist H2 die letzte Kerze, fehlt noch alles nach H2 – im Aufbau, nicht gültig', () => {
  const c = run({ H4: BASE.slice(0, 35) }, AT, { measured: true });
  expect(c.verdict).toBe('forming');
  expect(state(c, '2618-01')).toBe(M);
  for (const n of [2, 3, 4, 5, 6, 9, 10]) expect(state(c, idOf(n)), idOf(n)).toBe(U);
});

frm('Spiegelfall: Doppelboden mit Kauf hat dieselben Zustände wie das Doppeltop mit Verkauf', () => {
  for (const [name, rows, at] of [
    ['Basis', BASE, AT],
    ['ohne Berührung', NO_TOUCH, AT],
    ['volumenstark', WIDE_K, AT],
    ['Stop-Zone', STOP_BROKEN, STOP_AT],
    ['I über N', ABOVE_N, AT],
  ] as const) {
    const top = run({ H4: rows }, at);
    const bottom = run({ H4: mirror(rows) }, at, { top: false });
    expect(bottom.side, name).toBe('buy');
    expect(top.side, name).toBe('sell');
    expect(bottom.checks.map((x) => [x.id, x.state]), name).toEqual(top.checks.map((x) => [x.id, x.state]));
    expect(bottom.verdict, name).toBe(top.verdict);
  }
});

frm('Messung ohne eigene Punkte findet H2 und I selbst', () => {
  const c = run({ H4: BASE }, AT, { measured: true });
  expect(c.points.H2.time).toBe(34 * H4);
  expect(c.points.I.time).toBe(42 * H4);
  expect(state(c, '2618-05')).toBe(M);
  expect(c.verdict).toBe('valid');
});

frm('Abdeckung: jede Bedingung hat einen ☑- und einen ☐-Fall (messbar) und einen Fall „nicht messbar“ wo möglich', () => {
  const seen: Record<string, Set<CheckState>> = {};
  const all = [
    run({ H4: BASE }),
    run({ H4: SHALLOW }),
    run({ H4: ABOVE_N }),
    run({ H4: OPEN_I }),
    run({ H4: NO_TOUCH }),
    run({ H4: ONE_CLOSE }, { ...AT, i: 36 }),
    run({ D1: BASE }, AT, { tf: 'D1' }),
    run({ H4: STOP_BROKEN }, STOP_AT),
    run({ H4: WIDE_K }),
    run({ D1: D1_BIG, H4: BASE }),
  ];
  for (const cand of all) for (const k of cand.checks) (seen[k.id] ??= new Set()).add(k.state);
  for (const id of F2618_CHECK_IDS) {
    expect(seen[id]?.has(M), `${id} ☑`).toBe(true);
    expect(seen[id]?.has(N), `${id} ☐`).toBe(true);
  }
  expect(seen['2618-10'].has(U)).toBe(true);
});

frm('Kein Blick in die Zukunft: Kerzen nach t ändern nichts', () => {
  const t = (50 + 1) * H4;
  const full = run({ H4: BASE }, AT, { t });
  const cut = run({ H4: BASE.slice(0, 51) }, AT, { t });
  expect(full.checks.map((x) => [x.id, x.state])).toEqual(cut.checks.map((x) => [x.id, x.state]));
  expect(full.verdict).toBe(cut.verdict);
  expect(state(run({ H4: BASE }, AT, { t: 50 * H4 }), '2618-05')).toBe(N);
});

frm('Zeichnungen: Fib, Einstiegszone, Ziele, Stop-Label und Pfeil kommen auch bei ☐', () => {
  for (const rows of [BASE, NO_TOUCH]) {
    const c = run({ H4: rows });
    const ids = c.drawings.map((d) => d.id);
    expect(ids).toEqual(['Z-2618-01', 'Z-2618-02', 'Z-2618-03', 'Z-2618-03b', 'Z-2618-04', 'Z-2618-05']);
    const fib = c.drawings.find((d) => d.id === 'Z-2618-01')!;
    expect(fib.tool).toBe('fib');
    expect(fib.levels).toEqual([0.5, 0.618, -0.272]);
    expect(fib.anchors.map((a) => a.price)).toEqual([BASE[34][1], BASE[42][2]]);
    const zone = c.drawings.find((d) => d.id === 'Z-2618-02')!;
    expect(zone.anchors[0].price).toBeCloseTo(113.925, 2);
    expect(zone.anchors[1].price).toBeCloseTo(117.68, 2);
  }
});

frm('Analyse findet das Paar und I selbst und liefert alle Bedingungen', () => {
  const res = analyze2618(ctxOf({ H4: BASE }), END);
  expect(res.map((r) => r.tf)).toEqual(['H4']);
  const c = res[0].candidate;
  expect(c.checks.map((x) => x.id)).toEqual([...F2618_CHECK_IDS]);
  expect(c.verdict).toBe('valid');
  expect(c.points.H1.time).toBe(18 * H4);
});

// ---- Echte Kerzenreihen ----------------------------------------------------------------------------------------

interface Real {
  file: string;
  /** Prüfzeitpunkt t (MT5-Sekunden) */
  t: number;
  side: 'sell' | 'buy';
  verdict: Candidate['verdict'];
  expect: Record<string, CheckState>;
}

const loadReal = (file: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')));

const ALL = { '01': M, '02': M, '03': M, '04': M, '05': M, '06': M, '08': M, '09': N, '10': N } as const;
const REAL: Real[] = [
  // Verkauf nach Doppeltop; Fib-Beginn = H2
  { file: 'f2618-sell-h4-01', t: 1759737600, side: 'sell', verdict: 'valid', expect: { ...ALL, '07': N } },
  // Verkauf; Fib-Beginn ist ein Hoch knapp unter H2 (E-8), zweiter Verkauf am selben Doppeltop
  { file: 'f2618-sell-h4-02', t: 1761811200, side: 'sell', verdict: 'valid', expect: { ...ALL, '07': N } },
  // Verkauf; Berührung nach 3 Tagen; 0.618 nahe einem Level einer größeren Bewegung
  { file: 'f2618-sell-h4-03', t: 1760385600, side: 'sell', verdict: 'valid', expect: { ...ALL, '07': M } },
  // Kauf nach Doppelboden (Spiegelfall)
  { file: 'f2618-buy-h4-01', t: 1762747200, side: 'buy', verdict: 'valid', expect: { ...ALL, '07': M } },
  // Negativfall: volumenstarke Kerze gegen den Verkauf an der Berührung
  { file: 'f2618-vol-h4-01', t: 1764374400, side: 'sell', verdict: 'invalid', expect: { ...ALL, '10': M } },
  // im Aufbau: 0.618 noch nicht erreicht (Korrekturtiefe 0.46)
  { file: 'f2618-open-h4-01', t: 1761177600, side: 'sell', verdict: 'forming', expect: { '01': M, '02': M, '03': M, '04': M, '05': N, '10': U } },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file}`, () => {
    const fx = loadReal(r.file);
    const c = analyze2618(new FormationContext(fx.symbol, { H4: fx.bars }), r.t)[0].candidate;
    expect(c.side).toBe(r.side);
    expect(c.verdict).toBe(r.verdict);
    for (const [n, want] of Object.entries(r.expect)) expect(state(c, `2618-${n}`), idOf(Number(n))).toBe(want);
    // Kein Blick in die Zukunft: ohne die späteren Kerzen derselbe Befund
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const cut = analyze2618(new FormationContext(fx.symbol, { H4: known }), r.t)[0].candidate;
    expect(cut.checks.map((x) => [x.id, x.state])).toEqual(c.checks.map((x) => [x.id, x.state]));
    expect(cut.verdict).toBe(c.verdict);
  });
}
