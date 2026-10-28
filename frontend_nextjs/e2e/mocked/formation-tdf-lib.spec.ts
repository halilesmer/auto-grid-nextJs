/**
 * Trendfortsetzung (TDF: Flagge, steigendes Dreieck, Schale, Konsolidierung): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐
 * auf von Hand gerechneten Kerzenreihen. Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts).
 * `zig(punkte, 4, 3)` setzt die Wendepunkte auf Index 2 + 4 × Nummer; 40 ruhige Kerzen davor (LEAD) liefern die Wave (SMA 35), also liegt der
 * k-te Wendepunkt auf Index 42 + 4k.
 *
 * Flagge (Kauf): Start 118 (58), H1 160 (62), C1 146 (66), F1 154 (70), C2 141 (74), danach Anstieg auf 170.
 * Mast = 160 − 118 = 42. Obere Linie durch H1 und F1: 160 − 0,75 je Kerze (Index 76: 149,5); Schluss der Kerze 76 bei 155,5 liegt darüber: Bruch auf 76.
 * Kopie der Linie an C1: 157 − 11 = 146, am Index 74 (Linie 151): 140; C2 liegt 1 daneben, ATR rund 4 (Toleranz 2). Tiefe von C2 = (160 − 141) / 42 = 0,45.
 * Dreieck: H1 160, L1 146, H2 159, L2 150, Anstieg auf 175; Korrektur 14 gegen die vorige 135 − 118 = 17: Verhältnis 0,82.
 * Schale: 160 → 147 (Tief, Tiefe 13 / 42 = 0,31) → 157 → 155 (Henkel über dem 0,5-Level 153,5) → Anstieg.
 * Box: 160, 146, 159, 146,5, 159, 146 (Berührungen oben: 3, unten: 3), Anstieg auf 175.
 * FRM-11 Formationserkennung: Trendfortsetzung
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { checkCdtCandidate } from '../../src/lib/formation/cdtChecks';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeObo } from '../../src/lib/formation/oboChecks';
import type { ContextTimeframe } from '../../src/lib/formation/params';
import { analyzeTdf, checkTdfCandidate, TDF_CHECK_IDS, type TdfPointsInput } from '../../src/lib/formation/tdfChecks';
import type { TdfForm } from '../../src/lib/formation/tdfForms';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, H1, H4, M15, barsOf, mirror, patched, plain, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-11' }, fn);

const STEP = { D1, H4, H1, M15 } as const;
type Tf = keyof typeof STEP;

interface Options {
  tf?: Tf;
  /** Prüfzeitpunkt; Standard: weit nach der Reihe */
  t?: number;
  /** Preis eines Punkts ändern (Dochtspitze verfehlt), nach Name */
  shift?: Record<string, number>;
  /** Reihe ist gespiegelt: Extrem in Trendrichtung ist das Tief */
  down?: boolean;
}

interface Spec {
  form: TdfForm;
  /** Kerzen von H1, dann der Reihe nach c1, f1, c2 (Flagge), l1, h2, l2 (Dreieck), low, handle (Schale); bei der Box nur H1 */
  at: number[];
  tops?: number[];
  bottoms?: number[];
}

