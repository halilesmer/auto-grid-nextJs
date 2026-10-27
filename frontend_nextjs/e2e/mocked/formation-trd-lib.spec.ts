/**
 * Trend (TRD): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close]. `zig` baut aus Wendepunkt-Preisen eine Reihe: Der Wendepunkt ist
 * genau das Dochtende (Hoch bzw. Tief) einer Kerze, dazwischen laufen die Schlusskurse linear (4 Kerzen je Zug);
 * die Zuglängen sind daher die Differenzen der angegebenen Preise.
 * FRM-03 Formationserkennung: Trend
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { buildTrend } from '../../src/lib/formation/trd';
import { parseFixture } from '../../src/lib/formation/fixture';
import { TRD_CHECK_IDS, TRD_UNMEASURABLE_IDS, analyzeTrd, checkTrdCandidate, type TrdOptions } from '../../src/lib/formation/trdChecks';
import type { Candidate, CheckState, FormationBar } from '../../src/lib/formation/types';
import type { ZoneSide } from '../../src/lib/formation/frz';

type Row = [number, number, number, number];

const H4 = 14400;
const D1 = 86400;
const END = 100_000_000;

const barsOf = (rows: Row[], step = H4, start = 0): FormationBar[] =>
  rows.map(([open, high, low, close], i) => ({ time: start + i * step, open, high, low, close }));

const plain = (o: number, c: number): Row => [o, Math.max(o, c) + 0.1, Math.min(o, c) - 0.1, c];
const flat = (c: number): Row => [c, c + 1, c - 1, c];
/** Jede Kerze 3 höher als die vorige: kein Fraktal */
const CLIMB: Row[] = Array.from({ length: 10 }, (_, i) => plain(100 + 3 * i, 103 + 3 * i));
const mirror = (rows: Row[]): Row[] => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c]);

/** Fortsetzung einer Reihe: Schlusskurse, jede Kerze öffnet beim Schluss der vorigen */
const walk = (from: number, closes: number[]): Row[] => closes.map((c, i): Row => plain(i === 0 ? from : closes[i - 1], c));

/**
 * Wendepunkte als Preise (Dochtende). Zwei Vorlaufkerzen, dann der erste Wendepunkt auf Index 2; der k-te
 * Wendepunkt liegt auf Index 2 + Summe der Zuglängen davor. Am Ende `tail` Kerzen, die 0,5 je Kerze zurücklaufen.
 */
function zig(points: number[], legs: number | number[] = 4, tail = 3): Row[] {
  const legLen = (i: number) => (Array.isArray(legs) ? legs[i] : legs);
  const isHigh = (k: number) => (k + 1 < points.length ? points[k + 1] < points[k] : points[k - 1] < points[k]);
  const pivotRow = (prev: number, p: number, high: boolean): Row => {
    const c = high ? p - 0.2 : p + 0.2;
    return high ? [prev, p, Math.min(prev, c) - 0.1, c] : [prev, Math.max(prev, c) + 0.1, p, c];
  };
  const s = isHigh(0) ? -1 : 1;
  const rows: Row[] = [plain(points[0] + s * 2.2, points[0] + s * 2), plain(points[0] + s * 2, points[0] + s)];
  rows.push(pivotRow(points[0] + s, points[0], isHigh(0)));
  for (let k = 1; k < points.length; k++) {
    const from = points[k - 1];
    const to = points[k];
    const n = legLen(k - 1);
    let prev = rows[rows.length - 1][3];
    for (let j = 1; j < n; j++) {
      const c = from + ((to - from) * j) / n;
      rows.push(plain(prev, c));
      prev = c;
    }
    rows.push(pivotRow(prev, to, isHigh(k)));
  }
  const last = rows[rows.length - 1][3];
  const dir = isHigh(points.length - 1) ? -1 : 1;
  for (let j = 1; j <= tail; j++) rows.push(plain(j === 1 ? last : last + dir * 0.5 * (j - 1), last + dir * 0.5 * j));
  return rows;
}

const patched = (rows: Row[], at: number, row: Row): Row[] => rows.map((r, i) => (i === at ? row : r));

const ctxOf = (rows: Row[], extra: ContextInput = {}) => new FormationContext('TEST', { H4: barsOf(rows), ...extra });

