/**
 * Kopf-Schulter (OBO/TOBO): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). `zig(punkte, LEGS, 3)` setzt die Wendepunkte
 * auf Index 2 + Summe der Zuglängen davor; 40 ruhige Kerzen davor (LEAD) liefern die Wave (SMA 35).
 * Basis (Verkauf): LS 135 (Index 54), N1 120 (58), K 150 (62), N2 121 (66), RS 136 (70), danach Fall auf 110.
 * Rechnung: Nackenlinie durch N1 (120) und N2 (121) steigt 1 je 8 Kerzen; NL(Index 73) = 121,875. Die Kerze 72 schließt bei 123 (darüber),
 * die Kerze 73 bei 116,5 (darunter): Bruch auf Index 73. Verhältnis der Schultern = (136 − 121) / (135 − 120) = 1. Kopfhöhe h = 150 − 120,5 = 29,5,
 * Ziel = 121,875 − 29,5 = 92,375. Kerzen N2 → Bruch: 7; Kopf → N2: 4; 1,5 × 4 = 6 ≤ 7, also ist die rechte Schulter konsolidiert.
 * FRM-10 Formationserkennung: Kopf-Schulter
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { checkCdtCandidate } from '../../src/lib/formation/cdtChecks';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeLib } from '../../src/lib/formation/libChecks';
import { analyzeObo, checkOboCandidate, OBO_CHECK_IDS } from '../../src/lib/formation/oboChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, H1, H4, M15, barsOf, mirror, patched, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-10' }, fn);

const STEP = { D1, H4, H1, M15 } as const;
type Tf = keyof typeof STEP;

interface Options {
  tf?: Tf;
  /** Prüfzeitpunkt; Standard: weit nach der Reihe */
  t?: number;
  /** ohne rechte Schulter prüfen */
  noRs?: boolean;
  /** Preis eines Punkts ändern (Dochtspitze verfehlt) */
  shift?: Partial<Record<'ls' | 'n1' | 'k' | 'n2' | 'rs', number>>;
}

