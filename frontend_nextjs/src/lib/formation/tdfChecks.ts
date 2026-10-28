/**
 * Trendfortsetzung (TDF): Prüfung je Bedingungs-ID und Zeichnungen Z-TDF-01 bis Z-TDF-10.
 * `analyzeTdf` sucht je geladener Zeiteinheit und je Unterform (Flagge, Dreieck, Schale, Konsolidierung) die Punkte und misst die
 * Aktivierung; `checkTdfCandidate` prüft eigene Punkte. Jeder Kandidat trägt alle IDs; IDs einer fremden Unterform sind „nicht messbar“.
 *
 * Lesart der Zustände: bei Pflicht und Verstärkung heißt ☑ „die Bedingung gilt“, bei den Ausschlüssen „liegt vor“ (also ausgeschlossen).
 * Kauf (Aufwärtstrend, Hochs als Extrem) und Verkauf (Abwärtstrend) sind derselbe Code. TDF-19 und TDF-26 sind Einstiegsregeln, keine Eigenschaft
 * der Kerzen: sie bleiben „nicht messbar“ (TDF-04 misst den Schluss). TDF-27 ist entfallen.
 */
import type { FormationContext } from './context';
import { trendDirUpTo } from './f2618';
import { nearEdge } from './cdt';
import { closesBeyond, otherSide, outward, wickEnd, zoneGeometry, type Rect, type ZoneSide } from './frz';
import { closesInRowBeyond, type ObPoint } from './obo';
import { FRZ_PARAMS, TDF_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, envFor, type Env } from './reasons';
import {
  alternatingCount,
  closeBeyondAfter,
  depthOf,
  farEdge,
  impulseOf,
  lineAt,
  pauseExtreme,
  reaches,
  sideOf,
  signOf,
  type Impulse,
  type Touch,
} from './tdf';
import { basesFor, recentPeaks, type TdfBase, type TdfForm } from './tdfForms';
import type { Anchor, Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Verdict } from './types';
import { anchorAt, fractalDone, ids, unmeasurable } from './xabcd';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'TDF-01': ['required', 'confirmed'],
  'TDF-02': ['required', 'confirmed'],
  'TDF-03': ['bonus', 'assumption'],
  'TDF-04': ['required', 'confirmed'],
  'TDF-05': ['required', 'confirmed'],
  'TDF-06': ['exclusion', 'assumption'],
  'TDF-07': ['exclusion', 'assumption'],
  'TDF-08': ['exclusion', 'confirmed'],
  'TDF-09': ['bonus', 'confirmed'],
  'TDF-10': ['required', 'confirmed'],
  'TDF-11': ['required', 'confirmed'],
  'TDF-12': ['bonus', 'assumption'],
  'TDF-13': ['required', 'confirmed'],
  'TDF-14': ['bonus', 'confirmed'],
  'TDF-15': ['exclusion', 'confirmed'],
  'TDF-16': ['required', 'confirmed'],
  'TDF-17': ['bonus', 'confirmed'],
  'TDF-18': ['bonus', 'assumption'],
  'TDF-19': ['required', 'confirmed'],
  'TDF-20': ['exclusion', 'confirmed'],
  'TDF-21': ['required', 'confirmed'],
  'TDF-22': ['required', 'confirmed'],
  'TDF-23': ['bonus', 'secondary'],
  'TDF-24': ['required', 'confirmed'],
  'TDF-25': ['exclusion', 'confirmed'],
  'TDF-26': ['exclusion', 'confirmed'],
  'TDF-28': ['bonus', 'secondary'],
  'TDF-29': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks (TDF-27 ist entfallen) */
export const TDF_CHECK_IDS: readonly string[] = Object.keys(RULES);

