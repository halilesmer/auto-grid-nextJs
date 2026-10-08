/**
 * Ein Backtest-Auftrag vom Laden der Kerzen bis zum Ergebnis, ohne Web-Worker-API (backtest.worker.ts ruft ihn nur
 * auf). Fehler gehen als Nachricht `error` an die Seite, nie verschluckt: Abbruchgründe der Läufe (`RunError`) mit
 * Code, alles andere als `run.unexpected` mit der Meldung.
 */
import { snapshotSymbol } from '@/lib/backtest/broker/costs';
import { loadRates, type FetchJson } from '@/lib/backtest/candles/loadRates';
import type { PathMode } from '@/lib/backtest/candles/pathModel';
import type { RunRequest, WorkerMessage } from '@/lib/backtest/protocol';
import { RunError } from '@/lib/backtest/runContext';
import { runBacktest, warmupSeconds } from '@/lib/backtest/runner';

/** Anteil des Fortschritts, der auf das Laden entfällt; der Rest ist der Lauf */
const LOAD_SHARE = 0.3;

export async function runJob(request: RunRequest, post: (message: WorkerMessage) => void, fetchJson: FetchJson): Promise<void> {
  const { runId, params } = request;
  try {
    const snapshot = snapshotSymbol(params.symbol, { swapEnabled: params.swapEnabled, approximate: params.approximate });
    if ('problems' in snapshot) {
      post({ type: 'error', runId, code: snapshot.problems[0].code, params: snapshot.problems[0].params, problems: snapshot.problems });
      return;
    }
    const rates = await loadRates({
      fetchJson,
      accountId: params.accountId,
      symbol: params.symbol.name,
      timeframe: params.dataTimeframe,
      from: params.from - warmupSeconds(params.zone, params.dataTimeframe),
      to: params.to,
      source: params.source,
      onProgress: (fraction) => post({ type: 'progress', runId, phase: 'load', fraction: fraction * LOAD_SHARE }),
    });
    const paths: PathMode[] = params.path === 'both' ? ['lowFirst', 'highFirst'] : [params.path];
    const results = paths.map((path, index) =>
      runBacktest({
        zone: params.zone,
        snapshot: snapshot.snapshot,
        rates,
        dataTimeframe: params.dataTimeframe,
        from: params.from,
        to: params.to,
        spread: params.spread,
        commissionPerLot: params.commissionPerLot,
        model: { ...params.model, path },
        startCapital: params.startCapital,
        accountCurrency: params.accountCurrency,
        zoneLabel: params.zoneLabel,
        notes: snapshot.warnings,
        onProgress: (fraction) =>
          post({ type: 'progress', runId, phase: 'run', fraction: LOAD_SHARE + ((index + fraction) / paths.length) * (1 - LOAD_SHARE) }),
      }),
    );
    post({ type: 'result', runId, results });
  } catch (error) {
    if (error instanceof RunError) post({ type: 'error', runId, code: error.code, params: error.params });
    else {
      console.error(error); // der Stack bleibt in der Konsole des Workers; die Seite bekommt die Meldung
      post({ type: 'error', runId, code: 'run.unexpected', message: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** Wartezeit je Anfrage: hängt der Tunnel, bricht der Lauf mit `run.network` ab statt stehen zu bleiben */
export const FETCH_TIMEOUT_MS = 120_000;

/**
 * HTTP-Abruf für den Web Worker: JSON der Antwort. Antwort mit Fehlerstatus: `run.http`; kein Netz, Zeitüberschreitung
 * oder keine gültige JSON-Antwort: `run.network`. Die Kopfzeilen (X-API-Key, ngrok) baut die Seite mit getWorkerHeaders().
 */
export function httpFetchJson(apiBase: string, headers: Record<string, string>): FetchJson {
  return async (path) => {
    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
      throw new RunError('run.network', { path }, { cause: error });
    }
    if (!response.ok) throw new RunError('run.http', { status: response.status, path });
    try {
      return await response.json();
    } catch (error) {
      throw new RunError('run.network', { path }, { cause: error });
    }
  };
}
