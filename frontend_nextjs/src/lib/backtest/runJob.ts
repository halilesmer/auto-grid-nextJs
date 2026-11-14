/**
 * Ein Backtest-Auftrag vom Laden der Kerzen bis zum Ergebnis, ohne Web-Worker-API (backtest.worker.ts ruft ihn nur
 * auf). Fehler gehen als Nachricht `error` an die Seite, nie verschluckt: Abbruchgründe der Läufe (`RunError`) mit
 * Code, alles andere als `run.unexpected` mit der Meldung.
 */
import { buildRateSeries, MAX_RATE_AGE_SEC, type RateSeries } from '@/lib/backtest/broker/conversion';
import { snapshotSymbol } from '@/lib/backtest/broker/costs';
import { limitHoleNotes, unexplainedHoles } from '@/lib/backtest/candles/dataHoles';
import { loadReplayMinutes } from '@/lib/backtest/candles/loadReplay';
import { loadRates, type FetchJson, type LoadedRates } from '@/lib/backtest/candles/loadRates';
import type { PathMode } from '@/lib/backtest/candles/pathModel';
import type { RunRequest, WorkerMessage } from '@/lib/backtest/protocol';
import { RunError } from '@/lib/backtest/runContext';
import { buildStartState, type LiveOrder, type StartState } from '@/lib/backtest/startState';
import { TF_SECONDS } from '@/lib/backtest/engine/types';
import { BOT_TURNS_MAX_PASSES, botTurnsActive } from '@/lib/backtest/botTurns';
import { runBacktest, triggerReplayOn, warmupSeconds, type RunResult } from '@/lib/backtest/runner';

/** Anteil des Fortschritts, der auf das Laden entfällt; der Rest ist der Lauf */
const LOAD_SHARE = 0.3;

/** BKT-23: Grenzen des Trigger-Replays je Lauf: Durchgänge, abgerufene Minuten und Ticks (Plan 1109-K57, Risiken) */
export interface TriggerReplayLimits {
  passes: number;
  minutes: number;
  ticks: number;
}
export const TRIGGER_REPLAY_LIMITS: TriggerReplayLimits = { passes: 4, minutes: 5000, ticks: 1_000_000 };

/** Zeile ins fertige Protokoll eines Laufs hängen (der Lauf selbst kennt die Durchgänge nicht) */
function addLog(result: RunResult, level: 'INFO' | 'WARN', code: string, params: Record<string, unknown>): void {
  result.log.counts[code] = (result.log.counts[code] ?? 0) + 1;
  result.log.lines.push({ level, code, params });
}

