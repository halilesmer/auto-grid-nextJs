/**
 * Trendfortsetzung (TDF): Kandidaten der vier Unterformen aus den fertigen Fraktalen. Jede Unterform ist eine Pause nach H1:
 * Flagge (zwei Gegenwellen, fallende obere Linie), steigendes Dreieck (zweiter Anlauf an die Zone von H1), Schale (flache Korrektur
 * bis 0.236, mit optionalem Henkel) und Konsolidierung (Box mit Berührungen oben und unten). Die Kandidaten sind kausal: sie nutzen
 * nur fertige Fraktale der übergebenen Kerzen. Welcher Kandidat gilt, entscheidet `analyzeTdf` an den Bedingungen.
 */
import { otherSide, outward, zoneGeometry, type ZoneSide } from './frz';
import { innerExtreme, peaksOf, type ObPoint } from './obo';
import { TDF_PARAMS, type ContextTimeframe } from './params';
import { closeBeyondAfter, farEdge, lineAt, reaches } from './tdf';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

export type TdfForm = 'flag' | 'triangle' | 'bowl' | 'box';

interface FlagBase {
  form: 'flag';
  h1: ObPoint;
  /** erstes Tief der Korrektur, zweites Hoch (unter der Zone von H1) und zweites Tief; `c2` fehlt, solange die zweite Welle nicht fertig ist */
  c1: ObPoint;
  f1: ObPoint;
  c2: ObPoint | null;
}
interface TriangleBase {
  form: 'triangle';
  h1: ObPoint;
  /** tiefstes Fraktal zwischen H1 und H2, zweites Hoch an der Zone von H1, Tief nach H2 (fehlt noch) */
  l1: ObPoint;
  h2: ObPoint;
  l2: ObPoint | null;
}
interface BowlBase {
  form: 'bowl';
  h1: ObPoint;
  /** tiefstes Fraktal der Pause und der Henkel (Tief einer zweiten kleinen Korrektur nach der Schale) */
  low: ObPoint;
  handle: ObPoint | null;
}
interface BoxBase {
  form: 'box';
  h1: ObPoint;
  /** weitere Berührungen oben (ohne H1) und alle Berührungen unten; die erste unten legt die untere Zone fest */
  tops: ObPoint[];
  bottoms: ObPoint[];
}
export type TdfBase = FlagBase | TriangleBase | BowlBase | BoxBase;

/** Jüngste Fraktale von `es`, jüngstes zuerst: die Kandidaten für das Impulsende H1 (das Fraktal vor der Pause) */
export function recentPeaks(bars: Bars, es: ZoneSide): ObPoint[] {
  return peaksOf(bars, es).slice(-TDF_PARAMS.maxImpulses).reverse();
}

const after = (points: readonly ObPoint[], idx: number): ObPoint[] => points.filter((p) => p.idx > idx);

function flagBases(bars: Bars, es: ZoneSide, tf: ContextTimeframe, h1: ObPoint): FlagBase[] {
  const cs = otherSide(es);
  const zone = zoneGeometry(bars, h1.idx, es, tf);
  const out: FlagBase[] = [];
  for (const c1 of after(peaksOf(bars, cs), h1.idx).slice(0, TDF_PARAMS.maxWaves)) {
    // F1 liegt unter der Zone von H1 (sonst ist es ein Dreieck) und die Linie H1 → F1 fällt
    const highs = after(peaksOf(bars, es), c1.idx).filter((p) => !reaches(es, p.price, zone) && outward(es, p.price) < outward(es, h1.price));
    for (const f1 of highs.slice(0, TDF_PARAMS.maxWaves)) {
      const brk = closeBeyondAfter(bars, es, (time) => lineAt(bars, h1, f1, time), f1.idx);
      out.push({ form: 'flag', h1, c1, f1, c2: innerExtreme(bars, cs, f1.idx, brk ?? bars.length) });
    }
  }
  return out;
}

function triangleBases(bars: Bars, es: ZoneSide, tf: ContextTimeframe, h1: ObPoint): TriangleBase[] {
  const cs = otherSide(es);
  const zone = zoneGeometry(bars, h1.idx, es, tf);
  const edge = farEdge(es, zone);
  const out: TriangleBase[] = [];
  const touching = after(peaksOf(bars, es), h1.idx).filter((p) => reaches(es, p.price, zone));
  for (const h2 of touching.slice(0, TDF_PARAMS.maxWaves)) {
    const l1 = innerExtreme(bars, cs, h1.idx, h2.idx);
    if (l1 === null) continue;
    const brk = closeBeyondAfter(bars, es, () => edge, h2.idx);
    out.push({ form: 'triangle', h1, l1, h2, l2: innerExtreme(bars, cs, h2.idx, brk ?? bars.length) });
  }
  return out;
}

function bowlBases(bars: Bars, es: ZoneSide, tf: ContextTimeframe, h1: ObPoint): BowlBase[] {
  const cs = otherSide(es);
  const edge = farEdge(es, zoneGeometry(bars, h1.idx, es, tf));
  const brk = closeBeyondAfter(bars, es, () => edge, h1.idx);
  const end = brk ?? bars.length;
  const low = innerExtreme(bars, cs, h1.idx, end);
  if (low === null) return [];
  // Henkel: nach der Schale ein Hoch und danach ein weiteres Tief vor dem Ausbruch
  const rise = after(peaksOf(bars, es), low.idx).find((p) => p.idx < end);
  const handle = rise ? (after(peaksOf(bars, cs), rise.idx).find((p) => p.idx < end) ?? null) : null;
  return [{ form: 'bowl', h1, low, handle }];
}

function boxBases(bars: Bars, es: ZoneSide, tf: ContextTimeframe, h1: ObPoint): BoxBase[] {
  const cs = otherSide(es);
  const zoneH = zoneGeometry(bars, h1.idx, es, tf);
  const edge = farEdge(es, zoneH);
  const brk = closeBeyondAfter(bars, es, () => edge, h1.idx);
  const end = brk === null ? bars.length - 1 : brk - 1;
  const lows = after(peaksOf(bars, cs), h1.idx).filter((p) => p.idx <= end);
  if (lows.length === 0) return [];
  const floor = zoneGeometry(bars, lows[0].idx, cs, tf);
  const bottoms = lows.filter((p) => reaches(cs, p.price, floor));
  const tops = after(peaksOf(bars, es), h1.idx).filter((p) => p.idx <= end && reaches(es, p.price, zoneH));
  return [{ form: 'box', h1, tops, bottoms }];
}

/** Alle Kandidaten der Unterformen für ein Impulsende */
export function basesFor(bars: Bars, es: ZoneSide, tf: ContextTimeframe, h1: ObPoint): TdfBase[] {
  return [...flagBases(bars, es, tf, h1), ...triangleBases(bars, es, tf, h1), ...bowlBases(bars, es, tf, h1), ...boxBases(bars, es, tf, h1)];
}
