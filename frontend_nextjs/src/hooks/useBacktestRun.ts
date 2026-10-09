'use client';

import { useCallback, useEffect, useRef } from 'react';
import { apiUrl, getWorkerHeaders } from '@/lib/api';
import type { BarsRequest, RunRequest, WorkerMessage } from '@/lib/backtest/protocol';
import type { Timeframe } from '@/lib/analysis/candles';
import { useBacktestStore, type RunContext } from '@/store/useBacktestStore';

/** Ein Worker je Setup. Fertige Worker behalten die Kerzen für den Replay-Chart. */
export function useBacktestRun() {
  const workers = useRef(new Map<string, Worker>());
  const chartRequestId = useRef(0);
  const stop = useCallback((id: string) => {
    workers.current.get(id)?.terminate();
    workers.current.delete(id);
  }, []);
  const cancel = useCallback((id: string) => {
    stop(id);
    useBacktestStore.getState().cancel(id);
  }, [stop]);
  const cancelAll = useCallback(() => {
    for (const id of [...workers.current.keys()]) cancel(id);
  }, [cancel]);

  const start = useCallback((accountId: string, context: RunContext) => {
    const id = context.setupId;
    const runId = useBacktestStore.getState().begin(accountId, context);
    if (runId === null) return;
    stop(id);
    try {
      const request: RunRequest = { type: 'run', runId, apiBase: apiUrl('').replace(/\/+$/, ''), headers: getWorkerHeaders(), params: context.params };
      const worker = new Worker(new URL('../lib/backtest/backtest.worker.ts', import.meta.url));
      workers.current.set(id, worker);
      const finish = () => { if (workers.current.get(id) === worker) stop(id); };
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        useBacktestStore.getState().receive(id, event.data);
        if (event.data.type === 'error') finish();
      };
      worker.onerror = (event) => {
        useBacktestStore.getState().receive(id, { type: 'error', runId, code: 'run.unexpected', message: event.message });
        finish();
      };
      worker.postMessage(request);
    } catch (error) {
      stop(id);
      useBacktestStore.getState().receive(id, { type: 'error', runId, code: 'run.unexpected', message: error instanceof Error ? error.message : String(error) });
    }
  }, [stop]);

  const requestBars = useCallback((id: string, timeframe: Timeframe, from: number, to: number) => {
    const worker = workers.current.get(id);
    const state = useBacktestStore.getState();
    const run = state.runs[id];
    if (!worker || run?.status !== 'done') return;
    const requestId = ++chartRequestId.current;
    state.expectChartRequest(id, requestId);
    const request: BarsRequest = { type: 'bars', runId: run.runId, requestId, timeframe, from, to };
    worker.postMessage(request);
  }, []);

  useEffect(() => {
    // Entfernen, Bearbeiten und Kontowechsel geben auch die Kerzen alter Worker frei.
    const unsubscribe = useBacktestStore.subscribe((state) => {
      for (const id of workers.current.keys()) {
        if (!state.runs[id]?.context) stop(id);
      }
    });
    return () => { unsubscribe(); cancelAll(); };
  }, [cancelAll, stop]);
  return { start, cancel, cancelAll, requestBars };
}