/** Prüft die Punkte `spec` auf den Kerzen `rows`; Spitzen = Hoch bzw. Tief je nach Seite */
function run(rows: Row[], spec: Spec, o: Options = {}): Candidate {
  const tf = o.tf ?? 'H4';
  const bars = barsOf(rows, STEP[tf]);
  const ctx = new FormationContext('TEST', { [tf]: bars });
  const high = !o.down;
  const pt = (i: number, es: boolean, name: string): Anchor => ({
    time: bars[i].time,
    price: (es === high ? bars[i].high : bars[i].low) + (o.shift?.[name] ?? 0),
  });
  const [h1, a, b, c] = spec.at;
  const t = o.t ?? 1e9;
  const withTf = tf as ContextTimeframe;
  let input: TdfPointsInput;
  if (spec.form === 'flag') {
    input = { form: 'flag', tf: withTf, h1: pt(h1, true, 'h1'), c1: pt(a, false, 'c1'), f1: pt(b, true, 'f1'), ...(c === undefined ? {} : { c2: pt(c, false, 'c2') }) };
  } else if (spec.form === 'triangle') {
    input = { form: 'triangle', tf: withTf, h1: pt(h1, true, 'h1'), l1: pt(a, false, 'l1'), h2: pt(b, true, 'h2'), ...(c === undefined ? {} : { l2: pt(c, false, 'l2') }) };
  } else if (spec.form === 'bowl') {
    input = { form: 'bowl', tf: withTf, h1: pt(h1, true, 'h1'), low: pt(a, false, 'low'), ...(b === undefined ? {} : { handle: pt(b, false, 'handle') }) };
  } else {
    input = {
      form: 'box',
      tf: withTf,
      h1: pt(h1, true, 'h1'),
      tops: (spec.tops ?? []).map((i) => pt(i, true, 'top')),
      bottoms: (spec.bottoms ?? []).map((i) => pt(i, false, 'bottom')),
    };
  }
  return checkTdfCandidate(ctx, t, input);
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;
const idOf = (n: number) => `TDF-${String(n).padStart(2, '0')}`;

// ---- Reihen ----------------------------------------------------------------------------------------------------

const LEAD: Row[] = Array.from({ length: 40 }, () => plain(100, 100));
const LEAD_HIGH: Row[] = Array.from({ length: 40 }, () => plain(200, 200));
const series = (points: number[], lead: Row[] = LEAD, legs: number | number[] = 4, tail = 3): Row[] => [...lead, ...zig(points, legs, tail)];
/** Kerze `at` wird zur volumenstarken Kerze (Spanne über 1,5 × Mittel): Docht 8 unter dem Körper */
const wide = (rows: Row[], at: number): Row[] => {
  const [o, , , c] = rows[at];
  return patched(rows, at, [o, Math.max(o, c) + 0.1, Math.min(o, c) - 8, c]);
};

/** Wendepunkt-Nummer k (4 Kerzen je Zug) auf dem Index 42 + 4k */
const pv = (k: number) => 42 + 4 * k;
/** Zuglängen: 4 Kerzen je Zug, die Züge `slow` brauchen `n` Kerzen (Zug i läuft vom Wendepunkt i zu i + 1) */
const legs = (count: number, slow: Record<number, number> = {}): number[] => Array.from({ length: count }, (_, i) => slow[i] ?? 4);

// Flagge: Zug 8 (C2 → Anstieg) braucht 8 Kerzen, damit die Kerzen der Pause klein bleiben
const FLAG_UP = [100, 120, 108, 135, 118, 160, 146, 154, 141, 170, 150];
const FLAG_LEGS = legs(10, { 8: 8 });
/** Bruchkerze 77: Schluss 151,8 über der Linie (148,75) */
const FLAG = wide(series(FLAG_UP, LEAD, FLAG_LEGS), 77);
const FLAG_AT = [pv(5), pv(6), pv(7), pv(8)];
const FLAG_SPEC: Spec = { form: 'flag', at: FLAG_AT };
/** Bruchkerze ohne große Spanne */
const FLAG_NARROW = series(FLAG_UP, LEAD, FLAG_LEGS);
/** Die Reihe endet vor der Bruchkerze: nach C2 bleibt der Preis unter der Linie (Schlüsse 144,6 und 148,2 unter 150,25 und 149,5) */
const FLAG_NO_BREAK = FLAG.slice(0, 77);
/** C2 = 110 weit unter dem Mastbeginn: Tiefe 1,19, mehrere Schlüsse unter der Zone von 118 */
const FLAG_DEEP = series([100, 120, 108, 135, 118, 160, 146, 154, 110, 170, 150], LEAD, FLAG_LEGS);
/** C2 = 147: Kopie der Linie liegt bei 140, 7 entfernt; Tiefe 0,31 */
const FLAG_SHALLOW = series([100, 120, 108, 135, 118, 160, 146, 154, 147, 175, 150], LEAD, FLAG_LEGS);
/** F1 = 159 reicht in die Zone von H1 (158,25 bis 160; Dreieck, keine Flagge) */
const FLAG_ZONE = series([100, 120, 108, 135, 118, 160, 146, 159, 141, 170, 150], LEAD, FLAG_LEGS);
/** Eine Kerze zwischen H1 und C1 schließt über der oberen Linie (159,5 über 159,25) */
const FLAG_CLOSED = patched(FLAG, 63, [FLAG[63][0], 159.9, 150, 159.5]);
/** Nach C2 fällt der Preis auf 125: Schluss unter der unteren Linie, danach erst der Anstieg */
const FLAG_COUNTER = series([100, 120, 108, 135, 118, 160, 146, 154, 141, 125, 170, 150]);
/** Vor H1 fällt der Preis: Abwärtstrend, H1 ist ein niedrigeres Hoch */
const FLAG_DOWNTREND = series([200, 150, 180, 140, 162, 150, 158, 148, 175, 160], LEAD_HIGH);
const FLAG_DOWN_AT = [pv(4), pv(5), pv(6), pv(7)];
/** Eine volumenstarke Kerze mitten in der Pause */
const FLAG_BIGPAUSE = wide(FLAG, 68);
/** Nach dem Bruch erreicht der Preis bei 172 eine zweimal getestete Zone zwischen Bruch und Ziel (D = 183) */
const FLAG_FLIP = wide(series([100, 120, 108, 135, 118, 160, 146, 154, 141, 172, 160, 171, 150]), 76);
/** H1 ganz am Anfang: kein Fraktal davor, also kein Mast */
const NOMAST = zig([160, 146, 154, 141, 170, 150], 4, 3);

// Dreieck: Zug 8 (L2 → Anstieg) braucht 8 Kerzen; Schluss über 160 auf Kerze 78
const TRI_LEGS = legs(10, { 8: 8 });
const TRI_POINTS = [100, 120, 108, 135, 118, 160, 146, 159, 150, 175, 160];
const TRI = wide(series(TRI_POINTS, LEAD, TRI_LEGS), 78);
const TRI_AT = [pv(5), pv(6), pv(7), pv(8)];
const TRI_SPEC: Spec = { form: 'triangle', at: TRI_AT };
/** H2 = 155 reicht nicht in die Zone von H1 (Flagge) */
const TRI_LOW_H2 = series([100, 120, 108, 135, 118, 160, 146, 155, 150, 175, 160], LEAD, TRI_LEGS);
/** Der Preis schließt vor H2 über der Zone (163 über 160): neues Hoch per Schluss */
const TRI_CLOSED = series([100, 120, 108, 135, 118, 160, 146, 163, 150, 175, 160], LEAD, TRI_LEGS);
/** L2 = 145 liegt unter L1 = 146 */
const TRI_FALLING = series([100, 120, 108, 135, 118, 160, 146, 159, 145, 175, 160], LEAD, TRI_LEGS);
/** Die Korrektur nach H1 ist 30 tief gegen die vorige 17: Verhältnis 1,76 */
const TRI_DEEP = series([100, 120, 108, 135, 118, 160, 130, 159, 150, 175, 160], LEAD, TRI_LEGS);
/** Kein L2: der Bruch kommt direkt nach H2 */
const TRI_NO_L2 = series([100, 120, 108, 135, 118, 160, 146, 159, 175, 160]);
/** Nach H2 fällt der Preis unter L1 (140) */
const TRI_BELOW = series([100, 120, 108, 135, 118, 160, 146, 159, 140, 175, 160], LEAD, TRI_LEGS);
/** Kein Bruch: die Reihe endet unter der Zone */
const TRI_NO_BREAK = series([100, 120, 108, 135, 118, 160, 146, 159, 150, 155, 152]);
/** Kein vorheriges Hoch vor H1: die vorige Korrektur fehlt (H1 6, L1 10, H2 14, L2 18) */
const TRI_NOPREV = zig([110, 160, 146, 159, 150, 175, 160], 4, 3);

// Schale: die Züge von H1 zum Tief und zum Hoch dauern je 8 Kerzen (kleine Kerzen); H1 62, Tief 70, Hoch 78, Henkel 82, Schluss über 160 auf Kerze 83
const BOWL_LEGS = legs(10, { 5: 8, 6: 8 });
const BOWL = wide(series([100, 120, 108, 135, 118, 160, 147, 158, 156.5, 175, 160], LEAD, BOWL_LEGS), 83);
const BOWL_SPEC: Spec = { form: 'bowl', at: [62, 70, 82] };
/** Tief 141: Tiefe 0,45, also tiefer als das Level 0.382 */
const BOWL_DEEP = series([100, 120, 108, 135, 118, 160, 141, 158, 156.5, 175, 160], LEAD, BOWL_LEGS);
/** Tief 155: Tiefe 0,12, die Schale erreicht 0.236 nicht */
const BOWL_SHALLOW = series([100, 120, 108, 135, 118, 160, 155, 158, 156.5, 175, 160], LEAD, BOWL_LEGS);
/** Henkel 152 liegt unter dem 0,5-Level 153,5 */
const BOWL_LOW_HANDLE = series([100, 120, 108, 135, 118, 160, 147, 158, 152, 175, 160], LEAD, BOWL_LEGS);
/** Eine volumenstarke Kerze in der Pause */
const BOWL_BIG = wide(BOWL, 66);
/** Ohne Vorlauf: Mast fehlt (H1 2, Tief 6, Henkel 14) */
const BOWL_NOMAST = zig([160, 147, 157, 155, 175, 160], 4, 3);

// Box: Zug 10 (Boden → Anstieg) braucht 8 Kerzen; Schluss über 160 auf Kerze 86
const BOX_LEGS = legs(12, { 10: 8 });
const BOX_POINTS = [100, 120, 108, 135, 118, 160, 146, 159, 146.5, 159, 146, 175, 160];
const BOX = wide(series(BOX_POINTS, LEAD, BOX_LEGS), 86);
const BOX_SPEC: Spec = { form: 'box', at: [pv(5)], tops: [pv(7), pv(9)], bottoms: [pv(6), pv(8), pv(10)] };
/** Nur ein Tief unten: eine Berührung */
const BOX_ONE = series([100, 120, 108, 135, 118, 160, 146, 159, 175, 160]);
const BOX_ONE_SPEC: Spec = { form: 'box', at: [pv(5)], tops: [pv(7)], bottoms: [pv(6)] };
/** Nach dem zweiten Hoch schließt der Preis unter dem Boden (143 unter 146) und kommt erst dann nach oben */
const BOX_BREAKDOWN = series([100, 120, 108, 135, 118, 160, 146, 159, 138, 175, 160]);
const BOX_BREAKDOWN_SPEC: Spec = { form: 'box', at: [pv(5)], tops: [pv(7)], bottoms: [pv(6), pv(8)] };
/** Die Box läuft noch: kein Bruch und alle Berührungen da */
const BOX_NO_BREAK = series([100, 120, 108, 135, 118, 160, 146, 159, 146.5, 159, 146, 155, 150]);
/** Box ohne Bruch und mit nur einer Berührung unten */
const BOX_ONE_NO_BREAK = series([100, 120, 108, 135, 118, 160, 146, 159, 150, 155, 152]);

// ---- Fälle -----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  /** erwartete Zustände; nicht genannte Bedingungen werden nicht geprüft */
  expect: Record<string, CheckState>;
}

