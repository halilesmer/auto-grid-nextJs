/**
 * Signale (SIG): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐ auf von Hand gerechneten Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close] (siehe e2e/fixtures/formation-rows.ts). Grundbausteine:
 *  - `rise(n)`: n Kerzen, jede 1 höher als die vorige (Spanne 1,2, kein Fraktal), Schluss 100; der RSI steigt auf 100.
 *  - `chop(n)`: abwechselnd 101 und 100 (Spanne 1,2), der RSI liegt bei etwa 50.
 *  - volumenstark heißt Spanne ≥ 1,5 × Mittel der 20 Kerzen davor (also ≥ 1,8 nach `rise`), volumenarm ≤ 0,5 ×.
 * RSI-Werte der gebauten Reihen sind mit einer unabhängigen Wilder-Rechnung (Periode 7) nachgerechnet.
 * FRM-04 Formationserkennung: Fibonacci und Signale
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { divergenceOf } from '../../src/lib/formation/sig';
import {
  SIG_CHECK_IDS,
  SIG_UNMEASURABLE_IDS,
  analyzeSig,
  checkSigDivergence,
  type SigOptions,
} from '../../src/lib/formation/sigChecks';
import type { TrendModel } from '../../src/lib/formation/trd';
import type { Candidate, CheckState } from '../../src/lib/formation/types';
import { D1, END, H1, H4, barsOf, mirror, plain, walk, zig, type Row } from '../fixtures/formation-rows';

const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';
const N: CheckState = 'unmet';
const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-04' }, fn);

const STEP = { D1, H4, H1 } as const;
type Tf = keyof typeof STEP;

const ctxOf = (input: Partial<Record<Tf, Row[]>>) => {
  const bars: ContextInput = {};
  for (const tf of Object.keys(input) as Tf[]) bars[tf] = barsOf(input[tf]!, STEP[tf]);
  return new FormationContext('TEST', bars);
};

function run(input: Partial<Record<Tf, Row[]>>, options: SigOptions = {}, tf: Tf = 'H4'): Candidate {
  const found = analyzeSig(ctxOf(input), END, options).find((a) => a.tf === tf);
  if (!found) throw new Error(`keine Zeiteinheit ${tf}`);
  return found.candidate;
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

/** Fortsetzung einer Reihe: Schlusskurse, jede Kerze öffnet beim Schluss der vorigen */
const then = (rows: Row[], closes: number[]): Row[] => [...rows, ...walk(rows[rows.length - 1][3], closes)];

// ---- Bausteine -------------------------------------------------------------------------------------------------

const rise = (n: number, end = 100): Row[] => Array.from({ length: n }, (_, i) => plain(end - n + i, end - n + i + 1));
const chop = (n: number): Row[] => walk(100, Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 101 : 100)));

// ---- Reihen: RSI und Ort ---------------------------------------------------------------------------------------

/** 12 Kerzen aufwärts ohne Rücksetzer: RSI = 100 */
const UP12 = rise(12);
/** 12 Kerzen abwärts ohne Gegenbewegung: RSI = 0 */
const DOWN12 = mirror(UP12);
/** Hoch 130 mit zwei Kerzen darunter; die letzte Kerze reicht mit dem Hoch 129,95 in die Widerstandszone 129,8 bis 130 */
const TOP = [
  ...zig([100, 130], 8, 0),
  [129.8, 129.9, 129, 129.2] as Row,
  [129.2, 129.95, 129.1, 129.7] as Row,
];
/** Hochs 130@10 und 135@26, 8 Kerzen je Zug: RSI am Hoch 130 = 95 (Wilder, Periode 7) */
const HI_RSI = zig([100, 130, 112, 135], 8);
/** Wie oben, der erste Zug aus Treppen (+12, −7 …): RSI am Hoch 130 = 69,9 */
const HI_STAIRS = (() => {
  const base = HI_RSI;
  const steps = walk(base[2][3], [112, 105, 118, 111, 124, 117, 128]);
  const prev = steps[steps.length - 1][3];
  const peak: Row = [prev, 130, prev - 0.1, 129.8];
  return [...base.slice(0, 3), ...steps, peak, ...base.slice(11)];
})();

// ---- Reihen: Divergenz -----------------------------------------------------------------------------------------

/**
 * Hochs 130@14, 135@38, 138@62 (12 Kerzen je Zug). Wave-Spitzen im Fenster vor dem Hoch (nachgerechnet, SMA 5 − SMA 35 des
 * Medianpreises): 9,835 am Hoch 135 und 7,183 am Hoch 138. Preis höher, Wave niedriger: Divergenz. RSI am Hoch 138 = 88,5.
 */
