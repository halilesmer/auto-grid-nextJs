import type { Drawing } from 'lightweight-charts-drawing';

/** 1110-A4 S2: Koordinatlar ve Görünürlük der Fibonacci-Zeichnung (reine Funktionen, ohne Bibliothek-Instanz) */

/** Zeitrahmen-Zeichenkette für `manager.setInterval` im TV-Format der Bibliothek: Zahl = Minuten, „ND“ Tage, „NW“ Wochen, „NM“ Monate */
export function libraryInterval(timeframeSec: number): string {
  if (timeframeSec >= 28 * 86400) return '1M';
  if (timeframeSec >= 7 * 86400) return '1W';
  if (timeframeSec >= 86400) return '1D';
  return String(Math.max(1, Math.round(timeframeSec / 60)));
}

/** 1110-A4.7: „Bar“ zählt ab der ersten geladenen Kerze (0); vor ihr negativ, nach der letzten über die Länge hinaus */
export function barIndexOf(times: readonly number[], time: number, stepSec: number): number {
  const n = times.length;
  if (!n) return 0;
  if (time <= times[0]) return Math.round((time - times[0]) / stepSec);
  if (time >= times[n - 1]) return n - 1 + Math.round((time - times[n - 1]) / stepSec);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= time) lo = mid; else hi = mid; }
  return time - times[lo] <= times[hi] - time ? lo : hi;
}
export function timeAtBar(times: readonly number[], index: number, stepSec: number): number {
  const n = times.length;
  if (!n) return 0;
  if (index < 0) return times[0] + index * stepSec;
  if (index > n - 1) return times[n - 1] + (index - (n - 1)) * stepSec;
  return times[index];
}

export type UnitVisibility = { on: boolean; from: number; to: number };
export type FibVisibility = { ticks: boolean; seconds: UnitVisibility; minutes: UnitVisibility; hours: UnitVisibility; days: UnitVisibility; weeks: UnitVisibility; months: UnitVisibility; ranges: boolean };
export const UNIT_KEYS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type UnitKey = (typeof UNIT_KEYS)[number];
export const UNIT_MAX: Record<UnitKey, number> = { seconds: 59, minutes: 59, hours: 24, days: 366, weeks: 52, months: 12 };
export const DEFAULT_FIB_VISIBILITY: FibVisibility = { ticks: true, seconds: { on: true, from: 1, to: 59 }, minutes: { on: true, from: 1, to: 59 }, hours: { on: true, from: 1, to: 24 }, days: { on: true, from: 1, to: 366 }, weeks: { on: true, from: 1, to: 52 }, months: { on: true, from: 1, to: 12 }, ranges: true };

const clamp = (n: unknown, lo: number, hi: number, d: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
/** Gespeicherte Sichtbarkeit sicher lesen: fehlende oder kaputte Felder werden zum Standard (überall sichtbar) */
export function normalizeVisibility(input: unknown): FibVisibility {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = structuredClone(DEFAULT_FIB_VISIBILITY);
  if (typeof v.ticks === 'boolean') out.ticks = v.ticks;
  if (typeof v.ranges === 'boolean') out.ranges = v.ranges;
  for (const key of UNIT_KEYS) {
    const u = v[key] as Partial<UnitVisibility> | undefined, max = UNIT_MAX[key];
    if (!u || typeof u !== 'object') continue;
    const from = clamp(u.from, 1, max, 1), to = clamp(u.to, 1, max, max);
    out[key] = { on: typeof u.on === 'boolean' ? u.on : true, from: Math.min(from, to), to: Math.max(from, to) };
  }
  return out;
}
export const visibilityEqual = (a: FibVisibility, b: FibVisibility) => JSON.stringify(a) === JSON.stringify(b);
/** Standard wird nicht gespeichert: die Zeichnung bleibt ohne Feld */
export function visibilityForDrawing(v: FibVisibility): Drawing['visibility'] {
  return visibilityEqual(v, DEFAULT_FIB_VISIBILITY) ? undefined : v;
}