function run(rows: Row[], options: TrdOptions = {}, extra: ContextInput = {}, tf: 'D1' | 'H4' = 'H4'): Candidate {
  const found = analyzeTrd(ctxOf(rows, extra), END, options).find((a) => a.tf === tf);
  if (!found) throw new Error(`keine Zeiteinheit ${tf}`);
  return found.candidate;
}

function point(rows: Row[], index: number, side: ZoneSide, extra: ContextInput = {}): Candidate {
  return checkTrdCandidate(ctxOf(rows, extra), END, { tf: 'H4', side, time: index * H4 });
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

// ---- Reihen ---------------------------------------------------------------------------------------------------

/** Wendepunkte 100 T@2, 120 H@6, 110 T@10, 135 H@14, 124 T@18, 150 H@22; Korrekturen 10 und 11, Impulse 20, 25, 26 */
const UP3 = zig([100, 120, 110, 135, 124, 150]);
/** Erste Korrektur nach dem Start */
const FIRST_CORR = zig([100, 120, 110]);
/** Korrektur 4 von Referenz 10: Verhältnis 0,4 → keine eigene Welle (letztes Fraktal 131 wird nicht gezeichnet) */
const FOLD_SMALL = zig([100, 120, 110, 135, 131]);
/** Korrektur 6 von Referenz 10: Verhältnis 0,6 liegt im Zwischenbereich */
const FOLD_GAP = zig([100, 120, 110, 135, 129]);
/** Welle 20 nach Korrektur 25 */
const SHORT_WAVE = zig([100, 130, 105, 125]);
/** Korrekturen 25 und 20 (0,8), Impulse 30, 30, 25 */
const SHRINK = zig([100, 130, 105, 135, 115, 140]);
/** Korrekturen 10 und 14 (1,4) */
const WIDE_CORR = zig([100, 120, 110, 135, 121, 150]);
/** Gleich lange Züge: die neue Linie fällt mit der alten zusammen */
const EVEN = zig([100, 125, 110, 135, 120, 145]);
/** Aufwärtstrend, dann zwei Schlüsse unter 122 (Tief der letzten Korrektur) → Wechsel nach unten */
const FLIP_DOWN = zig([100, 120, 110, 135, 122, 133, 105]);
/** Nach dem Wechsel Rücklauf auf 123 (über 122), danach tieferes Tief 100 */
const FLIP_LOWER_LOW = zig([100, 120, 110, 135, 122, 133, 105, 123, 100]);
/** Wie oben, das zweite Tief 108 liegt über 105 */
const FLIP_HIGHER_LOW = zig([100, 120, 110, 135, 122, 133, 105, 123, 108]);
/**
 * Aufwärtstrend, dann zwei Schlüsse unter 122 (118, 113) ohne Gegen-Fraktal: das Tief 105 ersetzt den Punkt 122.
 * Danach Rücklauf auf 112 (erste Korrektur, 7 lang, ohne Referenz) und tieferes Tief 100.
 */
const FLIP_DIRECT = [
  ...zig([100, 120, 110, 135, 122], 4, 0),
  // zwei Kerzen über 122 (das Fraktal wird fertig), dann der Absturz; die Hochs sind so gesetzt, dass kein Hoch-Fraktal entsteht
  [122.2, 123.5, 122.1, 123.4] as Row,
  [122.9, 123.3, 122.2, 122.3] as Row,
  [122.3, 122.4, 117.9, 118] as Row,
  [118, 118.1, 112.9, 113] as Row,
  [113, 113.1, 107.9, 108] as Row,
  [108, 108.1, 105, 105.2] as Row,
  ...walk(105.2, [107, 109, 111]),
  [111, 112, 110.4, 111.8] as Row,
  ...walk(111.8, [111.3, 110.8, 110.3, 107, 104, 101]),
  [101, 101.1, 100, 100.2] as Row,
  ...walk(100.2, [100.7, 101.2, 101.7]),
];
/** Tief 126 (Korrektur 9), danach ein Docht auf 124,5 mit Schluss über 126: das Tief rückt aus, Korrektur 10,5 */
const DEEPER_WICK = [
  ...zig([100, 120, 110, 135, 126], 4, 0),
  [126.2, 126.9, 126.1, 126.8] as Row,
  [126.8, 127, 126.3, 126.9] as Row,
  [127, 127.2, 124.5, 126.5] as Row,
  [126.5, 127.3, 126.4, 127.2] as Row,
  [127.2, 127.5, 127, 127.4] as Row,
];
/** Docht unter 125 (Tief der letzten Korrektur), Schluss darüber */
const WICK_ONLY = [...zig([100, 120, 110, 135, 125]), [126, 127, 124, 126] as Row];
/** Ein Schluss unter 125, dann wieder darüber: keine Bestätigung */
const SINGLE_CLOSE = [...zig([100, 120, 110, 135, 125]), [126, 126.5, 123, 123.5] as Row, [124, 127, 123.8, 126.5] as Row];
/** Kleine Korrektur 131 (nicht gezeichnet), danach Schlüsse unter 131, aber über dem gezeichneten Tief 110 */
const INNER_BREAK = [
  ...zig([100, 120, 110, 135, 131]),
  [132.7, 132.8, 129.9, 130] as Row,
  [130, 130.1, 128.9, 129] as Row,
  [129, 129.1, 127.9, 128] as Row,
];
/** Schlüsse 136 und 137 über dem Hoch 135 */
const BREAKOUT = [...zig([100, 120, 110, 135]), [133.3, 136.2, 133.2, 136] as Row, [136, 137.1, 135.9, 137] as Row];
/** Tief 95 (Docht) unter dem Start 100, Schluss 101 darüber: die Tiefs steigen nicht */
const LOWER_LOW_WICK = patched(zig([100, 120, 105]), 10, [108, 108.5, 95, 101]);
/** Linie 100 → 101 (eine Stufe je Kerze), drei Rücksetzer genau auf die Linie, kein neues Hoch über 140 */
const TOUCHES = zig([100, 120, 101, 140, 102, 130, 103, 130, 104]);
/** Rücklauf unter die Linie (Schluss 135 < 136,25), aber über dem Tief 124 */
const LINE_BROKEN = zig([100, 120, 110, 135, 124, 150, 130]);
/** Tief auf Index 10 ist ein Spike: Körper 0, Docht 1 */
const SPIKE = patched(UP3, 10, [111, 111.2, 110, 111]);
/** 40 steigende Kerzen: Hoch 140 liegt in der grünen Wave-Phase */
const WAVE_UP = zig([100, 140], 40);
/** 40 fallende Kerzen, dann kleiner Rücklauf: Hoch 104 liegt in der roten Phase */
const WAVE_DOWN = zig([140, 100, 104], [40, 4]);
/** Hochs und Tiefs gleich: nichts bewegt sich, 60 Kerzen */
const SIDEWAYS = zig([100, 110, 100, 110, 100, 110, 100, 110, 100, 110], 6);
/** Hoch 110, danach 56 Kerzen, die Kerze für Kerze höher schließen: der Impuls läuft seit über 50 Kerzen */
const RUNAWAY = [
  ...zig([100, 110]),
  ...Array.from({ length: 56 }, (_, i): Row => plain(109.3 + i * 0.9, 109.3 + (i + 1) * 0.9)),
];
/** Wie EVEN, das dritte Tief 120,4 statt 120: die neue Linie weicht 0,75 ab, unter 10 % von 14,6 */
const NEAR_EVEN = zig([100, 125, 110, 135, 120.4, 145]);
/** Neue Hochs und Tiefs, 60 Kerzen */
const STAIRS = zig([100, 125, 110, 135, 120, 145, 130, 155, 140, 165], 6);

// ---- Fälle: Name, Lauf, erwartete Zustände (Literale) ------------------------------------------------------------

interface Case {
  name: string;
  run: () => Candidate;
  expect: Record<string, CheckState>;
}

const U: CheckState = 'unmeasurable';

const UP3_EXPECT: Record<string, CheckState> = {
  'TRD-01': 'met',
  'TRD-02': 'met',
  'TRD-03': 'met',
  'TRD-04': 'met',
  'TRD-05': 'unmet',
  'TRD-06': 'met',
  'TRD-07': 'met',
  'TRD-08': 'unmet',
  'TRD-09': 'met',
  'TRD-10': 'met',
  'TRD-11': 'met',
  'TRD-12': 'met',
  'TRD-13': 'met',
  'TRD-15': U,
  'TRD-16': U,
  'TRD-17': U,
  'TRD-18': 'unmet',
  'TRD-19': 'unmet',
  'TRD-20': U,
  'TRD-21': 'met',
  'TRD-22': 'met',
  'TRD-23': 'unmet',
  'TRD-24': 'unmet',
  'TRD-25': U,
  'TRD-27': U,
  'TRD-28': U,
  'TRD-29': U,
  'TRD-30': U,
  'TRD-31': U,
  'TRD-32': U,
  'TRD-33': U,
  'TRD-34': 'met',
  'TRD-35': 'met',
  'TRD-36': 'unmet',
  'TRD-37': 'met',
  'TRD-38': 'unmet',
  'TRD-39': 'met',
  'TRD-40': 'unmet',
  'TRD-41': 'unmet',
  'TRD-42': 'met',
  'TRD-43': 'unmet',
  'TRD-44': 'met',
  'TRD-45': U,
  'TRD-46': 'unmet',
  'TRD-47': U,
  'TRD-48': U,
};

const CASES: Case[] = [
  {
    name: 'Aufwärtstrend mit drei Impulsen: Trendzug, Impuls, Korrekturen und Linie stimmen mit der Handrechnung',
    run: () => run(UP3),
    expect: UP3_EXPECT,
  },
  {
    name: 'Erste Korrektur nach dem Start wird ohne Referenz gezeichnet; Linie fehlt, weil der zweite Impuls fehlt',
    run: () => run(FIRST_CORR),
    expect: {
      'TRD-01': 'met',
      'TRD-07': 'met',
      'TRD-08': U,
      'TRD-09': 'unmet',
      'TRD-10': U,
      'TRD-11': 'unmet',
      'TRD-12': 'unmet',
      'TRD-13': 'met',
      'TRD-21': 'unmet',
      'TRD-22': U,
      'TRD-34': 'unmet',
      'TRD-35': 'met',
      'TRD-46': U,
    },
  },
  {
    name: 'Korrektur mit Verhältnis 0,4 wird nicht gezeichnet und gehört zur tieferen Zeiteinheit',
    run: () => run(FOLD_SMALL),
    expect: {
      'TRD-01': 'met',
      'TRD-02': 'met',
      'TRD-03': 'met',
      'TRD-05': 'unmet',
      'TRD-06': 'unmet',
      'TRD-07': 'unmet',
      'TRD-08': 'unmet',
      'TRD-09': 'met',
      'TRD-19': 'unmet',
    },
  },
  {
    name: 'Verhältnis 0,6 liegt im Zwischenbereich und zählt nicht als eigene Welle',
    run: () => run(FOLD_GAP),
    expect: { 'TRD-06': 'unmet', 'TRD-07': 'unmet', 'TRD-08': 'met', 'TRD-09': 'met' },
  },
  {
    name: 'Welle kürzer als die vorige Korrektur: Impulse schrumpfen und das Hoch bleibt unter dem vorigen',
    run: () => run(SHORT_WAVE),
    expect: { 'TRD-10': 'unmet', 'TRD-12': 'unmet', 'TRD-21': 'unmet', 'TRD-22': U, 'TRD-24': 'met', 'TRD-46': 'met' },
  },
  {
    name: 'Korrekturen 25 und 20 sind ähnlich lang und kürzer werdend; die Kanal-Parallele gilt',
    run: () => run(SHRINK),
    expect: { 'TRD-22': 'met', 'TRD-23': 'met', 'TRD-24': 'met', 'TRD-34': 'met', 'TRD-39': 'met' },
  },
  {
    name: 'Korrektur 14 nach 10 ist zu lang für ähnlich; ohne regelmäßige Korrekturen kein Kanal',
    run: () => run(WIDE_CORR),
    expect: { 'TRD-22': 'unmet', 'TRD-23': 'unmet', 'TRD-34': 'met', 'TRD-39': 'unmet' },
  },
  {
    name: 'Gleich lange Züge: die neue Linie liegt auf der alten, die alte Linie bleibt',
    run: () => run(EVEN),
    expect: { 'TRD-22': 'met', 'TRD-37': 'unmet', 'TRD-38': 'met' },
  },
  {
    name: 'Neue Linie weicht am rechten Rand wenig ab: die alte Linie bleibt',
    run: () => run(NEAR_EVEN),
    expect: { 'TRD-37': 'unmet', 'TRD-38': 'met' },
  },
  {
    name: 'Zwei Schlüsse unter dem Tief 122: Wechsel nach unten, Bestätigung durch die zweite Kerze',
    run: () => run(FLIP_DOWN),
    expect: { 'TRD-11': 'met', 'TRD-15': 'unmet', 'TRD-16': 'met', 'TRD-17': 'met', 'TRD-20': 'unmet', 'TRD-47': U },
  },
  {
    name: 'Nach einem Wechsel ohne Gegen-Fraktal bleibt die erste Korrektur ohne Referenz, der Punkt zählt als Impuls',
    run: () => run(FLIP_DIRECT),
    expect: { 'TRD-07': 'met', 'TRD-09': 'unmet', 'TRD-10': 'met', 'TRD-11': 'met', 'TRD-16': 'met', 'TRD-47': 'met' },
  },
  {
    name: 'Ein weiter außen liegendes Tief ersetzt das Tief und das Verhältnis zur Referenz bleibt messbar',
    run: () => run(DEEPER_WICK),
    expect: { 'TRD-07': 'met', 'TRD-08': 'unmet', 'TRD-09': 'met' },
  },
  {
    name: 'Mirror: Wechsel nach oben bei gespiegelter Reihe',
    run: () => run(mirror(FLIP_DOWN)),
    expect: { 'TRD-15': 'met', 'TRD-16': 'unmet', 'TRD-17': 'met' },
  },
  {
    name: 'Nach dem Wechsel kommt der Preis auf die Bezugszone zurück (Retest) und macht ein tieferes Tief',
    run: () => run(FLIP_LOWER_LOW),
    expect: { 'TRD-16': 'met', 'TRD-20': 'met', 'TRD-47': 'met' },
  },
  {
    name: 'Nach dem Wechsel liegt das zweite Tief über dem ersten: keine zusätzliche Strukturbestätigung',
    run: () => run(FLIP_HIGHER_LOW),
    expect: { 'TRD-47': 'unmet' },
  },
  {
    name: 'Docht unter dem Tief ohne Schluss ändert den Trend nicht',
    run: () => run(WICK_ONLY),
    expect: { 'TRD-17': U, 'TRD-18': 'met', 'TRD-15': U, 'TRD-16': U },
  },
  {
    name: 'Ein einzelner Schluss unter dem Tief reicht nicht für den Wechsel',
    run: () => run(SINGLE_CLOSE),
    expect: { 'TRD-17': 'unmet', 'TRD-16': U },
  },
  {
    name: 'Schluss unter einer inneren Zone ohne Wechsel ist nur eine Annäherung',
    run: () => run(INNER_BREAK),
    expect: { 'TRD-19': 'met', 'TRD-16': U, 'TRD-06': 'unmet' },
  },
  {
    name: 'Schlüsse über dem Hoch beginnen einen neuen Impuls; die laufende Bewegung ist überschritten',
    run: () => run(BREAKOUT),
    expect: { 'TRD-11': 'met', 'TRD-12': 'met', 'TRD-13': 'unmet', 'TRD-44': 'unmet' },
  },
  {
    name: 'Tief unter dem Start mit Schluss darüber: die Tiefs steigen nicht, die Linie fehlt',
    run: () => run(LOWER_LOW_WICK),
    expect: { 'TRD-34': 'unmet', 'TRD-35': 'unmet' },
  },
  {
    name: 'Drei Rücksetzer auf die Linie zählen als drei Berührungen, kein Schluss jenseits',
    run: () => run(TOUCHES),
    expect: { 'TRD-34': 'met', 'TRD-40': 'met', 'TRD-41': 'met', 'TRD-42': 'met', 'TRD-43': 'unmet' },
  },
  {
    name: 'Schluss unter der Linie ohne Trendwechsel ist nur ein Signal',
    run: () => run(LINE_BROKEN),
    expect: { 'TRD-42': 'unmet', 'TRD-43': 'met', 'TRD-16': U },
  },
  {
    name: 'Spike-Docht am Anker wird durch den Docht der Nachbarkerze ersetzt',
    run: () => run(SPIKE),
    expect: { 'TRD-36': 'met', 'TRD-34': 'met' },
  },
  {
    name: 'Wave: Hoch in der grünen Phase und höchster Preis der Phase stimmt mit dem Trendzug überein',
    run: () => run(WAVE_UP),
    expect: { 'TRD-45': 'met' },
  },
  {
    name: 'Wave: ein Hoch in der roten Phase weicht vom Oszillator ab',
    run: () => run(WAVE_DOWN),
    expect: { 'TRD-45': 'unmet' },
  },
  {
    name: 'Seitwärts über 60 Kerzen ohne Impuls und Wechsel: Ausschluss',
    run: () => run(SIDEWAYS),
    expect: { 'TRD-30': 'met' },
  },
  {
    name: 'Neue Hochs in den letzten 50 Kerzen: kein Seitwärtsmarkt',
    run: () => run(STAIRS),
    expect: { 'TRD-30': 'unmet' },
  },
  {
    name: 'Ein Impuls, der seit über 50 Kerzen läuft, ist kein Seitwärtsmarkt',
    run: () => run(RUNAWAY),
    expect: { 'TRD-30': 'unmet' },
  },
  {
    name: 'Kein Fraktal geladen: keine eigenen Punkte, alle Punktbedingungen nicht messbar',
    run: () => run(CLIMB),
    expect: { 'TRD-01': U, 'TRD-04': 'unmet', 'TRD-07': U, 'TRD-11': U, 'TRD-34': U },
  },
  {
    name: 'Mitten im Zug: das Hoch ist kein Fraktal, ein späterer Schluss liegt darüber und das Extrem ist höher',
    run: () => point(UP3, 12, 'resistance'),
    expect: { 'TRD-01': 'met', 'TRD-02': 'unmet', 'TRD-03': 'unmet', 'TRD-05': 'met', 'TRD-06': 'unmet' },
  },
  {
    name: 'Zweites Hoch nach dem Hoch 135 ohne Tief dazwischen wechselt nicht ab',
    run: () => point(UP3, 16, 'resistance'),
    expect: { 'TRD-01': 'unmet' },
  },
  {
    name: 'Gezeichneter Wendepunkt: Extrem, Fraktal fertig und Teil des Trendzugs',
    run: () => point(UP3, 14, 'resistance'),
    expect: {
      'TRD-01': 'met',
      'TRD-02': 'met',
      'TRD-03': 'met',
      'TRD-05': 'unmet',
      'TRD-06': 'met',
      'TRD-07': U,
      'TRD-08': U,
      'TRD-09': U,
    },
  },
  {
    name: 'Trade mit dem Trend, höhere Zeiteinheit gleich: Grund TRD 27 zählt zu den Gründen',
    run: () => run(UP3, { side: 'buy', reasons: 1 }, { D1: barsOf(UP3, D1) }),
    expect: { 'TRD-27': 'met', 'TRD-31': 'met', 'TRD-32': 'met', 'TRD-33': 'met' },
  },
  {
    name: 'Trade mit dem Trend ohne weiteren Grund: ein Grund reicht nicht, wenn die höhere Zeiteinheit fehlt',
    run: () => run(UP3, { side: 'buy', reasons: 1 }),
    expect: { 'TRD-27': U, 'TRD-31': 'met', 'TRD-33': 'unmet' },
  },
  {
    name: 'Gegentrend-Trade braucht drei Gründe: zwei Gründe plus höhere Zeiteinheit genügen',
    run: () => run(mirror(UP3), { side: 'buy', reasons: 2 }, { D1: barsOf(UP3, D1) }),
    expect: { 'TRD-27': 'met', 'TRD-31': 'unmet', 'TRD-32': 'met', 'TRD-33': 'met' },
  },
  {
    name: 'Gegentrend-Trade mit zwei Gründen und gegenläufiger höherer Zeiteinheit reicht nicht',
    run: () => run(UP3, { side: 'sell', reasons: 2 }, { D1: barsOf(UP3, D1) }),
    expect: { 'TRD-27': 'unmet', 'TRD-31': 'unmet', 'TRD-32': 'unmet', 'TRD-33': 'met' },
  },
  {
    name: 'Tiefere Zeiteinheit läuft gegen die höhere, ohne Wechsel in der höheren: sie dreht nicht',
    run: () => run(UP3, {}, { D1: barsOf(UP3, D1), H4: barsOf(mirror(UP3)) }, 'D1'),
    expect: { 'TRD-28': 'met' },
  },
  {
    name: 'Wechselt die höhere Zeiteinheit nach der tieferen (gleicher Tag, Schlusszeiten zählen), hat sie selbst gedreht',
    run: () => {
      const d1 = barsOf(FLIP_DOWN, D1);
      const flipH4 = buildTrend('H4', barsOf(mirror(FLIP_DOWN)), []).changes[0].k;
      const flipD1 = buildTrend('H4', d1, []).changes[0].k;
      // die Wechselkerze der H4 öffnet 8 Stunden nach Beginn des Tages der D1-Wechselkerze
      const start = d1[flipD1].time + 8 * 3600 - flipH4 * H4;
      const ctx = new FormationContext('TEST', { D1: d1, H4: barsOf(mirror(FLIP_DOWN), H4, start) });
      return analyzeTrd(ctx, END).find((a) => a.tf === 'D1')!.candidate;
    },
    expect: { 'TRD-16': 'met', 'TRD-28': 'unmet' },
  },
  {
    name: 'Korrektur über 25 Kerzen der tieferen Zeiteinheit zählt auch in der höheren',
    run: () =>
      analyzeTrd(
        new FormationContext('TEST', {
          D1: barsOf(UP3, D1),
          H4: barsOf(Array.from({ length: 60 }, () => flat(130)), H4, 14 * D1),
        }),
        END,
      ).find((a) => a.tf === 'D1')!.candidate,
    expect: { 'TRD-48': 'met' },
  },
  {
    name: 'Gleich laufende tiefere Zeiteinheit ist keine Gegenbewegung; Korrektur ohne ihre Kerzen zählt in der höheren nicht',
    run: () => run(UP3, {}, { D1: barsOf(UP3, D1) }, 'D1'),
    expect: { 'TRD-28': 'unmet', 'TRD-48': 'unmet' },
  },
];

// ---- Tests -------------------------------------------------------------------------------------------------------

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-03' }, fn);

test.describe('TRD: Fälle je Bedingung', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const candidate = c.run();
      const got = Object.fromEntries(Object.keys(c.expect).map((id) => [id, state(candidate, id)]));
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('TRD: Abdeckung und Eigenschaften', () => {
  frm('jede messbare Bedingung hat einen Fall mit ☑ und einen mit ☐', () => {
    const missing: string[] = [];
    for (const id of TRD_CHECK_IDS) {
      if (TRD_UNMEASURABLE_IDS.includes(id)) continue;
      const states = new Set(CASES.map((c) => c.expect[id]).filter((s) => s !== undefined));
      if (!states.has('met')) missing.push(`${id} ☑`);
      if (!states.has('unmet')) missing.push(`${id} ☐`);
    }
    expect(missing).toEqual([]);
  });

  frm('TRD 25 und TRD 29 sind immer nicht messbar', () => {
    const c = run(UP3);
    expect(TRD_UNMEASURABLE_IDS.map((id) => state(c, id))).toEqual([U, U]);
  });

  frm('Aufwärtstrend und gespiegelter Abwärtstrend haben dieselben Zustände', () => {
    const up = run(UP3);
    const down = run(mirror(UP3));
    expect(down.checks.map((c) => [c.id, c.state])).toEqual(up.checks.map((c) => [c.id, c.state]));
    expect([up.side, down.side]).toEqual(['buy', 'sell']);
  });

  frm('Urteil: Trend gültig, Seitwärtsmarkt ungültig, ohne Fraktale im Aufbau', () => {
    expect([
      run(UP3).verdict,
      run(SIDEWAYS).verdict,
      run(CLIMB).verdict,
    ]).toEqual(['valid', 'invalid', 'forming']);
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [18, 22]) {
      const full = analyzeTrd(ctxOf(UP3), bars * H4)[0];
      const prefix = analyzeTrd(ctxOf(UP3.slice(0, bars)), END)[0];
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Kein Blick in die Zukunft: Fraktale und Wechsel bis zur Kerze p sind mit und ohne spätere Kerzen gleich', () => {
    const bars = barsOf(FLIP_DIRECT);
    const full = buildTrend('H4', bars, []);
    for (const p of [24, 30, 36]) {
      const prefix = buildTrend('H4', bars.slice(0, p), []);
      const known = (m: typeof full) => m.cands.filter((c) => c.doneAt < p).map((c) => [c.idx, c.side, c.price, c.doneAt]);
      expect(known(prefix)).toEqual(known(full));
      expect(prefix.changes.map((c) => c.k)).toEqual(full.changes.filter((c) => c.k < p).map((c) => c.k));
    }
  });

  frm('Der Trendzug wechselt Hoch und Tief ab und die Zeichnungen sind auch bei ☐ vorhanden', () => {
    const c = run(UP3);
    const zig1 = c.drawings.find((d) => d.id === 'Z-TRD-01')!;
    expect(zig1.anchors.map((a) => a.price)).toEqual([100, 120, 110, 135, 124, 150]);
    expect(zig1.side).toBe('buy');
    const line = c.drawings.find((d) => d.id === 'Z-TRD-04')!;
    expect(line.anchors.map((a) => [a.time / H4, a.price])).toEqual([
      [10, 110],
      [18, 124],
    ]);
    expect(find(c, 'TRD-43').drawings).toContain('Z-TRD-04');
    expect(c.drawings.some((d) => d.id === 'Z-TRD-08')).toBe(true);
    expect(run(mirror(UP3)).drawings.find((d) => d.id === 'Z-TRD-01')!.side).toBe('sell');
  });

  frm('Spike-Anker: die Linie beginnt an der Nachbarkerze statt am Spike', () => {
    const line = run(SPIKE).drawings.find((d) => d.id === 'Z-TRD-04')!;
    expect(line.anchors[0].time).toBe(11 * H4);
    expect(line.anchors[0].price).toBeCloseTo(110.1, 6);
  });

  frm('Ein Wendepunkt ohne geschlossene kerze ist nicht messbar', () => {
    const c = checkTrdCandidate(ctxOf(UP3), END, { tf: 'H4', side: 'resistance', time: 999 * H4 });
    expect(c.checks.every((x) => x.state === U)).toBe(true);
  });
});

// ---- Echte Reihen ------------------------------------------------------------------------------------------------

const loadFixture = (name: string) => {
  const fx = parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
  const ctx = new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars } as ContextInput);
  return analyzeTrd(ctx, fx.bars[fx.bars.length - 1].time + (fx.timeframe === 'D1' ? D1 : H4))[0];
};

