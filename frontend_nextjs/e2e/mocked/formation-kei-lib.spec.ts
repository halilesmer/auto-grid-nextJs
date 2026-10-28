/**
 * Wendekeil (KEI): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen und auf echten Reihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts), Bausteine in e2e/fixtures/formation-lines.ts.
 *
 * Basis (Verkauf): Wendepunkte 100, 150, 130, 176, 160, 202, 150 mit 8 Kerzen je Zug; der k-te liegt auf Index 42 + 8k.
 * Trendlinie durch die Tiefs 100 (Index 42) und 130 (Index 58): 1,875 je Kerze; bei Index 74 liegt sie bei 160 (das zweite Tief berührt sie).
 * Gegenlinie durch die Hochs 150 (Index 50) und 176 (Index 66): 1,625 je Kerze; bei Index 82 liegt sie bei 202 (das dritte Hoch berührt sie).
 * Abstand der Linien: 35 bei Index 50, 29 bei Index 74 (Verengung). Impulse 50, 46, 42 (jeder kürzer). Die Trendlinie liegt bei Index 90 bei 190.
 * FRM-17 Formationserkennung: Wendekeil
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeKei, checkKeiCandidate, KEI_CHECK_IDS } from '../../src/lib/formation/keiChecks';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { END, H4, mirror, type Row } from '../fixtures/formation-rows';
import { AXIS, M, N, U, at, ctxOf, lineRows, state, statesOf, tip } from '../fixtures/formation-lines';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-17' }, fn);
const idOf = (n: number) => `KEI-${String(n).padStart(2, '0')}`;

interface Options {
  buy?: boolean;
  t?: number;
  /** erster der fünf aufeinanderfolgenden Wendepunkte; 1 beginnt mit einem Hoch (Gegenrichtung) */
  from?: number;
}

/** Prüft fünf aufeinanderfolgende Wendepunkte ab `from` (Tief, Hoch, Tief, Hoch, Tief); `buy = true` prüft die gespiegelte Reihe (Kauf) */
function run(rows: Row[], options: Options = {}): Candidate {
  const buy = options.buy ?? false;
  const from = options.from ?? 0;
  const series = buy ? mirror(rows, AXIS) : rows;
  const pick = (n: number) => tip(series, at(from + n), (from + n) % 2 === 1, buy);
  return checkKeiCandidate(ctxOf(series), options.t ?? END, { tf: 'H4', l0: pick(0), hs: pick(1), la: pick(2), h2: pick(3), lb: pick(4) });
}

// ---- Reihen ----------------------------------------------------------------------------------------------------

const BASE = lineRows([100, 150, 130, 176, 160, 202, 150]);
/** Die Reihe endet nach dem dritten Hoch 202: der Trend ist aufwärts */
const UPTREND_ONLY = lineRows([100, 150, 130, 176, 160, 202]);
/** Letzter Impuls 160 → 225 (65) ist länger als der vorige (46) */
const STRONG_LAST = lineRows([100, 150, 130, 176, 160, 225, 150]);
/** Die Tiefs fallen (150, 140): die Trendlinie zeigt nicht mit dem Trend */
const FALLING = lineRows([150, 200, 140, 195, 130, 190, 120]);
/** Flaches Dreieck: die Hochs liegen gleich (150, 150), nur die Tiefs steigen (120, 125, 130) */
const FLAT_TOP = lineRows([120, 150, 125, 150, 130, 148, 100]);
/** Das zweite Hoch 185 (2,19 je Kerze) steigt steiler als die Tiefs (1,875): die Linien laufen auseinander */
const WIDENING = lineRows([100, 150, 130, 185, 160, 202, 150]);
/** Das zweite Tief 150 liegt unter der Linie (160) und schließt dort darunter: die Aktivierung kommt vor dem zweiten Test */
const EARLY_BREAK = lineRows([100, 150, 130, 176, 150, 202, 150]);
/** Die Reihe endet am Tief 196 über der Linie (190 bei Index 90) */
const NO_ACTIVATION = lineRows([100, 150, 130, 176, 160, 202, 196], 8, 0);
/** Das dritte Hoch 195 erreicht die Gegenlinie (202) nicht */
const NO_RETEST = lineRows([100, 150, 130, 176, 160, 195, 150]);
/** Fall nur auf 170: unter der Linie (190), aber über dem Tief 160, also kein Trendwechsel */
const NO_CHANGE = lineRows([100, 150, 130, 176, 160, 202, 170]);
/** Der Fall von 202 auf 150 dauert 24 Kerzen: die Bruchkerze hat keine große Spanne */
const SLOW_BREAK = lineRows([100, 150, 130, 176, 160, 202, 150], [8, 8, 8, 8, 8, 24]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  rows: Row[];
  options?: Options;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  { name: 'Keil mit Kraftverlust, Verengung, 2-und-2, Test, Schluss unter der Linie, Trendwechsel, große Bruchkerze: alles erfüllt', rows: BASE, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': M, '07': M, '08': M, '09': M } },
  { name: 'KEI 01 ☐: Fenster ab dem Hoch (fallender Keil) im Aufwärtstrend, der Trend zeigt nach oben', rows: UPTREND_ONLY, options: { from: 1 }, expect: { '01': N } },
  { name: 'KEI 02 ☐: der letzte Impuls ist länger als der vorige', rows: STRONG_LAST, expect: { '02': N, '03': M } },
  { name: 'KEI 03 ☐: die Tiefs fallen, die Linien zeigen nicht mit dem Trend', rows: FALLING, expect: { '03': N } },
  { name: 'KEI 03 ☐: flaches Dreieck, die Gegenlinie steigt nicht (kein Keil)', rows: FLAT_TOP, expect: { '03': N } },
  { name: 'KEI 04 ☐: die Linien laufen auseinander', rows: WIDENING, expect: { '04': N, '03': M, '05': M } },
  { name: 'KEI 05 ☐: Schluss unter der Linie schon vor dem zweiten Test unten', rows: EARLY_BREAK, expect: { '05': N, '06': M } },
  { name: 'KEI 06 ☐: kein Schluss unter der Linie', rows: NO_ACTIVATION, expect: { '06': N, '07': M, '09': U } },
  { name: 'KEI 07 ☐: das dritte Hoch erreicht die Gegenlinie nicht', rows: NO_RETEST, expect: { '07': N, '06': M } },
  { name: 'KEI 08 ☐: Schluss unter der Linie, aber nie unter dem Tief 160', rows: NO_CHANGE, expect: { '06': M, '08': N } },
  { name: 'KEI 09 ☐: die Bruchkerze hat keine große Spanne', rows: SLOW_BREAK, expect: { '06': M, '09': N } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = run(c.rows, c.options);
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, idOf(Number(n))), idOf(Number(n))).toBe(want);
  });
}

