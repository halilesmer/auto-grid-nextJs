/**
 * Fibonacci (FIB): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Reihen kommen aus `zig` (e2e/fixtures/formation-rows.ts): der Wendepunkt ist genau das Dochtende einer Kerze, Wendepunkte
 * liegen bei Index 2, 6, 10, 14 … (4 Kerzen je Zug). Die Rechnung steht bei jeder Reihe: Start S, Ende E, Länge, Tiefe der Korrektur.
 * FRM-04 Formationserkennung: Fibonacci und Signale
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { FIB_CHECK_IDS, analyzeFib, checkFibCandidate, type FibOptions } from '../../src/lib/formation/fibChecks';
import { parseFixture } from '../../src/lib/formation/fixture';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H1, H4, barsOf, mirror, plain, walk, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-04' }, fn);

const STEP = { D1, H4, H1 } as const;
type Tf = keyof typeof STEP;

/** Kontext aus Reihen je Zeiteinheit; `start` verschiebt die Zeiten (MT5-Sekunden) */
const ctxOf = (input: Partial<Record<Tf, Row[]>>, start: Partial<Record<Tf, number>> = {}) => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf], start[tf] ?? 0);
  return new FormationContext('TEST', bars);
};

function run(input: Partial<Record<Tf, Row[]>>, tf: Tf = 'H4', options: FibOptions = {}, start: Partial<Record<Tf, number>> = {}): Candidate {
  const found = analyzeFib(ctxOf(input, start), END, options).find((a) => a.tf === tf);
  if (!found) throw new Error(`keine Zeiteinheit ${tf}`);
  return found.candidate;
}

