/**
 * Trend-618 (T618): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen und auf echten Reihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts), Bausteine in e2e/fixtures/formation-lines.ts.
 *
 * Basis (Verkauf): Wendepunkte 100, 140, 118, 150, 130, 156, 118, 142 mit 8 Kerzen je Zug; der k-te liegt auf Index 42 + 8k.
 * Impulse nach oben: 40, 32, 26 (jeder kürzer). Linie durch die Tiefs 118 (Index 58) und 130 (Index 74): 0,75 je Kerze, bei P (Index 82) 136.
 * P 156, I 118 (Index 90). Fib P → I: Länge 38, Level 0.618 = 118 + 0,618 × 38 = 141,48; K 142 berührt, K 138 nicht.
 * FRM-15 Formationserkennung: T618
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyze2618 } from '../../src/lib/formation/f2618Checks';
import { analyzeT618, checkT618Candidate, T618_CHECK_IDS } from '../../src/lib/formation/t618Checks';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { END, H4, mirror, patched, type Row } from '../fixtures/formation-rows';
import { AXIS, M, N, U, at, ctxOf, lineRows, state, statesOf, tip } from '../fixtures/formation-lines';
import { named, trendOf } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-15' }, fn);
const idOf = (n: number) => `T618-${String(n).padStart(2, '0')}`;

const P = at(5);
const I = at(6);

interface Options {
  buy?: boolean;
  t?: number;
  /** true: I wird nicht angegeben, sondern gemessen */
  measured?: boolean;
  p?: number;
  i?: number;
}

/** Prüft P und I; `buy = true` prüft die gespiegelte Reihe (Kauf) */
function run(rows: Row[], options: Options = {}): Candidate {
  const buy = options.buy ?? false;
  const series = buy ? mirror(rows, AXIS) : rows;
  const p = options.p ?? P;
  const i = options.i ?? I;
  return checkT618Candidate(ctxOf(series), options.t ?? END, {
    tf: 'H4',
    p: tip(series, p, true, buy),
    ...(options.measured ? {} : { i: tip(series, i, false, buy) }),
  });
}

// ---- Reihen ----------------------------------------------------------------------------------------------------

