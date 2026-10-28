/**
 * Ending Channel (ENC): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen und auf echten Reihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts), Bausteine in e2e/fixtures/formation-lines.ts.
 *
 * Basis (Verkauf): Wendepunkte 100, 150, 130, 179, 160, 195, 150 mit 8 Kerzen je Zug; der k-te liegt auf Index 42 + 8k.
 * Trendlinie durch die Tiefs 100 (Index 42) und 130 (Index 58): 1,875 je Kerze; bei Index 74 liegt sie bei 160 (das zweite Tief berührt sie),
 * bei Index 50 bei 115 und bei Index 66 bei 145. Kopie am äußersten Extrem: Abstand der Hochs 150 (35) und 179 (34): Kopie bei +35,
 * das zweite Hoch verfehlt sie um 1 (innerhalb von 0,5 × ATR). Impulse 50, 49, 35 (jeder kürzer), Korrekturen 20 und 19 (Anteil 0,95).
 * Die Linie liegt bei Index 82 bei 175, bei Index 90 bei 190: der Fall auf 150 schließt unter ihr.
 * FRM-16 Formationserkennung: Ending Channel
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeEnc, checkEncCandidate, ENC_CHECK_IDS } from '../../src/lib/formation/encChecks';
import { checkKeiCandidate } from '../../src/lib/formation/keiChecks';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { END, H4, mirror, type Row } from '../fixtures/formation-rows';
import { AXIS, M, N, U, at, ctxOf, lineRows, state, statesOf, tip, trendH1 } from '../fixtures/formation-lines';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-16' }, fn);
const idOf = (n: number) => `ENC-${String(n).padStart(2, '0')}`;

interface Options {
  buy?: boolean;
  t?: number;
  H1?: Row[];
}

/** Prüft die fünf Wendepunkte (Tief, Hoch, Tief, Hoch, Tief); `buy = true` prüft die gespiegelte Reihe (Kauf) */
function run(rows: Row[], options: Options = {}, check = checkEncCandidate): Candidate {
  const buy = options.buy ?? false;
  const series = buy ? mirror(rows, AXIS) : rows;
  const h1 = options.H1 && buy ? mirror(options.H1, AXIS) : options.H1;
  const pick = (k: number, high: boolean) => tip(series, at(k), high, buy);
  return check(ctxOf(series, h1 ? { H1: h1 } : {}), options.t ?? END, {
    tf: 'H4',
    l0: pick(0, false),
    hs: pick(1, true),
    la: pick(2, false),
    h2: pick(3, true),
    lb: pick(4, false),
  });
}

// ---- Reihen ----------------------------------------------------------------------------------------------------

const BASE = lineRows([100, 150, 130, 179, 160, 195, 150]);
/** Fall nur auf 170: unter der Linie (190 bei Index 90), aber über dem Tief 160, also kein Trendwechsel */
const NO_CHANGE = lineRows([100, 150, 130, 179, 160, 195, 170]);
/** Letzter Impuls 160 → 215 (55) ist länger als der vorige (49) */
const STRONG_LAST = lineRows([100, 150, 130, 179, 160, 215, 150]);
/** Die Trendlinie fällt (Tiefs 150, 140): sie zeigt nicht mit dem Trend */
const FALLING_LINE = lineRows([150, 200, 140, 190, 130, 175, 100]);
/** Das zweite Tief 165 liegt über der Linie (160): keine zweite Berührung unten */
const NO_SECOND_LOW = lineRows([100, 150, 130, 184, 165, 195, 150]);
/** Die Reihe endet am Tief 192 über der Linie (190 bei Index 90): kein Schluss darunter */
const NO_ACTIVATION = lineRows([100, 150, 130, 179, 160, 195, 192], 8, 0);
/** Korrekturen 20 und 28 (Anteil 1,4) */
const IRREGULAR = lineRows([100, 150, 130, 188, 160, 195, 150]);
/** Ein paralleler Kanal: das zweite Hoch 181 liegt 1 über der Kopie des ersten (Abstand 36 statt 35) */
const PARALLEL = lineRows([100, 150, 130, 181, 160, 200, 150]);
/** Ein Keil: das zweite Hoch 176 liegt weit unter der Kopie (Abstand 31 statt 35) */
const WEDGE = lineRows([100, 150, 130, 176, 160, 202, 150]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  rows: Row[];
  options?: Options;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  { name: 'Kanal mit Kraftverlust, 2-und-2, Schluss unter der Linie, Trendwechsel: alles erfüllt', rows: BASE, expect: { '01': U, '02': M, '03': M, '04': M, '05': M, '06': M, '07': M } },
  { name: 'ENC 01 ☑: Trend in H4 und in der tieferen Zeiteinheit H1 zeigt nach oben', rows: BASE, options: { H1: trendH1(true) }, expect: { '01': M } },
  { name: 'ENC 01 ☐: Trend in H1 zeigt nach unten (Gegenbewegung in der tieferen Zeiteinheit, keine Flagge im Trend)', rows: BASE, options: { H1: trendH1(false) }, expect: { '01': N } },
  { name: 'ENC 02 ☐: der letzte Impuls ist länger als der vorige', rows: STRONG_LAST, expect: { '02': N, '03': M } },
  { name: 'ENC 03 ☐: die Trendlinie fällt', rows: FALLING_LINE, expect: { '03': N } },
  { name: 'ENC 04 ☐: das zweite Tief liegt über der Linie', rows: NO_SECOND_LOW, expect: { '04': N, '03': M, '05': M } },
  { name: 'ENC 05 ☐: kein Schluss unter der Linie', rows: NO_ACTIVATION, expect: { '05': N, '04': M, '06': N } },
  { name: 'ENC 06 ☐: Schluss unter der Linie, aber nie unter dem Tief 160', rows: NO_CHANGE, expect: { '05': M, '06': N } },
  { name: 'ENC 07 ☐: die Korrekturen sind nicht regelmäßig (Anteil 1,4)', rows: IRREGULAR, expect: { '07': N, '02': M } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = run(c.rows, c.options);
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, idOf(Number(n))), idOf(Number(n))).toBe(want);
  });
}

