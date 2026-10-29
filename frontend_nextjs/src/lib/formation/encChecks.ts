/**
 * Ending Channel (ENC): Prüfung je Bedingungs-ID und Zeichnungen Z-ENC-01 bis Z-ENC-03.
 * `analyzeEnc` sucht je geladener Zeiteinheit fünf aufeinanderfolgende Wendepunkte (Tief, Impulsende, Tief, zweites Extrem, zweites Tief):
 * die Trendlinie läuft durch die Startpunkte der letzten 2 Impulse (Aufwärtstrend: die ersten beiden Tiefs), die Kopie am äußersten Extrem ist die Gegenlinie des Kanals;
 * `checkEncCandidate` prüft eigene Punkte.
 *
 * Lesart der Zustände: Formkern (ENC-01 bis ENC-05) ist Pflicht, ENC-06 und ENC-07 sind Verstärkung. ENC-01 braucht eine tiefere
 * geladene Zeiteinheit; fehlt sie, ist der Zustand „nicht messbar“. ENC-05 ist ☑, sobald ein Schluss jenseits der Trendlinie liegt.
 * Verkauf nach Aufwärtstrend und Kauf nach Abwärtstrend sind derselbe Code.
 */
import type { FormationContext } from './context';
import { changedAfter, analyzeChannels, checkChannel, correctionLens, impulseLens, lowerTrendDir, measureBar, regularCorrections, trendDirAt, trendOf, type ChannelPointsInput } from './enc';
import { measureChannel, reversalSide, shrinks, slopesWithTrend, type Channel, type ChannelBase } from './lineChannel';
import { ENC_PARAMS, LINE_CHANNEL_PARAMS, type ContextTimeframe } from './params';
import type { Env } from './reasons';
import type { Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Verdict } from './types';
import { anchorAt, ids, unmeasurable } from './xabcd';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'ENC-01': ['required', 'secondary'],
  'ENC-02': ['required', 'secondary'],
  'ENC-03': ['required', 'secondary'],
  'ENC-04': ['required', 'secondary'],
  'ENC-05': ['required', 'secondary'],
  'ENC-06': ['bonus', 'secondary'],
  'ENC-07': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const ENC_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Form des Kanals: ist sie verletzt, ist die Formation ungültig */
const STRUCTURE_IDS = ids('ENC', [1, 2, 3]);

export type EncPointsInput = ChannelPointsInput;
export interface EncAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

const U: CheckState = 'unmeasurable';
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? U : flag(v));

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('ENC', tf, ENC_CHECK_IDS, RULES);

/** ENC-01: Trend der Formations-Zeiteinheit und, wenn geladen, der tieferen Zeiteinheit zeigen in die Richtung des Kanals (keine Flagge) */
function sameTrend(env: Env, tf: ContextTimeframe, c: Channel): boolean | null {
  const want = trendOf(c.base.es);
  const k = measureBar(c);
  if (trendDirAt(env.views.get(tf)!, k) !== want) return false;
  const lower = lowerTrendDir(env, tf, k);
  return lower === undefined ? null : lower === want;
}

function evaluate(env: Env, tf: ContextTimeframe, base: ChannelBase): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const c = measureChannel(bars, base, 'parallel');
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  add('ENC-01', tri(sameTrend(env, tf, c)));
  add('ENC-02', tri(shrinks(impulseLens(env, tf, c), LINE_CHANNEL_PARAMS.shrinkCount)));
  add('ENC-03', flag(slopesWithTrend(c).counter));
  const need = LINE_CHANNEL_PARAMS.touches;
  add('ENC-04', flag(c.count.top >= need.top && c.count.bottom >= need.bottom), c.count.top + c.count.bottom);
  add('ENC-05', flag(c.act !== null));
  add('ENC-06', flag(changedAfter(env, tf, c)));
  add('ENC-07', tri(regularCorrections(correctionLens(env, tf, c))));

  const drawings = drawingsOf(bars, c);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));
  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  let verdict: Verdict = 'valid';
  if (STRUCTURE_IDS.some((id) => stateOf(id) === 'unmet')) verdict = 'invalid';
  else if (c.act === null) verdict = 'forming';
  else if (stateOf('ENC-04') === 'unmet') verdict = 'invalid';

  const points: Candidate['points'] = {
    L0: anchorAt(bars, base.l0.idx, base.l0.price),
    H1: anchorAt(bars, base.hs.idx, base.hs.price),
    L1: anchorAt(bars, base.la.idx, base.la.price),
    H2: anchorAt(bars, base.h2.idx, base.h2.price),
    L2: anchorAt(bars, base.lb.idx, base.lb.price),
  };
  if (c.act !== null) points.X = anchorAt(bars, c.act, bars[c.act].close);
  return { code: 'ENC', side: reversalSide(base.es), tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(bars: readonly FormationBar[], c: Channel): Drawing[] {
  const last = bars.length - 1;
  const lastTime = bars[last].time;
  const { l0, hs, es } = c.base;
  const side = reversalSide(es);
  const rules = ids('ENC', [1, 3, 4, 5]);
  const height = c.extremeAt(last) - c.counterAt(last);
  const out: Drawing[] = [
    { id: 'Z-ENC-01', tool: 'trendline', anchors: [anchorAt(bars, l0.idx, l0.price), { time: lastTime, price: c.counterAt(last) }], rules, side },
    { id: 'Z-ENC-01b', tool: 'trendline', anchors: [{ time: bars[hs.idx].time, price: c.extremeAt(hs.idx) }, { time: lastTime, price: c.extremeAt(last) }], rules, side },
    { id: 'Z-ENC-02', tool: 'label', anchors: [{ time: lastTime, price: c.counterAt(last) }, { time: lastTime, price: c.extremeAt(last) }], rules: [], side },
  ];
  if (c.act !== null) {
    // Stop an der Gegenlinie, Ziel 2 = Kanalhöhe H ab der Trendlinie in Trade-Richtung
    out.push({
      id: 'Z-ENC-03',
      tool: 'label',
      anchors: [{ time: lastTime, price: c.extremeAt(last) }, { time: lastTime, price: c.counterAt(last) - ENC_PARAMS.heightTarget * height }],
      rules: ids('ENC', [5]),
      side,
    });
  }
  return out;
}

const misses = (cand: Candidate): number => cand.checks.filter((k) => [...STRUCTURE_IDS, 'ENC-04'].includes(k.id) && k.state === 'unmet').length;

/** Sucht je geladener Zeiteinheit (hoch → tief) den Kanal; es gilt der Kandidat mit den wenigsten verletzten Form-Bedingungen, bei Gleichstand der jüngste */
export function analyzeEnc(ctx: FormationContext, t: number): EncAnalysis[] {
  return analyzeChannels(ctx, t, evaluate, misses, empty);
}

export function checkEncCandidate(ctx: FormationContext, t: number, input: EncPointsInput): Candidate {
  return checkChannel(ctx, t, input, evaluate, empty);
}