/** Messung mit eigenen Ankern: Kerzenindex und Preis */
function leg(rows: Row[], startIdx: number, startPrice: number, endIdx: number, endPrice: number): Candidate {
  return checkFibCandidate(ctxOf({ H4: rows }), END, {
    tf: 'H4',
    start: { time: startIdx * H4, price: startPrice },
    end: { time: endIdx * H4, price: endPrice },
  });
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

/** Fortsetzung einer Reihe: Schlusskurse, jede Kerze öffnet beim Schluss der vorigen */
const then = (rows: Row[], closes: number[]): Row[] => [...rows, ...walk(rows[rows.length - 1][3], closes)];

// ---- Reihen ---------------------------------------------------------------------------------------------------

/** S 100@2, E 130@6 (Länge 30), Korrektur bis 118: Tiefe 12/30 = 0,4; Preis(0.382) = 130 − 0,382 × 30 = 118,54 */
const HEALTHY = zig([100, 130, 118, 128]);
/** Korrektur bis 122: Tiefe 8/30 = 0,267 (0.236 berührt, 0.382 nicht) */
const SHALLOW = zig([100, 130, 122, 128]);
/** Korrektur bis 125: Tiefe 5/30 = 0,167 (kein Level berührt) */
const TINY = zig([100, 130, 125, 128]);
/** Korrektur bis 112: Tiefe 18/30 = 0,6 (0.618 nicht berührt) */
const DEEP = zig([100, 130, 112, 128]);
/** Korrektur bis 106: Tiefe 24/30 = 0,8 */
const VERY_DEEP = zig([100, 130, 106, 128]);
/** Schale: Korrektur bis 122 (Tiefe 0,267) aus 16 kleinen Kerzen */
const BOWL = zig([100, 130, 122, 128], [12, 16, 4]);
/** Tief 112 (Tiefe 0,6), zweites Tief 113,5 darüber: die letzte Kerze liegt im Band 111,46 bis 118,54 und in der Unterstützungszone 112 bis 114,2 */
const IN_BAND = [
  ...zig([100, 130, 112, 128, 113.5], 4, 0),
  [113.7, 114.3, 113.6, 114] as Row,
  [114, 114.4, 113.8, 113.9] as Row,
];
/** Rücklauf bis in das Band (115 nach 112 als erstem Tief) ohne neues Fraktal: kein Grund außer dem Fibonacci selbst */
const FALLING = then(zig([100, 130, 110, 128]), [124, 120, 117, 115]);
/** Ausbruch, Docht 138,3: Ausdehnung (138,3 − 130)/30 = 0,277 ≥ 0,272, Schlüsse über 130 */
const BREAK_FAR = then(HEALTHY, [128, 129.5, 131, 134, 137, 138.2]);
/** Ausbruch nur bis 132,6: Ausdehnung 0,087, Schlüsse über 130 */
const BREAK_NEAR = then(HEALTHY, [128, 129.5, 131, 132.5]);
/** Docht bis 130,6 ohne Schluss über 130 */
const BREAK_WICK = [...then(HEALTHY, [128]), [128, 130.6, 127.9, 129.5] as Row];
/** Flache Korrektur (Tiefe 0,267), dann derselbe Ausbruch bis 138,3 */
const SHALLOW_BREAK = then(SHALLOW, [128, 129.5, 131, 134, 137, 138.2]);
/** Fall unter den Start 100: Schlüsse 98,75 und 95,2 */
const CRASH = zig([100, 130, 110, 95]);
/** Impuls aus 20 Kerzen (20 Kerzen Vorlauf für die Spanne), dann eine große Rücklauf-Kerze (Spanne 11,9 gegen etwa 1,7 im Mittel) unter die Zone, dann ein Tief 115,9 */
const WIDE_BACK = [
  ...zig([100, 130], 20, 0),
  [129.8, 129.9, 118, 118.5] as Row,
  ...walk(118.5, [117.8, 117, 116.4, 115.9, 116.4, 116.9, 117.4]),
];
/** Wie oben, die Rücklauf-Kerze ist klein (Spanne 1,9) */
const SMALL_BACK = [
  ...zig([100, 130], 20, 0),
  [129.8, 129.9, 128, 128.5] as Row,
  ...walk(128.5, [127.8, 127, 126.4, 125.9, 126.4, 126.9, 127.4]),
];
/** Hoch 120, Tief 108, Hoch 127,5: Impuls 108 → 127,5 (Länge 19,5), Preis(0.382) = 127,5 − 0,382 × 19,5 = 120,05; das Hoch 120 wird gebrochen und ist dann potenzielle Unterstützung */
const POTENTIAL = zig([100, 120, 108, 127.5, 122, 126]);
/** Hoch 135: Preis(0.382) = 135 − 0,382 × 27 = 124,7, weit weg vom gebrochenen Hoch 120 */
const POTENTIAL_FAR = zig([100, 120, 108, 135, 130, 134]);
/** zweites Tief 115,9: Zone etwa 115,9 bis 117,6, Level 118,54 und 115 liegen mehr als die halbe Zonenhöhe entfernt */
const ZONE_FAR = zig([100, 130, 115.9, 128]);
/** zweites Tief 116,4: Zone 116,4 bis etwa 118,1, Level 118,54 liegt nahe, aber außerhalb */
const ZONE_NEAR = zig([100, 130, 116.4, 128]);

const CLIMB: Row[] = Array.from({ length: 10 }, (_, i) => plain(100 + 3 * i, 103 + 3 * i));

// ---- Fälle ----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

const M = 'met';
const N = 'unmet';

const CASES: Case[] = [
  {
    name: 'gesunde Korrektur 0,4: Anker, Tiefe, Level und Stärke stimmen',
    candidate: () => run({ H4: HEALTHY }),
    expect: {
      'FIB-01': M, 'FIB-02': M, 'FIB-03': M, 'FIB-04': M, 'FIB-05': M, 'FIB-06': M, 'FIB-07': M, 'FIB-08': M,
      'FIB-09': M, 'FIB-10': M, 'FIB-11': N, 'FIB-12': M, 'FIB-13': N, 'FIB-14': M, 'FIB-15': M, 'FIB-16': M,
      'FIB-17': M, 'FIB-18': M, 'FIB-19': U, 'FIB-20': N, 'FIB-21': N, 'FIB-22': U, 'FIB-23': U, 'FIB-24': M, 'FIB-25': M,
      'FIB-26': U, 'FIB-27': U, 'FIB-28': U, 'FIB-29': U, 'FIB-30': U,
    },
  },
  {
    name: 'Korrektur 0,267 erreicht 0.236, aber nicht 0.382',
    candidate: () => run({ H4: SHALLOW }),
    expect: { 'FIB-07': N, 'FIB-09': M, 'FIB-10': N, 'FIB-12': N, 'FIB-13': N },
  },
  {
    name: 'Korrektur 0,167 berührt kein Level',
    candidate: () => run({ H4: TINY }),
    expect: { 'FIB-09': N, 'FIB-10': N },
  },
  {
    name: 'Schale: Wende bei 0,267 aus kleinen Kerzen',
    candidate: () => run({ H4: BOWL }),
    expect: { 'FIB-13': M, 'FIB-07': N, 'FIB-12': N },
  },
  {
    name: 'Korrektur 0,6 ist keine starke Wende, 0,8 gehört nicht mehr zur Korrekturzone',
    candidate: () => run({ H4: DEEP }),
    expect: { 'FIB-16': N, 'FIB-17': M, 'FIB-10': M },
  },
  {
    name: 'Korrektur 0,8 ab 0.786',
    candidate: () => run({ H4: VERY_DEEP }),
    expect: { 'FIB-17': N, 'FIB-16': N },
  },
  {
    name: 'letzte Kerze im Band 0.382 bis 0.618, ein weiterer Grund (Unterstützung) zählt',
    candidate: () => run({ H4: IN_BAND }, 'H4', { side: 'buy' }),
    expect: { 'FIB-11': M, 'FIB-23': M },
  },
  {
    name: 'Rücklauf im Band ohne weiteren Grund: Fibonacci allein ist kein Einstieg',
    candidate: () => run({ H4: FALLING }, 'H4', { side: 'buy' }),
    expect: { 'FIB-11': M, 'FIB-23': N },
  },
  {
    name: 'Ausbruch bis 0,277 mit Schluss über dem Ende: Ausdehnung erreicht, Messung noch vorläufig',
    candidate: () => run({ H4: BREAK_FAR }),
    expect: { 'FIB-05': N, 'FIB-06': M, 'FIB-12': M, 'FIB-19': M, 'FIB-20': M, 'FIB-21': N, 'FIB-22': N, 'FIB-07': U },
  },
  {
    name: 'Ausbruch nur bis 0,087: Schluss über dem Ende, aber Bewegung nicht vollendet',
    candidate: () => run({ H4: BREAK_NEAR }),
    expect: { 'FIB-19': N, 'FIB-20': N, 'FIB-21': M },
  },
  {
    name: 'Ausbruch nur mit Docht, ohne Schluss über dem Ende: noch nicht messbar',
    candidate: () => run({ H4: BREAK_WICK }),
    expect: { 'FIB-19': U, 'FIB-21': N },
  },
  {
    name: 'Ausbruch nach flacher Korrektur: die Mindestkorrektur fehlt, also auch die Ausdehnung',
    candidate: () => run({ H4: SHALLOW_BREAK }),
    expect: { 'FIB-12': N, 'FIB-19': N },
  },
  {
    name: 'Messung gegen den Trend (Abwärtsbewegung im Aufwärtstrend) ist keine Impuls-Messung',
    candidate: () => leg(HEALTHY, 6, 130, 10, 118),
    expect: { 'FIB-01': N, 'FIB-03': M },
  },
  {
    name: 'Messung über einen älteren Impuls ist nicht der letzte',
    candidate: () => leg(HEALTHY, 2, 100, 14, 128),
    expect: { 'FIB-01': M, 'FIB-02': N },
  },
  {
    name: 'Anker am Körper statt an der Dochtspitze',
    candidate: () => leg(HEALTHY, 2, 100, 6, 129.5),
    expect: { 'FIB-03': N },
  },
  {
    name: 'Start liegt zeitlich nach dem Ende',
    candidate: () => leg(HEALTHY, 6, 100, 2, 130),
    expect: { 'FIB-04': N },
  },
  {
    name: 'Start und Ende auf demselben Preis: keine Level',
    candidate: () => leg(HEALTHY, 2, 130, 6, 130),
    expect: { 'FIB-08': N, 'FIB-18': N },
  },
  {
    name: 'ein Docht über dem Ende nach dem Start verlegt das Ende',
    candidate: () => leg(BREAK_FAR, 2, 100, 6, 130),
    expect: { 'FIB-05': N, 'FIB-06': N },
  },
  {
    name: 'zwei Schlüsse unter dem Start beenden die Messung',
    candidate: () => leg(CRASH, 2, 100, 6, 130),
    expect: { 'FIB-14': N, 'FIB-15': N },
  },
  {
    name: 'volumenstarke Rücklauf-Kerze schließt unter der Zone des Endes',
    candidate: () => run({ H4: WIDE_BACK }),
    expect: { 'FIB-22': M },
  },
  {
    name: 'kleine Rücklauf-Kerze zählt nicht',
    candidate: () => run({ H4: SMALL_BACK }),
    expect: { 'FIB-22': N },
  },
  {
    name: 'Level in der Zone des zweiten Tiefs: Konfluenz',
    candidate: () => run({ H4: ZONE_NEAR }),
    expect: { 'FIB-24': N, 'FIB-25': M },
  },
  {
    name: 'Level weit von der Zone: weder Konfluenz noch Nähe',
    candidate: () => run({ H4: ZONE_FAR }),
    expect: { 'FIB-24': N, 'FIB-25': N },
  },
  {
    name: '0.382 trifft das gebrochene Hoch (potenzielle Unterstützung)',
    candidate: () => run({ H4: POTENTIAL }),
    expect: { 'FIB-26': M },
  },
  {
    name: '0.382 liegt weit vom gebrochenen Hoch',
    candidate: () => run({ H4: POTENTIAL_FAR }),
    expect: { 'FIB-26': N },
  },
  {
    name: 'Bänder von H4 und H1 überlappen',
    candidate: () => run({ H4: HEALTHY, H1: zig([110, 125, 116, 122]) }),
    expect: { 'FIB-27': M },
  },
  {
    name: 'Bänder von H4 und H1 überlappen nicht',
    candidate: () => run({ H4: HEALTHY, H1: zig([120, 135, 128, 133]) }),
    expect: { 'FIB-27': N },
  },
  {
    name: 'Bänder von H4 und D1 überlappen, H1 nicht: erfüllt',
    candidate: () => run({ H4: HEALTHY, H1: zig([120, 135, 128, 133]), D1: zig([110, 125, 116, 122]) }),
    expect: { 'FIB-27': M },
  },
  {
    name: 'Bänder von H4 überlappen weder mit H1 noch mit D1: nicht erfüllt',
    candidate: () => run({ H4: HEALTHY, H1: zig([120, 135, 128, 133]), D1: zig([120, 135, 128, 133]) }),
    expect: { 'FIB-27': N },
  },
  {
    name: 'Kauf gegen den Abwärtstrend der höheren Zeiteinheit nach tiefer Korrektur (0,93): ausgeschlossen',
    candidate: () => run({ D1: mirror(HEALTHY), H4: zig([100, 130, 102, 128]) }, 'H4', { side: 'buy' }),
    expect: { 'FIB-28': M },
  },
  {
    name: 'Verkauf mit dem Abwärtstrend der höheren Zeiteinheit: nicht ausgeschlossen',
    candidate: () => run({ D1: mirror(HEALTHY), H4: zig([100, 130, 102, 128]) }, 'H4', { side: 'sell' }),
    expect: { 'FIB-28': N },
  },
  {
    name: 'höhere Zeiteinheit mit Mindestkorrektur und Ausdehnung, tiefere hat ein Fraktal in der Zone des Extrems',
    candidate: () => run({ D1: BREAK_FAR, H4: zig([120, 129, 124, 127]) }, 'H4', {}, { H4: 6 * D1 }),
    expect: { 'FIB-29': M, 'FIB-30': M },
  },
  {
    name: 'höhere Zeiteinheit ohne Ausdehnung, tiefes Hoch außerhalb der Zone',
    candidate: () => run({ D1: HEALTHY, H4: zig([115, 120, 117, 119]) }, 'H4', {}, { H4: 6 * D1 }),
    expect: { 'FIB-29': N, 'FIB-30': N },
  },
];

test.describe('FIB: Fälle je Bedingung', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const candidate = c.candidate();
      const got = Object.fromEntries(Object.keys(c.expect).map((id) => [id, state(candidate, id)]));
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('FIB: Abdeckung und Eigenschaften', () => {
  frm('jede Bedingung hat einen Fall mit ☑ und einen mit ☐', () => {
    const missing: string[] = [];
    for (const id of FIB_CHECK_IDS) {
      const states = new Set(CASES.map((c) => c.expect[id]).filter((s) => s !== undefined));
      if (!states.has('met')) missing.push(`${id} ☑`);
      if (!states.has('unmet')) missing.push(`${id} ☐`);
    }
    expect(missing).toEqual([]);
  });

  frm('Messwerte: Levelpreise nach der Formel, Tiefe und Ausdehnung', () => {
    const c = run({ H4: HEALTHY });
    expect(find(c, 'FIB-08').value).toBeCloseTo(118.54, 9);
    expect(find(c, 'FIB-18').value).toBeCloseTo(138.16, 9);
    expect(find(c, 'FIB-07').value).toBeCloseTo(0.4, 9);
    expect(find(run({ H4: BREAK_FAR }), 'FIB-19').value).toBeCloseTo(0.2767, 4);
  });

  frm('Aufwärtsimpuls und gespiegelter Abwärtsimpuls haben dieselben Zustände', () => {
    const up = run({ H4: HEALTHY });
    const down = run({ H4: mirror(HEALTHY) });
    expect(down.checks.map((c) => [c.id, c.state])).toEqual(up.checks.map((c) => [c.id, c.state]));
    expect([up.side, down.side]).toEqual(['buy', 'sell']);
    expect(find(down, 'FIB-08').value).toBeCloseTo(81.46, 9);
  });

  frm('Urteil: Messung gültig, Kauf gegen die höhere Zeiteinheit ausgeschlossen, ohne Fraktale im Aufbau', () => {
    const excluded = run({ D1: mirror(HEALTHY), H4: zig([100, 130, 102, 128]) }, 'H4', { side: 'buy' });
    expect([run({ H4: HEALTHY }).verdict, excluded.verdict, run({ H4: CLIMB }).verdict]).toEqual(['valid', 'invalid', 'forming']);
  });

  frm('Zeichnungen: Fibonacci mit Ankern an den Dochtspitzen, Korrekturzone, Ausdehnung, Levelsatz, Ziele', () => {
    const c = run({ H4: HEALTHY });
    const fib = c.drawings.find((d) => d.id === 'Z-FIB-01')!;
    expect(fib.anchors).toEqual([
      { time: 2 * H4, price: 100 },
      { time: 6 * H4, price: 130 },
    ]);
    expect(fib.levels).toEqual([1, 0.618, 0.5, 0.382, 0]);
    const zone = c.drawings.find((d) => d.id === 'Z-FIB-02')!;
    expect(zone.anchors.map((a) => a.price).map((p) => Math.round(p * 100) / 100)).toEqual([118.54, 111.46]);
    expect(c.drawings.find((d) => d.id === 'Z-FIB-03')!.levels).toEqual([-0.272, -0.414, -0.618]);
    expect(c.drawings.filter((d) => d.id === 'Z-FIB-06').map((d) => d.levels![0])).toEqual([0, -0.272, -0.618]);
    expect(c.drawings.find((d) => d.id === 'Z-FIB-04')!.levels).toContain(0.886);
    expect(c.drawings.find((d) => d.id === 'Z-FIB-05')!.levels).toEqual([0.236]);
    expect(find(c, 'FIB-08').drawings).toEqual(['Z-FIB-01']);
    expect(find(c, 'FIB-17').drawings).toEqual(['Z-FIB-04']);
  });

  frm('Zeichnungen mit zweiter Zeiteinheit entstehen auch bei ☐, die Konfluenzzone bei Nähe ohne Überlappung', () => {
    const two = run({ H4: HEALTHY, H1: zig([120, 135, 128, 133]) });
    expect(two.drawings.some((d) => d.id === 'Z-FIB-07')).toBe(true);
    expect(find(two, 'FIB-27').state).toBe(N);
    const near = run({ H4: ZONE_NEAR });
    expect(find(near, 'FIB-24').state).toBe(N);
    expect(near.drawings.some((d) => d.id === 'Z-FIB-08')).toBe(true);
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [18, 21]) {
      const full = analyzeFib(ctxOf({ H4: BREAK_FAR }), bars * H4).find((a) => a.tf === 'H4')!;
      const prefix = analyzeFib(ctxOf({ H4: BREAK_FAR.slice(0, bars) }), END).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Eine Kerze ohne Treffer in der Liste ist nicht messbar', () => {
    const c = checkFibCandidate(ctxOf({ H4: HEALTHY }), END, {
      tf: 'H4',
      start: { time: 999 * H4, price: 100 },
      end: { time: 6 * H4, price: 130 },
    });
    expect(c.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const lastTime = (fx: { bars: { time: number }[] }, dur: number) => fx.bars[fx.bars.length - 1].time + dur;
/** halbe ATR(14) der letzten geschlossenen Kerze: Toleranz für Preise, die aus anderen Quellen stammen */
const halfAtr = (ctx: FormationContext, tf: 'H4' | 'H1', t: number) => 0.5 * (ctx.view(tf, t)!.atr.slice(-1)[0] as number);

test.describe('FIB: echte Kerzen', () => {
  frm('fib-retrace-h4-01: Aufwärtsimpuls 1,15419 → 1,17279, Korrektur berührt 0.382 und 0.618, Preis(0.382) ≈ 1,1655', () => {
    const fx = loadFixture('fib-retrace-h4-01');
    const ctx = new FormationContext(fx.symbol, { H4: fx.bars });
    const t = lastTime(fx, H4);
    const start = fx.bars.find((b) => b.low === 1.15419)!;
    const end = fx.bars.find((b) => b.high === 1.17279)!;
    const c = checkFibCandidate(ctx, t, {
      tf: 'H4',
      start: { time: start.time, price: 1.15419 },
      end: { time: end.time, price: 1.17279 },
    });
    expect(['FIB-03', 'FIB-04', 'FIB-07', 'FIB-09', 'FIB-10'].map((id) => state(c, id))).toEqual([M, M, M, M, M]);
    // Länge 0,0186; Preis(0.382) = 1,17279 − 0,382 × 0,0186 = 1,16568
    expect(Math.abs(find(c, 'FIB-08').value! - 1.1655)).toBeLessThan(halfAtr(ctx, 'H4', t));
    expect(find(c, 'FIB-08').value).toBeCloseTo(1.1656848, 7);
  });

  frm('fib-levelprice-h1-01: Preis(0.382) des Impulses 23434,34 → 23848,8 liegt innerhalb der halben ATR bei 23700', () => {
    const fx = loadFixture('fib-levelprice-h1-01');
    const ctx = new FormationContext(fx.symbol, { H1: fx.bars });
    const t = lastTime(fx, H1);
    const start = fx.bars.find((b) => b.low === 23434.34)!;
    const end = fx.bars.find((b) => b.high === 23848.8)!;
    const c = checkFibCandidate(ctx, t, {
      tf: 'H1',
      start: { time: start.time, price: 23434.34 },
      end: { time: end.time, price: 23848.8 },
    });
    expect([state(c, 'FIB-03'), state(c, 'FIB-04'), state(c, 'FIB-08')]).toEqual([M, M, M]);
    // Länge 414,46; Preis(0.382) = 23848,8 − 0,382 × 414,46 = 23690,5
    expect(find(c, 'FIB-08').value).toBeCloseTo(23690.5, 0);
    expect(Math.abs(find(c, 'FIB-08').value! - 23700)).toBeLessThan(halfAtr(ctx, 'H1', t));
  });

  frm('fib-counter-d1-01 und -h4-01 (weicht von der Testliste ab: Ausdehnung nur 0,047): Tages-Impuls 0,89027 → 0,92262 mit Korrektur 0,48, kaum Ausdehnung, Fraktal der H4 in der Zone des Hochs', () => {
    const d1 = loadFixture('fib-counter-d1-01');
    const h4 = loadFixture('fib-counter-h4-01');
    const ctx = new FormationContext('TEST', { D1: d1.bars, H4: h4.bars });
    const t = lastTime(h4, H4);
    const day = analyzeFib(ctx, t).find((a) => a.tf === 'D1')!;
    // Länge 0,03235; Korrektur bis 0,90713: Tiefe (0,92262 − 0,90713)/0,03235 = 0,479; Hoch 0,92414 danach: Ausdehnung 0,047
    expect(day.model.state!.leg.start.price).toBe(0.89027);
    expect(day.model.state!.leg.end.price).toBe(0.92262);
    expect(state(day.candidate, 'FIB-12')).toBe(M);
    expect(find(day.candidate, 'FIB-12').value).toBeCloseTo(0.479, 3);
    expect(state(day.candidate, 'FIB-20')).toBe(N);
    expect(find(day.candidate, 'FIB-20').value).toBeCloseTo(0.047, 3);
    const intraday = analyzeFib(ctx, t).find((a) => a.tf === 'H4')!;
    expect([state(intraday.candidate, 'FIB-29'), state(intraday.candidate, 'FIB-30')]).toEqual([N, M]);
  });
});