frm('Urteil: gültig bei allen Pflichten, im Aufbau ohne Aktivierung, ungültig bei verletzter Form', () => {
  expect(run(BASE).verdict).toBe('valid');
  expect(run(BASE, { H1: trendH1(true) }).verdict).toBe('valid');
  expect(run(NO_CHANGE).verdict).toBe('valid');
  expect(run(NO_ACTIVATION).verdict).toBe('forming');
  expect(run(STRONG_LAST).verdict).toBe('invalid');
  expect(run(FALLING_LINE).verdict).toBe('invalid');
  expect(run(NO_SECOND_LOW).verdict).toBe('invalid');
  expect(run(BASE, { H1: trendH1(false) }).verdict).toBe('invalid');
});

frm('Spiegelfall: Kauf nach Abwärtstrend hat dieselben Zustände wie der Verkauf nach Aufwärtstrend', () => {
  for (const c of CASES) {
    const sell = run(c.rows, c.options);
    const buy = run(c.rows, { ...c.options, buy: true });
    expect(sell.side, c.name).toBe('sell');
    expect(buy.side, c.name).toBe('buy');
    expect(statesOf(buy), c.name).toEqual(statesOf(sell));
    expect(buy.verdict, c.name).toBe(sell.verdict);
  }
});

frm('Abgrenzung zum Keil: der parallele Kanal ist ENC, nicht KEI; die zulaufenden Linien sind KEI, nicht ENC', () => {
  const channel = run(PARALLEL);
  expect(state(channel, 'ENC-03')).toBe(M);
  expect(state(channel, 'ENC-04')).toBe(M);
  expect(state(run(PARALLEL, {}, checkKeiCandidate), 'KEI-04')).toBe(N);
  const wedge = run(WEDGE);
  expect(state(wedge, 'ENC-04')).toBe(N);
  expect(wedge.verdict).toBe('invalid');
  expect(state(run(WEDGE, {}, checkKeiCandidate), 'KEI-04')).toBe(M);
});

frm('Abdeckung: jede messbare Bedingung hat einen ☑- und einen ☐-Fall', () => {
  const seen: Record<string, Set<CheckState>> = {};
  for (const c of CASES) for (const k of run(c.rows, c.options).checks) (seen[k.id] ??= new Set()).add(k.state);
  for (const id of ENC_CHECK_IDS) {
    expect(seen[id]?.has(M), `${id} ☑`).toBe(true);
    expect(seen[id]?.has(N), `${id} ☐`).toBe(true);
  }
  expect(seen['ENC-01'].has(U)).toBe(true);
});

frm('Kein Blick in die Zukunft: Kerzen nach t ändern nichts', () => {
  const k = at(6) + 3;
  const t = (k + 1) * H4;
  const full = run(BASE, { t });
  const cut = run(BASE.slice(0, k + 1), { t });
  expect(statesOf(full)).toEqual(statesOf(cut));
  expect(full.verdict).toBe(cut.verdict);
  // am Beginn des Falls ist der Trendwechsel noch nicht eingetreten
  expect(state(run(BASE, { t: (at(6) - 2) * H4 }), 'ENC-06')).toBe(N);
});

