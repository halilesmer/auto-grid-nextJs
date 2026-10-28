/**
 * Kopf-Schulter (OBO, TOBO): Prüfung je Bedingungs-ID und Zeichnungen Z-OBO-01 bis Z-OBO-08.
 * `analyzeObo` sucht je geladener Zeiteinheit und je Seite die Punkte LS, N1, K, N2, RS und misst den Nackenbruch;
 * `checkOboCandidate` prüft eigene Punkte.
 *
 * Lesart der Zustände: bei Pflicht und Verstärkung heißt ☑ „die Bedingung gilt“, bei den Ausschlüssen OBO-13 und OBO-14
 * „liegt vor“ (also ausgeschlossen). OBO-05 ist ☑, wenn zwischen N1 und N2 der Trend nicht gedreht hat (keine zwei Schlüsse in Folge jenseits der Zone von N1). OBO-06 gilt auch,
 * wenn OBO-07 ☑ ist (Ausnahme). OBO-13 wird allein mit Schlüssen der Formations-Zeiteinheit gemessen: ein Schluss in einer tieferen
 * Zeiteinheit zählt nicht. Ist die rechte Schulter noch nicht fertig, sind alle Bedingungen, die sie brauchen, nicht messbar.
 * Verkauf (OBO) nach Hochs LS, K, RS; Kauf (TOBO) nach Tiefs.
 */
import type { FormationContext } from './context';
import { trendDirUpTo } from './f2618';
import { innerLevels, swingsAfter } from './lib';
import { outward, zoneGeometry, type ZoneSide } from './frz';
import {
  basesOf,
  closedBeyondRs,
  necklineAt,
  neckBreak,
  closesInRowBeyond,
  type ObPoint,
  type OboBase,
} from './obo';
import { FRZ_PARAMS, OBO_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, envFor, type Env } from './reasons';
import { divergenceOf, tradeSideOf } from './sig';
import type { Anchor, Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Verdict } from './types';
import { anchorAt, fractalDone, ids, unmeasurable } from './xabcd';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'OBO-01': ['required', 'confirmed'],
  'OBO-02': ['required', 'confirmed'],
  'OBO-03': ['required', 'confirmed'],
  'OBO-04': ['required', 'confirmed'],
  'OBO-05': ['required', 'confirmed'],
  'OBO-06': ['bonus', 'assumption'],
  'OBO-07': ['bonus', 'assumption'],
  'OBO-08': ['bonus', 'confirmed'],
  'OBO-09': ['bonus', 'confirmed'],
  'OBO-10': ['bonus', 'confirmed'],
  'OBO-11': ['required', 'confirmed'],
  'OBO-12': ['required', 'confirmed'],
  'OBO-13': ['exclusion', 'confirmed'],
  'OBO-14': ['exclusion', 'confirmed'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const OBO_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Bedingungen, an denen die Auswahl der Punkte misst: Form (Punkte, Verhältnisse, Vortrend) und die Ausschlüsse */
const FORM_IDS = ['OBO-01', 'OBO-02', 'OBO-03', 'OBO-04', 'OBO-05'];
const EXCLUSION_IDS = ['OBO-13', 'OBO-14'];

export interface OboPointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen: Öffnungszeit der Kerze und Preis */
  ls: Anchor;
  n1: Anchor;
  k: Anchor;
  n2: Anchor;
  /** Ohne Angabe: die rechte Schulter ist noch nicht fertig */
  rs?: Anchor;
}

export interface OboAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number, kind?: RuleKind): Check => {
  const [defaultKind, status] = RULES[id];
  return { id, kind: kind ?? defaultKind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

/** Ziel (E-5 a): Kopfhöhe h senkrecht unter dem Kopf bis zur Nackenlinie, ab der Nackenlinie an der Bruchkerze in Bruchrichtung abgetragen */
function targetOf(es: ZoneSide, h: number, neckAtBreak: number): number {
  return es === 'resistance' ? neckAtBreak - h : neckAtBreak + h;
}

function evaluate(env: Env, tf: ContextTimeframe, es: ZoneSide, base: OboBase): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const cs: ZoneSide = es === 'resistance' ? 'support' : 'resistance';
  const { ls, k, n1, n2, rs } = base;
  const last = bars.length - 1;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number, kind?: RuleKind) => checks.push(mk(id, state, value, kind));

  const times = n1 && n2 ? { t1: bars[n1.idx].time, t2: bars[n2.idx].time } : null;
  const neck = (time: number) => necklineAt(times!, n1!, n2!, time);
  const rsPending = rs === null || rs.idx + FRZ_PARAMS.neighbors > last;
  const brk = rs && n1 && n2 ? neckBreak(bars, cs, n1, n2, rs.idx) : null;
  const wanted = es === 'resistance' ? 'up' : 'down';

