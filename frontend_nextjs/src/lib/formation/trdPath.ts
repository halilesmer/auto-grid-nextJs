/**
 * Trendzug als Linie im Chart (ANA-21): Segmente aus den Punkten von `buildTrend`, Abschneiden am Rand des
 * Charts und die gespeicherten Einstellungen. Die Linie hängt nur an den Einstellungen des Zugs; die Formationen
 * rechnen mit `formationZug` (siehe context.ts).
 */
import { legDir, buildTrend, type TrendDir, type TrendModel } from './trd';
import {
  DEFAULT_TREND_SETTINGS,
  TREND_LIMITS,
  type ContextTimeframe,
  FORMATION_ZUEGE,
  TREND_RULES,
  type TrendSettings,
} from './params';
import type { FormationBar } from './types';

export interface PathPoint {
  time: number;
  price: number;
}

/** Ein Schenkel des Zugs; `tone` ist der Trend an seinem Ende (grün aufwärts, rot abwärts) */
export interface TrendSegment {
  from: PathPoint;
  to: PathPoint;
  tone: TrendDir;
}

/**
 * Jeder Schenkel trägt den Trend, der an der Kerze seines Endpunkts gilt; eine Korrektur behält die Farbe.
 * Kommt der Wechsel erst nach dem Endpunkt, aber vor dem nächsten Punkt, in Richtung des Schenkels, nimmt der Schenkel
 * die neue Farbe: der Wechsel bestätigt den Impuls, der ihn gezeichnet hat.
 */
export function trendSegments(m: TrendModel): TrendSegment[] {
  const { pivots, changes, bars } = m;
  if (pivots.length < 2) return [];
  const first = legDir(pivots[1].side);
  const dirAt = (idx: number) => changes.filter((c) => c.k <= idx).reduce<TrendDir>((_, c) => c.to, first);
  return pivots.slice(1).map((end, i) => {
    const start = pivots[i];
    const nextIdx = pivots[i + 2]?.idx ?? bars.length - 1;
    const leg = legDir(end.side);
    const confirmed = changes.some((c) => c.to === leg && end.idx < c.k && c.k <= nextIdx);
    return {
      from: { time: bars[start.idx].time, price: start.price },
      to: { time: bars[end.idx].time, price: end.price },
      tone: confirmed ? leg : dirAt(end.idx),
    };
  });
}

/**
 * Nur geschlossene Kerzen: Öffnungszeit + Dauer ≤ `now` (Brokerzeit) und vor der laufenden Kerze (`liveFrom`). Ist die Brokerzeit
 * unbekannt (`now` null), fällt die letzte Kerze weg: Sie könnte noch laufen, und UTC statt Brokerzeit würde falsch vergleichen.
 */
export function closedBars<T extends { time: number }>(bars: readonly T[], durationSec: number, now: number | null, liveFrom: number | null): T[] {
  const known = now === null ? bars.slice(0, -1) : bars.filter((b) => b.time + durationSec <= now);
  return liveFrom === null ? known : known.filter((b) => b.time < liveFrom);
}

/** Zug aus geschlossenen Kerzen mit den Einstellungen der Linie */
export function buildTrendPath(tf: ContextTimeframe, bars: readonly FormationBar[], settings: TrendSettings): TrendSegment[] {
  // `formationZug` gehört nicht zur Linie; buildTrend liest nur die Felder von TrendOptions
  return trendSegments(buildTrend(tf, bars, [], settings));
}

/** Position von `time` auf der Kerzenachse (erste Kerze ab `time`); der Chart zeichnet nach Kerzen, nicht nach Sekunden */
function position(axis: readonly number[], time: number): number {
  let lo = 0;
  let hi = axis.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Was außerhalb der Kerzen des Charts liegt, fällt weg: Die Zeitachse liefert dort keine Koordinate. Die Kante wird nach
 * Kerzenposition interpoliert (`axis` = Kerzenzeiten des Zugs), weil der Chart Marktpausen nicht als Zeit zeichnet.
 */
export function clipSegments(segments: readonly TrendSegment[], firstTime: number, lastTime: number, axis: readonly number[]): TrendSegment[] {
  const at = (s: TrendSegment, time: number): PathPoint => {
    const a = position(axis, s.from.time);
    const b = position(axis, s.to.time);
    return { time, price: s.from.price + ((s.to.price - s.from.price) * (position(axis, time) - a)) / (b - a) };
  };
  return segments
    .filter((s) => s.to.time > firstTime && s.from.time < lastTime)
    .map((s) => ({
      ...s,
      from: s.from.time < firstTime ? at(s, firstTime) : s.from,
      to: s.to.time > lastTime ? at(s, lastTime) : s.to,
    }));
}

const clamped = (value: unknown, limit: { min: number; max: number }, fallback: number, integer: boolean): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) return fallback;
  return Math.min(limit.max, Math.max(limit.min, value));
};

/** EWO lang muss größer sein als EWO kurz; sonst rechnet der Zug mit dem Paar des Standards. Die Eingabe bleibt stehen, damit man sie fertig tippen kann. */
export const ewoPairValid = (s: Pick<TrendSettings, 'ewoFast' | 'ewoSlow'>): boolean => s.ewoSlow > s.ewoFast;

export function usableTrendSettings(s: TrendSettings): TrendSettings {
  return ewoPairValid(s) ? s : { ...s, ewoFast: DEFAULT_TREND_SETTINGS.ewoFast, ewoSlow: DEFAULT_TREND_SETTINGS.ewoSlow };
}

/** Gespeicherte Einstellungen vom Browser-Speicher: unbekannte oder kaputte Werte fallen auf den Standard */
export function sanitizeTrendSettings(raw: unknown): TrendSettings {
  const d = DEFAULT_TREND_SETTINGS;
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    rule: TREND_RULES.find((r) => r === p.rule) ?? d.rule,
    minSize: clamped(p.minSize, TREND_LIMITS.minSize, d.minSize, false),
    ewoRetreat: clamped(p.ewoRetreat, TREND_LIMITS.ewoRetreat, d.ewoRetreat, false),
    changeCloses: p.changeCloses === 1 || p.changeCloses === 2 ? p.changeCloses : d.changeCloses,
    ewoFast: clamped(p.ewoFast, TREND_LIMITS.ewoFast, d.ewoFast, true),
    ewoSlow: clamped(p.ewoSlow, TREND_LIMITS.ewoSlow, d.ewoSlow, true),
    atrPeriod: clamped(p.atrPeriod, TREND_LIMITS.atrPeriod, d.atrPeriod, true),
    formationZug: FORMATION_ZUEGE.find((z) => z === p.formationZug) ?? d.formationZug,
  };
}