/** Prüft LS, N1, K, N2 und RS an den Kerzen `idx`; Hoch- oder Tiefspitze je nach Seite der Reihe */
function run(rows: Row[], idx: number[], o: Options = {}): Candidate {
  const tf = o.tf ?? 'H4';
  const step = STEP[tf];
  const bars = barsOf(rows, step);
  const input: ContextInput = { [tf]: bars };
  const [ls, n1, k, n2, rs] = idx;
  const top = bars[k].high > bars[n1].high;
  const at = (i: number, high: boolean, name: 'ls' | 'n1' | 'k' | 'n2' | 'rs'): Anchor => ({
    time: bars[i].time,
    price: (high ? bars[i].high : bars[i].low) + (o.shift?.[name] ?? 0),
  });
  return checkOboCandidate(new FormationContext('TEST', input), o.t ?? 1e9, {
    tf: tf as ContextTimeframe,
    ls: at(ls, top, 'ls'),
    n1: at(n1, !top, 'n1'),
    k: at(k, top, 'k'),
    n2: at(n2, !top, 'n2'),
    ...(o.noRs ? {} : { rs: at(rs, top, 'rs') }),
  });
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;
const idOf = (n: number) => `OBO-${String(n).padStart(2, '0')}`;

// ---- Reihen ----------------------------------------------------------------------------------------------------

const LEAD: Row[] = Array.from({ length: 40 }, () => plain(100, 100));
const LEAD_HIGH: Row[] = Array.from({ length: 40 }, () => plain(180, 180));
const I = [54, 58, 62, 66, 70];
/** Kerze `at` wird zur breiten Kerze mit Docht bis `low` und Schluss `close` (volumenstark: Spanne über 1,5 × Mittel) */
const wide = (rows: Row[], at: number, low: number, close: number): Row[] => patched(rows, at, [rows[at][0], rows[at][0] + 0.1, low, close]);
const series = (points: number[], legs: number | number[] = 4, lead: Row[] = LEAD): Row[] => [...lead, ...zig(points, legs, 3)];

const BASE = wide(series([100, 120, 108, 135, 120, 150, 121, 136, 110]), 73, 108, 116.5);
/** Bruchkerze ohne große Spanne: Spanne 6,8 < 1,5 × Mittel */
const NARROW = series([100, 120, 108, 135, 120, 150, 121, 136, 110]);
/** Vor dem Kopf fällt der Preis: Abwärtstrend, LS 160 < K 165 */
const DOWNTREND = series([180, 150, 170, 140, 160, 145, 165, 146, 160, 130], 4, LEAD_HIGH);
const DOWNTREND_AT = [58, 62, 66, 70, 74];
/** LS 150 liegt über K 135 */
const HEAD_LOW = series([100, 120, 108, 150, 120, 135, 121, 130, 110]);
/** RS 155 liegt über K 150 */
const RS_HIGH = series([100, 120, 108, 135, 120, 150, 121, 155, 110]);
/** N2 105 liegt weit unter N1 120: zwei Schlüsse unter der Zone von N1 vor N2 (Trend schon gedreht: Libra) */
const FALLEN = series([100, 120, 108, 135, 120, 150, 105, 136, 110]);
/** RS 130: Verhältnis 0,6; Bruch auf Index 72 (Schluss 120 unter NL 121,75) */
const SMALL_RS = wide(series([100, 120, 108, 135, 120, 150, 121, 130, 110]), 72, 108, 120);
/** Kopf → N2 in 6 Kerzen: Index N2 68, RS 72, Bruch 75 (3 + 4 = 7 Kerzen < 9) */
const SLOW_LEGS = [4, 4, 4, 4, 4, 6, 4, 4];
const SLOW = wide(series([100, 120, 108, 135, 120, 150, 121, 136, 110], SLOW_LEGS), 75, 108, 116.5);
const SLOW_AT = [54, 58, 62, 68, 72];
/** RS 130 und langsamer Fall: Verhältnis 0,6 und keine Konsolidierung */
const SMALL_SLOW = wide(series([100, 120, 108, 135, 120, 150, 121, 130, 110], SLOW_LEGS), 74, 108, 120);
/** Kein Bruch: die Reihe endet bei 128 über der Nackenlinie */
const NO_BREAK = series([100, 120, 108, 135, 120, 150, 121, 136, 128]);
/** Nach dem Bruch läuft der Preis auf 110, zurück auf 118 und weiter auf 95: AB=CD ab RS (136 → 110 → 118) ergibt D = 92 ≈ Ziel 92,375 */
const AB_CD = wide(series([100, 120, 108, 135, 120, 150, 121, 136, 110, 118, 95]), 73, 108, 116.5);
/** Rücklauf auf 125: D = 99 liegt 6,6 vom Ziel (ATR rund 7: Nähe 3,5) */
const AB_CD_FAR = wide(series([100, 120, 108, 135, 120, 150, 121, 136, 110, 125, 95]), 73, 108, 116.5);
/** Nach dem Bruch schließt eine Kerze über 136 (RS): Zug verletzt */
const OVER_RS = wide(series([100, 120, 108, 135, 120, 150, 121, 136, 124, 140]), 73, 108, 116.5);
/** Divergenz: LS in 14 Kerzen erreicht (Wave-Spitze an LS), K nach 20 Kerzen nur knapp darüber */
const DIVERGENT = series([100, 120, 108, 140, 134, 142, 128, 138, 110], [4, 4, 14, 4, 20, 4, 4, 4]);
const DIVERGENT_AT = [64, 68, 88, 92, 96];
/** LS 140 in 4 Kerzen, K 143 nach 14 Kerzen: Wave an K stärker, keine Divergenz */
const NO_DIVERGENCE = series([100, 130, 112, 140, 128, 143, 125, 138, 110], [4, 4, 4, 4, 14, 4, 4, 4]);
const NO_DIVERGENCE_AT = [54, 58, 72, 76, 80];
/** Doppeltop statt Kopf: K = LS = 135 */
const DOUBLE_TOP = series([100, 120, 108, 135, 120, 135, 121, 130, 110]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  {
    name: 'Basis: Aufwärtstrend, LS, K, RS als Fraktale, Nackenbruch mit breiter Kerze, rechte Schulter konsolidiert',
    candidate: () => run(BASE, I),
    expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': M, '07': M, '08': N, '09': M, '10': N, '11': M, '12': M, '13': N, '14': N },
  },
  { name: 'Regel 01 ☐: vor dem Kopf fällt der Preis', candidate: () => run(DOWNTREND, DOWNTREND_AT), expect: { '01': N, '02': M, '03': M, '04': M } },
  { name: 'Regel 02 ☐: der Preis von N2 ist nicht die Dochtspitze eines Fraktals', candidate: () => run(BASE, I, { shift: { n2: 0.5 } }), expect: { '02': N } },
  { name: 'Regel 02 nicht messbar: die rechte Schulter fehlt', candidate: () => run(BASE, I, { noRs: true }), expect: { '02': U } },
  { name: 'Regel 03 ☐: der Kopf liegt unter LS', candidate: () => run(HEAD_LOW, I), expect: { '03': N } },
  { name: 'Regel 04 ☐: RS liegt über dem Kopf', candidate: () => run(RS_HIGH, I), expect: { '04': N, '03': M } },
  { name: 'Regel 04 nicht messbar: die rechte Schulter fehlt', candidate: () => run(BASE, I, { noRs: true }), expect: { '04': U } },
  { name: 'Regel 05 ☐: zwei Schlüsse unter der Zone von N1 vor N2, der Trend hat schon gedreht', candidate: () => run(FALLEN, I), expect: { '05': N, '01': M, '02': M } },
  { name: 'Regel 06 ☐: Schultern 0,6 groß und nicht konsolidiert', candidate: () => run(SMALL_SLOW, SLOW_AT), expect: { '06': N, '07': N } },
  { name: 'Regel 06 ☑: Schultern gleich groß, auch ohne Konsolidierung', candidate: () => run(SLOW, SLOW_AT), expect: { '06': M, '07': N } },
  { name: 'Regel 06 ☑ (Ausnahme): Schultern 0,6 groß, aber die rechte Schulter ist konsolidiert', candidate: () => run(SMALL_RS, I), expect: { '06': M, '07': M } },
  { name: 'Regel 07 nicht messbar: kein Bruch', candidate: () => run(NO_BREAK, I), expect: { '07': U } },
  { name: 'Regel 08 ☑: Preis-Hoch K über LS, Wave-Hoch K unter LS', candidate: () => run(DIVERGENT, DIVERGENT_AT), expect: { '08': M } },
  { name: 'Regel 08 ☐: Wave an K stärker als an LS', candidate: () => run(NO_DIVERGENCE, NO_DIVERGENCE_AT), expect: { '08': N } },
  { name: 'Regel 09 ☐: Zeiteinheit H1', candidate: () => run(BASE, I, { tf: 'H1' }), expect: { '09': N, '14': N } },
  { name: 'Regel 09 ☑: Zeiteinheit D1', candidate: () => run(BASE, I, { tf: 'D1' }), expect: { '09': M } },
  { name: 'Regel 10 ☑: das Kopfhöhen-Ziel fällt mit dem D eines AB=CD ab RS zusammen', candidate: () => run(AB_CD, I), expect: { '10': M, '11': M } },
  { name: 'Regel 10 ☐: das D des AB=CD liegt weiter als 0,5 × ATR vom Ziel', candidate: () => run(AB_CD_FAR, I), expect: { '10': N } },
  { name: 'Regel 10 nicht messbar: kein Bruch, kein Ziel', candidate: () => run(NO_BREAK, I), expect: { '10': U } },
  { name: 'Regel 11 ☑: Körperschluss unter der Nackenlinie', candidate: () => run(BASE, I), expect: { '11': M } },
  { name: 'Regel 11 ☐: kein Schluss unter der Nackenlinie', candidate: () => run(NO_BREAK, I), expect: { '11': N, '12': N } },
  { name: 'Regel 12 ☑: die Bruchkerze ist volumenstark', candidate: () => run(BASE, I), expect: { '12': M } },
  { name: 'Regel 12 ☐: die Bruchkerze ist klein', candidate: () => run(NARROW, I), expect: { '11': M, '12': N } },
  { name: 'Regel 13 ☑: Schluss über dem Hoch von RS', candidate: () => run(OVER_RS, I), expect: { '13': M, '11': M } },
  { name: 'Regel 13 ☐: kein Schluss über RS', candidate: () => run(BASE, I), expect: { '13': N } },
  {
    name: 'Regel 14 ☑: Zeiteinheit M15',
    candidate: () => run(BASE, I, { tf: 'M15' }),
    expect: { '14': M, '09': N },
  },
  { name: 'Regel 14 ☐: Zeiteinheit H4', candidate: () => run(BASE, I), expect: { '14': N } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = c.candidate();
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, `OBO-${n}`), idOf(Number(n))).toBe(want);
  });
}

