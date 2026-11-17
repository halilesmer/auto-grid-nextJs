/**
 * Gemockter Worker ohne Browser (BKT-05): gleichzeitige Anfragen teilen sich keinen Rohkörper.
 * handle() wartet auf die Kopfzeilen der Anfrage (request.allHeaders()); in dieser Zeit läuft eine andere Anfrage
 * derselben Seite. Hielt der Mock den Rohkörper nur im Objekt, las ein CSV-Teil (PUT …/chunk) den leeren Körper
 * einer GET-Anfrage, der Commit fand keine Zeile und antwortete 422 („Dosyada 1 hata var“; CI-Läufe 43969018431,
 * 43872855335, 43855095207, Messung in docs/journal/2026-11-17-flaky-tests-frm42-sys11-bkt05.md).
 */
import type { Route } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { E2E_API_KEY, MOCK_API } from '../fixtures/env';
import { DEMO_ID } from '../fixtures/test';
import { MockWorker } from '../fixtures/mock-worker';

interface Fulfilled { status: number; body: string }

/** Route-Attrappe: nur was handle() und reply() lesen. `headers` hält allHeaders() an, bis der Test es freigibt. */
function fakeRoute(method: string, path: string, body: string | null, headers: Promise<void> = Promise.resolve()) {
  let result: Fulfilled | null = null;
  const request = {
    method: () => method,
    url: () => `${MOCK_API}${path}`,
    postDataJSON: () => (body === null ? null : JSON.parse(body)),
    postDataBuffer: () => (body === null ? null : Buffer.from(body)),
    allHeaders: async () => {
      await headers;
      return { 'x-api-key': E2E_API_KEY };
    },
  };
  const route = {
    request: () => request,
    fulfill: async (r: Fulfilled) => { result = r; },
    abort: async () => {},
  } as unknown as Route;
  return { route, result: () => result };
}

const handle = (worker: MockWorker, route: Route) =>
  (worker as unknown as { handle: (r: Route) => Promise<void> }).handle(route);

test('Ein CSV-Teil behält seinen Körper, wenn während des Wartens auf die Kopfzeilen eine GET-Anfrage läuft', { tag: '@BKT-05' }, async () => {
  const worker = new MockWorker();
  const base = `/api/market/${DEMO_ID}/imports`;
  const created = fakeRoute('POST', base, JSON.stringify({ symbol: 'XAUUSD', timeframe: 'M1', filename: 'xau.csv', size: 10 }));
  await handle(worker, created.route);
  const importId = JSON.parse(created.result()!.body).import_id as string;

  const text = 'time,open,high,low,close\n1790553600,1,2,0.5,1.5\n1790553660,1,2,0.5,1.5\n';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const chunk = fakeRoute('PUT', `${base}/${importId}/chunk`, text, gate);
  const chunkDone = handle(worker, chunk.route);
  // Die GET-Anfrage läuft ganz durch, während der Teil noch auf seine Kopfzeilen wartet
  await handle(worker, fakeRoute('GET', base, null).route);
  release();
  await chunkDone;

  expect(worker.state.csvImports[0].received_bytes).toBe(Buffer.byteLength(text));
  const commit = fakeRoute('POST', `${base}/${importId}/commit`, JSON.stringify({ extend: false }));
  await handle(worker, commit.route);
  expect(commit.result()?.status).toBe(200);
  expect(worker.state.csvImports[0]).toMatchObject({ status: 'committed', bars: 2 });
});
