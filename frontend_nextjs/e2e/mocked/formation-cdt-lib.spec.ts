/**
 * Doppeltop / Doppelboden (CDT): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `zig(punkte, 8, 3)` setzt die Wendepunkte
 * auf Index 2, 10, 18, 26, 34 (8 Kerzen je Zug). Doppeltop: H1 = Hoch, N = Tief danach, H2 = Anlauf an die Zone von H1.
 * Die Zone eines Hochs ist dünn (FRZ-13) und wird auf die halbe Spanne der rechten Nachbarkerze erweitert: bei H1 130 reicht sie
 * von 130 − 0,5 × 2,25 = 128,875 bis 130.
 * FRM-06 Formationserkennung: Doppeltop / Doppelboden
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeCdt, CDT_CHECK_IDS, checkCdtCandidate } from '../../src/lib/formation/cdtChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H4, M15, barsOf, mirror, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-06' }, fn);

const STEP = { D1, H4, M15 } as const;
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
  h2?: number;
}
/** Prüft H1, N (und H2) eines Doppeltops; `top = false` für den gespiegelten Doppelboden */
function run(input: Partial<Record<Tf, Row[]>>, at: At, options: { top?: boolean; tf?: Tf; t?: number } = {}): Candidate {
  const tf = options.tf ?? 'H4';
  const rows = input[tf]!;
  const top = options.top ?? true;
  const step = STEP[tf];
  return checkCdtCandidate(ctxOf(input), options.t ?? END, {
    tf: tf as ContextTimeframe,
    h1: wick(rows, at.h1, top, step),
    n: wick(rows, at.n, !top, step),
    ...(at.h2 === undefined ? {} : { h2: wick(rows, at.h2, top, step) }),
  });
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

/** Rows `first`..`last` laufen im Wechsel um +a und −a/2 und enden beim Schluss der alten Zeile `last` (RSI(7) bleibt unter 80) */
function chop(rows: Row[], first: number, last: number): Row[] {
  const out = rows.map((r) => [...r] as Row);
  const from = rows[first - 1][3];
  const to = rows[last][3];
  const n = last - first + 1;
  const ups = Math.ceil(n / 2);
  const a = (to - from) / (ups - (n - ups) / 2);
  let prev = from;
  for (let k = first; k <= last; k++) {
    const close = k === last ? to : prev + ((k - first) % 2 === 0 ? a : -a / 2);
    out[k] = plain(prev, close);
    prev = close;
  }
  return out;
}

// ---- Reihen ----------------------------------------------------------------------------------------------------

/** Vorlauf-Hoch 120, Tief 100, H1 130 (Zone 128,875 bis 130), N 112 (Tiefe 0,6), H2 129,85 berührt die Zone */
const BASE = zig([120, 100, 130, 112, 129.85], 8, 3);
const AT: At = { h1: 18, n: 26, h2: 34 };
/** Tiefe nur 0,267: N 122 */
const SHALLOW = zig([120, 100, 130, 122, 129.85], 8, 3);
/** Das vorige Hoch 140 liegt über H1: H1 schließt nie darüber */
const INSIDE_PREV = zig([140, 100, 130, 112, 129.85], 8, 3);
/** H2 128,5 bleibt 0,375 unter der Zone */
const FAR = zig([120, 100, 130, 112, 128.5], 8, 3);
/** Langsamer Fall zu N (24 Kerzen), schneller Anlauf zu H2 (3 Kerzen): RSI(7) an H2 über 80 */
const FAST_H2 = zig([120, 100, 130, 112, 129.85], [8, 8, 24, 3], 3);
const FAST_AT: At = { h1: 18, n: 42, h2: 45 };
/** H2 134: Schlüsse über H1, doch Ausdehnung 4 von 8,16 (0,272 × 30) und nicht volumenstark: keine Verletzung */
const SMALL_OVER = zig([120, 100, 130, 112, 134], 8, 3);
/** H2 140: Ausdehnung 10 über 8,16: verletzt */
const BIG_OVER = zig([120, 100, 130, 112, 140], 8, 3);
/** Lauter Anlauf zu H1: RSI(7) am Hoch unter 80 */
const CHOP_H1 = chop(BASE, 11, 17);
/** Lauter Anlauf zu H2 */
const CHOP_H2 = chop(BASE, 27, 33);
/** Abwärtstrend: Hoch 150, Tief 120, H1 140, tieferes Tief N 118, H2 139,85 */
const DOWN = zig([150, 120, 140, 118, 139.85], 8, 3);
/** N 104: der Anlauf zu H2 ist steiler als der zu H1 */
const STEEP = zig([120, 100, 130, 104, 129.85], 8, 3);
/** Umkehrkerze nach H2: bärische Kerze schließt unter dem Tief der Vorkerze */
const WITH_ENGULF = [...zig([120, 100, 130, 112, 129.85], 8, 0), [129.6, 129.7, 124, 124.5] as Row];
const CHOP_ENGULF = [...chop(zig([120, 100, 130, 112, 129.85], 8, 0), 11, 17), [129.6, 129.7, 124, 124.5] as Row];
/** Vorherige große Bewegung 100 → 150: ihr Level 0.382 liegt bei 130,9, nahe der Zone von H1 (130) */
const WITH_FIB = zig([100, 150, 115, 130, 120, 129.85], 8, 3);
const FIB_AT: At = { h1: 26, n: 34, h2: 42 };
/** Hochs 130@14, 135@38, 138@62: Wave-Spitze am Hoch 138 unter der am Hoch 135 */
const DIV_BEAR = zig([100, 130, 112, 135, 120, 138], 12);
const DIV_NONE = zig([100, 130, 112, 135, 120, 150], 12);
const DIV_AT: At = { h1: 38, n: 50, h2: 62 };
const D1_UP = zig([10, 40, 28, 38]);
const D1_DOWN = mirror(D1_UP);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  {
    name: 'Form: H1 130, N 112 (Tiefe 0,6), H2 berührt die Zone, Schluss nie über H1',
    candidate: () => run({ H4: BASE }, AT),
    expect: {
      'CDT-01': M, 'CDT-02': M, 'CDT-03': M, 'CDT-04': M, 'CDT-05': M, 'CDT-06': M, 'CDT-11': M, 'CDT-12': M, 'CDT-14': N,
      'CDT-15': N, 'CDT-08': M, 'CDT-13': N, 'CDT-10': N, 'CDT-09': U,
    },
  },
  {
    name: 'H1 nicht an der Dochtspitze',
    candidate: () => checkCdtCandidate(ctxOf({ H4: BASE }), END, {
      tf: 'H4',
      h1: { time: 18 * H4, price: BASE[18][1] - 0.5 },
      n: wick(BASE, 26, false),
    }),
    expect: { 'CDT-01': N },
  },
  {
    name: 'H1 schließt nie über dem vorigen Hoch 140',
    candidate: () => run({ H4: INSIDE_PREV }, AT),
    expect: { 'CDT-02': N },
  },
  {
    name: 'Kein Tief vor H1: das vorige Hoch fehlt, H1-Schluss nicht messbar',
    candidate: () => run({ H4: zig([100, 130, 112, 129.85], 8, 3) }, { h1: 10, n: 18, h2: 26 }),
    expect: { 'CDT-02': U },
  },
  {
    name: 'N ist kein fertiges Fraktal (Kerze im Anlauf zu H2)',
    candidate: () => run({ H4: BASE }, { h1: 18, n: 30, h2: 34 }),
    expect: { 'CDT-03': N },
  },
  {
    name: 'Korrektur nur 0,267: Mindesttiefe 0,382 fehlt',
    candidate: () => run({ H4: SHALLOW }, AT),
    expect: { 'CDT-04': N },
  },
  {
    name: 'H2 bleibt 0,375 unter der Zone: keine Berührung',
    candidate: () => run({ H4: FAR }, AT),
    expect: { 'CDT-05': N },
  },
  {
    name: 'Ohne Kerze nach N gibt es kein H2: Berührung und Trend nicht messbar',
    candidate: () => run({ H4: zig([120, 100, 130, 112], 8, 0) }, { h1: 18, n: 26 }),
    expect: { 'CDT-05': U, 'CDT-06': U, 'CDT-08': U, 'CDT-13': U, 'CDT-14': U },
  },
  {
    name: 'Abwärtstrend beim Anlauf: kein Doppeltop',
    candidate: () => run({ H4: DOWN }, AT),
    expect: { 'CDT-06': N },
  },
  {
    name: 'Höhere Zeiteinheit fällt, Formations-ZE steigt: bestes Setup',
    candidate: () => run({ D1: D1_DOWN, H4: BASE }, AT),
    expect: { 'CDT-07': M },
  },
  {
    name: 'Höhere Zeiteinheit steigt wie die Formation',
    candidate: () => run({ D1: D1_UP, H4: BASE }, AT),
    expect: { 'CDT-07': N },
  },
  {
    name: 'Ohne höhere Zeiteinheit ist der Trend dort nicht messbar',
    candidate: () => run({ H4: BASE }, AT),
    expect: { 'CDT-07': U },
  },
  {
    name: 'Anlauf zu H2 schwächer (Spanne 0,61 × der zu H1)',
    candidate: () => run({ H4: BASE }, AT),
    expect: { 'CDT-08': M },
  },
  {
    name: 'Anlauf zu H2 steiler (Spanne 1,09 × der zu H1)',
    candidate: () => run({ H4: STEEP }, AT),
    expect: { 'CDT-08': N },
  },
  {
    name: 'Wave-Divergenz zwischen H1 und H2',
    candidate: () => run({ H4: DIV_BEAR }, DIV_AT),
    expect: { 'CDT-09': M, 'CDT-05': M },
  },
  {
    name: 'H2 höher mit stärkerer Wave: keine Divergenz',
    candidate: () => run({ H4: DIV_NONE }, DIV_AT),
    expect: { 'CDT-09': N },
  },
  {
    name: 'Fibonacci-Level nahe der Zone von H1',
    candidate: () => run({ H4: WITH_FIB }, FIB_AT),
    expect: { 'CDT-10': M },
  },
  {
    name: 'Formations-ZE M15 gehört nicht zu H1, H4, D1',
    candidate: () => run({ M15: BASE }, AT, { tf: 'M15' }),
    expect: { 'CDT-11': N },
  },
  {
    name: 'RSI(7) an H1 unter 80',
    candidate: () => run({ H4: CHOP_H1 }, AT),
    expect: { 'CDT-12': N },
  },
  {
    name: 'Ohne RSI-Extrem zählt der Engulf nach H2',
    candidate: () => run({ H4: CHOP_ENGULF }, { h1: 18, n: 26, h2: 34 }),
    expect: { 'CDT-12': N, 'CDT-13': M },
  },
  {
    name: 'Engulf nach H2 auch bei RSI-Extrem erkannt',
    candidate: () => run({ H4: WITH_ENGULF }, { h1: 18, n: 26, h2: 34 }),
    expect: { 'CDT-12': M, 'CDT-13': M },
  },
  {
    name: 'RSI(7) an H2 über 80 nach schnellem Anlauf',
    candidate: () => run({ H4: FAST_H2 }, FAST_AT),
    expect: { 'CDT-14': M },
  },
  {
    name: 'RSI(7) an H2 unter 80',
    candidate: () => run({ H4: CHOP_H2 }, AT),
    expect: { 'CDT-14': N },
  },
  {
    name: 'Kleiner Schluss über H1 ohne Ausdehnung 0,272 verletzt nicht',
    candidate: () => run({ H4: SMALL_OVER }, AT),
    expect: { 'CDT-15': N },
  },
  {
    name: 'Schluss über H1 mit Ausdehnung über 0,272 verletzt',
    candidate: () => run({ H4: BIG_OVER }, AT),
    expect: { 'CDT-15': M },
  },
  {
    name: 'Trendbereich: H1 und H2 fertige Fraktale, N eine eigene Welle',
    candidate: () => run({ H4: BASE }, AT),
    expect: { 'CDT-16': M },
  },
  {
    name: 'H2 noch kein fertiges Fraktal: Trendbereich nicht zeichenbar',
    candidate: () => run({ H4: zig([120, 100, 130, 112, 129.85], 8, 0) }, AT),
    expect: { 'CDT-16': N },
  },
];