const BASE = lineRows([100, 140, 118, 150, 130, 156, 118, 142]);
/** Letzter Impuls 130 → 170 (40) ist länger als der vorige (32): kein Kraftverlust; P 170, I 118, Level 0.618 = 150,1 */
const STRONG = lineRows([100, 140, 118, 150, 130, 170, 118, 152]);
/** Letzter Zug 130 → 170 über 16 Kerzen (Index 74 bis 90): die Wave steigt dort höher als an H2 (22,1 gegen 20,4), keine Divergenz; I 118 bei Index 98 */
const LONG_LEG = lineRows([100, 140, 118, 150, 130, 170, 118, 152], [8, 8, 8, 8, 16, 8, 8]);
/** Die Hochs steigen deutlich (130, 150, 175), ein Doppeltop gibt es nicht; P 175 überragt das Hoch davor (150), die Linie gilt. Impulse 50, 45, 40; Linie durch 105 und 135; Fib 175 → 105 (70), Level 0.618 = 148,3, K 150 berührt */
const NO_DOUBLE = lineRows([80, 130, 105, 150, 135, 175, 105, 150]);
/** Tiefs 130 und 118 fallen: die Linie steigt nicht */
const FALLING_LOWS = lineRows([100, 140, 130, 150, 118, 156, 118, 142]);
/** Tiefs 118 und 148 (1,875 je Kerze): P 156 überragt das Hoch davor (170) nie, also schließt nach dem zweiten Anker keine Kerze darüber (TRD-34): keine Linie */
const STEEP = lineRows([100, 140, 118, 170, 148, 156, 118, 142]);
/** Wie BASE, aber die Kerze nach dem zweiten Anker (Tief 130) schließt mit 130,4 unter der Linie (130,75): Schluss jenseits der Linie vor P, die Linie gilt (Freigabe vor P) */
const VIOLATED = patched(BASE, at(4) + 1, [131.5, 131.6, 130.1, 130.4]);
/** Nach P fällt der Preis nur auf 150 (die Linie liegt dort bei 142 und steigt): kein Schluss jenseits der Linie */
const NO_BREAK = lineRows([100, 140, 118, 150, 130, 156, 150, 155]);
/** I 135: Schluss unter der Linie, aber nie zweimal unter dem Tief 130; Level 0.618 = 135 + 0,618 × 21 = 147,98, K 149 berührt */
const NO_CHANGE = lineRows([100, 140, 118, 150, 130, 156, 135, 149]);
/** Wie NO_CHANGE, danach fällt der Preis auf 120: die zwei Schlüsse unter dem Tief 130 kommen erst nach der Berührung von 0.618 */
const LATE_CHANGE = lineRows([100, 140, 118, 150, 130, 156, 135, 149, 120]);
/** I 135, K 145 bleibt unter 0.618 (147,98), danach Fall auf 120: Wechsel ohne Berührung, er zählt bis zur letzten Kerze */
const CHANGE_NO_TOUCH = lineRows([100, 140, 118, 150, 130, 156, 135, 145, 120]);
/** P 150,1 überragt das Hoch davor (150) nur mit dem Docht, danach schließt keine Kerze über 150: nach TRD-34 gibt es noch keine Linie */
const NO_RELEASE = lineRows([100, 140, 118, 150, 130, 150.1, 118, 142]);
/** Wie NO_RELEASE, aber nach I schließt eine Kerze über 150 (152): die Freigabe kommt erst nach P, P liegt vor der Linie (TRD-42) */
const RELEASE_AFTER_P = lineRows([100, 140, 118, 150, 130, 150.1, 118, 152]);
/** Das erste Tief der Linie ist ein Spike (Körper 119, Docht bis 117): Anker ist der Docht der rechten Nachbarkerze (TRD-36) */
const SPIKE_L1 = patched(BASE, at(2), [119, 119.1, 117, 119]);
/** Die Reihe endet an I: dort ist noch kein Fraktal fertig */
const OPEN_I = lineRows([100, 140, 118, 150, 130, 156, 118], 8, 0);
/** K 138 bleibt unter dem Level 0.618 (141,48) */
const NO_TOUCH = lineRows([100, 140, 118, 150, 130, 156, 118, 138]);
/** Ohne Vorlauf: Wave und die Divergenz sind an H2 noch nicht messbar */
const NO_LEAD = lineRows([100, 140, 118, 150, 130, 156, 118, 142], 8, 3, 0);
/** K-Kerze mit großer Spanne, steigend (volumenstark gegen den Verkauf) */
const WIDE_K: Row[] = patched(BASE, at(7), [127, 142, 125, 141.9]);
/** Dieselbe Kerze, aber fallend (Körper mit dem Verkauf) */
const WIDE_DOWN: Row[] = patched(BASE, at(7), [141.9, 142, 125, 127]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  rows: Row[];
  options?: Options;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  { name: 'Kraftverlust, Linienbruch, Trendwechsel, I, Rücklauf an 0.618: alles erfüllt', rows: BASE, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': M, '07': M, '08': M, '09': M } },
  { name: 'T618-01 ☐: der letzte Impuls ist länger als der vorige', rows: STRONG, expect: { '01': N, '02': M, '04': M } },
  { name: 'T618-08 ☐: der letzte Impuls ist länger und stärker, die Wave an P ist nicht schwächer', rows: LONG_LEG, options: { p: at(5) + 8, i: at(6) + 8 }, expect: { '01': N, '08': N, '04': M } },
  { name: 'T618-02 ☐: die Tiefs fallen, die Linie steigt nicht', rows: FALLING_LOWS, expect: { '02': N } },
  { name: 'T618-02 ☐: P überragt das Hoch davor nie, nach dem zweiten Anker gibt es keine Freigabe der Linie (TRD-34)', rows: STEEP, expect: { '02': N } },
  { name: 'T618-03 ☐: ein Schluss jenseits der Linie vor P', rows: VIOLATED, expect: { '03': N, '02': M } },
  { name: 'T618-04 ☐: nach P schließt keine Kerze unter der Linie', rows: NO_BREAK, expect: { '04': N, '05': N, '06': N, '03': M, '07': M } },
  { name: 'T618-05 ☐: Schluss unter der Linie, aber nie zweimal unter dem Tief 130', rows: NO_CHANGE, expect: { '04': M, '05': N, '06': M, '07': M } },
  { name: 'T618-05 ☐: der Trend wechselt erst nach der Berührung von 0.618 (nach dem Einstieg)', rows: LATE_CHANGE, expect: { '04': M, '05': N, '06': M, '07': M } },
  { name: 'T618-05 ☑ ohne Berührung: der Wechsel zählt bis zur letzten Kerze', rows: CHANGE_NO_TOUCH, expect: { '04': M, '05': M, '07': N } },
  { name: 'T618-06 ☐: an I ist noch kein Fraktal fertig', rows: OPEN_I, expect: { '06': N, '07': N, '09': U } },
  { name: 'T618-07 ☐: die Korrektur bleibt unter 0.618', rows: NO_TOUCH, expect: { '06': M, '07': N, '09': U } },
  { name: 'T618-08 nicht messbar: ohne Vorlauf fehlt die Wave an H2', rows: NO_LEAD, options: { p: at(5, 0), i: at(6, 0) }, expect: { '08': U, '04': M, '07': M } },
  { name: 'T618-09 ☐: volumenstarke steigende Kerze an der Berührung', rows: WIDE_K, expect: { '07': M, '09': N } },
  { name: 'T618-09 ☑: dieselbe Kerze fällt (mit dem Verkauf)', rows: WIDE_DOWN, expect: { '07': M, '09': M } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = run(c.rows, c.options);
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, idOf(Number(n))), idOf(Number(n))).toBe(want);
  });
}

