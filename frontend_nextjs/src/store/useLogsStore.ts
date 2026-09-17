import { create } from 'zustand';
import { LogsState } from './types';

const FLUSH_INTERVAL_MS = 500;
const BUFFER_MAX_LINES = 500;
const LOG_MAX_LINES = 1000;

interface LogsStoreState {
  robot_log: string[];
  mt5_log: string[];

  _robotBuffer: string[];
  _mt5Buffer: string[];
  _flushTimer: ReturnType<typeof setTimeout> | null;

  appendRobotLog: (line: string) => void;
  appendMt5Log: (line: string) => void;
  flush: () => void;
  clearLogs: () => void;
  setLogs: (logs: Partial<LogsState>) => void;
  resetLogs: () => void;
}

const initialState = {
  robot_log: [],
  mt5_log: [],
  _robotBuffer: [],
  _mt5Buffer: [],
  _flushTimer: null,
};

function trimLogs(logs: string[]): string[] {
  if (logs.length > LOG_MAX_LINES) {
    return logs.slice(-LOG_MAX_LINES);
  }
  return logs;
}

export const useLogsStore = create<LogsStoreState>((set, get) => ({
  ...initialState,

  appendRobotLog: (line) => {
    const state = get();
    const newBuffer = [...state._robotBuffer, line];

    if (newBuffer.length >= BUFFER_MAX_LINES) {
      get().flush();
      return;
    }

    set({ _robotBuffer: newBuffer });

    if (!state._flushTimer) {
      const timer = setTimeout(() => {
        get().flush();
      }, FLUSH_INTERVAL_MS);
      set({ _flushTimer: timer });
    }
  },

  appendMt5Log: (line) => {
    const state = get();
    const newBuffer = [...state._mt5Buffer, line];

    if (newBuffer.length >= BUFFER_MAX_LINES) {
      get().flush();
      return;
    }

    set({ _mt5Buffer: newBuffer });

    if (!state._flushTimer) {
      const timer = setTimeout(() => {
        get().flush();
      }, FLUSH_INTERVAL_MS);
      set({ _flushTimer: timer });
    }
  },

  flush: () => {
    const state = get();
    if (state._flushTimer) {
      clearTimeout(state._flushTimer);
    }

    if (state._robotBuffer.length === 0 && state._mt5Buffer.length === 0) {
      set({ _flushTimer: null });
      return;
    }

    set((prev) => ({
      robot_log: trimLogs([...prev.robot_log, ...prev._robotBuffer]),
      mt5_log: trimLogs([...prev.mt5_log, ...prev._mt5Buffer]),
      _robotBuffer: [],
      _mt5Buffer: [],
      _flushTimer: null,
    }));
  },

  clearLogs: () => {
    const state = get();
    if (state._flushTimer) {
      clearTimeout(state._flushTimer);
    }
    set({
      robot_log: [],
      mt5_log: [],
      _robotBuffer: [],
      _mt5Buffer: [],
      _flushTimer: null,
    });
  },

  setLogs: (logs) =>
    set((state) => ({
      robot_log: logs.robot_log ?? state.robot_log,
      mt5_log: logs.mt5_log ?? state.mt5_log,
      _robotBuffer: [],
      _mt5Buffer: [],
    })),

  resetLogs: () => {
    const state = get();
    if (state._flushTimer) {
      clearTimeout(state._flushTimer);
    }
    set(initialState);
  },
}));