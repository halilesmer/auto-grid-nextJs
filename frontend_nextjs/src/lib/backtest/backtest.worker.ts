/**
 * Web Worker des Backtests: nimmt einen Auftrag (`run`) an und rechnet ihn in runJob.ts. Die Seite bricht mit
 * `terminate()` ab; ein neuer Lauf bekommt einen neuen Worker (protocol.ts).
 */
import type { RunRequest, WorkerMessage } from './protocol';
import { httpFetchJson, runJob } from './runJob';

interface WorkerScope {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage(message: WorkerMessage): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type !== 'run') return;
  void runJob(request, (message) => scope.postMessage(message), httpFetchJson(request.apiBase, request.headers));
};