frm('Abdeckung: jede Bedingung hat einen ☑- und einen ☐-Fall', () => {
  const seen = new Map<string, Set<CheckState>>();
  for (const c of CASES) for (const [n, want] of Object.entries(c.expect)) seen.set(`OBO-${n}`, (seen.get(`OBO-${n}`) ?? new Set()).add(want));
  expect(OBO_CHECK_IDS).toHaveLength(14);
  for (const id of OBO_CHECK_IDS) {
    expect(seen.get(id)?.has(M), `${id} ☑`).toBe(true);
    expect(seen.get(id)?.has(N), `${id} ☐`).toBe(true);
  }
});

frm('Werte: Verhältnis der Schultern (Regel 06) aus der Handrechnung', () => {
  expect(find(run(BASE, I), 'OBO-06').value).toBeCloseTo(1, 5);
  expect(find(run(SMALL_RS, I), 'OBO-06').value).toBeCloseTo(0.6, 5);
});

frm('Urteil: gültig, im Aufbau ohne rechte Schulter oder ohne Bruch, ungültig bei Ausschluss und fehlender Pflicht', () => {
  expect(run(BASE, I).verdict).toBe('valid');
  expect(run(BASE, I, { noRs: true }).verdict).toBe('forming');
  expect(run(NO_BREAK, I).verdict).toBe('forming');
  expect(run(OVER_RS, I).verdict).toBe('invalid');
  expect(run(BASE, I, { tf: 'M15' }).verdict).toBe('invalid');
  expect(run(NARROW, I).verdict).toBe('invalid');
  expect(run(HEAD_LOW, I).verdict).toBe('invalid');
  expect(run(RS_HIGH, I).verdict).toBe('invalid');
  expect(run(FALLEN, I).verdict).toBe('invalid');
  expect(run(DOWNTREND, DOWNTREND_AT).verdict).toBe('invalid');
});

