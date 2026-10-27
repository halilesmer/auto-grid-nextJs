/**
 * Doppeltop / Doppelboden (CDT): Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * H1 und N sind Wendepunkte des Trendzugs (trd.ts), H2 ist der äußerste Docht seit N. Es fließen nur Kerzen der
 * übergebenen Liste ein, also nur geschlossene Kerzen bis t.
 * Preise laufen über `outward(Seite, Preis)`; ein Doppeltop (H1 ist ein Hoch) und der Doppelboden sind derselbe Code.
 * `cdtCore` misst die vier Bedingungen, die auch ABCD-24 braucht (CDT-05, CDT-06, CDT-12, CDT-15).
 */
import { wickEnd, zoneGeometry, closesBeyond, outward, otherSide, type Rect, type ZoneGeometry, type ZoneSide } from './frz';
import { buildTrend, type Pivot } from './trd';
import { CDT_PARAMS } from './params';
import { rsiExtreme, tradeSideOf } from './sig';
import type { Env } from './reasons';
import type { CheckState, FormationBar, Side } from './types';

type Bars = readonly FormationBar[];

export interface CdtPoint {
  idx: number;
  price: number;
}

/** H1 und N vor der Messung; H2 ist der äußerste Docht seit N */
export interface CdtBase {
  h1: CdtPoint;
  n: CdtPoint;
}

export interface CdtShape extends CdtBase {
  /** Seite von H1 (Hoch = Widerstand): dort liegt H2 */
  es: ZoneSide;
  /** Seite von N */
  cs: ZoneSide;
  /** Seite des Trades am H2: Verkauf, wenn H1 ein Hoch ist */
  side: Side;
  /** Zone von H1 (FRZ-11) */
  zone: ZoneGeometry;
  /** äußerster Docht in Richtung H1 seit N; null ohne Kerze nach N (oder der Eingabe-Punkt) */
  h2: CdtPoint | null;
}

/** Äußerster Docht auf der Seite `es` nach Kerze `from` (ohne `from`); null ohne spätere Kerze */
function extremeAfter(bars: Bars, from: number, es: ZoneSide): CdtPoint | null {
  let best: CdtPoint | null = null;
  for (let k = from + 1; k < bars.length; k++) {
    const price = wickEnd(bars[k], es);
    if (best === null || outward(es, price) > outward(es, best.price)) best = { idx: k, price };
  }
  return best;
}

/** Kante der Zone, die H2 mindestens erreichen muss (CDT-05): die zum Kurs hin liegende */
export const nearEdge = (es: ZoneSide, zone: Rect): number => (es === 'resistance' ? zone.bottom : zone.top);

/** Formen und Zone; `h2` überschreibt den gemessenen äußersten Docht (eigene Punkte) */
export function shapeOn(bars: Bars, tf: Env['tf'], base: CdtBase, es: ZoneSide, h2?: CdtPoint): CdtShape {
  return {
    ...base,
    es,
    cs: otherSide(es),
    side: tradeSideOf(es),
    zone: zoneGeometry(bars, base.h1.idx, es, tf),
    h2: h2 ?? extremeAfter(bars, base.n.idx, es),
  };
}

/**
 * Kandidatenpaare: N ist einer der letzten `lookbackPivots` Wendepunkte, H1 der Wendepunkt davor; jüngstes Paar zuerst.
 * Welches Paar gilt, entscheidet `analyzeCdt` an den Bedingungen CDT-01 bis CDT-06 und CDT-15.
 */
export function selectBases(env: Env, tf: Env['tf']): (CdtBase & { es: ZoneSide })[] {
  const pivots = env.trends.get(tf)?.pivots ?? [];
  const pt = (p: Pivot): CdtPoint => ({ idx: p.idx, price: p.price });
  const out: (CdtBase & { es: ZoneSide })[] = [];
  for (let i = pivots.length - 2; i >= Math.max(0, pivots.length - 1 - CDT_PARAMS.lookbackPivots); i--) {
    out.push({ h1: pt(pivots[i]), n: pt(pivots[i + 1]), es: pivots[i].side });
  }
  return out;
}

/** Preis des Impulsbeginns der Bewegung zu H1: Beginn der Fib-Messung, die an H1 endet, sonst der Wendepunkt davor */
function impulseStart(env: Env, tf: Env['tf'], es: ZoneSide, h1: CdtPoint): number | null {
  const leg = env.fibs.get(tf)?.legs.find((l) => l.end.idx === h1.idx);
  if (leg) return leg.start.price;
  const before = [...(env.trends.get(tf)?.pivots ?? [])].reverse().find((p) => p.idx < h1.idx && p.side !== es);
  return before ? before.price : null;
}

/** Tiefe der Korrektur bis `price` als Anteil der Strecke Impulsbeginn → H1 (CDT-04); null ohne Impulsbeginn oder Länge 0 */
export function depthOf(env: Env, tf: Env['tf'], es: ZoneSide, h1: CdtPoint, price: number): number | null {
  const start = impulseStart(env, tf, es, h1);
  if (start === null) return null;
  const len = Math.abs(h1.price - start);
  return len === 0 ? null : (outward(es, h1.price) - outward(es, price)) / len;
}