test.describe('CDT: Bedingungen', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const candidate = c.candidate();
      const got = Object.fromEntries(Object.keys(c.expect).map((id) => [id, state(candidate, id)]));
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('CDT: Abdeckung und Eigenschaften', () => {
  frm('jede messbare Bedingung hat einen Fall mit ☑ und einen mit ☐', () => {
    const missing: string[] = [];
    for (const id of CDT_CHECK_IDS) {
      const states = new Set(CASES.map((c) => c.expect[id]).filter((s) => s !== undefined));
      if (!states.has(M)) missing.push(`${id} ☑`);
      if (!states.has(N)) missing.push(`${id} ☐`);
    }
    expect(missing).toEqual([]);
  });

  frm('Doppeltop und gespiegelter Doppelboden haben dieselben Zustände', () => {
    const pairs: [Row[], At][] = [[BASE, AT], [CHOP_H1, AT], [BIG_OVER, AT], [WITH_ENGULF, AT], [DIV_BEAR, DIV_AT]];
    for (const [rows, at] of pairs) {
      const top = run({ H4: rows }, at);
      const bottom = run({ H4: mirror(rows) }, at, { top: false });
      expect(top.side).toBe('sell');
      expect(bottom.side).toBe('buy');
      expect(bottom.checks.map((c) => [c.id, c.state, c.kind])).toEqual(top.checks.map((c) => [c.id, c.state, c.kind]));
      expect(bottom.verdict).toBe(top.verdict);
    }
  });

  frm('Bedingte Art: die Umkehrkerze ist Pflicht ohne RSI-Extrem, sonst Verstärkung', () => {
    expect(find(run({ H4: CHOP_ENGULF }, AT), 'CDT-13').kind).toBe('required');
    expect(find(run({ H4: WITH_ENGULF }, AT), 'CDT-13').kind).toBe('bonus');
  });

  frm('Urteil: gültig, im Aufbau und ungültig', () => {
    expect([
      run({ H4: BASE }, AT).verdict,
      run({ H4: FAR }, AT).verdict,
      run({ H4: CHOP_H1 }, AT).verdict,
      run({ H4: CHOP_ENGULF }, AT).verdict,
      run({ H4: BIG_OVER }, AT).verdict,
      run({ H4: SHALLOW }, AT).verdict,
      run({ H4: DOWN }, AT).verdict,
    ]).toEqual(['valid', 'forming', 'forming', 'valid', 'invalid', 'invalid', 'invalid']);
  });

  frm('Zeichnungen: Zone H1, Rahmen, Zielzone, RSI, Label, Linie an N auch bei ☐', () => {
    const c = run({ H4: BASE }, AT);
    expect(c.drawings.map((d) => d.id)).toEqual(['Z-CDT-01', 'Z-CDT-02', 'Z-CDT-03', 'Z-CDT-04', 'Z-CDT-05', 'Z-CDT-06']);
    const zone = c.drawings.find((d) => d.id === 'Z-CDT-01')!;
    expect(zone.anchors.map((a) => a.price)).toEqual([128.875, 130]);
    expect(find(c, 'CDT-05').drawings).toEqual(['Z-CDT-01', 'Z-CDT-02']);
    expect(c.drawings.find((d) => d.id === 'Z-CDT-06')!.anchors[0].price).toBe(112);
    const noH2 = run({ H4: zig([120, 100, 130, 112], 8, 0) }, { h1: 18, n: 26 });
    expect(noH2.drawings.map((d) => d.id)).not.toContain('Z-CDT-02');
  });

  frm('Automatische Auswahl: Doppeltop und sein Spiegel liefern H1, N, H2 aus den Wendepunkten', () => {
    const pick = (rows: Row[]) => analyzeCdt(ctxOf({ H4: rows }), END).find((a) => a.tf === 'H4')!.candidate;
    const top = pick(BASE);
    expect(top.side).toBe('sell');
    expect(top.points).toEqual({
      H1: { time: 18 * H4, price: 130 },
      N: { time: 26 * H4, price: 112 },
      H2: { time: 34 * H4, price: 129.85 },
    });
    const bottom = pick(mirror(BASE));
    expect(bottom.side).toBe('buy');
    expect(bottom.checks.map((c) => [c.id, c.state])).toEqual(top.checks.map((c) => [c.id, c.state]));
  });

  frm('Ohne zwei Wendepunkte gibt es keine Formation: alles nicht messbar, im Aufbau', () => {
    const c = analyzeCdt(ctxOf({ H4: zig([100], 8, 3) }), END).find((a) => a.tf === 'H4')!.candidate;
    expect(c.checks.every((x) => x.state === U)).toBe(true);
    expect(c.verdict).toBe('forming');
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [37, 40]) {
      const full = analyzeCdt(ctxOf({ H4: BIG_OVER }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeCdt(ctxOf({ H4: BIG_OVER.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Eigene Punkte in falscher Reihenfolge (N vor H1) sind nicht messbar', () => {
    const c = checkCdtCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', h1: wick(BASE, 26, true), n: wick(BASE, 18, false) });
    expect(c.checks.every((x) => x.state === U)).toBe(true);
  });

  frm('Punkte ohne geschlossene Kerze sind nicht messbar', () => {
    const c = checkCdtCandidate(ctxOf({ H4: BASE }), END, { tf: 'H4', h1: { time: 999 * H4, price: 130 }, n: wick(BASE, 26, false) });
    expect(c.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (names: Partial<Record<'H4' | 'D1', string>>, iso: string): Candidate => {
  const input: ContextInput = {};
  for (const [tf, name] of Object.entries(names)) input[tf as 'H4' | 'D1'] = loadFixture(name).bars;
  return analyzeCdt(new FormationContext('TEST', input), at(iso)).find((a) => a.tf === 'H4')!.candidate;
};
const states = (c: Candidate, ids: string[]) => ids.map((id) => state(c, id));

test.describe('CDT: echte Kerzen', () => {
  frm('cdt-top-h4-01: Doppeltop mit Umkehrkerze statt RSI-Extrem ist gültig', () => {
    const c = analyzeAt({ H4: 'cdt-top-h4-01' }, '2025-10-28T04:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['CDT-01', 'CDT-02', 'CDT-03', 'CDT-04', 'CDT-05', 'CDT-06', 'CDT-12', 'CDT-13', 'CDT-15'])).toEqual([M, M, M, M, M, M, N, M, N]);
    expect(find(c, 'CDT-13').kind).toBe('required');
    expect(c.verdict).toBe('valid');
  });

  frm('cdt-top-h4-02: Doppeltop mit zweitem Hoch knapp unter dem ersten, ohne RSI-Extrem und ohne Engulf, bleibt im Aufbau', () => {
    const c = analyzeAt({ H4: 'cdt-top-h4-02' }, '2025-11-10T16:00');
    expect(c.side).toBe('sell');
    expect(states(c, ['CDT-01', 'CDT-02', 'CDT-03', 'CDT-04', 'CDT-05', 'CDT-06', 'CDT-15'])).toEqual([M, M, M, M, M, M, N]);
    expect(c.points.H2.price).toBeLessThan(c.points.H1.price);
    expect(states(c, ['CDT-12', 'CDT-13'])).toEqual([N, N]);
    expect(c.verdict).toBe('forming');
  });

  frm('cdt-flat-h4-01: Negativ – H2 erreicht die Zone nicht, die Formation bleibt im Aufbau', () => {
    const c = analyzeAt({ H4: 'cdt-flat-h4-01' }, '2025-10-28T00:00');
    expect(states(c, ['CDT-05', 'CDT-15'])).toEqual([N, N]);
    expect(c.verdict).toBe('forming');
  });

  frm('cdt-bottom-h4-01: Negativ – Doppelboden mit RSI-Extrem, doch ein Schluss unter H1 schließt ihn aus', () => {
    const c = analyzeAt({ H4: 'cdt-bottom-h4-01' }, '2025-10-13T12:00');
    expect(c.side).toBe('buy');
    expect(states(c, ['CDT-05', 'CDT-12', 'CDT-15'])).toEqual([M, M, M]);
    expect(c.verdict).toBe('invalid');
  });

  frm('cdt-top-h4-02: Negativ – eine Kerze später ist die Korrektur nur 0,26 tief (Mindesttiefe fehlt)', () => {
    const c = analyzeAt({ H4: 'cdt-top-h4-02' }, '2025-11-11T08:00');
    expect(state(c, 'CDT-04')).toBe(N);
    expect(find(c, 'CDT-04').value!).toBeLessThan(0.382);
    expect(c.verdict).toBe('invalid');
  });

  frm('cdt-top-h4-01: kein Blick in die Zukunft – früher fehlt die Tiefe von 0,382 noch', () => {
    const early = analyzeAt({ H4: 'cdt-top-h4-01' }, '2025-10-27T12:00');
    const late = analyzeAt({ H4: 'cdt-top-h4-01' }, '2025-10-28T04:00');
    expect(state(early, 'CDT-04')).toBe(N);
    expect(state(late, 'CDT-04')).toBe(M);
  });
});