const CASES: Case[] = [
  {
    name: 'Flagge, Basis: Aufwärtstrend, Mast, zwei Wellen, Kopie der Linie, Schluss über der oberen Linie mit breiter Kerze',
    candidate: () => run(FLAG, FLAG_SPEC),
    expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '10': M, '11': M, '12': M, '13': M, '14': M, '15': N, '28': M },
  },
  { name: 'Regel 01 ☐: vor H1 fällt der Preis', candidate: () => run(FLAG_DOWNTREND, { form: 'flag', at: FLAG_DOWN_AT }), expect: { '01': N, '02': M } },
  { name: 'Regel 02 ☐: der Preis von H1 ist nicht die Dochtspitze eines Fraktals', candidate: () => run(FLAG, FLAG_SPEC, { shift: { h1: 0.5 } }), expect: { '02': N } },
  { name: 'Regel 02 ☐: kein Fraktal davor, also kein Mast', candidate: () => run(NOMAST, { form: 'flag', at: [2, 6, 10, 14] }), expect: { '02': N, '10': N } },
  { name: 'Regel 02 nicht messbar: H1 hat noch keine zwei Kerzen rechts', candidate: () => run(BOWL.slice(0, 64), { form: 'bowl', at: [62, 63] }), expect: { '02': U } },
  { name: 'Regel 03 ☐: eine volumenstarke Kerze in der Pause', candidate: () => run(FLAG_BIGPAUSE, FLAG_SPEC), expect: { '03': N } },
  { name: 'Regel 03 nicht messbar: die Volumenmessung braucht 20 Kerzen Vorlauf', candidate: () => run(NOMAST, { form: 'flag', at: [2, 6, 10, 14] }), expect: { '03': U } },
  { name: 'Regel 04 ☐: kein Schluss über der oberen Linie', candidate: () => run(FLAG_NO_BREAK, FLAG_SPEC), expect: { '04': N, '05': N } },
  { name: 'Regel 04 nicht messbar: das zweite Tief fehlt noch', candidate: () => run(FLAG, { form: 'flag', at: FLAG_AT.slice(0, 3) }), expect: { '04': U } },
  { name: 'Regel 05 ☐: die Bruchkerze ist klein', candidate: () => run(FLAG_NARROW, FLAG_SPEC), expect: { '04': M, '05': N } },
  {
    name: 'Regel 06 ☑: zwei Schlüsse unter der Zone des Mastbeginns, der Trend hat gedreht',
    candidate: () => run(FLAG_DEEP, FLAG_SPEC),
    expect: { '06': M, '07': M },
  },
  { name: 'Regel 06 nicht messbar: kein Mastbeginn', candidate: () => run(NOMAST, { form: 'flag', at: [2, 6, 10, 14] }), expect: { '06': U, '07': U } },
  { name: 'Regel 07 ☑: die Pause läuft tiefer als 0.618 (Harmonik)', candidate: () => run(FLAG_DEEP, FLAG_SPEC), expect: { '07': M } },
  { name: 'Regel 08 ☑: Zeiteinheit M15', candidate: () => run(FLAG, FLAG_SPEC, { tf: 'M15' }), expect: { '08': M } },
  { name: 'Regel 09 ☐: zwischen Bruch und Ziel liegt eine getestete Zone', candidate: () => run(FLAG_FLIP, FLAG_SPEC), expect: { '09': N } },
  { name: 'Regel 09 nicht messbar: kein Bruch', candidate: () => run(FLAG_NO_BREAK, FLAG_SPEC), expect: { '09': U } },
  { name: 'Regel 11 ☐: F1 reicht in die Zone von H1', candidate: () => run(FLAG_ZONE, FLAG_SPEC), expect: { '11': N } },
  { name: 'Regel 11 nicht messbar: die zweite Welle fehlt', candidate: () => run(FLAG, { form: 'flag', at: FLAG_AT.slice(0, 3) }), expect: { '11': U } },
  { name: 'Regel 12 ☐: die Kopie der Linie liegt 7 vom zweiten Tief', candidate: () => run(FLAG_SHALLOW, FLAG_SPEC), expect: { '12': N } },
  { name: 'Regel 12 nicht messbar: das zweite Tief fehlt', candidate: () => run(FLAG, { form: 'flag', at: FLAG_AT.slice(0, 3) }), expect: { '12': U } },
  { name: 'Regel 13 ☐: eine Kerze schließt vor F1 über der oberen Linie', candidate: () => run(FLAG_CLOSED, FLAG_SPEC), expect: { '13': N } },
  { name: 'Regel 14 ☐: das Ende der Flagge liegt bei 0,31', candidate: () => run(FLAG_SHALLOW, FLAG_SPEC), expect: { '14': N } },
  { name: 'Regel 15 ☑: Schluss unter der unteren Linie vor dem Ausbruch', candidate: () => run(FLAG_COUNTER, FLAG_SPEC), expect: { '15': M } },
  { name: 'Regel 15 nicht messbar: das zweite Tief fehlt', candidate: () => run(FLAG, { form: 'flag', at: FLAG_AT.slice(0, 3) }), expect: { '15': U, '28': U } },
  {
    name: 'Dreieck, Basis: zweiter Anlauf an die Zone von H1, steigende Tiefs, Korrektur wie die vorige, Schluss über der Oberkante',
    candidate: () => run(TRI, TRI_SPEC),
    expect: { '01': M, '02': M, '04': M, '05': M, '16': M, '17': M, '18': M, '19': U, '20': N, '28': M, '10': U, '24': U },
  },
  { name: 'Regel 16 ☐: H2 reicht nicht in die Zone von H1', candidate: () => run(TRI_LOW_H2, TRI_SPEC), expect: { '16': N } },
  { name: 'Regel 16 ☐: vor H2 schließt eine Kerze über der Zone', candidate: () => run(TRI_CLOSED, TRI_SPEC), expect: { '16': N } },
  { name: 'Regel 16 nicht messbar: H2 hat noch keine zwei Kerzen rechts', candidate: () => run(TRI.slice(0, pv(7) + 2), { form: 'triangle', at: [pv(5), pv(6), pv(7)] }), expect: { '16': U } },
  { name: 'Regel 17 ☐: das Tief nach H2 liegt unter dem Tief nach H1', candidate: () => run(TRI_FALLING, TRI_SPEC), expect: { '17': N } },
  { name: 'Regel 17 nicht messbar: noch kein Tief nach H2', candidate: () => run(TRI_NO_L2, { form: 'triangle', at: TRI_AT.slice(0, 3) }), expect: { '17': U } },
  { name: 'Regel 18 ☐: die Korrektur ist 1,76 mal so tief wie die vorige', candidate: () => run(TRI_DEEP, TRI_SPEC), expect: { '18': N } },
  { name: 'Regel 18 nicht messbar: es gibt keine vorige Korrektur', candidate: () => run(TRI_NOPREV, { form: 'triangle', at: [6, 10, 14, 18] }), expect: { '18': U } },
  { name: 'Regel 20 ☑: nach H2 fällt der Preis unter das Tief nach H1', candidate: () => run(TRI_BELOW, TRI_SPEC), expect: { '20': M, '17': N } },
  { name: 'Regel 28 ☐: kein Tief nach H2 vor dem Bruch', candidate: () => run(TRI_NO_L2, { form: 'triangle', at: TRI_AT.slice(0, 3) }), expect: { '28': N } },
  { name: 'Regel 28 nicht messbar: kein Tief nach H2 und noch kein Bruch', candidate: () => run(TRI_NO_BREAK, { form: 'triangle', at: TRI_AT.slice(0, 3) }), expect: { '28': U } },
  { name: 'Regel 04 ☐ beim Dreieck: kein Bruch', candidate: () => run(TRI_NO_BREAK, TRI_SPEC), expect: { '04': N } },
  {
    name: 'Schale, Basis: Wende zwischen 0.236 und 0.382, kleine Kerzen, Henkel über dem 0,5-Level, Schluss über der Zone von H1',
    candidate: () => run(BOWL, BOWL_SPEC),
    expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '21': M, '22': M, '23': M },
  },
  { name: 'Regel 21 ☐: die Schale läuft bis 0.45 und berührt 0.382', candidate: () => run(BOWL_DEEP, BOWL_SPEC), expect: { '21': N } },
  { name: 'Regel 21 ☐: die Schale erreicht 0.236 nicht', candidate: () => run(BOWL_SHALLOW, BOWL_SPEC), expect: { '21': N } },
  { name: 'Regel 21 nicht messbar: ohne Mast gibt es keine Tiefe', candidate: () => run(BOWL_NOMAST, { form: 'bowl', at: [2, 6, 14] }), expect: { '21': U } },
  { name: 'Regel 22 ☐: eine volumenstarke Kerze in der Schale', candidate: () => run(BOWL_BIG, BOWL_SPEC), expect: { '22': N, '03': N } },
  { name: 'Regel 23 ☐: der Henkel fällt unter das 0,5-Level', candidate: () => run(BOWL_LOW_HANDLE, BOWL_SPEC), expect: { '23': N } },
  { name: 'Regel 23 ☐: kein Henkel und der Ausbruch ist da', candidate: () => run(BOWL, { form: 'bowl', at: [62, 70] }), expect: { '23': N } },
  { name: 'Regel 23 nicht messbar: kein Henkel und noch kein Ausbruch', candidate: () => run(BOWL.slice(0, 83), { form: 'bowl', at: [62, 70] }), expect: { '23': U } },
  {
    name: 'Box, Basis: drei Berührungen oben und unten, Schluss über der Oberkante',
    candidate: () => run(BOX, BOX_SPEC),
    expect: { '01': M, '02': M, '04': M, '05': M, '24': M, '25': N, '26': U, '29': M },
  },
  { name: 'Regel 24 ☐: nur eine Berührung unten, der Ausbruch ist da', candidate: () => run(BOX_ONE, BOX_ONE_SPEC), expect: { '24': N, '29': N } },
  { name: 'Regel 24 nicht messbar: nur eine Berührung unten, noch kein Ausbruch', candidate: () => run(BOX_ONE_NO_BREAK, BOX_ONE_SPEC), expect: { '24': U, '29': U } },
  { name: 'Regel 25 ☑: Schluss unter dem Boden, bevor die Box nach oben bricht', candidate: () => run(BOX_BREAKDOWN, BOX_BREAKDOWN_SPEC), expect: { '25': M } },
  { name: 'Regel 04 ☐ bei der Box: kein Bruch', candidate: () => run(BOX_NO_BREAK, BOX_SPEC), expect: { '04': N } },
];

