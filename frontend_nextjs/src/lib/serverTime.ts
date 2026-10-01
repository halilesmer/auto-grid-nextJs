/**
 * Zeitmodell der Analyse-Seite (docs/analyse-regeln.md §1).
 *
 * - Tage sind Brokertage (MT5-Zeit), geschrieben als "YYYY-MM-DD".
 * - MT5-Zeit sind Sekunden "wie UTC" gerechnet: Kalendertag D beginnt bei Date.UTC(D) / 1000.
 *   Gerechnet wird deshalb nur mit UTC-Methoden, nie mit der Zeitzone des Browsers.
 * - Zeiträume sind halb offen: [Beginn des ersten Tages, Beginn des Tages nach dem letzten).
 * - "Heute" kommt aus der Brokeruhr: echte Zeit + gemessener Abstand des Brokers zu UTC.
 */

export const DAY_SEC = 86400;

export type DayString = string; // YYYY-MM-DD (Brokertag)

export const RANGE_PRESETS = [
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'last7',
  'last30',
  'last90',
  'thisYear',
  'lastYear',
  'last12Months',
  'all',
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Gewählter Zeitraum in Brokertagen, beide einschließlich; null = offen (nur bei „alles“). */
export interface DayRange {
  from: DayString | null;
  to: DayString | null;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayString(value: string | null | undefined): value is DayString {
  const m = value ? DAY_RE.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0');
}

/** MT5-Sekunden → Brokertag. */
export function dayOf(mt5Sec: number): DayString {
  const d = new Date(Math.floor(mt5Sec) * 1000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Beginn eines Brokertages in MT5-Sekunden. */
export function dayStart(day: DayString): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 1000;
}

export function addDays(day: DayString, days: number): DayString {
  return dayOf(dayStart(day) + days * DAY_SEC);
}

/** Ein Monat weiter/zurück am Monatsanfang (für „letzter Monat“, „letzte 12 Monate“). */
function monthStart(day: DayString, monthDelta = 0): DayString {
  const [y, m] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + monthDelta, 1));
  return dayOf(date.getTime() / 1000);
}

/** Derselbe Tag ein Jahr früher; 29.02. wird zum 28.02. */
function yearBefore(day: DayString): DayString {
  const [y, m, d] = day.split('-').map(Number);
  const lastOfMonth = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${pad(y - 1, 4)}-${pad(m)}-${pad(Math.min(d, lastOfMonth))}`;
}

/** Aktuelle Brokerzeit in MT5-Sekunden. `offsetSec` = Brokeruhr − UTC (z. B. 10800 für UTC+3). */
export function brokerNow(offsetSec: number, nowMs: number = Date.now()): number {
  return nowMs / 1000 + offsetSec;
}

export function brokerToday(offsetSec: number, nowMs: number = Date.now()): DayString {
  return dayOf(brokerNow(offsetSec, nowMs));
}

/** Vorauswahl → Tage (einschließlich), bezogen auf den Brokertag `today`. Woche beginnt montags. */
export function presetRange(preset: RangePreset, today: DayString): DayRange {
  const weekday = (new Date(dayStart(today) * 1000).getUTCDay() + 6) % 7; // Mo = 0
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'thisWeek':
      return { from: addDays(today, -weekday), to: today };
    case 'thisMonth':
      return { from: monthStart(today), to: today };
    case 'lastMonth':
      return { from: monthStart(today, -1), to: addDays(monthStart(today), -1) };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisYear':
      return { from: `${pad(year, 4)}-01-01`, to: today };
    case 'lastYear':
      return { from: `${pad(year - 1, 4)}-01-01`, to: `${pad(year - 1, 4)}-12-31` };
    case 'last12Months':
      return { from: addDays(yearBefore(today), 1), to: today };
    case 'all':
      return { from: null, to: null };
  }
}

/** Zeitraum in MT5-Sekunden, halb offen: [from, to). null = offen. */
export function rangeBounds(range: DayRange): { from: number | null; to: number | null } {
  return {
    from: range.from ? dayStart(range.from) : null,
    to: range.to ? dayStart(range.to) + DAY_SEC : null,
  };
}

/** "TT.MM.JJ" oder "TT.MM.JJJJ" (auch mit / oder -) → Brokertag; ungültig → null. */
export function parseDayInput(text: string): DayString | null {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const day = `${pad(year, 4)}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isDayString(day) ? day : null;
}

/** Brokertag → "TT.MM.JJ" (Eingabefelder; Anzeige sonst über useFormat). */
export function formatDayInput(day: DayString): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(2, 4)}`;
}

/**
 * Brokertag ↔ Date für den Kalender (react-day-picker rechnet in der Zeitzone des Browsers).
 * 12:00 Ortszeit: Kein Sommerzeitwechsel verschiebt den Tag.
 */
export function dayToPickerDate(day: DayString): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function pickerDateToDay(date: Date): DayString {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
