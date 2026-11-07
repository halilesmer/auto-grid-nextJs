/**
 * W1- und MN-Kerzen aus D1 (1107-A4.2): der Worker liefert beides nicht, der Browser bildet es.
 * Eine Woche beginnt am Sonntag 00:00, ein Monat am 1. um 00:00 Brokerzeit (MT5-Sekunden sind Brokerzeit).
 */
import { gapBetween } from '@/lib/analysis/fractals';
import { TIMEFRAME_SEC, type Bar, type ChartTimeframe, type MissingRange } from '@/lib/analysis/candles';
import { DAY_SEC } from '@/lib/serverTime';
import type { FormationBar } from '@/lib/formation/types';

type GapRange = Pick<MissingRange, 'from' | 'to'>;
export type CalendarTimeframe = 'W1' | 'MN';

export const W1_SEC = 7 * DAY_SEC;

export function isCalendarTimeframe(tf: string): tf is CalendarTimeframe {
  return tf === 'W1' || tf === 'MN';
}

/** Beginn der Woche (Sonntag 00:00) der Brokerzeit `t`; der 1.1.1970 war ein Donnerstag */
export function weekStart(t: number): number {
  const day = Math.floor(t / DAY_SEC);
  return (day - ((day + 4) % 7)) * DAY_SEC;
}

/** Beginn des Monats (1., 00:00) der Brokerzeit `t` */
export function monthStart(t: number): number {
  const d = new Date(t * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

/** Beginn der Periode von `t` im Zeitrahmen W1 oder MN */
export function periodStart(tf: CalendarTimeframe, t: number): number {
  return tf === 'W1' ? weekStart(t) : monthStart(t);
}

/** Ende (halb offen) der Kerze, die bei `time` beginnt: Monate sind unterschiedlich lang, daher nicht `TIMEFRAME_SEC` */
export function barEnd(tf: ChartTimeframe, time: number): number {
  if (tf === 'W1') return time + W1_SEC;
  if (tf === 'MN') {
    const d = new Date(time * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  }
  return time + TIMEFRAME_SEC[tf];
}

function groupDaily(bars: readonly FormationBar[], missing: readonly GapRange[], startOf: (t: number) => number): FormationBar[] {
  const out: FormationBar[] = [];
  let lastDay = 0;
  for (const b of bars) {
    const start = startOf(b.time);
    const cur = out[out.length - 1];
    if (cur && cur.time === start) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      if (gapBetween(missing, lastDay, b.time)) cur.gapBefore = true;
    } else {
      const next: FormationBar = { time: start, open: b.open, high: b.high, low: b.low, close: b.close };
      if (cur && gapBetween(missing, lastDay, b.time)) next.gapBefore = true;
      out.push(next);
    }
    lastDay = b.time;
  }
  return out;
}

/** W1-Kerzen aus D1-Kerzen; eine Lücke in oder vor der Woche (seit der letzten D1-Kerze der Vorwoche) setzt `gapBefore` */
export function weeklyFromDaily(bars: readonly FormationBar[], missing: readonly GapRange[] = []): FormationBar[] {
  return groupDaily(bars, missing, weekStart);
}

/** MN-Kerzen aus D1-Kerzen, Lücken wie bei W1 */
export function monthlyFromDaily(bars: readonly FormationBar[], missing: readonly GapRange[] = []): FormationBar[] {
  return groupDaily(bars, missing, monthStart);
}

/**
 * Kerzen des Charts für W1 oder MN. `loadedFrom` ist der Anfang der geladenen D1-Kerzen: beginnt die erste Periode davor,
 * ist sie angeschnitten und fällt weg (keine halbe erste Kerze). `null`: Anfang unbekannt, nichts fällt weg.
 */
export function calendarFromDaily(
  tf: CalendarTimeframe, bars: readonly FormationBar[], missing: readonly GapRange[] = [], loadedFrom: number | null = null,
): FormationBar[] {
  const out = tf === 'W1' ? weeklyFromDaily(bars, missing) : monthlyFromDaily(bars, missing);
  return loadedFrom !== null && out.length > 0 && out[0].time < loadedFrom ? out.slice(1) : out;
}

/** Live-Preis in die letzte Kerze, wenn deren Periode die aktuelle ist (`nowSec`); sonst null */
export function liveCalendarBar(tf: CalendarTimeframe, last: Bar | null, price: number, nowSec: number): Bar | null {
  if (!last || !Number.isFinite(price) || price <= 0 || last.time !== periodStart(tf, nowSec)) return null;
  return { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
}