frm('Urteil: gültig bei allen Pflichten, im Aufbau ohne Aktivierung, ungültig bei verletzter Form', () => {
  expect(run(BASE).verdict).toBe('valid');
  expect(run(NO_RETEST).verdict).toBe('valid');
  expect(run(NO_ACTIVATION).verdict).toBe('forming');
  for (const rows of [STRONG_LAST, FALLING, FLAT_TOP, WIDENING, EARLY_BREAK]) expect(run(rows).verdict).toBe('invalid');
  expect(run(UPTREND_ONLY, { from: 1 }).verdict).toBe('invalid');
});

frm('Spiegelfall: fallender Keil im Abwärtstrend (Kauf) hat dieselben Zustände wie der steigende im Aufwärtstrend (Verkauf)', () => {
  for (const c of CASES) {
    const sell = run(c.rows, c.options);
    const buy = run(c.rows, { ...c.options, buy: true });
    expect(sell.side, c.name).toBe(c.options?.from === 1 ? 'buy' : 'sell');
    expect(buy.side, c.name).toBe(c.options?.from === 1 ? 'sell' : 'buy');
    expect(statesOf(buy), c.name).toEqual(statesOf(sell));
    expect(buy.verdict, c.name).toBe(sell.verdict);
  }
});

frm('Abdeckung: jede messbare Bedingung hat einen ☑- und einen ☐-Fall', () => {
  const seen: Record<string, Set<CheckState>> = {};
  for (const c of CASES) for (const k of run(c.rows, c.options).checks) (seen[k.id] ??= new Set()).add(k.state);
  for (const id of KEI_CHECK_IDS) {
    expect(seen[id]?.has(M), `${id} ☑`).toBe(true);
    expect(seen[id]?.has(N), `${id} ☐`).toBe(true);
  }
  expect(seen['KEI-09'].has(U)).toBe(true);
});

frm('Kein Blick in die Zukunft: Kerzen nach t ändern nichts', () => {
  const k = at(6) + 3;
  const t = (k + 1) * H4;
  const full = run(BASE, { t });
  const cut = run(BASE.slice(0, k + 1), { t });
  expect(statesOf(full)).toEqual(statesOf(cut));
  expect(full.verdict).toBe(cut.verdict);
  expect(state(run(BASE, { t: (at(6) - 2) * H4 }), 'KEI-08')).toBe(N);
});