const n2 = (list: number[]) => ids('TDF', list);
const COMMON = n2([1, 2, 3, 4, 5, 6, 7, 8, 9]);
/** Bedingungen je Unterform, die ein Kandidat misst; alle anderen sind „nicht messbar“ */
const OWN: Record<TdfForm, string[]> = {
  flag: [...COMMON, ...n2([10, 11, 12, 13, 14, 15, 28])],
  triangle: [...COMMON, ...n2([16, 17, 18, 19, 20, 28])],
  bowl: [...COMMON, ...n2([21, 22, 23])],
  box: [...COMMON, ...n2([24, 25, 26, 29])],
};
/** Bedingungen, an denen die Auswahl der Punkte misst: Form (Vortrend, Punkte, Pause) und die Ausschlüsse */
const FORM_IDS: Record<TdfForm, string[]> = {
  flag: n2([1, 2, 10, 11, 13]),
  triangle: n2([1, 2, 16]),
  bowl: n2([1, 2, 21, 22]),
  box: n2([1, 2, 24]),
};
const EXCLUSION_IDS: Record<TdfForm, string[]> = {
  flag: n2([6, 7, 8, 15]),
  triangle: n2([6, 7, 8, 20]),
  bowl: n2([6, 7, 8]),
  box: n2([6, 7, 8, 25]),
};
const FORMS: readonly TdfForm[] = ['flag', 'triangle', 'bowl', 'box'];

export type TdfPointsInput =
  | { form: 'flag'; tf: ContextTimeframe; h1: Anchor; c1: Anchor; f1: Anchor; c2?: Anchor }
  | { form: 'triangle'; tf: ContextTimeframe; h1: Anchor; l1: Anchor; h2: Anchor; l2?: Anchor }
  | { form: 'bowl'; tf: ContextTimeframe; h1: Anchor; low: Anchor; handle?: Anchor }
  | { form: 'box'; tf: ContextTimeframe; h1: Anchor; tops?: Anchor[]; bottoms: Anchor[] };

export interface TdfAnalysis {
  tf: ContextTimeframe;
  /** Unterform des gewählten Kandidaten; null ohne Kandidat */
  form: TdfForm | null;
  candidate: Candidate;
  /** der beste Kandidat je Unterform, die einen hat */
  forms: { form: TdfForm; candidate: Candidate }[];
}

interface Res {
  state: CheckState;
  value?: number;
  kind?: RuleKind;
}

const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

/** Keine Kerze `from`…`to` ist volumenstark (TDF-03); null, solange eine nicht messbar ist oder keine Kerze da ist */
function calm(wide: readonly (boolean | null)[], from: number, to: number): boolean | null {
  if (from > to) return null;
  let unknown = false;
  for (let k = from; k <= to; k++) {
    if (wide[k] === true) return false;
    if (wide[k] === null) unknown = true;
  }
  return unknown ? null : true;
}

/** Kein getestete Wechselzone zwischen Ausbruch und Ziel (TDF-09); Zone von H1 zählt nicht */
function flipZoneFree(env: Env, es: ZoneSide, zoneH: Rect, from: number, to: number): boolean {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const insideH = (z: Rect) => z.bottom <= zoneH.top && z.top >= zoneH.bottom;
  return ![...env.frz.zones, ...env.frz.reversed].some((z) => z.side === es && z.tests >= 1 && z.rect.top >= lo && z.rect.bottom <= hi && !insideH(z.rect));
}

/** ☑, wenn erfüllt; sonst ☐ sobald der Ausbruch da ist, vorher „nicht messbar“ (die Pause läuft noch) */
function pending(ok: boolean, brk: number | null): CheckState {
  if (ok) return 'met';
  return brk === null ? U : 'unmet';
}

/** Kerze, ab der der Schluss jenseits der Kante gesucht wird: nach dem letzten Punkt der Struktur über der Kante */
function searchFrom(base: TdfBase): number {
  if (base.form === 'flag') return base.f1.idx;
  if (base.form === 'triangle') return base.h2.idx;
  return base.h1.idx;
}

/** Struktur der Pause ist fertig: Flagge mit zweitem Tief, Box mit allen Berührungen; Dreieck und Schale mit ihren Punkten */
function isShapeDone(base: TdfBase, box: { top: number; bottom: number }): boolean {
  if (base.form === 'flag') return base.c2 !== null;
  if (base.form === 'box') return meets(box);
  return true;
}

/** Zone von H1 (Z-TDF-04) zeigt diese Bedingung je Unterform; die Fib auf den Mast zeigt zusätzlich diese */
const ZONE_RULE: Record<'triangle' | 'bowl' | 'box', number> = { triangle: 16, bowl: 4, box: 24 };
const FIB_RULE: Record<TdfForm, number[]> = { flag: [14], triangle: [], bowl: [21], box: [] };

