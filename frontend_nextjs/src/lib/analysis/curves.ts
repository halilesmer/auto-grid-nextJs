/**
 * Kurven für den Statistik-Tab (docs/analyse-regeln.md §4.4): realisierter Gewinn, Kontostand (rückwärts
 * vom heutigen Stand) und Drawdown. Zeiten sind MT5-Sekunden; je Zeitpunkt ein Punkt (lightweight-charts
 * braucht streng steigende Zeiten). Equity gibt es für echte Konten nicht (MT5 liefert keinen Verlauf).
 */
import type { Deal, Trade } from './tradePairing';

export interface CurvePoint {
  time: number;
  value: number;
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Punkte gleicher Zeit zusammenfassen: der letzte Stand zählt */
function push(points: CurvePoint[], time: number, value: number) {
  const last = points[points.length - 1];
  if (last && last.time === time) last.value = value;
  else points.push({ time, value });
}

/**
 * Anfangspunkt der Kurve: Beginn des Zeitraums; bei „alles“ (from = 0) kurz vor dem ersten Wert, sonst
 * begänne die Kurve 1970 und die echten Daten lägen gestaucht am rechten Rand.
 */
const anchor = (from: number, first: number) => (from > 0 ? Math.min(from, first) : first - 1);

/** Summe des Netto-Gewinns nach Schließzeit, beginnend bei 0 am Anfang des Zeitraums */
export function realizedCurve(trades: Trade[], from: number): CurvePoint[] {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime || a.exitTicket - b.exitTicket);
  const points: CurvePoint[] = [];
  if (sorted.length === 0) return points;
  push(points, anchor(from, sorted[0].exitTime), 0);
  let sum = 0;
  for (const tr of sorted) {
    sum += tr.net;
    push(points, tr.exitTime, sum);
  }
  return points;
}

/** Abstand zum bisherigen Höchststand der Kurve (≤ 0) */
export function drawdownCurve(points: CurvePoint[]): CurvePoint[] {
  let peak = -Infinity;
  return points.map((p) => {
    peak = Math.max(peak, p.value);
    return { time: p.time, value: p.value - peak };
  });
}

export type BalanceUnavailable = 'missing' | 'notToNow' | 'noBalance';
export type BalanceCurve = { ok: true; points: CurvePoint[] } | { ok: false; reason: BalanceUnavailable };

/**
 * Kontostand rückwärts vom heutigen Stand: jeder Deal im Zeitraum (auch Ein-/Auszahlungen) ändert den
 * Stand um Gewinn + Kommission + Swap + Gebühr. Nur sicher, wenn das Archiv lückenlos bis jetzt reicht.
 */
export function balanceCurve(
  deals: Deal[],
  balanceNow: number | null,
  range: { from: number; to: number },
  missingCount: number,
  nowSec: number,
): BalanceCurve {
  if (missingCount > 0) return { ok: false, reason: 'missing' };
  if (range.to < nowSec) return { ok: false, reason: 'notToNow' };
  if (balanceNow === null) return { ok: false, reason: 'noBalance' };
  const inside = deals
    .filter((d) => d.time >= range.from && d.time < range.to)
    .sort((a, b) => (a.time_msc ?? a.time * 1000) - (b.time_msc ?? b.time * 1000) || a.ticket - b.ticket);
  const change = (d: Deal) => num(d.profit) + num(d.commission) + num(d.swap) + num(d.fee);
  let value = balanceNow - inside.reduce((s, d) => s + change(d), 0);
  const points: CurvePoint[] = [];
  push(points, inside.length > 0 ? anchor(range.from, inside[0].time) : range.from, value);
  for (const d of inside) {
    value += change(d);
    push(points, d.time, value);
  }
  return { ok: true, points };
}