frm('Zeichnungen: zwei zulaufende Linien, Fib auf die große Bewegung und Zonen kommen auch bei ☐', () => {
  const full = run(BASE);
  expect(full.drawings.map((d) => d.id)).toEqual(['Z-KEI-01', 'Z-KEI-01b', 'Z-KEI-02', 'Z-KEI-03', 'Z-KEI-03b']);
  const lower = full.drawings.find((d) => d.id === 'Z-KEI-01')!;
  const upper = full.drawings.find((d) => d.id === 'Z-KEI-01b')!;
  expect(lower.tool).toBe('trendline');
  expect(upper.anchors[0]).toEqual({ time: at(1) * H4, price: BASE[at(1)][1] });
  // die Linien laufen zusammen: Abstand am Ende kleiner als am Anfang
  const start = upper.anchors[0].price - (100 + 1.875 * (at(1) - at(0)));
  const end = upper.anchors[1].price - lower.anchors[1].price;
  expect(end).toBeLessThan(start);
  const fib = full.drawings.find((d) => d.id === 'Z-KEI-02')!;
  expect(fib.tool).toBe('fib');
  expect(fib.levels).toEqual([0.382, 0.618]);
  expect(run(NO_ACTIVATION).drawings.map((d) => d.id)).toContain('Z-KEI-01b');
});

frm('Analyse findet den Keil selbst und liefert alle Bedingungen', () => {
  const res = analyzeKei(ctxOf(BASE), END);
  expect(res.map((r) => r.tf)).toEqual(['H4']);
  const c = res[0].candidate;
  expect(c.checks.map((x) => x.id)).toEqual([...KEI_CHECK_IDS]);
  expect(c.verdict).toBe('valid');
  expect(c.side).toBe('sell');
  expect(c.points.H1.time).toBe(at(1) * H4);
  expect(c.points.L2.time).toBe(at(4) * H4);
  const mirrored = analyzeKei(ctxOf(mirror(BASE, AXIS)), END)[0].candidate;
  expect(mirrored.side).toBe('buy');
  expect(statesOf(mirrored)).toEqual(statesOf(c));
});

frm('Eigene Punkte, die keine aufeinanderfolgenden Wendepunkte sind, sind nicht messbar', () => {
  const c = checkKeiCandidate(ctxOf(BASE), END, {
    tf: 'H4',
    l0: tip(BASE, at(0), false, false),
    hs: tip(BASE, at(1), true, false),
    la: tip(BASE, at(3), false, false),
    h2: tip(BASE, at(3), true, false),
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
const FORM = { '01': M, '02': M, '03': M, '04': M, '05': M, '06': M } as const;
const REAL: Real[] = [
  // Verkauf (steigender Keil im Aufwärtstrend); erneuter Test der Gegenlinie, kein Trendwechsel, Bruchkerze ohne große Spanne
  { file: 'kei-sell-h4-01', t: 1765252800, side: 'sell', verdict: 'valid', expect: { ...FORM, '07': M, '08': N, '09': N } },
  { file: 'kei-sell-h4-02', t: 1761537600, side: 'sell', verdict: 'valid', expect: { ...FORM, '07': N, '08': N, '09': N } },
  // Kauf (fallender Keil im Abwärtstrend, Spiegelfall)
  { file: 'kei-buy-h4-01', t: 1763956800, side: 'buy', verdict: 'valid', expect: { ...FORM, '07': N, '08': N, '09': N } },
  { file: 'kei-buy-h4-02', t: 1761768000, side: 'buy', verdict: 'valid', expect: { ...FORM, '07': N, '08': N, '09': N } },
  // Negativfall: die Linien laufen nicht zusammen (KEI-04 ☐), sonst Form erfüllt
  { file: 'kei-bad-h4-01', t: 1762430400, side: 'buy', verdict: 'invalid', expect: { '01': M, '02': M, '03': M, '04': N, '05': M, '06': M } },
  // Negativfall: die Linien zeigen nicht mit dem Trend (KEI-03 ☐)
  { file: 'kei-bad-h4-02', t: 1763424000, side: 'sell', verdict: 'invalid', expect: { '01': M, '02': M, '03': N, '04': M } },
  // Negativfall: Schluss jenseits der Linie vor dem zweiten Test unten (KEI-05 ☐)
  { file: 'kei-bad-h4-03', t: 1762876800, side: 'sell', verdict: 'invalid', expect: { '03': M, '04': M, '05': N, '06': M } },
  // im Aufbau: noch kein Schluss jenseits der Linie
  { file: 'kei-form-h4-01', t: 1766160000, side: 'sell', verdict: 'forming', expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '09': U } },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file}`, () => {
    const fx = loadReal(r.file);
    const c = analyzeKei(new FormationContext(fx.symbol, { H4: fx.bars }), r.t)[0].candidate;
    expect(c.side).toBe(r.side);
    expect(c.verdict).toBe(r.verdict);
    for (const [n, want] of Object.entries(r.expect)) expect(state(c, idOf(Number(n))), idOf(Number(n))).toBe(want);
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const cut = analyzeKei(new FormationContext(fx.symbol, { H4: known }), r.t)[0].candidate;
    expect(statesOf(cut)).toEqual(statesOf(c));
    expect(cut.verdict).toBe(c.verdict);
  });
}
