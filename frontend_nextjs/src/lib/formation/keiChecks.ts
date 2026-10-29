/**
 * Wendekeil (KEI): Prüfung je Bedingungs-ID und Zeichnungen Z-KEI-01 bis Z-KEI-03.
 * `analyzeKei` sucht je geladener Zeiteinheit fünf aufeinanderfolgende Wendepunkte (Tief, Impulsende, Tief, zweites Extrem, zweites Tief):
 * die Trendlinie läuft durch die Startpunkte der letzten 2 Impulse (Aufwärtstrend: die ersten beiden Tiefs), die Gegenlinie durch die beiden Extreme; beide zeigen mit dem Trend
 * und laufen zusammen. `checkKeiCandidate` prüft eigene Punkte.
 *
 * Lesart der Zustände: Formkern (KEI-01 bis KEI-06) ist Pflicht, KEI-07 bis KEI-09 sind Verstärkung. KEI-06 ist ☑, sobald ein Schluss
 * jenseits der Trendlinie liegt. Steigender Keil im Aufwärtstrend (Verkauf) und fallender Keil im Abwärtstrend (Kauf) sind derselbe Code.
 */
import type { FormationContext } from './context';
import { analyzeChannels, changedAfter, checkChannel, impulseLens, measureBar, narrows, trendDirAt, trendOf, type ChannelPointsInput } from './enc';
import { zoneGeometry } from './frz';
import { measureChannel, reversalSide, shrinks, slopesWithTrend, type Channel, type ChannelBase } from './lineChannel';
import { KEI_PARAMS, LINE_CHANNEL_PARAMS, type ContextTimeframe } from './params';
import type { Env } from './reasons';
import type { Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Verdict } from './types';
import { anchorAt, ids, unmeasurable } from './xabcd';

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'KEI-01': ['required', 'secondary'],
  'KEI-02': ['required', 'secondary'],
  'KEI-03': ['required', 'secondary'],
  'KEI-04': ['required', 'secondary'],
  'KEI-05': ['required', 'secondary'],
  'KEI-06': ['required', 'secondary'],
  'KEI-07': ['bonus', 'secondary'],
  'KEI-08': ['bonus', 'secondary'],
  'KEI-09': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const KEI_CHECK_IDS: readonly string[] = Object.keys(RULES);

/** Form des Keils: ist sie verletzt, ist die Formation ungültig */
const STRUCTURE_IDS = ids('KEI', [1, 2, 3, 4]);