const meets = (c: { top: number; bottom: number }) => c.top >= TDF_PARAMS.touches.top && c.bottom >= TDF_PARAMS.touches.bottom;

function evaluate(env: Env, tf: ContextTimeframe, es: ZoneSide, base: TdfBase): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const cs = otherSide(es);
  const { h1 } = base;
  const imp = impulseOf(bars, es, h1);
  const zoneH = zoneGeometry(bars, h1.idx, es, tf);
  const flatEdge = farEdge(es, zoneH);
  const sign = signOf(es);
  const res = new Map<string, Res>();
  const put = (id: string, state: CheckState, value?: number, kind?: RuleKind) => res.set(id, { state, value, kind });

  // Kante der Aktivierung (Flagge: obere Linie, sonst Oberkante der Zone von H1) und Beginn der Suche nach dem Schluss
  const edgeAt = base.form === 'flag' ? (time: number) => lineAt(bars, h1, base.f1, time) : () => flatEdge;
  const from = searchFrom(base);
  const brk = closeBeyondAfter(bars, es, edgeAt, from);
  const pe = brk === null ? last : brk - 1;
  const pl = pauseExtreme(bars, cs, h1.idx + 1, pe);
  const depth = pl ? depthOf(es, h1, imp.mast, pl.price) : null;
  const hasS = imp.s !== null && imp.mast > 0;

  // Berührungen für die Box und die abwechselnde Zählung (TDF-24, TDF-28, TDF-29)
  const floor = base.form === 'box' ? zoneGeometry(bars, base.bottoms[0].idx, cs, tf) : null;
  const tops = base.form === 'box' ? [h1, ...base.tops.filter((p) => p.idx <= pe && reaches(es, p.price, zoneH))] : [];
  const bottoms = base.form === 'box' && floor ? base.bottoms.filter((p) => p.idx <= pe && reaches(cs, p.price, floor)) : [];
  const touch = (list: readonly ObPoint[], top: boolean): Touch[] => list.map((p) => ({ idx: p.idx, top }));
  const boxCount = { top: tops.length, bottom: bottoms.length };

  const shapeDone = isShapeDone(base, boxCount);

  // Gemeinsam
  const trend = trendDirUpTo(env, tf, h1.idx);
  put('TDF-01', trend === null ? U : flag(trend === (es === 'resistance' ? 'up' : 'down')));
  put('TDF-02', h1.idx + FRZ_PARAMS.neighbors > last ? U : flag(fractalDone(bars, h1, es) && hasS));
  const calmPause = calm(view.wide, h1.idx + 1, pe);
  put('TDF-03', tri(calmPause), undefined, base.form === 'bowl' ? 'required' : undefined);
  put('TDF-04', shapeDone ? flag(brk !== null) : U);
  if (brk !== null) put('TDF-05', tri(view.wide[brk]));
  else put('TDF-05', shapeDone ? 'unmet' : U);
  const zoneS = imp.s ? zoneGeometry(bars, imp.s.idx, cs, tf) : null;
  put('TDF-06', zoneS ? flag(closesInRowBeyond(bars, cs, farEdge(cs, zoneS), h1.idx + 1, pe)) : U);
  put('TDF-07', depth === null ? U : flag(depth > TDF_PARAMS.maxDepth), depth ?? undefined);
  put('TDF-08', flag(TDF_PARAMS.belowH1.includes(tf)));

  // Ziel (Anzeige, E-5, E-6, E-7, E-12): Mastprojektion D ab dem Ende der Pause, bei Dreieck und Box die Höhe H ab der Oberkante
  let target: number | null = null;
  const mastTarget = pl && hasS ? pl.price + sign * imp.mast : null;
  if (base.form === 'flag' || base.form === 'bowl') target = mastTarget;
  if (base.form === 'triangle' && pl) {
    const height = outward(es, flatEdge) - outward(es, pl.price);
    const heightTarget = flatEdge + sign * height;
    target = mastTarget !== null && Math.abs(mastTarget - flatEdge) < Math.abs(heightTarget - flatEdge) ? mastTarget : heightTarget;
  }
  if (base.form === 'box' && floor) {
    const height = outward(es, nearEdge(es, zoneH)) - outward(es, nearEdge(cs, floor));
    target = height > 0 ? flatEdge + sign * height : null;
  }
  put('TDF-09', brk !== null && target !== null ? flag(flipZoneFree(env, es, zoneH, bars[brk].close, target)) : U);

  if (base.form === 'flag') {
    const { c1, f1, c2 } = base;
    const line = (time: number) => lineAt(bars, h1, f1, time);
    put('TDF-10', flag(hasS), imp.mast);
    const ordered = c1.idx > h1.idx && f1.idx > c1.idx;
    const upperOk = outward(es, f1.price) < outward(es, h1.price) && !reaches(es, f1.price, zoneH);
    const firstWave = ordered && upperOk && fractalDone(bars, c1, cs) && fractalDone(bars, f1, es);
    if (c2 === null) put('TDF-11', U);
    else put('TDF-11', flag(firstWave && c2.idx > f1.idx && fractalDone(bars, c2, cs) && (brk === null || c2.idx < brk)));
    const atr = c2 ? (view.atr[c2.idx] ?? null) : null;
    if (c2 && atr !== null && atr > 0) {
      const copy = c1.price + line(bars[c2.idx].time) - line(bars[c1.idx].time);
      put('TDF-12', flag(Math.abs(c2.price - copy) <= TDF_PARAMS.parallelAtr * atr), Math.abs(c2.price - copy) / atr);
    } else put('TDF-12', U);
    // Berührungen: H1 und F1 liegen auf der Linie; kein Körperschluss darüber, bevor die Flagge aktiv wird
    let closedAbove = false;
    for (let k = h1.idx + 1; k <= Math.min(f1.idx, last); k++) if (closesBeyond(bars[k], line(bars[k].time), es)) closedAbove = true;
    put('TDF-13', flag(!closedAbove && f1.idx > h1.idx));
    put('TDF-14', depth === null ? U : flag(depth >= TDF_PARAMS.flagDepth.min && depth <= TDF_PARAMS.flagDepth.max), depth ?? undefined);
    if (c2) {
      const counter = closeBeyondAfter(bars, cs, (time) => lineAt(bars, c1, c2, time), c2.idx);
      put('TDF-15', flag(counter !== null && (brk === null || counter < brk)));
      put('TDF-28', flag(meets(alternatingCount([...touch([h1, f1], true), ...touch([c1, c2], false)]))));
    } else {
      put('TDF-15', U);
      put('TDF-28', U);
    }
  }

  if (base.form === 'triangle') {
    const { l1, h2, l2 } = base;
    if (h2.idx + FRZ_PARAMS.neighbors > last) put('TDF-16', U);
    else {
      let closedAbove = false;
      for (let k = h1.idx + 1; k <= h2.idx; k++) if (closesBeyond(bars[k], flatEdge, es)) closedAbove = true;
      put('TDF-16', flag(h2.idx > l1.idx && l1.idx > h1.idx && fractalDone(bars, h2, es) && reaches(es, h2.price, zoneH) && !closedAbove));
    }
    put('TDF-17', l2 === null ? U : flag(outward(cs, l2.price) < outward(cs, l1.price)));
    const correction = outward(es, h1.price) - outward(es, l1.price);
    const previous = imp.prev && imp.s ? outward(es, imp.prev.price) - outward(es, imp.s.price) : 0;
    const ratio = previous > 0 ? correction / previous : null;
    put('TDF-18', ratio === null ? U : flag(ratio >= TDF_PARAMS.similar.min && ratio <= TDF_PARAMS.similar.max), ratio ?? undefined);
    put('TDF-19', U);
    let fell = false;
    for (let k = l1.idx + 1; k <= pe; k++) if (outward(cs, wickEnd(bars[k], cs)) > outward(cs, l1.price)) fell = true;
    put('TDF-20', flag(fell));
    if (l2) put('TDF-28', flag(meets(alternatingCount([...touch([h1, h2], true), ...touch([l1, l2], false)]))));
    else put('TDF-28', brk === null ? U : 'unmet');
  }

  if (base.form === 'bowl') {
    const { low, handle } = base;
    put('TDF-21', depth === null ? U : flag(depth >= TDF_PARAMS.bowl.reach && depth < TDF_PARAMS.bowl.spare && fractalDone(bars, low, cs) && (brk === null || low.idx < brk)), depth ?? undefined);
    put('TDF-22', tri(calmPause));
    const level = outward(es, h1.price) - TDF_PARAMS.handleLevel * (outward(es, h1.price) - outward(es, low.price));
    if (handle) put('TDF-23', flag(handle.idx > low.idx && outward(es, handle.price) > level));
    else put('TDF-23', brk === null ? U : 'unmet');
  }

  if (base.form === 'box' && floor) {
    put('TDF-24', pending(meets(boxCount), brk));
    const counter = closeBeyondAfter(bars, cs, () => farEdge(cs, floor), base.bottoms[0].idx);
    put('TDF-25', flag(counter !== null && (brk === null || counter < brk)));
    put('TDF-26', U);
    const enough = meets(alternatingCount([...touch(tops, true), ...touch(bottoms, false)]));
    put('TDF-29', pending(enough, brk));
  }

  const checks: Check[] = TDF_CHECK_IDS.map((id) => {
    const [defaultKind, status] = RULES[id];
    const r = OWN[base.form].includes(id) ? res.get(id) : undefined;
    return { id, kind: r?.kind ?? defaultKind, status, state: r?.state ?? U, ...(r?.value === undefined ? {} : { value: r.value }), drawings: [] };
  });
  const drawings = drawingsOf({ bars, es, base, imp, zoneH, floor, brk, pl, target, last });
  const withDrawings = checks.map((c) => ({ ...c, drawings: [...new Set(drawings.filter((x) => x.rules.includes(c.id)).map((x) => x.id))] }));

  const stateOf = (id: string) => checks.find((c) => c.id === id)!.state;
  let verdict: Verdict = 'valid';
  if (EXCLUSION_IDS[base.form].some((id) => stateOf(id) === 'met') || FORM_IDS[base.form].some((id) => stateOf(id) === 'unmet')) verdict = 'invalid';
  else if (stateOf('TDF-04') !== 'met') verdict = 'forming';
  else if (stateOf('TDF-05') === 'unmet') verdict = 'invalid';

  const points: Candidate['points'] = { H1: anchorAt(bars, h1.idx, h1.price) };
  if (imp.s) points.S = anchorAt(bars, imp.s.idx, imp.s.price);
  const add = (name: string, p: ObPoint | null | undefined) => {
    if (p) points[name] = anchorAt(bars, p.idx, p.price);
  };
  if (base.form === 'flag') {
    add('C1', base.c1);
    add('F1', base.f1);
    add('C2', base.c2);
  }
  if (base.form === 'triangle') {
    add('L1', base.l1);
    add('H2', base.h2);
    add('L2', base.l2);
  }
  if (base.form === 'bowl') {
    add('LOW', base.low);
    add('HANDLE', base.handle);
  }
  if (base.form === 'box') add('FLOOR', base.bottoms[0]);
  if (brk !== null) points.B = anchorAt(bars, brk, bars[brk].close);
  return { code: 'TDF', side: sideOf(es), tf, points, checks: withDrawings, drawings, verdict };
}

