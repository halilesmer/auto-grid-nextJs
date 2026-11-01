/**
 * Fraktal und Fraktal-Zone (FRZ): Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * Index i = Fraktalkerze, „rechts“ sind spätere Kerzen. Die Liste enthält nur geschlossene Kerzen
 * (FormationContext.view), so gibt es keinen Blick in die Zukunft.
 */
import { FRZ_PARAMS, type ContextTimeframe } from './params';
import type { FormationBar } from './types';

export type ZoneSide = 'resistance' | 'support';
type Bars = readonly FormationBar[];

const N = FRZ_PARAMS.neighbors;

export const otherSide = (side: ZoneSide): ZoneSide => (side === 'resistance' ? 'support' : 'resistance');
/** Dochtende (FRZ-01): Widerstand = High, Unterstützung = Low */
export const wickEnd = (b: FormationBar, side: ZoneSide): number => (side === 'resistance' ? b.high : b.low);
/** Körperkante auf der Seite des Dochts (FRZ-11) */
const bodyEdge = (b: FormationBar, side: ZoneSide): number =>
  side === 'resistance' ? Math.max(b.open, b.close) : Math.min(b.open, b.close);
/** Schluss jenseits des Levels (FRZ-06): Widerstand darüber, Unterstützung darunter */
export const closesBeyond = (b: FormationBar, level: number, side: ZoneSide): boolean =>
  side === 'resistance' ? b.close > level : b.close < level;
const span = (b: FormationBar): number => b.high - b.low;
/** Rechnet so um, dass „weiter außen“ immer „größer“ heißt (Widerstand: Preis, Unterstützung: −Preis) */
export const outward = (side: ZoneSide, price: number): number => (side === 'resistance' ? price : -price);

export interface Rect {
  top: number;
  bottom: number;
}

/** Nachbarn der Kandidatenkerze (FRZ-02 bis FRZ-04) */
interface FractalProbe {
  leftBars: number;
  rightBars: number;
  /** Nachbarn, die jenseits des Dochtendes schließen */
  beyond: number;
}

/** Nachbarn zählen nur bis zur nächsten Datenlücke (`gapBefore`), wie im Chart (findFractals) */
export function probeFractal(bars: Bars, i: number, side: ZoneSide): FractalProbe {
  const level = wickEnd(bars[i], side);
  let leftBars = 0;
  while (leftBars < N && i - leftBars > 0 && !bars[i - leftBars].gapBefore) leftBars++;
  let rightBars = 0;
  while (rightBars < N && i + rightBars + 1 < bars.length && !bars[i + rightBars + 1].gapBefore) rightBars++;
  let beyond = 0;
  for (let k = i - leftBars; k <= i + rightBars; k++) {
    if (k !== i && closesBeyond(bars[k], level, side)) beyond++;
  }
  return { leftBars, rightBars, beyond };
}

const isFractal = (p: FractalProbe): boolean => p.leftBars === N && p.rightBars === N && p.beyond === 0;

/** Indizes aller Fraktale einer Seite, alt → neu (FRZ-01 bis FRZ-04) */
export function fractalIndices(bars: Bars, side: ZoneSide): number[] {
  const out: number[] = [];
  for (let i = N; i < bars.length - N; i++) {
    if (isFractal(probeFractal(bars, i, side))) out.push(i);
  }
  return out;
}

type WidthRule = 'base' | 'thin' | 'wickless' | 'manipulation';

export interface ZoneGeometry extends Rect {
  /** Dochtende der Fraktalkerze */
  extreme: number;
  /** Höhe vom Dochtende bis zur Körperkante (FRZ-11) */
  baseHeight: number;
  /** FRZ-13: zu dünn; null, wenn die rechte Nachbarkerze fehlt */
  thin: boolean | null;
  /** FRZ-15: gar kein Docht */
  wickless: boolean;
  /** FRZ-16: Manipulationsdocht */
  manipulation: boolean;
  /** Regel, nach der die Breite bestimmt wurde */
  rule: WidthRule;
}

/** Zone einer Fraktalkerze (FRZ-11 mit FRZ-13 bis FRZ-16) */
export function zoneGeometry(bars: Bars, i: number, side: ZoneSide, tf: ContextTimeframe): ZoneGeometry {
  const b = bars[i];
  const left = i > 0 ? bars[i - 1] : undefined;
  const right = i + 1 < bars.length ? bars[i + 1] : undefined;
  const extreme = wickEnd(b, side);
  const baseHeight = Math.abs(extreme - bodyEdge(b, side));
  const wickless = baseHeight === 0;
  const thin = right ? baseHeight > 0 && baseHeight < FRZ_PARAMS.thinRatio * span(right) : null;
  const manip = FRZ_PARAMS.manipulation;
  const manipulation = tf === manip.timeframe && baseHeight > 0 && baseHeight >= manip.ratio * Math.abs(b.close - b.open);

  // Rechnung in Außen-Koordinaten u: weiter außen = größer. far = Dochtseite, near = zum Kurs hin.
  const uExtreme = outward(side, extreme);
  let uFar = uExtreme;
  let uNear = uExtreme - baseHeight;
  let rule: WidthRule = 'base';
  if (wickless) {
    rule = 'wickless';
    uNear = uExtreme - (left ? FRZ_PARAMS.wicklessDepth * span(left) : 0);
  } else if (manipulation && (left || right)) {
    // Zone zwischen der Körperkante der Fraktalkerze und der äußersten Körperkante der direkten Nachbarn
    rule = 'manipulation';
    const own = outward(side, bodyEdge(b, side));
    const neighbors = [left, right].filter((x): x is FormationBar => x !== undefined);
    const nb = Math.max(...neighbors.map((x) => outward(side, bodyEdge(x, side))));
    uFar = Math.min(uExtreme, Math.max(own, nb));
    uNear = Math.min(own, nb);
  } else if (thin === true && right) {
    rule = 'thin';
    uNear = uExtreme - FRZ_PARAMS.thinWiden * span(right);
  }
  const rect: Rect = side === 'resistance' ? { top: uFar, bottom: uNear } : { top: -uNear, bottom: -uFar };
  return { ...rect, extreme, baseHeight, thin, wickless, manipulation, rule };
}