for (const c of CASES) {
  frm(c.name, () => {
    const cand = c.candidate();
    for (const [n, want] of Object.entries(c.expect)) expect(state(cand, idOf(Number(n))), idOf(Number(n))).toBe(want);
  });
}

const ALWAYS_UNMEASURABLE = ['TDF-19', 'TDF-26'];

frm('Abdeckung: jede messbare Bedingung hat einen ☑- und einen ☐-Fall; die Einstiegsregeln 19 und 26 sind nie messbar', () => {
  const seen = new Map<string, Set<CheckState>>();
  for (const c of CASES) for (const [n, want] of Object.entries(c.expect)) seen.set(idOf(Number(n)), (seen.get(idOf(Number(n))) ?? new Set()).add(want));
  expect(TDF_CHECK_IDS).toHaveLength(28);
  for (const id of TDF_CHECK_IDS) {
    if (ALWAYS_UNMEASURABLE.includes(id)) {
      expect([...(seen.get(id) ?? [])], id).toEqual([U]);
      continue;
    }
    expect(seen.get(id)?.has(M), `${id} ☑`).toBe(true);
    expect(seen.get(id)?.has(N), `${id} ☐`).toBe(true);
  }
});

frm('Werte: Mast, Tiefe der Flagge, Verhältnis der Korrekturen und Tiefe der Schale aus der Handrechnung', () => {
  const flag = run(FLAG, FLAG_SPEC);
  expect(find(flag, 'TDF-10').value).toBeCloseTo(42, 5);
  expect(find(flag, 'TDF-14').value).toBeCloseTo((160.1 - 140.9) / 42.1, 2);
  expect(find(run(TRI, TRI_SPEC), 'TDF-18').value).toBeCloseTo(14 / 17, 1);
  expect(find(run(BOWL, BOWL_SPEC), 'TDF-21').value).toBeCloseTo((160.1 - 146.9) / 42.1, 2);
});