export type KeiPointsInput = ChannelPointsInput;
export interface KeiAnalysis {
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

const empty = (tf: ContextTimeframe): Candidate => unmeasurable('KEI', tf, KEI_CHECK_IDS, RULES);

function evaluate(env: Env, tf: ContextTimeframe, base: ChannelBase): Candidate {
  const view = env.views.get(tf)!;
  const { bars } = view;
  const c = measureChannel(bars, base, 'wedge');
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  add('KEI-01', flag(trendDirAt(view, measureBar(c)) === trendOf(base.es)));
  add('KEI-02', tri(shrinks(impulseLens(env, tf, c), LINE_CHANNEL_PARAMS.shrinkCount)));
  const slopes = slopesWithTrend(c);
  add('KEI-03', flag(slopes.counter && slopes.extreme));
  add('KEI-04', tri(narrows(c)));
  const need = LINE_CHANNEL_PARAMS.touches;
  add('KEI-05', flag(c.count.top >= need.top && c.count.bottom >= need.bottom), c.count.top + c.count.bottom);
  add('KEI-06', flag(c.act !== null));
  add('KEI-07', flag(c.count.top >= KEI_PARAMS.retestTops), c.count.top);
  add('KEI-08', flag(changedAfter(env, tf, c)));
  add('KEI-09', c.act === null || view.wide[c.act] === null ? U : flag(view.wide[c.act] === true));

  const drawings = drawingsOf(bars, tf, c);
  const withDrawings = checks.map((k) => ({
    ...k,
    drawings: [...new Set(drawings.filter((z) => z.rules.includes(k.id)).map((z) => z.id))],
  }));
  const stateOf = (id: string) => checks.find((k) => k.id === id)!.state;
  let verdict: Verdict = 'valid';
  if (STRUCTURE_IDS.some((id) => stateOf(id) === 'unmet')) verdict = 'invalid';
  else if (c.act === null) verdict = 'forming';
  else if (stateOf('KEI-05') === 'unmet') verdict = 'invalid';

  const points: Candidate['points'] = {
    L0: anchorAt(bars, base.l0.idx, base.l0.price),
    H1: anchorAt(bars, base.hs.idx, base.hs.price),
    L1: anchorAt(bars, base.la.idx, base.la.price),
    H2: anchorAt(bars, base.h2.idx, base.h2.price),
    L2: anchorAt(bars, base.lb.idx, base.lb.price),
  };
  if (c.act !== null) points.X = anchorAt(bars, c.act, bars[c.act].close);
  return { code: 'KEI', side: reversalSide(base.es), tf, points, checks: withDrawings, drawings, verdict };
}

function drawingsOf(bars: readonly FormationBar[], tf: ContextTimeframe, c: Channel): Drawing[] {
  const last = bars.length - 1;
  const lastTime = bars[last].time;
  const { l0, hs, la, h2, es } = c.base;
  const side = reversalSide(es);
  const rules = ids('KEI', [1, 3, 4, 5, 6, 7]);
  const out: Drawing[] = [
    { id: 'Z-KEI-01', tool: 'trendline', anchors: [anchorAt(bars, l0.idx, l0.price), { time: lastTime, price: c.counterAt(last) }], rules, side },
    { id: 'Z-KEI-01b', tool: 'trendline', anchors: [anchorAt(bars, hs.idx, hs.price), { time: lastTime, price: c.extremeAt(last) }], rules, side },
  ];
  // Fib auf die letzte große Bewegung: vom Wendepunkt der Gegenseite vor hs zum äußersten Extrem von hs und h2 (Anfangspunkt im Regelwerk nicht genannt)
  const top = Math.abs(h2.price - l0.price) > Math.abs(hs.price - l0.price) ? h2 : hs;
  out.push({
    id: 'Z-KEI-02',
    tool: 'fib',
    anchors: [anchorAt(bars, l0.idx, l0.price), anchorAt(bars, top.idx, top.price)],
    levels: [...KEI_PARAMS.targetLevels],
    rules: [],
    side,
  });
  const stopZone = zoneGeometry(bars, h2.idx, es, tf);
  const startZone = zoneGeometry(bars, la.idx, la.side, tf);
  out.push(
    { id: 'Z-KEI-03', tool: 'zone', anchors: [anchorAt(bars, h2.idx, stopZone.bottom), { time: lastTime, price: stopZone.top }], rules: [], side },
    { id: 'Z-KEI-03b', tool: 'zone', anchors: [anchorAt(bars, la.idx, startZone.bottom), { time: lastTime, price: startZone.top }], rules: [], side },
  );
  return out;
}

const misses = (cand: Candidate): number => cand.checks.filter((k) => [...STRUCTURE_IDS, 'KEI-05'].includes(k.id) && k.state === 'unmet').length;

/** Sucht je geladener Zeiteinheit (hoch → tief) den Keil; es gilt der Kandidat mit den wenigsten verletzten Form-Bedingungen, bei Gleichstand der jüngste */
export function analyzeKei(ctx: FormationContext, t: number): KeiAnalysis[] {
  return analyzeChannels(ctx, t, evaluate, misses, empty);
}

export function checkKeiCandidate(ctx: FormationContext, t: number, input: KeiPointsInput): Candidate {
  return checkChannel(ctx, t, input, evaluate, empty);
}