interface DrawInput {
  bars: readonly FormationBar[];
  es: ZoneSide;
  base: TdfBase;
  imp: Impulse;
  zoneH: Rect;
  floor: Rect | null;
  brk: number | null;
  pl: ObPoint | null;
  target: number | null;
  last: number;
}

function drawingsOf(d: DrawInput): Drawing[] {
  const { bars, es, base, imp, zoneH, floor, brk, pl, target, last } = d;
  const at = (p: ObPoint): Anchor => ({ time: bars[p.idx].time, price: p.price });
  const lastTime = bars[last].time;
  const side = sideOf(es);
  const out: Drawing[] = [];
  const h1 = base.h1;
  const edge = farEdge(es, zoneH);

  if (base.form === 'flag') {
    const line = (time: number) => lineAt(bars, h1, base.f1, time);
    out.push({ id: 'Z-TDF-01a', tool: 'trendline', anchors: [at(h1), at(base.f1), { time: lastTime, price: line(lastTime) }], rules: n2([11, 13]), side });
    const copyLast = base.c1.price + line(lastTime) - line(bars[base.c1.idx].time);
    out.push({ id: 'Z-TDF-01b', tool: 'trendline', anchors: [at(base.c1), { time: lastTime, price: copyLast }], rules: n2([12, 15]), side });
  }
  if (base.form === 'flag' && imp.s) out.push({ id: 'Z-TDF-02', tool: 'zone', anchors: [at(imp.s), at(h1)], rules: n2([10]), side });
  if (base.form !== 'flag') {
    const rules = n2([ZONE_RULE[base.form]]);
    out.push({ id: 'Z-TDF-04', tool: 'zone', anchors: [{ time: bars[h1.idx].time, price: zoneH.bottom }, { time: lastTime, price: zoneH.top }], rules, side });
  }
  if (base.form === 'triangle' && base.l2) {
    const slope = (base.l2.price - base.l1.price) / (bars[base.l2.idx].time - bars[base.l1.idx].time);
    out.push({ id: 'Z-TDF-05', tool: 'trendline', anchors: [at(base.l1), at(base.l2), { time: lastTime, price: base.l2.price + slope * (lastTime - bars[base.l2.idx].time) }], rules: n2([17, 20]), side });
  }
  if (imp.s) {
    const levels = base.form === 'bowl' ? [TDF_PARAMS.bowl.reach, TDF_PARAMS.bowl.spare] : [TDF_PARAMS.flagDepth.min, TDF_PARAMS.flagDepth.max, TDF_PARAMS.maxDepth];
    out.push({ id: 'Z-TDF-06', tool: 'fib', anchors: [at(imp.s), at(h1)], levels, rules: n2([7, ...FIB_RULE[base.form]]), side });
  }
  if (base.form === 'bowl' && imp.s && pl) out.push({ id: 'Z-TDF-07', tool: 'fibExt', anchors: [at(imp.s), at(h1), at(pl)], levels: [...TDF_PARAMS.inversion], rules: [], side });
  if (base.form === 'box' && floor) {
    const near = nearEdge(es, zoneH);
    const lower = nearEdge(otherSide(es), floor);
    out.push({ id: 'Z-TDF-08', tool: 'zone', anchors: [{ time: bars[h1.idx].time, price: Math.min(near, lower) }, { time: lastTime, price: Math.max(near, lower) }], rules: n2([24, 29]), side });
  }
  if (imp.s && pl && imp.mast > 0) {
    out.push({ id: 'Z-TDF-03', tool: 'zigzag', anchors: [at(imp.s), at(h1), at(pl), { time: bars[pl.idx].time, price: pl.price + signOf(es) * imp.mast }], rules: [], side });
  }
  if (brk !== null && target !== null) {
    if (base.form === 'triangle' || base.form === 'box') {
      out.push({ id: 'Z-TDF-10', tool: 'zone', anchors: [{ time: bars[brk].time, price: Math.min(edge, target) }, { time: bars[brk].time, price: Math.max(edge, target) }], rules: [], side });
    }
    out.push({ id: 'Z-TDF-09', tool: 'label', anchors: [{ time: lastTime, price: target }], rules: [], side });
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('TDF', tf, TDF_CHECK_IDS, RULES);

const misses = (cand: Candidate, form: TdfForm): number =>
  cand.checks.filter((c) => (FORM_IDS[form].includes(c.id) && c.state === 'unmet') || (EXCLUSION_IDS[form].includes(c.id) && c.state === 'met')).length;

const RANK: Record<Verdict, number> = { valid: 0, forming: 1, invalid: 2 };

interface Scored {
  form: TdfForm;
  candidate: Candidate;
  misses: number;
  recent: number;
}

/** Wenigste verletzte Bedingungen, dann gültig vor im Aufbau vor ungültig, dann das jüngste Impulsende */
const better = (a: Scored, b: Scored | undefined): boolean => {
  if (b === undefined || a.misses !== b.misses) return b === undefined || a.misses < b.misses;
  const [ra, rb] = [RANK[a.candidate.verdict], RANK[b.candidate.verdict]];
  return ra !== rb ? ra < rb : a.recent > b.recent;
};

/** Sucht je geladener Zeiteinheit (hoch → tief) und je Unterform die Punkte; `candidate` ist der beste Kandidat aller Unterformen */
export function analyzeTdf(ctx: FormationContext, t: number): TdfAnalysis[] {
  const tfs = ctx.timeframes();
  const root = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!root) return [];
  return tfs.map((tf) => {
    const env = envFor(root, ctx, t, tf);
    const bars = env.views.get(tf)!.bars;
    const bestOf = new Map<TdfForm, Scored>();
    for (const es of ['resistance', 'support'] as const) {
      for (const h1 of recentPeaks(bars, es)) {
        for (const base of basesFor(bars, es, tf, h1)) {
          const candidate = evaluate(env, tf, es, base);
          const scored: Scored = { form: base.form, candidate, misses: misses(candidate, base.form), recent: h1.idx };
          if (better(scored, bestOf.get(base.form))) bestOf.set(base.form, scored);
        }
      }
    }
    const forms = FORMS.filter((f) => bestOf.has(f)).map((f) => ({ form: f, candidate: bestOf.get(f)!.candidate }));
    let top: Scored | undefined;
    for (const f of FORMS) {
      const s = bestOf.get(f);
      if (s && better(s, top)) top = s;
    }
    return { tf, form: top?.form ?? null, candidate: top ? top.candidate : empty(tf), forms };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen oder stimmt die Reihenfolge nicht, sind die Prüfungen nicht messbar */
export function checkTdfCandidate(ctx: FormationContext, t: number, input: TdfPointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return empty(input.tf);
  const resolve = (a: Anchor): ObPoint | null => {
    const idx = bars.findIndex((b) => b.time === a.time);
    return idx < 0 ? null : { idx, price: a.price };
  };
  const rising = (list: (ObPoint | null)[]): list is ObPoint[] => list.every((p) => p !== null) && list.every((p, i) => i === 0 || p!.idx > list[i - 1]!.idx);
  const optional = (a: Anchor | undefined): ObPoint | null | undefined => (a ? resolve(a) : undefined);
  const h1 = resolve(input.h1);
  let es: ZoneSide;
  let base: TdfBase;
  if (input.form === 'flag') {
    const [c1, f1, c2] = [resolve(input.c1), resolve(input.f1), optional(input.c2)];
    if (!h1 || !rising([h1, c1, f1, ...(c2 === undefined ? [] : [c2])]) || !c1 || !f1 || c2 === null) return empty(input.tf);
    es = input.c1.price < input.h1.price ? 'resistance' : 'support';
    base = { form: 'flag', h1, c1, f1, c2: c2 ?? null };
  } else if (input.form === 'triangle') {
    const [l1, h2, l2] = [resolve(input.l1), resolve(input.h2), optional(input.l2)];
    if (!h1 || !rising([h1, l1, h2, ...(l2 === undefined ? [] : [l2])]) || !l1 || !h2 || l2 === null) return empty(input.tf);
    es = input.l1.price < input.h1.price ? 'resistance' : 'support';
    base = { form: 'triangle', h1, l1, h2, l2: l2 ?? null };
  } else if (input.form === 'bowl') {
    const [low, handle] = [resolve(input.low), optional(input.handle)];
    if (!h1 || !rising([h1, low, ...(handle === undefined ? [] : [handle])]) || !low || handle === null) return empty(input.tf);
    es = input.low.price < input.h1.price ? 'resistance' : 'support';
    base = { form: 'bowl', h1, low, handle: handle ?? null };
  } else {
    const tops = (input.tops ?? []).map(resolve);
    const bottoms = input.bottoms.map(resolve);
    if (!h1 || bottoms.length === 0 || !rising([h1, ...tops]) || !rising([h1, ...bottoms])) return empty(input.tf);
    es = input.bottoms[0].price < input.h1.price ? 'resistance' : 'support';
    base = { form: 'box', h1, tops: tops as ObPoint[], bottoms: bottoms as ObPoint[] };
  }
  return evaluate(env, input.tf, es, base);
}
