import { create } from 'zustand';
import type { ZoneSettings } from '@/store/types';
import type { RangeSelection } from '@/hooks/useAnalysisParams';
import type { RunSettingsValue } from '@/lib/backtest/runSettings';
import type { RunParams, WorkerMessage } from '@/lib/backtest/protocol';
import type { RunResult } from '@/lib/backtest/runner';
import type { MissingRange, Timeframe } from '@/lib/analysis/candles';

/** Was die Seite zum Lauf wissen muss, auch nachdem die Eingaben geändert wurden */
export interface RunContext {
  setupId: string;
  sourceLabel?: string;
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

export const MAX_SETUPS = 6;
export const MAX_RUNNING = 2;

export interface BacktestSetup {
  id: string;
  zone: ZoneSettings;
  form: RunSettingsValue;
  range: RangeSelection;
  unsaved: boolean;
}

export interface SetupRun {
  runId: number;
  status: RunStatus;
  progress: { phase: 'load' | 'run'; fraction: number } | null;
  results: RunResult[] | null;
  error: RunFailure | null;
  context: RunContext | null;
  chartRequestId: number;
  chartData: BacktestChartData | null;
}
export const EMPTY_RUN: SetupRun = { runId: 0, status: 'idle', progress: null, results: null, error: null, context: null, chartRequestId: 0, chartData: null };

interface BacktestState {
  accountId: string | null;
  sequence: number;
  setups: BacktestSetup[];
  activeId: string | null;
  runs: Record<string, SetupRun>;
  add: (setup: Omit<BacktestSetup, 'id'>) => string | null;
  select: (id: string) => void;
  edit: (id: string, change: Partial<Omit<BacktestSetup, 'id'>>) => void;
  remove: (id: string) => void;
  begin: (accountId: string, context: RunContext) => number | null;
  receive: (setupId: string, message: WorkerMessage) => void;
  cancel: (setupId: string) => void;
  clearUnless: (accountId: string | null) => void;
  expectChartRequest: (setupId: string, requestId: number) => void;
}

export const useBacktestStore = create<BacktestState>()((set, get) => ({
  accountId: null, sequence: 0, setups: [], activeId: null, runs: {},
  add: (draft) => {
    if (get().setups.length >= MAX_SETUPS) return null;
    const id = crypto.randomUUID();
    set((s) => ({ setups: [...s.setups, { ...structuredClone(draft), id }], activeId: id }));
    return id;
  },
  select: (activeId) => { if (get().setups.some((s) => s.id === activeId)) set({ activeId }); },
  edit: (id, change) => {
    if (!get().setups.some((draft) => draft.id === id) || get().runs[id]?.status === 'running') return;
    set((s) => ({
      setups: s.setups.map((draft) => draft.id === id ? { ...draft, ...structuredClone(change) } : draft),
      runs: { ...s.runs, [id]: EMPTY_RUN },
    }));
  },
  remove: (id) => set((s) => {
    const setups = s.setups.filter((draft) => draft.id !== id);
    const runs = { ...s.runs };
    delete runs[id];
    return { setups, runs, activeId: s.activeId === id ? setups[0]?.id ?? null : s.activeId };
  }),
  begin: (accountId, context) => {
    const state = get();
    if (state.accountId !== accountId || context.params.accountId !== accountId || !state.setups.some((s) => s.id === context.setupId)
      || state.runs[context.setupId]?.status === 'running'
      || Object.values(state.runs).filter((r) => r.status === 'running').length >= MAX_RUNNING) return null;
    const runId = state.sequence + 1;
    set({ sequence: runId, runs: { ...state.runs, [context.setupId]: {
      ...EMPTY_RUN, runId, status: 'running', progress: { phase: 'load', fraction: 0 }, context: structuredClone(context),
    } } });
    return runId;
  },
  receive: (setupId, message) => {
    const run = get().runs[setupId];
    if (!run || message.runId !== run.runId) return;
    let change: Partial<SetupRun>;
    if (message.type === 'bars') {
      if (run.status !== 'done' || message.requestId !== run.chartRequestId) return;
      change = { chartData: { timeframe: message.timeframe, bars: message.bars, missing: message.missing, clipped: message.clipped } };
    } else {
      if (run.status !== 'running') return;
      if (message.type === 'progress') change = { progress: { phase: message.phase, fraction: message.fraction } };
      else if (message.type === 'result') change = { status: 'done', progress: null, results: message.results };
      else change = { status: 'error', progress: null, error: message };
    }
    set((s) => ({ runs: { ...s.runs, [setupId]: { ...run, ...change } } }));
  },
  expectChartRequest: (id, chartRequestId) => set((s) => {
    const run = s.runs[id];
    return run ? { runs: { ...s.runs, [id]: { ...run, chartRequestId, chartData: null } } } : {};
  }),
  cancel: (id) => set((s) => ({ runs: { ...s.runs, [id]: EMPTY_RUN } })),
  clearUnless: (accountId) => {
    if (get().accountId === accountId) return;
    // Entwürfe bleiben. Kontospezifische Kosten und CSV-Quellen werden neu gewählt.
    set((s) => ({ accountId, runs: {}, setups: s.setups.map((draft) => ({
      ...draft, unsaved: true, form: { ...draft.form, commission: null, csvImportId: null },
    })) }));
  },
}));