frm('Urteil: gültig, im Aufbau ohne Bruch, ungültig bei Ausschluss und fehlender Pflicht', () => {
  expect(run(FLAG, FLAG_SPEC).verdict).toBe('valid');
  expect(run(TRI, TRI_SPEC).verdict).toBe('valid');
  expect(run(BOWL, BOWL_SPEC).verdict).toBe('valid');
  expect(run(BOX, BOX_SPEC).verdict).toBe('valid');
  expect(run(FLAG_NO_BREAK, FLAG_SPEC).verdict).toBe('forming');
  expect(run(FLAG, { form: 'flag', at: FLAG_AT.slice(0, 3) }).verdict).toBe('forming');
  expect(run(TRI_NO_BREAK, TRI_SPEC).verdict).toBe('forming');
  expect(run(BOX_NO_BREAK, BOX_SPEC).verdict).toBe('forming');
  expect(run(FLAG_NARROW, FLAG_SPEC).verdict).toBe('invalid');
  expect(run(FLAG_DEEP, FLAG_SPEC).verdict).toBe('invalid');
  expect(run(FLAG, FLAG_SPEC, { tf: 'M15' }).verdict).toBe('invalid');
  expect(run(FLAG_COUNTER, FLAG_SPEC).verdict).toBe('invalid');
  expect(run(FLAG_ZONE, FLAG_SPEC).verdict).toBe('invalid');
  expect(run(TRI_BELOW, TRI_SPEC).verdict).toBe('invalid');
  expect(run(BOWL_DEEP, BOWL_SPEC).verdict).toBe('invalid');
  expect(run(BOWL_BIG, BOWL_SPEC).verdict).toBe('invalid');
  expect(run(BOX_ONE, BOX_ONE_SPEC).verdict).toBe('invalid');
  expect(run(BOX_BREAKDOWN, BOX_BREAKDOWN_SPEC).verdict).toBe('invalid');
  expect(run(FLAG_DOWNTREND, { form: 'flag', at: FLAG_DOWN_AT }).verdict).toBe('invalid');
});

