'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { getApiErrorMessage, isAbortError } from '@/lib/apiError';
import { fetchDeals, type DealsResponse } from '@/services/historyApi';

/**
 * Reicht der Zeitraum bis jetzt, kommen neue Deals so oft nach (jeder Abruf gleicht den jüngsten Rand mit MT5
 * ab); nach einem Fehler wird im selben Takt neu versucht.
 */
const REFRESH_MS = 120_000;

export interface DealsRequest {
  accountId: string;
  /** MT5-Sekunden, halb offen */
  from: number;
  to: number;
}

export interface DealsHistoryState {
  data: DealsResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Deal-Archiv des Kontos für den Zeitraum (GET /history/{id}/deals). Eine Antwort für eine andere Auswahl
 * (Konto, Zeitraum) wird verworfen. `live`: der Zeitraum reicht bis jetzt → alle 2 min neu laden; nach
 * einem Fehler ebenso.
 */
export function useDealsHistory(request: DealsRequest | null, live: boolean): DealsHistoryState {
  const key = request ? `${request.accountId}|${request.from}|${request.to}` : null;
  const [state, setState] = useState<DealsHistoryState & { key: string | null }>({
    key: null,
    data: null,
    loading: false,
    error: null,
  });
  const liveRef = useRef(live);
  const stateRef = useRef(state);
  useEffect(() => {
    liveRef.current = live;
    stateRef.current = state;
  });

  useEffect(() => {
    if (!request || !key) return;
    const controller = new AbortController();
    let busy = false;
    const load = () => {
      busy = true;
      fetchDeals(request.accountId, { from: request.from, to: request.to }, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setState({ key, data, loading: false, error: null });
        })
        .catch(async (err) => {
          if (isAbortError(err) || controller.signal.aborted) return;
          const error = await getApiErrorMessage(err, t('analysis.trades.loadFailed'));
          // Ein gescheitertes Nachladen lässt den bisherigen Stand stehen
          if (!controller.signal.aborted) {
            setState((s) => (s.key === key && s.data ? { ...s, error } : { key, data: null, loading: false, error }));
          }
        })
        .finally(() => {
          busy = false;
        });
    };
    load();
    const timer = setInterval(() => {
      if (!busy && (liveRef.current || (stateRef.current.key === key && stateRef.current.error))) load();
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
