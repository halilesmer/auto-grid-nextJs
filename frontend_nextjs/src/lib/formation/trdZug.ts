/**
 * Regeln des Trendzugs (TRD-06 bis TRD-09). Ein fertiges Fraktal ändert das Ende des Zugs oder nichts; jede Regel
 * entscheidet an der Kerze, mit der es fertig wird, allein aus Kerzen bis dorthin. Nur der letzte Punkt rückt noch nach außen.
 * Die Regel `filter` streicht zusätzlich ein gezeichnetes Korrekturpaar, sobald die Fortsetzung es als unbedeutend zeigt.
 */
import { outward, type ZoneSide } from './frz';
import { wave, type Series } from './indicators';
import { FRZ_PARAMS, type TrendOptions } from './params';
import type { Pivot } from './trd';
import type { FormationBar } from './types';

export type ZugPoint = Pick<Pivot, 'idx' | 'doneAt' | 'side' | 'price'>;

/** Am Ende des Zugs fallen `cut` Punkte weg, danach kommen `add` dazu */
export interface ZugEdit {
  cut: number;
  add: ZugPoint[];
}

type ZugRule = (zug: readonly Pivot[], f: ZugPoint) => ZugEdit | null;
type Size = (idx: number) => number;

const beyond = (side: ZoneSide, a: ZugPoint, b: ZugPoint): boolean => outward(side, a.price) > outward(side, b.price);
const phaseSide = (w: number): ZoneSide => (w > 0 ? 'resistance' : 'support');

/** Ein Schenkel gilt ab der Mindestgröße an seiner Endkerze; kleinere Bewegungen gehören zur tieferen Zeiteinheit (TRD-06) */
function sizeRule(minLeg: Size): ZugRule {
  return (zug, f) => {
    const last = zug[zug.length - 1];
    if (!last) return { cut: 0, add: [f] };
    if (last.side === f.side) return beyond(f.side, f, last) ? { cut: 1, add: [f] } : null;
    return Math.abs(f.price - last.price) >= minLeg(f.idx) ? { cut: 0, add: [f] } : null;
  };
}

/** Je grüner EWO-Welle nur das höchste Hoch, je roter nur das tiefste Tief */
function waveRule(ewo: Series): ZugRule {
  return (zug, f) => {
    const w = ewo[f.idx];
    if (w === null || phaseSide(w) !== f.side) return null;
    const last = zug[zug.length - 1];
    if (last?.side !== f.side) return { cut: 0, add: [f] };
    return beyond(f.side, f, last) ? { cut: 1, add: [f] } : null;
  };
}

/** Korrekturen im Schenkel zu `end`: je Korrektur ihr Extrem und ihr Ende, sobald die Fortsetzung fertig ist */
function innerCorrections(open: readonly ZugPoint[], start: ZugPoint, end: ZugPoint, minLeg: Size): ZugPoint[] {
  const walk = [...open, end];
  const out: ZugPoint[] = [];
  let from = 0;
  let base = start;
  for (;;) {
    const found = nextCorrection(walk, from, base, end.side, minLeg);
    if (!found) return out;
    out.push(found.extreme, found.end);
    base = found.end;
    from = walk.indexOf(found.end) + 1;
  }
}

function nextCorrection(walk: readonly ZugPoint[], from: number, base: ZugPoint, side: ZoneSide, minLeg: Size) {
  let extreme: ZugPoint | null = null;
  for (let i = from; i < walk.length; i++) {
    const x = walk[i];
    if (x.side === side) {
      if (!extreme || beyond(side, x, extreme)) extreme = x;
      continue;
    }
    if (!extreme || Math.abs(x.price - extreme.price) < minLeg(x.idx) || !beyond(side, x, base)) continue;
    const peak = extreme;
    const later = walk.slice(i + 1).find((y) => y.side === side && beyond(side, y, peak));
    if (!later) continue;
    const between = walk.filter((y) => y.side !== side && peak.idx < y.idx && y.idx < later.idx);
    if (between.length === 0) continue;
    return { extreme: peak, end: between.reduce((best, y) => (beyond(y.side, y, best) ? y : best)) };
  }
  return null;
}

/** EWO-Gerüst: je Welle das Extrem, dazu Korrekturen ab der Mindestgröße im Schenkel */
function scaffoldRule(ewo: Series, minLeg: Size): ZugRule {
  let open: ZugPoint[] = [];
  return (zug, f) => {
    const w = ewo[f.idx];
    if (w === null) return null;
    const last = zug[zug.length - 1];
    if (!last) return phaseSide(w) === f.side ? { cut: 0, add: [f] } : null;
    if (last.side === f.side) {
      if (!beyond(f.side, f, last)) {
        open.push(f);
        return null;
      }
      const prev = zug[zug.length - 2];
      const counter = open.filter((x) => x.side !== f.side);
      const end = counter.length > 0 ? counter.reduce((best, x) => (beyond(x.side, x, best) ? x : best)) : null;
      open = [];
      const big = end && Math.abs(end.price - last.price) >= minLeg(end.idx) && (!prev || beyond(f.side, end, prev));
      return big ? { cut: 0, add: [end, f] } : { cut: 1, add: [f] };
    }
    if (phaseSide(w) !== f.side) {
      open.push(f);
      return null;
    }
    const inner = innerCorrections(open, last, f, minLeg);
    open = [];
    return { cut: 0, add: [...inner, f] };
  };
}

/** Wie weit der EWO in der Korrektur von seinem Phasen-Extrem zurückkam (0 bis 1, 1 = Vorzeichenwechsel) */
function ewoRetreat(ewo: Series, from: number, to: number): number {
  const w = ewo[from];
  if (w === null) return 1;
  const s = w > 0 ? 1 : -1;
  const sameSign = (i: number) => (ewo[i] ?? 0) * s > 0;
  let start = from;
  while (start > 0 && sameSign(start - 1)) start--;
  let peak = 0;
  let low = Infinity;
  for (let i = start; i <= Math.min(ewo.length - 1, to + FRZ_PARAMS.neighbors); i++) {
    const v = ewo[i];
    if (v === null) continue;
    if (v * s <= 0) return 1;
    if (i <= to) peak = Math.max(peak, v * s);
    if (i >= from) low = Math.min(low, v * s);
  }
  return peak > 0 ? 1 - low / peak : 1;
}

/** Mindestgröße; bricht die Fortsetzung das Extrem und kam der EWO in der Korrektur kaum zurück, fällt die Korrektur weg */
function filterRule(ewo: Series, minLeg: Size, limit: number): ZugRule {
  const size = sizeRule(minLeg);
  return (zug, f) => {
    const edit = size(zug, f);
    if (!edit) return null;
    const head = zug.slice(0, zug.length - edit.cut);
    if (head.length < 3) return edit;
    const [a, b, c] = head.slice(-3);
    const continues = beyond(b.side, f, b) && beyond(b.side, c, a);
    return continues && ewoRetreat(ewo, b.idx, c.idx) < limit ? { cut: edit.cut + 2, add: [f] } : edit;
  };
}

export function zugRule(o: TrendOptions, bars: readonly FormationBar[], minLeg: Size): ZugRule {
  if (o.rule === 'groesse') return sizeRule(minLeg);
  const ewo = wave(bars, o.ewoFast, o.ewoSlow);
  if (o.rule === 'welle') return waveRule(ewo);
  if (o.rule === 'geruest') return scaffoldRule(ewo, minLeg);
  return filterRule(ewo, minLeg, o.ewoRetreat);
}