frm('Spiegelfall: Abwärtstrend (Verkauf) hat dieselben Zustände wie Aufwärtstrend (Kauf), nur die Seite wechselt', () => {
  const cases: [string, Row[], Spec][] = [
    ['Flagge', FLAG, FLAG_SPEC],
    ['Flagge ohne Bruch', FLAG_NO_BREAK, FLAG_SPEC],
    ['Flagge zu tief', FLAG_DEEP, FLAG_SPEC],
    ['Flagge mit Gegenbruch', FLAG_COUNTER, FLAG_SPEC],
    ['Dreieck', TRI, TRI_SPEC],
    ['Dreieck fällt unter L1', TRI_BELOW, TRI_SPEC],
    ['Schale', BOWL, BOWL_SPEC],
    ['Schale mit tiefem Henkel', BOWL_LOW_HANDLE, BOWL_SPEC],
    ['Box', BOX, BOX_SPEC],
    ['Box mit Gegenbruch', BOX_BREAKDOWN, BOX_BREAKDOWN_SPEC],
  ];
  for (const [name, rows, spec] of cases) {
    const up = run(rows, spec);
    const down = run(mirror(rows), spec, { down: true });
    expect(up.side, name).toBe('buy');
    expect(down.side, name).toBe('sell');
    expect(down.checks.map((c) => `${c.id}:${c.state}`), name).toEqual(up.checks.map((c) => `${c.id}:${c.state}`));
    expect(down.verdict, name).toBe(up.verdict);
  }
});

frm('Zeitpunkt: die Prüfung bis zur Kerze vor dem Bruch ist im Aufbau und bleibt gleich, wenn spätere Kerzen anders aussehen', () => {
  const t = (idx: number) => (idx + 1) * H4;
  const early = run(FLAG, FLAG_SPEC, { t: t(76) });
  expect(early.verdict).toBe('forming');
  expect(state(early, 'TDF-04')).toBe(N);
  const wild = FLAG.map((r, i): Row => (i > 76 ? [r[0] + 40, r[1] + 41, r[2] + 39, r[3] + 40] : r));
  expect(JSON.stringify(run(wild, FLAG_SPEC, { t: t(76) }))).toBe(JSON.stringify(early));
  expect(JSON.stringify(run(FLAG.slice(0, 77), FLAG_SPEC, { t: 1e9 }))).toBe(JSON.stringify(early));
  expect(run(FLAG, FLAG_SPEC, { t: t(77) }).verdict).toBe('valid');
});

frm('Abgrenzung Flagge und Dreieck: F1 unter der Zone von H1 ist eine Flagge, H2 in der Zone ein Dreieck; die Suche bietet nur die passende Unterform an', () => {
  const flag = analyzeTdf(new FormationContext('TEST', { H4: barsOf(FLAG, H4) }), 1e9)[0];
  const tri = analyzeTdf(new FormationContext('TEST', { H4: barsOf(TRI, H4) }), 1e9)[0];
  expect(flag.forms.find((f) => f.form === 'flag')?.candidate.verdict).toBe('valid');
  expect(tri.forms.find((f) => f.form === 'triangle')?.candidate.verdict).toBe('valid');
  // Mit F1 in der Zone von H1 ist die Flagge nach Regel 11 ungültig
  expect(run(FLAG_ZONE, FLAG_SPEC).verdict).toBe('invalid');
  // Und ein Dreieck mit H2 unter der Zone ist nach Regel 16 ungültig
  expect(run(TRI_LOW_H2, TRI_SPEC).verdict).toBe('invalid');
});

frm('Abgrenzung Schale und Flagge: die Wende vor 0.382 ist eine Schale, tiefer ist es keine Schale mehr', () => {
  expect(state(run(BOWL, BOWL_SPEC), 'TDF-21')).toBe(M);
  expect(state(run(BOWL_DEEP, BOWL_SPEC), 'TDF-21')).toBe(N);
  // Die Flagge liegt im Bereich 0.382 bis 0.5
  expect(state(run(FLAG, FLAG_SPEC), 'TDF-14')).toBe(M);
});

frm('Abgrenzung Harmonik: eine Pause tiefer als 0.618 schließt die Trendfortsetzung aus (Regel 07)', () => {
  const deep = run(FLAG_DEEP, FLAG_SPEC);
  expect(state(deep, 'TDF-07')).toBe(M);
  expect(deep.verdict).toBe('invalid');
});

frm('Abgrenzung Doppeltop: dieselben Kerzen mit einem Fall unter das Tief zwischen H1 und H2 sind ein Doppeltop (CDT), kein Dreieck', () => {
  expect(state(run(TRI_BELOW, TRI_SPEC), 'TDF-20')).toBe(M);
  expect(run(TRI_BELOW, TRI_SPEC).verdict).toBe('invalid');
  const bars = barsOf(TRI_BELOW, H4);
  const cdt = checkCdtCandidate(new FormationContext('TEST', { H4: bars }), 1e9, {
    tf: 'H4',
    h1: { time: bars[pv(5)].time, price: bars[pv(5)].high },
    n: { time: bars[pv(6)].time, price: bars[pv(6)].low },
    h2: { time: bars[pv(7)].time, price: bars[pv(7)].high },
  });
  expect(cdt.checks.find((c) => c.id === 'CDT-05')?.state).toBe(M);
});

