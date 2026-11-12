/**
 * Unerklärte Datenlücken (BKT-27, 1112-D1): Strecken ohne Kerzen mitten in der Handelszeit, die der Worker nicht als
 * `missing` meldet (früher fälschlich als "bestätigte Pause" gespeichert). Der Lauf bleibt gültig, aber das Protokoll warnt,
 * damit ein Unterschied zu MT5 nicht unerklärt bleibt. Reine Funktion, ohne Netz.
 */
import type { MissingRange } from '@/lib/analysis/candles';
import { tradeOpenAt, type TradeSessions } from '@/lib/backtest/broker/tradeSessions';

/** Offene Handelszeit ab dieser Dauer (Sekunden) gilt als Lücke */
export const MIN_OPEN_SEC = 30 * 60;
/** So viele Zeilen zeigt das Protokoll einzeln; der Rest wird zusammengefasst */
export const MAX_HOLE_NOTES = 3;

const STEP = 60;
const DAY_SEC = 86_400;

export interface DataHoleNote {
  code: 'run.dataEndsEarly' | 'run.dataHole' | 'run.dataHoleMore';
  params: Record<string, unknown>;
}

/** Ohne Sitzungsplan: Montag bis Freitag gilt als offen */
function weekdayOpen(time: number): boolean {
  const day = Math.floor(time / DAY_SEC);
  const weekday = (((day + 4) % 7) + 7) % 7;
  return weekday >= 1 && weekday <= 5;
}

/** Offene Handelszeit in [a, b) in Sekunden (Raster 60 s); Zeit in bereits gemeldeten `missing`-Bereichen zählt nicht */
function openSeconds(a: number, b: number, sessions: TradeSessions | null, missing: MissingRange[]): number {
  let open = 0;
  const start = Math.ceil(a / STEP) * STEP;
  for (let time = start; time < b; time += STEP) {
    if (missing.some((m) => time >= m.from && time < m.to)) continue;
    if (sessions ? tradeOpenAt(sessions, time) : weekdayOpen(time)) open += STEP;
  }
  return open;
}

/**
 * @param t       Kerzenzeiten (aufsteigend), die geladen wurden
 * @param tfSec   Sekunden je Kerze
 * @param from    Anfang des geladenen Bereichs
 * @param end     Ende des geladenen Bereichs: min(TO, Beginn der laufenden Kerze)
 */
export function unexplainedHoles(
  t: ArrayLike<number>,
  tfSec: number,
  from: number,
  end: number,
  sessions: TradeSessions | null,
  missing: MissingRange[],
  symbol: string,
  minOpenSec = MIN_OPEN_SEC,
): DataHoleNote[] {
  const notes: DataHoleNote[] = [];
  const check = (a: number, b: number, code: DataHoleNote['code'], last?: number) => {
    if (b <= a) return;
    const open = openSeconds(a, b, sessions, missing);
    if (open < minOpenSec) return;
    const minutes = Math.round(open / 60);
    notes.push(code === 'run.dataEndsEarly' ? { code, params: { symbol, last: last ?? a, to: end, minutes } } : { code, params: { symbol, from: a, to: b, minutes } });
  };
  if (t.length === 0) {
    check(from, end, 'run.dataHole');
  } else {
    check(from, t[0], 'run.dataHole');
    for (let i = 0; i + 1 < t.length; i++) check(t[i] + tfSec, t[i + 1], 'run.dataHole');
    check(t[t.length - 1] + tfSec, end, 'run.dataEndsEarly', t[t.length - 1]);
  }
  return notes;
}

/** Meldungen fürs Protokoll: höchstens `MAX_HOLE_NOTES` einzeln, der Rest als eine Zeile "… N daha" */
export function limitHoleNotes(notes: DataHoleNote[]): DataHoleNote[] {
  if (notes.length <= MAX_HOLE_NOTES) return notes;
  const rest = notes.slice(MAX_HOLE_NOTES);
  return [...notes.slice(0, MAX_HOLE_NOTES), { code: 'run.dataHoleMore', params: { more: rest.length } }];
}
