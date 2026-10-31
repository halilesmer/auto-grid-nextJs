'use client';

import { useEffect, useMemo, useState } from 'react';
import { isAbortError } from '@/lib/apiError';
import { fetchQuotes, type Quote } from '@/services/marketApi';

/** Wie das Kerzen-Nachladen (useMarketRates): Preise sind nicht tick-genau */
const QUOTES_MS = 60_000;

/**
 * Preise der Favoriten (GET /market/{id}/quotes) im 60-s-Takt. Wer den Hook einhängt, fragt; die Seitenleiste hängt ihn nur offen ein.
 * `failed`: der letzte Abruf für dieses Konto schlug fehl, die Zahlen sind dann älter.
 */
export function useFavoriteQuotes(accountId: string | null, symbols: readonly string[]) {
  const key = symbols.join('|');
  const list = useMemo(() => (key ? key.split('|') : []), [key]);
  const [state, setState] = useState<{ accountId: string; quotes: Record<string, Quote | null>; failedAccount: string | null }>({ accountId: '', quotes: {}, failedAccount: null });

  useEffect(() => {
    if (!accountId || list.length === 0) return;
    const controller = new AbortController();
    const load = () =>
      fetchQuotes(accountId, list, controller.signal)
        .then((quotes) => setState({ accountId, quotes, failedAccount: null }))
        .catch((err) => {
          if (isAbortError(err) || controller.signal.aborted) return;
          // Alte Zahlen bleiben stehen; der Hinweis sagt, dass sie nicht aktuell sind
          setState((s) => ({ ...s, failedAccount: accountId }));
        });
    void load();
    const timer = setInterval(() => void load(), QUOTES_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [accountId, key, list]);

  // Preise eines anderen Kontos werden nie gezeigt
  return { quotes: state.accountId === accountId ? state.quotes : {}, failed: accountId !== null && state.failedAccount === accountId };
}