frm('Urteil: Berührung von 0.618 ohne Trendwechsel davor ist ungültig, T618-05 steht in invalidBy', () => {
  for (const rows of [NO_CHANGE, LATE_CHANGE]) {
    const c = run(rows);
    expect(state(c, 'T618-07')).toBe(M);
    expect(state(c, 'T618-05')).toBe(N);
    expect(c.verdict).toBe('invalid');
    expect(c.invalidBy).toEqual(['T618-05']);
  }
  // ohne Berührung bleibt es im Aufbau: der Wechsel kann noch kommen
  const open = run(CHANGE_NO_TOUCH);
  expect(open.verdict).toBe('forming');
  expect(open.invalidBy).toEqual([]);
  const spiegel = run(NO_CHANGE, { buy: true });
  expect(spiegel.verdict).toBe('invalid');
  expect(spiegel.invalidBy).toEqual(['T618-05']);
});

frm('Linie nach TRD-34: ohne Schluss über dem Hoch vor dem zweiten Anker gibt es keine Linie, T618-02 ☐', () => {
  for (const buy of [false, true]) {
    const c = run(NO_RELEASE, { buy });
    expect(state(c, 'T618-02')).toBe(N);
    expect(c.verdict).toBe('invalid');
    expect(c.invalidBy).toContain('T618-02');
  }
});

frm('Linie nach TRD-34: kommt die Freigabe erst nach P, ist T618-02 ☐', () => {
  for (const buy of [false, true]) {
    const c = run(RELEASE_AFTER_P, { buy });
    expect(state(c, 'T618-02')).toBe(N);
    expect(c.invalidBy).toContain('T618-02');
  }
});

frm('Suche: ein P ohne Freigabe der Linie ist kein Kandidat', () => {
  for (const buy of [false, true]) {
    const c = analyzeT618(ctxOf(buy ? mirror(NO_RELEASE, AXIS) : NO_RELEASE), END)[0].candidate;
    expect(c.points.P?.time).not.toBe(P * H4);
  }
});

frm('TRD-36: ein Spike am ersten Tief der Linie ist kein Anker, die Linie beginnt am Docht der Nachbarkerze', () => {
  const c = run(SPIKE_L1);
  expect(state(c, 'T618-02')).toBe(M);
  const line = c.drawings.find((d) => d.id === 'Z-T618-01')!;
  expect(line.anchors[0].time).toBe((at(2) + 1) * H4);
  expect(line.anchors[0].price).toBeGreaterThan(BASE[at(2)][2]);
});