const DIV_BEAR = zig([100, 130, 112, 135, 120, 138], 12);
/** Das dritte Hoch 150: Wave-Spitze 14,626 über 9,835, keine Divergenz */
const DIV_NONE = zig([100, 130, 112, 135, 120, 150], 12);
/** Wie DIV_BEAR, der letzte Zug aus Treppen: RSI am Hoch 138 = 75,3 */
const DIV_STAIRS = (() => {
  const closes = [124, 128, 125, 129, 126, 131, 133];
  let prev = DIV_BEAR[54][3];
  const rows = closes.map((c): Row => {
    const row = plain(prev, c);
    prev = c;
    return row;
  });
  return [...DIV_BEAR.slice(0, 55), ...rows, ...DIV_BEAR.slice(62)];
})();
/** Nach dem Hoch 138 ein weiterer Docht bis 139,1 ohne fertiges Fraktal */
const DIV_BEYOND = then(DIV_BEAR, [137.5, 139]);
/** Zu kurz für den Wave (weniger als 35 Kerzen), aber mit zwei Rekord-Hochs 130 und 135 */
const DIV_SHORT = zig([100, 130, 112, 135]);

// ---- Reihen: Fibonacci-Bezug -----------------------------------------------------------------------------------

/** Korrektur bis 118: Tiefe 0,4 (S 100, E 130) */
const HEALTHY = zig([100, 130, 118, 128]);
/** Korrektur bis 122: Tiefe 0,267 */
const SHALLOW = zig([100, 130, 122, 128]);
/** Tief 112 (Tiefe 0,6), zweites Tief 113,5: die letzte Kerze liegt im Band 111,46 bis 118,54 und in der Zone 112 bis 114,2 */
const IN_BAND = [
  ...zig([100, 130, 112, 128, 113.5], 4, 0),
  [113.7, 114.3, 113.6, 114] as Row,
  [114, 114.4, 113.8, 113.9] as Row,
];
/** Rücklauf bis 115 im Band, aber ohne Zone darunter */
const FALLING = then(zig([100, 130, 110, 128]), [124, 120, 117, 115]);

// ---- Reihen: Kerzen --------------------------------------------------------------------------------------------