frm('Spiegelfall: TOBO nach Tiefs hat dieselben Zustände wie OBO nach Hochs, nur die Seite wechselt', () => {
  for (const [name, rows, idx] of [
    ['Basis', BASE, I],
    ['kein Bruch', NO_BREAK, I],
    ['Schultern klein', SMALL_RS, I],
    ['Libra-Fall', FALLEN, I],
    ['Divergenz', DIVERGENT, DIVERGENT_AT],
    ['Rücklauf-AB=CD', AB_CD, I],
    ['Schluss über RS', OVER_RS, I],
  ] as const) {
    const sell = run(rows, [...idx]);
    const buy = run(mirror(rows as Row[]), [...idx]);
    expect(sell.side, name).toBe('sell');
    expect(buy.side, name).toBe('buy');
    expect(buy.checks.map((c) => `${c.id}:${c.state}`), name).toEqual(sell.checks.map((c) => `${c.id}:${c.state}`));
    expect(buy.verdict, name).toBe(sell.verdict);
  }
});

frm('Rechte Schulter ohne zwei Kerzen rechts ist noch kein Fraktal: nicht messbar und im Aufbau', () => {
  const c = run(BASE.slice(0, 72), I);
  expect(state(c, 'OBO-02')).toBe(U);
  expect(c.verdict).toBe('forming');
});

frm('Regel 06 nicht messbar: Verhältnis ☐ und noch kein Bruch', () => {
  expect(state(run(SMALL_RS.slice(0, 72), I), 'OBO-06')).toBe(U);
});

frm('Zeitpunkt: die Prüfung bis zur Kerze vor dem Bruch ist im Aufbau und bleibt gleich, wenn spätere Kerzen anders aussehen', () => {
  const t = (idx: number) => (idx + 1) * H4;
  const early = run(BASE, I, { t: t(72) });
  expect(early.verdict).toBe('forming');
  expect(state(early, 'OBO-11')).toBe(N);
  const wild = BASE.map((r, i): Row => (i > 72 ? [r[0] + 40, r[1] + 41, r[2] + 39, r[3] + 40] : r));
  expect(JSON.stringify(run(wild, I, { t: t(72) }))).toBe(JSON.stringify(early));
  expect(JSON.stringify(run(BASE.slice(0, 73), I, { t: 1e9 }))).toBe(JSON.stringify(early));
  const late = run(BASE, I, { t: t(73) });
  expect(late.verdict).toBe('valid');
});

frm('Abgrenzung Doppeltop: gleich hohe Spitzen sind kein Kopf (Regel 03 ☐), die Messung als Doppeltop gelingt', () => {
  const obo = run(DOUBLE_TOP, I);
  expect(state(obo, 'OBO-03')).toBe(N);
  expect(obo.verdict).toBe('invalid');
  const bars = barsOf(DOUBLE_TOP, H4);
  const cdt = checkCdtCandidate(new FormationContext('TEST', { H4: bars }), 1e9, {
    tf: 'H4',
    h1: { time: bars[54].time, price: bars[54].high },
    n: { time: bars[58].time, price: bars[58].low },
    h2: { time: bars[62].time, price: bars[62].high },
  });
  expect(find(cdt, 'CDT-05').state).toBe(M);
});

