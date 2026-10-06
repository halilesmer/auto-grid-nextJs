/**
 * Kerzen für den Chart-Tab (docs/analyse-regeln.md §3): echte MT5-Kerzen, fehlende Bereiche als
 * Leerstellen ohne Preis, Marktpausen als Sprünge zwischen zwei echten Kerzen. Es wird nie eine
 * Kerze erfunden: eine Leerstelle hat nur einen Zeitstempel.
 */

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export const DEFAULT_TIMEFRAME: Timeframe = 'M15';

export const TIMEFRAME_SEC: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export function isTimeframe(value: string | null | undefined): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value ?? '');
}

/** Grund, warum ein Bereich fehlt (wie market_sync.py): unavailable, error, busy */
export interface MissingRange {
  from: number;
  to: number;
  reason: string;
  checked_at: number | null;
  detail?: string;
}

/** Spaltenweise Kerzen wie GET /market/{id}/rates (Zeiten in MT5-Sekunden). */
export interface RateColumns {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Leerstelle: nur ein Zeitstempel (lightweight-charts zeichnet dort nichts). */
export interface Gap {
  time: number;
}

export type ChartPoint = Bar | Gap;

export interface MissingArea extends MissingRange {
  /** Erste und letzte Leerstelle des Bereichs auf der Zeitachse */
  firstSlot: number;
  lastSlot: number;
}

export interface ChartData {
  points: ChartPoint[];
  bars: Bar[];
  missing: MissingArea[];
  /** Zeit der ersten Kerze nach einer Marktpause (Lücke zwischen zwei echten Kerzen) */
  pauses: { before: number; after: number }[];
}

/** Höchstens so viele Leerstellen je fehlendem Bereich (ein Monat M1 wären 44.640) */
export const MAX_GAP_SLOTS = 120;
/** Eine Marktpause ist länger als eine Kerze + diese Zeit (eine einzelne fehlende Kerze ohne Ticks ist keine) */
const MIN_PAUSE_SEC = 15 * 60;

export function isBar(p: ChartPoint): p is Bar {
  return 'close' in p;
}

/**
 * Spalten → Kerzen. Eine unvollständige Zeile (null/NaN) wird nicht gezeichnet statt geraten; sie
 * erscheint als fehlender Bereich (Grund „invalid“).
 */
export function barsOf(rates: RateColumns, tfSec: number): { bars: Bar[]; invalid: MissingRange[] } {
  const bars: Bar[] = [];
  const invalid: MissingRange[] = [];
  for (let i = 0; i < rates.t.length; i++) {
    const bar = { time: rates.t[i], open: rates.o[i], high: rates.h[i], low: rates.l[i], close: rates.c[i] };
    if ([bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) bars.push(bar);
    else invalid.push({ from: bar.time, to: bar.time + tfSec, reason: 'invalid', checked_at: null });
  }
  return { bars, invalid };
}

/** Höchstens so viele Kerzen im Chart (zwei Antworten des Workers); mehr: größeren Zeitrahmen wählen */
export const MAX_CHART_BARS = 100_000;
/** „Alles“ ohne Anfang: die letzten so vielen Kerzen */
export const OPEN_RANGE_BARS = 5_000;

/**
 * Zeitraum für die Abfrage (MT5-Sekunden, halb offen, auf den Zeitrahmen ausgerichtet). Offener Anfang
 * („alles“) und zu lange Zeiträume werden aufs Ende begrenzt; `clipped` sagt es dem Hinweis.
 */
export function ratesWindow(from: number | null, to: number, tfSec: number): { from: number; to: number; clipped: boolean } {
  const end = Math.ceil(to / tfSec) * tfSec;
  if (from === null) return { from: end - OPEN_RANGE_BARS * tfSec, to: end, clipped: true };
  const start = Math.floor(from / tfSec) * tfSec;
  const earliest = end - MAX_CHART_BARS * tfSec;
  return start < earliest ? { from: earliest, to: end, clipped: true } : { from: start, to: end, clipped: false };
}

/** Ist die Lücke zwischen zwei aufeinanderfolgenden echten Kerzen eine Marktpause? */
export function isPause(before: number, after: number, tfSec: number): boolean {
  const gap = after - before;
  return gap >= 2 * tfSec && gap > tfSec + MIN_PAUSE_SEC;
}

/**
 * Baut die Punkte für den Chart. `clipAt`: fehlende Bereiche enden spätestens hier (jetzt auf der
 * Brokeruhr), damit die Zukunft nie als „fehlt“ erscheint.
 */
export function buildChartData(bars: Bar[], missing: MissingRange[], tfSec: number, clipAt: number | null): ChartData {
  const barTimes = new Set(bars.map((b) => b.time));
  const areas: MissingArea[] = [];
  const gaps: Gap[] = [];
  for (const m of [...missing].sort((a, b) => a.from - b.from)) {
    const to = clipAt === null ? m.to : Math.min(m.to, clipAt);
    if (to <= m.from) continue;
    const count = Math.max(1, Math.min(MAX_GAP_SLOTS, Math.ceil((to - m.from) / tfSec)));
    const slots: number[] = [];
    for (let i = 0; i < count; i++) {
      const time = Math.floor(m.from + (i * (to - m.from)) / count);
      if (!barTimes.has(time) && (slots.length === 0 || time > slots[slots.length - 1])) slots.push(time);
    }
    if (slots.length === 0) continue;
    areas.push({ ...m, to, firstSlot: slots[0], lastSlot: slots[slots.length - 1] });
    for (const time of slots) gaps.push({ time });
  }

  const points: ChartPoint[] = [...bars, ...gaps].sort((a, b) => a.time - b.time);
  // Doppelte Zeiten (überlappende Bereiche) entfernen: lightweight-charts verlangt streng steigende Zeiten
  const unique = points.filter((p, i) => i === 0 || p.time > points[i - 1].time);

  const pauses: ChartData['pauses'] = [];
  for (let i = 1; i < unique.length; i++) {
    const prev = unique[i - 1];
    const cur = unique[i];
    if (isBar(prev) && isBar(cur) && isPause(prev.time, cur.time, tfSec)) {
      pauses.push({ before: prev.time, after: cur.time });
    }
  }
  return { points: unique, bars, missing: areas, pauses };
}

/**
 * Neue Kerzen (Nachladen des Endstücks) übernehmen: ab `from` gilt die neue Antwort, davor die alte.
 * Fehlende Bereiche ebenso.
 */
export function mergeTail(
  old: { bars: Bar[]; missing: MissingRange[] },
  tail: { bars: Bar[]; missing: MissingRange[] },
  from: number,
): { bars: Bar[]; missing: MissingRange[] } {
  return {
    bars: [...old.bars.filter((b) => b.time < from), ...tail.bars.filter((b) => b.time >= from)],
    missing: [
      ...old.missing.filter((m) => m.to <= from),
      ...old.missing.filter((m) => m.from < from && m.to > from).map((m) => ({ ...m, to: from })),
      ...tail.missing.filter((m) => m.to > from).map((m) => (m.from < from ? { ...m, from } : m)),
    ],
  };
}

/** RSI nach Wilder (Standard 14) aus Schlusskursen; die ersten `period` Werte sind null. */
export function wilderRsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => {
    if (loss === 0) return gain === 0 ? 50 : 100;
    return 100 - 100 / (1 + gain / loss);
  };
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

/**
 * Laufende Kerze aus einem Live-Preis (WebSocket) fortschreiben. Nur die Kerze der aktuellen
 * Zeitspanne wird geändert, eine neue nur direkt im Anschluss an die letzte (der Markt läuft).
 * Sonst null: nach einer Pause oder Lücke wartet der Chart auf echte Kerzen aus MT5.
 */
export function liveBar(last: Bar | null, price: number, nowSec: number, tfSec: number): Bar | null {
  if (!last || !Number.isFinite(price) || price <= 0) return null;
  const time = Math.floor(nowSec / tfSec) * tfSec;
  if (time === last.time) {
    return { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
  }
  if (time === last.time + tfSec) return { time, open: price, high: price, low: price, close: price };
  return null;
}