frm('Abgrenzung Kopf-Schulter: eine Kopf-Schulter-Reihe liefert keine gültige Trendfortsetzung', () => {
  const base = series([100, 120, 108, 135, 120, 150, 121, 136, 110]);
  const rows = patched(base, 73, [base[73][0], base[73][0] + 0.1, 108, 116.5]);
  expect(analyzeObo(new FormationContext('TEST', { H4: barsOf(rows, H4) }), 1e9)[0].candidate.verdict).toBe('valid');
  const tdf = analyzeTdf(new FormationContext('TEST', { H4: barsOf(rows, H4) }), 1e9)[0];
  expect(tdf.forms.filter((f) => f.candidate.verdict === 'valid')).toEqual([]);
});

frm('Zeichnungen: Flagge hat obere Linie, Kopie und Mast; Dreieck Zone und Unterstützungslinie; Ziel erst nach dem Bruch', () => {
  const flag = run(FLAG, FLAG_SPEC);
  expect(flag.drawings.map((d) => d.id)).toEqual(['Z-TDF-01a', 'Z-TDF-01b', 'Z-TDF-02', 'Z-TDF-06', 'Z-TDF-03', 'Z-TDF-09']);
  const tri = run(TRI, TRI_SPEC);
  expect(tri.drawings.map((d) => d.id)).toEqual(['Z-TDF-04', 'Z-TDF-05', 'Z-TDF-06', 'Z-TDF-03', 'Z-TDF-10', 'Z-TDF-09']);
  expect(run(BOX, BOX_SPEC).drawings.map((d) => d.id)).toContain('Z-TDF-08');
  expect(run(BOWL, BOWL_SPEC).drawings.map((d) => d.id)).toContain('Z-TDF-07');
  const forming = run(FLAG_NO_BREAK, FLAG_SPEC).drawings.map((d) => d.id);
  expect(forming).not.toContain('Z-TDF-09');
  // Mastprojektion D = tiefstes Tief der Pause + Mast = 141 + 42 = 183 (Docht des Tiefs liegt 0,1 tiefer)
  const target = flag.drawings.find((d) => d.id === 'Z-TDF-09')!.anchors[0].price;
  expect(target).toBeCloseTo(140.9 + 42.1, 0);
  for (const c of [flag, tri]) for (const cc of c.checks) for (const d of cc.drawings) expect(c.drawings.map((x) => x.id)).toContain(d);
});

frm('analyzeTdf: sucht die Punkte selbst; Kauf nach Hochs, Verkauf nach Tiefs; Kontext mit mehreren Zeiteinheiten bleibt je Zeiteinheit getrennt', () => {
  const up = analyzeTdf(new FormationContext('TEST', { H4: barsOf(FLAG, H4) }), 1e9);
  expect(up).toHaveLength(1);
  expect(up[0].tf).toBe('H4');
  const flag = up[0].forms.find((f) => f.form === 'flag')!.candidate;
  expect(flag.code).toBe('TDF');
  expect(flag.side).toBe('buy');
  expect(flag.verdict).toBe('valid');
  expect(Object.keys(flag.points)).toEqual(['H1', 'S', 'C1', 'F1', 'C2', 'B']);
  expect(flag.points.H1.time).toBe(pv(5) * H4);
  expect(flag.points.B.time).toBe(77 * H4);
  const down = analyzeTdf(new FormationContext('TEST', { H4: barsOf(mirror(FLAG), H4), D1: barsOf(FLAG, D1) }), 1e9);
  expect(down.map((x) => x.tf)).toEqual(['D1', 'H4']);
  expect(down[1].forms.find((f) => f.form === 'flag')?.candidate.side).toBe('sell');
  expect(down[0].forms.find((f) => f.form === 'flag')?.candidate.side).toBe('buy');
});

frm('analyzeTdf: Dreieck, Schale und Box werden selbst gefunden', () => {
  const pick = (rows: Row[], form: TdfForm) => analyzeTdf(new FormationContext('TEST', { H4: barsOf(rows, H4) }), 1e9)[0].forms.find((f) => f.form === form)?.candidate;
  expect(pick(TRI, 'triangle')?.verdict).toBe('valid');
  expect(pick(BOWL, 'bowl')?.verdict).toBe('valid');
  expect(pick(BOX, 'box')?.verdict).toBe('valid');
});

frm('analyzeTdf: ruhige Reihe und fehlender Kontext liefern nichts Gültiges', () => {
  expect(analyzeTdf(new FormationContext('TEST', {}), 1e9)).toEqual([]);
  const flat = analyzeTdf(new FormationContext('TEST', { H4: barsOf(LEAD, H4) }), 1e9)[0];
  expect(flat.forms.filter((f) => f.candidate.verdict === 'valid')).toEqual([]);
});

frm('checkTdfCandidate: falsche Reihenfolge oder nicht geladene Kerze ergibt nicht messbar', () => {
  const bars = barsOf(FLAG, H4);
  const ctx = new FormationContext('TEST', { H4: bars });
  const a = (i: number, price: number): Anchor => ({ time: bars[i].time, price });
  const swapped = checkTdfCandidate(ctx, 1e9, { form: 'flag', tf: 'H4', h1: a(66, 146), c1: a(62, 160), f1: a(70, 154) });
  expect(swapped.checks.every((k) => k.state === U)).toBe(true);
  const missing = checkTdfCandidate(ctx, 1e9, { form: 'flag', tf: 'H1', h1: a(62, 160), c1: a(66, 146), f1: a(70, 154) });
  expect(missing.checks.every((k) => k.state === U)).toBe(true);
  const noFloor = checkTdfCandidate(ctx, 1e9, { form: 'box', tf: 'H4', h1: a(62, 160), bottoms: [] });
  expect(noFloor.checks.every((k) => k.state === U)).toBe(true);
});

// ---- Echte Kerzenreihen ----------------------------------------------------------------------------------------

