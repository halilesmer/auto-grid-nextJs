'use client';

import { useCallback, useEffect, useRef } from 'react';
import { apiUrl, getWorkerHeaders } from '@/lib/api';
import type { BarsRequest, RunRequest, WorkerMessage } from '@/lib/backtest/protocol';
import type { Timeframe } from '@/lib/analysis/candles';
import { useBacktestStore, type RunContext } from '@/store/useBacktestStore';

/**
 * Startet einen Backtest-Lauf im Web Worker (lib/backtest/backtest.worker.ts) und leitet seine Nachrichten an
 * useBacktestStore. Je Lauf ein neuer Worker; Abbrechen = `terminate()`. Die Seite verlassen bricht den Lauf ab.
 * Der Worker lädt die Kerzen selbst, darum bekommt er Adresse und Kopfzeilen (X-API-Key) mit (protocol.ts).
 */
export function useBacktestRun() {
  const workerRef = useRef<Worker | null>(null);
  const chartRequestId = useRef(0);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const start = useCallback(
    (accountId: string, context: RunContext) => {
      stop();
      const runId = useBacktestStore.getState().begin(accountId, context);
      let request: RunRequest;
      try {
        request = {
          type: 'run',
          runId,
          apiBase: apiUrl('').replace(/\/+$/, ''),
          headers: getWorkerHeaders(),
          params: context.params,
        };
      } catch (error) {
        // Keine Verbindung zum Worker: als Fehler des Laufs zeigen, nicht verschlucken
        useBacktestStore
          .getState()
          .receive({ type: 'error', runId, code: 'run.unexpected', message: error instanceof Error ? error.message : String(error) });
        return;
      }
      try {
        const worker = new Worker(new URL('../lib/backtest/backtest.worker.ts', import.meta.url));
        workerRef.current = worker;
        // Nur der eigene Worker beendet sich selbst: eine späte Nachricht eines alten Laufs trifft nie den neuen
        const finish = () => {
          if (workerRef.current === worker) stop();
        };
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          useBacktestStore.getState().receive(event.data);
          if (event.data.type === 'error') finish();
        };
        worker.onerror = (event) => {
          useBacktestStore.getState().receive({ type: 'error', runId, code: 'run.unexpected', message: event.message });
          finish();
        };
        worker.postMessage(request);
      } catch (error) {
        // Worker nicht startbar (z. B. Daten nicht kopierbar): als Fehler des Laufs zeigen
        stop();
        useBacktestStore
          .getState()
          .receive({ type: 'error', runId, code: 'run.unexpected', message: error instanceof Error ? error.message : String(error) });
      }
    },
    [stop],
  );

  const cancel = useCallback(() => {
    stop();
    useBacktestStore.getState().cancel();
  }, [stop]);

  const requestBars = useCallback((timeframe: Timeframe, from: number, to: number) => {
    const worker = workerRef.current;
    const state = useBacktestStore.getState();
    if (!worker || state.status !== 'done') return;
    const requestId = ++chartRequestId.current;
    state.expectChartRequest(requestId);
    const request: BarsRequest = { type: 'bars', runId: state.runId, requestId, timeframe, from, to };
    worker.postMessage(request);
  }, []);

  useEffect(() => cancel, [cancel]);

  return { start, cancel, requestBars };
}
