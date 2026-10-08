/**
 * Web Worker des Backtests: nimmt einen Auftrag (`run`) an und rechnet ihn in runJob.ts. Die Seite bricht mit
 * `terminate()` ab; ein neuer Lauf bekommt einen neuen Worker (protocol.ts).
 */
import type { WorkerMessage, WorkerRequest } from './protocol';
import { httpFetchJson, runJob } from './runJob';
import { buildDisplayBars } from './candles/displayBars';
import type { LoadedRates } from './candles/loadRates';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerMessage): void;
}

const scope = self as unknown as WorkerScope;
let activeRunId = -1;
let activeRates: LoadedRates | null = null;
let activeDataTimeframe: import('./engine/types').Timeframe | null = null;

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'run') {
    activeRunId = request.runId;
    activeRates = null;
    activeDataTimeframe = request.params.dataTimeframe;
    void runJob(request, (message) => scope.postMessage(message), httpFetchJson(request.apiBase, request.headers), (rates) => {
      if (activeRunId === request.runId) activeRates = rates;
    });
    return;
  }
  if (request.runId !== activeRunId || !activeRates || !activeDataTimeframe) return;
  const data = buildDisplayBars(activeRates, activeDataTimeframe, request.timeframe, request.from, request.to);
  scope.postMessage({ type: 'bars', runId: request.runId, requestId: request.requestId, timeframe: request.timeframe, ...data });
};
