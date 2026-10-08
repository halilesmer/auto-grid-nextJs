/**
 * Höhere Zeitrahmen ohne Blick in die Zukunft (docs/analyse-regeln.md §5): aus den abgeschlossenen Kerzen der
 * Datenauflösung entstehen die Kerzen des Strategie-Zeitrahmens. Die laufende Kerze enthält nur den Weg, den der
 * Kurs bis jetzt genommen hat. Ein Zeitrahmen merkt sich nur die letzten `keep` Kerzen (der Bot liest höchstens 301).
 */
import type { Bar } from '@/lib/backtest/engine/types';

/** Kerze der Datenauflösung (oder der laufende Teil davon) */
export interface BaseBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * `tick_volume` zählt die Basis-Kerzen der Zeitrahmen-Kerze und `spread` ist 0: beide Felder sind nicht belegt
 * (der Bot-Nachbau liest nur Zeit und OHLC).
 */
export class TimeframeAggregator {
  private closed: Bar[] = [];
  /** Letzte Kerze des Zeitrahmens aus abgeschlossenen Basis-Kerzen; ihr Zeitfenster kann noch laufen */
  private last: Bar | null = null;

  constructor(
    readonly tfSec: number,
    private readonly keep = 1000,
  ) {}

  private bucket(time: number): number {
    return Math.floor(time / this.tfSec) * this.tfSec;
  }

  /** Eine abgeschlossene Basis-Kerze (zeitlich aufsteigend) */
  push(bar: BaseBar): void {
    const start = this.bucket(bar.time);
    const last = this.last;
    if (last && last.time === start) {
      last.high = Math.max(last.high, bar.high);
      last.low = Math.min(last.low, bar.low);
      last.close = bar.close;
      last.tick_volume += 1;
      return;
    }
    if (last) {
      this.closed.push(last);
      if (this.closed.length > this.keep * 2) this.closed.splice(0, this.closed.length - this.keep);
    }
    this.last = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, tick_volume: 1, spread: 0 };
  }

  /**
   * Wie MT5 copy_rates_from_pos: Position 0 = laufende Kerze, Ergebnis alt → neu. `forming` ist die laufende
   * Basis-Kerze (nur der bisherige Weg); ohne sie ist die letzte Kerze die jüngste.
   */
  rates(forming: BaseBar | null, startPos: number, count: number): Bar[] | null {
    // Nur der Schwanz, den der Aufruf braucht (der Bot liest höchstens 301 Kerzen); die letzte Kerze als Kopie
    const all: Bar[] = this.closed.slice(-(startPos + count + 1));
    const last = this.last ? { ...this.last } : null;
    if (forming) {
      const start = this.bucket(forming.time);
      if (last && last.time === start) {
        all.push({
          time: start,
          open: last.open,
          high: Math.max(last.high, forming.high),
          low: Math.min(last.low, forming.low),
          close: forming.close,
          tick_volume: last.tick_volume + 1,
          spread: 0,
        });
      } else {
        if (last) all.push(last);
        all.push({ time: start, open: forming.open, high: forming.high, low: forming.low, close: forming.close, tick_volume: 1, spread: 0 });
      }
    } else if (last) {
      all.push(last);
    }
    const end = all.length - startPos;
    if (end <= 0) return null;
    const slice = all.slice(Math.max(0, end - count), end);
    return slice.length > 0 ? slice : null;
  }
}