export interface ZoneScan {
  /** erster Schluss jenseits des Dochtendes nach der Bildung (FRZ-06) */
  firstBreak: number | null;
  /** nach dem Bruch Schluss zurück jenseits der anderen Zonenkante (FRZ-10) */
  backBreak: number | null;
  /** Dochte jenseits ohne Schluss vor dem Bruch (FRZ-08) */
  wickBreaches: number;
}

/** Läuft von `from` (erste Kerze nach der Bildung) bis zur letzten Kerze */
export function scanZone(bars: Bars, side: ZoneSide, zone: Rect & { extreme: number }, from: number): ZoneScan {
  let firstBreak: number | null = null;
  let backBreak: number | null = null;
  let wickBreaches = 0;
  for (let k = from; k < bars.length; k++) {
    const b = bars[k];
    if (firstBreak === null) {
      if (closesBeyond(b, zone.extreme, side)) firstBreak = k;
      else if (side === 'resistance' ? b.high > zone.extreme : b.low < zone.extreme) wickBreaches++;
    } else if (backBreak === null) {
      if (side === 'resistance' ? b.close < zone.bottom : b.close > zone.top) backBreak = k;
    }
  }
  return { firstBreak, backBreak, wickBreaches };
}

/**
 * Tests der Zone (FRZ-31): eine Kerze von `from` bis `to` kommt bis auf testReach × Zonenhöhe an die Zone.
 * Ein weiterer Test zählt erst, wenn dazwischen ein Gegenfraktal (`counter`, Indizes) fertig geworden ist.
 * `skip` schließt Kerzen aus, die selbst zur Bildung der Zone gehören.
 */
export function countTests(
  bars: Bars,
  side: ZoneSide,
  zone: Rect,
  from: number,
  to: number,
  skip: (k: number) => boolean,
  counter: readonly number[],
): number {
  const reach = FRZ_PARAMS.testReach * (zone.top - zone.bottom);
  let tests = 0;
  let armed = true;
  let last = -1;
  for (let k = from; k <= to; k++) {
    if (!armed && counter.some((f) => f > last && f + N < k)) armed = true;
    if (skip(k)) continue;
    const b = bars[k];
    const touch = side === 'resistance' ? b.high >= zone.bottom - reach : b.low <= zone.top + reach;
    if (touch && armed) {
      tests++;
      armed = false;
      last = k;
    }
  }
  return tests;
}

/**
 * Suchweg (FRZ-19): Linie am Dochtende der letzten geschlossenen Kerze, von dort nach links. Die erste Kerze, die die Linie
 * erreicht, ist die 1. Zone; jede weitere muss ein höheres High (Widerstand) bzw. tieferes Low (Unterstützung) haben.
 * `live` = Fraktale ohne Verletzung, alt → neu. Ergebnis: Indizes, nah → fern.
 */
export function searchZones(bars: Bars, side: ZoneSide, live: readonly number[]): { line: number; found: number[] } {
  const line = wickEnd(bars[bars.length - 1], side);
  const found: number[] = [];
  let threshold = line;
  for (let p = live.length - 1; p >= 0; p--) {
    const e = outward(side, wickEnd(bars[live[p]], side));
    const ok = found.length === 0 ? e >= outward(side, threshold) : e > outward(side, threshold);
    if (ok) {
      found.push(live[p]);
      threshold = wickEnd(bars[live[p]], side);
    }
  }
  return { line, found };
}

/** Lücke zwischen zwei Rechtecken; 0, wenn sie sich überlappen */
export function rectGap(a: Rect, b: Rect): number {
  return Math.max(0, Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top));
}

/** Zusammenlegen (FRZ-22): überlappend oder Lücke ≤ mergeGap × Höhe der kleineren Zone */
function shouldMerge(a: Rect, b: Rect): boolean {
  const smaller = Math.min(a.top - a.bottom, b.top - b.bottom);
  return rectGap(a, b) <= FRZ_PARAMS.mergeGap * smaller;
}

/** Gruppen über die Merge-Beziehung (transitiv); Ergebnis: Positionen je Gruppe */
export function mergeGroups(rects: readonly Rect[]): number[][] {
  const parent = rects.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      if (shouldMerge(rects[a], rects[b])) parent[find(b)] = find(a);
    }
  }
  const groups = new Map<number, number[]>();
  rects.forEach((_, k) => {
    const root = find(k);
    groups.set(root, [...(groups.get(root) ?? []), k]);
  });
  return [...groups.values()];
}

/** Stärke aus Tests und Zonen ineinander (FRZ-29, FRZ-32, FRZ-34): 0 potenziell, 1 stark, 2 sehr stark */
export function strengthOf(tests: number, nest: number): 0 | 1 | 2 {
  if (tests >= FRZ_PARAMS.veryStrongTests || nest >= FRZ_PARAMS.veryStrongNest) return 2;
  if (tests >= FRZ_PARAMS.strongTests || nest >= FRZ_PARAMS.strongNest) return 1;
  return 0;
}