frm('Abgrenzung Libra: fällt der Preis vor dem Nackenbruch unter N1, ist es eine Libra (Regel 05 ☐), nicht Kopf-Schulter', () => {
  expect(state(run(FALLEN, I), 'OBO-05')).toBe(N);
  expect(run(FALLEN, I).verdict).toBe('invalid');
  const lib = analyzeLib(new FormationContext('TEST', { H4: barsOf(FALLEN, H4) }), 1e9)[0].candidate;
  expect(lib.verdict).toBe('valid');
  // die gültige Kopf-Schulter-Formation ist keine Libra
  const baseLib = analyzeLib(new FormationContext('TEST', { H4: barsOf(BASE, H4) }), 1e9)[0].candidate;
  expect(baseLib.verdict).not.toBe('valid');
});

frm('Zeichnungen: Nackenlinie, Bögen, Ziel und Stop mit Ankern; Ziel und Maß erst nach dem Bruch', () => {
  const full = run(BASE, I);
  const ids = full.drawings.map((d) => d.id);
  expect(ids).toEqual(['Z-OBO-01', 'Z-OBO-02', 'Z-OBO-03', 'Z-OBO-06', 'Z-OBO-04', 'Z-OBO-05', 'Z-OBO-07', 'Z-OBO-08']);
  const byId = (id: string) => full.drawings.find((d) => d.id === id)!;
  expect(byId('Z-OBO-01').anchors).toHaveLength(3);
  expect(byId('Z-OBO-02').anchors).toHaveLength(3);
  expect(byId('Z-OBO-05').anchors[0].price).toBeCloseTo(92.375, 2);
  expect(byId('Z-OBO-06').anchors[0].price).toBe(barsOf(BASE, H4)[70].high);
  for (const c of full.checks) for (const d of c.drawings) expect(ids).toContain(d);
  const forming = run(NO_BREAK, I).drawings.map((d) => d.id);
  expect(forming).toEqual(['Z-OBO-01', 'Z-OBO-02', 'Z-OBO-03', 'Z-OBO-06']);
});

frm('analyzeObo: sucht die Punkte selbst; Verkauf nach Hochs, Kauf nach Tiefs; der Kontext mit mehreren Zeiteinheiten bleibt je Zeiteinheit getrennt', () => {
  const sell = analyzeObo(new FormationContext('TEST', { H4: barsOf(BASE, H4) }), 1e9);
  expect(sell).toHaveLength(1);
  expect(sell[0].tf).toBe('H4');
  const c = sell[0].candidate;
  expect(c.code).toBe('OBO');
  expect(c.side).toBe('sell');
  expect(c.verdict).toBe('valid');
  expect(Object.keys(c.points)).toEqual(['LS', 'K', 'N1', 'N2', 'RS', 'B']);
  expect(c.points.K.time).toBe(62 * H4);
  expect(c.points.B.time).toBe(73 * H4);
  const buy = analyzeObo(new FormationContext('TEST', { H4: barsOf(mirror(BASE), H4), D1: barsOf(BASE, D1) }), 1e9);
  expect(buy.map((x) => x.tf)).toEqual(['D1', 'H4']);
  expect(buy[1].candidate.side).toBe('buy');
  expect(buy[1].candidate.verdict).toBe('valid');
  expect(buy[0].candidate.side).toBe('sell');
});

frm('analyzeObo: ruhige Reihe und fehlender Kontext liefern nichts Gültiges', () => {
  expect(analyzeObo(new FormationContext('TEST', {}), 1e9)).toEqual([]);
  const flat = analyzeObo(new FormationContext('TEST', { H4: barsOf(LEAD, H4) }), 1e9)[0].candidate;
  expect(flat.verdict).toBe('forming');
  expect(flat.checks.every((k) => k.state === U || k.id === 'OBO-09' || k.id === 'OBO-14')).toBe(true);
});

