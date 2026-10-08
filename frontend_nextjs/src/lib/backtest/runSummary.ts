/**
 * Ergebnis eines Laufs (docs/analyse-regeln.md §4 „Testende im Backtest“): realisierter Gewinn, offener G/V,
 * End-Equity und offene Positionen stehen immer zusammen. Margin und Stop-out sind nicht geprüft; das steht im
 * Laufprotokoll (`run.marginNotChecked`).
 */
import type { CurvePoint } from '@/lib/analysis/curves';

export interface RunSummary {
  /** Summe Netto (Gewinn + Kommission + Swap) der geschlossenen Trades */
  realized: number;
  /** Offener Gewinn/Verlust zum letzten Kurs, mit Eingangskommission und gebuchtem Swap */
  openResult: number;
  /** Startkapital + realisiert + offen */
  endEquity: number;
  startCapital: number;
  openPositions: number;
  /** Die Option „am Ende alles schließen“ war an: die Positionen wurden zum Schlusskurs geschlossen */
  closedAtEnd: boolean;
  /** Größter Rückgang der Equity von einem Höchststand, in Kontowährung (positiv) */
  maxDrawdown: number;
  trades: number;
  /** Summe Kommission und Swap der geschlossenen Trades (negativ = Kosten) */
  commission: number;
  swap: number;
  /** Nur zur Anzeige: Spread-Kosten aller eröffneten Positionen (stecken schon in den Füllpreisen) */
  spreadInfo: number;
}

/** Wächst während des Laufs: Equity am Ende jeder Kerze und der größte Rückgang */
export class EquityTrack {
  readonly times: number[] = [];
  readonly values: number[] = [];
  private peak: number;
  maxDrawdown = 0;

  /** Der Höchststand beginnt beim Startwert: ein Verlust vor dem ersten Gewinn zählt als Rückgang */
  constructor(start: number) {
    this.peak = start;
  }

  add(time: number, equity: number): void {
    const last = this.times.length - 1;
    if (last >= 0 && this.times[last] === time) {
      this.values[last] = equity; // gleiche Zeit: der letzte Stand zählt (die Kurve braucht streng steigende Zeiten)
    } else {
      this.times.push(time);
      this.values.push(equity);
    }
    if (equity > this.peak) this.peak = equity;
    else this.maxDrawdown = Math.max(this.maxDrawdown, this.peak - equity);
  }
}

/**
 * Höchstens `maxPoints` + 2 Punkte. Zu viele Punkte werden in Gruppen zusammengefasst, von denen Tief und Hoch bleiben,
 * damit der größte Rückgang sichtbar bleibt. Erster und letzter Punkt bleiben immer (die Kurve endet bei der End-Equity).
 */
export function downsampleCurve(times: readonly number[], values: readonly number[], maxPoints: number): CurvePoint[] {
  const n = times.length;
  if (n <= maxPoints) return times.map((time, i) => ({ time, value: values[i] }));
  const groups = Math.floor(maxPoints / 2);
  const size = Math.ceil(n / groups);
  const out: CurvePoint[] = [];
  for (let start = 0; start < n; start += size) {
    const end = Math.min(n, start + size);
    let lo = start;
    let hi = start;
    for (let i = start + 1; i < end; i++) {
      if (values[i] < values[lo]) lo = i;
      if (values[i] > values[hi]) hi = i;
    }
    const keep = new Set([lo, hi]);
    if (start === 0) keep.add(0);
    if (end === n) keep.add(n - 1);
    for (const i of [...keep].sort((a, b) => a - b)) out.push({ time: times[i], value: values[i] });
  }
  return out;
}