test.describe('TRD: echte Kerzen', () => {
  for (const name of ['trd-up-d1-01', 'trd-line-d1-01']) {
    frm(`${name}: der Trendzug wechselt Hoch und Tief ab und jeder Punkt ist ein gezeichnetes, fertiges Fraktal`, () => {
      const a = loadFixture(name);
      const sides = a.model.pivots.map((p) => p.side);
      expect(sides.slice(1).every((s, i) => s !== sides[i])).toBe(true);
      expect(new Set(a.model.pivots.map((p) => p.idx)).size).toBe(a.model.pivots.length);
      expect(a.model.pivots.length).toBeGreaterThanOrEqual(3);
      expect(a.model.pivots.every((p) => a.model.cands.some((c) => c.idx === p.idx && c.drawn))).toBe(true);
    });
  }

  frm('trd-up-d1-01: Aufwärtstrend mit steigenden Tiefs, kein Wechsel nach unten, kürzer werdende Korrekturen', () => {
    const c = loadFixture('trd-up-d1-01').candidate;
    const got = Object.fromEntries(['TRD-01', 'TRD-11', 'TRD-16', 'TRD-23', 'TRD-34', 'TRD-35'].map((id) => [id, state(c, id)]));
    expect(got).toEqual({
      'TRD-01': 'met',
      'TRD-11': 'met',
      'TRD-16': 'unmet',
      'TRD-23': 'met',
      'TRD-34': 'met',
      'TRD-35': 'met',
    });
  });
});