frm('checkOboCandidate: falsche Reihenfolge oder nicht geladene Kerze ergibt nicht messbar', () => {
  const bars = barsOf(BASE, H4);
  const ctx = new FormationContext('TEST', { H4: bars });
  const a = (i: number, price: number): Anchor => ({ time: bars[i].time, price });
  const swapped = checkOboCandidate(ctx, 1e9, { tf: 'H4', ls: a(62, 150), n1: a(58, 120), k: a(54, 135), n2: a(66, 121) });
  expect(swapped.checks.every((k) => k.state === U)).toBe(true);
  const missing = checkOboCandidate(ctx, 1e9, { tf: 'H1', ls: a(54, 135), n1: a(58, 120), k: a(62, 150), n2: a(66, 121) });
  expect(missing.checks.every((k) => k.state === U)).toBe(true);
});

// ---- Echte Kerzenreihen ----------------------------------------------------------------------------------------

const loadReal = (file: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')));

interface Real {
  file: string;
  /** Prüfzeitpunkt t (MT5-Sekunden) */
  t: number;
  side: 'sell' | 'buy';
  verdict: Candidate['verdict'];
  /** Kerzenbeginn von K, RS und der Bruchkerze */
  k: number;
  rs: number;
  b: number;
  expect: Record<string, CheckState>;
}

const GOOD = { '01': M, '02': M, '03': M, '04': M, '05': M, '11': M, '12': M, '13': N, '14': N } as const;
const REAL: Real[] = [
  // TOBO (Kauf): Schultern gleich groß, kein Wave-Signal
  { file: 'obo-buy-h4-01', t: 1763424000, side: 'buy', verdict: 'valid', k: 1762977600, rs: 1763337600, b: 1763409600, expect: { ...GOOD, '06': M, '07': N, '08': N } },
  // TOBO mit Divergenz zwischen LS und K
  { file: 'obo-buy-h4-02', t: 1762545600, side: 'buy', verdict: 'valid', k: 1762286400, rs: 1762502400, b: 1762531200, expect: { ...GOOD, '06': N, '07': N, '08': M } },
  // OBO (Verkauf) mit konsolidierter rechter Schulter
  { file: 'obo-sell-h4-01', t: 1763755200, side: 'sell', verdict: 'valid', k: 1763596800, rs: 1763712000, b: 1763740800, expect: { ...GOOD, '06': M, '07': M, '08': N } },
  // gültig, dann verletzt: zwei Kerzen später schließt eine Kerze über der rechten Schulter
  { file: 'obo-gone-h4-01', t: 1767585600, side: 'sell', verdict: 'valid', k: 1767168000, rs: 1767355200, b: 1767571200, expect: { ...GOOD } },
  { file: 'obo-gone-h4-01', t: 1767614400, side: 'sell', verdict: 'invalid', k: 1767168000, rs: 1767355200, b: 1767571200, expect: { ...GOOD, '13': M } },
  // Negativfall: der Preis fällt vor dem Nackenbruch unter N1, der Trend hat gedreht (Libra, keine Kopf-Schulter)
  { file: 'obo-libra-h4-01', t: 1761681600, side: 'sell', verdict: 'invalid', k: 1761321600, rs: 1761638400, b: 1761667200, expect: { '01': M, '02': M, '03': M, '04': M, '05': N, '11': M } },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file} bei t=${r.t}`, () => {
    const fx = loadReal(r.file);
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const c = analyzeObo(new FormationContext(fx.symbol, { H4: known }), r.t)[0].candidate;
    expect(c.side).toBe(r.side);
    expect(c.verdict).toBe(r.verdict);
    expect(c.points.K.time).toBe(r.k);
    expect(c.points.RS.time).toBe(r.rs);
    expect(c.points.B.time).toBe(r.b);
    for (const [n, want] of Object.entries(r.expect)) expect(state(c, idOf(Number(n))), idOf(Number(n))).toBe(want);
    // Kein Blick in die Zukunft: mit allen Kerzen der Datei und gleichem t derselbe Befund
    const full = analyzeObo(new FormationContext(fx.symbol, { H4: fx.bars }), r.t)[0].candidate;
    expect(full.checks.map((x) => [x.id, x.state])).toEqual(c.checks.map((x) => [x.id, x.state]));
    expect(full.verdict).toBe(c.verdict);
  });
}

frm('echte Reihe: eine gültige Kopf-Schulter ist keine gültige Libra', () => {
  const fx = loadReal('obo-sell-h4-01');
  const t = 1763755200;
  const ctx = new FormationContext(fx.symbol, { H4: fx.bars.filter((b) => b.time + H4 <= t) });
  expect(analyzeObo(ctx, t)[0].candidate.verdict).toBe('valid');
  expect(analyzeLib(ctx, t)[0].candidate.verdict).not.toBe('valid');
});