const BASE = rise(24);
/** Vorkerze abwärts (Spanne 6,2) und Aufwärts-Engulf, Schluss 102,5 über deren Hoch 101,2 */
const ENG_BUY = [...BASE, [101, 101.2, 95, 95.5] as Row, [95.5, 103, 95.2, 102.5] as Row];
/** Wie oben, die Vorkerze ist klein (Spanne 1,2): kein Engulf gegen eine volumenarme Kerze */
const ENG_SMALL = [...BASE, [100.5, 100.7, 99.5, 99.7] as Row, [99.7, 101.3, 99.6, 101.2] as Row];
/** Zwei Aufwärtskerzen nach der Abwärtskerze, Schluss 102,9 über deren Hoch 101,2; die letzte allein umschließt nichts */
const ENG_TWO = [
  ...BASE,
  [101, 101.2, 95, 95.5] as Row,
  [95.5, 99, 95.4, 98.8] as Row,
  [98.8, 103, 98.7, 102.9] as Row,
];
/** Aufwärtskerze, dann Abwärts-Engulf, Schluss 124,5 unter deren Tief 126,4; sein Hoch 129,95 liegt in der Widerstandszone 128,4 bis 130 */
const ENG_SELL_ZONE = [
  ...zig([100, 130], 20, 0),
  [126.5, 129.6, 126.4, 129.5] as Row,
  [129.6, 129.95, 124, 124.5] as Row,
];
/** Aufwärtskerze (Spanne 3,1) und tiefer Abwärts-Engulf (Spanne 8,1): Engulf-Zone 100 bis 103,1 über dem Kurs 95,5 */
const ENG_SELL = [...BASE, [100, 103, 99.9, 102.9] as Row, [102.9, 103.1, 95, 95.5] as Row];
/** Zwei Abwärts-Engulfs mit einer Aufwärtskerze dazwischen */
const ENG_DOUBLE = [
  ...BASE,
  [100, 103, 99.9, 102.9] as Row,
  [102.9, 103.1, 98, 98.5] as Row,
  [98.5, 101.5, 98.4, 101.4] as Row,
  [101.4, 101.6, 96, 96.5] as Row,
];
/** Nur ein Abwärts-Engulf */
const ENG_SINGLE = [...BASE, [98.5, 101.5, 98.4, 101.4] as Row, [101.4, 101.6, 96, 96.5] as Row];
/** Testere: Abwärts-Engulf (Schluss 96,5 unter 99,9), dann eine Aufwärtskerze, Schluss 103,95 über dem Hoch 103,1, Docht 0,05 */
const SAW = [
  ...BASE,
  [100, 103, 99.9, 102.9] as Row,
  [102.9, 103.1, 96, 96.5] as Row,
  [96.5, 104, 96.4, 103.95] as Row,
];
/** Wie oben, die Testere-Kerze schließt bei 103,2 (über 103,1) mit Gegendocht 1,8 von 8,6 */
const SAW_WICK = [
  ...BASE,
  [100, 103, 99.9, 102.9] as Row,
  [102.9, 103.1, 96, 96.5] as Row,
  [96.5, 105, 96.4, 103.2] as Row,
];
/** Testere in einer Unterstützungszone 96,1 bis 96,5 (Tief 96,2 nach Abstieg und Anstieg) */
const SAW_ZONE = [
  ...rise(10, 104),
  ...walk(104, [103, 102, 101, 100, 99, 98, 97, 96.5, 96.2, 96.8, 97.4, 98, 98.6, 99.2, 99.8, 100.4]),
  [100.4, 103, 100.3, 102.9] as Row,
  [102.9, 103.1, 96, 96.5] as Row,
  [96.5, 104, 96.4, 103.95] as Row,
];
/** Volumenstarke Abwärtskerze zum Schluss */
const WIDE_DOWN = [...BASE, [100, 100.2, 94, 94.5] as Row];
/** Volumenstarke Aufwärtskerze zum Schluss */
const WIDE_UP = [...BASE, [100, 106, 99.9, 105.5] as Row];
/** Kerze ohne Spanne zum Schluss */
const NO_RANGE = [...BASE, [100, 100, 100, 100] as Row];
/** Drei sehr kleine Kerzen (Spanne 0,4) nach der Basis */
const NARROW3 = [...BASE, plain(100, 100.2), plain(100.2, 100.4), plain(100.4, 100.6)];
const NARROW2 = [...BASE, plain(100, 100.2), plain(100.2, 100.4)];
/** Zwei volumenstarke Kerzen, dann drei kleine */
const WIDE_THEN_NARROW = [...BASE, plain(100, 103), plain(103, 106), plain(106, 106.2), plain(106.2, 106.4), plain(106.4, 106.6)];
/** Tief 97, vier volumenstarke Aufwärtskerzen (Spanne 3,4), Hoch 109,9, sechs kleine Kerzen */
const IMPULSE_QUIET = [
  ...BASE,
  ...walk(100, [99, 98, 97, 100.2, 103.4, 106.6, 109.8]),
  ...walk(109.8, [109.7, 109.6, 109.5, 109.4, 109.3, 109.2]),
];
/** Wie oben, danach drei volumenstarke Rücklaufkerzen */
const IMPULSE_LOUD = [...BASE, ...walk(100, [99, 98, 97, 100.2, 103.4, 106.6, 109.8, 106.6, 103.4, 100.2])];

// H1 → H4: vier Stundenkerzen ergeben eine Viertelstundenkerze der nächsthöheren Zeiteinheit: O 10, H 15, L 9, C 14 und O 14, H 19, L 13, C 18
const H1_ROWS: Row[] = [
  [10, 12, 9, 11], [11, 13, 10, 12], [12, 14, 11, 13], [13, 15, 12, 14],
  [14, 16, 13, 15], [15, 17, 14, 16], [16, 18, 15, 17], [17, 19, 16, 18],
];
const H4_MERGED: Row[] = [[10, 15, 9, 14], [14, 19, 13, 18]];
const H4_WRONG: Row[] = [[10, 15, 9, 14], [14, 19, 13, 17.5]];

// ---- Fälle ----------------------------------------------------------------------------------------------------

interface Case {
  name: string;
  candidate: () => Candidate;
  expect: Record<string, CheckState>;
}

/** Aufwärtstrend der Tageskerzen weit unter dem Kurs, damit keine Tageszone die Zone der H4 verdrängt (FRZ-21) */
const D1_UP = zig([10, 40, 28, 38]);