/**
 * CDT-15: Schluss jenseits des Extrems von H1 nach H1, schon 1 Punkt genügt. Ausnahme (FIB-21): die Kerze ist nicht volumenstark
 * und der Kurs hat die Ausdehnung der Fib Impulsbeginn → H1 noch nicht erreicht. Ohne Impulsbeginn gibt es keine Ausnahme.
 */
function violated(env: Env, tf: Env['tf'], es: ZoneSide, h1: CdtPoint): boolean {
  const view = env.views.get(tf)!;
  const start = impulseStart(env, tf, es, h1);
  const len = start === null ? 0 : Math.abs(h1.price - start);
  let reach = 0;
  for (let k = h1.idx + 1; k < view.bars.length; k++) {
    const b = view.bars[k];
    if (len > 0) reach = Math.max(reach, (outward(es, wickEnd(b, es)) - outward(es, h1.price)) / len);
    if (!closesBeyond(b, h1.price, es)) continue;
    const small = len > 0 && view.wide[k] !== true && reach < CDT_PARAMS.violationExtension;
    if (!small) return true;
  }
  return false;
}

/** Trendrichtung der Formations-ZE beim Anlauf zu H2: nur Kerzen bis H2 (CDT-06) */
function trendDirAt(env: Env, tf: Env['tf'], idx: number): 'up' | 'down' | null {
  const view = env.views.get(tf)!;
  return buildTrend(tf, view.bars.slice(0, idx + 1), view.wave.slice(0, idx + 1)).dir;
}

export const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
export const tri = (v: boolean | null): CheckState => (v === null ? 'unmeasurable' : flag(v));

interface CdtCore {
  c05: CheckState;
  c06: CheckState;
  c12: CheckState;
  c15: CheckState;
}

/** Die vier Bedingungen, auf die auch ABCD-24 baut. H2 ohne Kerze: CDT-05 und CDT-06 nicht messbar. */
export function cdtCore(env: Env, tf: Env['tf'], es: ZoneSide, h1: CdtPoint, h2: CdtPoint | null, zone: ZoneGeometry): CdtCore {
  const view = env.views.get(tf)!;
  const c05: CheckState = h2 ? flag(outward(es, h2.price) >= outward(es, nearEdge(es, zone))) : 'unmeasurable';
  let c06: CheckState = 'unmeasurable';
  if (h2) {
    const dir = trendDirAt(env, tf, h2.idx);
    c06 = dir === null ? 'unmeasurable' : flag(dir === (es === 'resistance' ? 'up' : 'down'));
  }
  const rsiAt = view.rsi[h1.idx] ?? null;
  return { c05, c06, c12: tri(rsiExtreme(rsiAt, tradeSideOf(es))), c15: flag(violated(env, tf, es, h1)) };
}

/**
 * ABCD-24: AB=CD ist eigentlich ein Doppeltop/-boden, wenn mit B = H1 und D = H2 CDT-05, CDT-06 und CDT-12 gelten
 * und kein Schluss jenseits von B liegt (CDT-15 ☐). Ein ☐ der Teile gibt ☐, fehlende Daten ohne ☐ „nicht messbar“.
 */
export function abcdIsCdt(env: Env, tf: Env['tf'], es: ZoneSide, b: CdtPoint, d: CdtPoint | null): CheckState {
  const view = env.views.get(tf)!;
  const zone = zoneGeometry(view.bars, b.idx, es, tf);
  const core = cdtCore(env, tf, es, b, d, zone);
  const noClose: CheckState = core.c15 === 'met' ? 'unmet' : 'met';
  const parts: CheckState[] = [core.c05, core.c06, core.c12, noClose];
  if (parts.includes('unmet')) return 'unmet';
  return parts.includes('unmeasurable') ? 'unmeasurable' : 'met';
}

/** Mittlere Spanne der `bars` Kerzen vor Kerze `idx` (ohne `idx`); null bei zu wenigen Kerzen (CDT-08) */
export function meanRangeBefore(bars: Bars, idx: number): number | null {
  const n = CDT_PARAMS.approach.bars;
  if (idx < n) return null;
  let sum = 0;
  for (let k = idx - n; k < idx; k++) sum += bars[k].high - bars[k].low;
  return sum / n;
}

/** Vorheriger Wendepunkt derselben Seite vor Kerze `idx` (das vorige Fraktal-Hoch des Trendzugs) oder null */
export function previousPivotOfSide(env: Env, tf: Env['tf'], es: ZoneSide, idx: number): CdtPoint | null {
  const prev = [...(env.trends.get(tf)?.pivots ?? [])].reverse().find((p) => p.idx < idx && p.side === es);
  return prev ? { idx: prev.idx, price: prev.price } : null;
}
