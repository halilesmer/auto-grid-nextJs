import { create } from 'zustand';
import type { RunParams, WorkerMessage } from '@/lib/backtest/protocol';
import type { RunResult } from '@/lib/backtest/runner';
import type { MissingRange, Timeframe } from '@/lib/analysis/candles';

/** Was die Seite zum Lauf wissen muss, auch nachdem die Eingaben geändert wurden */
export interface RunContext {
  params: RunParams;
  /** Der Lauf nutzte die Zone mit ungespeicherten Änderungen (Übergabe vom Test-Knopf) */
  unsaved: boolean;
  /** Kontowährung für die Anzeige */
  currency: string | null;
}

export type RunFailure = Extract<WorkerMessage, { type: 'error' }>;

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export interface BacktestChartData {
  timeframe: Timeframe;
  bars: { time: number; open: number; high: number; low: number; close: number }[];
  missing: MissingRange[];
  clipped: boolean;
}

interface BacktestState {
  /** Das Ergebnis gehört zu diesem Konto; ein Kontowechsel leert es (BKT-06) */
  accountId: string | null;
  runId: number;
  status: RunStatus;
  progress: { phase: 'load' | 'run'; fraction: number } | null;
  results: RunResult[] | null;
  error: RunFailure | null;
  context: RunContext | null;
  chartRequestId: number;
  chartData: BacktestChartData | null;
  /** Neuer Lauf: gibt die neue `runId` zurück; alte Nachrichten werden danach verworfen */
  begin: (accountId: string, context: RunContext) => number;
  /** Nachricht des Workers: wird ignoriert, wenn sie nicht zum laufenden Lauf gehört */
  receive: (message: WorkerMessage) => void;
  /** Abbruch von außen (Knopf, Seite verlassen): Ergebnis des Laufs fällt weg */
  cancel: () => void;
  /** Kontowechsel: Ergebnis eines anderen Kontos nie zeigen */
  clearUnless: (accountId: string | null) => void;
  expectChartRequest: (requestId: number) => void;
}

const EMPTY = { status: 'idle', progress: null, results: null, error: null, context: null, chartRequestId: 0, chartData: null } as const;

export const useBacktestStore = create<BacktestState>()((set, get) => ({
  accountId: null,
  runId: 0,
  ...EMPTY,
  begin: (accountId, context) => {
    const runId = get().runId + 1;
    set({ accountId, runId, status: 'running', progress: { phase: 'load', fraction: 0 }, results: null, error: null, context, chartData: null, chartRequestId: 0 });
    return runId;
  },
  receive: (message) => {
    if (message.runId !== get().runId) return;
    if (message.type === 'bars') {
      if (get().status !== 'done' || message.requestId !== get().chartRequestId) return;
      set({
        chartData: {
          timeframe: message.timeframe,
          bars: message.bars,
          missing: message.missing,
          clipped: message.clipped,
        },
      });
      return;
    }
    if (get().status !== 'running') return;
    if (message.type === 'progress') set({ progress: { phase: message.phase, fraction: message.fraction } });
    else if (message.type === 'result') set({ status: 'done', progress: null, results: message.results });
    else set({ status: 'error', progress: null, error: message });
  },
  expectChartRequest: (chartRequestId) => set({ chartRequestId, chartData: null }),
  cancel: () => {
    if (get().status === 'running') set({ ...EMPTY, runId: get().runId + 1 });
  },
  clearUnless: (accountId) => {
    if (get().accountId !== accountId) set({ accountId, runId: get().runId + 1, ...EMPTY });
  },
}));