const CASES: Case[] = [
  {
    name: 'RSI 100 am Ende: überkauft für Verkauf, kein Extrem gegen den Verkauf',
    candidate: () => run({ H4: UP12 }, { side: 'sell' }),
    expect: { 'SIG-01': M, 'SIG-02': M, 'SIG-07': N, 'SIG-05': M, 'SIG-03': N },
  },
  {
    name: 'RSI 100 für einen Kauf: kein Extrem in Trade-Richtung, Extrem dagegen schließt aus',
    candidate: () => run({ H4: UP12 }, { side: 'buy' }),
    expect: { 'SIG-02': N, 'SIG-07': M },
  },
  {
    name: 'RSI 0 für einen Kauf: überverkauft',
    candidate: () => run({ H4: DOWN12 }, { side: 'buy' }),
    expect: { 'SIG-02': M, 'SIG-07': N },
  },
  {
    name: 'RSI bei 50 (abwechselnd ±1): kein Extrem, damit nichts zu filtern',
    candidate: () => run({ H4: chop(30) }, { side: 'sell' }),
    expect: { 'SIG-02': N, 'SIG-03': U },
  },
  {
    name: 'zu wenig Kerzen für RSI und Wave',
    candidate: () => run({ H4: rise(5) }),
    expect: { 'SIG-01': N, 'SIG-10': N },
  },
  {
    name: 'genug Kerzen für RSI und Wave',
    candidate: () => run({ H4: DIV_BEAR }),
    expect: { 'SIG-01': M, 'SIG-10': M },
  },
  {
    name: 'RSI-Extrem direkt in der Widerstandszone',
    candidate: () => run({ H4: TOP }, { side: 'sell' }),
    expect: { 'SIG-02': M, 'SIG-03': M },
  },
  {
    name: 'RSI am vorigen Hoch 95 (≥ 80)',
    candidate: () => run({ H4: HI_RSI }, { side: 'sell' }),
    expect: { 'SIG-04': M },
  },
  {
    name: 'RSI am vorigen Hoch 69,9 (< 80)',
    candidate: () => run({ H4: HI_STAIRS }, { side: 'sell' }),
    expect: { 'SIG-04': N },
  },
  {
    name: 'Weg frei über die tiefere Zeiteinheit (Engulf) trotz RSI bei 50',
    candidate: () => run({ H4: chop(30), H1: ENG_BUY }, { side: 'buy' }),
    expect: { 'SIG-05': M, 'SIG-28': M, 'SIG-30': N },
  },
  {
    name: 'Kein Weg: weder RSI-Extrem noch Engulf noch genug Gründe',
    candidate: () => run({ H4: HEALTHY, H1: rise(24) }, { side: 'buy' }),
    expect: { 'SIG-05': N, 'SIG-28': N, 'SIG-30': N, 'SIG-40': N },
  },
  {
    name: 'Tages-RSI überkauft beim Verkauf',
    candidate: () => run({ D1: UP12, H4: HEALTHY }, { side: 'sell' }),
    expect: { 'SIG-06': M },
  },
  {
    name: 'Tages-RSI überverkauft beim Verkauf',
    candidate: () => run({ D1: DOWN12, H4: HEALTHY }, { side: 'sell' }),
    expect: { 'SIG-06': N },
  },
  {
    name: 'Divergenz im Wave an den letzten zwei Hochs: Preis höher, Wave niedriger',
    candidate: () => run({ H4: DIV_BEAR }, { side: 'sell' }),
    expect: {
      'SIG-09': M, 'SIG-11': M, 'SIG-12': M, 'SIG-13': M, 'SIG-14': M, 'SIG-15': N, 'SIG-17': M, 'SIG-18': M, 'SIG-19': N,
      'SIG-20': M, 'SIG-21': M, 'SIG-22': M,
    },
  },
  {
    name: 'Divergenz an Hochs schließt einen Kauf aus',
    candidate: () => run({ H4: DIV_BEAR }, { side: 'buy' }),
    expect: { 'SIG-15': M, 'SIG-11': N, 'SIG-16': U },
  },
  {
    name: 'Ohne Seite gilt die Seite der Trendfarbe',
    candidate: () => run({ H4: DIV_BEAR }),
    expect: { 'SIG-11': M, 'SIG-15': M, 'SIG-17': U },
  },
  {
    name: 'Divergenz an Tiefs schließt einen Verkauf aus, nicht einen Kauf',
    candidate: () => run({ H4: mirror(DIV_BEAR) }, { side: 'sell' }),
    expect: { 'SIG-16': M, 'SIG-15': U },
  },
  {
    name: 'Divergenz an Tiefs: bei einem Kauf kein Ausschluss, aber ein Grund',
    candidate: () => run({ H4: mirror(DIV_BEAR) }, { side: 'buy' }),
    expect: { 'SIG-16': N, 'SIG-17': M, 'SIG-13': M },
  },
  {
    name: 'Drittes Hoch 150: Wave stärker, keine Divergenz; Ausdehnung 0,65 über den vorigen Impuls',
    candidate: () => run({ H4: DIV_NONE }, { side: 'sell' }),
    expect: { 'SIG-13': N, 'SIG-14': N, 'SIG-17': N, 'SIG-20': N, 'SIG-19': M },
  },
  {
    name: 'Zu wenig Kerzen für den Wave: Divergenz im Wave nicht messbar',
    candidate: () => run({ H4: DIV_SHORT }, { side: 'sell' }),
    expect: { 'SIG-09': N },
  },
  {
    name: 'Docht über dem zweiten Hoch ohne fertiges Fraktal',
    candidate: () => run({ H4: DIV_BEYOND }, { side: 'sell' }),
    expect: { 'SIG-21': N },
  },
  {
    name: 'RSI am zweiten Hoch 75,3',
    candidate: () => run({ H4: DIV_STAIRS }, { side: 'sell' }),
    expect: { 'SIG-22': N },
  },
  {
    name: 'Korrektur nur 0,267: die Mindestkorrektur der Divergenz-Strategie fehlt',
    candidate: () => run({ H4: SHALLOW }, { side: 'sell' }),
    expect: { 'SIG-18': N },
  },
  {
    name: 'Engulf nach volumenstarker Vorkerze, die selbst ein Abwärts-Engulf ist (Testere)',
    candidate: () => run({ H4: ENG_BUY }, { side: 'buy' }),
    expect: { 'SIG-23': M, 'SIG-24': M, 'SIG-25': N, 'SIG-26': N, 'SIG-34': M, 'SIG-43': M },
  },
  {
    name: 'Kein Engulf: die letzten Kerzen laufen alle aufwärts',
    candidate: () => run({ H4: BASE }, { side: 'buy' }),
    expect: { 'SIG-23': N, 'SIG-34': N },
  },
  {
    name: 'Engulf gegen eine kleine Vorkerze zählt nicht',
    candidate: () => run({ H4: ENG_SMALL }, { side: 'buy' }),
    expect: { 'SIG-23': M, 'SIG-24': N, 'SIG-43': N },
  },
  {
    name: 'Engulf aus zwei volumenstarken Kerzen',
    candidate: () => run({ H4: ENG_TWO }, { side: 'buy' }),
    expect: { 'SIG-25': M, 'SIG-23': N },
  },
  {
    name: 'Abwärts-Engulf an der Widerstandszone des Hochs',
    candidate: () => run({ H4: ENG_SELL_ZONE }, { side: 'sell' }),
    expect: { 'SIG-23': M, 'SIG-26': M },
  },
  {
    name: 'Engulf-Zone hält in Trade-Richtung',
    candidate: () => run({ H4: ENG_SELL }, { side: 'sell' }),
    expect: { 'SIG-27': M },
  },
  {
    name: 'Keine Engulf-Zone in Kauf-Richtung',
    candidate: () => run({ H4: ENG_SELL }, { side: 'buy' }),
    expect: { 'SIG-27': N, 'SIG-31': M },
  },
  {
    name: 'Großer Abwärts-Engulf über dem Kurs schließt Kauf aus, nicht Verkauf',
    candidate: () => run({ H4: ENG_SELL }, { side: 'sell' }),
    expect: { 'SIG-31': N },
  },
  {
    name: 'Aufwärts-Engulf in der tieferen Zeiteinheit gegen den geplanten Verkauf',
    candidate: () => run({ H4: BASE, H1: ENG_BUY }, { side: 'sell' }),
    expect: { 'SIG-30': M, 'SIG-28': N },
  },
  {
    name: 'Doppel-Engulf: zwei Abwärts-Engulfs mit einer Kerze dazwischen',
    candidate: () => run({ H4: ENG_DOUBLE }, { side: 'sell' }),
    expect: { 'SIG-32': M },
  },
  {
    name: 'Einzelner Engulf ist kein Doppel-Engulf',
    candidate: () => run({ H4: ENG_SINGLE }, { side: 'sell' }),
    expect: { 'SIG-32': N },
  },
  {
    name: 'Kerze mit Spanne misst das Volumen',
    candidate: () => run({ H4: BASE }),
    expect: { 'SIG-33': M },
  },
  {
    name: 'Kerze ohne Spanne misst nichts',
    candidate: () => run({ H4: NO_RANGE }),
    expect: { 'SIG-33': N },
  },
  {
    name: 'Drei kleine Kerzen in Folge sind „viele kleine Kerzen“, zwei nicht',
    candidate: () => run({ H4: NARROW3 }),
    expect: { 'SIG-35': M },
  },
  {
    name: 'Zwei kleine Kerzen reichen nicht',
    candidate: () => run({ H4: NARROW2 }),
    expect: { 'SIG-35': N },
  },
  {
    name: 'Kleine Kerzen nach einem volumenstarken Lauf',
    candidate: () => run({ H4: WIDE_THEN_NARROW }),
    expect: { 'SIG-36': M, 'SIG-35': M },
  },
  {
    name: 'Kleine Kerzen ohne vorherigen volumenstarken Lauf',
    candidate: () => run({ H4: NARROW3 }),
    expect: { 'SIG-36': N },
  },
  {
    name: 'Impuls aus volumenstarken, Korrektur aus kleinen Kerzen',
    candidate: () => run({ H4: IMPULSE_QUIET }),
    expect: { 'SIG-37': M },
  },
  {
    name: 'Korrektur ebenfalls aus volumenstarken Kerzen',
    candidate: () => run({ H4: IMPULSE_LOUD }),
    expect: { 'SIG-37': N },
  },
  {
    name: 'Volumenstarke Abwärtskerze gegen einen Kauf',
    candidate: () => run({ H4: WIDE_DOWN }, { side: 'buy' }),
    expect: { 'SIG-38': M, 'SIG-34': M },
  },
  {
    name: 'Volumenstarke Aufwärtskerze für einen Kauf',
    candidate: () => run({ H4: WIDE_UP }, { side: 'buy' }),
    expect: { 'SIG-38': N },
  },
  {
    name: 'Zwei Gründe mit dem Trend (Zone und Korrekturzone) reichen',
    candidate: () => run({ H4: IN_BAND }, { side: 'buy' }),
    expect: { 'SIG-40': M, 'SIG-41': M },
  },
  {
    name: 'Nur ein Grund (Korrekturzone) mit dem Trend reicht nicht',
    candidate: () => run({ H4: FALLING }, { side: 'buy' }),
    expect: { 'SIG-40': N, 'SIG-41': M },
  },
  {
    name: 'Kein Grund',
    candidate: () => run({ H4: BASE }, { side: 'buy' }),
    expect: { 'SIG-41': N, 'SIG-40': U },
  },
  {
    name: 'Testere ohne Gegendocht',
    candidate: () => run({ H4: SAW }, { side: 'buy' }),
    expect: { 'SIG-43': M, 'SIG-44': M, 'SIG-45': N },
  },
  {
    name: 'Testere mit Gegendocht 1,8 von 8,6',
    candidate: () => run({ H4: SAW_WICK }, { side: 'buy' }),
    expect: { 'SIG-43': M, 'SIG-44': N },
  },
  {
    name: 'Testere an einer Unterstützungszone mit Tages-Trend als zweitem Grund',
    candidate: () => run({ D1: D1_UP, H4: SAW_ZONE }, { side: 'buy' }),
    expect: { 'SIG-43': M, 'SIG-45': M },
  },
  {
    name: 'Hoch mitten in der Bewegung ist kein Ende der Trendbewegung',
    candidate: () => checkSigDivergence(ctxOf({ H4: DIV_BEAR }), END, { tf: 'H4', side: 'resistance', timeA: 38 * H4, timeB: 61 * H4 }),
    expect: { 'SIG-12': N },
  },
  {
    name: 'Zwei Wendepunkte als Enden der Trendbewegung',
    candidate: () => checkSigDivergence(ctxOf({ H4: DIV_BEAR }), END, { tf: 'H4', side: 'resistance', timeA: 38 * H4, timeB: 62 * H4 }),
    expect: { 'SIG-12': M, 'SIG-13': M },
  },
  {
    name: 'Vier Stundenkerzen ergeben die Viertelstundenkerze der höheren Zeiteinheit',
    candidate: () => run({ H1: H1_ROWS, H4: H4_MERGED }),
    expect: { 'SIG-46': M },
  },
  {
    name: 'Die geladene höhere Kerze weicht ab',
    candidate: () => run({ H1: H1_ROWS, H4: H4_WRONG }),
    expect: { 'SIG-46': N },
  },
];

