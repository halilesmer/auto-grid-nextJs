/**
 * Ending Channel (ENC) und Wendekeil (KEI): Messungen, die beide Formationen teilen, als reine Funktionen über geschlossene Kerzen.
 * Beide liegen im Trend derselben Zeiteinheit, zeigen mit dem Trend und werden mit dem Schluss jenseits der Trendlinie aktiv. Der Kanal
 * hat eine parallele Kopie der Trendlinie, der Keil eine zulaufende Linie durch die Extreme in Trendrichtung. Es fließen nur Kerzen bis t ein.
 */
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import type { FormationContext, TimeframeView } from './context';
import { otherSide, type ZoneSide } from './frz';
import { channelBases, legLens, widthAt, type Channel, type ChannelBase } from './lineChannel';
import { LINE_CHANNEL_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, envFor, neighborTf, type Env } from './reasons';
import { buildTrend, type TrendDir } from './trd';
import type { Anchor, Candidate } from './types';

/** Richtung des Trends, dessen Ende die Formation anzeigt (Extrem Hochs: Aufwärtstrend) */
export const trendOf = (es: ZoneSide): TrendDir => (es === 'resistance' ? 'up' : 'down');

/** Trend der Zeiteinheit nach den Kerzen bis einschließlich `idx` */
export function trendDirAt(view: TimeframeView, idx: number): TrendDir | null {
  return buildTrend(view.tf, view.bars.slice(0, idx + 1), view.wave.slice(0, idx + 1)).dir;
}

/** Trend der nächsttieferen geladenen Zeiteinheit zum Schluss der Kerze `idx` der Formations-Zeiteinheit; undefined ohne tiefere Zeiteinheit */
export function lowerTrendDir(env: Env, tf: ContextTimeframe, idx: number): TrendDir | null | undefined {
  const lowerTf = neighborTf(env, tf, 1);
  if (!lowerTf) return undefined;
  const bars = env.views.get(tf)!.bars;
  const cut = bars[idx].time + TIMEFRAME_SEC[tf];
  const lower = env.views.get(lowerTf)!;
  const n = lower.bars.filter((b) => b.time + TIMEFRAME_SEC[lowerTf] <= cut).length;
  // die tiefere Reihe muss bis zum Beginn der Formations-Kerze zurückreichen, sonst fehlt die Historie
  if (n === 0 || lower.bars[0].time > bars[0].time) return undefined;
  return trendDirAt(lower, n - 1);
}

/** Kerze, an der der Trend der Formation gemessen wird: die letzte Kerze vor der Aktivierung, mindestens das zweite Tief */
export const measureBar = (c: Channel): number => Math.max(c.base.lb.idx, c.end);

/** Korrekturen (Züge der Gegenseite) bis vor die Aktivierung, alt → neu */
export function correctionLens(env: Env, tf: ContextTimeframe, c: Channel): number[] {
  const model = env.trends.get(tf)!;
  return legLens(model.pivots, otherSide(c.base.es), c.act ?? Infinity);
}

/** Impulse (Züge der Seite des Extrems) bis vor die Aktivierung, alt → neu */
export function impulseLens(env: Env, tf: ContextTimeframe, c: Channel): number[] {
  const model = env.trends.get(tf)!;
  return legLens(model.pivots, c.base.es, c.act ?? Infinity);
}

/** ENC-07: die letzte Korrektur liegt im Bereich der vorigen (TRD-22, TRD-39); null bei weniger als 2 Korrekturen */
export function regularCorrections(lens: readonly number[]): boolean | null {
  if (lens.length < 2) return null;
  const ratio = lens[lens.length - 1] / lens[lens.length - 2];
  return ratio >= LINE_CHANNEL_PARAMS.regular.min && ratio <= LINE_CHANNEL_PARAMS.regular.max;
}

/** Hat sich der Trend nach der Aktivierung in Trade-Richtung gewendet (TRD-15 bis TRD-17)? false ohne Aktivierung */
export function changedAfter(env: Env, tf: ContextTimeframe, c: Channel): boolean {
  if (c.act === null) return false;
  const act = c.act;
  const want = trendOf(otherSide(c.base.es));
  return env.trends.get(tf)!.changes.some((x) => x.to === want && x.k >= act);
}

/** Der Abstand der Linien an der letzten Berührung ist kleiner als am Beginn der Zählung (KEI-04); null ohne Berührung */
export function narrows(c: Channel): boolean | null {
  return c.lastTouch === null ? null : widthAt(c, c.lastTouch) < widthAt(c, c.base.hs.idx);
}

export type EvaluateChannel = (env: Env, tf: ContextTimeframe, base: ChannelBase) => Candidate;

/** Sucht je geladener Zeiteinheit (hoch → tief) den Kandidaten mit den wenigsten verletzten Form-Bedingungen (`misses`), bei Gleichstand den jüngsten */
export function analyzeChannels(
  ctx: FormationContext,
  t: number,
  evaluate: EvaluateChannel,
  misses: (c: Candidate) => number,
  empty: (tf: ContextTimeframe) => Candidate,
): { tf: ContextTimeframe; candidate: Candidate }[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    let best: { candidate: Candidate; unmet: number } | null = null;
    for (const picked of channelBases(env.trends.get(tf)!, LINE_CHANNEL_PARAMS.maxStarts)) {
      const candidate = evaluate(env, tf, picked);
      const unmet = misses(candidate);
      if (best === null || unmet < best.unmet) best = { candidate, unmet };
    }
    return { tf, candidate: best ? best.candidate : empty(tf) };
  });
}

export interface ChannelPointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen aufeinanderfolgender Wendepunkte: Tief, Impulsende, Tief, zweites Extrem, zweites Tief (Extrem und Tief gespiegelt beim Kauf) */
  l0: Anchor;
  hs: Anchor;
  la: Anchor;
  h2: Anchor;
  lb: Anchor;
}

/** Prüft eigene Punkte; sind sie keine aufeinanderfolgenden Wendepunkte des Trendzugs oder eine Kerze nicht geladen, sind die Prüfungen nicht messbar */
export function checkChannel(ctx: FormationContext, t: number, input: ChannelPointsInput, evaluate: EvaluateChannel, empty: (tf: ContextTimeframe) => Candidate): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const model = env?.trends.get(input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !model || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const pos = model.pivots.findIndex((p) => p.idx === idxOf(input.l0));
  const run = pos < 0 ? [] : model.pivots.slice(pos, pos + 5);
  const given = [input.l0, input.hs, input.la, input.h2, input.lb];
  if (run.length < 5 || !run.every((p, n) => p.idx === idxOf(given[n]))) return empty(input.tf);
  return evaluate(env, input.tf, { es: run[1].side, l0: run[0], hs: run[1], la: run[2], h2: run[3], lb: run[4] });
}