export async function runJob(
  request: RunRequest,
  post: (message: WorkerMessage) => void,
  fetchJson: FetchJson,
  onRates?: (rates: Awaited<ReturnType<typeof loadRates>>) => void,
  limits: TriggerReplayLimits = TRIGGER_REPLAY_LIMITS,
): Promise<void> {
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
      tickSpread: params.spread.mode === 'tick' && params.dataTimeframe === 'M1' && !params.source,
      tickReplay: params.spread.mode === 'tick' && params.dataTimeframe === 'M1' && !params.source && params.model.tickReplay !== false,
      onProgress: (fraction) => post({ type: 'progress', runId, phase: 'load', fraction: fraction * LOAD_SHARE }),
    });
    onRates?.(rates);
    // BKT-28: M1-Kerzen des Umrechnungspaars (immer vom MT5-Server, auch bei CSV-Quelle); Fehler = Schnappschuss + WARN
    const convNotes: { code: string; params?: Record<string, unknown> }[] = [];
    let rateSeries: RateSeries | null = null;
    let rateLoadMs = 0;
    const conversion = params.conversion;
    const wantConversion = params.model.conversionRate !== 'snapshot' && conversion !== undefined;
    if (wantConversion && conversion === null) {
      convNotes.push({ code: 'run.convRateUnavailable', params: { pair: '' } });
    } else if (wantConversion && conversion && conversion.kind === 'pair') {
      const started = Date.now();
      try {
        const pairRates = await loadRates({
          fetchJson,
          accountId: params.accountId,
          symbol: conversion.name,
          timeframe: 'M1',
          from: params.from - MAX_RATE_AGE_SEC,
          to: params.to,
        });
        rateSeries = buildRateSeries(pairRates);
      } catch {
        rateSeries = null; // Paar nicht ladbar: der Lauf rechnet mit dem Schnappschuss
      }
      rateLoadMs = Date.now() - started;
      if (!rateSeries) convNotes.push({ code: 'run.convRateUnavailable', params: { pair: conversion.name } });
    }
    // BKT-27: Strecken ohne Kerzen mitten in der Handelszeit, die der Worker nicht als `missing` meldet
    const holeNotes = limitHoleNotes(
      unexplainedHoles(rates.t, TF_SECONDS[params.dataTimeframe], params.from, Math.min(params.to, rates.liveFrom ?? params.to), snapshot.snapshot.tradeSessions, rates.missing, params.symbol.name),
    );
    // BKT-25: Live-Startzustand einmal bauen; alle Durchgänge und beide Wege starten mit denselben Tickets
    let start: StartState | null = null;
    if (params.startState) {
      let orders: LiveOrder[] | null = null;
      try {
        const answer = (await fetchJson(`/history/${encodeURIComponent(params.accountId)}/orders?from=${params.from}&to=${params.from + 1}`)) as { orders?: LiveOrder[]; missing?: unknown[] };
        orders = Array.isArray(answer?.orders) && !(answer.missing?.length) ? answer.orders : null;
      } catch {
        orders = null; // alter Worker, Fehlerstatus, Netz: der Lauf startet ohne Orders (WARN im Protokoll)
      }
      start = buildStartState(params.startState.deals, Number(params.zone.magic), params.zone, params.from, params.symbol.digits, orders);
    }
    const paths: PathMode[] = params.path === 'both' ? ['lowFirst', 'highFirst'] : [params.path];
    const wantTrigger = triggerReplayOn(params.model) && rates.replay !== undefined && rates.point !== null && rates.digits !== null;
    const results: RunResult[] = [];
    for (const [index, path] of paths.entries()) {
      const slice = (fraction: number) => LOAD_SHARE + ((index + fraction) / paths.length) * (1 - LOAD_SHARE);
      // Jeder Weg bekommt eine eigene Replay-Karte: sein Ergebnis hängt nur von seinen eigenen Trade-Minuten ab
      const own: LoadedRates = wantTrigger ? { ...rates, replay: new Map(rates.replay) } : rates;
      const requested = new Set<number>();
      let fetchedMinutes = 0;
      let fetchedTicks = 0;
      let unavailable = false;
      const dropped = new Set<number>();
      // BKT-30 (XSEND): mit Tur-Raster gehören die Minuten, in denen der Bot eine Order sendete, zu den Replay-Minuten und
      // bleiben in den späteren Durchgängen; die Durchgangsgrenze ist dann BOT_TURNS_MAX_PASSES
      const xsend = botTurnsActive(params.model.botTurns);
      const maxPasses = xsend ? BOT_TURNS_MAX_PASSES : limits.passes;
      const sendSeen = new Set<number>();
      let passes = 0;
      let result: RunResult;
      for (;;) {
        passes += 1;
        const passIndex = passes;
        result = runBacktest({
          zone: params.zone,
          snapshot: snapshot.snapshot,
          rates: own,
          dataTimeframe: params.dataTimeframe,
          from: params.from,
          to: params.to,
          spread: params.spread,
          commissionPerLot: params.commissionPerLot,
          model: { ...params.model, path },
          startCapital: params.startCapital,
          accountCurrency: params.accountCurrency,
          conversion: wantConversion && conversion ? { pair: conversion, series: rateSeries } : null,
          zoneLabel: params.zoneLabel,
          notes: [...snapshot.warnings, ...(params.notes ?? []), ...convNotes, ...holeNotes, ...(start?.notes ?? [])],
          ...(start ? { initialPositions: start.positions, initialOrders: start.orders, initialFractalDone: start.fractalDone } : {}),
          onProgress: (fraction) => post({ type: 'progress', runId, phase: 'run', fraction: slice(((passIndex - 1) + fraction) / (wantTrigger ? maxPasses : 1)) }),
        });
        if (!wantTrigger || unavailable || passes >= maxPasses) break;
        for (const minute of result.sendMinutes ?? []) sendSeen.add(minute);
        const wanted = xsend ? [...new Set([...(result.triggerMinutes ?? []), ...sendSeen])].sort((a, b) => a - b) : (result.triggerMinutes ?? []);
        const todo = wanted.filter((minute) => !requested.has(minute) && !dropped.has(minute));
        if (todo.length === 0) break;
        // Bündelgrenze: früheste Minuten zuerst; was darüber liegt, bleibt im Kerzenweg
        const room = Math.max(0, limits.minutes - requested.size);
        const take = todo.slice(0, room);
        for (const minute of todo.slice(room)) dropped.add(minute);
        if (take.length === 0) break;
        for (const minute of take) requested.add(minute);
        const loaded = await loadReplayMinutes({
          fetchJson,
          accountId: params.accountId,
          symbol: params.symbol.name,
          minutes: take,
          point: rates.point as number,
          digits: rates.digits as number,
          stop: (ticks) => fetchedTicks + ticks >= limits.ticks,
        });
        // Ein halber Abruf wird verworfen: das Ergebnis bleibt das des letzten vollständigen Durchgangs
        if (loaded.unavailable) {
          unavailable = true;
          break;
        }
        for (const [minute, data] of loaded.minutes) own.replay?.set(minute, data);
        for (const minute of loaded.skipped) dropped.add(minute);
        fetchedMinutes += loaded.minutes.size;
        fetchedTicks += [...loaded.minutes.values()].reduce((sum, m) => sum + m.ms.length, 0);
        if (loaded.minutes.size === 0) break;
      }
      if (rateSeries && conversion) addLog(result, 'INFO', 'run.convRateLoaded', { pair: conversion.name, candles: rateSeries.t.length, ms: rateLoadMs });
      if (wantTrigger) {
        if (unavailable) addLog(result, 'WARN', 'run.triggerReplayUnavailable', {});
        if (fetchedMinutes > 0) addLog(result, 'INFO', 'run.triggerReplay', { passes, minutes: fetchedMinutes, ticks: fetchedTicks });
        // Ein- und Ausstiegsminuten, die am Ende noch im Kerzenweg liegen (Grenze, Worker beschäftigt, Durchgangsgrenze); Minuten ohne Tick zählen nicht
        const left = unavailable ? 0 : (result.triggerMinutes ?? []).filter((minute) => !requested.has(minute) || dropped.has(minute)).length;
        if (left > 0) addLog(result, 'WARN', 'run.triggerReplayBudget', { minutes: fetchedMinutes, dropped: left });
      }
      delete result.triggerMinutes;
      delete result.sendMinutes;
      post({ type: 'progress', runId, phase: 'run', fraction: slice(1) });
      results.push(result);
    }
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