test.describe('SIG: Fälle je Bedingung', () => {
  for (const c of CASES) {
    frm(c.name, () => {
      const candidate = c.candidate();
      const got = Object.fromEntries(Object.keys(c.expect).map((id) => [id, state(candidate, id)]));
      expect(got).toEqual(c.expect);
    });
  }
});

test.describe('SIG: Abdeckung und Eigenschaften', () => {
  frm('jede messbare Bedingung hat einen Fall mit ☑ und einen mit ☐', () => {
    const missing: string[] = [];
    for (const id of SIG_CHECK_IDS) {
      if (SIG_UNMEASURABLE_IDS.includes(id)) continue;
      const states = new Set(CASES.map((c) => c.expect[id]).filter((s) => s !== undefined));
      if (!states.has(M)) missing.push(`${id} ☑`);
      if (!states.has(N)) missing.push(`${id} ☐`);
    }
    expect(missing).toEqual([]);
  });

  frm('SIG 08, 29 und 39 sind immer nicht messbar', () => {
    const c = run({ H4: SAW }, { side: 'buy' });
    expect(SIG_UNMEASURABLE_IDS.map((id) => state(c, id))).toEqual([U, U, U]);
  });

  frm('Gleichstand der Wave-Spitzen zählt als Divergenz, strikt gilt er nicht', () => {
    // Zwei Rekord-Hochs 130 und 135, Wave-Spitzen beide 2,0
    const bars = barsOf(Array.from({ length: 12 }, () => plain(100, 100)), H4);
    const trend = {
      bars,
      wave: bars.map(() => 2),
      pivots: [
        { idx: 3, side: 'resistance', price: 130 },
        { idx: 6, side: 'support', price: 120 },
        { idx: 9, side: 'resistance', price: 135 },
      ],
    } as unknown as TrendModel;
    bars[3] = { ...bars[3], high: 130 };
    bars[9] = { ...bars[9], high: 135 };
    const d = divergenceOf(trend, 'resistance');
    expect([d!.strict, d!.tie, d!.priceBeyond]).toEqual([false, true, true]);
  });

  frm('Kauf mit Divergenz an Tiefs und gespiegelter Verkauf mit Divergenz an Hochs haben dieselben Zustände', () => {
    const ids = ['SIG-02', 'SIG-07', 'SIG-09', 'SIG-11', 'SIG-12', 'SIG-13', 'SIG-14', 'SIG-17', 'SIG-20', 'SIG-21', 'SIG-22'];
    const sell = run({ H4: DIV_BEAR }, { side: 'sell' });
    const buy = run({ H4: mirror(DIV_BEAR) }, { side: 'buy' });
    expect(ids.map((id) => state(buy, id))).toEqual(ids.map((id) => state(sell, id)));
  });

  frm('Urteil: Divergenz an Hochs schließt einen Kauf aus, ein Verkauf ist gültig, ohne Kerzen im Aufbau', () => {
    expect([
      run({ H4: DIV_BEAR }, { side: 'sell' }).verdict,
      run({ H4: DIV_BEAR }, { side: 'buy' }).verdict,
      run({ H4: [] as Row[] }, { side: 'buy' }, 'H4').verdict,
    ]).toEqual(['valid', 'invalid', 'forming']);
  });

  frm('Gründe: Liste G1 bis G11, G1 und G2 zählen, G9 kommt aus der Eingabe', () => {
    const found = analyzeSig(ctxOf({ D1: D1_UP, H4: SAW_ZONE }), END, { side: 'buy' }).find((a) => a.tf === 'H4')!;
    const met = found.reasons.filter((r) => r.met).map((r) => r.id);
    expect(found.reasons.map((r) => r.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11']);
    expect(met).toContain('G1');
    expect(met).toContain('G2');
    const formation = analyzeSig(ctxOf({ H4: SAW_ZONE }), END, { side: 'buy', formationPoint: true }).find((a) => a.tf === 'H4')!;
    expect(formation.reasons.find((r) => r.id === 'G9')!.met).toBe(true);
  });

  frm('Zeichnungen: RSI, Wave, Markierung des Extrems, Divergenzlinie, Engulf-Zone auch bei ☐', () => {
    const top = run({ H4: TOP }, { side: 'sell' });
    const rsi = top.drawings.find((d) => d.id === 'Z-SIG-01')!;
    expect(rsi.levels).toEqual([20, 80]);
    expect(top.drawings.some((d) => d.id === 'Z-SIG-02')).toBe(true);
    const div = run({ H4: DIV_BEAR }, { side: 'sell' });
    const line = div.drawings.find((d) => d.id === 'Z-SIG-04')!;
    expect(line.anchors).toEqual([
      { time: 38 * H4, price: 135 },
      { time: 62 * H4, price: 138 },
    ]);
    expect(div.drawings.some((d) => d.id === 'Z-SIG-03')).toBe(true);
    const eng = run({ H4: ENG_BUY }, { side: 'buy' });
    const zone = eng.drawings.find((d) => d.id === 'Z-SIG-05')!;
    // Kauf-Engulf: Eröffnung der Vorkerze 101 bis Tief der Engulf-Kerze 95,2
    expect(zone.anchors.map((a) => a.price)).toEqual([95.2, 101]);
    expect(find(eng, 'SIG-23').drawings).toContain('Z-SIG-05');
    expect(find(div, 'SIG-13').drawings).toEqual(['Z-SIG-04']);
  });

  frm('Kein Blick in die Zukunft: mit späteren Kerzen im Kontext ist das Ergebnis zum Zeitpunkt t dasselbe', () => {
    for (const bars of [40, 52]) {
      const full = analyzeSig(ctxOf({ H4: DIV_BEAR }), bars * H4, { side: 'sell' }).find((a) => a.tf === 'H4')!;
      const prefix = analyzeSig(ctxOf({ H4: DIV_BEAR.slice(0, bars) }), END, { side: 'sell' }).find((a) => a.tf === 'H4')!;
      expect(full.candidate).toEqual(prefix.candidate);
    }
  });

  frm('Punkte ohne geschlossene Kerze sind nicht messbar', () => {
    const c = checkSigDivergence(ctxOf({ H4: DIV_BEAR }), END, { tf: 'H4', side: 'resistance', timeA: 999 * H4, timeB: 62 * H4 });
    expect(c.checks.every((x) => x.state === U)).toBe(true);
  });

  frm('Kerzen zusammenfassen ohne vollständige Gruppe: nichts zu vergleichen', () => {
    const c = run({ H1: H1_ROWS.slice(0, 6), H4: H4_MERGED });
    expect(state(c, 'SIG-46')).toBe(M);
    const none = run({ H1: H1_ROWS.slice(0, 3), H4: H4_MERGED });
    expect(state(none, 'SIG-46')).toBe(U);
  });
});

// ---- Echte Reihen ----------------------------------------------------------------------------------------------

const loadFixture = (name: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8')));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const analyzeAt = (name: string, iso: string, side: 'buy' | 'sell'): Candidate => {
  const fx = loadFixture(name);
  const ctx = new FormationContext(fx.symbol, { H4: fx.bars } as ContextInput);
  return analyzeSig(ctx, at(iso), { side }).find((a) => a.tf === 'H4')!.candidate;
};

test.describe('SIG: echte Kerzen', () => {
  frm('sig-rsi-h4-01: RSI(7) am Einstiegsort über 80, Direkteinstieg ohne Umkehrkerze', () => {
    const c = analyzeAt('sig-rsi-h4-01', '2025-11-11T08:00', 'sell');
    expect([state(c, 'SIG-02'), state(c, 'SIG-05'), state(c, 'SIG-07')]).toEqual([M, M, N]);
    expect(find(c, 'SIG-02').value!).toBeGreaterThanOrEqual(80);
  });

  frm('sig-diverg-h4-01: Divergenz an den letzten zwei Hochs in Verkaufsrichtung, mindestens 3 Gründe gegen den Trend', () => {
    const c = analyzeAt('sig-diverg-h4-01', '2025-12-05T12:00', 'sell');
    expect([state(c, 'SIG-13'), state(c, 'SIG-17'), state(c, 'SIG-15'), state(c, 'SIG-40')]).toEqual([M, M, N, M]);
  });

  frm('sig-nosignal-h4-01: Einstieg ohne Signal (kein RSI-Extrem, kein Engulf, keine Divergenz, kein Grund)', () => {
    const c = analyzeAt('sig-nosignal-h4-01', '2025-11-21T20:00', 'sell');
    expect([state(c, 'SIG-02'), state(c, 'SIG-23'), state(c, 'SIG-13'), state(c, 'SIG-41')]).toEqual([N, N, N, N]);
  });

  frm('sig-diverg-h4-02: Divergenz an den letzten zwei Tiefs in Kaufrichtung', () => {
    const c = analyzeAt('sig-diverg-h4-02', '2025-12-22T20:00', 'buy');
    expect([state(c, 'SIG-13'), state(c, 'SIG-17')]).toEqual([M, M]);
  });
});
