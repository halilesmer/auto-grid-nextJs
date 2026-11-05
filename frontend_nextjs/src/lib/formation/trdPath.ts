/**
 * Trendzug als Linie im Chart (ANA-21): Segmente aus den Punkten von `buildTrend`, Abschneiden am Rand des
 * Charts und die gespeicherten Einstellungen. Linie und Formationen rechnen mit denselben Einstellungen des Zugs
 * (Halil 2026-11-05, siehe context.ts).
 */
import { legDir, buildTrend, type TrendDir, type TrendModel } from './trd';
import {
  DEFAULT_TREND_SETTINGS,
  TREND_LIMITS,
  type ContextTimeframe,
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

/** Kein Broker liegt hinter UTC-12; eine Kerze, die vor UTC jetzt minus 12 Stunden endet, ist bei jedem Broker geschlossen (A13.3.1) */
const MAX_BROKER_LAG_SEC = 12 * 3600;

/**
 * Nur geschlossene Kerzen: Öffnungszeit + Dauer ≤ `now` (Brokerzeit) und vor der laufenden Kerze (`liveFrom`). Ist die Brokerzeit
 * unbekannt (`now` null), zählt mit `utcNow` (Sekunden) jede Kerze, die vor `utcNow − 12 h` endet; die laufende Kerze bleibt so
 * draußen, eine vergangene Spanne behält alle Kerzen. Ohne `utcNow` fällt die letzte Kerze weg.
 */
export function closedBars<T extends { time: number }>(
  bars: readonly T[], durationSec: number, now: number | null, liveFrom: number | null, utcNow: number | null = null,
): T[] {
  let known: T[];
  if (now !== null) known = bars.filter((b) => b.time + durationSec <= now);
  else if (utcNow !== null) known = bars.filter((b) => b.time + durationSec <= utcNow - MAX_BROKER_LAG_SEC);
  else known = bars.slice(0, -1);
  return liveFrom === null ? known : known.filter((b) => b.time < liveFrom);
}

/**
 * Obergrenze der Kerzen, die in den Pfad der Linie gehen. `buildTrend` wächst quadratisch (gemessen: 5.000 Kerzen ≈ 0,1 s,
 * 20.000 ≈ 1,1 s, 100.000 ≈ 30 s). Es zählen die letzten Kerzen; der Pfadanfang eines gekürzten Fensters ist unruhig.
 * Die Formationen rechnen mit denselben Einstellungen (context.ts), aber ohne diese Kürzung.
 */
export const TREND_PATH_MAX_BARS = 5000;

/** Zug aus geschlossenen Kerzen mit den Einstellungen der Linie (höchstens die letzten TREND_PATH_MAX_BARS Kerzen) */
export function buildTrendPath(tf: ContextTimeframe, bars: readonly FormationBar[], settings: TrendSettings): TrendSegment[] {
  const used = bars.length > TREND_PATH_MAX_BARS ? bars.slice(-TREND_PATH_MAX_BARS) : bars;
  return trendSegments(buildTrend(tf, used, [], settings));
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

/** Kurzer Schlüssel der wirksamen Einstellungen: ändert er sich, ändern sich Linie und Formationen (neue Suche) */
export const trendFingerprint = (s: TrendSettings): string => {
  const u = usableTrendSettings(s);
  return [u.rule, u.minSize, u.ewoRetreat, u.changeCloses, u.ewoFast, u.ewoSlow, u.atrPeriod].join('/');
};

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
  };
}