frm('Zeichnungen: Trendlinie, Kopie, Höhe und Ziele kommen auch bei ☐', () => {
  const full = run(BASE);
  expect(full.drawings.map((d) => d.id)).toEqual(['Z-ENC-01', 'Z-ENC-01b', 'Z-ENC-02', 'Z-ENC-03']);
  const line = full.drawings.find((d) => d.id === 'Z-ENC-01')!;
  expect(line.tool).toBe('trendline');
  expect(line.anchors[0]).toEqual({ time: at(0) * H4, price: BASE[at(0)][2] });
  expect(line.rules).toEqual(['ENC-01', 'ENC-03', 'ENC-04', 'ENC-05']);
  const lastIdx = BASE.length - 1;
  // Kopie und Linie laufen parallel: gleicher Abstand an beiden Enden
  const copy = full.drawings.find((d) => d.id === 'Z-ENC-01b')!;
  const widthAtStart = copy.anchors[0].price - (100 + 1.875 * (at(1) - at(0)));
  const widthAtEnd = copy.anchors[1].price - line.anchors[1].price;
  expect(widthAtStart).toBeCloseTo(widthAtEnd, 6);
  expect(line.anchors[1].time).toBe(lastIdx * H4);
  const open = run(NO_ACTIVATION);
  expect(open.drawings.map((d) => d.id)).toEqual(['Z-ENC-01', 'Z-ENC-01b', 'Z-ENC-02']);
});

frm('Analyse findet den Kanal selbst und liefert alle Bedingungen', () => {
  const res = analyzeEnc(ctxOf(BASE), END);
  expect(res.map((r) => r.tf)).toEqual(['H4']);
  const c = res[0].candidate;
  expect(c.checks.map((x) => x.id)).toEqual([...ENC_CHECK_IDS]);
  expect(c.verdict).toBe('valid');
  expect(c.side).toBe('sell');
  expect(c.points.H1.time).toBe(at(1) * H4);
  expect(c.points.L2.time).toBe(at(4) * H4);
  const mirrored = analyzeEnc(ctxOf(mirror(BASE, AXIS)), END)[0].candidate;
  expect(mirrored.side).toBe('buy');
  expect(statesOf(mirrored)).toEqual(statesOf(c));
});

frm('Eigene Punkte, die keine aufeinanderfolgenden Wendepunkte sind, sind nicht messbar', () => {
  const c = checkEncCandidate(ctxOf(BASE), END, {
    tf: 'H4',
    l0: tip(BASE, at(0), false, false),
    hs: tip(BASE, at(1), true, false),
    la: tip(BASE, at(2), false, false),
    h2: tip(BASE, at(5), true, false),
    lb: tip(BASE, at(4), false, false),
  });
  expect(c.checks.every((k) => k.state === U)).toBe(true);
  expect(c.verdict).toBe('forming');
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
const FORM = { '01': U, '02': M, '03': M, '04': M, '05': M } as const;
const REAL: Real[] = [
  // Verkauf; Kanal und Schluss unter der Linie, kein Trendwechsel, Korrekturen unregelmäßig
  { file: 'enc-sell-h4-01', t: 1761840000, side: 'sell', verdict: 'valid', expect: { ...FORM, '06': N, '07': N } },
  // Verkauf; Korrekturen regelmäßig
  { file: 'enc-sell-h4-02', t: 1764763200, side: 'sell', verdict: 'valid', expect: { ...FORM, '06': N, '07': M } },
  // Kauf (Spiegelfall)
  { file: 'enc-buy-h4-01', t: 1766145600, side: 'buy', verdict: 'valid', expect: { ...FORM, '06': N, '07': M } },
  { file: 'enc-buy-h4-02', t: 1764561600, side: 'buy', verdict: 'valid', expect: { ...FORM, '06': N, '07': M } },
  // Negativfall: die Trendlinie zeigt nicht mit dem Trend (ENC-03 ☐)
  { file: 'enc-bad-h4-01', t: 1765497600, side: 'sell', verdict: 'invalid', expect: { '02': M, '03': N, '04': N, '05': N } },
  // Negativfall: das zweite Hoch verfehlt die Kopie (ENC-04 ☐), sonst Form erfüllt
  { file: 'enc-bad-h4-02', t: 1762430400, side: 'buy', verdict: 'invalid', expect: { '02': M, '03': M, '04': N, '05': M } },
  // Negativfall: kein Kraftverlust (ENC-02 ☐)
  { file: 'enc-bad-h4-03', t: 1762401600, side: 'buy', verdict: 'invalid', expect: { '02': N, '03': M } },
  // im Aufbau: noch kein Schluss jenseits der Linie
  { file: 'enc-form-h4-01', t: 1763452800, side: 'buy', verdict: 'forming', expect: { ...FORM, '05': N } },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file}`, () => {
    const fx = loadReal(r.file);
    const c = analyzeEnc(new FormationContext(fx.symbol, { H4: fx.bars }), r.t)[0].candidate;
    expect(c.side).toBe(r.side);
    expect(c.verdict).toBe(r.verdict);
    for (const [n, want] of Object.entries(r.expect)) expect(state(c, idOf(Number(n))), idOf(Number(n))).toBe(want);
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const cut = analyzeEnc(new FormationContext(fx.symbol, { H4: known }), r.t)[0].candidate;
    expect(statesOf(cut)).toEqual(statesOf(c));
    expect(cut.verdict).toBe(c.verdict);
  });
}