  // Form
  const trend = trendDirUpTo(env, tf, k.idx);
  add('OBO-01', trend === null ? U : flag(trend === wanted));
  const shapeOk = n1 !== null && n2 !== null && rs !== null && [ls, k, rs].every((p) => fractalDone(bars, p, es)) && [n1, n2].every((p) => fractalDone(bars, p, cs));
  add('OBO-02', rsPending ? U : flag(shapeOk));
  add('OBO-03', flag(outward(es, k.price) > outward(es, ls.price)));
  add('OBO-04', rs ? flag(outward(es, rs.price) < outward(es, k.price)) : U);
  if (n1 && n2) {
    const zone = zoneGeometry(bars, n1.idx, cs, tf);
    const edge = cs === 'support' ? zone.bottom : zone.top;
    add('OBO-05', flag(!closesInRowBeyond(bars, cs, edge, n1.idx + 1, n2.idx)));
  } else add('OBO-05', U);
  const small = n1 && n2 && rs ? (outward(es, rs.price) - outward(es, n2.price)) / (outward(es, ls.price) - outward(es, n1.price)) : null;
  const ratioOk = small !== null && Number.isFinite(small) ? small >= OBO_PARAMS.shoulderRatio.min && small <= OBO_PARAMS.shoulderRatio.max : null;
  const long = n2 && brk !== null ? brk - n2.idx >= OBO_PARAMS.consolidation * (n2.idx - k.idx) : null;
  // OBO-06 und OBO-07 sind Annahmen (E-6): die Ausnahme „konsolidierte Schulter“ gilt auch ohne Verhältnis
  // Ist das Verhältnis ☐, entscheidet erst der Bruch über die Ausnahme (OBO-07)
  const undecided: CheckState = ratioOk === null || long === null ? U : 'unmet';
  const shoulders: CheckState = ratioOk === true || long === true ? 'met' : undecided;
  add('OBO-06', shoulders, small !== null && Number.isFinite(small) ? small : undefined);
  add('OBO-07', tri(long));

  // Ort und Kontext
  const div = divergenceOf(env.trends.get(tf)!, es, ls.idx, k.idx);
  add('OBO-08', !div || div.a.wave === null || div.b.wave === null ? U : flag(div.strict));
  add('OBO-09', flag(OBO_PARAMS.timeframes.includes(tf)));
  let target: number | null = null;
  let height: number | null = null;
  if (times && n1 && n2 && brk !== null) {
    height = Math.abs(k.price - neck(bars[k.idx].time));
    target = targetOf(es, height, neck(bars[brk].time));
  }
  const atr = brk === null ? null : (view.atr[brk] ?? null);
  let meets: boolean | null = null;
  if (target !== null && atr !== null && rs) {
    // AB=CD in der Bewegung nach der rechten Schulter: A = RS, B und C sind die folgenden Schwungpunkte (cs, es); D = C + (B − A)
    const swings = swingsAfter(bars, rs, es, last);
    meets = innerLevels(swings, rs, cs, es).some((d) => Math.abs(d - target!) <= OBO_PARAMS.nearAtr * atr);
  }
  add('OBO-10', tri(meets));

  // Signal
  add('OBO-11', n1 && n2 && rs ? flag(brk !== null) : U);
  const complete = n1 !== null && n2 !== null && rs !== null;
  const noBreak: CheckState = complete ? 'unmet' : U;
  add('OBO-12', brk !== null ? tri(view.wide[brk]) : noBreak);

  // Ausschluss
  add('OBO-13', rs ? flag(closedBeyondRs(bars, rs, es)) : U);
  add('OBO-14', flag(OBO_PARAMS.belowH1.includes(tf)));

  const drawings = n1 && n2 && rs ? drawingsOf(bars, es, { ls, n1, k, n2, rs }, brk, target, height) : [];
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((x) => x.rules.includes(c.id)).map((x) => x.id))],
  }));

  const stateOf = (id: string) => checks.find((c) => c.id === id)!.state;
  const unmet = (id: string) => stateOf(id) === 'unmet';
  // Ohne fertige rechte Schulter oder ohne Nackenbruch ist die Formation im Aufbau
  let verdict: Verdict = 'valid';
  if (EXCLUSION_IDS.some((id) => stateOf(id) === 'met') || FORM_IDS.some(unmet)) verdict = 'invalid';
  else if (rsPending || n1 === null || n2 === null || unmet('OBO-11')) verdict = 'forming';
  else if (unmet('OBO-12')) verdict = 'invalid';

  const points: Candidate['points'] = { LS: anchorAt(bars, ls.idx, ls.price), K: anchorAt(bars, k.idx, k.price) };
  if (n1) points.N1 = anchorAt(bars, n1.idx, n1.price);
  if (n2) points.N2 = anchorAt(bars, n2.idx, n2.price);
  if (rs) points.RS = anchorAt(bars, rs.idx, rs.price);
  if (brk !== null && n1 && n2) points.B = anchorAt(bars, brk, bars[brk].close);
  return { code: 'OBO', side: tradeSideOf(es), tf, points, checks: withDrawings, drawings, verdict };
}

type Full = { ls: ObPoint; n1: ObPoint; k: ObPoint; n2: ObPoint; rs: ObPoint };