const loadReal = (file: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')));

interface Real {
  file: string;
  /** Prüfzeitpunkt t (MT5-Sekunden) */
  t: number;
  form: TdfForm;
  side: 'sell' | 'buy';
  verdict: Candidate['verdict'];
  /** Kerzenbeginn der Punkte (Name wie in `Candidate.points`) */
  points: Record<string, number>;
  expect: Record<string, CheckState>;
}

const REAL: Real[] = [
  // Aufwärtsflagge EURJPY: Mast 2,76; die Kopie der Linie liegt nicht parallel (12 ☐), das Ende liegt tiefer als 0.5 (14 ☐)
  { file: 'tdf-flag-h4-01', t: 1766721600, form: 'flag', side: 'buy', verdict: 'valid', points: { H1: 1766390400, S: 1766102400, C1: 1766476800, F1: 1766534400, C2: 1766592000, B: 1766707200 }, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '07': N, '08': N, '09': N, '10': M, '11': M, '12': N, '13': M, '14': N, '15': N, '28': M } },
  // Abwärtsflagge EURJPY; Pause nicht ruhig (03 ☐), Ende zwischen 0.382 und 0.5 (14 ☑)
  { file: 'tdf-flag-h4-02', t: 1769716800, form: 'flag', side: 'sell', verdict: 'valid', points: { H1: 1769428800, S: 1769155200, C1: 1769500800, F1: 1769601600, C2: 1769673600, B: 1769702400 }, expect: { '01': M, '02': M, '03': N, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '10': M, '11': M, '12': N, '13': M, '14': M, '15': N, '28': M } },
  // Steigendes Dreieck NZDUSD, Korrektur wie die vorige (18 ☑)
  { file: 'tdf-tri-h4-01', t: 1769644800, form: 'triangle', side: 'buy', verdict: 'valid', points: { H1: 1769544000, S: 1769500800, L1: 1769572800, H2: 1769587200, L2: 1769601600, B: 1769630400 }, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '16': M, '17': M, '18': M, '20': N, '28': M } },
  // Steigendes Dreieck EURUSD, Korrektur 1,7 mal so tief wie die vorige (18 ☐)
  { file: 'tdf-tri-h4-02', t: 1765900800, form: 'triangle', side: 'buy', verdict: 'valid', points: { H1: 1765468800, S: 1765440000, L1: 1765540800, H2: 1765814400, L2: 1765828800, B: 1765886400 }, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '16': M, '17': M, '18': N, '20': N, '28': M } },
  // Umgekehrte Schale USDCAD (Verkauf), kein Henkel
  { file: 'tdf-bowl-h4-01', t: 1768910400, form: 'bowl', side: 'sell', verdict: 'valid', points: { H1: 1768838400, S: 1768593600, LOW: 1768867200, B: 1768881600 }, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '21': M, '22': M, '23': N } },
  // Schale EURUSD (Kauf), kein Henkel
  { file: 'tdf-bowl-h4-02', t: 1765468800, form: 'bowl', side: 'buy', verdict: 'valid', points: { H1: 1765411200, S: 1765296000, LOW: 1765425600, B: 1765454400 }, expect: { '01': M, '02': M, '03': M, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '21': M, '22': M, '23': N } },
  // Box EURGBP (Verkauf): dieselbe Pause lesen auch Dreieck und Schale
  { file: 'tdf-box-h4-01', t: 1772812800, form: 'box', side: 'sell', verdict: 'valid', points: { H1: 1772582400, S: 1772524800, FLOOR: 1772611200, B: 1772798400 }, expect: { '01': M, '02': M, '03': N, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '24': M, '25': N, '29': M } },
  // Negativ: Pause tiefer als 0.618 (07 ☑), gehört zur Harmonik; noch kein Bruch
  { file: 'tdf-bad-h4-01', t: 1763985600, form: 'flag', side: 'buy', verdict: 'invalid', points: { H1: 1763654400, S: 1763524800, C1: 1763740800, F1: 1763942400 }, expect: { '01': M, '02': M, '03': N, '06': N, '07': M, '08': N, '10': M, '13': M, '14': N } },
  // Negativ: Dreieck, H2 erreicht die Zone nicht (16 ☐)
  { file: 'tdf-bad-h4-02', t: 1762747200, form: 'triangle', side: 'sell', verdict: 'invalid', points: { H1: 1762185600, S: 1762142400, L1: 1762200000, H2: 1762300800, B: 1762315200 }, expect: { '01': M, '02': M, '03': N, '04': M, '05': M, '06': N, '07': N, '08': N, '09': M, '16': N, '18': N, '20': N, '28': N } },
];

for (const r of REAL) {
  frm(`echte Reihe ${r.file} (${r.form}) bei t=${r.t}`, () => {
    const fx = loadReal(r.file);
    const known = fx.bars.filter((b) => b.time + H4 <= r.t);
    const pick = (bars: typeof known) => analyzeTdf(new FormationContext(fx.symbol, { H4: bars }), r.t)[0].forms.find((f) => f.form === r.form)!.candidate;
    const c = pick(known);
    expect(c.side).toBe(r.side);
    expect(c.verdict).toBe(r.verdict);
    expect(Object.fromEntries(Object.entries(c.points).map(([k, v]) => [k, v.time]))).toEqual(r.points);
    for (const [n, want] of Object.entries(r.expect)) expect(state(c, idOf(Number(n))), idOf(Number(n))).toBe(want);
    // Kein Blick in die Zukunft: mit allen Kerzen der Datei und gleichem t derselbe Befund
    const full = pick(fx.bars);
    expect(full.checks.map((x) => [x.id, x.state])).toEqual(c.checks.map((x) => [x.id, x.state]));
    expect(full.verdict).toBe(c.verdict);
  });
}

frm('echte Reihen: Kauf und Verkauf, alle vier Unterformen und ein Negativfall sind abgedeckt', () => {
  expect(new Set(REAL.map((r) => r.form))).toEqual(new Set(['flag', 'triangle', 'bowl', 'box']));
  expect(new Set(REAL.map((r) => r.side))).toEqual(new Set(['buy', 'sell']));
  expect(REAL.some((r) => r.verdict === 'invalid')).toBe(true);
});