frm('Urteil: gültig bei allen Pflichten, im Aufbau ohne Bruch oder Berührung, ungültig bei verletzter Struktur', () => {
  expect(run(BASE).verdict).toBe('valid');
  expect(run(NO_BREAK).verdict).toBe('forming');
  expect(run(NO_BREAK).invalidBy).toEqual([]);
  expect(run(OPEN_I).verdict).toBe('forming');
  expect(run(NO_TOUCH).verdict).toBe('forming');
  expect(run(NO_CHANGE).verdict).toBe('invalid');
  expect(run(STRONG).verdict).toBe('invalid');
  expect(run(FALLING_LOWS).verdict).toBe('invalid');
  expect(run(STEEP).verdict).toBe('invalid');
  expect(run(WIDE_K).verdict).toBe('valid');
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

frm('Messung ohne eigenes I findet das Impulsende selbst', () => {
  const c = run(BASE, { measured: true });
  expect(c.points.I.time).toBe(I * H4);
  expect(state(c, 'T618-07')).toBe(M);
  expect(c.verdict).toBe('valid');
});

frm('Abdeckung: jede messbare Bedingung hat einen ☑- und einen ☐-Fall', () => {
  const seen: Record<string, Set<CheckState>> = {};
  for (const c of CASES) for (const k of run(c.rows, c.options).checks) (seen[k.id] ??= new Set()).add(k.state);
  for (const id of T618_CHECK_IDS) {
    expect(seen[id]?.has(M), `${id} ☑`).toBe(true);
    expect(seen[id]?.has(N), `${id} ☐`).toBe(true);
  }
  expect(seen['T618-08'].has(U)).toBe(true);
  expect(seen['T618-09'].has(U)).toBe(true);
});

frm('Kein Blick in die Zukunft: Kerzen nach t ändern nichts', () => {
  const t = (at(7) + 1) * H4;
  const full = run(BASE, { t });
  const cut = run(BASE.slice(0, at(7) + 1), { t });
  expect(statesOf(full)).toEqual(statesOf(cut));
  expect(full.verdict).toBe(cut.verdict);
  expect(state(run(BASE, { t: at(7) * H4 }), 'T618-07')).toBe(N);
});

frm('Abgrenzung zu 2618: derselbe Rücklauf an 0.618 ohne Doppeltop ist T618, nicht 2618', () => {
  const c = analyze2618(ctxOf(NO_DOUBLE), END)[0].candidate;
  expect(state(c, '2618-01')).not.toBe(M);
  expect(c.verdict).not.toBe('valid');
  const t = run(NO_DOUBLE);
  expect(t.verdict).toBe('valid');
  expect(state(t, 'T618-04')).toBe(M);
  expect(state(t, 'T618-07')).toBe(M);
});

frm('Zeichnungen: Linie, Fib, Zonen und Expansion kommen auch bei ☐', () => {
  const full = run(BASE);
  expect(full.drawings.map((d) => d.id)).toEqual(['Z-T618-01', 'Z-T618-02', 'Z-T618-03', 'Z-T618-03b', 'Z-T618-04']);
  const fib = full.drawings.find((d) => d.id === 'Z-T618-02')!;
  expect(fib.tool).toBe('fib');
  expect(fib.levels).toEqual([0.5, 0.618, -0.272, -0.618]);
  expect(fib.anchors.map((a) => a.price)).toEqual([BASE[P][1], BASE[I][2]]);
  const line = full.drawings.find((d) => d.id === 'Z-T618-01')!;
  expect(line.tool).toBe('trendline');
  expect(line.anchors[0]).toEqual({ time: at(2) * H4, price: BASE[at(2)][2] });
  expect(line.rules).toEqual(['T618-02', 'T618-03', 'T618-04']);
  const noTouch = run(NO_TOUCH);
  expect(noTouch.drawings.map((d) => d.id)).toEqual(['Z-T618-01', 'Z-T618-02', 'Z-T618-03', 'Z-T618-03b']);
});

frm('Analyse findet P, Linie und I selbst und liefert alle Bedingungen', () => {
  const res = analyzeT618(ctxOf(BASE), END);
  expect(res.map((r) => r.tf)).toEqual(['H4']);
  const c = res[0].candidate;
  expect(c.checks.filter((c) => !c.veto).map((x) => x.id)).toEqual([...T618_CHECK_IDS]);
  expect(c.verdict).toBe('valid');
  expect(c.points.P.time).toBe(P * H4);
  expect(c.points.I.time).toBe(I * H4);
  expect(c.side).toBe('sell');
  const mirrored = analyzeT618(ctxOf(mirror(BASE, AXIS)), END)[0].candidate;
  expect(mirrored.side).toBe('buy');
  expect(statesOf(mirrored)).toEqual(statesOf(c));
});

frm('Eigene Punkte, die kein Wendepunkt des Trendzugs sind, sind nicht messbar', () => {
  const c = checkT618Candidate(ctxOf(BASE), END, { tf: 'H4', p: { time: 62 * H4, price: BASE[62][1] } });
  expect(c.checks.every((k) => k.state === U)).toBe(true);
  expect(c.verdict).toBe('forming');
});

// ---- Echte Kerzenreihen ----------------------------------------------------------------------------------------

interface Real {
  file: string;
  /** Prüfzeitpunkt t (MT5-Sekunden) */
  t: number;
  /** true: kein Kandidat, alle Bedingungen nicht messbar (kein P mit gültiger Linie) */
  none?: boolean;
  /** bei `none`: das frühere P (Öffnungszeit); mit eigenen Punkten ist T618-02 ☐, weil die Linie erst nach P frei wird */
  oldP?: number;
  side?: 'sell' | 'buy';
  verdict?: Candidate['verdict'];
  expect?: Record<string, CheckState>;
  /** 2618 ist am selben Ort gültig (Doppeltop/-boden mit Rücklauf) */
  with2618: boolean;
}

const loadReal = (file: string) => named(`e2e/fixtures/formation/${file}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8'))));
const REAL: Real[] = [
  // K2 freigegeben 2026-11-04: P hat keine Freigabe der Linie (TRD-34), also kein Kandidat (vorher: gültig, alle ☑). Die alte Erwartung hielt nur die Ausgabe fest.
  { file: 't618-sell-h4-01', oldP: 1763395200, t: 1763481600, none: true, with2618: false },
  // K2 freigegeben 2026-11-04: wie t618-sell-h4-01, kein Kandidat (vorher: gültig)
  { file: 't618-sell-h4-02', oldP: 1761854400, t: 1762257600, none: true, with2618: false },
  // K2 freigegeben 2026-11-04: der Kauf mit der Berührung vor dem Wechsel (2025-12-19 20:00 gegen 2025-12-22 08:00) hat kein P mit Freigabe der Linie,
  // also kein Kandidat; "ungültig" über T618-05 wird es nicht (vorher: im Aufbau, T618-05 ☐)
  { file: 't618-buy-h4-01', oldP: 1766131200, t: 1766404800, none: true, with2618: false },
  // K2 freigegeben 2026-11-04: das frühere P ohne Freigabe fällt weg; die Suche wählt P an der Kerze 11-25 00:00 (Verkauf, vorher: gültiger Kauf).
  // Kraftverlust ☐, Linie und Bruch ☑, Wechsel, I und Berührung ☐ (Berührung von 0.618 ohne Wechsel davor)
  { file: 't618-buy-h4-02', t: 1764072000, side: 'sell', verdict: 'invalid', expect: { '01': N, '02': M, '03': M, '04': M, '05': N, '06': N, '07': N }, with2618: true },
  // Negativfall: keine Kraftverlust-Folge (T618-01 ☐); ein Doppeltop mit Rücklauf gibt es dort trotzdem (2618 gültig)
  { file: 't618-bad-h4-01', t: 1764129600, side: 'sell', verdict: 'invalid', expect: { '01': N, '02': M, '03': M, '04': M }, with2618: true },
  // K2 freigegeben 2026-11-04: Negativfall, die Suche wählt P eine Kerze früher (11-20 12:00); T618-01 ☐ (vorher T618-03 ☐ am alten P), Linie nach TRD-34 gültig
  { file: 't618-bad-h4-02', t: 1763755200, side: 'sell', verdict: 'invalid', expect: { '01': N, '02': M, '03': M, '07': N }, with2618: false },
  // K2 freigegeben 2026-11-04: im Aufbau wurde kein Kandidat (P ohne Freigabe der Linie).
  // FRM-41 (2026-11-05, Formationen auf dem Trendzug des Nutzers): auf dem Trendzug des Nutzers gibt es einen Kauf-Kandidaten ohne Kraftverlust-Folge (T618-01 ☐)
  { file: 't618-form-h4-01', t: 1765497600, side: 'buy', verdict: 'invalid', expect: { '01': N, '02': M, '03': M, '04': N, '07': M }, with2618: false },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file}`, () => {
    const fx = loadReal(r.file);
    const c = analyzeT618(new FormationContext(fx.symbol, { H4: fx.bars }, { trend: trendOf(fx.bars) }), r.t)[0].candidate;
    if (r.none) {
      expect(c.checks.every((k) => k.state === U)).toBe(true);
      expect(c.verdict).toBe('forming');
      const bar = fx.bars.find((b) => b.time === r.oldP)!;
      const side = r.file.includes('buy') ? 'support' : 'resistance';
      const own = checkT618Candidate(new FormationContext(fx.symbol, { H4: fx.bars }, { trend: trendOf(fx.bars) }), r.t, { tf: 'H4', p: { time: bar.time, price: side === 'support' ? bar.low : bar.high } });
      expect(state(own, 'T618-02'), 'T618-02 am früheren P').toBe(N);
    } else {
      expect(c.side).toBe(r.side);
      expect(c.verdict).toBe(r.verdict);
      for (const [n, want] of Object.entries(r.expect ?? {})) expect(state(c, idOf(Number(n))), idOf(Number(n))).toBe(want);
    }
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const cut = analyzeT618(new FormationContext(fx.symbol, { H4: known }, { trend: trendOf(known) }), r.t)[0].candidate;
    expect(statesOf(cut)).toEqual(statesOf(c));
    expect(cut.verdict).toBe(c.verdict);
    const other = analyze2618(new FormationContext(fx.symbol, { H4: fx.bars }, { trend: trendOf(fx.bars) }), r.t)[0].candidate;
    expect(other.verdict === 'valid', 'zugleich 2618 gültig').toBe(r.with2618);
  });
}
