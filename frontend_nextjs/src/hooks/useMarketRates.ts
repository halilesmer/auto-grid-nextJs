'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { getApiErrorMessage, isAbortError as isAbort } from '@/lib/apiError';
import {
  barsOf,
  MAX_CHART_BARS,
  mergeTail,
  ratesWindow,
  TIMEFRAME_SEC,
  type Bar,
  type MissingRange,
  type Timeframe,
} from '@/lib/analysis/candles';
import { fetchRates, type RatesResponse } from '@/services/marketApi';

/** Endstück nachladen bzw. nach einem Fehler neu versuchen (Plan 11.5); der Worker hält das Endstück 30 s im Cache */
const REFRESH_MS = 60_000;

export interface RatesRequest {
  accountId: string;
  symbol: string;
  timeframe: Timeframe;
  /** MT5-Sekunden, halb offen; from null = „alles“ (die letzten OPEN_RANGE_BARS Kerzen) */
  from: number | null;
  to: number;
}

export interface MarketRates {
  bars: Bar[];
  missing: MissingRange[];
  digits: number | null;
  point: number | null;
  /** Tatsächlich geladener Beginn (bei zu vielen Kerzen oder „alles“ später als gewünscht) */
  from: number;
  to: number;
  /** Ja: nur das Ende des Zeitraums ist geladen */
  clipped: boolean;
  /** Datenbank voll: Kerzen wurden geliefert, aber nicht gespeichert */
  dbFull: boolean;
  /** Zeit der laufenden MT5-Kerze, wenn sie die letzte geladene ist (sonst null: keine Live-Kerze) */
  liveFrom: number | null;
  /** Brokerzeit laut letzter Antwort (null: Worker kennt den Abstand nicht) */
  serverNow: number | null;
  loadedAt: number;
}

export interface MarketRatesState {
  data: MarketRates | null;
  loading: boolean;
  error: string | null;
}

function requestKey(r: RatesRequest | null): string | null {
  return r ? `${r.accountId}|${r.symbol}|${r.timeframe}|${r.from ?? ''}|${r.to}` : null;
}

function columns(page: RatesResponse, tfSec: number) {
  const { bars, invalid } = barsOf(page, tfSec);
  return { bars, missing: [...page.missing, ...invalid] };
}

async function loadAll(
  accountId: string,
  q: { symbol: string; timeframe: Timeframe; from: number; to: number },
  signal: AbortSignal,
) {
  const tfSec = TIMEFRAME_SEC[q.timeframe];
  const pages: RatesResponse[] = [];
  let from = q.from;
  // Der Worker liefert höchstens 50.000 Kerzen je Antwort, der Rest über next_from
  while (from < q.to) {
    const page = await fetchRates(accountId, { ...q, from }, signal);
    pages.push(page);
    const count = pages.reduce((n, p) => n + p.t.length, 0);
    if (page.next_from === null || page.next_from <= from || count >= MAX_CHART_BARS) break;
    from = page.next_from;
  }
  const parts = pages.map((p) => columns(p, tfSec));
  const last = pages[pages.length - 1];
  return {
    bars: parts.flatMap((p) => p.bars),
    missing: parts.flatMap((p) => p.missing),
    digits: last?.digits ?? null,
    point: last?.point ?? null,
    liveFrom: last?.live_from ?? null,
    dbFull: pages.some((p) => p.db_full),
    serverNow: last?.server_now ?? null,
  };
}

/**
 * Kerzen für den Chart-Tab aus GET /market/{id}/rates. Eine Antwort für eine andere Auswahl
 * (Konto, Symbol, Zeitrahmen, Zeitraum) wird verworfen. Reicht der Zeitraum bis jetzt, wird alle
 * 60 s das Endstück nachgeladen (die laufende Kerze zählt nie als vollständig); nach einem Fehler
 * wird im selben Takt neu geladen.
 */
export function useMarketRates(request: RatesRequest | null, nowSec: () => number): MarketRatesState {
  const key = requestKey(request);
  const [state, setState] = useState<MarketRatesState & { key: string | null }>({
    key: null,
    data: null,
    loading: false,
    error: null,
  });
  // Für den Zeitgeber: aktueller Stand und Uhr, ohne den Effekt neu zu starten
  const latest = useRef(state);
  const clock = useRef(nowSec);
  useEffect(() => {
    latest.current = state;
    clock.current = nowSec;
  });

  useEffect(() => {
    if (!request || !key) return;
    const controller = new AbortController();
    const tfSec = TIMEFRAME_SEC[request.timeframe];
    const win = ratesWindow(request.from, request.to, tfSec);
    const q = { symbol: request.symbol, timeframe: request.timeframe, from: win.from, to: win.to };
    let busy = false;

    // Bis zur ersten Antwort gilt der alte Stand als fremd (state.key ≠ key → loading, siehe unten)
    const load = () => {
      busy = true;
      loadAll(request.accountId, q, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setState({
            key,
            data: { ...res, from: win.from, to: win.to, clipped: win.clipped, loadedAt: Date.now() },
            loading: false,
            error: null,
          });
        })
        .catch(async (err) => {
          if (isAbort(err) || controller.signal.aborted) return;
          const error = await getApiErrorMessage(err, t('analysis.chart.loadFailed'));
          if (!controller.signal.aborted) setState({ key, data: null, loading: false, error });
        })
        .finally(() => {
          busy = false;
        });
    };

    const refreshTail = (cur: MarketRates) => {
      const from = cur.bars[cur.bars.length - 1].time;
      busy = true;
      fetchRates(request.accountId, { ...q, from }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          // Ohne Kerzen (Konto beschäftigt, MT5-Fehler) bleibt der bisherige Stand: nie eine echte Kerze verwerfen
          if (page.t.length === 0) return;
          setState((s) => {
            if (s.key !== key || !s.data) return s;
            const merged = mergeTail(s.data, columns(page, tfSec), from);
            return {
              ...s,
              data: {
                ...s.data,
                ...merged,
                liveFrom: page.live_from,
                serverNow: page.server_now ?? s.data.serverNow,
                loadedAt: Date.now(),
              },
            };
          });
        })
        .catch(() => {
          // Endstück beim nächsten Mal; der Rest des Charts bleibt
        })
        .finally(() => {
          busy = false;
        });
    };

    load();
    const timer = setInterval(() => {
      const cur = latest.current;
      if (busy || cur.key !== key) return;
      if (!cur.data) {
        if (cur.error) load();
        return;
      }
      // Nur, wenn der Zeitraum bis jetzt reicht
      if (win.to > clock.current() - tfSec && cur.data.bars.length > 0) refreshTail(cur.data);
    }, REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
    // request steckt vollständig im key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state.key !== key) return { data: null, loading: Boolean(key), error: null };
  return { data: state.data, loading: state.loading, error: state.error };
}
