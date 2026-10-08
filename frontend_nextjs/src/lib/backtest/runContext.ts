/**
 * Meldungen eines Backtest-Laufs (docs/analyse-regeln.md §7, Laufprotokoll).
 * Jede Meldung ist ein Code mit Werten, kein Text: die Übersetzung (tr/en/de) kommt mit der Seite (B5).
 */
import type { LogLevel } from './engine/state';

/** Ein Grund, warum ein Lauf nicht startet oder abbricht */
export interface RunProblem {
  code: string;
  params?: Record<string, unknown>;
}

/** Abbruch eines Laufs mit Code (z. B. `run.tooManyCandles`); der Web Worker meldet ihn als `error` */
export class RunError extends Error {
  constructor(
    readonly code: string,
    readonly params?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'RunError';
  }
}

export interface RunLogLine {
  level: LogLevel;
  code: string;
  params?: Record<string, unknown>;
  /** Simulierte Zeit (MT5-Sekunden); fehlt bei Meldungen vor dem Start */
  time?: number;
}

/** Mehr Zeilen behält das Protokoll nicht; die Zähler zählen weiter */
export const RUN_LOG_MAX_LINES = 2000;

export class RunLog {
  readonly lines: RunLogLine[] = [];
  /** Code → wie oft gemeldet (auch die Zeilen über dem Limit) */
  readonly counts: Record<string, number> = {};
  /** Zeilen, die wegen des Limits nicht im Protokoll stehen */
  dropped = 0;

  add(level: LogLevel, code: string, params?: Record<string, unknown>, time?: number): void {
    this.counts[code] = (this.counts[code] ?? 0) + 1;
    if (this.lines.length >= RUN_LOG_MAX_LINES) {
      this.dropped += 1;
      return;
    }
    this.lines.push({ level, code, params, time });
  }
}
