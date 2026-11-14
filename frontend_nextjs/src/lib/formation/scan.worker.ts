/**
 * Web Worker der Formationssuche (1114-A1.5): rechnet `FormationContext` + `scanFormations` außerhalb des Hauptthreads,
 * damit der Chart beim Suchen bedienbar bleibt. Ein Auftrag je Nachricht, die Antwort trägt dieselbe `id`.
 */
import { runScan, type ScanRequest, type ScanResponse } from './scanRun';

interface WorkerScope {
  onmessage: ((event: MessageEvent<ScanRequest>) => void) | null;
  postMessage(message: ScanResponse): void;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = (event) => {
  scope.postMessage(runScan(event.data));
};