function drawingsOf(bars: readonly FormationBar[], es: ZoneSide, p: Full, brk: number | null, target: number | null, height: number | null): Drawing[] {
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const lastTime = bars[bars.length - 1].time;
  const side = tradeSideOf(es);
  const times = { t1: bars[p.n1.idx].time, t2: bars[p.n2.idx].time };
  const neckAt = (time: number) => necklineAt(times, p.n1, p.n2, time);
  const out: Drawing[] = [
    { id: 'Z-OBO-01', tool: 'zigzag', anchors: [at(p.ls.idx, p.ls.price), at(p.k.idx, p.k.price), at(p.rs.idx, p.rs.price)], rules: ids('OBO', [2, 3, 4]), side },
    {
      id: 'Z-OBO-02',
      tool: 'trendline',
      anchors: [at(p.n1.idx, p.n1.price), at(p.n2.idx, p.n2.price), { time: lastTime, price: neckAt(lastTime) }],
      rules: ids('OBO', [5, 11]),
      side,
    },
    {
      id: 'Z-OBO-03',
      tool: 'zone',
      anchors: [at(p.n1.idx, Math.min(p.n1.price, p.n2.price)), { time: lastTime, price: Math.max(p.n1.price, p.n2.price) }],
      rules: ids('OBO', [11]),
      side,
    },
    { id: 'Z-OBO-06', tool: 'label', anchors: [{ time: lastTime, price: p.rs.price }], rules: ids('OBO', [13]), side },
  ];
  if (brk !== null && target !== null && height !== null) {
    const neckK = neckAt(bars[p.k.idx].time);
    const neckB = neckAt(bars[brk].time);
    out.push(
      { id: 'Z-OBO-04', tool: 'zigzag', anchors: [at(p.k.idx, p.k.price), at(p.k.idx, neckK), at(brk, neckB), at(brk, target)], rules: [], side },
      { id: 'Z-OBO-05', tool: 'label', anchors: [{ time: lastTime, price: target }], rules: [], side },
      { id: 'Z-OBO-07', tool: 'zone', anchors: [at(brk, Math.min(neckB, bars[brk].close)), at(brk, Math.max(neckB, bars[brk].close))], rules: ids('OBO', [11]), side },
      { id: 'Z-OBO-08', tool: 'trendline', anchors: [at(p.rs.idx, p.rs.price), at(brk, neckB), { time: lastTime, price: target }], rules: [], side },
    );
  }
  return out;
}

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('OBO', tf, OBO_CHECK_IDS, RULES);

const misses = (cand: Candidate): number =>
  cand.checks.filter((c) => (FORM_IDS.includes(c.id) && c.state === 'unmet') || (EXCLUSION_IDS.includes(c.id) && c.state === 'met')).length;

/** Sucht je geladener Zeiteinheit (hoch → tief) und Seite die Punkte; es gilt der Kandidat mit den wenigsten verletzten Form-Bedingungen, bei Gleichstand der mit fertiger rechter Schulter, dann der jüngste */
export function analyzeObo(ctx: FormationContext, t: number): OboAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const bars = env.views.get(tf)!.bars;
    let best: { candidate: Candidate; unmet: number; done: boolean; recent: number } | null = null;
    for (const es of ['resistance', 'support'] as const) {
      for (const pair of basesOf(bars, es)) {
        const candidate = evaluate(env, tf, es, pair);
        const unmet = misses(candidate);
        const done = pair.rs !== null;
        const recent = pair.rs ? pair.rs.idx : pair.k.idx;
        // Bei gleich vielen Verstößen gilt die Formation mit fertiger rechter Schulter, dann die jüngste
        const better = best === null || unmet < best.unmet || (unmet === best.unmet && (done !== best.done ? done : recent > best.recent));
        if (better) best = { candidate, unmet, done, recent };
      }
    }
    return { tf, candidate: best ? best.candidate : empty(tf) };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen oder stimmt die Reihenfolge nicht, sind die Prüfungen nicht messbar */
export function checkOboCandidate(ctx: FormationContext, t: number, input: OboPointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const [i1, in1, ik, in2] = [idxOf(input.ls), idxOf(input.n1), idxOf(input.k), idxOf(input.n2)];
  const irs = input.rs ? idxOf(input.rs) : undefined;
  if (!(i1 >= 0 && in1 > i1 && ik > in1 && in2 > ik && irs !== -1 && (irs === undefined || irs > in2))) return empty(input.tf);
  const es: ZoneSide = input.k.price > input.n1.price ? 'resistance' : 'support';
  const pt = (idx: number, a: Anchor): ObPoint => ({ idx, price: a.price });
  const base: OboBase = {
    ls: pt(i1, input.ls),
    n1: pt(in1, input.n1),
    k: pt(ik, input.k),
    n2: pt(in2, input.n2),
    rs: input.rs && irs !== undefined ? pt(irs, input.rs) : null,
  };
  return evaluate(env, input.tf, es, base);
}
